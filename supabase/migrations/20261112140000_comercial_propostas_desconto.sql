-- =============================================================================
-- Comercial — desconto nas propostas e aprovação do gestor
-- -----------------------------------------------------------------------------
-- Ao montar o fluxo, o operador pode dar desconto sobre o valor de tabela. Até o
-- limite do empreendimento (padrão 1,5%) a proposta segue normal; acima dele
-- ela nasce "pendente" e só avança de etapa depois que um gestor (perfil master
-- ou administrador) aprovar. Proposta lançada pelo próprio gestor já nasce
-- aprovada.
--
-- O limite é definido na aba Comercial > Metas, que passa a ser só do master:
--   * comercial_metas_config.desconto_limite_padrao  vale para todos;
--   * comercial_descontos_limite                     sobrescreve por empreendimento.
--
-- Quem calcula o desconto é o BANCO (trigger), não a tela: a soma das parcelas
-- da ficha contra o valor da unidade na Tabela de Vendas. Assim mexer no "valor
-- de tabela" da ficha ou mandar a coluna pela API não dribla a aprovação.
-- =============================================================================

-- ── 1. Limites ──────────────────────────────────────────────────────────────

alter table public.comercial_metas_config
  add column if not exists desconto_limite_padrao numeric not null default 1.5
    check (desconto_limite_padrao >= 0 and desconto_limite_padrao <= 100);

create table if not exists public.comercial_descontos_limite (
  project_id text primary key references public.projects(id) on delete cascade,
  limite_pct numeric not null check (limite_pct >= 0 and limite_pct <= 100),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.comercial_descontos_limite enable row level security;
revoke all on public.comercial_descontos_limite from anon;

-- Leitura: quem lança proposta precisa saber o limite. Escrita: só master (abaixo).
drop policy if exists "auth_select_comercial_descontos_limite" on public.comercial_descontos_limite;
create policy "auth_select_comercial_descontos_limite" on public.comercial_descontos_limite
  for select to authenticated
  using ((select public.pode_algum(array['comercial_movimentos','comercial_propostas','comercial_tabela','comercial_dashboard'], 'ver')));

drop policy if exists "auth_write_comercial_descontos_limite" on public.comercial_descontos_limite;
create policy "auth_write_comercial_descontos_limite" on public.comercial_descontos_limite
  for all to authenticated
  using ((select public.is_permission_level_1()))
  with check ((select public.is_permission_level_1()));

drop trigger if exists comercial_descontos_limite_touch on public.comercial_descontos_limite;
create trigger comercial_descontos_limite_touch
  before update on public.comercial_descontos_limite
  for each row execute function public.comercial_metas_touch();

drop trigger if exists broadcast_comercial_descontos_limite_changes on public.comercial_descontos_limite;
create trigger broadcast_comercial_descontos_limite_changes
  after insert or update or delete on public.comercial_descontos_limite
  for each row execute function public.broadcast_row_change('sienge-changes');

create or replace function public.comercial_limite_desconto(p_project_id text)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select limite_pct from public.comercial_descontos_limite where project_id = p_project_id),
    (select desconto_limite_padrao from public.comercial_metas_config where id = 'default'),
    1.5
  );
$$;

revoke execute on function public.comercial_limite_desconto(text) from public, anon;
grant execute on function public.comercial_limite_desconto(text) to authenticated;

-- ── 2. Aba Metas: escrita só do master ──────────────────────────────────────
-- Restritivas: somam-se (AND) às de módulo. A leitura continua aberta a quem já
-- lia, porque o painel Desempenho e o Dashboard Analítico usam as metas.

do $$
declare
  t text;
begin
  foreach t in array array['comercial_metas', 'comercial_metas_empreendimentos', 'comercial_metas_config'] loop
    execute format('drop policy if exists master_inserir on public.%I', t);
    execute format('drop policy if exists master_alterar on public.%I', t);
    execute format('drop policy if exists master_apagar on public.%I', t);
    execute format(
      'create policy master_inserir on public.%I as restrictive for insert to authenticated with check ((select public.is_permission_level_1()))', t);
    execute format(
      'create policy master_alterar on public.%I as restrictive for update to authenticated using ((select public.is_permission_level_1())) with check ((select public.is_permission_level_1()))', t);
    execute format(
      'create policy master_apagar on public.%I as restrictive for delete to authenticated using ((select public.is_permission_level_1()))', t);
  end loop;
end;
$$;

-- ── 3. Desconto e aprovação na proposta ────────────────────────────────────

alter table public.comercial_propostas
  add column if not exists desconto_pct numeric,
  add column if not exists desconto_limite_pct numeric,
  add column if not exists aprovacao text not null default 'dispensada',
  add column if not exists aprovacao_por uuid references auth.users(id) on delete set null,
  add column if not exists aprovacao_por_nome text,
  add column if not exists aprovacao_em timestamptz,
  add column if not exists aprovacao_obs text;

alter table public.comercial_propostas drop constraint if exists comercial_propostas_aprovacao_check;
alter table public.comercial_propostas
  add constraint comercial_propostas_aprovacao_check
  check (aprovacao in ('dispensada', 'pendente', 'aprovada', 'recusada'));

create index if not exists comercial_propostas_aprovacao_idx
  on public.comercial_propostas (aprovacao) where aprovacao = 'pendente';

create or replace function public.comercial_propostas_desconto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Sem usuário (service_role, cron) conta como gestor.
  v_gestor     boolean := auth.uid() is null or public.is_permission_level_1();
  v_nome       text;
  v_contratado numeric;
  v_ref        numeric;
  v_desc       numeric;
  v_lim        numeric;
begin
  select coalesce(nullif(btrim(name), ''), email) into v_nome from public.users_profile where id = auth.uid();

  if tg_op = 'INSERT'
     or new.autorizacao is distinct from old.autorizacao
     or new.unidade_id is distinct from old.unidade_id
     or new.project_id is distinct from old.project_id then
    -- Recalcula do zero: o que o cliente mandou nestas colunas é ignorado.
    new.aprovacao_por := null;
    new.aprovacao_por_nome := null;
    new.aprovacao_em := null;
    new.aprovacao_obs := null;

    if new.autorizacao is null then
      new.desconto_pct := null;
      new.desconto_limite_pct := null;
      new.aprovacao := 'dispensada';
    else
      select coalesce(sum(round(coalesce((p ->> 'quantidade')::numeric, 0) * coalesce((p ->> 'valorUnitario')::numeric, 0), 2)), 0)
        into v_contratado
        from jsonb_array_elements(coalesce(new.autorizacao -> 'parcelas', '[]'::jsonb)) as p;

      -- Referência: o valor da unidade na Tabela de Vendas; sem unidade, o da ficha.
      select nullif(valor_tabela, 0) into v_ref from public.sienge_tabela_vendas where id = new.unidade_id;
      v_ref := coalesce(v_ref, nullif((new.autorizacao ->> 'valorTabela')::numeric, 0));

      v_desc := case when v_ref > 0 then greatest(0, round((1 - v_contratado / v_ref) * 100, 4)) else 0 end;
      v_lim := public.comercial_limite_desconto(new.project_id);
      new.desconto_pct := v_desc;
      new.desconto_limite_pct := v_lim;

      -- Folga de 0,0001 p.p. para o arredondamento dos centavos.
      if v_desc <= v_lim + 0.0001 then
        new.aprovacao := 'dispensada';
      elsif v_gestor then
        new.aprovacao := 'aprovada';
        new.aprovacao_por := auth.uid();
        new.aprovacao_por_nome := v_nome;
        new.aprovacao_em := now();
        new.aprovacao_obs := 'Lançada por gestor';
      else
        new.aprovacao := 'pendente';
      end if;
    end if;

  elsif new.aprovacao is distinct from old.aprovacao then
    if not v_gestor then
      raise exception 'Só o gestor (perfil master) aprova ou recusa desconto acima do limite.' using errcode = '42501';
    end if;
    if old.aprovacao = 'dispensada' or new.aprovacao = 'dispensada' then
      raise exception 'Esta proposta está dentro do limite de desconto e não passa por aprovação.' using errcode = '22023';
    end if;
    new.aprovacao_por := case when new.aprovacao = 'pendente' then null else auth.uid() end;
    new.aprovacao_por_nome := case when new.aprovacao = 'pendente' then null else v_nome end;
    new.aprovacao_em := case when new.aprovacao = 'pendente' then null else now() end;
    new.aprovacao_obs := nullif(btrim(coalesce(new.aprovacao_obs, '')), '');
    new.desconto_pct := old.desconto_pct;
    new.desconto_limite_pct := old.desconto_limite_pct;

  else
    -- Nada de aprovação mudou: estas colunas não são editáveis pelo cliente.
    new.desconto_pct := old.desconto_pct;
    new.desconto_limite_pct := old.desconto_limite_pct;
    new.aprovacao_por := old.aprovacao_por;
    new.aprovacao_por_nome := old.aprovacao_por_nome;
    new.aprovacao_em := old.aprovacao_em;
    new.aprovacao_obs := old.aprovacao_obs;
  end if;

  -- Sem aprovação, a proposta não passa de "Propostas realizadas".
  if new.aprovacao in ('pendente', 'recusada')
     and new.etapa not in ('visita', 'realizada')
     and (tg_op = 'INSERT' or new.etapa is distinct from old.etapa or new.aprovacao is distinct from old.aprovacao) then
    raise exception 'Desconto de % acima do limite de %: a proposta só avança depois da aprovação do gestor.',
      replace(to_char(new.desconto_pct, 'FM990.00'), '.', ',') || '%',
      replace(to_char(new.desconto_limite_pct, 'FM990.00'), '.', ',') || '%'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists comercial_propostas_desconto on public.comercial_propostas;
create trigger comercial_propostas_desconto
  before insert or update on public.comercial_propostas
  for each row execute function public.comercial_propostas_desconto();

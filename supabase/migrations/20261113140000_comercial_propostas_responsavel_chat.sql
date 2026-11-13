-- =============================================================================
-- Comercial — propostas: responsável e conversa
-- -----------------------------------------------------------------------------
-- 1. responsavel_id: quem conduz a proposta. Nasce com quem cadastrou e pode
--    ser trocado no painel por quem tem permissão de editar propostas.
-- 2. comercial_propostas_mensagens: o chat dentro da proposta. Quem enxerga
--    Propostas pode conversar (o chat não altera a proposta); cada um apaga só
--    as próprias mensagens. Nome do autor gravado na hora, para a conversa
--    continuar legível mesmo se o usuário sair do sistema.
-- =============================================================================

-- ── 1. Responsável ──────────────────────────────────────────────────────────

alter table public.comercial_propostas
  add column if not exists responsavel_id uuid references auth.users(id) on delete set null;

alter table public.comercial_propostas
  alter column responsavel_id set default auth.uid();

-- Existentes: quem cadastrou.
update public.comercial_propostas
   set responsavel_id = created_by
 where responsavel_id is null and created_by is not null;

create index if not exists comercial_propostas_responsavel_idx
  on public.comercial_propostas (responsavel_id);

-- ── 2. Conversa ─────────────────────────────────────────────────────────────

create table if not exists public.comercial_propostas_mensagens (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.comercial_propostas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null default auth.uid(),
  autor_nome text,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists comercial_propostas_mensagens_proposta_idx
  on public.comercial_propostas_mensagens (proposta_id, created_at);

alter table public.comercial_propostas_mensagens enable row level security;
revoke all on public.comercial_propostas_mensagens from anon;
grant select, insert, delete on public.comercial_propostas_mensagens to authenticated;

-- Autor e nome vêm do banco: o cliente não fala em nome de outro usuário.
create or replace function public.comercial_propostas_mensagens_autor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.autor_id := auth.uid();
  new.created_at := now();
  select coalesce(nullif(btrim(name), ''), email) into new.autor_nome
    from public.users_profile where id = auth.uid();
  return new;
end;
$$;

drop trigger if exists comercial_propostas_mensagens_autor on public.comercial_propostas_mensagens;
create trigger comercial_propostas_mensagens_autor
  before insert on public.comercial_propostas_mensagens
  for each row execute function public.comercial_propostas_mensagens_autor();

drop policy if exists mensagens_ler on public.comercial_propostas_mensagens;
create policy mensagens_ler on public.comercial_propostas_mensagens
  for select to authenticated
  using ((select public.pode_algum(array['comercial_propostas','comercial_dashboard'], 'ver')));

drop policy if exists mensagens_inserir on public.comercial_propostas_mensagens;
create policy mensagens_inserir on public.comercial_propostas_mensagens
  for insert to authenticated
  with check ((select public.pode_algum(array['comercial_propostas'], 'ver')));

drop policy if exists mensagens_apagar on public.comercial_propostas_mensagens;
create policy mensagens_apagar on public.comercial_propostas_mensagens
  for delete to authenticated
  using (autor_id = (select auth.uid()));

drop trigger if exists broadcast_comercial_propostas_mensagens_changes on public.comercial_propostas_mensagens;
create trigger broadcast_comercial_propostas_mensagens_changes
  after insert or update or delete on public.comercial_propostas_mensagens
  for each row execute function public.broadcast_row_change('sienge-changes');

-- ── 3. Fluxo de decisão ─────────────────────────────────────────────────────
--
--   realizada        → [Enviar para aprovação]                 → em_analise
--   em_analise       → [Aprovar] [Contra proposta] [Recusar]   → venda | contra_proposta | perdido   (só gestor)
--   contra_proposta  → [Tréplica] [Recusar]                    → em_analise | perdido
--
-- Nova etapa "perdido" (Perdido/cancelado). O banco garante a regra do gestor
-- também no arrastar do kanban. Cada mudança de etapa e de responsável vira um
-- evento na conversa da proposta, que serve de histórico.

alter table public.comercial_propostas
  drop constraint if exists comercial_propostas_etapa_check;
alter table public.comercial_propostas
  add constraint comercial_propostas_etapa_check
  check (etapa in ('visita', 'realizada', 'em_analise', 'contra_proposta', 'analise_final', 'venda', 'perdido'));

alter table public.comercial_propostas_mensagens
  add column if not exists tipo text not null default 'mensagem';
alter table public.comercial_propostas_mensagens
  drop constraint if exists comercial_propostas_mensagens_tipo_check;
alter table public.comercial_propostas_mensagens
  add constraint comercial_propostas_mensagens_tipo_check check (tipo in ('mensagem', 'evento'));

-- Desconto pendente/recusado: além de visita e realizada, pode ir para perdido.
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
     and new.etapa not in ('visita', 'realizada', 'perdido')
     and (tg_op = 'INSERT' or new.etapa is distinct from old.etapa or new.aprovacao is distinct from old.aprovacao) then
    raise exception 'Desconto de % acima do limite de %: a proposta só avança depois da aprovação do gestor.',
      replace(to_char(new.desconto_pct, 'FM990.00'), '.', ',') || '%',
      replace(to_char(new.desconto_limite_pct, 'FM990.00'), '.', ',') || '%'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.comercial_propostas_decisao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gestor boolean := auth.uid() is null or public.is_permission_level_1();
begin
  if new.etapa is distinct from old.etapa and not v_gestor then
    if new.etapa = 'venda' then
      raise exception 'Só o gestor aprova a proposta e a leva para Venda.' using errcode = '42501';
    end if;
    if old.etapa = 'em_analise' and new.etapa in ('contra_proposta', 'perdido') then
      raise exception 'Proposta em análise: só o gestor aprova, faz contra proposta ou recusa.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comercial_propostas_decisao on public.comercial_propostas;
create trigger comercial_propostas_decisao
  before update on public.comercial_propostas
  for each row execute function public.comercial_propostas_decisao();

create or replace function public.comercial_etapa_label(p text)
returns text
language sql immutable
as $$
  select case p
    when 'visita' then 'Visitas'
    when 'realizada' then 'Propostas realizadas'
    when 'em_analise' then 'Propostas em análise'
    when 'contra_proposta' then 'Contra proposta'
    when 'analise_final' then 'Análise final'
    when 'venda' then 'Venda'
    when 'perdido' then 'Perdido/cancelado'
    else p end;
$$;

-- Eventos na conversa: o autor é quem fez a mudança (trigger de autor).
create or replace function public.comercial_propostas_eventos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text;
  v_resp text;
begin
  if new.etapa is distinct from old.etapa then
    v_texto := case
      when old.etapa = 'realizada'       and new.etapa = 'em_analise'      then 'enviou a proposta para aprovação'
      when old.etapa = 'em_analise'      and new.etapa = 'venda'           then 'aprovou a proposta'
      when old.etapa = 'em_analise'      and new.etapa = 'contra_proposta' then 'fez uma contra proposta'
      when old.etapa = 'contra_proposta' and new.etapa = 'em_analise'      then 'enviou uma tréplica para aprovação'
      when new.etapa = 'perdido'                                           then 'recusou a proposta'
      else format('moveu de %s para %s', public.comercial_etapa_label(old.etapa), public.comercial_etapa_label(new.etapa))
    end;
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo) values (new.id, v_texto, 'evento');
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    select coalesce(nullif(btrim(name), ''), email) into v_resp from public.users_profile where id = new.responsavel_id;
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo)
      values (new.id, case when v_resp is null then 'removeu o responsável' else format('definiu %s como responsável', v_resp) end, 'evento');
  end if;
  return null;
end;
$$;

drop trigger if exists comercial_propostas_eventos on public.comercial_propostas;
create trigger comercial_propostas_eventos
  after update on public.comercial_propostas
  for each row execute function public.comercial_propostas_eventos();

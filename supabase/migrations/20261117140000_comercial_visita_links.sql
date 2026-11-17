-- =============================================================================
-- Comercial — cadastro de visitas pelas recepcionistas (página pública)
-- -----------------------------------------------------------------------------
-- Página sem login em /visita/<token>, como a Tabela do Corretor: o anon não
-- ganha acesso às tabelas, só a duas funções que validam o token.
--
--   * um link por stand (o local já vem fixo: a recepcionista não escolhe);
--   * um link genérico, do supervisor, que pergunta o local a cada visita.
--
-- O token é o segredo: quem tem o link cadastra visitas. O Diretor gera um link
-- novo (o antigo para de funcionar) ou desativa um link nas configurações das
-- propostas.
--
-- A visita entra em comercial_propostas na etapa "visita", sem responsável;
-- visita_link_id guarda por qual link ela chegou.
-- =============================================================================

create table if not exists public.comercial_visita_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  nome text not null,
  -- Nulo = link genérico: o local é escolhido no formulário.
  local text,
  ativo boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comercial_visita_links enable row level security;
revoke all on public.comercial_visita_links from anon;

drop policy if exists "visita_links_select" on public.comercial_visita_links;
create policy "visita_links_select" on public.comercial_visita_links
  for select to authenticated using (public.is_permission_level_1());

drop policy if exists "visita_links_update" on public.comercial_visita_links;
create policy "visita_links_update" on public.comercial_visita_links
  for update to authenticated using (public.is_permission_level_1()) with check (public.is_permission_level_1());

-- Os quatro links nascem prontos.
insert into public.comercial_visita_links (nome, local, sort_order)
select v.nome, v.local, v.ordem
  from (values
    ('Supervisor (todos os locais)', null::text, 0),
    ('Casa Uchôa', 'Casa Uchôa', 1),
    ('Stand Gênova', 'Stand Gênova', 2),
    ('Escritório Central', 'Escritório Central', 3)
  ) as v(nome, local, ordem)
 where not exists (select 1 from public.comercial_visita_links);

alter table public.comercial_propostas
  add column if not exists visita_link_id uuid references public.comercial_visita_links(id) on delete set null;

create index if not exists comercial_propostas_visita_link_idx
  on public.comercial_propostas (visita_link_id, created_at);

-- Gera um token novo: o link antigo deixa de funcionar na hora.
create or replace function public.renovar_visita_link(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_permission_level_1() then
    raise exception 'Só o Diretor gera um novo link.' using errcode = '42501';
  end if;
  update public.comercial_visita_links set token = v_token, updated_at = now() where id = p_id;
  if not found then
    raise exception 'Link não encontrado.' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;

revoke all on function public.renovar_visita_link(uuid) from public, anon;
grant execute on function public.renovar_visita_link(uuid) to authenticated;

-- ── Leitura do formulário ────────────────────────────────────────────────────
-- Null quando o token não existe ou o link está desativado.

create or replace function public.get_form_visita(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link public.comercial_visita_links%rowtype;
begin
  select * into v_link from public.comercial_visita_links where token = p_token and ativo;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'nome',  v_link.nome,
    'local', v_link.local,
    'locais', jsonb_build_array('Casa Uchôa', 'Stand Gênova', 'Escritório Central'),
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    -- Mesmo recorte do formulário interno: versão principal com unidades, sem os ocultos.
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name) order by coalesce(d.sort_order, 999), p.name)
        from public.projects p
        left join public.sienge_project_display d on d.project_id = p.id
       where coalesce(d.hidden, false) = false
         and exists (
           select 1
             from public.sienge_tabela_vendas_versoes v
             join public.sienge_tabela_vendas u on u.versao_id = v.id
            where v.project_id = p.id and v.principal
         )
    ), '[]'::jsonb),
    'corretores', coalesce((
      select jsonb_agg(c order by c)
        from (
          select distinct btrim(corretor) as c from public.comercial_propostas where btrim(corretor) <> ''
          union
          select distinct btrim(corretor) from public.comercial_movimentos where btrim(coalesce(corretor, '')) <> ''
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Gravação ─────────────────────────────────────────────────────────────────

create or replace function public.registrar_visita_publica(p_token text, p_dados jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link      public.comercial_visita_links%rowtype;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_local     text;
  v_cliente   text := btrim(coalesce(p_dados ->> 'cliente', ''));
  v_data      date;
  v_hora      text := btrim(coalesce(p_dados ->> 'hora', ''));
  v_interesse text := p_dados ->> 'interesse';
  v_projeto   text := nullif(btrim(coalesce(p_dados ->> 'projectId', '')), '');
  v_idade     int;
  v_id        uuid;
  v_numero    bigint;
begin
  select * into v_link from public.comercial_visita_links where token = p_token and ativo;
  if not found then
    raise exception 'Link inválido ou desativado.' using errcode = '42501';
  end if;

  -- Freio contra envio em massa: 30 visitas por link a cada 10 minutos.
  if (select count(*) from public.comercial_propostas
       where visita_link_id = v_link.id and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitos cadastros seguidos. Aguarde alguns minutos.' using errcode = '54000';
  end if;

  v_local := coalesce(v_link.local, p_dados ->> 'local');
  if v_local is null or v_local not in ('Casa Uchôa', 'Stand Gênova', 'Escritório Central') then
    raise exception 'Escolha o local da visita.' using errcode = '22023';
  end if;

  if v_cliente = '' or length(v_cliente) > 200 then
    raise exception 'Informe o nome do cliente.' using errcode = '22023';
  end if;

  begin
    v_data := coalesce(nullif(p_dados ->> 'data', '')::date, v_hoje);
  exception when others then
    raise exception 'Data inválida.' using errcode = '22023';
  end;
  if v_data > v_hoje or v_data < v_hoje - 90 then
    raise exception 'A data da visita precisa estar entre os últimos 90 dias e hoje.' using errcode = '22023';
  end if;

  -- Sem hora informada: a do cadastro, se a visita é de hoje.
  if v_hora = '' and v_data = v_hoje then
    v_hora := to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI');
  end if;
  if v_hora <> '' and v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Hora inválida.' using errcode = '22023';
  end if;

  if v_interesse = 'geral' then
    v_projeto := null;
  elsif v_interesse = 'especifico' then
    if v_projeto is null or not exists (select 1 from public.projects where id = v_projeto) then
      raise exception 'Escolha o empreendimento de interesse.' using errcode = '22023';
    end if;
  else
    raise exception 'Informe o interesse do cliente.' using errcode = '22023';
  end if;

  if nullif(p_dados ->> 'idade', '') is not null then
    begin
      v_idade := (p_dados ->> 'idade')::int;
    exception when others then
      raise exception 'Idade inválida.' using errcode = '22023';
    end;
    if v_idade < 0 or v_idade > 120 then
      raise exception 'Idade inválida.' using errcode = '22023';
    end if;
  end if;

  insert into public.comercial_propostas (project_id, cliente, corretor, etapa, enviada_em, visita, visita_link_id, responsavel_id)
  values (
    v_projeto,
    v_cliente,
    left(btrim(coalesce(p_dados ->> 'corretor', '')), 200),
    'visita',
    v_data,
    jsonb_build_object(
      'local',       v_local,
      'hora',        v_hora,
      'interesse',   v_interesse,
      'profissao',   left(btrim(coalesce(p_dados ->> 'profissao', '')), 200),
      'ondeMora',    left(btrim(coalesce(p_dados ->> 'ondeMora', '')), 200),
      'idade',       v_idade,
      'estadoCivil', left(btrim(coalesce(p_dados ->> 'estadoCivil', '')), 60),
      'observacao',  left(btrim(coalesce(p_dados ->> 'observacao', '')), 4000)
    ),
    v_link.id,
    null
  )
  returning id, numero into v_id, v_numero;

  insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo)
  values (v_id, format('visita cadastrada pelo link "%s"', v_link.nome), 'evento');

  return v_numero;
end;
$$;

revoke all on function public.get_form_visita(text) from public;
revoke all on function public.registrar_visita_publica(text, jsonb) from public;
grant execute on function public.get_form_visita(text) to anon, authenticated;
grant execute on function public.registrar_visita_publica(text, jsonb) to anon, authenticated;

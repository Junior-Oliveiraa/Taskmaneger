-- =============================================================================
-- Perfis de acesso do Orbit
-- -----------------------------------------------------------------------------
-- Cinco perfis:
--   administrador  acesso total + ações críticas (só ele)
--   master         todas as ferramentas, sem as ações críticas
--   analista, assistente, financeiro
--                  o que o administrador liberar, módulo a módulo
--
-- O administrador distribui os acessos na tabela perfis_permissoes
-- (Configurações → Perfis e acessos). Cada módulo tem três níveis:
-- nenhum / ver / editar. O administrador não aparece na tabela: pode tudo.
--
-- A regra vale no BANCO, não só na tela: cada tabela ganha políticas
-- RESTRICTIVE (somam-se às que já existem com AND) que exigem o módulo, e as
-- RPCs SECURITY DEFINER — que passam por cima do RLS — checam por dentro.
--
-- De carona, fecha três falhas achadas na auditoria:
--   * qualquer usuário podia se promover a admin editando o próprio
--     preferences.permissionLevel;
--   * o bucket de anexos podia ser listado sem login;
--   * o realtime transmitia as linhas inteiras de financeiro/CRM/comercial
--     para todo usuário logado (o roteamento por tópico tinha se perdido).
-- =============================================================================

-- ── 1. Perfil do usuário ─────────────────────────────────────────────────────

alter table public.users_profile add column if not exists perfil text;

-- Migração dos usuários atuais: quem já era nível 1 vira master (mantém o
-- acesso que tinha); os demais começam como assistente. O administrador
-- redistribui depois pela tela.
update public.users_profile
   set perfil = case
     when lower(email) = 'cidnei@uchoaempreendimentos.com.br' then 'administrador'
     when lower(email) = 'wellingtonoliveira@uchoaempreendimentos.com.br' then 'financeiro'
     when preferences ->> 'permissionLevel' = '1'              then 'master'
     -- Aprovadora da alçada 2: o perfil analista libera o Finanças (ver matriz).
     when lower(email) = 'kariny@uchoaempreendimentos.com.br'  then 'analista'
     else 'assistente'
   end
 where perfil is null;

alter table public.users_profile
  alter column perfil set default 'assistente',
  alter column perfil set not null;

alter table public.users_profile drop constraint if exists users_profile_perfil_check;
alter table public.users_profile
  add constraint users_profile_perfil_check
  check (perfil in ('administrador', 'master', 'analista', 'assistente', 'financeiro'));

-- ── 2. Matriz de permissões ──────────────────────────────────────────────────

create table if not exists public.perfis_permissoes (
  perfil      text not null check (perfil in ('master', 'analista', 'assistente', 'financeiro')),
  modulo      text not null,
  nivel       text not null default 'nenhum' check (nivel in ('nenhum', 'ver', 'editar')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (perfil, modulo)
);

alter table public.perfis_permissoes enable row level security;

insert into public.perfis_permissoes (perfil, modulo, nivel)
select p.perfil, m.modulo,
       case
         when p.perfil = 'master' then 'editar'
         else coalesce(d.nivel, 'nenhum')
       end
  from (values ('master'), ('analista'), ('assistente'), ('financeiro')) as p(perfil)
 cross join (values
   ('tarefas'), ('empreendimentos'), ('crm'),
   ('financas'), ('financas_orcamento'),
   ('comercial_movimentos'), ('comercial_propostas'), ('comercial_tabela'), ('comercial_dashboard'),
   ('analytics')
 ) as m(modulo)
  left join (values
   ('analista',   'tarefas',              'editar'),
   ('analista',   'empreendimentos',      'ver'),
   ('analista',   'crm',                  'editar'),
   ('analista',   'financas',             'editar'),
   ('analista',   'comercial_movimentos', 'editar'),
   ('analista',   'comercial_propostas',  'editar'),
   ('analista',   'comercial_tabela',     'ver'),
   ('analista',   'comercial_dashboard',  'ver'),
   ('analista',   'analytics',            'ver'),
   ('assistente', 'tarefas',              'editar'),
   ('assistente', 'empreendimentos',      'ver'),
   ('assistente', 'crm',                  'editar'),
   ('assistente', 'comercial_movimentos', 'ver'),
   ('assistente', 'comercial_propostas',  'ver'),
   -- Financeiro: por decisão do administrador, só o Dashboard Comercial.
   ('financeiro', 'comercial_dashboard',  'ver')
 ) as d(perfil, modulo, nivel) on d.perfil = p.perfil and d.modulo = m.modulo
on conflict (perfil, modulo) do nothing;

-- ── 3. Funções de autorização ────────────────────────────────────────────────

create or replace function public.meu_perfil()
returns text
language sql stable security definer
set search_path = public
as $$
  select perfil from public.users_profile where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select perfil = 'administrador' from public.users_profile where id = auth.uid()), false);
$$;

-- p_nivel 'ver' aceita quem tem ver ou editar; 'editar' só quem tem editar.
create or replace function public.pode_algum(p_modulos text[], p_nivel text default 'ver')
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select case
      when u.perfil = 'administrador' then true
      else exists (
        select 1 from public.perfis_permissoes pp
         where pp.perfil = u.perfil
           and pp.modulo = any (p_modulos)
           and (pp.nivel = 'editar' or (p_nivel = 'ver' and pp.nivel = 'ver'))
      )
    end
    from public.users_profile u
   where u.id = auth.uid()
  ), false);
$$;

create or replace function public.pode(p_modulo text, p_nivel text default 'ver')
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.pode_algum(array[p_modulo], p_nivel);
$$;

-- Para as RPCs. Chamadas sem usuário (cron, service_role) passam direto.
create or replace function public.exigir_permissao(p_modulo text, p_nivel text default 'editar')
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return; end if;
  if not public.pode(p_modulo, p_nivel) then
    raise exception 'Seu perfil não tem permissão para esta ação.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.exigir_admin()
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return; end if;
  if not public.is_admin() then
    raise exception 'Ação restrita ao administrador.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.meu_perfil(), public.is_admin(), public.pode_algum(text[], text),
  public.pode(text, text), public.exigir_permissao(text, text), public.exigir_admin()
  from public, anon;
grant execute on function public.meu_perfil(), public.is_admin(), public.pode_algum(text[], text),
  public.pode(text, text), public.exigir_permissao(text, text), public.exigir_admin()
  to authenticated;

-- "Nível 1" passa a significar administrador ou master. Mantém o nome porque
-- as políticas de tarefas privadas, notificações e realtime já o usam.
create or replace function public.is_permission_level_1()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select perfil in ('administrador', 'master') from public.users_profile where id = auth.uid()), false);
$$;

create or replace function public.crm_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    nullif(lower(p.preferences ->> 'crmRole'), ''),
    case when p.perfil in ('administrador', 'master') then 'administrador' else 'sdr' end
  )
  from public.users_profile p
  where p.id = auth.uid();
$$;

-- Matriz: todos leem (a tela precisa saber o que mostrar), só o admin grava.
drop policy if exists perfis_permissoes_ler on public.perfis_permissoes;
create policy perfis_permissoes_ler on public.perfis_permissoes
  for select to authenticated using (true);
drop policy if exists perfis_permissoes_admin on public.perfis_permissoes;
create policy perfis_permissoes_admin on public.perfis_permissoes
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
revoke all on public.perfis_permissoes from anon;

-- ── 4. Perfil protegido ──────────────────────────────────────────────────────

create or replace function public.protege_campos_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.email  is distinct from old.email
     or new.perfil is distinct from old.perfil
     or (new.preferences -> 'permissionLevel') is distinct from (old.preferences -> 'permissionLevel')
     or (new.preferences -> 'crmRole')        is distinct from (old.preferences -> 'crmRole')
  then
    raise exception 'Sem permissão para alterar o nível de acesso.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.protege_campos_perfil() from public, anon, authenticated;

drop trigger if exists trg_protege_campos_perfil on public.users_profile;
create trigger trg_protege_campos_perfil
  before update on public.users_profile
  for each row execute function public.protege_campos_perfil();

revoke insert, delete on public.users_profile from anon, authenticated;

drop policy if exists admin_update_profiles on public.users_profile;
create policy admin_update_profiles on public.users_profile
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── 5. Acesso por módulo em cada tabela ──────────────────────────────────────
-- ler/escrever/apagar = módulos que liberam a operação. '{}' = só o
-- administrador. ler NULL = leitura sem restrição de módulo (dados de apoio
-- usados pelo app inteiro, como a lista de empreendimentos).

do $$
declare
  r record;
  com constant text[] := array['comercial_movimentos', 'comercial_propostas', 'comercial_tabela', 'comercial_dashboard'];
begin
  for r in
    select * from (values
      -- Tarefas
      ('tasks',                          array['tarefas','analytics'],            array['tarefas'],             array['tarefas']),
      ('subtasks',                       array['tarefas','analytics'],            array['tarefas'],             array['tarefas']),
      ('task_labels',                    array['tarefas','analytics'],            array['tarefas'],             array['tarefas']),
      ('task_history',                   array['tarefas','analytics'],            array['tarefas'],             '{}'::text[]),
      ('labels',                         null,                                    array['tarefas'],             array['tarefas']),
      -- Empreendimentos (excluir é ação do administrador)
      ('projects',                       null,                                    array['empreendimentos'],     '{}'::text[]),
      -- CRM (as políticas de papel SDR/administrador continuam valendo por cima)
      ('crm_cadencia_etapas',            array['crm'],                            array['crm'],                 array['crm']),
      ('crm_cadencias',                  array['crm'],                            array['crm'],                 array['crm']),
      ('crm_config',                     array['crm'],                            array['crm'],                 array['crm']),
      ('crm_event_types',                array['crm'],                            array['crm'],                 array['crm']),
      ('crm_faixas_investimento',        array['crm'],                            array['crm'],                 array['crm']),
      ('crm_lead_cadencias',             array['crm'],                            array['crm'],                 array['crm']),
      ('crm_lead_events',                array['crm'],                            array['crm'],                 array['crm']),
      -- Leads também são lidos no Comercial (escolha do cliente na venda/proposta).
      ('crm_leads',                      array['crm','comercial_movimentos','comercial_propostas'], array['crm'], array['crm']),
      ('crm_next_actions',               array['crm'],                            array['crm'],                 array['crm']),
      ('crm_origens',                    array['crm'],                            array['crm'],                 array['crm']),
      -- Finanças
      ('sienge_titles',                  array['financas','financas_orcamento'],  array['financas'],            array['financas']),
      ('sienge_lotes',                   array['financas','financas_orcamento'],  array['financas'],            array['financas']),
      ('sienge_faturas',                 array['financas','financas_orcamento'],  array['financas'],            array['financas']),
      ('sienge_mensalidades',            array['financas','financas_orcamento'],  array['financas'],            array['financas']),
      ('sienge_title_status_history',    array['financas','financas_orcamento'],  array['financas'],            '{}'::text[]),
      ('sienge_alcada_config',           array['financas'],                       '{}'::text[],                 '{}'::text[]),
      ('sienge_categorias',              array['financas','financas_orcamento'],  array['financas','financas_orcamento'], array['financas','financas_orcamento']),
      ('sienge_subcategorias',           array['financas','financas_orcamento'],  array['financas','financas_orcamento'], array['financas','financas_orcamento']),
      ('sienge_centros_custo',           array['financas','financas_orcamento'],  array['financas','financas_orcamento'], array['financas','financas_orcamento']),
      ('sienge_categoria_orcamento',     array['financas','financas_orcamento'],  array['financas','financas_orcamento'], array['financas','financas_orcamento']),
      ('sienge_project_totais',          array['financas','financas_orcamento','comercial_dashboard'], array['financas_orcamento'], array['financas_orcamento']),
      ('sienge_project_metas',           array['financas','financas_orcamento','comercial_dashboard'], array['financas_orcamento'], array['financas_orcamento']),
      ('sienge_orcamento_config',        array['financas','financas_orcamento','comercial_dashboard'], array['financas_orcamento'], array['financas_orcamento']),
      ('sienge_project_display',         array['financas','financas_orcamento'] || com, array['financas','financas_orcamento','comercial_tabela'], array['financas','financas_orcamento']),
      -- Comercial · Tabela de Vendas (excluir unidade/versão é do administrador)
      ('sienge_tabela_vendas',           com || array['financas_orcamento'],      array['comercial_tabela'],    '{}'::text[]),
      ('sienge_tabela_vendas_versoes',   com || array['financas_orcamento'],      array['comercial_tabela'],    '{}'::text[]),
      ('sienge_tabela_vendas_config',    com || array['financas_orcamento'],      array['comercial_tabela'],    array['comercial_tabela']),
      ('sienge_tabela_vendas_colunas',   com || array['financas_orcamento'],      array['comercial_tabela'],    array['comercial_tabela']),
      ('sienge_tabela_vendas_revisoes',  com || array['financas_orcamento'],      array['comercial_tabela'],    '{}'::text[]),
      ('sienge_calculo_regras',          com || array['financas_orcamento'],      array['comercial_tabela'],    array['comercial_tabela']),
      ('sienge_validacoes',              com || array['financas_orcamento'],      array['comercial_tabela'],    array['comercial_tabela']),
      ('sienge_lp_corretor',             com,                                     array['comercial_tabela'],    array['comercial_tabela']),
      ('sienge_unidade_historico',       com,                                     array['comercial_tabela'],    '{}'::text[]),
      ('sienge_vendas',                  com || array['financas_orcamento'],      array['comercial_tabela'],    '{}'::text[]),
      -- Comercial · demais
      ('comercial_movimentos',           com,                                     array['comercial_movimentos'], '{}'::text[]),
      ('comercial_propostas',            array['comercial_propostas','comercial_dashboard'], array['comercial_propostas'], array['comercial_propostas']),
      ('comercial_metas',                com || array['financas_orcamento'],      array['comercial_dashboard'], array['comercial_dashboard']),
      ('comercial_metas_empreendimentos', com || array['financas_orcamento'],     array['comercial_dashboard'], array['comercial_dashboard']),
      ('comercial_metas_config',         com || array['financas_orcamento'],      array['comercial_dashboard'], array['comercial_dashboard']),
      ('cv_comercial_reservas',          com,                                     '{}'::text[],                 '{}'::text[]),
      ('cv_comercial_sync',              com,                                     '{}'::text[],                 '{}'::text[]),
      ('cv_comercial_unidades',          com,                                     '{}'::text[],                 '{}'::text[]),
      ('cv_orbit_alteracoes',            com,                                     '{}'::text[],                 '{}'::text[]),
      ('cv_orbit_conferencias',          com,                                     '{}'::text[],                 '{}'::text[]),
      ('cv_orbit_empreendimentos',       com,                                     '{}'::text[],                 '{}'::text[]),
      ('relatorio_vendas_config',        array['comercial_dashboard'],            '{}'::text[],                 '{}'::text[]),
      ('relatorio_vendas_snapshots',     array['comercial_dashboard'],            '{}'::text[],                 '{}'::text[]),
      -- Integrações e backups: só o administrador
      ('whatsapp_config',                null,                                    '{}'::text[],                 '{}'::text[]),
      ('sienge_vendas_backup_import_20260730', '{}'::text[],                      '{}'::text[],                 '{}'::text[]),
      ('design_briefing_backup_20260721', '{}'::text[],                           '{}'::text[],                 '{}'::text[])
    ) as m(tabela, ler, escrever, apagar)
  loop
    if to_regclass('public.' || r.tabela) is null then
      raise notice 'tabela % não existe — pulando', r.tabela;
      continue;
    end if;

    execute format('drop policy if exists modulo_ler on public.%I', r.tabela);
    execute format('drop policy if exists modulo_inserir on public.%I', r.tabela);
    execute format('drop policy if exists modulo_alterar on public.%I', r.tabela);
    execute format('drop policy if exists modulo_apagar on public.%I', r.tabela);

    if r.ler is not null then
      execute format(
        'create policy modulo_ler on public.%I as restrictive for select to authenticated using ((select public.pode_algum(%L::text[], ''ver'')))',
        r.tabela, r.ler);
    end if;

    execute format(
      'create policy modulo_inserir on public.%I as restrictive for insert to authenticated with check ((select public.pode_algum(%L::text[], ''editar'')))',
      r.tabela, r.escrever);
    execute format(
      'create policy modulo_alterar on public.%I as restrictive for update to authenticated using ((select public.pode_algum(%L::text[], ''editar''))) with check ((select public.pode_algum(%L::text[], ''editar'')))',
      r.tabela, r.escrever, r.escrever);
    execute format(
      'create policy modulo_apagar on public.%I as restrictive for delete to authenticated using ((select public.pode_algum(%L::text[], ''editar'')))',
      r.tabela, r.apagar);
  end loop;
end;
$$;

-- whatsapp_config tinha a checagem de admin escrita à mão sobre o JSON
-- antigo; a restritiva acima já cobre a escrita.
drop policy if exists admin_write_whatsapp_config on public.whatsapp_config;
create policy admin_write_whatsapp_config on public.whatsapp_config
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── 6. Realtime ──────────────────────────────────────────────────────────────
-- Volta a publicar no tópico de cada trigger (TG_ARGV[0]) e só manda a linha
-- inteira para as tabelas de tarefas, que a tela aplica direto no cache. Nas
-- demais vai só "tabela X mudou": o cliente refaz a consulta, que passa
-- pelo RLS — ninguém recebe dado de um módulo que não acessa.

create or replace function public.broadcast_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       jsonb;
  v_private   boolean := false;
  v_topic     text := coalesce(TG_ARGV[0], 'tasks-changes');
  v_com_dados boolean := TG_TABLE_NAME in ('tasks', 'subtasks', 'task_labels');
begin
  begin
    v_row := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;

    if TG_TABLE_NAME = 'tasks' then
      v_private := coalesce((v_row ->> 'is_private')::boolean, false);
    elsif TG_TABLE_NAME in ('subtasks', 'task_labels') then
      select coalesce(t.is_private, false) into v_private
        from public.tasks t
       where t.id = (v_row ->> 'task_id')::uuid;
    end if;

    if v_com_dados and coalesce(v_private, false) then
      v_topic := 'tasks-changes-admin';
    end if;

    perform realtime.send(
      jsonb_build_object(
        'operation',  TG_OP,
        'table',      TG_TABLE_NAME,
        'record',     case when not v_com_dados or TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
        'old_record', case when TG_OP = 'INSERT' then null
                           when v_com_dados then to_jsonb(OLD)
                           else jsonb_build_object('id', v_row -> 'id') end
      ),
      TG_OP,
      v_topic,
      true
    );
  exception when others then
    null; -- realtime nunca bloqueia a escrita
  end;
  return null;
end;
$$;

drop policy if exists authenticated_can_receive_broadcasts on realtime.messages;
create policy authenticated_can_receive_broadcasts on realtime.messages
  for select to authenticated
  using (
    case topic
      when 'tasks-changes-admin' then (select public.is_permission_level_1())
      when 'tasks-changes'       then (select public.pode_algum(array['tarefas', 'analytics'], 'ver'))
      else true
    end
  );

-- ── 7. Storage: listar arquivos exige login ──────────────────────────────────
-- Os links públicos já gravados continuam abrindo (bucket público serve
-- /object/public/ sem RLS); o que deixa de existir é enumerar o bucket.

drop policy if exists attachments_select on storage.objects;
create policy attachments_select on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments');

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

-- ── 8. RPCs SECURITY DEFINER: checagem por dentro ────────────────────────────
-- Corpo idêntico ao de produção em 2026-11-12; só a primeira linha após o
-- BEGIN é nova.

CREATE OR REPLACE FUNCTION public.alterar_situacao_unidades(p_project_id text, p_unidade_ids uuid[], p_situacao text, p_motivo text, p_comprador text DEFAULT NULL::text, p_data timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_afetadas int;
  v_data timestamptz := coalesce(p_data, now());
begin
  perform public.exigir_permissao('comercial_tabela');
  if p_situacao not in ('vendida', 'disponivel', 'reservado', 'permuta', 'bloqueada') then
    raise exception 'Situação inválida: %', p_situacao;
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'O motivo da alteração é obrigatório.';
  end if;
  if p_situacao in ('vendida', 'permuta') and (p_comprador is null or btrim(p_comprador) = '') then
    raise exception 'Informe o comprador para registrar venda ou permuta.';
  end if;
  if p_unidade_ids is null or array_length(p_unidade_ids, 1) is null then
    raise exception 'Selecione ao menos uma unidade.';
  end if;

  update public.sienge_tabela_vendas
     set situacao = p_situacao,
         situacao_motivo = btrim(p_motivo),
         comprador = case when p_situacao in ('vendida', 'permuta') then btrim(p_comprador) else comprador end,
         -- Carimbo que autoriza a trigger a congelar o snapshot.
         venda_confirmada_em = case when p_situacao in ('vendida', 'permuta') then v_data else venda_confirmada_em end,
         updated_at = now()
   where project_id = p_project_id
     and id = any(p_unidade_ids)
     and situacao is distinct from p_situacao;

  get diagnostics v_afetadas = row_count;
  return v_afetadas;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_sienge_tabela_vendas_reajuste(p_project_id text, p_unidade_ids uuid[], p_percentual numeric, p_descricao text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_colunas text[] DEFAULT NULL::text[], p_versao_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_revisao_id uuid;
  v_numero int;
  v_unidades text[];
  v_count int;
  v_snapshot jsonb;
  v_versao_id uuid := p_versao_id;
  v_colunas text[] := case when p_colunas is null or array_length(p_colunas, 1) is null
                       then array['valor_tabela'] else p_colunas end;
begin
  perform public.exigir_permissao('comercial_tabela');
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'O motivo da alteração é obrigatório.';
  end if;

  if v_versao_id is null then
    select id into v_versao_id
      from sienge_tabela_vendas_versoes
     where project_id = p_project_id and principal;
  end if;

  if v_versao_id is null then
    raise exception 'Nenhuma versão de tabela de vendas para este empreendimento.';
  end if;

  if not exists (
    select 1 from sienge_tabela_vendas_versoes
     where id = v_versao_id and project_id = p_project_id
  ) then
    raise exception 'A versão informada não pertence a este empreendimento.';
  end if;

  select array_agg(unidade order by unidade), count(*) into v_unidades, v_count
  from sienge_tabela_vendas
  where project_id = p_project_id
    and versao_id = v_versao_id
    and (p_unidade_ids is null or id = any(p_unidade_ids));

  select jsonb_agg(jsonb_build_object(
           'id', id, 'valor_tabela', valor_tabela, 'campos_extra', campos_extra,
           'margens', margens
         ))
    into v_snapshot
    from sienge_tabela_vendas
   where project_id = p_project_id
     and versao_id = v_versao_id;

  select coalesce(max(numero), 0) + 1 into v_numero
  from sienge_tabela_vendas_revisoes
  where project_id = p_project_id and versao_id = v_versao_id;

  insert into sienge_tabela_vendas_revisoes
    (project_id, versao_id, numero, tipo, percentual, unidades_afetadas, unidades, descricao, motivo, snapshot, colunas)
  values
    (p_project_id, v_versao_id, v_numero,
     case when p_unidade_ids is null then 'geral' else 'seletiva' end,
     p_percentual, coalesce(v_count, 0), v_unidades, p_descricao, btrim(p_motivo),
     coalesce(v_snapshot, '[]'::jsonb), v_colunas)
  returning id into v_revisao_id;

  update sienge_tabela_vendas t
  set valor_tabela = case when 'valor_tabela' = any(v_colunas)
                       then sienge_reajusta_com_margem(
                              t.valor_tabela,
                              sienge_margem_de(t.margens, 'valor_tabela'),
                              p_percentual)
                       else t.valor_tabela end,
      campos_extra = (
        select coalesce(jsonb_object_agg(
                 e.key,
                 case
                   when e.key = any(v_colunas) and (e.value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     then to_jsonb(sienge_reajusta_com_margem(
                            (e.value #>> '{}')::numeric,
                            sienge_margem_de(t.margens, e.key),
                            p_percentual))
                   else e.value
                 end
               ), '{}'::jsonb)
          from jsonb_each(t.campos_extra) as e(key, value)
      ),
      updated_at = now()
  where t.project_id = p_project_id
    and t.versao_id = v_versao_id
    and (p_unidade_ids is null or t.id = any(p_unidade_ids));

  return v_revisao_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_versao_principal(p_versao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project text;
begin
  perform public.exigir_permissao('comercial_tabela');
  select project_id into v_project from sienge_tabela_vendas_versoes where id = p_versao_id;
  if v_project is null then
    raise exception 'Versão não encontrada.';
  end if;

  update sienge_tabela_vendas_versoes
     set principal = false, updated_at = now()
   where project_id = v_project and principal and id <> p_versao_id;

  update sienge_tabela_vendas_versoes
     set principal = true, updated_at = now()
   where id = p_versao_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.duplicar_sienge_tabela_vendas_versao(p_versao_id uuid, p_nome text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_origem public.sienge_tabela_vendas_versoes%rowtype;
  v_nova uuid;
  v_sort int;
  v_nome text;
begin
  perform public.exigir_permissao('comercial_tabela');
  select * into v_origem from sienge_tabela_vendas_versoes where id = p_versao_id;
  if not found then
    raise exception 'Versão de origem não encontrada.';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from sienge_tabela_vendas_versoes where project_id = v_origem.project_id;

  v_nome := coalesce(nullif(btrim(p_nome), ''), 'Versão ' || v_sort);

  insert into sienge_tabela_vendas_versoes (project_id, nome, sort_order, principal, lp_visivel)
  values (v_origem.project_id, v_nome, v_sort, false, false)
  returning id into v_nova;

  insert into sienge_tabela_vendas_colunas (project_id, versao_id, key, label, tipo, sort_order)
  select project_id, v_nova, key, label, tipo, sort_order
    from sienge_tabela_vendas_colunas where versao_id = p_versao_id;

  insert into sienge_calculo_regras
    (project_id, versao_id, vinculo_key, titulo, quantidade, quantidade_coluna_key, operacao, percentual, coluna_base_key, sort_order)
  select project_id, v_nova, vinculo_key, titulo, quantidade, quantidade_coluna_key, operacao, percentual, coluna_base_key, sort_order
    from sienge_calculo_regras where versao_id = p_versao_id;

  -- Validações referenciam regras por id (prefixo 'regra:'), e os ids mudam na
  -- cópia. Copiar as fórmulas apontaria para regras da versão de origem, dando
  -- número errado silenciosamente — então a versão nova começa sem validações,
  -- para serem remontadas sobre as próprias regras.
  --
  -- Unidades: nome, imóvel, situação e comprador vêm juntos porque descrevem a
  -- unidade, não a condição comercial. Os valores vêm como ponto de partida
  -- para edição.
  insert into sienge_tabela_vendas
    (project_id, versao_id, unidade, imovel, valor_tabela, situacao, campos_extra, margens,
     descricao, comprador, situacao_motivo, venda_confirmada_em)
  select project_id, v_nova, unidade, imovel, valor_tabela, situacao, campos_extra, margens,
         descricao, comprador, situacao_motivo, venda_confirmada_em
    from sienge_tabela_vendas where versao_id = p_versao_id;

  return v_nova;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_titulos_mensalidades()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inicio_mes date := date_trunc('month', now())::date;
  v_ultimo_dia int := extract(day from (date_trunc('month', now()) + interval '1 month - 1 day'))::int;
  v_venc date;
  v_inseridos int := 0;
  v_linhas int;
  m record;
begin
  perform public.exigir_permissao('financas');
  -- Laço por linha em vez de um INSERT ... SELECT único: o CHECK de centro_custo em
  -- sienge_titles só aceita 'comercial'/'marketing', enquanto a taxonomia da tela
  -- permite cadastrar outros. Num INSERT em lote, uma única mensalidade inválida
  -- abortaria a geração de todas as outras — e isso passaria despercebido, já que
  -- ninguém acompanha o cron. Aqui a linha problemática é pulada com um aviso.
  for m in
    select * from public.sienge_mensalidades
    where ativa
      -- Uma mensalidade cadastrada no meio do mês só começa a valer no próximo dia 01,
      -- senão ela geraria uma cobrança retroativa no mês em que foi criada.
      and created_at < v_inicio_mes
  loop
    begin
      -- Dia 31 em fevereiro vira 28/29: least() puxa para o último dia do mês.
      v_venc := v_inicio_mes + (least(m.dia_vencimento, v_ultimo_dia) - 1);

      insert into public.sienge_titles (
        titulo, descricao, valor, empreendimento, centro_custo, categoria, subcategoria,
        vencimento, vencimento_original, lote_id, assignee_id, motivo_detalhado,
        status, mensalidade_id
      )
      values (
        coalesce(nullif(m.titulo, ''), nullif(m.descricao, ''), 'MENSALIDADE'),
        m.descricao, m.valor, m.empreendimento, m.centro_custo, m.categoria, m.subcategoria,
        v_venc, v_venc, m.lote_id, m.assignee_id, m.motivo_detalhado,
        'a_lancar', m.id
      )
      on conflict do nothing;

      -- row_count é 0 quando o título do mês já existia (execução repetida no mesmo mês).
      get diagnostics v_linhas = row_count;
      v_inseridos := v_inseridos + v_linhas;
    exception when others then
      raise warning 'mensalidade % ignorada: %', m.id, sqlerrm;
    end;
  end loop;

  return v_inseridos;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_task_field_history(p_task_id uuid, p_field text, p_old_value text, p_new_value text, p_changed_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.exigir_permissao('tarefas');
  if p_field not in ('description', 'copy_briefing') then
    raise exception 'log_task_field_history: field % is not allowed', p_field;
  end if;

  insert into public.task_history (task_id, field, old_value, new_value, changed_by)
  values (p_task_id, p_field, p_old_value, p_new_value, p_changed_by);
end;
$function$;

CREATE OR REPLACE FUNCTION public.publicar_tabela_lp_corretor_versao(p_versao_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agora timestamptz := now();
begin
  perform public.exigir_permissao('comercial_tabela');
  update public.sienge_tabela_vendas_versoes v
     set tabela_publicada = coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', u.id,
                    'unidade', u.unidade,
                    'imovel', u.imovel,
                    'valor_tabela', u.valor_tabela,
                    'campos_extra', u.campos_extra,
                    'descricao', u.descricao,
                    'calculados', coalesce((
                      select jsonb_object_agg(r.id::text,
                               public.lp_corretor_calc_regra(u.valor_tabela, u.campos_extra, r))
                        from public.sienge_calculo_regras r
                       where r.versao_id = p_versao_id
                    ), '{}'::jsonb)
                  ))
             from public.sienge_tabela_vendas u
            where u.versao_id = p_versao_id
         ), '[]'::jsonb),
         colunas_publicadas = coalesce((
           select jsonb_agg(jsonb_build_object(
                    'key', c.key, 'label', c.label, 'tipo', c.tipo, 'sortOrder', c.sort_order
                  ) order by c.sort_order)
             from public.sienge_tabela_vendas_colunas c
            where c.versao_id = p_versao_id
         ), '[]'::jsonb),
         regras_publicadas = coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', r.id, 'titulo', r.titulo, 'sortOrder', r.sort_order
                  ) order by r.sort_order)
             from public.sienge_calculo_regras r
            where r.versao_id = p_versao_id
         ), '[]'::jsonb),
         tabela_publicada_em = v_agora,
         updated_at = v_agora
   where v.id = p_versao_id;

  if not found then
    raise exception 'Versão não encontrada.';
  end if;

  return v_agora;
end;
$function$;

CREATE OR REPLACE FUNCTION public.regenerar_token_validacao_lp(p_project_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  perform public.exigir_admin();
  update public.sienge_lp_corretor
     set validacao_token = v_token,
         updated_at = now()
   where project_id = p_project_id;

  if not found then
    raise exception 'Este empreendimento ainda não tem LP do Corretor configurada.';
  end if;

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimento_comercial(p_tipo text, p_unidade_id uuid, p_cliente text, p_corretor text, p_data date DEFAULT NULL::date, p_dias_para_cair integer DEFAULT NULL::integer, p_imobiliaria text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_un public.sienge_tabela_vendas%rowtype;
  v_nova text;
  v_motivo text;
  -- Meio-dia de Brasília: a data escolhida no formulário não muda de dia ao ser
  -- lida de volta em outro fuso.
  v_data_ts timestamptz := (p_data::timestamp + time '12:00') at time zone 'America/Sao_Paulo';
  v_imobiliaria text := nullif(btrim(coalesce(p_imobiliaria, '')), '');
  v_id uuid;
begin
  perform public.exigir_permissao('comercial_movimentos');
  if p_tipo not in ('venda', 'distrato', 'reserva') then
    raise exception 'Tipo de lançamento inválido: %', p_tipo;
  end if;
  if p_cliente is null or btrim(p_cliente) = '' then
    raise exception 'Informe o cliente.';
  end if;
  if p_corretor is null or btrim(p_corretor) = '' then
    raise exception 'Informe o corretor.';
  end if;

  select * into v_un from public.sienge_tabela_vendas where id = p_unidade_id for update;
  if not found then
    raise exception 'Unidade não encontrada.';
  end if;

  if p_tipo = 'venda' then
    if p_data is null then
      raise exception 'Informe a data da assinatura do contrato.';
    end if;
    if v_un.situacao not in ('disponivel', 'reservado') then
      raise exception 'Só é possível vender uma unidade disponível ou reservada (situação atual: %).', v_un.situacao;
    end if;
    v_nova := 'vendida';
    v_motivo := 'Venda lançada no Comercial — corretor ' || btrim(p_corretor);
  elsif p_tipo = 'reserva' then
    if p_dias_para_cair is null or p_dias_para_cair not between 1 and 30 then
      raise exception 'Informe os dias para cair (de 1 a 30).';
    end if;
    if v_un.situacao <> 'disponivel' then
      raise exception 'Só é possível reservar uma unidade disponível (situação atual: %).', v_un.situacao;
    end if;
    v_nova := 'reservado';
    v_motivo := 'Reserva lançada no Comercial — ' || btrim(p_cliente) || ' (corretor ' || btrim(p_corretor)
                || '), cai em ' || p_dias_para_cair || ' dia(s)';
  else
    if p_data is null then
      raise exception 'Informe a data do distrato.';
    end if;
    if v_un.situacao <> 'vendida' then
      raise exception 'Só é possível distratar uma unidade vendida (situação atual: %).', v_un.situacao;
    end if;
    if v_un.venda_confirmada_em is not null
       and p_data < (v_un.venda_confirmada_em at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data do distrato não pode ser anterior à data da venda.';
    end if;
    v_nova := 'disponivel';
    v_motivo := 'Distrato lançado no Comercial — ' || btrim(p_cliente) || ' (corretor ' || btrim(p_corretor) || ')';
  end if;

  -- Reserva que ainda constava como ativa para esta unidade deixa de valer:
  -- vira venda (convertida) ou foi atropelada por um novo lançamento.
  update public.comercial_movimentos
     set reserva_status = case when p_tipo = 'venda' then 'convertida' else 'cancelada' end
   where tipo = 'reserva' and reserva_status = 'ativa'
     and project_id = v_un.project_id and unidade = v_un.unidade;

  -- Lidas pela trigger de histórico; valem só nesta transação.
  perform set_config('comercial.cliente', btrim(p_cliente), true);
  perform set_config('comercial.corretor', btrim(p_corretor), true);
  perform set_config('comercial.imobiliaria', coalesce(v_imobiliaria, ''), true);
  perform set_config('comercial.origem', 'comercial', true);

  update public.sienge_tabela_vendas
     set situacao = v_nova,
         situacao_motivo = v_motivo,
         comprador = case when v_nova = 'vendida' then btrim(p_cliente) else comprador end,
         -- Carimbo que autoriza a trigger a congelar o snapshot da venda.
         venda_confirmada_em = case when v_nova = 'vendida' then v_data_ts else venda_confirmada_em end,
         updated_at = now()
   where id = p_unidade_id;

  -- A trigger encerra o snapshot com now(); aqui a data passa a ser a informada
  -- no formulário. now() é fixo dentro da transação, então identifica exatamente
  -- o que acabou de ser encerrado.
  if p_tipo = 'distrato' then
    update public.sienge_vendas
       set data_distrato = v_data_ts
     where project_id = v_un.project_id and unidade = v_un.unidade and data_distrato = now();
  end if;

  insert into public.comercial_movimentos (
    tipo, project_id, unidade_id, unidade, cliente, corretor, imobiliaria,
    data_assinatura, data_distrato, dias_para_cair, reserva_expira_em, reserva_status,
    situacao_anterior, situacao_nova, created_by
  )
  values (
    p_tipo, v_un.project_id, v_un.id, v_un.unidade, btrim(p_cliente), btrim(p_corretor), v_imobiliaria,
    case when p_tipo = 'venda' then p_data end,
    case when p_tipo = 'distrato' then p_data end,
    case when p_tipo = 'reserva' then p_dias_para_cair end,
    case when p_tipo = 'reserva' then now() + make_interval(days => p_dias_para_cair) end,
    case when p_tipo = 'reserva' then 'ativa' end,
    v_un.situacao, v_nova, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.renomear_empreendimento(p_project_id text, p_novo_nome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome_atual text;
begin
  perform public.exigir_admin();
  if p_novo_nome is null or btrim(p_novo_nome) = '' then
    raise exception 'O nome do empreendimento não pode ficar vazio.';
  end if;

  select name into v_nome_atual from public.projects where id = p_project_id;
  if not found then
    raise exception 'Empreendimento não encontrado.';
  end if;

  if v_nome_atual = btrim(p_novo_nome) then
    return;
  end if;

  -- O nome é a chave de ligação dos títulos: dois empreendimentos com o mesmo
  -- nome fundiriam o gasto de ambos numa linha só do dashboard.
  if exists (select 1 from public.projects where name = btrim(p_novo_nome) and id <> p_project_id) then
    raise exception 'Já existe outro empreendimento chamado "%".', btrim(p_novo_nome);
  end if;

  update public.projects set name = btrim(p_novo_nome) where id = p_project_id;

  update public.sienge_titles
     set empreendimento = btrim(p_novo_nome)
   where empreendimento = v_nome_atual;

  update public.sienge_mensalidades
     set empreendimento = btrim(p_novo_nome)
   where empreendimento = v_nome_atual;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reverter_sienge_tabela_vendas_revisao(p_revisao_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rev public.sienge_tabela_vendas_revisoes%rowtype;
  v_afetadas int;
begin
  perform public.exigir_admin();
  select * into v_rev from sienge_tabela_vendas_revisoes where id = p_revisao_id;
  if not found then
    raise exception 'Revisão não encontrada.';
  end if;
  if v_rev.snapshot is null or jsonb_array_length(v_rev.snapshot) = 0 then
    raise exception 'Esta revisão não tem backup e não pode ser revertida.';
  end if;

  update sienge_tabela_vendas u
     set valor_tabela = b.valor_tabela,
         campos_extra = b.campos_extra,
         margens = coalesce(b.margens, u.margens),
         updated_at = now()
    from jsonb_to_recordset(v_rev.snapshot)
      as b(id uuid, valor_tabela numeric, campos_extra jsonb, margens jsonb)
   where u.id = b.id
     and u.project_id = v_rev.project_id;

  get diagnostics v_afetadas = row_count;

  update sienge_tabela_vendas_revisoes
     set revertida_em = now()
   where id = p_revisao_id;

  return v_afetadas;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_sienge_tabela_vendas_margem(p_project_id text, p_unidade_ids uuid[], p_coluna text, p_valor numeric, p_versao_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_afetadas int;
  v_versao_id uuid := p_versao_id;
begin
  perform public.exigir_permissao('comercial_tabela');
  if p_coluna is null or btrim(p_coluna) = '' then
    raise exception 'A coluna da margem é obrigatória.';
  end if;

  if v_versao_id is null then
    select id into v_versao_id
      from sienge_tabela_vendas_versoes
     where project_id = p_project_id and principal;
  end if;

  if v_versao_id is null then
    raise exception 'Nenhuma versão de tabela de vendas para este empreendimento.';
  end if;

  update sienge_tabela_vendas
     set margens = case
           when p_valor is null or p_valor = 0
             then coalesce(margens, '{}'::jsonb) - p_coluna
           else jsonb_set(coalesce(margens, '{}'::jsonb), array[p_coluna], to_jsonb(p_valor), true)
         end,
         updated_at = now()
   where project_id = p_project_id
     and versao_id = v_versao_id
     and (p_unidade_ids is null or id = any(p_unidade_ids));

  get diagnostics v_afetadas = row_count;
  return v_afetadas;
end;
$function$;


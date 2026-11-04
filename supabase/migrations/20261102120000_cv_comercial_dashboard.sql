-- =============================================================================
-- Aba Desempenho do Dashboard do Comercial: cópia analítica do CV CRM
-- -----------------------------------------------------------------------------
-- Preenchida só pela Edge Function `cvcrm-sync`. O app apenas lê. As tabelas não
-- guardam nome, documento, e-mail, CEP, renda nem idade exata do cliente.
--
-- ORDEM DE PUBLICAÇÃO: definir os secrets CVCRM_* e publicar a função ANTES de
-- aplicar esta migration, porque o agendamento no fim dela já começa a chamá-la.
-- =============================================================================

create table if not exists public.cv_comercial_reservas (
  idreserva bigint primary key,
  idempreendimento bigint not null,
  empreendimento text not null,
  idunidade bigint,
  unidade text,
  bloco text,
  situacao text not null,
  data_cad date,
  data_venda date,
  data_cancelamento date,
  data_distrato date,
  valor_contrato numeric not null default 0,
  area_privativa numeric,
  imobiliaria text,
  corretor text,
  valor_tabela_cv numeric,
  canal text not null,
  midia text,
  motivo_cancelamento text,
  motivo_distrato text,
  tipo_pessoa text,
  faixa_etaria text,
  sexo text,
  estado_civil text,
  cidade text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.cv_comercial_unidades (
  idunidade bigint primary key,
  idempreendimento bigint not null,
  empreendimento text not null,
  unidade text not null,
  situacao text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.cv_comercial_sync (
  id text primary key default 'default' check (id = 'default'),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  status text,
  erro text,
  reservas integer,
  unidades integer
);

alter table public.cv_comercial_reservas enable row level security;
alter table public.cv_comercial_unidades enable row level security;
alter table public.cv_comercial_sync enable row level security;

-- Só leitura para quem está logado; a escrita passa pelo service_role da função.
revoke all on public.cv_comercial_reservas, public.cv_comercial_unidades, public.cv_comercial_sync from public, anon, authenticated;
grant select on public.cv_comercial_reservas, public.cv_comercial_unidades, public.cv_comercial_sync to authenticated;

drop policy if exists "auth_select_cv_comercial_reservas" on public.cv_comercial_reservas;
create policy "auth_select_cv_comercial_reservas" on public.cv_comercial_reservas
  for select to authenticated using (true);

drop policy if exists "auth_select_cv_comercial_unidades" on public.cv_comercial_unidades;
create policy "auth_select_cv_comercial_unidades" on public.cv_comercial_unidades
  for select to authenticated using (true);

drop policy if exists "auth_select_cv_comercial_sync" on public.cv_comercial_sync;
create policy "auth_select_cv_comercial_sync" on public.cv_comercial_sync
  for select to authenticated using (true);

-- Agendamento: idempotente, recria o job a cada aplicação.
select cron.unschedule(jobid) from cron.job where jobname = 'cvcrm-sync';

select cron.schedule(
  'cvcrm-sync',
  '7 * * * *',
  $$
    select net.http_post(
      url := 'https://quyoeoftqackmrjxpreb.supabase.co/functions/v1/cvcrm-sync',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $$
);

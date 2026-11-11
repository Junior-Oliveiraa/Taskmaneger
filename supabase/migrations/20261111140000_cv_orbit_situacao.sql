-- =============================================================================
-- Sincronização diária da situação das unidades: CV CRM → tabela de vendas do Orbit
-- -----------------------------------------------------------------------------
-- A Edge Function `cv-orbit-situacao` lê o CV e, onde a situação da unidade na
-- versão principal da tabela de vendas difere, chama alterar_situacao_unidades.
-- O CV é a fonte da verdade, inclusive para desfazer vendas.
--
-- ORDEM DE PUBLICAÇÃO: publicar a função (sem verificação de JWT) ANTES de
-- aplicar esta migration, porque o agendamento no fim dela já começa a chamá-la.
-- Os secrets CVCRM_* são os mesmos da cvcrm-sync.
-- =============================================================================

-- Quais empreendimentos do CV correspondem a quais projetos do Orbit.
create table if not exists public.cv_orbit_empreendimentos (
  idempreendimento_cv bigint primary key,
  project_id text not null unique references public.projects(id) on delete cascade,
  -- Flow: reserva em "Termo Assinado" no CV já é venda no Orbit. Demais: igual ao CV.
  termo_assinado_vendida boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Uma linha por execução.
create table if not exists public.cv_orbit_conferencias (
  id uuid primary key default gen_random_uuid(),
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  status text not null,
  conferidas integer,
  alteradas integer,
  avisos text[],
  erro text
);

-- Uma linha por unidade alterada. Não guarda nome de cliente.
create table if not exists public.cv_orbit_alteracoes (
  id uuid primary key default gen_random_uuid(),
  conferencia_id uuid not null references public.cv_orbit_conferencias(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  unidade text not null,
  situacao_anterior text not null,
  situacao_nova text not null,
  motivo text,
  idreserva_cv bigint,
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists cv_orbit_alteracoes_project_idx on public.cv_orbit_alteracoes (project_id, created_at desc);

alter table public.cv_orbit_empreendimentos enable row level security;
alter table public.cv_orbit_conferencias enable row level security;
alter table public.cv_orbit_alteracoes enable row level security;

-- Só leitura para quem está logado; a escrita passa pelo service_role da função.
revoke all on public.cv_orbit_empreendimentos, public.cv_orbit_conferencias, public.cv_orbit_alteracoes from public, anon, authenticated;
grant select on public.cv_orbit_empreendimentos, public.cv_orbit_conferencias, public.cv_orbit_alteracoes to authenticated;

drop policy if exists "auth_select_cv_orbit_empreendimentos" on public.cv_orbit_empreendimentos;
create policy "auth_select_cv_orbit_empreendimentos" on public.cv_orbit_empreendimentos
  for select to authenticated using (true);

drop policy if exists "auth_select_cv_orbit_conferencias" on public.cv_orbit_conferencias;
create policy "auth_select_cv_orbit_conferencias" on public.cv_orbit_conferencias
  for select to authenticated using (true);

drop policy if exists "auth_select_cv_orbit_alteracoes" on public.cv_orbit_alteracoes;
create policy "auth_select_cv_orbit_alteracoes" on public.cv_orbit_alteracoes
  for select to authenticated using (true);

-- Empreendimentos ligados hoje. Martin Sehner e Botanic (só no CV) e Green Park,
-- Vivenda do Bosque e Terceiros (só no Orbit) ficam de fora.
insert into public.cv_orbit_empreendimentos (idempreendimento_cv, project_id, termo_assinado_vendida)
select v.idcv, v.pid, v.termo
  from (values (6::bigint, 'p2', true),   -- FLOW AMELIA ROSA → Flow
               (4::bigint, 'p3', false),  -- Gênova - Club Residenziale → Gênova
               (5::bigint, 'p1', false))  -- Rivage - Incorporação SPE → Rivage
       as v(idcv, pid, termo)
 where exists (select 1 from public.projects p where p.id = v.pid)
on conflict (idempreendimento_cv) do nothing;

-- Todo dia às 6h30 de Maceió (9h30 UTC), longe do minuto da cvcrm-sync (:07),
-- para as duas não dividirem o limite de 20 chamadas/min do CVDW.
select cron.unschedule(jobid) from cron.job where jobname = 'cv-orbit-situacao';

select cron.schedule(
  'cv-orbit-situacao',
  '30 9 * * *',
  $$
    select net.http_post(
      url := 'https://quyoeoftqackmrjxpreb.supabase.co/functions/v1/cv-orbit-situacao',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $$
);

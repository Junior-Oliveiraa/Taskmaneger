-- =============================================================================
-- Registro dos leads do Meta Ads já importados
-- -----------------------------------------------------------------------------
-- A varredura relê a última hora de leads na Meta a cada minuto. Usando só
-- crm_leads.meta_lead_id para saber o que já entrou, um card excluído pela SDR
-- (teste, spam, duplicado) voltava ao kanban na execução seguinte. Esta tabela
-- guarda o id de tudo que já foi importado e sobrevive à exclusão do card.
-- =============================================================================

create table if not exists public.crm_meta_leads_vistos (
  meta_lead_id text primary key,
  visto_em timestamptz not null default now()
);

-- Só a Edge Function (service role) lê e grava; sem policy, ninguém mais acessa.
alter table public.crm_meta_leads_vistos enable row level security;

insert into public.crm_meta_leads_vistos (meta_lead_id, visto_em)
select meta_lead_id, created_at from public.crm_leads where meta_lead_id is not null
on conflict (meta_lead_id) do nothing;

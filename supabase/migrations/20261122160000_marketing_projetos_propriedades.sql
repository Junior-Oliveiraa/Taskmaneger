-- =============================================================================
-- Marketing — projeto com prioridade, data de início e empreendimento
-- -----------------------------------------------------------------------------
-- As três são opcionais. Prioridade usa os mesmos níveis das tarefas;
-- empreendimento aponta para public.projects (id em texto) e fica vazio se o
-- empreendimento for excluído.
--
-- Início <= entrega quando o projeto tem as duas datas. Contra a entrega
-- herdada do portfólio, quem checa é o app.
--
-- O app funciona antes e depois desta migração.
-- =============================================================================

alter table public.marketing_projetos
  add column if not exists prioridade text not null default 'no_priority',
  add column if not exists data_inicio date,
  add column if not exists empreendimento_id text references public.projects(id) on delete set null;

alter table public.marketing_projetos drop constraint if exists marketing_projetos_prioridade_check;
alter table public.marketing_projetos
  add constraint marketing_projetos_prioridade_check
  check (prioridade in ('no_priority', 'low', 'medium', 'high', 'urgent'));

alter table public.marketing_projetos drop constraint if exists marketing_projetos_inicio_ate_entrega;
alter table public.marketing_projetos
  add constraint marketing_projetos_inicio_ate_entrega
  check (data_inicio is null or data_entrega is null or data_inicio <= data_entrega);

create index if not exists marketing_projetos_empreendimento_idx on public.marketing_projetos (empreendimento_id);

comment on column public.marketing_projetos.prioridade is 'Mesmos níveis de tasks.priority.';
comment on column public.marketing_projetos.data_inicio is 'Início planejado do projeto. Opcional.';
comment on column public.marketing_projetos.empreendimento_id is 'Empreendimento (public.projects). Opcional.';

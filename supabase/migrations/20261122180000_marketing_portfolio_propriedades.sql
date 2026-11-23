-- =============================================================================
-- Marketing — portfólio com as mesmas propriedades do projeto
-- -----------------------------------------------------------------------------
-- Status, prioridade, data de início, empreendimentos (vários) e membros.
-- Empreendimentos e membros ficam em tabelas de ligação, como as do projeto.
-- Permissões seguem o módulo "tarefas", como as demais tabelas de projetos.
--
-- O app funciona antes e depois desta migração.
-- =============================================================================

alter table public.marketing_portfolios
  add column if not exists status text not null default 'ativo',
  add column if not exists prioridade text not null default 'no_priority',
  add column if not exists data_inicio date;

alter table public.marketing_portfolios drop constraint if exists marketing_portfolios_status_check;
alter table public.marketing_portfolios
  add constraint marketing_portfolios_status_check
  check (status in ('ativo', 'pausado', 'concluido'));

alter table public.marketing_portfolios drop constraint if exists marketing_portfolios_prioridade_check;
alter table public.marketing_portfolios
  add constraint marketing_portfolios_prioridade_check
  check (prioridade in ('no_priority', 'low', 'medium', 'high', 'urgent'));

alter table public.marketing_portfolios drop constraint if exists marketing_portfolios_inicio_ate_entrega;
alter table public.marketing_portfolios
  add constraint marketing_portfolios_inicio_ate_entrega
  check (data_inicio is null or data_entrega is null or data_inicio <= data_entrega);

create table if not exists public.marketing_portfolio_empreendimentos (
  portfolio_id uuid not null references public.marketing_portfolios(id) on delete cascade,
  empreendimento_id text not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, empreendimento_id)
);
create index if not exists marketing_portfolio_empreendimentos_emp_idx
  on public.marketing_portfolio_empreendimentos (empreendimento_id);

create table if not exists public.marketing_portfolio_membros (
  portfolio_id uuid not null references public.marketing_portfolios(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, user_id)
);
create index if not exists marketing_portfolio_membros_user_idx
  on public.marketing_portfolio_membros (user_id);

do $$
declare
  t text;
begin
  foreach t in array array['marketing_portfolio_empreendimentos', 'marketing_portfolio_membros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists inserir on public.%I', t);
    execute format('drop policy if exists apagar on public.%I', t);
    execute format(
      'create policy ler on public.%I for select to authenticated using ((select public.pode(''tarefas'', ''ver'')))', t);
    execute format(
      'create policy inserir on public.%I for insert to authenticated with check ((select public.pode(''tarefas'', ''editar'')))', t);
    execute format(
      'create policy apagar on public.%I for delete to authenticated using ((select public.pode(''tarefas'', ''editar'')))', t);

    if to_regprocedure('public.nao_e_consultoria()') is not null then
      execute format('drop policy if exists somente_leitura_inserir on public.%I', t);
      execute format('drop policy if exists somente_leitura_apagar on public.%I', t);
      execute format(
        'create policy somente_leitura_inserir on public.%I as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()))', t);
      execute format(
        'create policy somente_leitura_apagar on public.%I as restrictive for delete to authenticated using ((select public.nao_e_consultoria()))', t);
    end if;
  end loop;
end;
$$;

comment on column public.marketing_portfolios.status is 'Mesmos valores de marketing_projetos.status.';
comment on column public.marketing_portfolios.prioridade is 'Mesmos níveis de tasks.priority.';
comment on column public.marketing_portfolios.data_inicio is 'Início planejado do portfólio. Opcional.';

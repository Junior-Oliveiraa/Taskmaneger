-- =============================================================================
-- Marketing — Projetos e Portfólios
-- -----------------------------------------------------------------------------
-- O menu Marketing passa a ter Projetos (cada um com Kanban, lista compacta e
-- calendário das suas tarefas) e Portfólios (grupos de projetos).
--
-- A ligação tarefa → projeto fica numa tabela à parte, e não numa coluna de
-- `tasks`: assim a busca de tarefas não depende desta migração, e uma tarefa
-- pertence a no máximo um projeto (task_id é a chave primária).
--
-- Permissões seguem o módulo "tarefas": ver para ler, editar para alterar.
-- =============================================================================

create table if not exists public.marketing_portfolios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  descricao text not null default '',
  cor text not null default '#6366f1',
  sort_order int not null default 0,
  created_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  descricao text not null default '',
  cor text not null default '#3b82f6',
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido')),
  portfolio_id uuid references public.marketing_portfolios(id) on delete set null,
  sort_order int not null default 0,
  created_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_projetos_portfolio_idx on public.marketing_projetos (portfolio_id);

create table if not exists public.marketing_projeto_tarefas (
  task_id uuid primary key,
  projeto_id uuid not null references public.marketing_projetos(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists marketing_projeto_tarefas_projeto_idx on public.marketing_projeto_tarefas (projeto_id);

-- Chave estrangeira para tasks só quando os tipos batem (tasks.id uuid).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks' and column_name = 'id' and data_type = 'uuid'
  ) and not exists (
    select 1 from pg_constraint where conname = 'marketing_projeto_tarefas_task_fk'
  ) then
    delete from public.marketing_projeto_tarefas mpt
     where not exists (select 1 from public.tasks t where t.id = mpt.task_id);
    alter table public.marketing_projeto_tarefas
      add constraint marketing_projeto_tarefas_task_fk
      foreign key (task_id) references public.tasks(id) on delete cascade;
  end if;
end;
$$;

alter table public.marketing_portfolios enable row level security;
alter table public.marketing_projetos enable row level security;
alter table public.marketing_projeto_tarefas enable row level security;
revoke all on public.marketing_portfolios from anon;
revoke all on public.marketing_projetos from anon;
revoke all on public.marketing_projeto_tarefas from anon;

do $$
declare
  t text;
begin
  foreach t in array array['marketing_portfolios', 'marketing_projetos', 'marketing_projeto_tarefas'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists inserir on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('drop policy if exists apagar on public.%I', t);
    execute format(
      'create policy ler on public.%I for select to authenticated using ((select public.pode(''tarefas'', ''ver'')))', t);
    execute format(
      'create policy inserir on public.%I for insert to authenticated with check ((select public.pode(''tarefas'', ''editar'')))', t);
    execute format(
      'create policy alterar on public.%I for update to authenticated using ((select public.pode(''tarefas'', ''editar''))) with check ((select public.pode(''tarefas'', ''editar'')))', t);
    execute format(
      'create policy apagar on public.%I for delete to authenticated using ((select public.pode(''tarefas'', ''editar'')))', t);

    -- Camada "somente leitura" do perfil consultoria.
    if to_regprocedure('public.nao_e_consultoria()') is not null then
      execute format('drop policy if exists somente_leitura_inserir on public.%I', t);
      execute format('drop policy if exists somente_leitura_alterar on public.%I', t);
      execute format('drop policy if exists somente_leitura_apagar on public.%I', t);
      execute format(
        'create policy somente_leitura_inserir on public.%I as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()))', t);
      execute format(
        'create policy somente_leitura_alterar on public.%I as restrictive for update to authenticated using ((select public.nao_e_consultoria())) with check ((select public.nao_e_consultoria()))', t);
      execute format(
        'create policy somente_leitura_apagar on public.%I as restrictive for delete to authenticated using ((select public.nao_e_consultoria()))', t);
    end if;
  end loop;
end;
$$;

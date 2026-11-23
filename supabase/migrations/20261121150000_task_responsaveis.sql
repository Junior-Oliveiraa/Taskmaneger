-- =============================================================================
-- Tarefas — mais de um responsável
-- -----------------------------------------------------------------------------
-- tasks.assignee_id continua sendo o responsável principal (notificações,
-- cronômetro e aprovações seguem nele). Os demais responsáveis ficam aqui.
-- Tabela à parte para a busca de tarefas não depender desta migração.
-- Permissões seguem o módulo "tarefas".
-- =============================================================================

create table if not exists public.task_responsaveis (
  task_id uuid not null,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists task_responsaveis_user_idx on public.task_responsaveis (user_id);

-- Chave estrangeira para tasks só quando os tipos batem (tasks.id uuid).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks' and column_name = 'id' and data_type = 'uuid'
  ) and not exists (
    select 1 from pg_constraint where conname = 'task_responsaveis_task_fk'
  ) then
    alter table public.task_responsaveis
      add constraint task_responsaveis_task_fk
      foreign key (task_id) references public.tasks(id) on delete cascade;
  end if;
end;
$$;

alter table public.task_responsaveis enable row level security;
revoke all on public.task_responsaveis from anon;

drop policy if exists ler on public.task_responsaveis;
create policy ler on public.task_responsaveis
  for select to authenticated using ((select public.pode('tarefas', 'ver')));

drop policy if exists inserir on public.task_responsaveis;
create policy inserir on public.task_responsaveis
  for insert to authenticated with check ((select public.pode('tarefas', 'editar')));

drop policy if exists apagar on public.task_responsaveis;
create policy apagar on public.task_responsaveis
  for delete to authenticated using ((select public.pode('tarefas', 'editar')));

do $$
begin
  if to_regprocedure('public.nao_e_consultoria()') is null then
    return;
  end if;
  drop policy if exists somente_leitura_inserir on public.task_responsaveis;
  drop policy if exists somente_leitura_apagar on public.task_responsaveis;
  create policy somente_leitura_inserir on public.task_responsaveis
    as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()));
  create policy somente_leitura_apagar on public.task_responsaveis
    as restrictive for delete to authenticated using ((select public.nao_e_consultoria()));
end;
$$;

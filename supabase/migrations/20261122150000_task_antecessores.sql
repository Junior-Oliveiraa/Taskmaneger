-- =============================================================================
-- Tarefas — antecessores e justificativa de mudança de datas
-- -----------------------------------------------------------------------------
-- 1. task_antecessores: a tarefa só segue depois que os antecessores forem
--    concluídos. A regra e os avisos ficam no app. Tabela à parte para a busca de
--    tarefas não depender desta migração. Permissões seguem o módulo "tarefas".
-- 2. log_task_field_history passa a aceitar 'justificativa_data' (motivo escrito
--    ao alterar início ou prazo já definidos).
-- O app funciona antes e depois desta migração.
-- =============================================================================

create table if not exists public.task_antecessores (
  task_id uuid not null references public.tasks(id) on delete cascade,
  antecessor_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, antecessor_id),
  constraint task_antecessores_outra_tarefa check (task_id <> antecessor_id)
);

create index if not exists task_antecessores_antecessor_idx on public.task_antecessores (antecessor_id);

alter table public.task_antecessores enable row level security;
revoke all on public.task_antecessores from anon;

drop policy if exists ler on public.task_antecessores;
create policy ler on public.task_antecessores
  for select to authenticated using ((select public.pode('tarefas', 'ver')));

drop policy if exists inserir on public.task_antecessores;
create policy inserir on public.task_antecessores
  for insert to authenticated with check ((select public.pode('tarefas', 'editar')));

drop policy if exists apagar on public.task_antecessores;
create policy apagar on public.task_antecessores
  for delete to authenticated using ((select public.pode('tarefas', 'editar')));

do $$
begin
  if to_regprocedure('public.nao_e_consultoria()') is null then
    return;
  end if;
  drop policy if exists somente_leitura_inserir on public.task_antecessores;
  drop policy if exists somente_leitura_apagar on public.task_antecessores;
  create policy somente_leitura_inserir on public.task_antecessores
    as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()));
  create policy somente_leitura_apagar on public.task_antecessores
    as restrictive for delete to authenticated using ((select public.nao_e_consultoria()));
end;
$$;

-- Mesma função de antes, com mais um campo permitido.
create or replace function public.log_task_field_history(p_task_id uuid, p_field text, p_old_value text, p_new_value text, p_changed_by text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.exigir_permissao('tarefas');
  if p_field not in ('description', 'copy_briefing', 'justificativa_data') then
    raise exception 'log_task_field_history: field % is not allowed', p_field;
  end if;

  insert into public.task_history (task_id, field, old_value, new_value, changed_by)
  values (p_task_id, p_field, p_old_value, p_new_value, p_changed_by);
end;
$function$;

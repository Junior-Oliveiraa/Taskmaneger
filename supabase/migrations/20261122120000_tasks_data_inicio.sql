-- =============================================================================
-- Tarefas — data de início (programação)
-- -----------------------------------------------------------------------------
-- Início planejado da tarefa; com o prazo (due_date), forma a barra do
-- Cronograma. Opcional. A regra "início <= prazo" é do app: no banco ela
-- recusaria um prazo antecipado por outro caminho (aprovação, rotina).
-- O app funciona antes e depois desta migração.
-- =============================================================================

alter table public.tasks add column if not exists start_date date;

comment on column public.tasks.start_date is 'Início planejado da tarefa (programação). Opcional.';

-- Histórico: mesma função de antes, agora registrando também start_date.
create or replace function public.log_task_history()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  col text;
  old_val text;
  new_val text;
  jsonb_cols text[] := array[
    'design_briefing','planning_briefing','chat_messages',
    'attachments','proposals','social_media_approval','time_tracking'
  ];
  tracked_cols text[] := array[
    'title','status','priority','project_id','start_date','due_date','assignee_id',
    'planned_date','reminder_date','parent_task_id',
    'design_briefing','planning_briefing','chat_messages',
    'attachments','proposals','social_media_approval','time_tracking'
  ];
  is_jsonb boolean;
begin
  foreach col in array tracked_cols loop
    old_val := to_jsonb(OLD) ->> col;
    new_val := to_jsonb(NEW) ->> col;

    if old_val is distinct from new_val then
      is_jsonb := col = any(jsonb_cols);
      insert into public.task_history (task_id, field, old_value, new_value, changed_by)
      values (
        NEW.id, col,
        case when is_jsonb then null else old_val end,
        case when is_jsonb then null else new_val end,
        NEW.updated_by
      );
    end if;
  end loop;
  return NEW;
end;
$function$;

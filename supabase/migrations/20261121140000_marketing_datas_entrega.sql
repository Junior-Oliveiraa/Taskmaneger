-- =============================================================================
-- Marketing — datas de entrega em hierarquia
-- -----------------------------------------------------------------------------
-- Portfólio e projeto ganham data de entrega. A hierarquia é:
--
--   prazo da tarefa  <=  entrega do projeto  <=  entrega do portfólio
--
-- Projeto sem data herda o limite do portfólio (as tarefas dele ficam limitadas
-- pela data do portfólio). Datas vazias não limitam nada.
--
-- Os gatilhos abaixo garantem a regra no banco; o app checa antes e explica.
-- =============================================================================

alter table public.marketing_portfolios add column if not exists data_entrega date;
alter table public.marketing_projetos add column if not exists data_entrega date;

-- tasks.due_date é lido como texto (YYYY-MM-DD...) para não depender do tipo da coluna.
create or replace function public.marketing_prazo_tarefa(p_task_id uuid)
returns date
language sql stable security definer
set search_path = public
as $$
  select nullif(left(t.due_date::text, 10), '')::date
    from public.tasks t
   where t.id::text = p_task_id::text;
$$;

/** Limite das tarefas de um projeto: a data dele ou, sem data, a do portfólio. */
create or replace function public.marketing_limite_projeto(p_projeto uuid)
returns date
language sql stable security definer
set search_path = public
as $$
  select coalesce(pj.data_entrega, pf.data_entrega)
    from public.marketing_projetos pj
    left join public.marketing_portfolios pf on pf.id = pj.portfolio_id
   where pj.id = p_projeto;
$$;

create or replace function public.marketing_maior_prazo_projeto(p_projeto uuid)
returns date
language sql stable security definer
set search_path = public
as $$
  select max(nullif(left(t.due_date::text, 10), '')::date)
    from public.marketing_projeto_tarefas l
    join public.tasks t on t.id::text = l.task_id::text
   where l.projeto_id = p_projeto;
$$;

revoke execute on function public.marketing_prazo_tarefa(uuid), public.marketing_limite_projeto(uuid), public.marketing_maior_prazo_projeto(uuid) from public, anon;
grant execute on function public.marketing_prazo_tarefa(uuid), public.marketing_limite_projeto(uuid), public.marketing_maior_prazo_projeto(uuid) to authenticated;

-- Projeto: não passa do portfólio, e não fica antes das tarefas dele. ---------
create or replace function public.marketing_projeto_valida_datas()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_portfolio date;
  v_limite date;
  v_maior date;
begin
  select data_entrega into v_portfolio from public.marketing_portfolios where id = new.portfolio_id;

  if new.data_entrega is not null and v_portfolio is not null and new.data_entrega > v_portfolio then
    raise exception 'A entrega do projeto (%) não pode passar da entrega do portfólio (%).',
      to_char(new.data_entrega, 'DD/MM/YYYY'), to_char(v_portfolio, 'DD/MM/YYYY');
  end if;

  if tg_op = 'UPDATE' then
    v_limite := coalesce(new.data_entrega, v_portfolio);
    v_maior := public.marketing_maior_prazo_projeto(new.id);
    if v_limite is not null and v_maior is not null and v_maior > v_limite then
      raise exception 'Há tarefas deste projeto com prazo em %, depois da entrega (%). Ajuste os prazos antes.',
        to_char(v_maior, 'DD/MM/YYYY'), to_char(v_limite, 'DD/MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_projeto_valida_datas on public.marketing_projetos;
create trigger marketing_projeto_valida_datas
  before insert or update of data_entrega, portfolio_id on public.marketing_projetos
  for each row execute function public.marketing_projeto_valida_datas();

-- Portfólio: não fica antes dos projetos (nem das tarefas de projetos sem data).
create or replace function public.marketing_portfolio_valida_datas()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_maior date;
begin
  if new.data_entrega is null then
    return new;
  end if;

  select max(pj.data_entrega) into v_maior
    from public.marketing_projetos pj
   where pj.portfolio_id = new.id;
  if v_maior is not null and v_maior > new.data_entrega then
    raise exception 'Há projetos deste portfólio com entrega em %, depois da entrega do portfólio (%). Ajuste os projetos antes.',
      to_char(v_maior, 'DD/MM/YYYY'), to_char(new.data_entrega, 'DD/MM/YYYY');
  end if;

  select max(public.marketing_maior_prazo_projeto(pj.id)) into v_maior
    from public.marketing_projetos pj
   where pj.portfolio_id = new.id and pj.data_entrega is null;
  if v_maior is not null and v_maior > new.data_entrega then
    raise exception 'Há tarefas de projetos sem data neste portfólio com prazo em %, depois da entrega do portfólio (%).',
      to_char(v_maior, 'DD/MM/YYYY'), to_char(new.data_entrega, 'DD/MM/YYYY');
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_portfolio_valida_datas on public.marketing_portfolios;
create trigger marketing_portfolio_valida_datas
  before update of data_entrega on public.marketing_portfolios
  for each row execute function public.marketing_portfolio_valida_datas();

-- Vínculo tarefa → projeto: o prazo da tarefa tem de caber no projeto. -------
create or replace function public.marketing_vinculo_valida_prazo()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_prazo date := public.marketing_prazo_tarefa(new.task_id);
  v_limite date := public.marketing_limite_projeto(new.projeto_id);
begin
  if v_prazo is not null and v_limite is not null and v_prazo > v_limite then
    raise exception 'O prazo da tarefa (%) passa da entrega do projeto (%).',
      to_char(v_prazo, 'DD/MM/YYYY'), to_char(v_limite, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_vinculo_valida_prazo on public.marketing_projeto_tarefas;
create trigger marketing_vinculo_valida_prazo
  before insert or update on public.marketing_projeto_tarefas
  for each row execute function public.marketing_vinculo_valida_prazo();

-- Prazo da tarefa alterado: continua dentro do projeto em que ela está. ------
create or replace function public.marketing_tarefa_valida_prazo()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_prazo date := nullif(left(new.due_date::text, 10), '')::date;
  v_limite date;
begin
  if v_prazo is null then
    return new;
  end if;
  select public.marketing_limite_projeto(l.projeto_id) into v_limite
    from public.marketing_projeto_tarefas l
   where l.task_id::text = new.id::text;
  if v_limite is not null and v_prazo > v_limite then
    raise exception 'O prazo da tarefa (%) passa da entrega do projeto (%).',
      to_char(v_prazo, 'DD/MM/YYYY'), to_char(v_limite, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_tarefa_valida_prazo on public.tasks;
create trigger marketing_tarefa_valida_prazo
  before update of due_date on public.tasks
  for each row
  when (new.due_date is distinct from old.due_date)
  execute function public.marketing_tarefa_valida_prazo();

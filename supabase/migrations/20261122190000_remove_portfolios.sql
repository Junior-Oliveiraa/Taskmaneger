-- =============================================================================
-- Marketing — remove Portfólios
-- -----------------------------------------------------------------------------
-- Projetos passam a gerenciar todas as tarefas; portfólio deixa de existir.
-- A hierarquia de datas fica só: prazo da tarefa <= entrega do projeto.
--
-- Projetos sem data própria que herdavam a entrega do portfólio ficam sem
-- limite. DESTRUTIVA: apaga marketing_portfolios e as tabelas de ligação.
-- =============================================================================

-- Limite do projeto: só a data dele.
create or replace function public.marketing_limite_projeto(p_projeto uuid)
returns date
language sql stable security definer
set search_path = public
as $$
  select pj.data_entrega
    from public.marketing_projetos pj
   where pj.id = p_projeto;
$$;

-- Projeto: entrega não fica antes das tarefas dele.
create or replace function public.marketing_projeto_valida_datas()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_maior date;
begin
  if tg_op = 'UPDATE' and new.data_entrega is not null then
    v_maior := public.marketing_maior_prazo_projeto(new.id);
    if v_maior is not null and v_maior > new.data_entrega then
      raise exception 'Há tarefas deste projeto com prazo em %, depois da entrega (%). Ajuste os prazos antes.',
        to_char(v_maior, 'DD/MM/YYYY'), to_char(new.data_entrega, 'DD/MM/YYYY');
    end if;
  end if;
  return new;
end;
$$;

-- O gatilho olhava portfolio_id: recria só com data_entrega.
drop trigger if exists marketing_projeto_valida_datas on public.marketing_projetos;
create trigger marketing_projeto_valida_datas
  before insert or update of data_entrega on public.marketing_projetos
  for each row execute function public.marketing_projeto_valida_datas();

drop trigger if exists marketing_portfolio_valida_datas on public.marketing_portfolios;
drop function if exists public.marketing_portfolio_valida_datas();

drop index if exists public.marketing_projetos_portfolio_idx;
alter table public.marketing_projetos drop column if exists portfolio_id;

drop table if exists public.marketing_portfolio_membros;
drop table if exists public.marketing_portfolio_empreendimentos;
drop table if exists public.marketing_portfolios;

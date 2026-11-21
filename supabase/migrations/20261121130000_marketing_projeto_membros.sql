-- =============================================================================
-- Marketing — membros dos projetos
-- -----------------------------------------------------------------------------
-- Membros cadastrados em cada projeto. Na tela, quem é responsável por alguma
-- tarefa do projeto também aparece (calculado no app, não gravado aqui).
-- Permissões seguem o módulo "tarefas", como as demais tabelas de projetos.
-- =============================================================================

create table if not exists public.marketing_projeto_membros (
  projeto_id uuid not null references public.marketing_projetos(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (projeto_id, user_id)
);

create index if not exists marketing_projeto_membros_user_idx on public.marketing_projeto_membros (user_id);

alter table public.marketing_projeto_membros enable row level security;
revoke all on public.marketing_projeto_membros from anon;

drop policy if exists ler on public.marketing_projeto_membros;
create policy ler on public.marketing_projeto_membros
  for select to authenticated using ((select public.pode('tarefas', 'ver')));

drop policy if exists inserir on public.marketing_projeto_membros;
create policy inserir on public.marketing_projeto_membros
  for insert to authenticated with check ((select public.pode('tarefas', 'editar')));

drop policy if exists apagar on public.marketing_projeto_membros;
create policy apagar on public.marketing_projeto_membros
  for delete to authenticated using ((select public.pode('tarefas', 'editar')));

do $$
begin
  if to_regprocedure('public.nao_e_consultoria()') is null then
    return;
  end if;
  drop policy if exists somente_leitura_inserir on public.marketing_projeto_membros;
  drop policy if exists somente_leitura_apagar on public.marketing_projeto_membros;
  create policy somente_leitura_inserir on public.marketing_projeto_membros
    as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()));
  create policy somente_leitura_apagar on public.marketing_projeto_membros
    as restrictive for delete to authenticated using ((select public.nao_e_consultoria()));
end;
$$;

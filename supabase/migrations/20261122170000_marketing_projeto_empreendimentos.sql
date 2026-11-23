-- =============================================================================
-- Marketing — um projeto, vários empreendimentos
-- -----------------------------------------------------------------------------
-- Substitui a coluna marketing_projetos.empreendimento_id (um só) por uma
-- tabela de ligação, como a dos membros. O que já estava gravado é copiado.
-- Permissões seguem o módulo "tarefas", como as demais tabelas de projetos.
-- =============================================================================

create table if not exists public.marketing_projeto_empreendimentos (
  projeto_id uuid not null references public.marketing_projetos(id) on delete cascade,
  empreendimento_id text not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (projeto_id, empreendimento_id)
);

create index if not exists marketing_projeto_empreendimentos_emp_idx
  on public.marketing_projeto_empreendimentos (empreendimento_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'marketing_projetos' and column_name = 'empreendimento_id'
  ) then
    insert into public.marketing_projeto_empreendimentos (projeto_id, empreendimento_id)
    select id, empreendimento_id from public.marketing_projetos where empreendimento_id is not null
    on conflict do nothing;
    alter table public.marketing_projetos drop column empreendimento_id;
  end if;
end;
$$;

alter table public.marketing_projeto_empreendimentos enable row level security;
revoke all on public.marketing_projeto_empreendimentos from anon;

drop policy if exists ler on public.marketing_projeto_empreendimentos;
create policy ler on public.marketing_projeto_empreendimentos
  for select to authenticated using ((select public.pode('tarefas', 'ver')));

drop policy if exists inserir on public.marketing_projeto_empreendimentos;
create policy inserir on public.marketing_projeto_empreendimentos
  for insert to authenticated with check ((select public.pode('tarefas', 'editar')));

drop policy if exists apagar on public.marketing_projeto_empreendimentos;
create policy apagar on public.marketing_projeto_empreendimentos
  for delete to authenticated using ((select public.pode('tarefas', 'editar')));

do $$
begin
  if to_regprocedure('public.nao_e_consultoria()') is null then
    return;
  end if;
  drop policy if exists somente_leitura_inserir on public.marketing_projeto_empreendimentos;
  drop policy if exists somente_leitura_apagar on public.marketing_projeto_empreendimentos;
  create policy somente_leitura_inserir on public.marketing_projeto_empreendimentos
    as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()));
  create policy somente_leitura_apagar on public.marketing_projeto_empreendimentos
    as restrictive for delete to authenticated using ((select public.nao_e_consultoria()));
end;
$$;

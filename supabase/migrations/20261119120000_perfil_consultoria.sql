-- =============================================================================
-- Perfil "consultoria": somente leitura
-- -----------------------------------------------------------------------------
-- Vê os módulos que o administrador liberar, mas não altera nada. A trava
-- vale no banco em três camadas:
--   1. a matriz perfis_permissoes não aceita 'editar' para consultoria, então
--      pode()/pode_algum(..., 'editar') e exigir_permissao() sempre recusam;
--   2. pode_algum() também recusa 'editar' para consultoria por dentro, caso a
--      constraint seja removida algum dia;
--   3. toda tabela do schema public com RLS ganha políticas RESTRICTIVE que
--      bloqueiam insert/update/delete para consultoria — cobre também as
--      tabelas sem módulo (chat das propostas, documentos, anexos...).
-- Exceções da camada 3: o próprio perfil (tema e preferências — o trigger
-- protege_campos_perfil continua impedindo trocar perfil/nível), marcar
-- notificações como lidas e marcar leads como vistos.
--
-- Tabelas criadas DEPOIS desta migração não recebem a camada 3 sozinhas:
-- basta rodar de novo o bloco "3." abaixo.
-- =============================================================================

-- ── 1. Perfil e matriz ───────────────────────────────────────────────────────

alter table public.users_profile drop constraint if exists users_profile_perfil_check;
alter table public.users_profile
  add constraint users_profile_perfil_check
  check (perfil in ('administrador', 'master', 'analista', 'assistente', 'financeiro', 'consultoria'));

alter table public.perfis_permissoes drop constraint if exists perfis_permissoes_perfil_check;
alter table public.perfis_permissoes
  add constraint perfis_permissoes_perfil_check
  check (perfil in ('master', 'analista', 'assistente', 'financeiro', 'consultoria'));

alter table public.perfis_permissoes drop constraint if exists perfis_permissoes_consultoria_so_ver;
alter table public.perfis_permissoes
  add constraint perfis_permissoes_consultoria_so_ver
  check (perfil <> 'consultoria' or nivel in ('nenhum', 'ver'));

-- Começa vendo todos os módulos; o administrador tira o que não quiser.
insert into public.perfis_permissoes (perfil, modulo, nivel)
select 'consultoria', m.modulo, 'ver'
  from (values
   ('tarefas'), ('empreendimentos'), ('crm'),
   ('financas'), ('financas_orcamento'),
   ('comercial_movimentos'), ('comercial_propostas'), ('comercial_tabela'), ('comercial_dashboard'),
   ('analytics')
  ) as m(modulo)
on conflict (perfil, modulo) do nothing;

-- ── 2. pode_algum: consultoria nunca edita ───────────────────────────────────

create or replace function public.pode_algum(p_modulos text[], p_nivel text default 'ver')
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select case
      when u.perfil = 'administrador' then true
      when u.perfil = 'consultoria' and p_nivel <> 'ver' then false
      else exists (
        select 1 from public.perfis_permissoes pp
         where pp.perfil = u.perfil
           and pp.modulo = any (p_modulos)
           and (pp.nivel = 'editar' or (p_nivel = 'ver' and pp.nivel = 'ver'))
      )
    end
    from public.users_profile u
   where u.id = auth.uid()
  ), false);
$$;

create or replace function public.nao_e_consultoria()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select perfil <> 'consultoria' from public.users_profile where id = auth.uid()), true);
$$;

revoke execute on function public.nao_e_consultoria() from public, anon;
grant execute on function public.nao_e_consultoria() to authenticated;

-- ── 3. Bloqueio de escrita em todas as tabelas ───────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select c.relname as tabela
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
       and c.relname not in ('users_profile', 'notifications', 'crm_meta_leads_vistos')
  loop
    execute format('drop policy if exists somente_leitura_inserir on public.%I', r.tabela);
    execute format('drop policy if exists somente_leitura_alterar on public.%I', r.tabela);
    execute format('drop policy if exists somente_leitura_apagar on public.%I', r.tabela);

    execute format(
      'create policy somente_leitura_inserir on public.%I as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()))',
      r.tabela);
    execute format(
      'create policy somente_leitura_alterar on public.%I as restrictive for update to authenticated using ((select public.nao_e_consultoria())) with check ((select public.nao_e_consultoria()))',
      r.tabela);
    execute format(
      'create policy somente_leitura_apagar on public.%I as restrictive for delete to authenticated using ((select public.nao_e_consultoria()))',
      r.tabela);
  end loop;
end;
$$;

-- Anexos e arquivos (storage): pode baixar, não pode enviar/trocar/apagar.
drop policy if exists somente_leitura_inserir on storage.objects;
create policy somente_leitura_inserir on storage.objects
  as restrictive for insert to authenticated
  with check ((select public.nao_e_consultoria()));
drop policy if exists somente_leitura_alterar on storage.objects;
create policy somente_leitura_alterar on storage.objects
  as restrictive for update to authenticated
  using ((select public.nao_e_consultoria()))
  with check ((select public.nao_e_consultoria()));
drop policy if exists somente_leitura_apagar on storage.objects;
create policy somente_leitura_apagar on storage.objects
  as restrictive for delete to authenticated
  using ((select public.nao_e_consultoria()));

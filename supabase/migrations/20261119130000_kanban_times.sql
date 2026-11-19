-- =============================================================================
-- Quadro Kanban — times
-- -----------------------------------------------------------------------------
-- O quadro de tarefas passa a ser organizado por times. Uma pessoa pode estar
-- em mais de um time. Quem não está em nenhum time fica fora do quadro: não
-- aparece no filtro de responsáveis e as tarefas dela não são exibidas.
-- (Enquanto nenhum time existir, o quadro continua mostrando todo mundo.)
--
-- Todos os usuários logados leem os times (o filtro depende deles); só o
-- administrador e o master criam, renomeiam, apagam e montam os times.
-- =============================================================================

create table if not exists public.kanban_times (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kanban_time_membros (
  time_id uuid not null references public.kanban_times(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (time_id, user_id)
);

create index if not exists kanban_time_membros_user_idx on public.kanban_time_membros (user_id);

alter table public.kanban_times enable row level security;
alter table public.kanban_time_membros enable row level security;
revoke all on public.kanban_times from anon;
revoke all on public.kanban_time_membros from anon;

-- kanban_times
drop policy if exists kanban_times_select on public.kanban_times;
create policy kanban_times_select on public.kanban_times
  for select to authenticated using (true);

drop policy if exists kanban_times_insert on public.kanban_times;
create policy kanban_times_insert on public.kanban_times
  for insert to authenticated with check ((select public.is_permission_level_1()));

drop policy if exists kanban_times_update on public.kanban_times;
create policy kanban_times_update on public.kanban_times
  for update to authenticated
  using ((select public.is_permission_level_1()))
  with check ((select public.is_permission_level_1()));

drop policy if exists kanban_times_delete on public.kanban_times;
create policy kanban_times_delete on public.kanban_times
  for delete to authenticated using ((select public.is_permission_level_1()));

-- kanban_time_membros
drop policy if exists kanban_time_membros_select on public.kanban_time_membros;
create policy kanban_time_membros_select on public.kanban_time_membros
  for select to authenticated using (true);

drop policy if exists kanban_time_membros_insert on public.kanban_time_membros;
create policy kanban_time_membros_insert on public.kanban_time_membros
  for insert to authenticated with check ((select public.is_permission_level_1()));

drop policy if exists kanban_time_membros_delete on public.kanban_time_membros;
create policy kanban_time_membros_delete on public.kanban_time_membros
  for delete to authenticated using ((select public.is_permission_level_1()));

-- Camada "somente leitura" do perfil consultoria (migração perfil_consultoria):
-- tabelas novas não a recebem sozinhas.
do $$
declare
  t text;
begin
  if to_regprocedure('public.nao_e_consultoria()') is null then
    return;
  end if;
  foreach t in array array['kanban_times', 'kanban_time_membros'] loop
    execute format('drop policy if exists somente_leitura_inserir on public.%I', t);
    execute format('drop policy if exists somente_leitura_alterar on public.%I', t);
    execute format('drop policy if exists somente_leitura_apagar on public.%I', t);
    execute format(
      'create policy somente_leitura_inserir on public.%I as restrictive for insert to authenticated with check ((select public.nao_e_consultoria()))', t);
    execute format(
      'create policy somente_leitura_alterar on public.%I as restrictive for update to authenticated using ((select public.nao_e_consultoria())) with check ((select public.nao_e_consultoria()))', t);
    execute format(
      'create policy somente_leitura_apagar on public.%I as restrictive for delete to authenticated using ((select public.nao_e_consultoria()))', t);
  end loop;
end;
$$;

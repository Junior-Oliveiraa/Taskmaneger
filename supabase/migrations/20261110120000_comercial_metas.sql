-- =============================================================================
-- Comercial — metas de VGV por empreendimento e por mês
-- -----------------------------------------------------------------------------
-- Editadas na aba Comercial > Dashboard > Metas e lidas pelo painel Desempenho.
-- Só a Meta é guardada: a Super Meta é sempre Meta × fator_super (1,5 hoje).
-- Faixas de atingimento (realizado ÷ meta): Sub Meta < 1; Meta de 1 até menos
-- que o fator; Super Meta a partir do fator.
--
-- O empreendimento da meta tem nome próprio (o da planilha) e, opcionalmente, o
-- id do empreendimento no CV CRM. Sem id, o painel casa pelo nome.
--
-- A carga inicial (out/2026 a dez/2027) usa "on conflict do nothing": reaplicar
-- a migration nunca desfaz o que foi editado na tela.
-- =============================================================================

create table if not exists public.comercial_metas_empreendimentos (
  nome text primary key check (btrim(nome) <> ''),
  ordem integer not null default 0,
  cv_idempreendimento bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.comercial_metas (
  empreendimento text not null
    references public.comercial_metas_empreendimentos(nome) on update cascade on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  valor numeric not null check (valor >= 0),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (empreendimento, mes)
);

create index if not exists comercial_metas_mes_idx on public.comercial_metas (mes);

create table if not exists public.comercial_metas_config (
  id text primary key default 'default' check (id = 'default'),
  fator_super numeric not null default 1.5 check (fator_super > 1),
  updated_at timestamptz not null default now()
);

insert into public.comercial_metas_config (id) values ('default') on conflict do nothing;

-- ── Acesso: mesmo modelo das propostas (todo usuário logado edita) ──────────

alter table public.comercial_metas_empreendimentos enable row level security;
alter table public.comercial_metas enable row level security;
alter table public.comercial_metas_config enable row level security;

revoke all on public.comercial_metas_empreendimentos, public.comercial_metas, public.comercial_metas_config from anon;

drop policy if exists "auth_all_comercial_metas_empreendimentos" on public.comercial_metas_empreendimentos;
create policy "auth_all_comercial_metas_empreendimentos" on public.comercial_metas_empreendimentos
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_comercial_metas" on public.comercial_metas;
create policy "auth_all_comercial_metas" on public.comercial_metas
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_select_comercial_metas_config" on public.comercial_metas_config;
create policy "auth_select_comercial_metas_config" on public.comercial_metas_config
  for select to authenticated using (true);
drop policy if exists "auth_update_comercial_metas_config" on public.comercial_metas_config;
create policy "auth_update_comercial_metas_config" on public.comercial_metas_config
  for update to authenticated using (true) with check (true);

create or replace function public.comercial_metas_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'comercial_metas' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists comercial_metas_touch on public.comercial_metas;
create trigger comercial_metas_touch
  before update on public.comercial_metas
  for each row execute function public.comercial_metas_touch();

drop trigger if exists comercial_metas_config_touch on public.comercial_metas_config;
create trigger comercial_metas_config_touch
  before update on public.comercial_metas_config
  for each row execute function public.comercial_metas_touch();

-- Tempo real: o app invalida a query 'comercialMetas' ao receber estes eventos.
drop trigger if exists broadcast_comercial_metas_changes on public.comercial_metas;
create trigger broadcast_comercial_metas_changes
  after insert or update or delete on public.comercial_metas
  for each row execute function public.broadcast_row_change('sienge-changes');

drop trigger if exists broadcast_comercial_metas_empreendimentos_changes on public.comercial_metas_empreendimentos;
create trigger broadcast_comercial_metas_empreendimentos_changes
  after insert or update or delete on public.comercial_metas_empreendimentos
  for each row execute function public.broadcast_row_change('sienge-changes');

drop trigger if exists broadcast_comercial_metas_config_changes on public.comercial_metas_config;
create trigger broadcast_comercial_metas_config_changes
  after insert or update or delete on public.comercial_metas_config
  for each row execute function public.broadcast_row_change('sienge-changes');

-- ── Carga inicial: planilhas de metas 2026 (4º tri) e 2027 ─────────────────

insert into public.comercial_metas_empreendimentos (nome, ordem) values
  ('Rivage', 1), ('Botanic', 2), ('Gênova', 3), ('Flow', 4), ('Alvor', 5),
  ('Corinthians', 6), ('Corporate', 7), ('Conchas', 8), ('Vivenda', 9),
  ('Green Park', 10), ('Martin', 11), ('Alicante', 12)
on conflict do nothing;

insert into public.comercial_metas (empreendimento, mes, valor, updated_by)
select empreendimento, mes::date, valor, null
from (values
  -- 2026
  ('Rivage', '2026-10-01', 6150000), ('Rivage', '2026-11-01', 6150000), ('Rivage', '2026-12-01', 6150000),
  ('Botanic', '2026-12-01', 4500000),
  ('Gênova', '2026-10-01', 1650000), ('Gênova', '2026-11-01', 1650000), ('Gênova', '2026-12-01', 1650000),
  ('Flow', '2026-10-01', 3745000), ('Flow', '2026-11-01', 3745000), ('Flow', '2026-12-01', 3745000),
  ('Vivenda', '2026-10-01', 50000), ('Vivenda', '2026-11-01', 50000), ('Vivenda', '2026-12-01', 50000),
  ('Green Park', '2026-12-01', 700000),
  ('Martin', '2026-11-01', 1000000),
  ('Alicante', '2026-10-01', 420000),
  -- 2027
  ('Rivage', '2027-01-01', 6150000), ('Rivage', '2027-02-01', 6150000), ('Rivage', '2027-03-01', 6150000),
  ('Rivage', '2027-04-01', 6150000), ('Rivage', '2027-05-01', 6150000), ('Rivage', '2027-06-01', 6150000),
  ('Rivage', '2027-07-01', 3075000), ('Rivage', '2027-08-01', 3075000), ('Rivage', '2027-09-01', 3075000),
  ('Rivage', '2027-10-01', 3075000), ('Rivage', '2027-11-01', 3075000), ('Rivage', '2027-12-01', 3075000),
  ('Botanic', '2027-03-01', 4500000), ('Botanic', '2027-06-01', 4500000),
  ('Botanic', '2027-09-01', 5000000), ('Botanic', '2027-12-01', 5000000),
  ('Gênova', '2027-01-01', 1650000), ('Gênova', '2027-02-01', 1650000), ('Gênova', '2027-03-01', 1650000),
  ('Gênova', '2027-04-01', 1650000), ('Gênova', '2027-05-01', 1650000), ('Gênova', '2027-06-01', 1650000),
  ('Gênova', '2027-07-01', 1650000), ('Gênova', '2027-08-01', 1650000), ('Gênova', '2027-09-01', 1650000),
  ('Gênova', '2027-10-01', 1650000), ('Gênova', '2027-11-01', 1650000), ('Gênova', '2027-12-01', 1650000),
  ('Flow', '2027-01-01', 3745000), ('Flow', '2027-02-01', 3745000), ('Flow', '2027-03-01', 3745000),
  ('Flow', '2027-04-01', 3745000), ('Flow', '2027-05-01', 3745000), ('Flow', '2027-06-01', 3745000),
  ('Flow', '2027-07-01', 3745000), ('Flow', '2027-08-01', 3745000), ('Flow', '2027-09-01', 3745000),
  ('Flow', '2027-10-01', 3745000), ('Flow', '2027-11-01', 3745000), ('Flow', '2027-12-01', 3745000),
  ('Alvor', '2027-03-01', 5700000), ('Alvor', '2027-04-01', 5700000), ('Alvor', '2027-05-01', 5700000),
  ('Alvor', '2027-06-01', 5700000), ('Alvor', '2027-07-01', 5700000), ('Alvor', '2027-08-01', 5700000),
  ('Alvor', '2027-09-01', 2850000), ('Alvor', '2027-10-01', 2850000), ('Alvor', '2027-11-01', 2850000),
  ('Alvor', '2027-12-01', 2850000),
  ('Corinthians', '2027-07-01', 8640000), ('Corinthians', '2027-08-01', 8640000), ('Corinthians', '2027-09-01', 8640000),
  ('Corinthians', '2027-10-01', 8640000), ('Corinthians', '2027-11-01', 8640000), ('Corinthians', '2027-12-01', 8640000),
  ('Corporate', '2027-10-01', 16200000), ('Corporate', '2027-11-01', 16200000), ('Corporate', '2027-12-01', 16200000),
  ('Vivenda', '2027-01-01', 50000), ('Vivenda', '2027-02-01', 50000), ('Vivenda', '2027-03-01', 50000),
  ('Vivenda', '2027-04-01', 50000), ('Vivenda', '2027-05-01', 50000), ('Vivenda', '2027-06-01', 50000),
  ('Vivenda', '2027-07-01', 50000), ('Vivenda', '2027-08-01', 50000), ('Vivenda', '2027-09-01', 50000),
  ('Vivenda', '2027-10-01', 50000), ('Vivenda', '2027-11-01', 50000), ('Vivenda', '2027-12-01', 50000),
  ('Green Park', '2027-03-01', 700000), ('Green Park', '2027-06-01', 700000),
  ('Green Park', '2027-09-01', 700000), ('Green Park', '2027-12-01', 700000),
  ('Martin', '2027-02-01', 1000000)
) as v(empreendimento, mes, valor)
on conflict do nothing;

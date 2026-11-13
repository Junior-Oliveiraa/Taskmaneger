-- =============================================================================
-- VSO mensal: foto do estoque do CV CRM no fechamento de cada mês
-- -----------------------------------------------------------------------------
-- VSO do mês = vendas líquidas do mês ÷ estoque do mês, onde
--   vendas líquidas  = vendas com data no mês − distratos com data no mês;
--   estoque do mês   = estoque do fechamento (disponíveis + reservadas)
--                      + vendas líquidas do mês (o que estava à venda no dia 1).
--
-- As vendas e os distratos têm data no CV e podem ser recontados a qualquer
-- momento. O estoque não: cv_comercial_unidades é sobrescrita a cada sync. Por
-- isso guardamos aqui a situação de cada unidade no último dia do mês, e o
-- painel calcula o VSO a partir desta foto, com as mesmas regras do resto da
-- tela (permuta, unidades fora da tabela do Orbit etc.).
--
-- `mes` = primeiro dia do mês fechado. O pg_cron roda às 00:20 de Brasília do
-- dia 1, logo depois do sync das 00:07: a foto é a posição do fim do último dia.
-- =============================================================================

create table if not exists public.cv_comercial_unidades_fechamento (
  mes date not null check (extract(day from mes) = 1),
  idunidade bigint not null,
  idempreendimento bigint not null,
  empreendimento text not null,
  unidade text not null,
  situacao text not null,
  motivo_bloqueio text,
  fotografado_em timestamptz not null default now(),
  primary key (mes, idunidade)
);

create index if not exists cv_comercial_unidades_fechamento_mes_idx
  on public.cv_comercial_unidades_fechamento (mes);

alter table public.cv_comercial_unidades_fechamento enable row level security;

revoke all on public.cv_comercial_unidades_fechamento from public, anon, authenticated;
grant select on public.cv_comercial_unidades_fechamento to authenticated;

drop policy if exists "auth_select_cv_comercial_unidades_fechamento" on public.cv_comercial_unidades_fechamento;
create policy "auth_select_cv_comercial_unidades_fechamento" on public.cv_comercial_unidades_fechamento
  for select to authenticated using (true);

-- Refaz a foto do mês (idempotente): apaga a anterior e copia a posição atual.
create or replace function public.cv_comercial_fotografar_estoque(p_mes date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  n integer;
begin
  delete from public.cv_comercial_unidades_fechamento where mes = v_mes;

  insert into public.cv_comercial_unidades_fechamento
    (mes, idunidade, idempreendimento, empreendimento, unidade, situacao, motivo_bloqueio)
  select v_mes, u.idunidade, u.idempreendimento, u.empreendimento, u.unidade, u.situacao, u.motivo_bloqueio
  from public.cv_comercial_unidades u;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.cv_comercial_fotografar_estoque(date) from public, anon, authenticated;
grant execute on function public.cv_comercial_fotografar_estoque(date) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'cv-comercial-fechamento-estoque';

-- 03:20 UTC = 00:20 em Brasília, no dia 1: fotografa o mês que acabou de fechar.
select cron.schedule(
  'cv-comercial-fechamento-estoque',
  '20 3 1 * *',
  $$ select public.cv_comercial_fotografar_estoque(((now() at time zone 'America/Sao_Paulo')::date - 1)); $$
);

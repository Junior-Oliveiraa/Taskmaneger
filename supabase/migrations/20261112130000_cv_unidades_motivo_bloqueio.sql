-- Motivo do bloqueio da unidade no CV CRM (mapa de disponibilidade).
-- O CV não tem situação "permuta": a permuta vem como bloqueada com motivo
-- "Permutante", e o painel Desempenho separa as duas a partir daqui.
alter table public.cv_comercial_unidades
  add column if not exists motivo_bloqueio text;

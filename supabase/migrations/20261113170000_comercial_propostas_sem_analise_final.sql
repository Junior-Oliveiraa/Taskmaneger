-- =============================================================================
-- Comercial — propostas: remove a etapa "Análise final"
-- -----------------------------------------------------------------------------
-- O fluxo de decisão (em análise → venda | contra proposta | perdido) tornou a
-- etapa sem uso. Se alguma proposta ainda estiver nela, volta para "Propostas
-- em análise", que é onde o gestor decide.
-- =============================================================================

update public.comercial_propostas
   set etapa = 'em_analise'
 where etapa = 'analise_final';

alter table public.comercial_propostas
  drop constraint if exists comercial_propostas_etapa_check;
alter table public.comercial_propostas
  add constraint comercial_propostas_etapa_check
  check (etapa in ('visita', 'realizada', 'em_analise', 'contra_proposta', 'venda', 'perdido'));

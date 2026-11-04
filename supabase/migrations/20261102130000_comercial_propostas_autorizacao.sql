-- =============================================================================
-- Comercial — autorização da proposta de compra e venda
-- -----------------------------------------------------------------------------
-- Dados da ficha "Autorização Proposta de Compra e Venda" (torre, valores, fluxo
-- de parcelas...). Só o que é digitado fica aqui: totais, percentuais e valores
-- por m² são sempre calculados na tela. Null nas propostas antigas, que têm só o
-- texto livre em fluxo_pagamento.
-- =============================================================================

alter table public.comercial_propostas
  add column if not exists autorizacao jsonb;

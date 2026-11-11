-- Tipo de financiamento da reserva (Caixa / Banco privado), derivado pela
-- `cvcrm-sync` das séries ativas da condição de pagamento no CV CRM.
-- Aplicar ANTES de publicar a nova versão da função, que já grava a coluna.
alter table public.cv_comercial_reservas add column if not exists financiamento text;

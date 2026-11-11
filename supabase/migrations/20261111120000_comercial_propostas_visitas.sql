-- Comercial — propostas: nova etapa "visitas", antes de "realizada".
--
--   visita → realizada → em_analise → contra_proposta → analise_final → venda
--
-- O default continua 'realizada': lançar uma proposta segue caindo em
-- "Propostas realizadas"; a coluna de visitas é alimentada movendo o card.

alter table public.comercial_propostas
  drop constraint if exists comercial_propostas_etapa_check;

alter table public.comercial_propostas
  add constraint comercial_propostas_etapa_check
  check (etapa in ('visita', 'realizada', 'em_analise', 'contra_proposta', 'analise_final', 'venda'));

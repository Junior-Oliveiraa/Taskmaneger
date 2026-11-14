-- Comercial — a etapa "Propostas realizadas" passa a se chamar só "Propostas"
-- (mesmo rótulo da coluna do Kanban, src/lib/comercialApi.ts).
create or replace function public.comercial_etapa_label(p text)
returns text
language sql immutable
as $$
  select case p
    when 'visita' then 'Visitas'
    when 'realizada' then 'Propostas'
    when 'em_analise' then 'Propostas em análise'
    when 'contra_proposta' then 'Contra proposta'
    when 'analise_final' then 'Análise final'
    when 'venda' then 'Venda'
    when 'perdido' then 'Perdido/cancelado'
    else p end;
$$;

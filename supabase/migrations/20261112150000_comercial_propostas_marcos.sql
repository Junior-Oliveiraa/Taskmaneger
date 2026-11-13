-- =============================================================================
-- Comercial — propostas: datas de marco para o mini dashboard
-- -----------------------------------------------------------------------------
-- A proposta só guardava a etapa atual, então não dava para saber QUANDO ela
-- virou visita ou proposta. Duas datas (fuso de Brasília) resolvem isso:
--
--   visita_em    entrou na coluna "Visitas". Mover o card para lá reabre o ciclo:
--                grava a data de hoje e limpa proposta_em (voltou a ser visita).
--   proposta_em  entrou numa etapa de proposta (realizada em diante) vindo de
--                visita, ou nasceu já como proposta (= enviada_em).
--
-- Conversões, por safra do período:
--   visitas → propostas   visita_em no período  e etapa <> 'visita'
--   propostas → vendas    proposta_em no período e etapa  = 'venda'
--
-- Quem grava é o trigger: a tela não manda estas colunas.
-- =============================================================================

alter table public.comercial_propostas
  add column if not exists visita_em date,
  add column if not exists proposta_em date;

-- Histórico (antes do trigger, que travaria estas colunas): sem o registro das
-- movimentações, o melhor palpite. Visitas que já avançaram antes desta
-- migration não têm como ser recuperadas.
update public.comercial_propostas
   set visita_em = (updated_at at time zone 'America/Sao_Paulo')::date
 where etapa = 'visita' and visita_em is null;

update public.comercial_propostas
   set proposta_em = enviada_em
 where etapa <> 'visita' and proposta_em is null;

create or replace function public.comercial_propostas_marcos()
returns trigger
language plpgsql
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'INSERT' then
    if new.etapa = 'visita' then
      new.visita_em := coalesce(new.enviada_em, v_hoje);
      new.proposta_em := null;
    else
      new.visita_em := null;
      new.proposta_em := coalesce(new.enviada_em, v_hoje);
    end if;
    return new;
  end if;

  -- UPDATE: o cliente não altera os marcos diretamente.
  new.visita_em := old.visita_em;
  new.proposta_em := old.proposta_em;

  if new.etapa is distinct from old.etapa then
    if new.etapa = 'visita' then
      new.visita_em := v_hoje;
      new.proposta_em := null;
    elsif new.proposta_em is null then
      new.proposta_em := v_hoje;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comercial_propostas_marcos on public.comercial_propostas;
create trigger comercial_propostas_marcos
  before insert or update on public.comercial_propostas
  for each row execute function public.comercial_propostas_marcos();

create index if not exists comercial_propostas_visita_em_idx on public.comercial_propostas (visita_em);
create index if not exists comercial_propostas_proposta_em_idx on public.comercial_propostas (proposta_em);

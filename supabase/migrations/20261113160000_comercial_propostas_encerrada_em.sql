-- =============================================================================
-- Comercial — propostas: data de encerramento
-- -----------------------------------------------------------------------------
-- O relógio do card conta o tempo desde o cadastro. Ao chegar em Venda ou em
-- Perdido/cancelado a negociação terminou: encerrada_em congela o relógio e
-- passa a mostrar quanto tempo a negociação levou. Reabrir a proposta (voltar a
-- uma etapa em aberto) limpa a data e o relógio volta a correr.
-- Quem grava é o trigger; o cliente não altera esta coluna.
-- =============================================================================

alter table public.comercial_propostas
  add column if not exists encerrada_em timestamptz;

-- Já encerradas: o último evento de etapa na conversa; sem ele, a última alteração.
update public.comercial_propostas p
   set encerrada_em = coalesce(
         (select max(m.created_at) from public.comercial_propostas_mensagens m
           where m.proposta_id = p.id and m.tipo = 'evento'),
         p.updated_at)
 where p.etapa in ('venda', 'perdido') and p.encerrada_em is null;

create or replace function public.comercial_propostas_encerramento()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.encerrada_em := case when new.etapa in ('venda', 'perdido') then now() else null end;
    return new;
  end if;

  new.encerrada_em := old.encerrada_em;
  if new.etapa is distinct from old.etapa then
    if new.etapa in ('venda', 'perdido') then
      -- Venda ↔ perdido conta como novo encerramento.
      new.encerrada_em := now();
    else
      new.encerrada_em := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comercial_propostas_encerramento on public.comercial_propostas;
create trigger comercial_propostas_encerramento
  before insert or update on public.comercial_propostas
  for each row execute function public.comercial_propostas_encerramento();

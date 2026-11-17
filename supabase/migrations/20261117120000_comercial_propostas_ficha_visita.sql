-- =============================================================================
-- Comercial — propostas: ficha da visita
-- -----------------------------------------------------------------------------
-- A coluna "Visitas" passa a ter cadastro próprio: o cliente que visitou um dos
-- pontos de atendimento (Casa Uchôa, Stand Gênova, Escritório Central).
--
--   enviada_em   dia da visita (o trigger de marcos copia para visita_em)
--   cliente      nome de quem visitou
--   project_id   empreendimento de interesse; NULO = visita generalista
--                (veio conhecer todos). Só a etapa Visitas aceita nulo: para
--                virar proposta o empreendimento precisa estar definido.
--   corretor     quem atendeu (pode ficar em branco)
--   visita       jsonb com o resto da ficha:
--                  local, hora (HH:MM), interesse ('especifico' | 'geral'),
--                  profissao, ondeMora, idade, estadoCivil, observacao
--
-- Também:
--   * corrigir o dia de uma visita que ainda está em Visitas atualiza visita_em;
--   * editar a ficha segue a regra da edição (responsável ou Diretor) e vira o
--     evento "editou a visita" na conversa.
-- =============================================================================

alter table public.comercial_propostas
  add column if not exists visita jsonb;

alter table public.comercial_propostas
  alter column project_id drop not null;

alter table public.comercial_propostas
  drop constraint if exists comercial_propostas_projeto_fora_de_visita;
alter table public.comercial_propostas
  add constraint comercial_propostas_projeto_fora_de_visita
  check (project_id is not null or etapa = 'visita');

-- ── Marcos: o dia da visita pode ser corrigido enquanto ela é visita ─────────

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
  elsif new.etapa = 'visita' and new.enviada_em is distinct from old.enviada_em then
    new.visita_em := new.enviada_em;
  end if;
  return new;
end;
$$;

-- ── Edição: a ficha da visita entra na regra ─────────────────────────────────

create or replace function public.comercial_propostas_edicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_permission_level_1() then
    return new;
  end if;

  if (new.autorizacao, new.cliente, new.corretor, new.imobiliaria, new.fluxo_pagamento, new.anexos,
      new.project_id, new.unidade_id, new.unidade, new.enviada_em, new.visita)
     is distinct from
     (old.autorizacao, old.cliente, old.corretor, old.imobiliaria, old.fluxo_pagamento, old.anexos,
      old.project_id, old.unidade_id, old.unidade, old.enviada_em, old.visita) then
    if old.etapa not in ('visita', 'realizada', 'contra_proposta') then
      raise exception 'Em "%" só o Diretor edita a proposta.', public.comercial_etapa_label(old.etapa)
        using errcode = '42501';
    end if;
    if old.responsavel_id is distinct from auth.uid() then
      raise exception 'Só o responsável pela proposta (ou o Diretor) pode editar.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ── Eventos: "editou a visita" ───────────────────────────────────────────────

create or replace function public.comercial_propostas_eventos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text;
  v_resp text;
begin
  if new.etapa is distinct from old.etapa then
    v_texto := case
      when old.etapa = 'realizada'       and new.etapa = 'em_analise'      then 'enviou a proposta para aprovação'
      when old.etapa = 'em_analise'      and new.etapa = 'venda'           then 'aprovou a proposta'
      when old.etapa = 'em_analise'      and new.etapa = 'contra_proposta' then 'fez uma contra proposta'
      when old.etapa = 'contra_proposta' and new.etapa = 'em_analise'      then 'enviou a proposta novamente para aprovação'
      when old.etapa = 'contra_proposta' and new.etapa = 'venda'           then 'aprovou a contra proposta'
      when new.etapa = 'perdido'                                           then 'recusou a proposta'
      else format('moveu de %s para %s', public.comercial_etapa_label(old.etapa), public.comercial_etapa_label(new.etapa))
    end;
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo) values (new.id, v_texto, 'evento');
  end if;

  if (new.autorizacao, new.cliente, new.corretor, new.imobiliaria, new.project_id, new.unidade_id, new.anexos)
     is distinct from (old.autorizacao, old.cliente, old.corretor, old.imobiliaria, old.project_id, old.unidade_id, old.anexos) then
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo)
      values (new.id, case when new.etapa = 'visita' then 'editou a visita' else 'editou a proposta' end, 'evento');
  elsif (new.visita, new.enviada_em) is distinct from (old.visita, old.enviada_em) then
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo) values (new.id, 'editou a visita', 'evento');
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    select coalesce(nullif(btrim(name), ''), email) into v_resp from public.users_profile where id = new.responsavel_id;
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo)
      values (new.id, case when v_resp is null then 'removeu o responsável' else format('definiu %s como responsável', v_resp) end, 'evento');
  end if;
  return null;
end;
$$;

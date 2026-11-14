-- =============================================================================
-- Comercial — propostas: quem edita em cada etapa
-- -----------------------------------------------------------------------------
--   Visitas · Propostas realizadas · Contra proposta  → responsável ou Diretor
--   Em análise · Venda · Perdido/cancelado            → só o Diretor
--
-- Diretor = perfil master ou administrador (is_permission_level_1). "Editar"
-- é mudar o conteúdo da proposta: ficha/fluxo, cliente, corretor, imobiliária,
-- empreendimento, unidade e anexos. Mudar etapa, responsável e aprovação de
-- desconto segue as regras próprias de cada um.
--
-- Também:
--   * cada edição vira o evento "editou a proposta" na conversa;
--   * na Contra proposta o responsável pode editar o fluxo, então a proposta
--     pode ficar ali com desconto aguardando aprovação (antes só visita,
--     realizada e perdido aceitavam desconto pendente/recusado).
-- =============================================================================

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
      new.project_id, new.unidade_id, new.unidade, new.enviada_em)
     is distinct from
     (old.autorizacao, old.cliente, old.corretor, old.imobiliaria, old.fluxo_pagamento, old.anexos,
      old.project_id, old.unidade_id, old.unidade, old.enviada_em) then
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

drop trigger if exists comercial_propostas_edicao on public.comercial_propostas;
create trigger comercial_propostas_edicao
  before update on public.comercial_propostas
  for each row execute function public.comercial_propostas_edicao();

-- Evento "editou a proposta" na conversa.
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
      when old.etapa = 'contra_proposta' and new.etapa = 'em_analise'      then 'enviou uma tréplica para aprovação'
      when new.etapa = 'perdido'                                           then 'recusou a proposta'
      else format('moveu de %s para %s', public.comercial_etapa_label(old.etapa), public.comercial_etapa_label(new.etapa))
    end;
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo) values (new.id, v_texto, 'evento');
  end if;

  if (new.autorizacao, new.cliente, new.corretor, new.imobiliaria, new.project_id, new.unidade_id, new.anexos)
     is distinct from (old.autorizacao, old.cliente, old.corretor, old.imobiliaria, old.project_id, old.unidade_id, old.anexos) then
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo) values (new.id, 'editou a proposta', 'evento');
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    select coalesce(nullif(btrim(name), ''), email) into v_resp from public.users_profile where id = new.responsavel_id;
    insert into public.comercial_propostas_mensagens (proposta_id, texto, tipo)
      values (new.id, case when v_resp is null then 'removeu o responsável' else format('definiu %s como responsável', v_resp) end, 'evento');
  end if;
  return null;
end;
$$;

-- Desconto pendente/recusado: contra proposta passa a aceitar (o responsável edita ali).
create or replace function public.comercial_propostas_desconto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Sem usuário (service_role, cron) conta como gestor.
  v_gestor     boolean := auth.uid() is null or public.is_permission_level_1();
  v_nome       text;
  v_contratado numeric;
  v_ref        numeric;
  v_desc       numeric;
  v_lim        numeric;
begin
  select coalesce(nullif(btrim(name), ''), email) into v_nome from public.users_profile where id = auth.uid();

  if tg_op = 'INSERT'
     or new.autorizacao is distinct from old.autorizacao
     or new.unidade_id is distinct from old.unidade_id
     or new.project_id is distinct from old.project_id then
    -- Recalcula do zero: o que o cliente mandou nestas colunas é ignorado.
    new.aprovacao_por := null;
    new.aprovacao_por_nome := null;
    new.aprovacao_em := null;
    new.aprovacao_obs := null;

    if new.autorizacao is null then
      new.desconto_pct := null;
      new.desconto_limite_pct := null;
      new.aprovacao := 'dispensada';
    else
      select coalesce(sum(round(coalesce((p ->> 'quantidade')::numeric, 0) * coalesce((p ->> 'valorUnitario')::numeric, 0), 2)), 0)
        into v_contratado
        from jsonb_array_elements(coalesce(new.autorizacao -> 'parcelas', '[]'::jsonb)) as p;

      -- Referência: o valor da unidade na Tabela de Vendas; sem unidade, o da ficha.
      select nullif(valor_tabela, 0) into v_ref from public.sienge_tabela_vendas where id = new.unidade_id;
      v_ref := coalesce(v_ref, nullif((new.autorizacao ->> 'valorTabela')::numeric, 0));

      v_desc := case when v_ref > 0 then greatest(0, round((1 - v_contratado / v_ref) * 100, 4)) else 0 end;
      v_lim := public.comercial_limite_desconto(new.project_id);
      new.desconto_pct := v_desc;
      new.desconto_limite_pct := v_lim;

      -- Folga de 0,0001 p.p. para o arredondamento dos centavos.
      if v_desc <= v_lim + 0.0001 then
        new.aprovacao := 'dispensada';
      elsif v_gestor then
        new.aprovacao := 'aprovada';
        new.aprovacao_por := auth.uid();
        new.aprovacao_por_nome := v_nome;
        new.aprovacao_em := now();
        new.aprovacao_obs := 'Lançada por gestor';
      else
        new.aprovacao := 'pendente';
      end if;
    end if;

  elsif new.aprovacao is distinct from old.aprovacao then
    if not v_gestor then
      raise exception 'Só o gestor (perfil master) aprova ou recusa desconto acima do limite.' using errcode = '42501';
    end if;
    if old.aprovacao = 'dispensada' or new.aprovacao = 'dispensada' then
      raise exception 'Esta proposta está dentro do limite de desconto e não passa por aprovação.' using errcode = '22023';
    end if;
    new.aprovacao_por := case when new.aprovacao = 'pendente' then null else auth.uid() end;
    new.aprovacao_por_nome := case when new.aprovacao = 'pendente' then null else v_nome end;
    new.aprovacao_em := case when new.aprovacao = 'pendente' then null else now() end;
    new.aprovacao_obs := nullif(btrim(coalesce(new.aprovacao_obs, '')), '');
    new.desconto_pct := old.desconto_pct;
    new.desconto_limite_pct := old.desconto_limite_pct;

  else
    -- Nada de aprovação mudou: estas colunas não são editáveis pelo cliente.
    new.desconto_pct := old.desconto_pct;
    new.desconto_limite_pct := old.desconto_limite_pct;
    new.aprovacao_por := old.aprovacao_por;
    new.aprovacao_por_nome := old.aprovacao_por_nome;
    new.aprovacao_em := old.aprovacao_em;
    new.aprovacao_obs := old.aprovacao_obs;
  end if;

  -- Sem aprovação, a proposta não passa de "Propostas realizadas".
  if new.aprovacao in ('pendente', 'recusada')
     and new.etapa not in ('visita', 'realizada', 'contra_proposta', 'perdido')
     and (tg_op = 'INSERT' or new.etapa is distinct from old.etapa or new.aprovacao is distinct from old.aprovacao) then
    raise exception 'Desconto de % acima do limite de %: a proposta só avança depois da aprovação do gestor.',
      replace(to_char(new.desconto_pct, 'FM990.00'), '.', ',') || '%',
      replace(to_char(new.desconto_limite_pct, 'FM990.00'), '.', ',') || '%'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

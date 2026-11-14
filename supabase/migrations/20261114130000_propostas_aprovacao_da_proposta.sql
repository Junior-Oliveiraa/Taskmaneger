-- =============================================================================
-- Comercial — propostas: a aprovação é da PROPOSTA, não do desconto
-- -----------------------------------------------------------------------------
--   Realizada ──(Enviar para aprovação)──▶ Em análise        → WhatsApp p/ Diretor
--   Em análise ──(Diretor)──▶ Venda | Contra proposta | Perdido
--   Contra proposta                                          → WhatsApp p/ Responsável
--      ├─ Aprovar  (responsável)  ──▶ Venda    se não editou depois da contra
--      ├─ Recusar                 ──▶ Perdido
--      └─ editar + Enviar novamente para aprovação ──▶ Em análise
--
-- Antes, desconto acima do limite exigia uma aprovação à parte do gestor e
-- travava o "Enviar para aprovação". Agora o desconto só é informação para o
-- Diretor, que avalia a proposta inteira em "Em análise". Aprovar a proposta
-- (→ Venda) registra também a aprovação do desconto.
--
-- contra_editada: o responsável mexeu no conteúdo depois da contra proposta.
-- Nesse caso ele não pode aprovar sozinho; precisa enviar de novo ao Diretor.
-- =============================================================================

alter table public.comercial_propostas
  add column if not exists contra_editada boolean not null default false;

-- ── Desconto: deixa de travar etapa; aprovação vem junto com a proposta ────

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
      raise exception 'Só o Diretor aprova ou recusa desconto acima do limite.' using errcode = '42501';
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

  -- O Diretor aprovou a proposta (→ Venda): o desconto vai aprovado junto.
  if tg_op = 'UPDATE' and new.etapa = 'venda' and old.etapa is distinct from 'venda'
     and new.aprovacao in ('pendente', 'recusada') then
    new.aprovacao := 'aprovada';
    new.aprovacao_por := auth.uid();
    new.aprovacao_por_nome := v_nome;
    new.aprovacao_em := now();
    new.aprovacao_obs := 'Aprovado junto com a proposta';
  end if;

  return new;
end;
$$;

-- ── Decisões de etapa ──────────────────────────────────────────────────────

create or replace function public.comercial_propostas_decisao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gestor boolean := auth.uid() is null or public.is_permission_level_1();
begin
  if new.etapa is distinct from old.etapa then
    -- Mudou de etapa: a marca de "editada após a contra" recomeça.
    new.contra_editada := false;

    if not v_gestor then
      if old.etapa = 'em_analise' and new.etapa in ('venda', 'contra_proposta', 'perdido') then
        raise exception 'Proposta em análise: só o Diretor aprova, faz contra proposta ou recusa.' using errcode = '42501';
      end if;
      if new.etapa = 'venda' then
        if old.etapa is distinct from 'contra_proposta' then
          raise exception 'Só o Diretor aprova a proposta e a leva para Venda.' using errcode = '42501';
        end if;
        if old.responsavel_id is distinct from auth.uid() then
          raise exception 'Só o responsável pela proposta (ou o Diretor) aprova a contra proposta.' using errcode = '42501';
        end if;
        if old.contra_editada then
          raise exception 'A proposta foi alterada depois da contra proposta: envie novamente para aprovação.' using errcode = '42501';
        end if;
        if old.aprovacao = 'pendente' then
          raise exception 'O desconto está acima do limite e não passou pelo Diretor: envie para aprovação.' using errcode = '42501';
        end if;
      end if;
    end if;

  elsif old.etapa = 'contra_proposta'
     and (new.autorizacao, new.cliente, new.corretor, new.imobiliaria, new.fluxo_pagamento, new.anexos,
          new.project_id, new.unidade_id, new.unidade)
         is distinct from
         (old.autorizacao, old.cliente, old.corretor, old.imobiliaria, old.fluxo_pagamento, old.anexos,
          old.project_id, old.unidade_id, old.unidade) then
    -- Edição do Diretor é a própria contra proposta; a do responsável exige reenvio.
    new.contra_editada := not v_gestor;
  else
    new.contra_editada := old.contra_editada;
  end if;

  return new;
end;
$$;

-- ── Eventos na conversa: aceite da contra proposta ─────────────────────────

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

-- ── WhatsApp: dispara na mudança de etapa, não no desconto ─────────────────

alter table public.whatsapp_outbox drop constraint if exists whatsapp_outbox_kind_check;
alter table public.whatsapp_outbox
  add constraint whatsapp_outbox_kind_check check (kind in ('text', 'proposta_aprovacao', 'proposta_contra'));

create or replace function public.enqueue_whatsapp_proposta()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_config    public.whatsapp_config%rowtype;
  v_secrets   public.whatsapp_dispatch_secrets%rowtype;
  v_kind      text;
  v_user      uuid;
  v_phone     text;
  v_outbox_id uuid;
begin
  if tg_op = 'UPDATE' and new.etapa is not distinct from old.etapa then
    return new;
  end if;

  begin
    select * into v_config from public.whatsapp_config where id = 'default';
    if not found or not v_config.enabled then
      return new;
    end if;

    if new.etapa = 'em_analise' then
      v_kind := 'proposta_aprovacao';      -- Diretor decide
      v_user := v_config.proposta_aprovador_id;
    elsif new.etapa = 'contra_proposta' then
      v_kind := 'proposta_contra';         -- responsável dá sequência
      v_user := new.responsavel_id;
    else
      return new;
    end if;

    if v_user is null then
      return new;
    end if;
    select phone into v_phone from public.users_profile where id = v_user;
    if v_phone is null or length(trim(v_phone)) < 10 then
      return new;
    end if;

    insert into public.whatsapp_outbox (kind, ref_id, user_id, phone, message)
    values (
      v_kind, new.id, v_user::text, trim(v_phone),
      format('Proposta nº %s — %s', coalesce(new.numero::text, '?'), public.comercial_etapa_label(new.etapa))
    )
    returning id into v_outbox_id;

    select * into v_secrets from public.whatsapp_dispatch_secrets where id = 'default';
    if v_secrets.function_url is not null then
      perform net.http_post(
        url     := v_secrets.function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(v_secrets.dispatch_token, '')
        ),
        body    := jsonb_build_object('outbox_id', v_outbox_id)
      );
    end if;
  exception when others then
    -- A integração nunca derruba a gravação da proposta.
    null;
  end;

  return new;
end;
$$;

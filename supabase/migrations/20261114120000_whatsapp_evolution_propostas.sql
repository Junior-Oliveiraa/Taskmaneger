-- =============================================================================
-- WhatsApp: troca do WAHA pela Evolution API e aviso de proposta pendente
-- -----------------------------------------------------------------------------
-- 1. A integração passa a usar a Evolution API na VPS da Locaweb
--    (vps/evolution/). base_url/session da whatsapp_config agora apontam para
--    ela; `session` é o nome da instância na Evolution.
-- 2. A fila ganha `kind`: além de texto ('text', usado pelas alçadas), envia o
--    card de proposta ('proposta_aprovacao'), uma imagem gerada pelo
--    orbit-render na mesma VPS. `ref_id` aponta para a proposta; o card é
--    montado no momento do envio, com os dados atuais.
-- 3. Quando uma proposta fica `pendente` (desconto acima do limite), o
--    aprovador configurado em whatsapp_config.proposta_aprovador_id recebe o
--    card. Sem aprovador configurado ou sem telefone, nada é enviado.
-- =============================================================================

-- ── 1. Fila ────────────────────────────────────────────────────────────────

alter table public.whatsapp_outbox
  add column if not exists kind text not null default 'text',
  add column if not exists ref_id uuid;

alter table public.whatsapp_outbox drop constraint if exists whatsapp_outbox_kind_check;
alter table public.whatsapp_outbox
  add constraint whatsapp_outbox_kind_check check (kind in ('text', 'proposta_aprovacao'));

-- ── 2. Configuração ────────────────────────────────────────────────────────

alter table public.whatsapp_config
  -- users_profile.id (sem FK: a tabela não tem chave primária declarada).
  add column if not exists proposta_aprovador_id uuid;

-- Aprovador inicial: Cidnei, em teste. Trocar para o Jailton
-- (e2609953-83bc-490f-8e26-8c2e7d874c7d) quando os testes terminarem.
update public.whatsapp_config
   set base_url = 'https://vps73947.publiccloud.com.br',
       session = 'Orbit',
       proposta_aprovador_id = coalesce(proposta_aprovador_id, 'f1ae073d-4e48-4fba-a7c2-460452252547'::uuid),
       updated_at = now()
 where id = 'default';

-- ── 3. Gatilho da proposta pendente ────────────────────────────────────────

create or replace function public.enqueue_whatsapp_proposta()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_config    public.whatsapp_config%rowtype;
  v_secrets   public.whatsapp_dispatch_secrets%rowtype;
  v_phone     text;
  v_outbox_id uuid;
begin
  if new.aprovacao is distinct from 'pendente' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.aprovacao is not distinct from 'pendente' then
    return new;
  end if;

  begin
    select * into v_config from public.whatsapp_config where id = 'default';
    if not found or not v_config.enabled or v_config.proposta_aprovador_id is null then
      return new;
    end if;

    select phone into v_phone from public.users_profile where id = v_config.proposta_aprovador_id;
    if v_phone is null or length(trim(v_phone)) < 10 then
      return new;
    end if;

    insert into public.whatsapp_outbox (kind, ref_id, user_id, phone, message)
    values (
      'proposta_aprovacao',
      new.id,
      v_config.proposta_aprovador_id::text,
      trim(v_phone),
      format('Proposta nº %s aguardando aprovação', coalesce(new.numero::text, '?'))
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

-- Sem `update OF aprovacao`: quem muda a aprovação costuma ser o BEFORE trigger
-- comercial_propostas_desconto (ao editar a ficha), e `OF coluna` só olha a
-- lista do SET do comando. A função acima já filtra o que interessa.
drop trigger if exists enqueue_whatsapp_on_proposta on public.comercial_propostas;
create trigger enqueue_whatsapp_on_proposta
  after insert or update on public.comercial_propostas
  for each row execute function public.enqueue_whatsapp_proposta();

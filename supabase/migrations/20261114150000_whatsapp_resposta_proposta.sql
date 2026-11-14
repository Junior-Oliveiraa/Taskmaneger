-- =============================================================================
-- WhatsApp: decidir a proposta respondendo 1 (aprovar) ou 2 (recusar)
-- -----------------------------------------------------------------------------
-- Fluxo: Evolution API → webhook → Edge Function `whatsapp-webhook` → esta RPC.
--
-- 1. whatsapp_outbox.wa_message_id guarda o id da mensagem enviada, para a
--    resposta citada ("Responder" no WhatsApp) achar o card certo.
-- 2. whatsapp_decidir_proposta() move a proposta AGINDO COMO o usuário que
--    respondeu: define os claims do JWT na transação, então auth.uid() é ele.
--    Assim valem as mesmas regras do app (comercial_propostas_decisao: só o
--    Diretor decide em análise; na contra proposta, só o responsável aprova e
--    só se não editou depois) e a conversa registra o nome dele no evento.
--    Só o service_role executa (a Edge Function já identificou o remetente).
-- =============================================================================

alter table public.whatsapp_outbox
  add column if not exists wa_message_id text;

create index if not exists whatsapp_outbox_wa_message_idx
  on public.whatsapp_outbox (wa_message_id) where wa_message_id is not null;

create or replace function public.whatsapp_decidir_proposta(p_proposta uuid, p_usuario uuid, p_etapa text)
returns table (numero bigint, etapa text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_etapa not in ('venda', 'perdido') then
    raise exception 'Decisão inválida: %', p_etapa using errcode = '22023';
  end if;

  -- auth.uid() lê estes claims: os triggers enxergam o usuário que respondeu.
  perform set_config('request.jwt.claim.sub', p_usuario::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);

  return query
    update public.comercial_propostas p
       set etapa = p_etapa
     where p.id = p_proposta
    returning p.numero, p.etapa;
end;
$$;

revoke all on function public.whatsapp_decidir_proposta(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_decidir_proposta(uuid, uuid, text) to service_role;

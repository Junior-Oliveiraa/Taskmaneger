// Recebe os eventos da Evolution API (webhook da instância) e trata as
// respostas aos cards de proposta:
//
//   1 → aprovar  (proposta vai para Venda)
//   2 → recusar  (proposta vai para Perdido/cancelado)
//
// Qual proposta: a do card citado ("Responder" no WhatsApp); sem citação, a
// única proposta aguardando aquela pessoa. Havendo mais de uma, pede para
// responder citando o card.
//
// A decisão roda na RPC whatsapp_decidir_proposta, agindo como o usuário dono
// do telefone: valem as mesmas regras do app (quem pode decidir em cada etapa).
//
// verify_jwt desligado: quem chama é a Evolution. Autenticação pelo token na
// URL (?token=), comparado com o secret WHATSAPP_WEBHOOK_TOKEN.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

// @ts-ignore
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
// @ts-ignore
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// @ts-ignore
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
// @ts-ignore
const WEBHOOK_TOKEN = Deno.env.get('WHATSAPP_WEBHOOK_TOKEN') || '';

const CARDS = ['proposta_aprovacao', 'proposta_contra'];
const ETAPA_DO_CARD: Record<string, string> = { proposta_aprovacao: 'em_analise', proposta_contra: 'contra_proposta' };
const JANELA_DIAS = 30;

const ok = (body: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } });

/**
 * Chave de comparação de telefones brasileiros: DDD + últimos 8 dígitos.
 * O WhatsApp registra linhas antigas sem o nono dígito (558282296072), enquanto
 * o perfil guarda com ele (5582982296072): os dois viram "8282296072".
 */
function chaveTelefone(raw: string | null | undefined): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

/** Texto digitado, de mensagem simples ou de resposta citada. */
function textoDa(data: any): string {
  const m = data?.message || {};
  return String(m.conversation ?? m.extendedTextMessage?.text ?? '').trim();
}

/** Id da mensagem citada, se a pessoa usou "Responder". */
function citadaDa(data: any): string | null {
  const m = data?.message || {};
  return m.extendedTextMessage?.contextInfo?.stanzaId ?? data?.contextInfo?.stanzaId ?? null;
}

/** Número do remetente. Com endereçamento LID, o número real vem em campos alternativos. */
function remetenteDe(data: any): string | null {
  const k = data?.key || {};
  const candidatos = [k.senderPn, k.remoteJidAlt, k.participantPn, k.remoteJid];
  for (const c of candidatos) {
    const s = String(c || '');
    if (s.endsWith('@s.whatsapp.net') || /^\d+$/.test(s)) return s.split('@')[0];
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return ok();

  const token = new URL(req.url).searchParams.get('token') || '';
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const payload = await req.json().catch(() => null);
  const evento = String(payload?.event || '').toLowerCase().replace('_', '.');
  if (evento !== 'messages.upsert') return ok({ ignorado: 'evento' });

  const data = payload?.data;
  if (!data || data.key?.fromMe) return ok({ ignorado: 'propria' });
  if (String(data.key?.remoteJid || '').endsWith('@g.us')) return ok({ ignorado: 'grupo' });

  const texto = textoDa(data).replace(/[.!\s]+$/, '');
  if (texto !== '1' && texto !== '2') return ok({ ignorado: 'texto' });
  const decisao = texto === '1' ? 'venda' : 'perdido';

  const numero = remetenteDe(data);
  const chave = chaveTelefone(numero);
  if (!numero || !chave) return ok({ ignorado: 'remetente' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: config } = await supabase.from('whatsapp_config').select('base_url, session, enabled').eq('id', 'default').maybeSingle();
  const base = String(config?.base_url || '').replace(/\/$/, '');
  const instancia = config?.session || '';
  if (!config?.enabled || !base || !instancia || !EVOLUTION_API_KEY) return ok({ ignorado: 'config' });

  const responder = async (text: string) => {
    const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: numero, text }),
    });
    if (!res.ok) console.error('[whatsapp-webhook] falha ao responder:', res.status, (await res.text().catch(() => '')).slice(0, 200));
  };

  try {
    // Quem respondeu: o usuário do Orbit com esse telefone.
    const { data: perfis, error: ePerfis } = await supabase.from('users_profile').select('id, name, phone').not('phone', 'is', null);
    if (ePerfis) throw ePerfis;
    const usuario = (perfis || []).find((u: any) => chaveTelefone(u.phone) === chave);
    if (!usuario) return ok({ ignorado: 'usuario' });

    // Qual proposta: o card citado; sem citação, os cards ainda em aberto dessa pessoa.
    const citada = citadaDa(data);
    const desde = new Date(Date.now() - JANELA_DIAS * 864e5).toISOString();
    let q = supabase
      .from('whatsapp_outbox')
      .select('kind, ref_id, sent_at')
      .eq('user_id', usuario.id)
      .eq('status', 'sent')
      .in('kind', CARDS);
    q = citada ? q.eq('wa_message_id', citada) : q.gte('sent_at', desde).order('sent_at', { ascending: false });
    const { data: cards, error: eCards } = await q;
    if (eCards) throw eCards;

    if (citada && !cards?.length) {
      await responder('Essa mensagem não é um card de proposta. Responda *1* ou *2* citando o card da proposta.');
      return ok({ ignorado: 'citacao' });
    }

    const ids = [...new Set((cards || []).map((c: any) => c.ref_id).filter(Boolean))];
    const { data: propostas, error: eProps } = ids.length
      ? await supabase.from('comercial_propostas').select('id, numero, etapa, cliente').in('id', ids)
      : { data: [], error: null };
    if (eProps) throw eProps;
    const porId = new Map((propostas || []).map((p: any) => [p.id, p]));

    // Em aberto = a proposta continua na etapa que gerou o card.
    const abertas = [...new Map(
      (cards || [])
        .map((c: any) => ({ c, p: porId.get(c.ref_id) }))
        .filter(({ c, p }: any) => p && p.etapa === ETAPA_DO_CARD[c.kind])
        .map(({ p }: any) => [p.id, p]),
    ).values()] as any[];

    if (!abertas.length) {
      const p = citada && cards?.[0] ? porId.get(cards[0].ref_id) : null;
      await responder(p
        ? `A proposta nº ${p.numero} já foi decidida e não está mais aguardando sua resposta.`
        : 'Não há proposta aguardando sua resposta no momento.');
      return ok({ ignorado: 'nada_pendente' });
    }
    if (abertas.length > 1) {
      const lista = abertas.slice(0, 6).map(p => `• nº ${p.numero} — ${p.cliente}`).join('\n');
      await responder(`Há ${abertas.length} propostas aguardando você:\n${lista}\n\nToque e segure o card da proposta, escolha *Responder* e digite *1* ou *2*.`);
      return ok({ ignorado: 'ambigua' });
    }

    const alvo = abertas[0];
    const { error: eDecisao } = await supabase.rpc('whatsapp_decidir_proposta', {
      p_proposta: alvo.id,
      p_usuario: usuario.id,
      p_etapa: decisao,
    });
    if (eDecisao) {
      await responder(`⚠️ Não foi possível registrar na proposta nº ${alvo.numero}: ${eDecisao.message}`);
      return ok({ erro: eDecisao.message });
    }

    await responder(decisao === 'venda'
      ? `✅ Proposta nº ${alvo.numero} (${alvo.cliente}) *aprovada*. Ela foi para Venda.`
      : `❌ Proposta nº ${alvo.numero} (${alvo.cliente}) *recusada*. Ela foi para Perdido/cancelado.`);
    return ok({ proposta: alvo.numero, etapa: decisao });
  } catch (e: any) {
    console.error('[whatsapp-webhook] erro:', e);
    await responder('⚠️ Não consegui registrar sua resposta agora. Tente novamente em instantes ou decida pelo Orbit.');
    return ok({ erro: String(e?.message || e) });
  }
});

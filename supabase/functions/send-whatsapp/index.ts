// Envia as mensagens pendentes da fila `whatsapp_outbox` pela Evolution API
// (WhatsApp self-hosted na VPS — ver vps/evolution/).
//
// Dois modos de uso:
//  - { outbox_id }  -> envia uma linha específica (chamado pelo trigger via pg_net)
//  - {}             -> varre a fila e reprocessa o que ficou para trás (cron)
//
// Tipos de linha (`kind`):
//  - text                -> texto (alçadas)
//  - proposta_aprovacao  -> card PNG da proposta para o Diretor (entrou em análise)
//  - proposta_contra     -> card PNG para o responsável (Diretor fez contra proposta)
//                           Os cards são gerados pelo orbit-render na mesma VPS,
//                           na hora do envio, com os dados atuais.
//
// verify_jwt fica desligado de propósito: quem chama é o pg_net (do banco) e o
// cron, que não têm JWT. A autenticação é feita aqui via WHATSAPP_DISPATCH_TOKEN.
//
// Endereço e instância vêm de `whatsapp_config` (base_url, session); a chave da
// Evolution e o token do gerador ficam nos secrets EVOLUTION_API_KEY e RENDER_TOKEN.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { encode as toBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

// @ts-ignore
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
// @ts-ignore
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// @ts-ignore
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
// @ts-ignore
const RENDER_TOKEN = Deno.env.get('RENDER_TOKEN') || '';
// @ts-ignore
const DISPATCH_TOKEN = Deno.env.get('WHATSAPP_DISPATCH_TOKEN') || '';
// @ts-ignore
const APP_URL = Deno.env.get('APP_URL') || '';

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;

type Evo = { base: string; instance: string };

/** Erro que não melhora com retentativa: a linha vai direto para `failed`. */
class Definitivo extends Error {}

/** Normaliza para dígitos com DDI, ou null se não parecer telefone válido. */
function toDigits(raw: string): string | null {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Sem DDI: assume Brasil.
  if (!digits.startsWith('55')) digits = `55${digits}`;
  // 55 + DDD(2) + 8 ou 9 dígitos.
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

async function evo(cfg: Evo, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${cfg.base}${path}/${encodeURIComponent(cfg.instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Evolution ${path} ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Descobre o número real perguntando ao WhatsApp.
 *
 * No Brasil, linhas antigas foram registradas SEM o nono dígito, então
 * `5582982296072` pode ter como ID verdadeiro `558282296072`. Enviar para o ID
 * errado é pior que um erro: a API aceita e a mensagem nunca chega.
 *
 * Retorna null quando o número não tem WhatsApp.
 */
async function resolveNumber(cfg: Evo, digits: string): Promise<string | null> {
  const data = await evo(cfg, '/chat/whatsappNumbers', { numbers: [digits] });
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit?.exists) return null;
  return String(hit.jid || digits).split('@')[0];
}

function buildAlcadaText(message: string): string {
  const parts = ['🔔 *Orbit — Aprovação pendente*', '', message.trim()];
  if (APP_URL) parts.push('', `Acesse: ${APP_URL}`);
  return parts.join('\n');
}

const pctBR = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

function dataBR(s: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : undefined;
}

type TipoCard = 'proposta_aprovacao' | 'proposta_contra';

// Cada aviso só vale enquanto a proposta continua na etapa que o gerou.
const ETAPA_DO_CARD: Record<TipoCard, string> = {
  proposta_aprovacao: 'em_analise',
  proposta_contra: 'contra_proposta',
};

/** Monta o card da proposta (PNG em base64) e a legenda. */
async function montarProposta(supabase: any, cfg: Evo, propostaId: string, tipo: TipoCard) {
  const { data: p, error } = await supabase
    .from('comercial_propostas')
    .select('id, numero, etapa, project_id, unidade_id, unidade, cliente, corretor, imobiliaria, autorizacao, aprovacao, desconto_pct, desconto_limite_pct, enviada_em, proposta_em, responsavel_id, created_by')
    .eq('id', propostaId)
    .maybeSingle();
  if (error) throw error;
  if (!p) throw new Definitivo('Proposta não encontrada');
  if (p.etapa !== ETAPA_DO_CARD[tipo]) throw new Definitivo(`A proposta já saiu da etapa do aviso (agora: ${p.etapa})`);

  const quem = p.responsavel_id || p.created_by;
  const [{ data: proj }, { data: und }, { data: autor }] = await Promise.all([
    supabase.from('projects').select('name').eq('id', p.project_id).maybeSingle(),
    p.unidade_id
      ? supabase.from('sienge_tabela_vendas').select('valor_tabela').eq('id', p.unidade_id).maybeSingle()
      : Promise.resolve({ data: null }),
    quem
      ? supabase.from('users_profile').select('name, email').eq('id', quem).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const a = p.autorizacao || {};
  // Mesma referência do trigger de desconto: valor da Tabela de Vendas, senão o da ficha.
  const valorTabela = Number(und?.valor_tabela) > 0 ? Number(und.valor_tabela) : Number(a.valorTabela) || 0;
  const empreendimento = proj?.name || 'Empreendimento';
  const solicitante = (autor?.name || '').trim() || autor?.email || undefined;

  const res = await fetch(`${cfg.base}/render/proposta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RENDER_TOKEN}` },
    body: JSON.stringify({
      selo: tipo === 'proposta_contra' ? 'contra' : 'aprovacao',
      numero: p.numero,
      data: dataBR(p.proposta_em || p.enviada_em),
      empreendimento,
      unidade: p.unidade,
      cliente: p.cliente,
      corretor: p.corretor,
      imobiliaria: p.imobiliaria,
      solicitante,
      valorTabela,
      descontoPct: p.desconto_pct,
      limitePct: p.desconto_limite_pct,
      autorizacao: a,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`orbit-render ${res.status}: ${body.slice(0, 200)}`);
  }
  const png = new Uint8Array(await res.arrayBuffer());

  // Uma informação por linha: no celular a legenda é estreita e o "·" quebra mal.
  const acima = Number(p.desconto_pct) > Number(p.desconto_limite_pct) + 0.0001;
  const detalhes = [
    `🏢 ${empreendimento}${p.unidade ? ` · Unid. ${p.unidade}` : ''}`,
    p.cliente ? `👤 ${p.cliente}` : null,
    Number(p.desconto_pct) > 0.005
      ? `💰 Desconto: *${pctBR(p.desconto_pct)}*${acima ? ` ⚠️ limite ${pctBR(p.desconto_limite_pct)}` : ''}`
      : '💰 Sem desconto',
  ];
  const link = APP_URL ? `\n${APP_URL}` : '';
  const caption = (tipo === 'proposta_contra'
    ? [
        '🔁 *Contra proposta*',
        `Proposta nº ${p.numero ?? '?'}`,
        '',
        ...detalhes,
        '',
        'O Diretor alterou a proposta.',
        '👉 Responda *1* para aprovar ou *2* para recusar.',
        `Para editar e enviar novamente, use o Orbit.${link}`,
      ]
    : [
        '🔔 *Aprovação pendente*',
        `Proposta nº ${p.numero ?? '?'}`,
        '',
        ...detalhes,
        solicitante ? `✍️ Enviada por ${solicitante}` : null,
        '',
        '👉 Responda *1* para aprovar ou *2* para recusar.',
        `Para contra proposta, use o Orbit.${link}`,
      ]
  ).filter((l) => l !== null).join('\n');

  return { media: toBase64(png), caption, fileName: `proposta-${p.numero ?? p.id}.png` };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const authHeader = req.headers.get('Authorization');
  if (!DISPATCH_TOKEN || authHeader !== `Bearer ${DISPATCH_TOKEN}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('base_url, session')
      .eq('id', 'default')
      .maybeSingle();

    const cfg: Evo = { base: String(config?.base_url || '').replace(/\/$/, ''), instance: config?.session || '' };
    if (!cfg.base || !cfg.instance || !EVOLUTION_API_KEY) {
      return new Response(JSON.stringify({ error: 'Evolution não configurada (base_url, session ou EVOLUTION_API_KEY)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const outboxId: string | undefined = payload?.outbox_id;

    let query = supabase
      .from('whatsapp_outbox')
      .select('id, kind, ref_id, phone, message, attempts')
      .neq('status', 'sent')
      .lt('attempts', MAX_ATTEMPTS);

    query = outboxId
      ? query.eq('id', outboxId)
      : query.order('created_at', { ascending: true }).limit(BATCH_SIZE);

    const { data: rows, error } = await query;
    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const row of rows || []) {
      const attempts = (row.attempts || 0) + 1;

      try {
        const digits = toDigits(row.phone);
        if (!digits) throw new Definitivo('Telefone inválido');

        const number = await resolveNumber(cfg, digits);
        if (!number) throw new Definitivo('Número sem WhatsApp');

        let enviada: any;
        if (row.kind === 'proposta_aprovacao' || row.kind === 'proposta_contra') {
          if (!row.ref_id) throw new Definitivo('Linha sem proposta (ref_id)');
          const card = await montarProposta(supabase, cfg, row.ref_id, row.kind);
          enviada = await evo(cfg, '/message/sendMedia', {
            number,
            mediatype: 'image',
            mimetype: 'image/png',
            fileName: card.fileName,
            caption: card.caption,
            media: card.media,
          });
        } else {
          enviada = await evo(cfg, '/message/sendText', { number, text: buildAlcadaText(row.message) });
        }

        await supabase
          .from('whatsapp_outbox')
          // wa_message_id: a resposta citada ("Responder") aponta para este id.
          .update({ status: 'sent', attempts, last_error: null, sent_at: new Date().toISOString(), wa_message_id: enviada?.key?.id ?? null })
          .eq('id', row.id);
        sent++;
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 500);
        const definitivo = e instanceof Definitivo;
        console.error(`[send-whatsapp] falha no envio ${row.id}:`, msg);
        await supabase
          .from('whatsapp_outbox')
          // Erro definitivo encerra a linha; os demais seguem `pending` até
          // esgotar as tentativas, para o cron pegar de novo.
          .update({
            status: definitivo || attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            attempts: definitivo ? MAX_ATTEMPTS : attempts,
            last_error: msg,
          })
          .eq('id', row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[send-whatsapp] erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Estado da conexão do WhatsApp (instância da Evolution API) para o selo
// "WhatsApp online" no Orbit. O navegador não fala direto com a Evolution: a
// chave fica no secret EVOLUTION_API_KEY.
//
// Exige usuário logado (JWT do Orbit). Resposta:
//   { estado: 'online' | 'conectando' | 'offline' | 'desativado' | 'erro', numero?, nome?, detalhe? }

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: null };
  if (!userData?.user) return json({ error: 'Unauthorized' }, 401);

  const { data: config } = await admin.from('whatsapp_config').select('base_url, session, enabled').eq('id', 'default').maybeSingle();
  const base = String(config?.base_url || '').replace(/\/$/, '');
  const instancia = String(config?.session || '');
  if (!config?.enabled) return json({ estado: 'desativado', detalhe: 'Envio por WhatsApp desligado nas configurações.' });
  if (!base || !instancia || !EVOLUTION_API_KEY) return json({ estado: 'erro', detalhe: 'Evolution não configurada.' });

  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`, { headers: { apikey: EVOLUTION_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Evolution ${res.status}`);
    return res.json();
  };

  try {
    const [estado, info] = await Promise.all([
      get(`/instance/connectionState/${encodeURIComponent(instancia)}`),
      get(`/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`).catch(() => null),
    ]);
    const state = String(estado?.instance?.state ?? estado?.state ?? '').toLowerCase();
    const inst = Array.isArray(info) ? info[0] : info;
    const numero = String(inst?.ownerJid ?? inst?.instance?.owner ?? '').split('@')[0] || null;
    const nome = inst?.profileName ?? inst?.instance?.profileName ?? null;
    return json({
      estado: state === 'open' ? 'online' : state === 'connecting' ? 'conectando' : 'offline',
      instancia, numero, nome,
    });
  } catch (e: any) {
    // VPS fora do ar ou sem resposta: para quem usa, é o mesmo que offline.
    return json({ estado: 'erro', instancia, detalhe: String(e?.message || e).slice(0, 200) });
  }
});

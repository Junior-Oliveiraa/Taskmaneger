// Sincroniza vendas, reservas, distratos, condições de pagamento e estoque do CV CRM para o Supabase.
// Alimenta a aba Desempenho do Dashboard do Comercial.
//
// Chamada pelo pg_cron de hora em hora (verify_jwt desligado no deploy). A função
// não recebe parâmetro nem devolve dados; o pior que uma chamada anônima consegue
// é adiantar a sincronização, e o intervalo mínimo abaixo limita isso.
//
// Secrets: CVCRM_DOMINIO, CVCRM_EMAIL, CVCRM_TOKEN.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
// @ts-ignore
import { montarReservas, montarUnidades, CvReservaRow, CvUnidadeRow } from "./transform.ts";

// @ts-ignore
const env = (k: string) => Deno.env.get(k) || '';

const INTERVALO_MINIMO_MS = 10 * 60 * 1000;
const PAUSA_CVDW_MS = 3200; // O CVDW aceita 20 chamadas por minuto.
const TIMEOUT_MS = 30_000;
const TENTATIVAS = 3;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function cvGet(path: string, cvdw: boolean) {
  const url = `https://${env('CVCRM_DOMINIO')}.cvcrm.com.br/api/v1${path}`;
  let ultimoErro = '';
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const res = await fetch(url, {
        headers: { email: env('CVCRM_EMAIL'), token: env('CVCRM_TOKEN'), accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const body = await res.json();
        if (cvdw) await sleep(PAUSA_CVDW_MS);
        return body;
      }
      await res.body?.cancel();
      ultimoErro = `HTTP ${res.status}`;
      // 429 bloqueia por um minuto; outros 4xx não mudam tentando de novo.
      if (res.status === 429) await sleep(61_000);
      else if (res.status < 500) break;
      else await sleep(PAUSA_CVDW_MS);
    } catch (e) {
      ultimoErro = (e as Error).name;
      await sleep(PAUSA_CVDW_MS);
    }
  }
  // O erro leva só o caminho: é gravado em tabela lida pelo app.
  throw new Error(`${path.split('?')[0]}: ${ultimoErro}`);
}

async function cvdwTudo(recurso: string) {
  const dados: Record<string, unknown>[] = [];
  for (let pagina = 1; pagina <= 100; pagina++) {
    const j = await cvGet(`/cvdw/${recurso}?pagina=${pagina}&registros_por_pagina=500`, true);
    dados.push(...(j.dados ?? []));
    if (pagina >= (j.total_de_paginas ?? 1)) break;
  }
  return dados;
}

async function buscarEstoque(): Promise<CvUnidadeRow[]> {
  const empreendimentos = await cvGet('/cadastros/empreendimentos', false);
  const out: CvUnidadeRow[] = [];
  for (const e of empreendimentos) {
    for (let pag = 1; pag <= 100; pag++) {
      const j = await cvGet(`/comercial/mapadisponibilidade/${e.idempreendimento}?limitePagina=500&pag=${pag}`, false);
      out.push(...montarUnidades(Number(e.idempreendimento), e.nome, j.dados ?? []));
      if (pag >= (j.paginacao?.total_de_paginas ?? 1)) break;
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function substituir(db: any, tabela: string, chave: string, linhas: Record<string, unknown>[]) {
  const atualizado_em = new Date().toISOString();
  const comData = linhas.map(l => ({ ...l, atualizado_em }));
  for (let i = 0; i < comData.length; i += 500) {
    const { error } = await db.from(tabela).upsert(comData.slice(i, i + 500), { onConflict: chave });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
  // O que não veio nesta carga completa saiu do CV.
  const { error } = await db.from(tabela).delete().lt('atualizado_em', atualizado_em);
  if (error) throw new Error(`${tabela}: ${error.message}`);
}

serve(async () => {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: anterior } = await db.from('cv_comercial_sync').select('iniciado_em').eq('id', 'default').maybeSingle();
  if (anterior?.iniciado_em && Date.now() - new Date(anterior.iniciado_em).getTime() < INTERVALO_MINIMO_MS) {
    return new Response(JSON.stringify({ ignorado: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  const iniciado_em = new Date().toISOString();
  await db.from('cv_comercial_sync').upsert({ id: 'default', iniciado_em });

  try {
    // Busca tudo antes de gravar: se o CV falhar no meio, os dados anteriores ficam intactos.
    const reservasRaw = await cvdwTudo('reservas');
    const vendasRaw = await cvdwTudo('vendas');
    const distratosRaw = await cvdwTudo('distratos');
    // Condições de pagamento: as séries dizem se o financiamento é Caixa ou banco privado.
    const condicoesRaw = await cvdwTudo('reservas/condicoes');
    const estoque = await buscarEstoque();

    // Resposta vazia com HTTP 200 apagaria o painel inteiro.
    if (reservasRaw.length === 0 || estoque.length === 0) throw new Error('CV CRM devolveu carga vazia');

    const reservas: CvReservaRow[] = montarReservas(reservasRaw, vendasRaw, distratosRaw, condicoesRaw);
    await substituir(db, 'cv_comercial_reservas', 'idreserva', reservas as unknown as Record<string, unknown>[]);
    await substituir(db, 'cv_comercial_unidades', 'idunidade', estoque as unknown as Record<string, unknown>[]);

    await db.from('cv_comercial_sync').upsert({
      id: 'default', iniciado_em, concluido_em: new Date().toISOString(), status: 'ok', erro: null,
      reservas: reservas.length, unidades: estoque.length,
    });
    return new Response(JSON.stringify({ ok: true, reservas: reservas.length, unidades: estoque.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const erro = (e as Error).message;
    console.error('cvcrm-sync', erro);
    await db.from('cv_comercial_sync').upsert({ id: 'default', iniciado_em, status: 'erro', erro });
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

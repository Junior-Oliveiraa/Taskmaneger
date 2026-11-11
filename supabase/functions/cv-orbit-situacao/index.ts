// Mantém a situação das unidades da tabela de vendas do Orbit igual à do CV CRM.
//
// Chamada pelo pg_cron uma vez por dia (verify_jwt desligado no deploy, como a
// cvcrm-sync). Não recebe parâmetro: a lista de empreendimentos vem da tabela
// cv_orbit_empreendimentos. O CV é a fonte da verdade, inclusive para desfazer
// vendas (o Orbit registra o distrato no orçamento real).
//
// Cada alteração passa por alterar_situacao_unidades, a mesma função do botão do
// app, então o trigger já replica a situação para as outras versões da tabela.
//
// Secrets: CVCRM_DOMINIO, CVCRM_EMAIL, CVCRM_TOKEN (os mesmos da cvcrm-sync).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
// @ts-ignore
import { compararEmpreendimento, indexarReservas, Alteracao } from "./regras.ts";

// @ts-ignore
const env = (k: string) => Deno.env.get(k) || '';

const INTERVALO_MINIMO_MS = 10 * 60 * 1000;
const PAUSA_CVDW_MS = 3200; // O CVDW aceita 20 chamadas por minuto.
const TIMEOUT_MS = 30_000;
const TENTATIVAS = 3;
// Trava contra erro de mapeamento: um dia normal muda poucas unidades. Acima
// disso nada é gravado e a execução fica registrada como erro para alguém olhar.
const MAX_ALTERACOES_POR_EXECUCAO = 40;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function cvdwTudo(recurso: string) {
  const dados: Record<string, unknown>[] = [];
  for (let pagina = 1; pagina <= 100; pagina++) {
    const path = `/cvdw/${recurso}?pagina=${pagina}&registros_por_pagina=500`;
    let j: { dados?: Record<string, unknown>[]; total_de_paginas?: number } | null = null;
    let ultimoErro = '';
    for (let t = 1; t <= TENTATIVAS && !j; t++) {
      try {
        const res = await fetch(`https://${env('CVCRM_DOMINIO')}.cvcrm.com.br/api/v1${path}`, {
          headers: { email: env('CVCRM_EMAIL'), token: env('CVCRM_TOKEN'), accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) { j = await res.json(); break; }
        await res.body?.cancel();
        ultimoErro = `HTTP ${res.status}`;
        if (res.status === 429) await sleep(61_000);
        else if (res.status < 500) break;
        else await sleep(PAUSA_CVDW_MS);
      } catch (e) {
        ultimoErro = (e as Error).name;
        await sleep(PAUSA_CVDW_MS);
      }
    }
    if (!j) throw new Error(`/cvdw/${recurso}: ${ultimoErro}`);
    await sleep(PAUSA_CVDW_MS);
    dados.push(...(j.dados ?? []));
    if (pagina >= (j.total_de_paginas ?? 1)) break;
  }
  return dados;
}

// deno-lint-ignore no-explicit-any
async function linhasPrincipais(db: any, projectId: string) {
  const { data: versao, error: e1 } = await db.from('sienge_tabela_vendas_versoes')
    .select('id').eq('project_id', projectId).eq('principal', true).maybeSingle();
  if (e1) throw new Error(`versões ${projectId}: ${e1.message}`);
  if (!versao) return null;
  const linhas: { id: string; unidade: string; situacao: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('sienge_tabela_vendas')
      .select('id,unidade,situacao').eq('versao_id', versao.id).order('id').range(from, from + 999);
    if (error) throw new Error(`tabela ${projectId}: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

serve(async () => {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: anterior } = await db.from('cv_orbit_conferencias')
    .select('iniciado_em').order('iniciado_em', { ascending: false }).limit(1).maybeSingle();
  if (anterior?.iniciado_em && Date.now() - new Date(anterior.iniciado_em).getTime() < INTERVALO_MINIMO_MS) {
    return new Response(JSON.stringify({ ignorado: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  const { data: conf, error: eConf } = await db.from('cv_orbit_conferencias')
    .insert({ status: 'rodando' }).select('id').single();
  if (eConf) return new Response(JSON.stringify({ ok: false }), { status: 500 });
  const fechar = (campos: Record<string, unknown>) =>
    db.from('cv_orbit_conferencias').update({ concluido_em: new Date().toISOString(), ...campos }).eq('id', conf.id);

  try {
    const { data: mapeamento, error: eMap } = await db.from('cv_orbit_empreendimentos')
      .select('idempreendimento_cv,project_id,termo_assinado_vendida').eq('ativo', true);
    if (eMap) throw new Error(`mapeamento: ${eMap.message}`);

    // Busca tudo no CV antes de comparar: se falhar no meio, nada é alterado.
    const unidades = await cvdwTudo('unidades');
    const reservas = await cvdwTudo('reservas');
    if (unidades.length === 0) throw new Error('CV CRM devolveu carga vazia de unidades');
    const idx = indexarReservas(reservas);

    const plano: { projectId: string; alt: Alteracao }[] = [];
    const avisos: string[] = [];
    let conferidas = 0;
    for (const m of mapeamento ?? []) {
      const linhas = await linhasPrincipais(db, m.project_id);
      if (!linhas) { avisos.push(`${m.project_id}: sem versão principal`); continue; }
      const cvDoEmp = unidades.filter(u => Number(u.idempreendimento) === Number(m.idempreendimento_cv));
      const r = compararEmpreendimento(cvDoEmp, linhas, m.termo_assinado_vendida, idx);
      conferidas += r.conferidas;
      if (r.ambiguas.length) avisos.push(`${m.project_id}: nome repetido no CV (${r.ambiguas.join(', ')})`);
      plano.push(...r.alteracoes.map(alt => ({ projectId: m.project_id, alt })));
    }

    if (plano.length > MAX_ALTERACOES_POR_EXECUCAO) {
      throw new Error(`${plano.length} alterações de uma vez (limite ${MAX_ALTERACOES_POR_EXECUCAO}); nada foi gravado`);
    }

    let aplicadas = 0;
    for (const { projectId, alt } of plano) {
      const { error } = await db.rpc('alterar_situacao_unidades', {
        p_project_id: projectId,
        p_unidade_ids: [alt.unidadeId],
        p_situacao: alt.alvo.situacao,
        p_motivo: alt.alvo.motivo,
        p_comprador: alt.alvo.comprador,
        p_data: alt.alvo.data,
      });
      // O log não guarda o nome do comprador: ele já fica na própria tabela de vendas.
      await db.from('cv_orbit_alteracoes').insert({
        conferencia_id: conf.id, project_id: projectId, unidade: alt.unidade,
        situacao_anterior: alt.de, situacao_nova: alt.alvo.situacao, motivo: alt.alvo.motivo,
        idreserva_cv: alt.alvo.idreserva, erro: error?.message ?? null,
      });
      if (error) avisos.push(`${projectId} ${alt.unidade}: ${error.message}`);
      else aplicadas++;
    }

    await fechar({ status: avisos.length ? 'ok_com_avisos' : 'ok', conferidas, alteradas: aplicadas, avisos: avisos.length ? avisos : null });
    return new Response(JSON.stringify({ ok: true, conferidas, alteradas: aplicadas, avisos }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const erro = (e as Error).message;
    console.error('cv-orbit-situacao', erro);
    await fechar({ status: 'erro', erro });
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

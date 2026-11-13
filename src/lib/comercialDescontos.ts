// Limite de desconto das propostas: até ele o operador lança sozinho; acima,
// a proposta precisa da aprovação do gestor (master). Editado na aba Metas.
//
// A regra de verdade está no banco (trigger comercial_propostas_desconto,
// migração 20261112140000): aqui é só o que a tela mostra e grava.

import { supabase } from './supabase';

export const LIMITE_DESCONTO_PADRAO = 1.5;

export interface LimitesDesconto {
  /** Vale para todo empreendimento sem limite próprio. */
  padrao: number;
  /** project_id → limite próprio (%). */
  porProjeto: Map<string, number>;
}

export async function fetchLimitesDesconto(): Promise<LimitesDesconto> {
  const [config, limites] = await Promise.all([
    supabase.from('comercial_metas_config').select('desconto_limite_padrao').eq('id', 'default').maybeSingle(),
    supabase.from('comercial_descontos_limite').select('project_id,limite_pct'),
  ]);
  if (config.error) throw config.error;
  if (limites.error) throw limites.error;
  const padrao = Number(config.data?.desconto_limite_padrao);
  return {
    padrao: Number.isFinite(padrao) ? padrao : LIMITE_DESCONTO_PADRAO,
    porProjeto: new Map((limites.data ?? []).map((l: any) => [l.project_id, Number(l.limite_pct)])),
  };
}

export const limiteDoProjeto = (l: LimitesDesconto | undefined, projectId: string) =>
  l?.porProjeto.get(projectId) ?? l?.padrao ?? LIMITE_DESCONTO_PADRAO;

export async function salvarLimitePadrao(pct: number): Promise<void> {
  const { error } = await supabase.from('comercial_metas_config').update({ desconto_limite_padrao: pct }).eq('id', 'default');
  if (error) throw error;
}

/** null remove o limite próprio: o empreendimento volta a seguir o padrão. */
export async function salvarLimiteProjeto(projectId: string, pct: number | null): Promise<void> {
  const { error } = pct === null
    ? await supabase.from('comercial_descontos_limite').delete().eq('project_id', projectId)
    : await supabase.from('comercial_descontos_limite').upsert({ project_id: projectId, limite_pct: pct });
  if (error) throw error;
}

/** Desconto (%) do contratado sobre a tabela; 0 quando não há desconto. */
export function descontoPct(contratado: number, tabela: number | null | undefined): number {
  if (!tabela || tabela <= 0) return 0;
  return Math.max(0, (1 - contratado / tabela) * 100);
}

/** Mesma folga do banco para o arredondamento dos centavos. */
export const acimaDoLimite = (desconto: number, limite: number) => desconto > limite + 0.0001;

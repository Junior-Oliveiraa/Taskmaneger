// Metas de VGV do Comercial: editadas na aba Metas, lidas pelo painel Desempenho.
// Só a Meta é guardada; a Super Meta é sempre Meta × fatorSuper.

import { supabase } from './supabase';
import { nomeCurtoEmpreendimento } from './cvComercial';
import type { SiengeProjectMeta } from '../types';

export interface MetaEmpreendimento {
  nome: string;
  ordem: number;
  /** Empreendimento do CV CRM a que a meta se refere. Nulo = casa pelo nome. */
  cv_idempreendimento: number | null;
  /** Empreendimento do Orbit (projects.id) cujos gastos o Dashboard Analítico compara com esta meta. */
  project_id: string | null;
}

export interface MetasComercial {
  empreendimentos: MetaEmpreendimento[];
  /** empreendimento → mês ('2027-03') → valor da Meta. */
  valores: Map<string, Map<string, number>>;
  fatorSuper: number;
}

export const FATOR_SUPER_PADRAO = 1.5;

export async function fetchMetasComercial(): Promise<MetasComercial> {
  const [emps, metas, config] = await Promise.all([
    supabase.from('comercial_metas_empreendimentos').select('nome,ordem,cv_idempreendimento,project_id').order('ordem').order('nome'),
    supabase.from('comercial_metas').select('empreendimento,mes,valor').range(0, 49999),
    supabase.from('comercial_metas_config').select('fator_super').eq('id', 'default').maybeSingle(),
  ]);
  if (emps.error) throw emps.error;
  if (metas.error) throw metas.error;
  if (config.error) throw config.error;

  const valores = new Map<string, Map<string, number>>();
  (metas.data ?? []).forEach((m: any) => {
    const porMes = valores.get(m.empreendimento) ?? new Map<string, number>();
    porMes.set(String(m.mes).slice(0, 7), Number(m.valor) || 0);
    valores.set(m.empreendimento, porMes);
  });
  return {
    empreendimentos: (emps.data ?? []).map((e: any) => ({
      nome: e.nome,
      ordem: Number(e.ordem) || 0,
      cv_idempreendimento: e.cv_idempreendimento == null ? null : Number(e.cv_idempreendimento),
      project_id: e.project_id ?? null,
    })),
    valores,
    fatorSuper: Number(config.data?.fator_super) || FATOR_SUPER_PADRAO,
  };
}

/** Uma célula alterada: valor nulo apaga a meta daquele mês. */
export interface AlteracaoMeta { empreendimento: string; mes: string; valor: number | null }

export async function salvarMetas(alteracoes: AlteracaoMeta[]): Promise<void> {
  const gravar = alteracoes.filter(a => a.valor !== null)
    .map(a => ({ empreendimento: a.empreendimento, mes: `${a.mes}-01`, valor: a.valor }));
  const apagar = alteracoes.filter(a => a.valor === null);
  if (gravar.length) {
    const { error } = await supabase.from('comercial_metas').upsert(gravar, { onConflict: 'empreendimento,mes' });
    if (error) throw error;
  }
  // Agrupa por empreendimento para apagar com uma chamada cada.
  const porEmp = new Map<string, string[]>();
  apagar.forEach(a => porEmp.set(a.empreendimento, [...(porEmp.get(a.empreendimento) ?? []), `${a.mes}-01`]));
  for (const [empreendimento, meses] of porEmp) {
    const { error } = await supabase.from('comercial_metas').delete().eq('empreendimento', empreendimento).in('mes', meses);
    if (error) throw error;
  }
}

export async function criarEmpreendimentoMeta(nome: string, ordem: number): Promise<void> {
  const { error } = await supabase.from('comercial_metas_empreendimentos').insert({ nome, ordem });
  if (error) throw error;
}

export async function atualizarEmpreendimentoMeta(
  nome: string,
  mudanca: Partial<Pick<MetaEmpreendimento, 'nome' | 'ordem' | 'cv_idempreendimento' | 'project_id'>>,
): Promise<void> {
  const { error } = await supabase.from('comercial_metas_empreendimentos').update(mudanca).eq('nome', nome);
  if (error) throw error;
}

/** Remove o empreendimento e todas as metas dele, de todos os anos. */
export async function removerEmpreendimentoMeta(nome: string): Promise<void> {
  const { error } = await supabase.from('comercial_metas_empreendimentos').delete().eq('nome', nome);
  if (error) throw error;
}

export async function salvarFatorSuper(fator: number): Promise<void> {
  const { error } = await supabase.from('comercial_metas_config').upsert({ id: 'default', fator_super: fator });
  if (error) throw error;
}

// ── Faixas ───────────────────────────────────────────────────────────────────

export type FaixaAtingimento = 'sub' | 'meta' | 'super';

/** Sub Meta abaixo de 1; Meta de 1 até menos que o fator; Super Meta a partir dele. */
export function faixaAtingimento(atingido: number, fatorSuper: number): FaixaAtingimento {
  if (atingido >= fatorSuper) return 'super';
  if (atingido >= 1) return 'meta';
  return 'sub';
}

export const ROTULO_FAIXA: Record<FaixaAtingimento, string> = { sub: 'Sub Meta', meta: 'Meta', super: 'Super Meta' };

// ── Ligação com o CV CRM ─────────────────────────────────────────────────────

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface EmpreendimentoCv { id: number; nome: string }

/**
 * Id do CV a que a meta se refere: o vínculo escolhido na tela ou, sem ele, o
 * empreendimento do CV cujo nome contém o nome da meta (só se houver um único).
 */
export function idCvDaMeta(emp: MetaEmpreendimento, cv: EmpreendimentoCv[]): number | null {
  if (emp.cv_idempreendimento !== null) return emp.cv_idempreendimento;
  const alvo = normalizar(emp.nome);
  const iguais = cv.filter(e => normalizar(nomeCurtoEmpreendimento(e.nome).nome) === alvo);
  if (iguais.length === 1) return iguais[0].id;
  const contem = cv.filter(e => normalizar(e.nome).includes(alvo));
  return contem.length === 1 ? contem[0].id : null;
}

/**
 * Meta de cada mês para o recorte do painel. `idsCv` nulo = todos os
 * empreendimentos: soma todas as metas cadastradas, mesmo as sem vínculo com o CV.
 */
export function metaMensalDoRecorte(metas: MetasComercial, cv: EmpreendimentoCv[], idsCv: number[] | null): (mes: string) => number {
  const nomes = metas.empreendimentos
    .filter(e => idsCv === null || (() => { const id = idCvDaMeta(e, cv); return id !== null && idsCv.includes(id); })())
    .map(e => e.nome);
  return mes => nomes.reduce((t, n) => t + (metas.valores.get(n)?.get(mes) ?? 0), 0);
}

// ── Ligação com o Dashboard Analítico (Finanças) ────────────────────────────

/**
 * Metas no formato que a análise de orçamento do Dashboard Analítico já usa
 * (uma linha por empreendimento do Orbit e mês). Metas sem vínculo com o Orbit
 * ficam de fora; duas metas no mesmo empreendimento se somam. A meta comercial
 * não tem unidades, então unidadesMeta é sempre 0.
 */
export function metasParaOrcamento(metas: MetasComercial): SiengeProjectMeta[] {
  const porChave = new Map<string, SiengeProjectMeta>();
  metas.empreendimentos.forEach(e => {
    if (!e.project_id) return;
    metas.valores.get(e.nome)?.forEach((valor, mes) => {
      const ano = Number(mes.slice(0, 4));
      const m = Number(mes.slice(5, 7));
      const k = `${e.project_id}|${mes}`;
      const atual = porChave.get(k);
      if (atual) atual.vgvMeta += valor;
      else porChave.set(k, { id: `comercial:${k}`, projectId: e.project_id!, ano, mes: m, vgvMeta: valor, unidadesMeta: 0, createdAt: '', updatedAt: '' });
    });
  });
  return [...porChave.values()];
}

/** Ids do Orbit na ordem das metas comerciais (ordem dos cartões no Dashboard Analítico). */
export function projetosDasMetas(metas: MetasComercial): string[] {
  const vistos = new Set<string>();
  metas.empreendimentos.forEach(e => { if (e.project_id) vistos.add(e.project_id); });
  return [...vistos];
}

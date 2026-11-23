// Filtros e opções de exibição da Lista: regra de filtro pura e persistência
// por usuário (localStorage). Colunas e densidade já vivem em
// users_profile.preferences e continuam lá.
import type { Task, TaskPriority } from '../types';
import { estaNaSemana, type DueInfo } from './prazo';
import { PERIODOS_TAREFAS, type Periodo } from './inboxFiltros';

export type FiltroPrazo = 'critical' | 'overdue' | 'week' | 'none';
export type Agrupamento = 'none' | 'status' | 'priority' | 'prazo';
export type Ordenacao = 'vencimento' | 'prioridade';

export interface FiltrosLista {
  prioridades: TaskPriority[];
  empreendimentos: string[];
  prazos: FiltroPrazo[];
  /** Id do responsável ou 'all'. Ignorado em Minhas tarefas. */
  responsavel: string;
  /** Só em Minhas tarefas: período do prazo e escopo de Marketing. */
  periodo: Periodo;
  projetos: string[];
}

export interface PrefsLista {
  filtros: FiltrosLista;
  groupBy: Agrupamento;
  ordenacao: Ordenacao;
  /** Minhas tarefas: coluna Responsável reativada pelo usuário. */
  responsavelVisivel: boolean;
  /** Minhas tarefas: as concluídas ficam ocultas até o usuário pedir. */
  mostrarConcluidas: boolean;
  recolhidos: string[];
}

export const FILTROS_VAZIOS: FiltrosLista = { prioridades: [], empreendimentos: [], prazos: [], responsavel: 'all', periodo: { preset: 'todo' }, projetos: [] };

export function prefsPadrao(responsavel = 'all', minhas = false): PrefsLista {
  return {
    filtros: { ...FILTROS_VAZIOS, responsavel },
    // Minhas tarefas agrupa por data; as demais listas, por status.
    groupBy: minhas ? 'prazo' : 'status',
    ordenacao: 'vencimento',
    responsavelVisivel: false,
    mostrarConcluidas: false,
    recolhidos: [],
  };
}

export function casaPrazo(info: DueInfo, prazos: FiltroPrazo[]): boolean {
  if (prazos.length === 0) return true;
  return prazos.some(p => p === 'week' ? estaNaSemana(info) : info.state === p);
}

/** Filtros que independem do prazo (o resumo de prazos é contado sobre eles). */
export function casaFiltrosBase(
  t: Pick<Task, 'priority' | 'projectId'>,
  f: FiltrosLista,
): boolean {
  if (f.prioridades.length > 0 && !f.prioridades.includes(t.priority)) return false;
  if (f.empreendimentos.length > 0 && !f.empreendimentos.includes(t.projectId)) return false;
  return true;
}

/** Filtro de Projeto (Marketing): a tarefa precisa estar num dos projetos escolhidos. */
export function casaEscopoTarefa(
  taskId: string,
  f: Pick<FiltrosLista, 'projetos'>,
  projetoDaTarefa: Record<string, string>,
): boolean {
  if (f.projetos.length === 0) return true;
  const projeto = projetoDaTarefa[taskId];
  return !!projeto && f.projetos.includes(projeto);
}

export function contarFiltros(f: FiltrosLista, comResponsavel: boolean): number {
  return f.prioridades.length + f.empreendimentos.length + f.prazos.length + (comResponsavel && f.responsavel !== 'all' ? 1 : 0);
}

const PRIORIDADES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'no_priority'];
const PRAZOS: FiltroPrazo[] = ['critical', 'overdue', 'week', 'none'];
const textos = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function normalizarPeriodo(v: any): Periodo {
  if (v?.preset === 'personalizado') {
    const data = /^\d{4}-\d{2}-\d{2}$/;
    if (data.test(v.de) && data.test(v.ate)) return { preset: 'personalizado', de: v.de, ate: v.ate };
  }
  const p = PERIODOS_TAREFAS.find(x => x.valor === v?.preset);
  return { preset: p?.valor ?? 'todo' };
}

/** Aceita só o que reconhece: preferência antiga ou corrompida cai no padrão. */
export function normalizarPrefs(bruto: unknown, padrao: PrefsLista): PrefsLista {
  if (!bruto || typeof bruto !== 'object') return padrao;
  const b = bruto as Record<string, any>;
  const f = (b.filtros && typeof b.filtros === 'object') ? b.filtros : {};
  return {
    filtros: {
      prioridades: PRIORIDADES.filter(p => textos(f.prioridades).includes(p)),
      empreendimentos: textos(f.empreendimentos),
      prazos: PRAZOS.filter(p => textos(f.prazos).includes(p)),
      responsavel: typeof f.responsavel === 'string' ? f.responsavel : padrao.filtros.responsavel,
      periodo: normalizarPeriodo(f.periodo),
      projetos: textos(f.projetos),
    },
    groupBy: ['none', 'status', 'priority', 'prazo'].includes(b.groupBy) ? b.groupBy : padrao.groupBy,
    ordenacao: ['vencimento', 'prioridade'].includes(b.ordenacao) ? b.ordenacao : padrao.ordenacao,
    responsavelVisivel: typeof b.responsavelVisivel === 'boolean' ? b.responsavelVisivel : padrao.responsavelVisivel,
    mostrarConcluidas: b.mostrarConcluidas === true,
    recolhidos: textos(b.recolhidos),
  };
}

export const chavePrefs = (userId: string, minhas: boolean) => `orbit:lista:${userId}:${minhas ? 'minhas-v2' : 'geral'}`; // v2: padrão novo (agrupar por prazo)

export function lerPrefs(chave: string, padrao: PrefsLista): PrefsLista {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? normalizarPrefs(JSON.parse(raw), padrao) : padrao;
  } catch {
    return padrao;
  }
}

export function gravarPrefs(chave: string, prefs: PrefsLista) {
  try { localStorage.setItem(chave, JSON.stringify(prefs)); } catch { /* privado/bloqueado: vale só nesta sessão */ }
}

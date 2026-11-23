// Regra do cronograma: janela de dias (semana ou mês) e onde a barra de cada
// tarefa cai nela. Sem React, para poder ser testada.
import type { Task } from '../types';
import { inicioDaSemana, isoLocal, somarDias } from './datas';
import { diasEntre, estaAtrasada, formatarDataExtensaCurta, getDueState, DUE_WEEK_DAYS } from './prazo';

export type ModoCronograma = 'semana' | 'mes';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const curto = (m: number) => MESES[m].slice(0, 3);

/** Data local de um YYYY-MM-DD. */
export function deIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const somarIso = (iso: string, n: number) => somarDias(n, deIso(iso));

/** Dias (YYYY-MM-DD) da semana (segunda a domingo) ou do mês que contém a referência. */
export function diasDaJanela(modo: ModoCronograma, referencia: string): string[] {
  const ref = deIso(referencia);
  const primeiro = modo === 'semana' ? inicioDaSemana(ref) : new Date(ref.getFullYear(), ref.getMonth(), 1);
  const total = modo === 'semana' ? 7 : new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => somarDias(i, primeiro));
}

/** Semana ou mês vizinho. No mês, vai para o dia 1 (31 jan + 1 mês não pode pular fevereiro). */
export function moverJanela(modo: ModoCronograma, referencia: string, sentido: 1 | -1): string {
  if (modo === 'semana') return somarIso(referencia, 7 * sentido);
  const ref = deIso(referencia);
  return isoLocal(new Date(ref.getFullYear(), ref.getMonth() + sentido, 1));
}

/** "Novembro 2026", "16 – 22 nov 2026", "30 nov – 6 dez 2026", "28 dez 2026 – 3 jan 2027". */
export function rotuloJanela(modo: ModoCronograma, dias: string[]): string {
  const a = deIso(dias[0]), b = deIso(dias[dias.length - 1]);
  if (modo === 'mes') return `${MESES[a.getMonth()][0].toUpperCase()}${MESES[a.getMonth()].slice(1)} ${a.getFullYear()}`;
  const fim = `${b.getDate()} ${curto(b.getMonth())} ${b.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${curto(a.getMonth())} ${a.getFullYear()} – ${fim}`;
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${curto(a.getMonth())} – ${fim}`;
  return `${a.getDate()} – ${fim}`;
}

/** Data com hora (ISO/UTC) vira o dia local; data pura fica como está. */
const diaLocal = (s: string) => s.length > 10 ? isoLocal(new Date(s)) : s;

/**
 * Início da tarefa: a data programada. Sem ela, é uma estimativa: a primeira vez
 * em "Em progresso" ou a criação. Nunca passa do prazo.
 */
export function inicioDaTarefa(t: Pick<Task, 'createdAt' | 'startDate' | 'dueDate' | 'statusHistory'>): string {
  const prazo = t.dueDate?.slice(0, 10);
  if (t.startDate) {
    const programado = t.startDate.slice(0, 10);
    return prazo && programado > prazo ? prazo : programado;
  }
  const entrou = t.statusHistory?.filter(h => h.status === 'in_progress' && h.enteredAt).map(h => diaLocal(h.enteredAt)).sort()[0];
  const inicio = entrou ?? (t.createdAt ? diaLocal(t.createdAt) : prazo) ?? '';
  return prazo && (!inicio || inicio > prazo) ? prazo : inicio;
}

export interface Trecho {
  /** Índice do primeiro dia visível e quantos dias ocupa. */
  col: number;
  span: number;
  /** A barra continua para fora da janela. */
  cortaEsq: boolean;
  cortaDir: boolean;
}

/** Parte de [inicio, fim] dentro da janela, ou null se não aparece. */
export function trechoNaJanela(inicio: string, fim: string, dias: string[]): Trecho | null {
  const a = dias[0], b = dias[dias.length - 1];
  if (fim < a || inicio > b || fim < inicio) return null;
  const col = inicio <= a ? 0 : dias.indexOf(inicio);
  const ate = fim >= b ? dias.length - 1 : dias.indexOf(fim);
  return { col, span: ate - col + 1, cortaEsq: inicio < a, cortaDir: fim > b };
}

export interface BarraCronograma {
  inicio: string;
  /** Início definido na tarefa (senão, estimado). */
  programado: boolean;
  prazo: string;
  /** Do início ao prazo; null quando o prazo venceu antes da janela. */
  barra: Trecho | null;
  /** 0 = em dia ou concluída. */
  diasAtraso: number;
}

/** Define a cor da barra: cinza só em Pausado, azul no resto. Atraso não muda a cor. */
export type SituacaoCronograma = 'ativa' | 'pausada' | 'concluida';

export function situacaoDoStatus(status: Task['status']): SituacaoCronograma {
  return status === 'done' ? 'concluida' : status === 'paused' ? 'pausada' : 'ativa';
}

/** Quanto cada status representa da tarefa pronta (Pausado herda o anterior). */
export const PROGRESSO_STATUS: Record<Exclude<Task['status'], 'paused'>, number> = {
  no_forecast: 0, todo: 0, in_progress: 0.25, rework: 0.5, approval: 0.75, implementation: 0.9, done: 1,
};

/** Último status diferente do atual, ou 'todo'. */
export function statusAnterior(historico: Task['statusHistory'], atual: Task['status']): Task['status'] {
  return [...(historico ?? [])].reverse().find(h => h.status !== atual)?.status as Task['status'] | undefined ?? 'todo';
}

/** Parte pronta da tarefa (0 a 1), pelo status. */
export function progressoDaTarefa(t: Pick<Task, 'status' | 'statusHistory'>): number {
  const status = t.status === 'paused' ? statusAnterior(t.statusHistory, 'paused') : t.status;
  return status === 'paused' ? 0 : PROGRESSO_STATUS[status] ?? 0;
}

/** Sem previsão (ou sem prazo) não entra no cronograma. */
export const noCronograma = (t: Pick<Task, 'status' | 'dueDate'>) => t.status !== 'no_forecast' && !!t.dueDate;

/** Formato único do prazo: "Atrasada · 86d", "Hoje", "Em 2d", "30 nov". */
export function rotuloPrazoCurto(prazo: string | undefined, status: Task['status'], hoje: string): string {
  const { state, diff, daysLate } = getDueState(prazo, status, hoje);
  if (!prazo || diff === null) return '—';
  if (estaAtrasada(state)) return `Atrasada · ${daysLate}d`;
  if (status !== 'done' && diff === 0) return 'Hoje';
  if (status !== 'done' && diff <= DUE_WEEK_DAYS) return `Em ${diff}d`;
  return formatarDataExtensaCurta(prazo, hoje);
}

/** Barra da tarefa na janela; null sem prazo ou fora do período. Atrasada de antes continua na lista. */
export function barraDaTarefa(t: Pick<Task, 'createdAt' | 'startDate' | 'dueDate' | 'status' | 'statusHistory'>, dias: string[], hoje: string): BarraCronograma | null {
  const prazo = t.dueDate?.slice(0, 10);
  if (!prazo) return null;
  const inicio = inicioDaTarefa(t);
  const diasAtraso = getDueState(prazo, t.status, hoje).daysLate;
  const barra = trechoNaJanela(inicio, prazo, dias);
  // Venceu antes da janela e segue aberta: a linha fica, com a seta para trás.
  const venceuAntes = diasAtraso > 0 && prazo < dias[0] && hoje >= dias[0];
  return barra || venceuAntes ? { inicio, programado: !!t.startDate, prazo, barra, diasAtraso } : null;
}

// Régua única de severidade do prazo. Usada pela Lista, Kanban, Calendário,
// sidebar e pelos alertas da Caixa de entrada — mudar os limites aqui muda
// tudo junto. Sem React, para poder ser testada.
import type { Task, TaskPriority, TaskStatus } from '../types';
import { hojeLocal } from './datas';

/** Vence em até N dias (inclusive) = "vence em breve". */
export const DUE_SOON_DAYS = 3;
/** "Esta semana" = hoje até N dias à frente. */
export const DUE_WEEK_DAYS = 7;
/** Atraso acima de N dias = atraso crítico (alerta na Caixa de entrada). */
export const OVERDUE_CRITICAL_DAYS = 10;
/** Enquanto seguir em atraso crítico, o alerta se repete no máximo a cada N dias. */
export const CRITICAL_REPEAT_DAYS = 7;

export type DueState = 'none' | 'ok' | 'soon' | 'today' | 'overdue' | 'critical';

export interface DueInfo {
  state: DueState;
  /**
   * Dias até o prazo: positivo = faltam, 0 = hoje, negativo = atraso.
   * `null` sem data.
   */
  diff: number | null;
  /** Dias de atraso (0 quando não está atrasada). */
  daysLate: number;
  /** Tarefa concluída: a data é só informação. */
  done: boolean;
}

const DIA_MS = 864e5;

/** Data local (meia-noite) de um YYYY-MM-DD; aceita ISO com hora. */
function dataLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Diferença em dias de calendário: b - a. Arredonda para absorver horário de verão. */
export function diasEntre(a: string, b: string): number {
  return Math.round((dataLocal(b).getTime() - dataLocal(a).getTime()) / DIA_MS);
}

/** Só 'done' encerra a tarefa; os demais status seguem contando prazo. */
export const tarefaConcluida = (status: TaskStatus) => status === 'done';

/**
 * Estado do prazo de uma tarefa. Tarefas concluídas nunca ficam atrasadas:
 * voltam 'ok' (data neutra) ou 'none'.
 */
export function getDueState(dueDate: string | undefined | null, status: TaskStatus, today: string = hojeLocal()): DueInfo {
  const done = tarefaConcluida(status);
  if (!dueDate) return { state: 'none', diff: null, daysLate: 0, done };
  const diff = diasEntre(today, dueDate);
  if (done) return { state: 'ok', diff, daysLate: 0, done };
  if (diff < 0) {
    const daysLate = -diff;
    return { state: daysLate > OVERDUE_CRITICAL_DAYS ? 'critical' : 'overdue', diff, daysLate, done };
  }
  if (diff === 0) return { state: 'today', diff, daysLate: 0, done };
  if (diff <= DUE_SOON_DAYS) return { state: 'soon', diff, daysLate: 0, done };
  return { state: 'ok', diff, daysLate: 0, done };
}

export const estaAtrasada = (s: DueState) => s === 'overdue' || s === 'critical';
/** Vence de hoje até DUE_WEEK_DAYS dias. Tarefa concluída não conta. */
export const estaNaSemana = (i: DueInfo) =>
  !i.done && i.diff !== null && i.diff >= 0 && i.diff <= DUE_WEEK_DAYS;
export const venceEmBreve = (s: DueState) => s === 'soon' || s === 'today';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "31/08", ou "31/08/25" quando o ano não é o atual. */
export function formatarDataCurta(iso: string, today: string = hojeLocal()): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y === today.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "6 jul", ou "6 jul 2027" quando o ano não é o atual. */
export function formatarDataExtensaCurta(iso: string, today: string = hojeLocal()): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const base = `${Number(d)} ${MESES_CURTOS[Number(m) - 1]}`;
  return y === today.slice(0, 4) ? base : `${base} ${y}`;
}

/**
 * Prazo da Lista de Minhas tarefas: atrasada = "há 93 dias"; até 7 dias à
 * frente = "Hoje", "Amanhã", "Em 2 dias"; depois, data curta ("6 jul").
 * Tarefa concluída mostra só a data.
 */
export function rotuloPrazoLista(info: DueInfo, dueDate: string | undefined | null, today: string = hojeLocal()): string {
  if (!dueDate) return '—';
  if (info.done || info.diff === null) return formatarDataExtensaCurta(dueDate, today);
  if (info.diff < 0) return `há ${plural(-info.diff, 'dia', 'dias')}`;
  if (info.diff === 0) return 'Hoje';
  if (info.diff === 1) return 'Amanhã';
  if (info.diff <= DUE_WEEK_DAYS) return `Em ${info.diff} dias`;
  return formatarDataExtensaCurta(dueDate, today);
}

/** "31/08/2026" — usado no tooltip. */
export function formatarDataCompleta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Rótulo textual do prazo (obrigatório: a cor nunca carrega o sentido sozinha). */
export function rotuloPrazo(info: DueInfo, dueDate: string | undefined | null, today: string = hojeLocal()): string {
  switch (info.state) {
    case 'none': return 'Sem prazo';
    case 'today': return 'Vence hoje';
    case 'soon': return info.diff === 1 ? 'Vence amanhã' : `Vence em ${info.diff} dias`;
    case 'overdue':
    case 'critical': return `Atrasada há ${plural(info.daysLate, 'dia', 'dias')}`;
    default: return dueDate ? formatarDataCurta(dueDate, today) : 'Sem prazo';
  }
}

/** Tooltip: data exata em todas as variantes. */
export function tooltipPrazo(dueDate: string | undefined | null): string {
  return dueDate ? `Vencimento: ${formatarDataCompleta(dueDate)}` : 'Sem prazo definido';
}

export const PESO_PRIORIDADE: Record<TaskPriority, number> = {
  urgent: 4, high: 3, medium: 2, low: 1, no_priority: 0,
};

/**
 * Ordenação padrão: vencimento mais urgente primeiro (sem prazo no fim),
 * prioridade como desempate.
 */
export function compararUrgencia(a: Pick<Task, 'dueDate' | 'priority'>, b: Pick<Task, 'dueDate' | 'priority'>): number {
  const da = a.dueDate?.slice(0, 10);
  const db = b.dueDate?.slice(0, 10);
  if (da && !db) return -1;
  if (!da && db) return 1;
  if (da && db && da !== db) return da < db ? -1 : 1;
  return (PESO_PRIORIDADE[b.priority] ?? 0) - (PESO_PRIORIDADE[a.priority] ?? 0);
}

/** Ordenação alternativa: prioridade primeiro, vencimento como desempate. */
export function compararPrioridade(a: Pick<Task, 'dueDate' | 'priority'>, b: Pick<Task, 'dueDate' | 'priority'>): number {
  const p = (PESO_PRIORIDADE[b.priority] ?? 0) - (PESO_PRIORIDADE[a.priority] ?? 0);
  if (p !== 0) return p;
  return compararUrgencia(a, b);
}

export interface ResumoPrazos {
  critical: number;
  overdue: number;
  /** Vencem hoje ou em até DUE_SOON_DAYS dias. */
  soon: number;
  /** Vencem esta semana (hoje até DUE_WEEK_DAYS dias). */
  week: number;
}

export function resumirPrazos(tarefas: Pick<Task, 'dueDate' | 'status'>[], today: string = hojeLocal()): ResumoPrazos {
  const r: ResumoPrazos = { critical: 0, overdue: 0, soon: 0, week: 0 };
  for (const t of tarefas) {
    const info = getDueState(t.dueDate, t.status, today);
    const { state } = info;
    if (estaNaSemana(info)) r.week++;
    if (state === 'critical') r.critical++;
    else if (state === 'overdue') r.overdue++;
    else if (venceEmBreve(state)) r.soon++;
  }
  return r;
}

/** Prefixo das chaves de alerta crítico de uma tarefa com um dado prazo. */
export const prefixoAlertaCritico = (taskId: string, dueDate: string) =>
  `deadline_${taskId}_critico_${dueDate.slice(0, 10)}_`;

/**
 * Chave do alerta de atraso crítico a disparar hoje, ou `null` se não deve
 * disparar. A chave guarda o dia do aviso: só repete depois de
 * CRITICAL_REPEAT_DAYS dias do último (contados do aviso real, não de um
 * calendário fixo) ou quando o prazo muda.
 */
export function chaveAlertaCritico(
  task: Pick<Task, 'id' | 'dueDate' | 'status'>,
  jaDisparados: string[],
  today: string = hojeLocal(),
): string | null {
  if (!task.dueDate || getDueState(task.dueDate, task.status, today).state !== 'critical') return null;
  const prefixo = prefixoAlertaCritico(task.id, task.dueDate);
  const ultimo = jaDisparados.filter(k => k.startsWith(prefixo)).map(k => k.slice(prefixo.length)).sort().pop();
  if (ultimo && diasEntre(ultimo, today) < CRITICAL_REPEAT_DAYS) return null;
  return prefixo + today;
}

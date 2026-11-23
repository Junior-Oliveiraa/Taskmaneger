// Antecessores das tarefas (migração 20261122150000_task_antecessores): a tarefa só
// segue depois que os antecessores forem concluídos.
import { hojeLocal } from './datas';
import type { Task, TaskStatus } from '../types';

/** task_id → ids dos antecessores. */
export type MapaAntecessores = Record<string, string[]>;
type TarefaMin = Pick<Task, 'id' | 'status' | 'dueDate'>;

/** Antecessores ainda não concluídos. Os que a pessoa não enxerga não contam. */
export function antecessoresPendentes<T extends TarefaMin>(taskId: string, mapa: MapaAntecessores, tasks: T[]): T[] {
  const ids = mapa[taskId];
  if (!ids?.length) return [];
  return ids.map(id => tasks.find(t => t.id === id)).filter((t): t is T => !!t && t.status !== 'done');
}

/** O antecessor passou do prazo sem ser concluído. */
export const antecessorAtrasado = (t: TarefaMin, hoje = hojeLocal()) =>
  t.status !== 'done' && !!t.dueDate && t.dueDate.slice(0, 10) < hoje;

/** `candidato` depende de `taskId`, direta ou indiretamente: não pode ser antecessor dela. */
export function criaCiclo(taskId: string, candidato: string, mapa: MapaAntecessores): boolean {
  const vistos = new Set<string>();
  const pilha = [candidato];
  while (pilha.length) {
    const id = pilha.pop()!;
    if (id === taskId) return true;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pilha.push(...(mapa[id] || []));
  }
  return false;
}

const AVANCO: TaskStatus[] = ['in_progress', 'approval', 'implementation', 'done'];

/** Mudança de status que faz a tarefa seguir. Voltar, pausar e refazer o que já estava em aprovação são livres. */
export function avancaStatus(atual: TaskStatus, novo: TaskStatus): boolean {
  if (atual === novo) return false;
  if (novo === 'rework') return atual !== 'approval' && atual !== 'implementation' && atual !== 'done';
  if (atual === 'done') return false; // reabrir
  return AVANCO.includes(novo);
}

/** Tarefas que podem seguir agora que `concluidaId` foi concluída. */
export function liberadasPor<T extends TarefaMin>(concluidaId: string, mapa: MapaAntecessores, tasks: T[]): T[] {
  const depois = tasks.map(t => t.id === concluidaId ? { ...t, status: 'done' as const } : t);
  return tasks.filter(t => t.status !== 'done' && mapa[t.id]?.includes(concluidaId) && antecessoresPendentes(t.id, mapa, depois).length === 0);
}

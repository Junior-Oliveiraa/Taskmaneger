// Responsáveis adicionais das tarefas (migração 20261121150000_task_responsaveis).
//
// task.assigneeId é o responsável principal; os demais vivem em
// task_responsaveis. O App junta tudo em task.responsaveis (principal primeiro)
// antes de entregar as tarefas às telas — use idsResponsaveis() para ler.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Task } from '../types';

const KEY = ['taskResponsaveis'];

const tabelaAusente = (msg?: string) => !!msg && /does not exist|schema cache|relation/i.test(msg);

/** Mapa task_id → ids dos responsáveis adicionais. */
async function fetchResponsaveis(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('task_responsaveis').select('task_id, user_id').order('created_at');
  if (error) {
    if (tabelaAusente(error.message)) return {};
    throw new Error(`[Responsáveis] carregar: ${error.message}`);
  }
  const mapa: Record<string, string[]> = {};
  for (const r of data || []) (mapa[r.task_id] ||= []).push(r.user_id);
  return mapa;
}

/** Todos os responsáveis da tarefa, principal primeiro. */
export function idsResponsaveis(task: Pick<Task, 'assigneeId' | 'responsaveis'>): string[] {
  if (task.responsaveis) return task.responsaveis;
  return task.assigneeId ? [task.assigneeId] : [];
}

export function temResponsavel(task: Pick<Task, 'assigneeId' | 'responsaveis'>, userId: string): boolean {
  return idsResponsaveis(task).includes(userId);
}

/** Junta os adicionais em task.responsaveis (principal primeiro, sem repetir). */
export function comResponsaveis(tasks: Task[], extras: Record<string, string[]>): Task[] {
  return tasks.map(t => {
    const add = extras[t.id];
    if (!add?.length) return t.responsaveis ? { ...t, responsaveis: undefined } : t;
    const ids = t.assigneeId ? [t.assigneeId, ...add.filter(id => id !== t.assigneeId)] : [...add];
    return { ...t, responsaveis: ids };
  });
}

export function useResponsaveisExtras() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: fetchResponsaveis, staleTime: 30_000, refetchInterval: 3 * 60_000 });

  /** Adiciona/remove um responsável adicional (cache na hora, banco em seguida). */
  const alterar = async (taskId: string, userId: string, incluir: boolean) => {
    queryClient.setQueryData<Record<string, string[]>>(KEY, prev => {
      const next = { ...(prev || {}) };
      const atual = (next[taskId] || []).filter(id => id !== userId);
      next[taskId] = incluir ? [...atual, userId] : atual;
      return next;
    });
    const { error } = incluir
      ? await supabase.from('task_responsaveis').upsert({ task_id: taskId, user_id: userId }, { ignoreDuplicates: true })
      : await supabase.from('task_responsaveis').delete().eq('task_id', taskId).eq('user_id', userId);
    if (error) {
      queryClient.invalidateQueries({ queryKey: KEY });
      throw new Error(error.message);
    }
  };

  return { extras: query.data ?? {}, alterar };
}

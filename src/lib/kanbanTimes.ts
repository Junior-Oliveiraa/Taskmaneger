// Times do Quadro Kanban (migração 20261119130000_kanban_times).
//
// Uma pessoa pode estar em vários times. Quem não está em nenhum fica fora do
// quadro. Enquanto nenhum time existir, o quadro mostra todo mundo.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export interface KanbanTime {
  id: string;
  nome: string;
  sortOrder: number;
  membros: string[]; // ids de users_profile
}

export const KANBAN_TIMES_KEY = ['kanbanTimes'];

export async function fetchKanbanTimes(): Promise<KanbanTime[]> {
  const [times, membros] = await Promise.all([
    supabase.from('kanban_times').select('id, nome, sort_order').order('sort_order').order('created_at'),
    supabase.from('kanban_time_membros').select('time_id, user_id'),
  ]);
  if (times.error) throw new Error(`[Times] carregar: ${times.error.message}`);
  if (membros.error) throw new Error(`[Times] carregar membros: ${membros.error.message}`);
  return (times.data || []).map(t => ({
    id: t.id,
    nome: t.nome,
    sortOrder: t.sort_order,
    membros: (membros.data || []).filter(m => m.time_id === t.id).map(m => m.user_id),
  }));
}

export async function criarKanbanTime(nome: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('kanban_times').insert({ nome: nome.trim(), sort_order: sortOrder });
  if (error) throw new Error(`[Times] criar: ${error.message}`);
}

export async function renomearKanbanTime(id: string, nome: string): Promise<void> {
  const { error } = await supabase
    .from('kanban_times')
    .update({ nome: nome.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`[Times] renomear: ${error.message}`);
}

export async function excluirKanbanTime(id: string): Promise<void> {
  const { error } = await supabase.from('kanban_times').delete().eq('id', id);
  if (error) throw new Error(`[Times] excluir: ${error.message}`);
}

export async function definirMembroKanbanTime(timeId: string, userId: string, membro: boolean): Promise<void> {
  const { error } = membro
    ? await supabase.from('kanban_time_membros').upsert({ time_id: timeId, user_id: userId }, { ignoreDuplicates: true })
    : await supabase.from('kanban_time_membros').delete().eq('time_id', timeId).eq('user_id', userId);
  if (error) throw new Error(`[Times] ${membro ? 'adicionar' : 'remover'} membro: ${error.message}`);
}

export function useKanbanTimes() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KANBAN_TIMES_KEY,
    queryFn: fetchKanbanTimes,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  return {
    times: query.data ?? [],
    carregando: query.isLoading,
    recarregar: () => queryClient.invalidateQueries({ queryKey: KANBAN_TIMES_KEY }),
  };
}

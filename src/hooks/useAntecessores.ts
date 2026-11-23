// Antecessores das tarefas: leitura e gravação. As regras estão em lib/antecessores.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { MapaAntecessores } from '../lib/antecessores';

const KEY = ['taskAntecessores'];
const tabelaAusente = (msg?: string) => !!msg && /does not exist|schema cache|relation/i.test(msg);

async function fetchAntecessores(): Promise<{ mapa: MapaAntecessores; ativa: boolean }> {
  const { data, error } = await supabase.from('task_antecessores').select('task_id, antecessor_id').order('created_at');
  if (error) {
    if (tabelaAusente(error.message)) return { mapa: {}, ativa: false };
    throw new Error(`[Antecessores] carregar: ${error.message}`);
  }
  const mapa: MapaAntecessores = {};
  for (const r of data || []) (mapa[r.task_id] ||= []).push(r.antecessor_id);
  return { mapa, ativa: true };
}

const VAZIO: MapaAntecessores = {};

export function useAntecessores() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: fetchAntecessores, staleTime: 30_000, refetchInterval: 3 * 60_000 });

  /** Adiciona/remove um antecessor (cache na hora, banco em seguida). */
  const alterar = async (taskId: string, antecessorId: string, incluir: boolean) => {
    queryClient.setQueryData<{ mapa: MapaAntecessores; ativa: boolean }>(KEY, prev => {
      const mapa = { ...(prev?.mapa || {}) };
      const atual = (mapa[taskId] || []).filter(id => id !== antecessorId);
      mapa[taskId] = incluir ? [...atual, antecessorId] : atual;
      return { mapa, ativa: prev?.ativa ?? true };
    });
    const { error } = incluir
      ? await supabase.from('task_antecessores').upsert({ task_id: taskId, antecessor_id: antecessorId }, { ignoreDuplicates: true })
      : await supabase.from('task_antecessores').delete().eq('task_id', taskId).eq('antecessor_id', antecessorId);
    if (error) {
      queryClient.invalidateQueries({ queryKey: KEY });
      throw new Error(`O antecessor não foi salvo. ${error.message}`);
    }
  };

  // Sem a migração a consulta responde `ativa: false`; carregando, vale o padrão.
  return { mapa: query.data?.mapa ?? VAZIO, ativa: query.data?.ativa ?? true, alterar };
}

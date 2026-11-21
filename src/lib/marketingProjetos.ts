// Projetos e Portfólios do menu Marketing (migração 20261121120000_marketing_projetos).
//
// Um projeto agrupa tarefas (no máximo um projeto por tarefa) e pode pertencer
// a um portfólio. A ligação tarefa → projeto vive em marketing_projeto_tarefas.
// Se a migração ainda não foi aplicada, as buscas devolvem listas vazias em vez
// de derrubar a tela.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export type ProjetoStatus = 'ativo' | 'pausado' | 'concluido';

export interface MarketingPortfolio {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  sortOrder: number;
}

export interface MarketingProjeto {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  status: ProjetoStatus;
  portfolioId: string | null;
  sortOrder: number;
}

export const STATUS_PROJETO: { id: ProjetoStatus; label: string; classe: string }[] = [
  { id: 'ativo',     label: 'Ativo',     classe: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'pausado',   label: 'Pausado',   classe: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'concluido', label: 'Concluído', classe: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
];

export const CORES_PROJETO = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#64748b'];

const PROJETOS_KEY = ['marketingProjetos'];
const PORTFOLIOS_KEY = ['marketingPortfolios'];
const LIGACOES_KEY = ['marketingProjetoTarefas'];

// Tabela inexistente (migração pendente) não é erro para a tela.
const tabelaAusente = (msg?: string) => !!msg && /does not exist|schema cache|relation/i.test(msg);

async function fetchProjetos(): Promise<MarketingProjeto[]> {
  const { data, error } = await supabase
    .from('marketing_projetos')
    .select('id, nome, descricao, cor, status, portfolio_id, sort_order')
    .order('sort_order').order('created_at');
  if (error) {
    if (tabelaAusente(error.message)) return [];
    throw new Error(`[Projetos] carregar: ${error.message}`);
  }
  return (data || []).map(p => ({
    id: p.id, nome: p.nome, descricao: p.descricao ?? '', cor: p.cor, status: p.status,
    portfolioId: p.portfolio_id, sortOrder: p.sort_order,
  }));
}

async function fetchPortfolios(): Promise<MarketingPortfolio[]> {
  const { data, error } = await supabase
    .from('marketing_portfolios')
    .select('id, nome, descricao, cor, sort_order')
    .order('sort_order').order('created_at');
  if (error) {
    if (tabelaAusente(error.message)) return [];
    throw new Error(`[Portfólios] carregar: ${error.message}`);
  }
  return (data || []).map(p => ({ id: p.id, nome: p.nome, descricao: p.descricao ?? '', cor: p.cor, sortOrder: p.sort_order }));
}

/** Mapa task_id → projeto_id. */
async function fetchLigacoes(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('marketing_projeto_tarefas').select('task_id, projeto_id');
  if (error) {
    if (tabelaAusente(error.message)) return {};
    throw new Error(`[Projetos] carregar tarefas: ${error.message}`);
  }
  const mapa: Record<string, string> = {};
  for (const l of data || []) mapa[l.task_id] = l.projeto_id;
  return mapa;
}

export async function salvarProjeto(p: Partial<MarketingProjeto> & { nome: string }): Promise<string> {
  const row = {
    nome: p.nome.trim(),
    descricao: p.descricao ?? '',
    cor: p.cor ?? CORES_PROJETO[0],
    status: p.status ?? 'ativo',
    portfolio_id: p.portfolioId ?? null,
    updated_at: new Date().toISOString(),
  };
  if (p.id) {
    const { error } = await supabase.from('marketing_projetos').update(row).eq('id', p.id);
    if (error) throw new Error(`[Projetos] salvar: ${error.message}`);
    return p.id;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('marketing_projetos')
    .insert({ ...row, sort_order: p.sortOrder ?? 0, created_by: user?.id ?? null })
    .select('id').single();
  if (error) throw new Error(`[Projetos] criar: ${error.message}`);
  return data.id;
}

export async function excluirProjeto(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_projetos').delete().eq('id', id);
  if (error) throw new Error(`[Projetos] excluir: ${error.message}`);
}

export async function salvarPortfolio(p: Partial<MarketingPortfolio> & { nome: string }): Promise<string> {
  const row = {
    nome: p.nome.trim(),
    descricao: p.descricao ?? '',
    cor: p.cor ?? CORES_PROJETO[1],
    updated_at: new Date().toISOString(),
  };
  if (p.id) {
    const { error } = await supabase.from('marketing_portfolios').update(row).eq('id', p.id);
    if (error) throw new Error(`[Portfólios] salvar: ${error.message}`);
    return p.id;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('marketing_portfolios')
    .insert({ ...row, sort_order: p.sortOrder ?? 0, created_by: user?.id ?? null })
    .select('id').single();
  if (error) throw new Error(`[Portfólios] criar: ${error.message}`);
  return data.id;
}

export async function excluirPortfolio(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_portfolios').delete().eq('id', id);
  if (error) throw new Error(`[Portfólios] excluir: ${error.message}`);
}

/** projetoId null tira a tarefa do projeto. */
export async function definirProjetoDaTarefa(taskId: string, projetoId: string | null): Promise<void> {
  const { error } = projetoId
    ? await supabase.from('marketing_projeto_tarefas').upsert({ task_id: taskId, projeto_id: projetoId }, { onConflict: 'task_id' })
    : await supabase.from('marketing_projeto_tarefas').delete().eq('task_id', taskId);
  if (error) throw new Error(`[Projetos] ${projetoId ? 'vincular' : 'desvincular'} tarefa: ${error.message}`);
}

export function useMarketingProjetos() {
  const queryClient = useQueryClient();
  const opts = { staleTime: 30_000, refetchInterval: 3 * 60_000 };
  const projetos = useQuery({ queryKey: PROJETOS_KEY, queryFn: fetchProjetos, ...opts });
  const portfolios = useQuery({ queryKey: PORTFOLIOS_KEY, queryFn: fetchPortfolios, ...opts });
  const ligacoes = useQuery({ queryKey: LIGACOES_KEY, queryFn: fetchLigacoes, ...opts });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: PROJETOS_KEY });
    queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY });
    queryClient.invalidateQueries({ queryKey: LIGACOES_KEY });
  };

  /**
   * Atualiza o cache na hora e grava no banco; em erro, recarrega do banco.
   * `aguardar`: promessa a esperar antes de gravar (ex.: a tarefa ser criada).
   */
  const vincularTarefa = async (taskId: string, projetoId: string | null, aguardar?: Promise<unknown>) => {
    queryClient.setQueryData<Record<string, string>>(LIGACOES_KEY, prev => {
      const next = { ...(prev || {}) };
      if (projetoId) next[taskId] = projetoId; else delete next[taskId];
      return next;
    });
    try {
      if (aguardar) await aguardar;
      await definirProjetoDaTarefa(taskId, projetoId);
    } catch (e) {
      queryClient.invalidateQueries({ queryKey: LIGACOES_KEY });
      throw e;
    }
  };

  return {
    projetos: projetos.data ?? [],
    portfolios: portfolios.data ?? [],
    projetoDaTarefa: ligacoes.data ?? {},
    carregando: projetos.isLoading || portfolios.isLoading || ligacoes.isLoading,
    recarregar,
    vincularTarefa,
  };
}

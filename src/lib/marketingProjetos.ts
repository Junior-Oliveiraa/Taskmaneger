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
  /** Data de entrega (YYYY-MM-DD); limita a dos projetos do portfólio. */
  dataEntrega: string | null;
}

export interface MarketingProjeto {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  status: ProjetoStatus;
  portfolioId: string | null;
  sortOrder: number;
  /** Data de entrega (YYYY-MM-DD); limita o prazo das tarefas do projeto. */
  dataEntrega: string | null;
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
const MEMBROS_KEY = ['marketingProjetoMembros'];

// Tabela inexistente (migração pendente) não é erro para a tela.
const tabelaAusente = (msg?: string) => !!msg && /does not exist|schema cache|relation/i.test(msg);

/**
 * Busca com data_entrega e, se a coluna ainda não existir (migração de datas
 * pendente), repete sem ela em vez de esconder a lista inteira.
 */
async function selecionar(tabela: string, colunas: string): Promise<{ data: any[]; ausente: boolean }> {
  const tentar = (cols: string) => supabase.from(tabela).select(cols).order('sort_order').order('created_at');
  let { data, error } = await tentar(`${colunas}, data_entrega`);
  if (error && /data_entrega/i.test(error.message)) ({ data, error } = await tentar(colunas));
  if (error) {
    if (tabelaAusente(error.message)) return { data: [], ausente: true };
    throw new Error(`[${tabela}] carregar: ${error.message}`);
  }
  return { data: (data as any[]) || [], ausente: false };
}

async function fetchProjetos(): Promise<MarketingProjeto[]> {
  const { data } = await selecionar('marketing_projetos', 'id, nome, descricao, cor, status, portfolio_id, sort_order');
  return data.map(p => ({
    id: p.id, nome: p.nome, descricao: p.descricao ?? '', cor: p.cor, status: p.status,
    portfolioId: p.portfolio_id, sortOrder: p.sort_order, dataEntrega: p.data_entrega ?? null,
  }));
}

async function fetchPortfolios(): Promise<MarketingPortfolio[]> {
  const { data } = await selecionar('marketing_portfolios', 'id, nome, descricao, cor, sort_order');
  return data.map(p => ({
    id: p.id, nome: p.nome, descricao: p.descricao ?? '', cor: p.cor, sortOrder: p.sort_order,
    dataEntrega: p.data_entrega ?? null,
  }));
}

/** Data em DD/MM/AAAA a partir de YYYY-MM-DD. */
export const formatarData = (d?: string | null) => {
  if (!d) return '';
  const [a, m, dia] = d.slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
};

/** Limite das tarefas de um projeto: a data dele ou, sem data, a do portfólio. */
export function limiteDoProjeto(projeto: MarketingProjeto | undefined | null, portfolios: MarketingPortfolio[]): string | null {
  if (!projeto) return null;
  if (projeto.dataEntrega) return projeto.dataEntrega;
  return portfolios.find(p => p.id === projeto.portfolioId)?.dataEntrega ?? null;
}

/** Maior prazo (YYYY-MM-DD) entre as tarefas, ou null. */
export function maiorPrazo(tarefas: { dueDate?: string }[]): string | null {
  let maior: string | null = null;
  for (const t of tarefas) {
    const d = t.dueDate?.slice(0, 10);
    if (d && (!maior || d > maior)) maior = d;
  }
  return maior;
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
    ...(p.dataEntrega !== undefined ? { data_entrega: p.dataEntrega || null } : {}),
    updated_at: new Date().toISOString(),
  };
  if (p.id) {
    const { error } = await supabase.from('marketing_projetos').update(row).eq('id', p.id);
    if (error) throw new Error(error.message);
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
    ...(p.dataEntrega !== undefined ? { data_entrega: p.dataEntrega || null } : {}),
    updated_at: new Date().toISOString(),
  };
  if (p.id) {
    const { error } = await supabase.from('marketing_portfolios').update(row).eq('id', p.id);
    if (error) throw new Error(error.message);
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

/** Mapa projeto_id → ids de users_profile cadastrados como membros. */
async function fetchMembros(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('marketing_projeto_membros').select('projeto_id, user_id');
  if (error) {
    if (tabelaAusente(error.message)) return {};
    throw new Error(`[Projetos] carregar membros: ${error.message}`);
  }
  const mapa: Record<string, string[]> = {};
  for (const m of data || []) (mapa[m.projeto_id] ||= []).push(m.user_id);
  return mapa;
}

export async function definirMembroProjeto(projetoId: string, userId: string, membro: boolean): Promise<void> {
  const { error } = membro
    ? await supabase.from('marketing_projeto_membros').upsert({ projeto_id: projetoId, user_id: userId }, { ignoreDuplicates: true })
    : await supabase.from('marketing_projeto_membros').delete().eq('projeto_id', projetoId).eq('user_id', userId);
  if (error) throw new Error(`[Projetos] ${membro ? 'adicionar' : 'remover'} membro: ${error.message}`);
}

/** projetoId null tira a tarefa do projeto. */
export async function definirProjetoDaTarefa(taskId: string, projetoId: string | null): Promise<void> {
  const { error } = projetoId
    ? await supabase.from('marketing_projeto_tarefas').upsert({ task_id: taskId, projeto_id: projetoId }, { onConflict: 'task_id' })
    : await supabase.from('marketing_projeto_tarefas').delete().eq('task_id', taskId);
  if (error) throw new Error(error.message);
}

export function useMarketingProjetos() {
  const queryClient = useQueryClient();
  const opts = { staleTime: 30_000, refetchInterval: 3 * 60_000 };
  const projetos = useQuery({ queryKey: PROJETOS_KEY, queryFn: fetchProjetos, ...opts });
  const portfolios = useQuery({ queryKey: PORTFOLIOS_KEY, queryFn: fetchPortfolios, ...opts });
  const ligacoes = useQuery({ queryKey: LIGACOES_KEY, queryFn: fetchLigacoes, ...opts });
  const membros = useQuery({ queryKey: MEMBROS_KEY, queryFn: fetchMembros, ...opts });

  const alterarMembro = async (projetoId: string, userId: string, membro: boolean) => {
    queryClient.setQueryData<Record<string, string[]>>(MEMBROS_KEY, prev => {
      const next = { ...(prev || {}) };
      const atual = (next[projetoId] || []).filter(id => id !== userId);
      next[projetoId] = membro ? [...atual, userId] : atual;
      return next;
    });
    try {
      await definirMembroProjeto(projetoId, userId, membro);
    } catch (e) {
      queryClient.invalidateQueries({ queryKey: MEMBROS_KEY });
      throw e;
    }
  };

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: MEMBROS_KEY });
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
    /** Prazo máximo da tarefa pela hierarquia (projeto → portfólio), ou null. */
    limiteDaTarefa: (taskId: string): { data: string; projeto: string } | null => {
      const projeto = (projetos.data ?? []).find(p => p.id === ligacoes.data?.[taskId]);
      const data = limiteDoProjeto(projeto, portfolios.data ?? []);
      return projeto && data ? { data, projeto: projeto.nome } : null;
    },
    /** Membros cadastrados por projeto (ids de users_profile). */
    membrosDoProjeto: membros.data ?? {},
    alterarMembro,
    carregando: projetos.isLoading || portfolios.isLoading || ligacoes.isLoading,
    recarregar,
    vincularTarefa,
  };
}

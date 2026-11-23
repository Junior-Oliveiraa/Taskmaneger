// Projetos do menu Marketing (migração 20261121120000_marketing_projetos).
//
// Um projeto agrupa tarefas (no máximo um projeto por tarefa). A ligação
// tarefa → projeto vive em marketing_projeto_tarefas.
// Se a migração ainda não foi aplicada, as buscas devolvem listas vazias em vez
// de derrubar a tela.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { fetchProjects } from './api';
import type { TaskPriority } from '../types';

export type ProjetoStatus = 'ativo' | 'pausado' | 'concluido';

export interface MarketingProjeto {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  status: ProjetoStatus;
  sortOrder: number;
  /** Data de entrega (YYYY-MM-DD); limita o prazo das tarefas do projeto. */
  dataEntrega: string | null;
  prioridade: TaskPriority;
  /** Início planejado (YYYY-MM-DD). */
  dataInicio: string | null;
  /** Empreendimentos (ids de projects), via marketing_projeto_empreendimentos. */
  empreendimentoIds: string[];
}

/**
 * Prioridade, início e empreendimentos do projeto (migrações
 * 20261122160000_marketing_projetos_propriedades e
 * 20261122170000_marketing_projeto_empreendimentos). Sem elas, os campos somem
 * do formulário e nada é gravado.
 */
export const propriedadesProjeto = { ativa: true };

export const STATUS_PROJETO: { id: ProjetoStatus; label: string; classe: string }[] = [
  { id: 'ativo',     label: 'Ativo',     classe: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'pausado',   label: 'Pausado',   classe: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'concluido', label: 'Concluído', classe: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
];

export const CORES_PROJETO = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#64748b'];

const PROJETOS_KEY = ['marketingProjetos'];
const LIGACOES_KEY = ['marketingProjetoTarefas'];
const MEMBROS_KEY = ['marketingProjetoMembros'];

// Tabela inexistente (migração pendente) não é erro para a tela.
const tabelaAusente = (msg?: string) => !!msg && /does not exist|schema cache|relation/i.test(msg);

/**
 * Busca com as colunas opcionais e, se alguma ainda não existir (migração
 * pendente), repete sem ela em vez de esconder a lista inteira.
 */
async function selecionar(tabela: string, colunas: string): Promise<{ data: any[]; ausente: boolean }> {
  const tentar = (cols: string) => supabase.from(tabela).select(cols).order('sort_order').order('created_at');
  const extras = tabela === 'marketing_projetos'
    ? { flag: propriedadesProjeto, cols: 'prioridade, data_inicio, marketing_projeto_empreendimentos(empreendimento_id)' }
    : null;
  if (extras) {
    const completa = await tentar(`${colunas}, data_entrega, ${extras.cols}`);
    if (!completa.error) {
      extras.flag.ativa = true;
      return { data: (completa.data as any[]) || [], ausente: false };
    }
    const semColunas = /status|prioridade|data_inicio|_empreendimentos|relationship|data_entrega/i.test(completa.error.message);
    // Rede ou permissão não desliga o recurso (senão salvar perderia os campos).
    if (!semColunas && !tabelaAusente(completa.error.message)) throw new Error(`[${tabela}] carregar: ${completa.error.message}`);
    extras.flag.ativa = false;
  }
  let { data, error } = await tentar(`${colunas}, data_entrega`);
  if (error && /data_entrega/i.test(error.message)) ({ data, error } = await tentar(colunas));
  if (error) {
    if (tabelaAusente(error.message)) return { data: [], ausente: true };
    throw new Error(`[${tabela}] carregar: ${error.message}`);
  }
  return { data: (data as any[]) || [], ausente: false };
}

async function fetchProjetos(): Promise<MarketingProjeto[]> {
  const { data } = await selecionar('marketing_projetos', 'id, nome, descricao, cor, status, sort_order');
  return data.map(p => ({
    id: p.id, nome: p.nome, descricao: p.descricao ?? '', cor: p.cor, status: p.status,
    sortOrder: p.sort_order, dataEntrega: p.data_entrega ?? null,
    prioridade: p.prioridade ?? 'no_priority', dataInicio: p.data_inicio ?? null,
    empreendimentoIds: (p.marketing_projeto_empreendimentos ?? []).map((e: any) => e.empreendimento_id),
  }));
}

/** Data em DD/MM/AAAA a partir de YYYY-MM-DD. */
export const formatarData = (d?: string | null) => {
  if (!d) return '';
  const [a, m, dia] = d.slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
};

/** Limite das tarefas de um projeto: a data de entrega dele. */
export function limiteDoProjeto(projeto: MarketingProjeto | undefined | null): string | null {
  return projeto?.dataEntrega ?? null;
}

/** Por que a tarefa não cabe no projeto (o prazo dela passa da entrega), ou null. */
export function conflitoDePrazo(projeto: MarketingProjeto | undefined | null, dueDate?: string | null): string | null {
  const limite = limiteDoProjeto(projeto);
  return limite && dueDate && dueDate.slice(0, 10) > limite
    ? `O prazo da tarefa passa da entrega deste projeto (${formatarData(limite)}). Ajuste o prazo antes.`
    : null;
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
    ...(p.dataEntrega !== undefined ? { data_entrega: p.dataEntrega || null } : {}),
    ...(propriedadesProjeto.ativa ? {
      ...(p.prioridade !== undefined ? { prioridade: p.prioridade } : {}),
      ...(p.dataInicio !== undefined ? { data_inicio: p.dataInicio || null } : {}),
    } : {}),
    updated_at: new Date().toISOString(),
  };
  let id = p.id;
  if (id) {
    const { error } = await supabase.from('marketing_projetos').update(row).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('marketing_projetos')
      .insert({ ...row, sort_order: p.sortOrder ?? 0, created_by: user?.id ?? null })
      .select('id').single();
    if (error) throw new Error(`[Projetos] criar: ${error.message}`);
    id = data.id as string;
  }
  if (propriedadesProjeto.ativa && p.empreendimentoIds !== undefined) {
    await definirEmpreendimentos('marketing_projeto_empreendimentos', 'projeto_id', id, p.empreendimentoIds);
  }
  return id;
}

/** Deixa o projeto exatamente com estes empreendimentos. */
async function definirEmpreendimentos(tabela: string, chave: string, donoId: string, ids: string[]): Promise<void> {
  let apagar = supabase.from(tabela).delete().eq(chave, donoId);
  if (ids.length > 0) apagar = apagar.not('empreendimento_id', 'in', `(${ids.map(i => `"${i.replace(/"/g, '""')}"`).join(',')})`);
  const { error: erroApagar } = await apagar;
  if (erroApagar) throw new Error(`[Empreendimentos] ${erroApagar.message}`);
  if (ids.length === 0) return;
  const { error } = await supabase.from(tabela).upsert(ids.map(e => ({ [chave]: donoId, empreendimento_id: e })), { ignoreDuplicates: true });
  if (error) throw new Error(`[Empreendimentos] ${error.message}`);
}

/**
 * Por que estas datas não valem para o projeto, ou null. Regras: início até a
 * entrega; entrega não antes da tarefa mais tardia.
 */
export function validarDatasProjeto({ dataInicio, dataEntrega, maiorTarefa }: {
  dataInicio?: string | null;
  dataEntrega?: string | null;
  maiorTarefa?: string | null;
}): string | null {
  if (dataEntrega && maiorTarefa && maiorTarefa > dataEntrega) {
    return `Há tarefas deste projeto com prazo em ${formatarData(maiorTarefa)}, depois da entrega (${formatarData(dataEntrega)}). Ajuste os prazos antes.`;
  }
  if (dataInicio && dataEntrega && dataInicio > dataEntrega) {
    return `O início (${formatarData(dataInicio)}) não pode ser depois da entrega (${formatarData(dataEntrega)}).`;
  }
  return null;
}

export async function excluirProjeto(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_projetos').delete().eq('id', id);
  if (error) throw new Error(`[Projetos] excluir: ${error.message}`);
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

const SEM_EMPREENDIMENTOS: Awaited<ReturnType<typeof fetchProjects>> = [];

/** Empreendimentos: o mesmo cache do App. */
export function useEmpreendimentos() {
  return useQuery({ queryKey: ['projects'], queryFn: fetchProjects, staleTime: 30_000 }).data ?? SEM_EMPREENDIMENTOS;
}

export function useMarketingProjetos() {
  const queryClient = useQueryClient();
  const opts = { staleTime: 30_000, refetchInterval: 3 * 60_000 };
  const projetos = useQuery({ queryKey: PROJETOS_KEY, queryFn: fetchProjetos, ...opts });
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

  /** Muda campos de um projeto: a lista atualiza na hora; em erro, volta ao banco. */
  const alterarProjeto = async (projeto: MarketingProjeto, mudanca: Partial<MarketingProjeto>) => {
    queryClient.setQueryData<MarketingProjeto[]>(PROJETOS_KEY, prev =>
      (prev || []).map(p => p.id === projeto.id ? { ...p, ...mudanca } : p));
    try {
      await salvarProjeto({ ...projeto, ...mudanca });
    } catch (e) {
      queryClient.invalidateQueries({ queryKey: PROJETOS_KEY });
      throw e;
    }
  };

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: MEMBROS_KEY });
    queryClient.invalidateQueries({ queryKey: PROJETOS_KEY });
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
    projetoDaTarefa: ligacoes.data ?? {},
    /** Prazo máximo da tarefa (a entrega do projeto dela), ou null. */
    limiteDaTarefa: (taskId: string): { data: string; projeto: string } | null => {
      const projeto = (projetos.data ?? []).find(p => p.id === ligacoes.data?.[taskId]);
      const data = limiteDoProjeto(projeto);
      return projeto && data ? { data, projeto: projeto.nome } : null;
    },
    /** Membros cadastrados por projeto (ids de users_profile). */
    membrosDoProjeto: membros.data ?? {},
    alterarMembro,
    alterarProjeto,
    carregando: projetos.isLoading || ligacoes.isLoading,
    recarregar,
    vincularTarefa,
  };
}

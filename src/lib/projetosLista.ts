// Lista de projetos do Marketing: agregação, filtros, ordem e preferências.
// Sem React, para poder ser testada.
import type { Project, Task } from '../types';
import type { MarketingProjeto, ProjetoStatus } from './marketingProjetos';
import { hojeLocal, somarDias } from './datas';
import { diasEntre, tarefaConcluida } from './prazo';

/** "Entregas próximas" = de hoje até N dias à frente. */
export const ENTREGA_PROXIMA_DIAS = 30;
/** "Projeto" aberto que reúne as tarefas sem projeto. */
export const SEM_PROJETO = 'sem-projeto';
export const ROTULO_SEM_PROJETO = 'Sem projeto alocado';

// Mesma regra de temResponsavel (lib/responsaveis), que não pode vir aqui: arrasta o cliente Supabase.
const ehResponsavel = (t: Pick<Task, 'assigneeId' | 'responsaveis'>, id: string) =>
  t.responsaveis ? t.responsaveis.includes(id) : t.assigneeId === id;

export interface ResumoTarefas { total: number; concluidas: number; atrasadas: number }

export function resumir(tarefas: Pick<Task, 'status' | 'dueDate'>[], hoje: string = hojeLocal()): ResumoTarefas {
  return {
    total: tarefas.length,
    concluidas: tarefas.filter(t => tarefaConcluida(t.status)).length,
    atrasadas: tarefas.filter(t => !tarefaConcluida(t.status) && !!t.dueDate && t.dueDate.slice(0, 10) < hoje).length,
  };
}

export const percentual = (r: Pick<ResumoTarefas, 'total' | 'concluidas'>) => r.total ? Math.round((r.concluidas / r.total) * 100) : 0;

export interface LinhaProjeto {
  projeto: MarketingProjeto;
  /** Na ordem de cadastro; os que não existem mais ficam de fora. */
  empreendimentos: Pick<Project, 'id' | 'name'>[];
  tarefas: Task[];
  resumo: ResumoTarefas;
  /** Data de entrega do projeto. */
  entrega: string | null;
  /** Dias desde a entrega (0 = no prazo, sem data ou concluído). */
  diasAtraso: number;
  /** Sou membro cadastrado ou responsável por alguma tarefa. */
  meu: boolean;
}

export function montarLinhas({ projetos, tasks, projetoDaTarefa, membrosDoProjeto, empreendimentos = [], usuarioId, hoje = hojeLocal() }: {
  projetos: MarketingProjeto[];
  tasks: Task[];
  projetoDaTarefa: Record<string, string>;
  membrosDoProjeto: Record<string, string[]>;
  empreendimentos?: Pick<Project, 'id' | 'name'>[];
  usuarioId?: string;
  hoje?: string;
}): LinhaProjeto[] {
  const empreendimentoPorId = new Map(empreendimentos.map(e => [e.id, e]));
  const porProjeto: Record<string, Task[]> = {};
  for (const t of tasks) {
    const pid = projetoDaTarefa[t.id];
    if (pid) (porProjeto[pid] ||= []).push(t);
  }
  return projetos.map(projeto => {
    const tarefas = porProjeto[projeto.id] || [];
    const entrega = projeto.dataEntrega || null;
    return {
      projeto,
      empreendimentos: projeto.empreendimentoIds.flatMap(id => empreendimentoPorId.get(id) ?? []),
      tarefas,
      resumo: resumir(tarefas, hoje),
      entrega,
      diasAtraso: projeto.status !== 'concluido' && entrega && entrega < hoje ? diasEntre(entrega, hoje) : 0,
      meu: !!usuarioId && ((membrosDoProjeto[projeto.id] || []).includes(usuarioId) || tarefas.some(t => ehResponsavel(t, usuarioId))),
    };
  });
}

/** Linha das tarefas sem projeto, fora dos indicadores; null se não há nenhuma em aberto. */
export function montarSemProjeto({ tasks, projetoDaTarefa, usuarioId, hoje = hojeLocal() }: {
  tasks: Task[];
  projetoDaTarefa: Record<string, string>;
  usuarioId?: string;
  hoje?: string;
}): LinhaProjeto | null {
  const tarefas = tasks.filter(t => !projetoDaTarefa[t.id]);
  if (!tarefas.some(t => !tarefaConcluida(t.status))) return null;
  return {
    projeto: {
      id: SEM_PROJETO, nome: ROTULO_SEM_PROJETO, descricao: '', cor: '#64748b', status: 'ativo', sortOrder: 0,
      dataEntrega: null, prioridade: 'no_priority', dataInicio: null, empreendimentoIds: [],
    },
    empreendimentos: [],
    tarefas,
    resumo: resumir(tarefas, hoje),
    entrega: null,
    diasAtraso: 0,
    meu: !!usuarioId && tarefas.some(t => !tarefaConcluida(t.status) && ehResponsavel(t, usuarioId)),
  };
}

// ─── Filtros ─────────────────────────────────────────────────────────

export type AbaProjetos = ProjetoStatus | 'todos';
/** Recortes abertos pelos indicadores. */
export type Foco = 'vencidas' | 'proximas' | 'com_atraso';

export interface FiltrosProjetos {
  busca: string;
  soMeus: boolean;
  foco: Foco | null;
}

export const entregaProxima = (l: LinhaProjeto, hoje: string = hojeLocal(), limite: string = somarDias(ENTREGA_PROXIMA_DIAS)) =>
  l.projeto.status !== 'concluido' && !!l.entrega && l.entrega >= hoje && l.entrega <= limite;

/** Só projetos ativos: é o recorte dos indicadores de tarefas. */
export const comTarefaAtrasada = (l: LinhaProjeto) => l.projeto.status === 'ativo' && l.resumo.atrasadas > 0;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function casaFiltros(l: LinhaProjeto, f: FiltrosProjetos): boolean {
  if (f.soMeus && !l.meu) return false;
  if (f.foco === 'vencidas' && l.diasAtraso === 0) return false;
  if (f.foco === 'proximas' && !entregaProxima(l)) return false;
  if (f.foco === 'com_atraso' && !comTarefaAtrasada(l)) return false;
  const q = semAcento(f.busca.trim());
  return !q || [l.projeto.nome, l.projeto.descricao, ...l.empreendimentos.map(e => e.name)].some(x => semAcento(x).includes(q));
}

export const casaAba = (l: LinhaProjeto, aba: AbaProjetos) => aba === 'todos' || l.projeto.status === aba;

// ─── Ordem ──────────────────────────────────────────────────

export type Ordem = 'entrega' | 'nome' | 'progresso';

const porNome = (a: LinhaProjeto, b: LinhaProjeto) => a.projeto.nome.localeCompare(b.projeto.nome, 'pt-BR');

export function ordenar(linhas: LinhaProjeto[], ordem: Ordem): LinhaProjeto[] {
  return [...linhas].sort((a, b) => {
    // Concluídos no fim da aba Todos: o que está em aberto vem primeiro.
    const fim = Number(a.projeto.status === 'concluido') - Number(b.projeto.status === 'concluido');
    if (fim) return fim;
    if (ordem === 'nome') return porNome(a, b);
    if (ordem === 'progresso') return percentual(b.resumo) - percentual(a.resumo) || porNome(a, b);
    // Entrega mais próxima primeiro; sem data no fim.
    if (a.entrega && b.entrega) return a.entrega.localeCompare(b.entrega) || porNome(a, b);
    if (!a.entrega && !b.entrega) return porNome(a, b);
    return a.entrega ? -1 : 1;
  });
}

// ─── Preferências (por usuário) ──────────────────────────────────────

export interface PrefsProjetos { ordem: Ordem; soMeus: boolean }

export const PREFS_PADRAO: PrefsProjetos = { ordem: 'entrega', soMeus: false };

const chave = (usuarioId: string) => `orbit:projetos:${usuarioId}`;

export function normalizarPrefs(v: any): PrefsProjetos {
  return {
    ordem: ['entrega', 'nome', 'progresso'].includes(v?.ordem) ? v.ordem : PREFS_PADRAO.ordem,
    soMeus: v?.soMeus === true,
  };
}

export function lerPrefs(usuarioId: string): PrefsProjetos {
  try { return normalizarPrefs(JSON.parse(localStorage.getItem(chave(usuarioId)) || 'null')); } catch { return PREFS_PADRAO; }
}

export function gravarPrefs(usuarioId: string, p: PrefsProjetos) {
  try { localStorage.setItem(chave(usuarioId), JSON.stringify(p)); } catch { /* privado/bloqueado: vale só nesta sessão */ }
}

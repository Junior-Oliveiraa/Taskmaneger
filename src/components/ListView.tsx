import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Inbox, ChevronDown, ChevronRight, AlertTriangle, Clock, Plus, GripVertical, Eye, EyeOff, Check, X, Calendar, UserRound, Bell, Folder,
} from 'lucide-react';
import { Task, TaskStatus, TaskPriority, Project, Label } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import ReminderBell from './ReminderBell';
import StatusPicker from './StatusPicker';
import PriorityPicker from './PriorityPicker';
import AssigneePicker from './AssigneePicker';
import DatePicker from './DatePicker';
import ListaBarra, { FOCO, useFecharFora } from './lista/ListaBarra';
import { idsResponsaveis } from '../lib/responsaveis';
import { hojeLocal, somarDias } from '../lib/datas';
import { dataInicio } from '../lib/dataInicio';
import { conflitoDePrazo, useMarketingProjetos } from '../lib/marketingProjetos';
import { ItemMenu, Menu } from './tarefa/Propriedade';
import { casaBusca, usePrefsLista } from '../hooks/usePrefsLista';
import { podeAprovarPublicacao, aprovarPublicacao, reprovarPublicacao } from '../lib/aprovacoes';
import {
  getDueState, formatarDataExtensaCurta, compararUrgencia, compararPrioridade, resumirPrazos,
  DUE_WEEK_DAYS, OVERDUE_CRITICAL_DAYS, type DueInfo,
} from '../lib/prazo';
import { casaPrazo, FILTROS_VAZIOS, type FiltroPrazo } from '../lib/listaPrefs';
import {
  STATUS_INFO, ORDEM_STATUS, PRIORIDADE_INFO, ORDEM_PRIORIDADE, StatusRotulo, StatusIcone, IconePrioridade, TipoIcone, PrioridadeBadge, PrazoBadge,
} from './TarefaBadges';

type EditorPresence = { name: string; avatarUrl?: string; color: string };
type Alteracao = Partial<Task> & { id: string };

interface ListViewProps {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  onSelectTask: (task: Task) => void;
  onUpdateTask: (updates: Alteracao) => void;
  onAddTask: (task: Task) => void;
  currentProjectFilter: string | null;
  editingMap?: Record<string, EditorPresence>;
  /** Restringe as pessoas do filtro de responsáveis. */
  usuariosFiltro?: string[];
  /**
   * Tela "Minhas tarefas": todas as tarefas já são do usuário logado (como
   * principal ou responsável adicional), então o filtro de responsável some e a
   * coluna Responsável nasce oculta.
   */
  minhasTarefas?: boolean;
  podeEditar?: boolean;
  /** Falso enquanto houver algo aberto por cima (tarefa, busca). */
  atalhosAtivos?: boolean;
  /** Empreendimento único filtrado na lista (o "+ Novo" já nasce com ele). */
  onEmpreendimentoFiltrado?: (id: string | null) => void;
}

export type ColumnId = 'status' | 'title' | 'labels' | 'project' | 'marketingProject' | 'priority' | 'startDate' | 'dueDate' | 'assignee' | 'reminder';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  width: number;
  visible?: boolean;
}

// Título é sempre a primeira coluna e a única flexível; as demais são fixas.
const LARGURA_MIN_TITULO = 240;
/** Peso do título na grade proporcional de Minhas tarefas (as demais pesam a própria largura). */
const PESO_TITULO = 340;
/** Colunas de texto: em Minhas tarefas encolhem até aqui (com reticências) antes de a lista rolar de lado. */
const LARGURA_MIN_TEXTO = 112;
const COLUNAS_TEXTO: ColumnId[] = ['project', 'marketingProject', 'assignee'];
const SO_MINHAS: ColumnId[] = ['marketingProject'];
/** Coluna de ações no hover (Minhas tarefas): 4 botões. */
const LARGURA_ACOES = 136;
// Superfície dos cards do Início (MinhasTarefasQuadro).
const CARD = 'bg-[#121214] border border-zinc-900 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]';
const defaultColumns: ColumnDef[] = [
  { id: 'title', label: 'Título', width: LARGURA_MIN_TITULO, visible: true },
  { id: 'status', label: 'Status', width: 164, visible: true },
  { id: 'project', label: 'Empreendimento', width: 160, visible: true },
  // Projeto do Marketing: só em Minhas tarefas, como o filtro de mesmo nome.
  { id: 'marketingProject', label: 'Projeto', width: 150, visible: true },
  { id: 'priority', label: 'Prioridade', width: 120, visible: true },
  { id: 'startDate', label: 'Início', width: 110, visible: true },
  { id: 'dueDate', label: 'Prazo', width: 120, visible: true },
  { id: 'assignee', label: 'Responsável', width: 150, visible: true },
  { id: 'labels', label: 'Tags', width: 120, visible: false },
  { id: 'reminder', label: 'Lembrete', width: 120, visible: false },
];

/**
 * Aplica a preferência salva (ordem, largura, visibilidade) sobre as colunas
 * padrão. O rótulo vem sempre do código — preferências antigas gravaram
 * rótulos ("TO DO", "Nome da Tarefa") que não devem voltar. Colunas que
 * deixaram de existir (ex.: 'seen') são descartadas.
 */
function mesclarColunas(salvas: unknown): ColumnDef[] {
  if (!Array.isArray(salvas)) return defaultColumns;
  const porId = new Map<string, Partial<ColumnDef>>();
  for (const s of salvas) if (s && typeof s.id === 'string' && !porId.has(s.id)) porId.set(s.id, s);
  const mescladas = new Map<string, ColumnDef>();
  for (const dc of defaultColumns) {
    const s = porId.get(dc.id);
    mescladas.set(dc.id, s ? {
      ...dc,
      // Status precisa caber "Implementação" inteiro.
      // 190 era a largura antiga do vencimento ("⚠ Atrasada há 82 dias"); o texto agora é curto.
      width: typeof s.width === 'number' && !(dc.id === 'dueDate' && s.width === 190)
        ? Math.max(s.width, dc.id === 'status' ? dc.width : dc.id === 'dueDate' ? 110 : 80)
        : dc.width,
      visible: s.visible ?? dc.visible,
    } : dc);
  }
  const ordem = [...porId.keys()].filter(id => mescladas.has(id));
  // Coluna nova em preferência antiga: Início entra antes do Prazo, não no fim.
  const iPrazo = ordem.indexOf('dueDate');
  if (!ordem.includes('startDate') && iPrazo >= 0) ordem.splice(iPrazo, 0, 'startDate');
  // Projeto entra logo depois de Empreendimento.
  const iEmpreendimento = ordem.indexOf('project');
  if (iEmpreendimento >= 0) ordem.splice(iEmpreendimento + 1, 0, ...SO_MINHAS.filter(id => !ordem.includes(id)));
  const ordenadas = [
    ...ordem.map(id => mescladas.get(id)!),
    ...[...mescladas.values()].filter(m => !ordem.includes(m.id)),
  ];
  return [{ ...mescladas.get('title')!, visible: true }, ...ordenadas.filter(c => c.id !== 'title')];
}

function gravarLocal(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* privado/bloqueado: vale só nesta sessão */ }
}

interface Grupo {
  /** Chave estável (recolher, criação rápida). */
  chave: string;
  rotulo: string;
  /** Ícone da etapa (status) ou do nível (prioridade). */
  icone?: React.ReactNode;
  tarefas: Task[];
  /** Grupo "Atrasadas" do agrupamento por prazo (tem a ação Reagendar). */
  atrasadas?: boolean;
  /** Campos herdados pela tarefa criada neste grupo (sem = não aceita criação). */
  heranca?: { status?: TaskStatus; priority?: TaskPriority };
}

const DESFAZER_MS = 5000;
const SEEN_KEY = 'orbit:listSeenToday';
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Célula editável: fundo e chevron no hover/foco. O recuo é por posição, não
 * por margem negativa: a margem encolhia a célula e cortava o texto.
 */
const CELULA_EDITAVEL =
  `group/cel relative -left-1.5 inline-flex items-center gap-1 max-w-full h-6 px-1.5 rounded-md text-left text-body text-zinc-400 hover:bg-[#1f1f23] focus-visible:bg-[#1f1f23] ${FOCO}`;
const Seta = () => (
  <ChevronDown size={12} aria-hidden className="shrink-0 text-zinc-400 opacity-0 group-hover/cel:opacity-100 group-focus-visible/cel:opacity-100" />
);

function EmpreendimentoPicker({ value, projects, onChange }: { value: string; projects: Project[]; onChange: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [acima, setAcima] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useFecharFora(raiz, aberto, () => setAberto(false));
  const atual = projects.find(p => p.id === value);
  return (
    <div ref={raiz} className="relative min-w-0" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`Empreendimento: ${atual?.name ?? 'nenhum'}. Alterar`}
        title={atual?.name}
        onClick={() => {
          const r = raiz.current!.getBoundingClientRect();
          const abaixo = window.innerHeight - r.bottom;
          setAcima(abaixo < 260 && r.top > abaixo);
          setAberto(o => !o);
        }}
        className={CELULA_EDITAVEL}
      >
        <span className="truncate">{atual?.name ?? '—'}</span>
        <Seta />
      </button>
      {aberto && (
        <div role="listbox" aria-label="Empreendimento" className={`absolute left-0 ${acima ? 'bottom-full mb-1' : 'top-full mt-1'} w-56 max-h-60 overflow-y-auto scrollbar-thin bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 p-1`}>
          {projects.map(p => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === value}
              onClick={() => { setAberto(false); if (p.id !== value) onChange(p.id); }}
              className={`w-full flex items-center gap-2 px-2 min-h-8 rounded-md text-caption text-left ${FOCO} ${p.id === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
            >
              <span className={`size-1.5 rounded-full shrink-0 bg-current ${p.color}`} aria-hidden />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ListView({
  tasks, projects, labels, onSelectTask, onUpdateTask, onAddTask, currentProjectFilter,
  editingMap = {}, usuariosFiltro, minhasTarefas = false, podeEditar = true, atalhosAtivos = true,
  onEmpreendimentoFiltrado,
}: ListViewProps) {
  const { currentUser, updateProfile, allUsers: USERS } = useAuth();
  const { notifications, addNotification } = useNotifications();
  const { limiteDaTarefa, projetoDaTarefa, vincularTarefa } = useMarketingProjetos();
  const usuariosDoFiltro = usuariosFiltro ? USERS.filter(u => usuariosFiltro.includes(u.id)) : USERS;
  const hoje = hojeLocal();
  const prazoAdmin = Number(currentUser?.permissionLevel) === 1;

  const [search, setSearch] = useState('');

  // ─── Filtros e exibição, persistidos por usuário ───────────────────
  const { prefs, mudarPrefs, filtros, casaFiltros, projetos: projetosMkt } = usePrefsLista(projects, minhasTarefas);
  const { groupBy, ordenacao } = prefs;
  const ocultarConcluidas = minhasTarefas && !prefs.mostrarConcluidas;
  const empreendimentoUnico = filtros.empreendimentos.length === 1 ? filtros.empreendimentos[0] : null;
  const avisarEmpreendimento = useRef(onEmpreendimentoFiltrado);
  avisarEmpreendimento.current = onEmpreendimentoFiltrado;
  useEffect(() => {
    avisarEmpreendimento.current?.(empreendimentoUnico);
    return () => avisarEmpreendimento.current?.(null);
  }, [empreendimentoUnico]);

  // ─── "Vista hoje" ──────────────────────────────────────────────────
  // Marcação puramente visual, local ao navegador: um "já olhei essa" que
  // reseta à meia-noite. (Era a coluna "TO DO"; não conclui a tarefa.)
  const [, setSeenDate] = useState(hojeLocal);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as { date: string; ids: string[] };
      return parsed.date === hojeLocal() ? new Set(parsed.ids) : new Set();
    } catch {
      return new Set();
    }
  });
  // A aba pode ficar aberta atravessando a meia-noite sem recarregar.
  useEffect(() => {
    const id = setInterval(() => {
      const now = hojeLocal();
      setSeenDate(prev => {
        if (prev === now) return prev;
        setSeenIds(new Set());
        try { localStorage.removeItem(SEEN_KEY); } catch { /* privado/bloqueado */ }
        return now;
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);
  const toggleSeen = (taskId: string) => {
    setSeenIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      gravarLocal(SEEN_KEY, JSON.stringify({ date: hojeLocal(), ids: [...next] }));
      return next;
    });
  };

  // ─── Colunas ───────────────────────────────────────────────────────
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    if (currentUser?.preferences?.listViewColumns) return mesclarColunas(currentUser.preferences.listViewColumns);
    try {
      const saved = localStorage.getItem('listViewColumns');
      if (saved) return mesclarColunas(JSON.parse(saved));
    } catch { /* ignora preferência corrompida */ }
    return defaultColumns;
  });
  const hasInitializedColumns = useRef(!!currentUser?.preferences?.listViewColumns);
  useEffect(() => {
    if (!hasInitializedColumns.current && currentUser?.preferences?.listViewColumns) {
      setColumns(mesclarColunas(currentUser.preferences.listViewColumns));
      hasInitializedColumns.current = true;
    }
  }, [currentUser?.preferences?.listViewColumns]);

  // Preferências mais recentes na hora de gravar: com as do render antigo, o
  // salvamento atrasado apagaria o que mudou nesse 1s (ex.: alertas já disparados).
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const updateProfileRef = useRef(updateProfile);
  updateProfileRef.current = updateProfile;
  useEffect(() => {
    gravarLocal('listViewColumns', JSON.stringify(columns));
    const timer = setTimeout(() => {
      const u = currentUserRef.current;
      if (!u || JSON.stringify(columns) === JSON.stringify(u.preferences?.listViewColumns || [])) return;
      updateProfileRef.current({ preferences: { ...u.preferences, listViewColumns: columns } }).catch(console.error);
    }, 1000);
    return () => clearTimeout(timer);
  }, [columns]);

  const colunaDisponivel = (c: ColumnDef) => (c.id !== 'startDate' || dataInicio.ativa) && (minhasTarefas || !SO_MINHAS.includes(c.id));
  const colunaLigada = (c: ColumnDef) =>
    c.visible !== false && colunaDisponivel(c) && !(minhasTarefas && c.id === 'assignee' && !prefs.responsavelVisivel);
  const colunasVisiveis = columns.filter(colunaLigada);
  // Minhas tarefas: colunas proporcionais (como no Início) e ações no hover numa coluna extra à direita.
  const comAcoes = minhasTarefas && podeEditar;
  const larguraMinColuna = (c: ColumnDef) => c.id === 'title' ? LARGURA_MIN_TITULO
    : minhasTarefas && COLUNAS_TEXTO.includes(c.id) ? Math.min(c.width, LARGURA_MIN_TEXTO) : c.width;
  const gradeStyle: React.CSSProperties = {
    gridTemplateColumns: [
      ...colunasVisiveis.map(c => c.id === 'title'
        ? `minmax(${LARGURA_MIN_TITULO}px, ${minhasTarefas ? `${PESO_TITULO}fr` : '1fr'})`
        : minhasTarefas ? `minmax(${larguraMinColuna(c)}px, ${c.width}fr)` : `${c.width}px`),
      ...(comAcoes ? [`${LARGURA_ACOES}px`] : []),
    ].join(' '),
  };
  const larguraMinima = colunasVisiveis.reduce((s, c) => s + larguraMinColuna(c), 0)
    + (comAcoes ? LARGURA_ACOES : 0);

  const alternarColuna = (id: string, visivel: boolean) => {
    const responsavelMinhas = minhasTarefas && id === 'assignee';
    if (responsavelMinhas) mudarPrefs({ responsavelVisivel: visivel });
    if (!responsavelMinhas || visivel) setColumns(cs => cs.map(c => c.id === id ? { ...c, visible: visivel } : c));
  };

  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const handleDragOver = (e: React.DragEvent, colId: string) => {
    if (!draggedColumn) return;
    e.preventDefault();
    if (draggedColumn === colId || colId === 'title') return;
    setColumns(prev => {
      const from = prev.findIndex(c => c.id === draggedColumn);
      const to = prev.findIndex(c => c.id === colId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };
  const iniciarRedimensionar = (e: React.MouseEvent, colId: string, largura: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const mover = (ev: MouseEvent) =>
      setColumns(prev => prev.map(c => c.id === colId ? { ...c, width: Math.max(80, largura + ev.clientX - x0) } : c));
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };

  // ─── Filtragem ─────────────────────────────────────────────────────
  const estadoPorId = useMemo(
    () => new Map<string, DueInfo>(tasks.map(t => [t.id, getDueState(t.dueDate, t.status, hoje)])),
    [tasks, hoje],
  );
  const estadoDe = (t: Task): DueInfo => estadoPorId.get(t.id) ?? getDueState(t.dueDate, t.status, hoje);

  // Base do resumo: respeita os filtros, menos a busca e o próprio prazo.
  const baseResumo = tasks.filter(t => {
    if (currentProjectFilter && t.projectId !== currentProjectFilter) return false;
    if (!minhasTarefas && filtros.responsavel !== 'all' && !idsResponsaveis(t).includes(filtros.responsavel)) return false;
    return casaFiltros(t);
  });
  const resumo = resumirPrazos(baseResumo, hoje);

  const termo = search.trim().toLowerCase();
  const filteredTasks = baseResumo.filter(t => {
    if (ocultarConcluidas && estadoDe(t).done) return false;
    if (!casaPrazo(estadoDe(t), filtros.prazos)) return false;
    return casaBusca(t, search);
  });

  // Vencimento mais urgente primeiro (sem prazo no fim), prioridade desempata.
  // Vistas hoje descem para o fim (sort estável).
  const ordenar = (lista: Task[]) =>
    [...lista]
      .sort(ordenacao === 'prioridade' ? compararPrioridade : compararUrgencia)
      .sort((a, b) => Number(seenIds.has(a.id)) - Number(seenIds.has(b.id)));

  // ─── Grupos ────────────────────────────────────────────────────────
  const grupos: Grupo[] = (() => {
    const lista: Grupo[] = [];
    if (groupBy === 'prazo') {
      // Por data: Atrasadas, Hoje, Esta semana, Depois, Sem prazo (+ Concluídas no fim).
      const balde = (rotulo: string, chave: string, tarefas: Task[], atrasadas = false): void => {
        if (tarefas.length) lista.push({ chave: `prazo:${chave}`, rotulo, tarefas, atrasadas, heranca: {} });
      };
      const abertas = filteredTasks.filter(t => !estadoDe(t).done);
      const feitas = filteredTasks.filter(t => estadoDe(t).done);
      const por = (f: (d: number | null) => boolean) => abertas.filter(t => f(estadoDe(t).diff));
      balde('Atrasadas', 'atrasadas',
        [...por(d => d !== null && d < 0)].sort((a, b) => estadoDe(b).daysLate - estadoDe(a).daysLate || compararUrgencia(a, b)), true);
      balde('Hoje', 'hoje', ordenar(por(d => d === 0)));
      balde('Esta semana', 'semana', ordenar(por(d => d !== null && d > 0 && d <= DUE_WEEK_DAYS)));
      balde('Depois', 'depois', ordenar(por(d => d !== null && d > DUE_WEEK_DAYS)));
      balde('Sem prazo', 'sem-prazo', ordenar(por(d => d === null)));
      balde('Concluídas', 'concluidas',
        [...feitas].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')));
      return lista;
    }
    if (groupBy === 'status') {
      // Exatamente as colunas do Kanban, na mesma ordem, inclusive as vazias.
      // Concluído só some quando as concluídas estão ocultas (Exibição).
      const etapas = ORDEM_STATUS.filter(s => s !== 'done' || !ocultarConcluidas);
      for (const s of etapas) {
        lista.push({
          chave: `status:${s}`, rotulo: STATUS_INFO[s].label, icone: <StatusIcone status={s} size={14} />,
          tarefas: ordenar(filteredTasks.filter(t => t.status === s)), heranca: { status: s },
        });
      }
    } else if (groupBy === 'priority') {
      // Só os níveis de prioridade; "Sem prioridade" aparece quando há tarefa sem nível.
      for (const p of ORDEM_PRIORIDADE) {
        const ts = filteredTasks.filter(t => t.priority === p);
        if (p === 'no_priority' && ts.length === 0) continue;
        lista.push({
          chave: `priority:${p}`, rotulo: PRIORIDADE_INFO[p].label, icone: <IconePrioridade prioridade={p} size={14} />,
          tarefas: ordenar(ts), heranca: { priority: p },
        });
      }
    } else {
      lista.push({ chave: 'todas', rotulo: 'Tarefas', tarefas: ordenar(filteredTasks), heranca: {} });
    }
    return lista;
  })();
  // Sem agrupamento: lista corrida, sem linha de grupo.
  const semCabecalhoDeGrupo = groupBy === 'none';
  const linhas = grupos.filter(g => semCabecalhoDeGrupo || !prefs.recolhidos.includes(g.chave)).flatMap(g => g.tarefas);

  // ─── Concluir com Desfazer ─────────────────────────────────────────
  // A gravação espera a janela de desfazer: concluir dispara histórico de
  // status e cronômetro, que não dá para voltar atrás depois de gravados.
  const atualizarRef = useRef(onUpdateTask);
  atualizarRef.current = onUpdateTask;
  const [concluindo, setConcluindo] = useState<Set<string>>(new Set());
  const pendentes = useRef(new Map<number, { ids: string[]; timer: ReturnType<typeof setTimeout> }>());
  const [toast, setToast] = useState<{ lote: number; mensagem: string; erro?: boolean } | null>(null);
  const avisarErro = (mensagem: string) => {
    const lote = Date.now() + Math.random();
    setToast({ lote, mensagem, erro: true });
    setTimeout(() => setToast(t => t?.lote === lote ? null : t), DESFAZER_MS);
  };

  const encerrarLote = (lote: number, gravar: boolean) => {
    const p = pendentes.current.get(lote);
    if (!p) return;
    clearTimeout(p.timer);
    pendentes.current.delete(lote);
    if (gravar) p.ids.forEach(id => atualizarRef.current({ id, status: 'done' }));
    setConcluindo(prev => { const s = new Set(prev); p.ids.forEach(id => s.delete(id)); return s; });
    setToast(t => t?.lote === lote ? null : t);
  };
  const concluir = (alvo: Task[]) => {
    const ids = alvo.filter(t => t.status !== 'done' && !concluindo.has(t.id)).map(t => t.id);
    if (!podeEditar || ids.length === 0) return;
    const lote = Date.now() + Math.random();
    setConcluindo(prev => new Set([...prev, ...ids]));
    pendentes.current.set(lote, { ids, timer: setTimeout(() => encerrarLote(lote, true), DESFAZER_MS) });
    setToast({ lote, mensagem: ids.length === 1 ? 'Tarefa concluída' : `${ids.length} tarefas concluídas` });
  };
  // Clique repetido no checkbox dentro da janela também desfaz.
  const alternarConclusao = (t: Task) => {
    const lote = [...pendentes.current].find(([, p]) => p.ids.length === 1 && p.ids[0] === t.id)?.[0];
    if (lote !== undefined) encerrarLote(lote, false); else concluir([t]);
  };
  // Saiu da tela ou fechou a aba dentro da janela: grava o que faltava.
  useEffect(() => {
    const gravar = () => [...pendentes.current.keys()].forEach(l => encerrarLote(l, true));
    window.addEventListener('pagehide', gravar);
    return () => { window.removeEventListener('pagehide', gravar); gravar(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Edição inline ─────────────────────────────────────────────────
  const abrirSecao = (task: Task, section: string, targetId: string) => {
    onSelectTask(task);
    setTimeout(() => window.dispatchEvent(new CustomEvent('openTaskSection', { detail: { section, targetId } })), 100);
  };
  // Mesma regra de dentro da tarefa: o 1º prazo qualquer um define; alterar um
  // prazo existente só o admin faz direto, os demais justificam na tarefa.
  const prazoDireto = (t: Task) => prazoAdmin || !t.dueDate;
  const salvarPrazo = (t: Task, data: string) => {
    const status: TaskStatus | undefined =
      t.status === 'no_forecast' && data ? 'todo' : t.status === 'todo' && !data ? 'no_forecast' : undefined;
    onUpdateTask({ id: t.id, dueDate: data, ...(status ? { status } : {}) });
  };
  const [forcarPrazo, setForcarPrazo] = useState({ id: '', n: 0 });
  const editarPrazo = (t: Task) => {
    if (!podeEditar) return;
    if (prazoDireto(t) && colunasVisiveis.some(c => c.id === 'dueDate')) setForcarPrazo(f => ({ id: t.id, n: f.n + 1 }));
    else abrirSecao(t, 'deadline', 'deadline');
  };

  // ─── Aprovações ────────────────────────────────────────────────────
  // Criativos e copies não vêm na listagem (são pesados): quem deve aprovar é
  // reconhecido pela solicitação recebida na Caixa de entrada.
  const revisaoPorTarefa = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notifications) {
      if (n.userId !== currentUser?.id || !n.taskId || !n.targetId) continue;
      if (n.type !== 'review_requested' && n.type !== 'approval_pending') continue;
      if (/^(design|copy)-delivery-/.test(n.targetId) && !m.has(n.taskId)) m.set(n.taskId, n.targetId);
    }
    return m;
  }, [notifications, currentUser?.id]);

  const renderAprovacao = (task: Task) => {
    if (!podeEditar || task.status !== 'approval' || !currentUser) return null;
    const publicacao = podeAprovarPublicacao(task, currentUser.id);
    const revisao = revisaoPorTarefa.get(task.id);
    if (!publicacao && !revisao) return null;
    const cls = `h-6 px-2 rounded-md border text-caption font-medium inline-flex items-center gap-1 whitespace-nowrap ${FOCO}`;
    const salvar = (u: Partial<Task>) => onUpdateTask({ ...u, id: task.id });
    return (
      <span className="shrink-0 hidden group-hover:inline-flex group-focus-within:inline-flex [@media(pointer:coarse)]:inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
        {publicacao ? (
          <>
            <button type="button" className={`${cls} border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10`} onClick={() => aprovarPublicacao(task, currentUser.id, salvar, addNotification)}>
              <Check size={12} aria-hidden /> Aprovar
            </button>
            <button type="button" className={`${cls} border-zinc-700 text-zinc-300 hover:text-red-400 hover:border-red-500/30`} onClick={() => reprovarPublicacao(task, currentUser.id, salvar, addNotification)}>
              <X size={12} aria-hidden /> Reprovar
            </button>
          </>
        ) : (
          // Reprovar criativo/copy exige comentário e aprovar grava a versão:
          // os dois acontecem na própria entrega, dentro da tarefa.
          <button type="button" className={`${cls} border-zinc-700 text-zinc-200 hover:bg-zinc-800`} onClick={() => abrirSecao(task, revisao!.startsWith('copy') ? 'copyProps' : 'designProps', revisao!)}>
            Aprovar / Reprovar
          </button>
        )}
      </span>
    );
  };

  // ─── Criação rápida ────────────────────────────────────────────────
  const [adicionando, setAdicionando] = useState<string | null>(null);
  const [novoTexto, setNovoTexto] = useState('');
  const [novoProjeto, setNovoProjeto] = useState('');
  const [erroProjeto, setErroProjeto] = useState(false);
  const projetoSelectRef = useRef<HTMLSelectElement>(null);
  // Inferido: filtro global, filtro único da lista, ou o único existente.
  const projetoInferido = currentProjectFilter || empreendimentoUnico || (projects.length === 1 ? projects[0].id : null);

  const abrirCriacao = (c: string) => { setAdicionando(c); setNovoTexto(''); setErroProjeto(false); };
  const cancelarCriacao = () => { setAdicionando(null); setNovoTexto(''); setErroProjeto(false); };
  const salvarCriacao = (grupo: Grupo) => {
    const titulo = novoTexto.trim();
    if (!titulo) return;
    const projectId = projetoInferido || novoProjeto;
    if (!projectId) {
      setErroProjeto(true);
      projetoSelectRef.current?.focus();
      return;
    }
    const newTask: any = {
      id: crypto.randomUUID(),
      title: titulo,
      description: '',
      status: grupo.heranca?.status ?? 'todo',
      priority: grupo.heranca?.priority ?? 'medium',
      projectId,
      labels: [labels.find(l => l.name === 'Tarefa') || labels[0]].filter(Boolean) as Label[],
      subtasks: [],
      createdAt: hojeLocal(),
      assigneeId: currentUser?.id,
      _isLocal: true,
    };
    onAddTask(newTask as Task);
    setNovoTexto(''); // segue aberto para a próxima
    setErroProjeto(false);
  };

  // ─── Seleção e teclado ─────────────────────────────────────────────
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const limparSelecao = () => setSelecionadas(new Set());
  const alternarSelecao = (id: string) => setSelecionadas(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const tarefasSelecionadas = linhas.filter(t => selecionadas.has(t.id));
  const [focoId, setFocoId] = useState<string | null>(null);
  const linhaRefs = useRef(new Map<string, HTMLDivElement>());
  const idTabulavel = focoId && linhas.some(t => t.id === focoId) ? focoId : linhas[0]?.id;

  const teclado = useRef<(e: KeyboardEvent) => void>(() => {});
  teclado.current = (e: KeyboardEvent) => {
    if (!atalhosAtivos || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    // Só com o foco na linha (ou em lugar nenhum): não rouba teclas de campos e botões.
    const alvo = e.target as HTMLElement;
    if (alvo.dataset?.linhaTarefa === undefined && alvo !== document.body) return;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const idx = focoId ? linhas.findIndex(t => t.id === focoId) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const prox = linhas[idx === -1 ? 0 : Math.min(linhas.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (!prox) return;
      e.preventDefault();
      setFocoId(prox.id);
      const el = linhaRefs.current.get(prox.id);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Escape') { if (selecionadas.size > 0) limparSelecao(); return; }
    const atual = linhas[idx];
    if (!atual) return;
    const tecla = e.key.toLowerCase();
    if (e.key === 'Enter') { e.preventDefault(); onSelectTask(atual); return; }
    if (!podeEditar) return;
    if (tecla === 'x') { e.preventDefault(); alternarSelecao(atual.id); }
    // "C" é o atalho global de Nova tarefa; concluir fica em "E".
    else if (tecla === 'e') { e.preventDefault(); alternarConclusao(atual); }
    else if (tecla === 'd') { e.preventDefault(); editarPrazo(atual); }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => teclado.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  // ─── Células ───────────────────────────────────────────────────────
  const statusEditavel = (task: Task) => podeEditar ? (
    <StatusPicker
      value={task.status}
      onChange={status => onUpdateTask({ id: task.id, status })}
      trigger={
        <button type="button" aria-label={`Status: ${STATUS_INFO[task.status]?.label}. Alterar`} className={CELULA_EDITAVEL}>
          <StatusRotulo status={task.status} size={14} /><Seta />
        </button>
      }
    />
  ) : <StatusRotulo status={task.status} size={14} className="text-body text-zinc-400" />;

  const prioridadeEditavel = (task: Task) => podeEditar ? (
    <PriorityPicker
      value={task.priority}
      onChange={priority => onUpdateTask({ id: task.id, priority })}
      trigger={
        <button type="button" aria-label={`Prioridade: ${PRIORIDADE_INFO[task.priority]?.label ?? 'sem prioridade'}. Alterar`} className={CELULA_EDITAVEL}>
          <PrioridadeBadge prioridade={task.priority} plano /><Seta />
        </button>
      }
    />
  ) : <PrioridadeBadge prioridade={task.priority} plano />;

  const projetoMkt = (task: Task) => projetosMkt.find(p => p.id === projetoDaTarefa[task.id]);
  // Mesma regra do painel: o prazo da tarefa precisa caber na entrega do projeto.
  const trocarProjeto = async (task: Task, id: string | null) => {
    if (id === (projetoDaTarefa[task.id] ?? null)) return;
    const conflito = id ? conflitoDePrazo(projetosMkt.find(p => p.id === id), task.dueDate) : null;
    if (conflito) { avisarErro(conflito); return; }
    try { await vincularTarefa(task.id, id); }
    catch (e: any) { avisarErro(`Não foi possível trocar o projeto: ${e.message}`); }
  };
  const projetoEditavel = (task: Task) => {
    const atual = projetoMkt(task);
    if (!podeEditar) return <span className="text-body text-zinc-400 truncate" title={atual?.nome}>{atual?.nome ?? '—'}</span>;
    return (
      <div className="min-w-0" onClick={e => e.stopPropagation()}>
        <Menu
          rotulo={`Projeto: ${atual?.nome ?? 'nenhum'}. Alterar`}
          titulo={atual?.nome}
          classe={CELULA_EDITAVEL}
          gatilho={<><span className="truncate">{atual?.nome ?? '—'}</span><Seta /></>}
        >
          {fechar => <>
            <ItemMenu marcado={!atual} onClick={() => { fechar(); trocarProjeto(task, null); }}><span className="text-zinc-400">Sem projeto</span></ItemMenu>
            {projetosMkt.filter(p => p.status !== 'concluido' || p.id === atual?.id).map(p => (
              <React.Fragment key={p.id}>
                <ItemMenu marcado={p.id === atual?.id} onClick={() => { fechar(); trocarProjeto(task, p.id); }}>
                  <Folder size={14} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="truncate">{p.nome}</span>
                </ItemMenu>
              </React.Fragment>
            ))}
            {projetosMkt.length === 0 && <p className="px-2 py-1.5 text-body text-zinc-400">Nenhum projeto criado.</p>}
          </>}
        </Menu>
      </div>
    );
  };

  const prazoEditavel = (task: Task) => {
    const badge = <PrazoBadge dueDate={task.dueDate} status={task.status} today={hoje} variante="lista" />;
    if (!podeEditar) return badge;
    // Alinhado à direita: sem o recuo da célula editável (que alinha à esquerda).
    const gatilho = (
      <button type="button" aria-description="Alterar vencimento" className={CELULA_EDITAVEL.replace('-left-1.5', 'left-1.5')}>{badge}</button>
    );
    if (!prazoDireto(task)) {
      return <span onClick={e => { e.stopPropagation(); editarPrazo(task); }}>{gatilho}</span>;
    }
    return (
      <DatePicker
        value={task.dueDate || ''}
        onChange={d => salvarPrazo(task, d)}
        align="right"
        disableAutoScroll
        maxDate={limiteDaTarefa(task.id)?.data}
        forceOpen={forcarPrazo.id === task.id ? forcarPrazo.n : 0}
        trigger={gatilho}
      />
    );
  };

  const inicioEditavel = (task: Task) => {
    const texto = <span className="whitespace-nowrap tabular-nums text-body text-zinc-400">{task.startDate ? formatarDataExtensaCurta(task.startDate, hoje) : '—'}</span>;
    if (!podeEditar) return texto;
    return (
      <DatePicker
        value={task.startDate || ''}
        onChange={d => onUpdateTask({ id: task.id, startDate: d || '' })}
        align="right"
        disableAutoScroll
        maxDate={task.dueDate?.slice(0, 10) ?? limiteDaTarefa(task.id)?.data}
        trigger={<button type="button" aria-label={`Início: ${task.startDate ? formatarDataExtensaCurta(task.startDate, hoje) : 'não definido'}. Alterar`} className={CELULA_EDITAVEL.replace('-left-1.5', 'left-1.5')}>{texto}</button>}
      />
    );
  };

  const renderTitulo = (task: Task) => {
    const etiqueta = task.labels?.[0] ? labels.find(l => l.id === task.labels[0]?.id) : undefined;
    const isSeen = seenIds.has(task.id);
    const feita = task.status === 'done' || concluindo.has(task.id);

    return (
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          role="checkbox"
          aria-checked={feita}
          aria-label={feita ? `${task.title || 'Tarefa'} concluída` : `Concluir ${task.title || 'tarefa'}`}
          title={feita ? 'Concluída' : 'Concluir (E)'}
          disabled={!podeEditar || task.status === 'done'}
          onClick={e => { e.stopPropagation(); alternarConclusao(task); }}
          className={`shrink-0 size-6 [@media(pointer:coarse)]:size-10 -ml-1 inline-flex items-center justify-center rounded-md disabled:cursor-default ${FOCO}`}
        >
          <span className={`size-4 inline-flex items-center justify-center rounded-[5px] border transition duration-200 motion-reduce:transition-none ${
            feita ? `bg-blue-600 border-blue-600 text-white ${concluindo.has(task.id) ? 'scale-110' : ''}` : 'border-zinc-500 hover:border-blue-400 hover:bg-blue-500/10'
          }`}>
            {feita && <Check size={12} strokeWidth={3} aria-hidden />}
          </span>
        </button>
        <TipoIcone etiqueta={etiqueta} />
        <span
          className={`min-w-0 truncate text-body font-medium ${feita ? 'text-zinc-400 line-through' : 'text-zinc-100'}`}
          title={task.title}
        >
          {task.title || 'Sem título'}
        </span>
        {renderAprovacao(task)}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); toggleSeen(task.id); }}
          aria-pressed={isSeen}
          aria-label={isSeen ? `Desmarcar "${task.title}" como vista hoje` : `Marcar "${task.title}" como vista hoje`}
          title={isSeen ? 'Vista hoje — a marca some sozinha à meia-noite' : 'Marcar como vista hoje'}
          className={`shrink-0 ml-auto size-6 inline-flex items-center justify-center rounded ${FOCO} ${
            isSeen ? 'text-zinc-300' : 'text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          {isSeen ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </button>
      </div>
    );
  };

  const renderCellContent = (task: Task, col: ColumnDef) => {
    switch (col.id) {
      case 'title': return renderTitulo(task);
      case 'status': return statusEditavel(task);
      case 'priority': return prioridadeEditavel(task);
      case 'startDate': return inicioEditavel(task);
      case 'dueDate': return prazoEditavel(task);
      case 'project':
        return podeEditar
          ? <EmpreendimentoPicker value={task.projectId} projects={projects} onChange={projectId => onUpdateTask({ id: task.id, projectId })} />
          : <span className="text-body text-zinc-400 truncate">{projects.find(p => p.id === task.projectId)?.name ?? '—'}</span>;
      case 'marketingProject': return projetoEditavel(task);
      case 'labels':
        return (
          <div className="flex items-center gap-1.5 overflow-hidden">
            {task.labels?.slice(0, 2).map(l => (
              <span key={l.id} className="text-body px-1.5 rounded shrink-0 bg-zinc-800/40 text-zinc-400 border border-zinc-800/30">{l.name}</span>
            ))}
          </div>
        );
      case 'assignee': {
        const principal = task.assigneeId ? USERS.find(u => u.id === task.assigneeId) : undefined;
        const todos = idsResponsaveis(task);
        const conteudo = (
          <span className="flex items-center gap-1.5 min-w-0 text-body text-zinc-400">
            {principal ? (
              <>
                {principal.avatarUrl
                  ? <img src={principal.avatarUrl} alt="" className="size-5 rounded-full object-cover shrink-0" />
                  : <span className="size-5 rounded-full bg-zinc-800 shrink-0 inline-flex items-center justify-center text-caption text-zinc-300">{principal.initials?.[0]}</span>}
                <span className="truncate">{principal.name}</span>
                {todos.length > 1 && (
                  <span className="shrink-0 tabular-nums" title={todos.map(id => USERS.find(u => u.id === id)?.name).filter(Boolean).join(', ')}>+{todos.length - 1}</span>
                )}
              </>
            ) : 'Não atribuído'}
          </span>
        );
        if (!podeEditar) return conteudo;
        return (
          <AssigneePicker
            value={task.assigneeId}
            onChange={assigneeId => onUpdateTask({ id: task.id, assigneeId })}
            trigger={<div className={CELULA_EDITAVEL}>{conteudo}</div>}
          />
        );
      }
      case 'reminder':
        return (
          <ReminderBell
            reminderDate={task.reminderDate}
            reminderType={task.reminderType}
            size={12}
            showLabel={true}
            align="right"
            onChange={({ reminderDate, reminderType }) => onUpdateTask({ id: task.id, reminderDate, reminderType })}
          />
        );
      default:
        return null;
    }
  };

  // Ações da linha (Minhas tarefas): só no hover/foco; em toque ficam visíveis.
  const BOTAO_ACAO = `size-7 [@media(pointer:coarse)]:size-9 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] ${FOCO}`;
  const renderAcoes = (task: Task) => {
    if (task.status === 'done') return null;
    return (
      <div
        onClick={e => e.stopPropagation()}
        className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity"
      >
        <button type="button" aria-label={`Concluir ${task.title || 'tarefa'}`} title="Concluir (E)" className={BOTAO_ACAO} onClick={() => alternarConclusao(task)}>
          <Check size={14} aria-hidden />
        </button>
        {prazoDireto(task) ? (
          <DatePicker
            value={task.dueDate || ''}
            align="right"
            disableAutoScroll
            disablePast
            maxDate={limiteDaTarefa(task.id)?.data}
            onChange={d => salvarPrazo(task, d)}
            trigger={<button type="button" aria-label={`Reagendar ${task.title || 'tarefa'}`} title="Reagendar" className={BOTAO_ACAO}><Calendar size={14} aria-hidden /></button>}
          />
        ) : (
          // Mudar um prazo existente exige justificativa, dentro da tarefa.
          <button type="button" aria-label={`Reagendar ${task.title || 'tarefa'}`} title="Reagendar (pede justificativa)" className={BOTAO_ACAO} onClick={() => editarPrazo(task)}>
            <Calendar size={14} aria-hidden />
          </button>
        )}
        <AssigneePicker
          value={task.assigneeId}
          onChange={id => { if (id && id !== task.assigneeId) onUpdateTask({ id: task.id, assigneeId: id }); }}
          trigger={<button type="button" aria-label={`Atribuir ${task.title || 'tarefa'}`} title="Atribuir" className={BOTAO_ACAO}><UserRound size={14} aria-hidden /></button>}
        />
        <DatePicker
          value={task.reminderDate || ''}
          align="right"
          disableAutoScroll
          enableTime
          onChange={d => onUpdateTask({ id: task.id, reminderDate: d || undefined })}
          onQuickAdd={() => onUpdateTask({ id: task.id, reminderDate: `${somarDias(1)}T09:00` })}
          trigger={
            <button type="button" aria-label={task.reminderDate ? 'Lembrete ativo: editar' : 'Criar lembrete'} title={task.reminderDate ? 'Lembrete ativo' : 'Lembrar'} className={`${BOTAO_ACAO} ${task.reminderDate ? 'text-amber-400' : ''}`}>
              <Bell size={14} className={task.reminderDate ? 'fill-amber-400' : ''} aria-hidden />
            </button>
          }
        />
      </div>
    );
  };

  const renderLinha = (task: Task) => {
    const presence = editingMap[task.id];
    const isSeen = seenIds.has(task.id);
    const selecionada = selecionadas.has(task.id);
    return (
      <motion.div
        key={task.id}
        ref={(el: HTMLDivElement | null) => { if (el) linhaRefs.current.set(task.id, el); else linhaRefs.current.delete(task.id); }}
        role="row"
        data-linha-tarefa=""
        aria-selected={selecionada}
        tabIndex={task.id === idTabulavel ? 0 : -1}
        layout="position"
        initial={false}
        transition={{ duration: 0.15 }}
        onFocus={() => setFocoId(task.id)}
        onClick={e => {
          if ((e.ctrlKey || e.metaKey) && podeEditar) alternarSelecao(task.id);
          else onSelectTask(task);
        }}
        className={`relative grid items-center h-11 [@media(pointer:coarse)]:h-12 cursor-pointer group border-b border-zinc-900 last:border-b-0 last:rounded-b-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 ${
          selecionada ? 'bg-blue-500/10' : isSeen ? 'bg-zinc-800/30' : 'hover:bg-[#161619]'
        }`}
        style={{ ...gradeStyle, ...(presence ? { borderLeft: `2px solid ${presence.color}` } : {}) }}
      >
        {colunasVisiveis.map(col => (
          <div
            key={col.id}
            role="cell"
            className={`min-w-0 px-3 flex items-center [&>*]:min-w-0 [&_.inline-flex]:align-middle ${col.id === 'title' ? '[&>*]:flex-1 pl-4' : ''} ${
              col.id === 'dueDate' || col.id === 'startDate' ? 'justify-end' : ''
            } ${
              isSeen && col.id !== 'title' ? 'opacity-50 group-hover:opacity-100 group-focus-within:opacity-100' : ''
            }`}
          >
            {renderCellContent(task, col)}
          </div>
        ))}
        {comAcoes && <div role="cell" className="min-w-0 pr-3 pl-1">{renderAcoes(task)}</div>}
        {presence && (
          <div
            title={`${presence.name} está editando`}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 rounded-full text-caption font-medium pointer-events-none"
            style={{ background: `${presence.color}22`, color: presence.color, border: `1px solid ${presence.color}44` }}
          >
            <span className="size-1.5 rounded-full animate-pulse" style={{ background: presence.color }} aria-hidden />
            {presence.name.split(' ')[0]}
          </div>
        )}
      </motion.div>
    );
  };

  const renderCriacao = (grupo: Grupo) => {
    if (!grupo.heranca || !podeEditar || minhasTarefas) return null;
    if (adicionando !== grupo.chave) {
      return (
        <div>
          <button
            type="button"
            onClick={() => abrirCriacao(grupo.chave)}
            // Só aparece no hover do grupo; sempre alcançável pelo teclado (Tab).
            className={`sticky left-0 flex items-center gap-2 px-3 h-7 text-caption text-zinc-400 hover:text-zinc-100 opacity-0 group-hover/grupo:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:h-10 transition-opacity ${FOCO}`}
          >
            <Plus size={14} aria-hidden /> Adicionar tarefa
          </button>
        </div>
      );
    }
    return (
      <form
        onSubmit={e => { e.preventDefault(); salvarCriacao(grupo); }}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node) && !novoTexto.trim()) cancelarCriacao(); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelarCriacao(); } }}
        className="flex items-center gap-2 px-4 h-11 rounded-b-2xl"
      >
        <Plus size={14} className="text-zinc-500 shrink-0" aria-hidden />
        <input
          autoFocus
          type="text"
          value={novoTexto}
          onChange={e => setNovoTexto(e.target.value)}
          placeholder="Nome da tarefa"
          aria-label={`Nova tarefa em ${grupo.rotulo}`}
          className="peer w-64 sm:w-80 bg-transparent border-0 outline-none text-body text-zinc-100 placeholder-zinc-500"
        />
        {!projetoInferido && (
          <select
            ref={projetoSelectRef}
            value={novoProjeto}
            onChange={e => { setNovoProjeto(e.target.value); setErroProjeto(false); }}
            aria-label="Empreendimento da nova tarefa"
            aria-invalid={erroProjeto}
            className={`h-7 max-w-[200px] bg-[#08080a] border rounded-md px-2 text-caption text-zinc-200 ${FOCO} ${erroProjeto ? 'border-red-500' : 'border-zinc-800'}`}
          >
            <option value="">Empreendimento…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {erroProjeto && <span role="alert" className="text-caption text-red-400 whitespace-nowrap">Escolha o empreendimento</span>}
        <span className="hidden peer-focus:inline text-caption text-zinc-400 whitespace-nowrap">Enter para salvar · Esc para cancelar</span>
      </form>
    );
  };

  const renderGrupo = (grupo: Grupo) => {
    const recolhido = !semCabecalhoDeGrupo && prefs.recolhidos.includes(grupo.chave);
    const vazio = grupo.tarefas.length === 0;
    const idCorpo = `grupo-${grupo.chave.replace(/[^a-z0-9_-]/gi, '-')}`;
    // Reagendar em lote: só quem pode mudar prazos existentes direto (os demais justificam na tarefa).
    const podeReagendarGrupo = minhasTarefas && grupo.atrasadas && prazoAdmin && podeEditar && !recolhido;
    const limiteGrupo = podeReagendarGrupo
      ? grupo.tarefas.map(t => limiteDaTarefa(t.id)?.data).filter((d): d is string => !!d).sort()[0]
      : undefined;
    return (
      // Cada grupo é um card, como as seções do Início. Sem overflow-hidden: os popovers precisam escapar.
      <div key={grupo.chave} role="rowgroup" className={`group/grupo ${vazio && minhasTarefas ? 'border border-zinc-900 rounded-2xl' : CARD}`}>
        {!semCabecalhoDeGrupo && (
          <div className={`h-12 flex items-center ${recolhido || vazio ? '' : 'border-b border-zinc-900'}`}>
            <button
              type="button"
              onClick={() => mudarPrefs({ recolhidos: recolhido ? prefs.recolhidos.filter(g => g !== grupo.chave) : [...prefs.recolhidos, grupo.chave] })}
              disabled={vazio && minhasTarefas}
              aria-expanded={!recolhido}
              aria-controls={idCorpo}
              className={`sticky left-0 flex items-center gap-2 px-4 h-full rounded-2xl text-zinc-400 enabled:hover:text-zinc-100 ${FOCO}`}
            >
              {vazio && minhasTarefas ? <span className="w-[14px] shrink-0" aria-hidden />
                : recolhido ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              {grupo.icone}
              <span className={`text-heading ${vazio ? 'font-medium text-zinc-400' : 'font-semibold text-zinc-100'}`}>{grupo.rotulo}</span>
              <span className="text-body tabular-nums text-zinc-400">{grupo.tarefas.length}</span>
            </button>
            {podeReagendarGrupo && (
              <div className="ml-auto pr-3">
                <DatePicker
                  value=""
                  align="right"
                  disableAutoScroll
                  disablePast
                  maxDate={limiteGrupo}
                  onChange={d => { if (d) grupo.tarefas.forEach(t => salvarPrazo(t, d)); }}
                  trigger={
                    <button type="button" aria-label={`Reagendar as ${grupo.tarefas.length} tarefas atrasadas`} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/10 text-body font-medium text-zinc-100 hover:bg-[#1f1f23] transition-colors ${FOCO}`}>
                      <Calendar size={14} aria-hidden /> Reagendar
                    </button>
                  }
                />
              </div>
            )}
          </div>
        )}
        {!recolhido && (
          <div id={idCorpo} >
            {grupo.tarefas.map(renderLinha)}
            {renderCriacao(grupo)}
          </div>
        )}
      </div>
    );
  };

  // ─── Faixa de resumo de prazos ─────────────────────────────────────
  const temPendencia = resumo.critical + resumo.overdue + resumo.soon > 0;
  const tomCritico = resumo.critical > 0;
  const trechos: { filtro: FiltroPrazo; texto: string; dica?: string }[] = [];
  if (resumo.critical) trechos.push({ filtro: 'critical', texto: `${plural(resumo.critical, 'tarefa', 'tarefas')} com atraso crítico (+${OVERDUE_CRITICAL_DAYS} dias)` });
  if (resumo.overdue) trechos.push({ filtro: 'overdue', texto: plural(resumo.overdue, 'atrasada', 'atrasadas') });
  if (resumo.week) trechos.push({ filtro: 'week', texto: `${plural(resumo.week, 'vence', 'vencem')} esta semana`, dica: `Vence hoje ou nos próximos ${DUE_WEEK_DAYS} dias` });
  const soEsse = (f: FiltroPrazo) => filtros.prazos.length === 1 && filtros.prazos[0] === f;

  const acaoLote = `h-8 px-2.5 rounded-md font-medium text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1 ${FOCO}`;

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden bg-[#08080a]">
      {/* Minhas tarefas: a página rola inteira (sem scroll aninhado) e só o cabeçalho das colunas fica fixo. */}
      <div className={minhasTarefas ? 'flex-1 min-h-0 overflow-auto scrollbar-minimal view-pad-x' : 'flex-1 min-h-0 flex flex-col view-pad-x view-pad-y pb-2'}>
      <div
        className={`flex flex-col gap-3 ${minhasTarefas ? 'w-full max-w-[1600px] mx-auto pt-4 pb-24' : 'flex-1 min-h-0'}`}
      >
      {temPendencia && !minhasTarefas && (
        <div
          role="region"
          aria-label="Resumo de prazos"
          className={`shrink-0 flex items-center flex-wrap gap-x-1 gap-y-1 px-3 py-2 rounded-lg border text-body ${
            tomCritico ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {tomCritico
            ? <AlertTriangle size={16} className="shrink-0 mr-1 text-red-400" aria-hidden />
            : <Clock size={16} className="shrink-0 mr-1 text-amber-400" aria-hidden />}
          {trechos.map((t, i) => (
            <React.Fragment key={t.filtro}>
              {i > 0 && <span aria-hidden className="opacity-60 px-1">·</span>}
              <button
                type="button"
                title={t.dica}
                aria-pressed={soEsse(t.filtro)}
                onClick={() => mudarPrefs({ filtros: { ...filtros, prazos: soEsse(t.filtro) ? [] : [t.filtro] } })}
                className={`rounded px-0.5 underline-offset-2 hover:underline ${FOCO} ${t.filtro === 'critical' ? 'font-semibold' : ''} ${soEsse(t.filtro) ? 'underline' : ''}`}
              >
                {t.texto}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      <ListaBarra
        busca={search}
        onBusca={setSearch}
        prefs={{ ...prefs, filtros }}
        onPrefs={mudarPrefs}
        projects={projects}
        pessoas={minhasTarefas ? [] : usuariosDoFiltro}
        colunas={columns.filter(c => c.id !== 'title' && colunaDisponivel(c)).map(c => ({ id: c.id, label: c.label, visivel: colunaLigada(c) }))}
        onColuna={alternarColuna}
        minhas={minhasTarefas ? {
          projetos: projetosMkt,
        } : undefined}
      />

      {filteredTasks.length === 0 ? (
        <div className={`bg-[#121214] border border-zinc-900 rounded-2xl p-12 short:p-6 text-center flex flex-col items-center justify-center ${minhasTarefas ? 'shrink-0' : 'flex-1'}`}>
          <Inbox size={22} className="mb-2 text-zinc-500" aria-hidden />
          <p className="text-body font-medium text-zinc-200">
            {tasks.length === 0 ? 'Nenhuma tarefa por aqui'
              : minhasTarefas && baseResumo.length > 0 && !termo && filtros.prazos.length === 0 ? 'Nenhuma tarefa em aberto'
              : 'Nenhuma tarefa corresponde aos filtros'}
          </p>
          {tasks.length > 0 && (
            <button type="button" onClick={() => { setSearch(''); mudarPrefs({ filtros: FILTROS_VAZIOS }); }} className={`mt-3 h-8 px-3 rounded-md border border-zinc-800 text-caption font-medium text-zinc-200 hover:bg-zinc-900 ${FOCO}`}>
              Limpar busca e filtros
            </button>
          )}
        </div>
      ) : (
        // Os grupos é que são cards; em Minhas tarefas a lista não tem scroll próprio.
        <div className={minhasTarefas ? 'min-w-0' : 'flex-1 overflow-auto scrollbar-minimal min-h-0'}>
          <div role="table" aria-label="Tarefas" className="w-full select-none" style={{ minWidth: larguraMinima }}>
            <div role="row" className="grid bg-[#08080a] border-x border-transparent sticky top-0 z-20" style={gradeStyle}>
              {colunasVisiveis.map(col => (
                <div
                  key={col.id}
                  role="columnheader"
                  draggable={col.id !== 'title'}
                  onDragStart={e => { setDraggedColumn(col.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => handleDragOver(e, col.id)}
                  onDragEnd={() => setDraggedColumn(null)}
                  className={`group/col relative flex items-center px-3 h-9 min-w-0 text-caption font-medium text-zinc-500 ${col.id === 'title' ? 'pl-4' : ''} ${col.id === 'dueDate' || col.id === 'startDate' ? 'justify-end' : ''} ${draggedColumn === col.id ? 'opacity-50' : ''}`}
                >
                  {col.id !== 'title' && (
                    <GripVertical size={12} className="opacity-0 group-hover/col:opacity-100 cursor-grab text-zinc-500 absolute left-0" aria-hidden />
                  )}
                  <span className={`truncate ${col.id === 'title' ? 'pl-8' : ''}`}>{col.label}</span>
                  {col.id !== 'title' && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40"
                      onMouseDown={e => iniciarRedimensionar(e, col.id, col.width)}
                      aria-hidden
                    />
                  )}
                </div>
              ))}
              {comAcoes && <div role="columnheader" aria-label="Ações" />}
            </div>
            <div className="flex flex-col gap-4">{grupos.map(renderGrupo)}</div>
          </div>
        </div>
      )}
      </div>
      </div>

      {/* Ações em lote (X ou Ctrl+clique seleciona) */}
      {tarefasSelecionadas.length > 0 && podeEditar && (
        <div role="toolbar" aria-label="Ações em lote" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 pl-4 pr-1.5 h-11 rounded-xl bg-[#18181b] border border-zinc-700 shadow-2xl text-caption whitespace-nowrap">
          <span className="text-zinc-200 tabular-nums mr-2">{plural(tarefasSelecionadas.length, 'selecionada', 'selecionadas')}</span>
          <button type="button" className={acaoLote} onClick={() => { concluir(tarefasSelecionadas); limparSelecao(); }}>Concluir</button>
          <StatusPicker
            value={tarefasSelecionadas[0].status}
            onChange={status => tarefasSelecionadas.forEach(t => { if (t.status !== status) onUpdateTask({ id: t.id, status }); })}
            trigger={<button type="button" className={acaoLote}>Status <ChevronDown size={12} aria-hidden /></button>}
          />
          <PriorityPicker
            value={tarefasSelecionadas[0].priority}
            onChange={priority => tarefasSelecionadas.forEach(t => { if (t.priority !== priority) onUpdateTask({ id: t.id, priority }); })}
            trigger={<button type="button" className={acaoLote}>Prioridade <ChevronDown size={12} aria-hidden /></button>}
          />
          <button type="button" aria-label="Limpar seleção" title="Limpar seleção (Esc)" onClick={limparSelecao} className={`size-8 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 ${FOCO}`}>
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      <div aria-live="polite" className={`absolute left-1/2 -translate-x-1/2 z-50 ${tarefasSelecionadas.length > 0 ? 'bottom-[72px]' : 'bottom-4'}`}>
        {toast && (
          <div key={toast.lote} className="flex items-center gap-3 bg-[#18181b] border border-zinc-700 text-zinc-100 text-body px-4 py-2.5 rounded-xl shadow-2xl animate-slide-up whitespace-nowrap">
            {toast.erro
              ? <AlertTriangle size={16} className="shrink-0 text-red-400" aria-hidden />
              : <Check size={16} className="text-emerald-400" aria-hidden />}
            <span>{toast.mensagem}</span>
            {!toast.erro && <button type="button" onClick={() => encerrarLote(toast.lote, false)} className={`font-semibold text-blue-400 hover:text-blue-300 rounded px-1 ${FOCO}`}>Desfazer</button>}
          </div>
        )}
      </div>
    </div>
  );
}

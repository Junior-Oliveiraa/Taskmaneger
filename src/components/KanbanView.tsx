import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown, Hourglass } from 'lucide-react';
import { Task, TaskStatus, TaskPriority, Project, Label } from '../types';

const getElapsedTimeData = (tt: Task['timeTracking']): { text: string } | null => {
  if (!tt) return null;
  let ms = tt.accumulatedMs;
  if (tt.isTimerRunning && tt.lastStartedAt) {
    ms += Date.now() - new Date(tt.lastStartedAt).getTime();
  }
  if (ms === 0) return null;
  
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / (24 * 60));
  const remainingHours = Math.floor((totalMins % (24 * 60)) / 60);
  const remainingMins = totalMins % 60;

  let text = '';
  if (days >= 1) {
    text = `${days}d e ${remainingHours}h`;
  } else if (remainingHours >= 1) {
    text = `${remainingHours}h${remainingMins}m`;
  } else {
    text = `${remainingMins}m`;
  }

  return { text };
};

import { useAuth } from '../context/AuthContext';
import ReminderBell from './ReminderBell';
import PriorityPicker from './PriorityPicker';
import AssigneePicker from './AssigneePicker';
import KanbanTimesModal from './KanbanTimesModal';
import { useKanbanTimes } from '../lib/kanbanTimes';
import { idsResponsaveis } from '../lib/responsaveis';
import { ORDEM_STATUS, STATUS_INFO, StatusIcone, TipoIcone, PRIORIDADE_INFO, PRIORIDADE_PILULA, PrazoBadge } from './TarefaBadges';
import TarefasBarra, { OrdemKanban } from './TarefasBarra';
import { casaBusca, usePrefsLista } from '../hooks/usePrefsLista';
import { casaPrazo } from '../lib/listaPrefs';
import { formatarDataExtensaCurta, getDueState } from '../lib/prazo';

const TIME_STORAGE_KEY = 'kanban.filtroTime';

type EditorPresence = { name: string; avatarUrl?: string; color: string };

interface KanbanViewProps {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  onSelectTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onAddTask: (task: Task) => void;
  currentProjectFilter: string | null;
  socialMediaFilter?: boolean;
  setSocialMediaFilter?: (val: boolean) => void;
  hideFilters?: boolean;
  maxCardsPerColumn?: number;
  hideNewTaskButton?: boolean;
  editingMap?: Record<string, EditorPresence>;
  /**
   * Restringe as pessoas do filtro de responsáveis (Minhas tarefas). Quando
   * definido, o filtro de times some e não limita o quadro.
   */
  usuariosFiltro?: string[];
  /** Abre mostrando as tarefas de todos, sem o filtro de pessoa nem de time. */
  abrirEmTodos?: boolean;
}

/** Prioridade do card: o mesmo ícone e a mesma cor do painel da tarefa. */
function PilulaPrioridade({ prioridade }: { prioridade: TaskPriority }) {
  const { label } = PRIORIDADE_INFO[prioridade] ?? PRIORIDADE_INFO.no_priority;
  const { icone: Icone, pilula } = PRIORIDADE_PILULA[prioridade] ?? PRIORIDADE_PILULA.no_priority;
  const vazia = prioridade === 'no_priority';
  return (
    <button
      type="button"
      aria-label={`Prioridade: ${label}. Alterar`}
      title={vazia ? 'Definir prioridade' : `Prioridade ${label.toLowerCase()}`}
      className={`cursor-pointer inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#1f1f23] text-caption font-medium text-zinc-400 hover:text-zinc-200 whitespace-nowrap transition-colors ${pilula}`}
    >
      <Icone size={14} className="shrink-0" aria-hidden />
      {!vazia && label}
    </button>
  );
}

const COLUMNS = ORDEM_STATUS.map(id => ({ id, label: STATUS_INFO[id].label }));

export default function KanbanView({
  tasks,
  projects,
  labels,
  onSelectTask,
  onUpdateTask,
  onAddTask,
  currentProjectFilter,
  socialMediaFilter,
  setSocialMediaFilter,
  hideFilters = false,
  editingMap = {},
  maxCardsPerColumn,
  hideNewTaskButton = false,
  usuariosFiltro,
  abrirEmTodos = false,
}: KanbanViewProps) {
  const { allUsers: USERS, currentUser } = useAuth();
  const sortedUsers = currentUser
    ? [currentUser, ...USERS.filter(u => u.id !== currentUser.id)]
    : USERS;
  
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  // dropIndex: index in column where the indicator is shown, -1 = end of list
  const [dropIndicator, setDropIndicator] = useState<{ colId: TaskStatus; index: number } | null>(null);
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | 'all'>(abrirEmTodos ? 'all' : currentUser?.id || 'all');
  const [filterTimeId, setFilterTimeIdState] = useState<string | 'all'>(() => {
    if (abrirEmTodos) return 'all';
    try { return localStorage.getItem(TIME_STORAGE_KEY) || 'all'; } catch { return 'all'; }
  });
  const setFilterTimeId = (id: string | 'all') => {
    setFilterTimeIdState(id);
    try { localStorage.setItem(TIME_STORAGE_KEY, id); } catch { /* sem storage */ }
  };
  const [showTimesConfig, setShowTimesConfig] = useState(false);
  const { times } = useKanbanTimes();

  // Times: só quem está em algum time aparece no quadro (no filtro e nas
  // tarefas). Sem nenhum time cadastrado, o quadro mostra todo mundo.
  // Com usuariosFiltro (Minhas tarefas) os times não se aplicam: o filtro mostra
  // só quem divide tarefas com o usuário.
  const usaTimes = !usuariosFiltro && times.length > 0;
  const timeAtivo = usaTimes && filterTimeId !== 'all' ? times.find(t => t.id === filterTimeId) : undefined;
  const idsNoQuadro: Set<string> | null = usuariosFiltro
    ? new Set(usuariosFiltro)
    : !usaTimes
      ? null
      : new Set(timeAtivo ? timeAtivo.membros : times.flatMap(t => t.membros));
  const boardUsers = idsNoQuadro ? sortedUsers.filter(u => idsNoQuadro.has(u.id)) : sortedUsers;
  // Responsável escolhido que não está no time selecionado: volta para "Todos".
  const assigneeEfetivo = filterAssigneeId !== 'all' && idsNoQuadro && !idsNoQuadro.has(filterAssigneeId)
    ? 'all'
    : filterAssigneeId;
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [sortPriority, setSortPriority] = useState<'none' | 'asc' | 'desc'>('desc');
  const [sortDue, setSortDue] = useState<'none' | 'asc' | 'desc'>('asc');
  const hasInitialized = useRef(abrirEmTodos || !!currentUser);

  // Ghost card refs
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingCardRef = useRef<string | null>(null);

  // Drag to pan state
  const [isPanning, setIsPanning] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!hasInitialized.current && currentUser) {
      setFilterAssigneeId(currentUser.id);
      hasInitialized.current = true;
    }
  }, [currentUser]);
  
  const [quickAddColId, setQuickAddColId] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  // Minhas tarefas: os mesmos filtros (e a mesma preferência salva) da Lista.
  const minhas = !!usuariosFiltro;
  const [busca, setBusca] = useState('');
  const { prefs, mudarPrefs, filtros, casaFiltros, projetos } = usePrefsLista(projects, true);

  // Seta/fade à direita só enquanto há coluna escondida.
  const [podeRolar, setPodeRolar] = useState(false);
  const medirRolagem = () => {
    const el = scrollContainerRef.current;
    if (el) setPodeRolar(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };
  useEffect(() => {
    medirRolagem();
    const ro = new ResizeObserver(medirRolagem);
    if (scrollContainerRef.current) ro.observe(scrollContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Filter tasks
  let filteredTasks = tasks.filter(task => {
    if (currentProjectFilter && task.projectId !== currentProjectFilter) return false;
    const responsaveis = idsResponsaveis(task);
    if (idsNoQuadro && !usuariosFiltro) {
      // Aparece se algum dos responsáveis está no quadro.
      if (responsaveis.length ? !responsaveis.some(id => idsNoQuadro.has(id)) : !!timeAtivo) return false;
    }
    if (assigneeEfetivo !== 'all' && !responsaveis.includes(assigneeEfetivo)) return false;
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
    if (minhas && !(casaFiltros(task) && casaPrazo(getDueState(task.dueDate, task.status), filtros.prazos) && casaBusca(task, busca))) return false;
    return true;
  });

  // Sort tasks
  if (sortPriority !== 'none' || sortDue !== 'none') {
    const priorityWeight: Record<TaskPriority, number> = {
      urgent: 4, high: 3, medium: 2, low: 1, no_priority: 0
    };
    filteredTasks = [...filteredTasks].sort((a, b) => {
      if (sortPriority !== 'none') {
        const pA = priorityWeight[a.priority];
        const pB = priorityWeight[b.priority];
        if (pA !== pB) return sortPriority === 'asc' ? pA - pB : pB - pA;
      }
      if (sortDue !== 'none') {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        if (!a.dueDate && b.dueDate) return 1;
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (dateA !== dateB) return sortDue === 'asc' ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });
  }

  const getColTasks = (colId: TaskStatus) => filteredTasks.filter(t => t.status === colId);

  // ─────────────────────────────────────────────────
  // GHOST CARD LOGIC
  // ─────────────────────────────────────────────────
  const createGhost = useCallback((sourceEl: HTMLElement, clientX: number, clientY: number) => {
    // Remove any stale ghost
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }

    const rect = sourceEl.getBoundingClientRect();
    dragOffsetRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    const ghost = sourceEl.cloneNode(true) as HTMLDivElement;
    ghost.style.position = 'fixed';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.95';
    ghost.style.transform = 'rotate(1.5deg) scale(1.03)';
    ghost.style.boxShadow = '0 24px 48px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.4)';
    ghost.style.transition = 'transform 0.1s ease, opacity 0.1s ease';
    ghost.style.borderRadius = '12px';
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
  }, []);

  const moveGhost = useCallback((clientX: number, clientY: number) => {
    if (!ghostRef.current) return;
    ghostRef.current.style.left = `${clientX - dragOffsetRef.current.x}px`;
    ghostRef.current.style.top = `${clientY - dragOffsetRef.current.y}px`;
  }, []);

  const removeGhost = useCallback(() => {
    draggingCardRef.current = null;
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghostRef.current = null; // clear ref immediately so mousemove stops
    ghost.style.opacity = '0';
    ghost.style.transform = 'rotate(1.5deg) scale(0.97)';
    ghost.style.transition = 'opacity 0.13s ease, transform 0.13s ease';
    setTimeout(() => {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }, 140);
  }, []);

  // Safety-net: catch any dragend that slips through (e.g. Escape key, drop outside)
  useEffect(() => {
    const onDragEnd = () => {
      if (ghostRef.current || draggingCardRef.current) {
        removeGhost();
        setDraggingCardId(null);
        setDragOverColumn(null);
        setDropIndicator(null);
      }
    };
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, [removeGhost]);

  // ─────────────────────────────────────────────────
  // DRAG HANDLERS
  // ─────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string, sourceEl: HTMLElement) => {
    e.dataTransfer.setData('text/plain', taskId);
    // Neutralize browser ghost
    const empty = new Image();
    e.dataTransfer.setDragImage(empty, 0, 0);

    draggingCardRef.current = taskId;
    setDraggingCardId(taskId);

    // Create ghost after a micro-delay so the original renders as transparent first
    const cx = e.clientX;
    const cy = e.clientY;
    requestAnimationFrame(() => createGhost(sourceEl, cx, cy));
  }, [createGhost]);

  const handleDragEnd = useCallback(() => {
    removeGhost();
    setDraggingCardId(null);
    setDragOverColumn(null);
    setDropIndicator(null);
  }, [removeGhost]);

  const calcDropIndex = (e: React.DragEvent, colId: TaskStatus): number => {
    const colTasks = getColTasks(colId);
    const cardEls = document.querySelectorAll(`[data-col="${colId}"] [data-card]`);
    let insertAt = colTasks.length; // default: end
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        insertAt = i;
        break;
      }
    }
    return insertAt;
  };

  const handleDragOver = useCallback((e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(colId);
    const idx = calcDropIndex(e, colId);
    setDropIndicator({ colId, index: idx });
    // Move ghost on dragover (reliable cross-browser alternative to mousemove)
    if (ghostRef.current) moveGhost(e.clientX, e.clientY);
  }, [moveGhost]);

  const handleDragLeave = useCallback((e: React.DragEvent, colId: TaskStatus) => {
    // Only clear if leaving the column entirely (not just moving between children)
    const rel = e.relatedTarget as HTMLElement | null;
    if (rel && (e.currentTarget as HTMLElement).contains(rel)) return;
    setDragOverColumn(prev => prev === colId ? null : prev);
    setDropIndicator(prev => prev?.colId === colId ? null : prev);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');

    // Always clean ghost immediately on drop
    removeGhost();
    setDraggingCardId(null);
    setDragOverColumn(null);
    setDropIndicator(null);

    if (!taskId) return;
    const matchedTask = tasks.find(t => t.id === taskId);
    if (!matchedTask) return;

    onUpdateTask({ ...matchedTask, status: targetStatus });

    // Snap animation — apply after React re-renders the card in its new column
    setTimeout(() => {
      const cardEl = document.querySelector(`[data-card="${taskId}"]`) as HTMLElement | null;
      if (!cardEl) return;
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'translateY(-8px)';
      requestAnimationFrame(() => {
        cardEl.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        cardEl.style.opacity = '1';
        cardEl.style.transform = 'translateY(0)';
        setTimeout(() => {
          cardEl.style.transition = '';
          cardEl.style.opacity = '';
          cardEl.style.transform = '';
        }, 220);
      });
    }, 40);
  }, [tasks, onUpdateTask, removeGhost]);

  // ─────────────────────────────────────────────────
  // MISC HANDLERS
  // ─────────────────────────────────────────────────
  const handleAddNewTaskInColumn = (statusId: TaskStatus) => {
    const idNum = 100 + tasks.length + 1;
    const newTask: any = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      status: statusId,
      priority: 'medium',
      projectId: '',
      labels: [labels.find(l => l.name === 'Tarefa') || labels[0]].filter(Boolean) as Label[],
      subtasks: [],
      createdAt: new Date().toISOString().split('T')[0],
      assigneeId: currentUser?.id,
      _isLocal: true,
    };
    onAddTask(newTask as Task);
    onSelectTask(newTask);
  };

  const triggerQuickAdd = (status: TaskStatus) => {
    setQuickAddColId(status);
    setQuickAddTitle('');
  };

  const submitQuickAdd = (e: React.FormEvent, status: TaskStatus) => {
    e.preventDefault();
    if (!quickAddTitle.trim()) { setQuickAddColId(null); return; }
    const newTask: any = {
      id: crypto.randomUUID(),
      title: quickAddTitle.trim(),
      description: 'Criada via Adição Rápida de Coluna.',
      status,
      priority: 'medium',
      projectId: currentProjectFilter || (projects[0]?.id || 'p1'),
      labels: [labels.find(l => l.name === 'Tarefa') || labels[0]].filter(Boolean) as Label[],
      subtasks: [],
      createdAt: new Date().toISOString().split('T')[0],
      assigneeId: currentUser?.id,
      _isLocal: true,
    };
    onAddTask(newTask as Task);
    setQuickAddTitle('');
    setQuickAddColId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.kanban-column')) return;
    if (e.deltaY !== 0) {
      document.querySelectorAll('.kanban-column').forEach(col => { (col as HTMLElement).scrollTop += e.deltaY; });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('[draggable]')) return;
    setIsPanning(true);
    setStartX(e.pageX - (scrollContainerRef.current?.offsetLeft || 0));
    setScrollLeft(scrollContainerRef.current?.scrollLeft || 0);
  };

  const handleMouseLeave = () => setIsPanning(false);
  const handleMouseUp = () => setIsPanning(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollContainerRef.current.scrollLeft = scrollLeft - (x - startX) * 1.5;
  };

  // Sync column heights
  useEffect(() => {
    if (hideFilters) return; // Do not force huge heights in the constrained planner view
    const inners = document.querySelectorAll('.kanban-column-inner') as NodeListOf<HTMLElement>;
    let max = 0;
    inners.forEach(el => el.style.minHeight = '0px');
    inners.forEach(el => { if (el.scrollHeight > max) max = el.scrollHeight; });
    inners.forEach(el => el.style.minHeight = `${max}px`);
  }, [tasks, assigneeEfetivo, filterTimeId, times, filterPriority, hideFilters]);

  // ─────────────────────────────────────────────────
  // DROP INDICATOR COMPONENT
  // ─────────────────────────────────────────────────
  const DropLine = ({ visible }: { visible: boolean }) => (
    <div
      style={{
        height: visible ? '2px' : '0px',
        transition: 'height 0.12s ease',
        borderRadius: '4px',
        background: 'var(--color-blue-500)',
        marginBottom: visible ? '4px' : '0px',
        overflow: 'hidden',
      }}
    />
  );

  // ─────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#08080a]">
      {!hideFilters && (
        <div className="view-pad-x pt-4 pb-3 shrink-0">
          <TarefasBarra
            minhas={minhas ? {
              busca, onBusca: setBusca, prefs: { ...prefs, filtros }, onPrefs: mudarPrefs, projects, projetos, usuarioId: currentUser?.id,
            } : undefined}
            times={usaTimes ? times : []}
            time={timeAtivo?.id ?? 'all'}
            onTime={setFilterTimeId}
            pessoas={boardUsers}
            responsavel={assigneeEfetivo}
            onResponsavel={setFilterAssigneeId}
            prioridade={filterPriority}
            onPrioridade={setFilterPriority}
            exibicao={<OrdemKanban ordemPrioridade={sortPriority} onOrdemPrioridade={setSortPriority} ordemPrazo={sortDue} onOrdemPrazo={setSortDue} />}
            exibicaoRotulo="Ordenar"
            social={setSocialMediaFilter ? { ativo: !!socialMediaFilter, onMudar: setSocialMediaFilter } : undefined}
            onConfigurarTimes={() => setShowTimesConfig(true)}
          />
        </div>
      )}

      {showTimesConfig && <KanbanTimesModal onClose={() => setShowTimesConfig(false)} />}

      {/* Board */}
      <div className="relative flex-1 flex min-h-0">
        <div
          ref={scrollContainerRef}
        onWheel={handleWheel}
        onScroll={medirRolagem}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex-1 flex overflow-x-auto min-h-0 gap-4 select-none ${hideFilters ? 'no-scrollbar p-0 pt-1' : 'scrollbar-minimal view-pad-x pt-1 pb-4'} ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {COLUMNS.map((column, colIndex) => {
          const colTasks = getColTasks(column.id);
          const isTarget = dragOverColumn === column.id;
          const isQuickAddOpen = quickAddColId === column.id;

          return (
            <motion.div
              key={column.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: colIndex * 0.03 }}
              className="relative flex-1 kanban-col h-full flex flex-col"
            >
              <div
                data-col={column.id}
                // Coluna vazia = só o contorno, como os grupos vazios da Lista.
                className={`group/column kanban-column w-full h-full rounded-2xl border transition-colors duration-150 flex flex-col ${
                  isTarget ? 'bg-blue-500/5 border-blue-500/30' : colTasks.length === 0 ? 'border-zinc-900' : 'bg-[#0c0c0e] border-zinc-900'
                }`}
              >
                {/* Column header - Static */}
                <div className="flex items-center justify-between h-12 pl-4 pr-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusIcone status={column.id} />
                    <h3 className={`text-heading truncate ${colTasks.length === 0 ? 'font-medium text-zinc-400' : 'font-semibold text-zinc-100'}`}>{column.label}</h3>
                    <span className="text-body tabular-nums text-zinc-400">
                      {colTasks.filter(t => t.id !== draggingCardId).length}
                    </span>
                  </div>
                  <button
                    onClick={() => triggerQuickAdd(column.id)}
                    className="opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 size-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition"
                    title="Adicionar tarefa na coluna"
                    aria-label={`Adicionar tarefa em ${column.label}`}
                  >
                    <Plus size={15} aria-hidden />
                  </button>
                </div>

                {/* Quick Add */}
                {isQuickAddOpen && (
                  <form onSubmit={(e) => submitQuickAdd(e, column.id)} className="mb-2 px-2 shrink-0 animate-fade-in">
                    <div className="p-3 bg-[#121214] border border-zinc-900 rounded-xl">
                      <input
                        type="text" autoFocus required
                        placeholder="Nome da tarefa…"
                        aria-label={`Nova tarefa em ${column.label}`}
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        className="w-full h-9 bg-[#08080a] border border-zinc-800 px-2.5 text-body rounded-lg text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500/60 mb-2"
                      />
                      <div className="flex justify-end gap-1.5 text-body">
                        <button type="button" onClick={() => setQuickAddColId(null)} className="h-8 px-3 rounded-lg text-zinc-400 hover:text-zinc-100 font-medium">Cancelar</button>
                        <button type="submit" className="h-8 px-3 rounded-lg border border-white/10 text-zinc-100 hover:bg-[#1f1f23] font-medium transition-colors">Adicionar</button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Scrollable Task List */}
                <div 
                  className="flex-1 overflow-y-auto no-scrollbar relative px-2 pb-8"
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={(e) => handleDragLeave(e, column.id)}
                  onDrop={(e) => handleDrop(e, column.id)}
                >
                  <div className="flex flex-col min-h-[150px] gap-2">
                  {colTasks.length === 0 && !isTarget ? (
                    <p className="px-2 py-1 text-body text-zinc-500">Nenhuma tarefa</p>
                  ) : (
                    <AnimatePresence initial={false}>
                      {colTasks.map((task, cardIndex) => {
                        const project = projects.find(p => p.id === task.projectId);
                        const isDragging = draggingCardId === task.id;

                        const etiqueta = task.labels[0] ? labels.find(l => l.id === task.labels[0].id) : null;
                        const tempo = getElapsedTimeData(task.timeTracking);
                        const responsavel = task.assigneeId ? USERS.find(u => u.id === task.assigneeId) : undefined;

                        // Show drop line BEFORE this card
                        const showLineHere = dropIndicator?.colId === column.id && dropIndicator.index === cardIndex;
                        // Show drop line at END of list
                        const showLineAtEnd = dropIndicator?.colId === column.id && dropIndicator.index >= colTasks.length && cardIndex === colTasks.length - 1;

                        return (
                          <motion.div
                            key={task.id}
                            layout={!isDragging}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <DropLine visible={showLineHere} />

                            <div
                              data-card={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id, e.currentTarget as HTMLElement)}
                              onDrag={(e) => { if (e.clientX || e.clientY) moveGhost(e.clientX, e.clientY); }}
                              onDragEnd={handleDragEnd}
                              onClick={() => onSelectTask(task)}
                              className={`group relative flex flex-col gap-2 bg-[#121214] hover:bg-[#161619] border rounded-xl p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-colors duration-150 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-0' : ''} ${editingMap[task.id] ? 'border-[var(--edit-color)]/40' : 'border-zinc-900 hover:border-zinc-800'}`}
                              style={editingMap[task.id] ? { '--edit-color': editingMap[task.id].color } as React.CSSProperties : undefined}
                            >
                              {/* Código · empreendimento, e responsável */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex items-center gap-1.5 text-caption text-zinc-500">
                                  <span className="shrink-0 tabular-nums">{(task.taskCode || 'Novo').split('-')[0]}</span>
                                  {project && <><span aria-hidden>·</span><span className="truncate">{project.name}</span></>}
                                </span>
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {editingMap[task.id] && (
                                    <div
                                      title={`${editingMap[task.id].name} está editando`}
                                      className="flex items-center gap-1 px-1.5 rounded-full text-caption font-medium"
                                      style={{ background: `${editingMap[task.id].color}22`, color: editingMap[task.id].color, border: `1px solid ${editingMap[task.id].color}44` }}
                                    >
                                      <span className="size-1.5 rounded-full animate-pulse" style={{ background: editingMap[task.id].color }} aria-hidden />
                                      {editingMap[task.id].name.split(' ')[0]}
                                    </div>
                                  )}
                                  <AssigneePicker
                                    value={task.assigneeId}
                                    onChange={(val) => onUpdateTask({ ...task, assigneeId: val })}
                                    trigger={
                                      <button
                                        type="button"
                                        className="size-6 rounded-full shrink-0 overflow-hidden bg-[#1f1f23] inline-flex items-center justify-center text-caption text-zinc-300 hover:ring-1 hover:ring-zinc-500 transition"
                                        title={responsavel?.name || 'Sem responsável'}
                                        aria-label={`Responsável: ${responsavel?.name || 'nenhum'}. Alterar`}
                                      >
                                        {responsavel?.avatarUrl
                                          ? <img src={responsavel.avatarUrl} alt="" className="size-full object-cover" />
                                          : responsavel ? (responsavel.initials || responsavel.name)?.[0] : <Plus size={12} aria-hidden />}
                                      </button>
                                    }
                                  />
                                  {idsResponsaveis(task).length > 1 && (
                                    <span
                                      className="text-caption tabular-nums text-zinc-400"
                                      title={idsResponsaveis(task).map(id => USERS.find(u => u.id === id)?.name).filter(Boolean).join(', ')}
                                    >
                                      +{idsResponsaveis(task).length - 1}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-start gap-2">
                                <TipoIcone etiqueta={etiqueta} className="mt-0.5" />
                                <h4 className="min-w-0 text-body font-medium text-zinc-100 break-words">{task.title || 'Sem título'}</h4>
                              </div>

                              {/* Prioridade, tempo e lembrete à esquerda; prazo alinhado à direita */}
                              <div className="flex items-center gap-3 min-h-6">
                                <PriorityPicker
                                  value={task.priority}
                                  onChange={(val) => onUpdateTask({ ...task, priority: val })}
                                  trigger={<PilulaPrioridade prioridade={task.priority} />}
                                />
                                {tempo && (
                                  <span className="inline-flex items-center gap-1 text-caption tabular-nums text-zinc-500" title={task.timeTracking?.isTimerRunning ? 'Tempo rodando' : 'Tempo pausado/concluído'}>
                                    <Hourglass size={12} className={task.timeTracking?.isTimerRunning ? 'animate-pulse' : ''} aria-hidden />
                                    {tempo.text}
                                  </span>
                                )}
                                <div className={`flex items-center transition-opacity [@media(pointer:coarse)]:opacity-100 ${task.reminderType || task.reminderDate ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                                  <ReminderBell
                                    reminderDate={task.reminderDate}
                                    reminderType={task.reminderType}
                                    size={13}
                                    showLabel={true}
                                    align="right"
                                    disableAutoScroll
                                    onChange={({ reminderDate, reminderType }) => onUpdateTask({ ...task, reminderDate, reminderType })}
                                  />
                                </div>
                                <span className="ml-auto shrink-0 inline-flex items-center gap-1.5">
                                  {task.startDate && task.dueDate && <span className="text-body tabular-nums text-zinc-500" title={`Início: ${formatarDataExtensaCurta(task.startDate)}`}>{formatarDataExtensaCurta(task.startDate)} <span aria-hidden>→</span></span>}
                                  <PrazoBadge dueDate={task.dueDate} status={task.status} variante="lista" ocultarSemPrazo />
                                </span>
                              </div>
                            </div>

                            {/* Drop line AFTER last card */}
                            {showLineAtEnd && <DropLine visible={true} />}
                          </motion.div>
                        );
                      })}

                      {/* Drop line when column is empty and being dragged over */}
                      {colTasks.length === 0 && isTarget && (
                        <div className="h-16 border border-dashed border-blue-500/30 rounded-xl flex items-center justify-center text-body text-blue-400">
                          <span>Soltar aqui</span>
                        </div>
                      )}
                    </AnimatePresence>
                  )}

                  {/* New Task Button */}
                  {!hideNewTaskButton && (
                    <button
                      onClick={() => handleAddNewTaskInColumn(column.id)}
                      className="w-full h-9 px-2 flex items-center gap-1.5 text-body font-medium text-zinc-400 hover:text-zinc-100 hover:bg-[#161619] rounded-lg transition-colors"
                    >
                      <Plus size={14} aria-hidden />
                      Nova tarefa
                    </button>
                  )}
                  </div>
                </div>
              </div>

            {maxCardsPerColumn && colTasks.length > maxCardsPerColumn && (
              <div className="absolute bottom-0 left-0 w-full flex justify-center pb-2 pt-16 pointer-events-none z-20 bg-gradient-to-t from-[#08080a] via-[#08080a]/90 to-transparent rounded-b-xl">
                <ChevronDown size={20} className="animate-bounce text-zinc-500 opacity-70 drop-shadow-md mt-6" />
              </div>
            )}
          </motion.div>
          );
        })}
        </div>
        
        {/* Há mais colunas à direita */}
        {podeRolar && (
          <div aria-hidden className="absolute right-0 top-0 h-full w-16 pointer-events-none z-20 bg-gradient-to-l from-[#08080a] to-transparent" />
        )}
      </div>
    </div>
  );
}

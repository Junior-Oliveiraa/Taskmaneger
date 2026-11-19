import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Clock, 
  CheckCircle2, 
  HelpCircle, 
  AlertTriangle, 
  ArrowUp,
  ArrowDown, 
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  ChevronUp,
  Minus,
  Layers, 
  Bookmark,
  Sparkles,
  Inbox,
  Calendar,
  PenTool,
  Type,
  CheckSquare,
  DollarSign,
  Share2,
  LayoutTemplate,
  Tag as TagIcon,
  AlignJustify,
  LayoutGrid,
  Hourglass,
  Settings
} from 'lucide-react';
import { Task, TaskStatus, TaskPriority, Project, Label } from '../types';

const getElapsedTimeData = (tt: Task['timeTracking']): { text: string; colorClass: string } | null => {
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

  let colorClass = 'text-zinc-500'; // Default cinza
  if (days >= 10) {
    colorClass = 'text-red-500';
  } else if (days >= 7) {
    colorClass = 'text-amber-500';
  }

  return { text, colorClass };
};

import { useAuth } from '../context/AuthContext';
import ReminderBell from './ReminderBell';
import PriorityPicker from './PriorityPicker';
import AssigneePicker from './AssigneePicker';
import KanbanTimesModal from './KanbanTimesModal';
import { useKanbanTimes } from '../lib/kanbanTimes';

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
  defaultCompact?: boolean;
  hideNewTaskButton?: boolean;
  editingMap?: Record<string, EditorPresence>;
}

const COLUMNS: { id: TaskStatus; label: string; dotColor: string; icon: React.ReactNode; accentBg: string; accentBorder: string }[] = [
  { id: 'no_forecast',    label: 'Sem previsão',  dotColor: 'bg-slate-500',   icon: <Inbox size={14} className="text-slate-400 shrink-0" />,                         accentBg: 'bg-slate-500/5',   accentBorder: 'border-slate-500/30' },
  { id: 'todo',           label: 'A fazer',       dotColor: 'bg-blue-500',    icon: <HelpCircle size={14} className="text-blue-400 shrink-0" />,                     accentBg: 'bg-blue-500/5',    accentBorder: 'border-blue-500/30' },
  { id: 'in_progress',   label: 'Em progresso',  dotColor: 'bg-amber-500',   icon: <Clock size={14} className="text-amber-400 shrink-0 animate-pulse" />,            accentBg: 'bg-amber-500/5',   accentBorder: 'border-amber-500/30' },
  { id: 'paused',         label: 'Pausado',       dotColor: 'bg-red-400',     icon: <AlertTriangle size={14} className="text-red-400 shrink-0" />,                   accentBg: 'bg-red-500/5',     accentBorder: 'border-red-500/30' },
  { id: 'approval',       label: 'Aprovação',     dotColor: 'bg-purple-500',  icon: <HelpCircle size={14} className="text-purple-400 shrink-0" />,                   accentBg: 'bg-purple-500/5',  accentBorder: 'border-purple-500/30' },
  { id: 'rework',         label: 'Refação',       dotColor: 'bg-orange-500',  icon: <ArrowDown size={14} className="text-orange-400 shrink-0" />,                    accentBg: 'bg-orange-500/5',  accentBorder: 'border-orange-500/30' },
  { id: 'implementation', label: 'Implementação', dotColor: 'bg-blue-500',    icon: <Layers size={14} className="text-blue-400 shrink-0" />,                         accentBg: 'bg-blue-500/5',    accentBorder: 'border-blue-500/30' },
  { id: 'done',           label: 'Concluído',     dotColor: 'bg-emerald-500', icon: <CheckCircle2 size={14} className="text-emerald-450 shrink-0" />,                accentBg: 'bg-emerald-500/5', accentBorder: 'border-emerald-500/30' },
];

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
  defaultCompact = false,
  hideNewTaskButton = false
}: KanbanViewProps) {
  const { allUsers: USERS, currentUser } = useAuth();
  const sortedUsers = currentUser
    ? [currentUser, ...USERS.filter(u => u.id !== currentUser.id)]
    : USERS;
  
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  // dropIndex: index in column where the indicator is shown, -1 = end of list
  const [dropIndicator, setDropIndicator] = useState<{ colId: TaskStatus; index: number } | null>(null);
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | 'all'>(currentUser?.id || 'all');
  const [filterTimeId, setFilterTimeIdState] = useState<string | 'all'>(() => {
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
  const timeAtivo = filterTimeId !== 'all' ? times.find(t => t.id === filterTimeId) : undefined;
  const idsNoQuadro: Set<string> | null = times.length === 0
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
  const hasInitialized = useRef(!!currentUser);
  const [isCompact, setIsCompact] = useState(defaultCompact);

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

  // Filter tasks
  let filteredTasks = tasks.filter(task => {
    if (currentProjectFilter && task.projectId !== currentProjectFilter) return false;
    if (idsNoQuadro) {
      if (task.assigneeId ? !idsNoQuadro.has(task.assigneeId) : !!timeAtivo) return false;
    }
    if (assigneeEfetivo !== 'all' && task.assigneeId !== assigneeEfetivo) return false;
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
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
    ghost.style.borderRadius = '10px';
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
  }, [tasks, isCompact, assigneeEfetivo, filterTimeId, times, filterPriority, hideFilters]);

  // ─────────────────────────────────────────────────
  // PRIORITY BADGE
  // ─────────────────────────────────────────────────
  const getPriorityBadge = (prio: TaskPriority) => {
    const base = "inline-flex items-center justify-center h-[20px] gap-1 text-[10px] font-sans font-medium px-1.5 rounded border select-none";
    switch (prio) {
      case 'urgent': return <span className={`${base} text-red-400 bg-red-500/10 border-red-500/15`}><ChevronsUp size={10} className="shrink-0" /> Urgente</span>;
      case 'high':   return <span className={`${base} text-orange-400 bg-orange-500/10 border-orange-500/15`}><ChevronUp size={10} className="shrink-0" /> Alta</span>;
      case 'medium': return <span className={`${base} text-blue-400 bg-blue-500/10 border-blue-500/15`}><Minus size={10} className="shrink-0" /> Média</span>;
      case 'low':    return <span className={`${base} text-emerald-400 bg-emerald-500/10 border-emerald-500/15`}><ChevronDown size={10} className="shrink-0" /> Baixa</span>;
      default:       return <span className={`${base} text-zinc-600 bg-zinc-900/5 border-transparent`}>Sem prioridade</span>;
    }
  };

  // ─────────────────────────────────────────────────
  // DROP INDICATOR COMPONENT
  // ─────────────────────────────────────────────────
  const DropLine = ({ visible }: { visible: boolean }) => (
    <div
      style={{
        height: visible ? '3px' : '0px',
        transition: 'height 0.12s ease',
        borderRadius: '4px',
        background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
        boxShadow: '0 0 8px rgba(99,102,241,0.6)',
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
      {/* Filters Bar */}
      {!hideFilters && (
        <div className="view-pad-x py-3 short:py-2 border-b border-zinc-900/60 flex items-center flex-wrap gap-y-2 shrink-0">
          {/* Team Filter */}
          {times.length > 0 && (
            <div className="flex items-center gap-2 xl:gap-3 mr-3 xl:mr-6">
              <span className="hidden xl:inline text-xs text-zinc-500 font-medium">Time:</span>
              <div className="flex items-center gap-1 bg-zinc-900/40 p-1 rounded-full border border-zinc-800/50">
                <button onClick={() => setFilterTimeId('all')} className={`text-[10px] px-3 py-1 rounded-full font-medium transition-all ${!timeAtivo ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}>Todos</button>
                {times.map(t => (
                  <button key={t.id} onClick={() => setFilterTimeId(t.id)} className={`text-[10px] px-3 py-1 rounded-full font-medium transition-all whitespace-nowrap ${timeAtivo?.id === t.id ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}>{t.nome}</button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <span className="hidden xl:inline text-xs text-zinc-500 font-medium">Responsáveis:</span>
            <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1 rounded-full border border-zinc-800/50">
              <button onClick={() => setFilterAssigneeId('all')} className={`text-[10px] px-3 py-1 rounded-full font-medium transition-all ${assigneeEfetivo === 'all' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}>Todos</button>
              <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />
              <div className="flex items-center pl-1 pr-1 gap-1">
                {boardUsers.map(u => (
                  <button key={u.id} onClick={() => setFilterAssigneeId(u.id)} title={u.name}
                    className={`relative w-6 h-6 rounded-full border-2 transition-all duration-300 overflow-hidden flex items-center justify-center text-[9px] font-bold shrink-0 ${assigneeEfetivo === u.id ? 'border-blue-500 scale-110 shadow-lg shadow-blue-500/20' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'}`}
                    style={{ backgroundColor: u.avatarUrl ? 'transparent' : '#27272a' }}
                  >
                    {u.avatarUrl ? <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" /> : <span className="text-zinc-400">{u.initials}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-2 xl:gap-3 ml-3 xl:ml-6">
            <span className="hidden xl:inline text-xs text-zinc-500 font-medium">Prioridade:</span>
            <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1 rounded-full border border-zinc-800/50">
              <button onClick={() => setFilterPriority('all')} className={`text-[10px] px-3 py-1 rounded-full font-medium transition-all ${filterPriority === 'all' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}>Todas</button>
              <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />
              <div className="flex items-center pl-1 pr-1 gap-1">
                {[
                  { id: 'urgent',      label: 'U', icon: <AlertTriangle size={10} />, color: 'text-red-400 border-red-500 bg-red-500/10',       title: 'Urgente' },
                  { id: 'high',        label: 'A', icon: <ArrowUp size={10} />,       color: 'text-orange-400 border-orange-500 bg-orange-500/10', title: 'Alta' },
                  { id: 'medium',      label: 'M', icon: null,                        color: 'text-blue-400 border-blue-500 bg-blue-500/10',     title: 'Média' },
                  { id: 'low',         label: 'B', icon: <ArrowDown size={10} />,     color: 'text-emerald-400 border-emerald-500 bg-emerald-500/10', title: 'Baixa' },
                  { id: 'no_priority', label: '-', icon: null,                        color: 'text-zinc-500 border-zinc-500 bg-zinc-900/10',      title: 'Sem prioridade' },
                ].map(p => (
                  <button key={p.id} onClick={() => setFilterPriority(p.id as TaskPriority)} title={p.title}
                    className={`relative w-6 h-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center text-[10px] font-bold shrink-0 ${filterPriority === p.id ? `${p.color} scale-110 shadow-lg shadow-black/20` : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sort Filter */}
          <div className="flex items-center gap-2 xl:gap-3 ml-3 xl:ml-6">
            <span className="hidden xl:inline text-xs text-zinc-500 font-medium">Ordenar:</span>
            <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1 rounded-full border border-zinc-800/50">
              <button
                onClick={() => { if (sortPriority === 'asc') setSortPriority('desc'); else if (sortPriority === 'desc') setSortPriority('none'); else setSortPriority('asc'); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium transition-all ${sortPriority !== 'none' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                Prioridade
                <div className="flex flex-col gap-[1px]">
                  <ArrowUp size={9} className={sortPriority === 'asc' ? 'text-blue-400' : 'opacity-40'} />
                  <ArrowDown size={9} className={sortPriority === 'desc' ? 'text-blue-400' : 'opacity-40'} />
                </div>
              </button>
              <button
                onClick={() => { if (sortDue === 'asc') setSortDue('desc'); else if (sortDue === 'desc') setSortDue('none'); else setSortDue('asc'); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium transition-all ${sortDue !== 'none' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                Prazo
                <div className="flex flex-col gap-[1px]">
                  <ArrowUp size={9} className={sortDue === 'asc' ? 'text-blue-400' : 'opacity-40'} />
                  <ArrowDown size={9} className={sortDue === 'desc' ? 'text-blue-400' : 'opacity-40'} />
                </div>
              </button>
            </div>
          </div>

          {/* Social Media Filter */}
          {setSocialMediaFilter && (
            <div className="flex items-center gap-2 xl:gap-3 ml-3 xl:ml-6">
              <span className="hidden xl:inline text-xs text-zinc-500 font-medium">Acesso Rápido:</span>
              <button
                onClick={() => setSocialMediaFilter(!socialMediaFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                  socialMediaFilter 
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                    : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <Share2 size={12} className={socialMediaFilter ? 'text-purple-400' : 'text-zinc-500'} />
                Rede Social
              </button>
            </div>
          )}

          {/* Compact mode toggle + team settings */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIsCompact(v => !v)}
              title={isCompact ? 'Modo Normal' : 'Modo Ultra-Compacto'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${isCompact ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
            >
              {isCompact ? <LayoutGrid size={12} /> : <AlignJustify size={12} />}
              <span>{isCompact ? 'Normal' : 'Compacto'}</span>
            </button>
            <button
              onClick={() => setShowTimesConfig(true)}
              title="Configurar times"
              className="flex items-center justify-center p-1.5 rounded-lg border bg-zinc-900/40 border-zinc-800/50 text-zinc-500 hover:text-zinc-300 transition-all"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>
      )}

      {showTimesConfig && <KanbanTimesModal onClose={() => setShowTimesConfig(false)} />}

      {/* Board */}
      <div className="relative flex-1 flex min-h-0">
        <div
          ref={scrollContainerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex-1 flex overflow-x-auto min-h-0 view-gap select-none ${hideFilters ? 'no-scrollbar p-0 pt-1' : 'scrollbar-minimal view-pad'} ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
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
                className={`group/column kanban-column w-full h-full rounded-xl border transition-all duration-200 flex flex-col ${
                  isTarget
                    ? `${column.accentBg} ${column.accentBorder}`
                    : 'bg-transparent border-transparent'
                }`}
              >
                {/* Column header - Static */}
                <div className="flex items-center justify-between mb-2 px-3 shrink-0 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${column.dotColor}`} />
                    {column.icon}
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans">{column.label}</span>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.2 rounded border border-zinc-900/60 font-medium">
                      {colTasks.filter(t => t.id !== draggingCardId).length}
                    </span>
                  </div>
                  <button
                    onClick={() => triggerQuickAdd(column.id)}
                    className="opacity-0 group-hover/column:opacity-100 focus:opacity-100 p-1 rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-all duration-150"
                    title="Adicionar Tarefa na Coluna"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Quick Add */}
                {isQuickAddOpen && (
                  <form onSubmit={(e) => submitQuickAdd(e, column.id)} className="mb-3 px-3 shrink-0 animate-fade-in">
                    <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-lg">
                      <input
                        type="text" autoFocus required
                        placeholder="Nome do cartão..."
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        className="w-full bg-[#08080a] border border-zinc-800 p-2 text-xs rounded-md text-zinc-150 outline-none focus:border-zinc-700/60 mb-2"
                      />
                      <div className="flex justify-end gap-1.5 text-[10px]">
                        <button type="button" onClick={() => setQuickAddColId(null)} className="px-2 py-1 text-zinc-500 hover:text-zinc-300 font-sans font-medium">Cancelar</button>
                        <button type="submit" className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-100 rounded font-medium transition-colors">Adicionar</button>
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
                  <div className={`flex flex-col min-h-[150px] ${isCompact ? 'space-y-1' : 'space-y-3'}`}>
                  {colTasks.length === 0 && !isTarget ? (
                    <div className="h-24 border border-dashed border-zinc-900 rounded-xl flex flex-col items-center justify-center text-xs text-zinc-650 italic bg-transparent">
                      <Layers size={13} className="mb-1 text-zinc-750" />
                      <span>Sem cards</span>
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {colTasks.map((task, cardIndex) => {
                        const project = projects.find(p => p.id === task.projectId);
                        const totalSub = task.subtasks.length;
                        const completedSub = task.subtasks.filter(s => s.completed).length;
                        const isDragging = draggingCardId === task.id;

                        const primaryLabelId = task.labels.length > 0 ? task.labels[0]?.id : null;
                        const primaryLabelData = primaryLabelId ? labels.find(l => l.id === primaryLabelId) : null;
                        const themeTextColor = primaryLabelData ? (primaryLabelData.color.match(/text-[a-z]+-\d+/) || ['text-zinc-500'])[0] : '';

                        let ThemeIcon: any = null;
                        if (primaryLabelData?.name === 'Design') ThemeIcon = PenTool;
                        else if (primaryLabelData?.name === 'Copy') ThemeIcon = Type;
                        else if (primaryLabelData?.name === 'Tarefa') ThemeIcon = CheckSquare;
                        else if (primaryLabelData?.name === 'Orçamento') ThemeIcon = DollarSign;
                        else if (primaryLabelData?.name === 'Social Media') ThemeIcon = Share2;
                        else if (primaryLabelData) ThemeIcon = TagIcon;

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

                            {isCompact ? (
                              /* ── COMPACT CARD ── */
                              <div
                                data-card={task.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, task.id, e.currentTarget as HTMLElement)}
                                onDrag={(e) => { if (e.clientX || e.clientY) moveGhost(e.clientX, e.clientY); }}
                                onDragEnd={handleDragEnd}
                                onClick={() => onSelectTask(task)}
                                className={`group flex items-center gap-2 bg-[#121214] hover:bg-[#161619] border rounded-md px-2.5 py-1.5 transition-all duration-150 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-0' : ''} ${editingMap[task.id] ? 'border-[var(--edit-color)]/40' : 'border-zinc-900/60 hover:border-zinc-800'}`}
                                style={editingMap[task.id] ? { '--edit-color': editingMap[task.id].color } as React.CSSProperties : undefined}
                              >
                                {editingMap[task.id] && (
                                  <span
                                    title={`${editingMap[task.id].name} está editando`}
                                    className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                                    style={{ background: editingMap[task.id].color }}
                                  />
                                )}
                                {ThemeIcon && <div className={`shrink-0 ${themeTextColor}`}><ThemeIcon size={12} /></div>}
                                <span className="flex-1 text-[11px] font-medium text-zinc-200 truncate min-w-0" title={task.title}>
                                  {task.title.length > 35 ? task.title.slice(0, 35) + '…' : task.title}
                                </span>
                                <div className="shrink-0 flex items-center justify-center">
                                  {task.priority === 'urgent' && <ChevronsUp size={14} className="text-red-500" />}
                                  {task.priority === 'high' && <ChevronUp size={14} className="text-orange-400" />}
                                  {task.priority === 'medium' && <Minus size={14} className="text-blue-500" />}
                                  {task.priority === 'low' && <ChevronDown size={14} className="text-emerald-500" />}
                                </div>
                                {task.dueDate && (() => {
                                  const [, m, d] = task.dueDate.split('-');
                                  const isOverdue = task.dueDate < new Date().toISOString().split('T')[0];
                                  const isDone = task.status === 'done';
                                  let textColor = 'text-zinc-300';
                                  if (isDone) {
                                    textColor = 'text-emerald-500';
                                  } else if (isOverdue) {
                                    textColor = 'text-red-400';
                                  }
                                  return <span className={`text-[10px] font-mono shrink-0 ${textColor}`}>{d}/{m}</span>;
                                })()}
                                {task.timeTracking && getElapsedTimeData(task.timeTracking) && (() => {
                                  const data = getElapsedTimeData(task.timeTracking)!;
                                  return (
                                    <div className={`flex items-center gap-1 text-[9px] font-mono font-medium ${data.colorClass}`} title={task.timeTracking.isTimerRunning ? 'Tempo rodando...' : 'Tempo pausado'}>
                                      <Hourglass size={8} className={task.timeTracking.isTimerRunning ? 'animate-pulse' : ''} />
                                      <span>{data.text}</span>
                                    </div>
                                  );
                                })()}
                                <ReminderBell
                                  reminderDate={task.reminderDate}
                                  reminderType={task.reminderType}
                                  size={10}
                                  align="right"
                                  disableAutoScroll
                                  onChange={({ reminderDate, reminderType }) => onUpdateTask({ ...task, reminderDate, reminderType })}
                                />
                              </div>
                            ) : (
                              /* ── NORMAL CARD ── */
                              <div
                                data-card={task.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, task.id, e.currentTarget as HTMLElement)}
                                onDrag={(e) => { if (e.clientX || e.clientY) moveGhost(e.clientX, e.clientY); }}
                                onDragEnd={handleDragEnd}
                                onClick={() => onSelectTask(task)}
                                className={`group relative bg-[#121214] hover:bg-[#161619] border rounded-lg p-2.5 transition-all duration-200 cursor-grab active:cursor-grabbing hover:shadow-xl hover:shadow-black/50 ${isDragging ? 'opacity-0' : ''} ${editingMap[task.id] ? 'border-[var(--edit-color)]/40' : 'border-zinc-900/60 hover:border-zinc-800'}`}
                                style={editingMap[task.id] ? { '--edit-color': editingMap[task.id].color } as React.CSSProperties : undefined}
                              >
                                {/* ID & Assignee */}
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-zinc-500 font-mono font-semibold tracking-tight uppercase flex items-center gap-1.5">
                                    <span>{(task.taskCode || 'NOVO').split('-')[0]}</span>
                                    {project && (
                                      <>
                                        <span className="text-zinc-700 font-sans font-light">|</span>
                                        <span className="truncate max-w-[120px]">{project.name}</span>
                                      </>
                                    )}
                                    {task.parentTaskId && (() => {
                                      const parentTask = tasks.find(t => t.id === task.parentTaskId);
                                      if (!parentTask) return null;
                                      return (
                                        <>
                                          <span className="text-zinc-700 font-sans font-light">|</span>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onSelectTask(parentTask); }}
                                            className="flex items-center gap-1 hover:text-blue-400 transition-colors"
                                            title="Ir para tarefa pai"
                                          >
                                            <ArrowUpRight size={10} className="shrink-0" />
                                            <span className="truncate max-w-[100px] normal-case font-sans font-medium">{parentTask.title}</span>
                                          </button>
                                        </>
                                      );
                                    })()}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {/* Editing indicator badge */}
                                    {editingMap[task.id] && (
                                      <div
                                        title={`${editingMap[task.id].name} está editando`}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                                        style={{ background: `${editingMap[task.id].color}22`, color: editingMap[task.id].color, border: `1px solid ${editingMap[task.id].color}44` }}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: editingMap[task.id].color }} />
                                        {editingMap[task.id].name.split(' ')[0]}
                                      </div>
                                    )}
                                    <AssigneePicker
                                      value={task.assigneeId}
                                      onChange={(val) => onUpdateTask({ ...task, assigneeId: val })}
                                      trigger={
                                        <button type="button" className="w-5 h-5 rounded-full border border-zinc-800 shrink-0 overflow-hidden hover:border-zinc-500 transition-colors bg-zinc-900 flex items-center justify-center"
                                          title={task.assigneeId && USERS.find(u => u.id === task.assigneeId)?.name || 'Sem responsável'}>
                                          {task.assigneeId && USERS.find(u => u.id === task.assigneeId)
                                            ? <img src={USERS.find(u => u.id === task.assigneeId)?.avatarUrl} alt="Avatar" className="w-full h-full object-cover transition-all" />
                                            : <span className="text-[10px] text-zinc-500 font-bold">+</span>}
                                        </button>
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Title */}
                                <div className="mb-1.5 flex items-start gap-1.5">
                                  {ThemeIcon && <div className={`shrink-0 mt-[1px] ${themeTextColor}`}><ThemeIcon size={14} /></div>}
                                  <h4 className="text-xs font-semibold text-zinc-100 group-hover:text-zinc-100 leading-snug tracking-normal break-words w-full">{task.title}</h4>
                                </div>



                                {/* Footer */}
                                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-900/40">
                                  <div className="flex items-center gap-1.5 flex-wrap w-full">
                                    <PriorityPicker
                                      value={task.priority}
                                      onChange={(val) => onUpdateTask({ ...task, priority: val })}
                                      trigger={
                                        <button type="button" className="flex items-center h-[20px] hover:scale-105 transition-transform active:scale-95">
                                          {getPriorityBadge(task.priority)}
                                        </button>
                                      }
                                    />
                                    {task.dueDate && (() => {
                                      const isOverdue = task.dueDate < new Date().toISOString().split('T')[0];
                                      const isDone = task.status === 'done';
                                      let colorClasses = 'text-zinc-300 bg-zinc-800/50 border-zinc-700/50';
                                      if (isDone) {
                                        colorClasses = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
                                      } else if (isOverdue) {
                                        colorClasses = 'text-red-400 bg-red-500/10 border-red-500/20';
                                      }
                                      return (
                                        <div className={`flex items-center justify-center h-[20px] gap-1 text-[10px] font-mono px-1.5 rounded border ${colorClasses}`}>
                                          <Calendar size={9} className="shrink-0" />
                                          <span>{task.dueDate.split('-').reverse().join('/')}</span>
                                        </div>
                                      );
                                    })()}
                                    <div className="ml-auto flex items-center h-[20px] gap-2">
                                      {task.timeTracking && getElapsedTimeData(task.timeTracking) && (() => {
                                        const data = getElapsedTimeData(task.timeTracking)!;
                                        return (
                                          <div className={`flex items-center h-full gap-1.5 text-[11px] font-mono font-medium transition-colors ${data.colorClass}`} title={task.timeTracking.isTimerRunning ? 'Tempo rodando...' : 'Tempo pausado/concluído'}>
                                            <Hourglass size={11} className={task.timeTracking.isTimerRunning ? 'animate-pulse' : ''} />
                                            <span className="pt-[1px]">{data.text}</span>
                                          </div>
                                        );
                                      })()}
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
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Drop line AFTER last card */}
                            {showLineAtEnd && <DropLine visible={true} />}
                          </motion.div>
                        );
                      })}

                      {/* Drop line when column is empty and being dragged over */}
                      {colTasks.length === 0 && isTarget && (
                        <div className="h-16 border border-dashed border-blue-500/30 rounded-xl flex flex-col items-center justify-center text-xs text-blue-400/50 bg-blue-500/5 transition-all duration-150">
                          <span>Soltar aqui</span>
                        </div>
                      )}
                    </AnimatePresence>
                  )}

                  {/* New Task Button */}
                  {!hideNewTaskButton && (
                    <button
                      onClick={() => handleAddNewTaskInColumn(column.id)}
                      className="w-full mt-2 py-2 flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 rounded-lg transition-colors border border-transparent border-dashed hover:border-zinc-700/50"
                    >
                      <Plus size={12} />
                      Nova Tarefa
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
        
        {/* Indicador de rolagem à direita (Fade) */}
        <div className="absolute right-0 top-0 h-full w-32 flex items-center justify-end pr-4 pointer-events-none z-20 bg-gradient-to-l from-[#08080a] via-[#08080a]/80 to-transparent">
          <ChevronRight size={24} className="text-zinc-500 opacity-50 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

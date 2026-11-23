import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, Reorder } from 'framer-motion';
import {
  X, Trash2, Plus, Tag as TagIcon, Clock, AlertTriangle, ChevronDown, ChevronLeft, Maximize2, Minimize2, MoreHorizontal, MessageSquare, Bell, Columns, Search, Lock, Unlock, Repeat, Calendar, ArrowRight, MapPin, RotateCcw as HistoryIcon,
} from 'lucide-react';
import DatePicker from './DatePicker';
import { dataInicio, mudancasDeDatas } from '../lib/dataInicio';
import { antecessorAtrasado, antecessoresPendentes, avancaStatus } from '../lib/antecessores';
import { useAntecessores } from '../hooks/useAntecessores';

import RichTextEditor from './RichTextEditor';
import DesignProperties from './DesignProperties';
import CopyProperties from './CopyProperties';
import BudgetProperties from './BudgetProperties';
import PlanningProperties from './PlanningProperties';
import { pedirJustificativa } from './JustificarDatas';
import Antecessor from './tarefa/Antecessor';
import RoutineProperties from './RoutineProperties';
import SocialMediaApproval from './SocialMediaApproval';
import TaskChat from './TaskChat';
import TaskHistoryPanel from './TaskHistoryPanel';
import { Task, Subtask, TaskStatus, TaskPriority, Label, Project, PendingDeadlineChange } from '../types';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

import { useSyncManager } from '../lib/SyncManager';
import { logTaskFieldHistory } from '../lib/api';
import ProjetoPicker from './marketing/ProjetoPicker';
import Anexos from './tarefa/Anexos';
import ItemChecklist from './tarefa/ItemChecklist';
import ProgressoStatus from './tarefa/ProgressoStatus';
import Responsaveis from './tarefa/Responsaveis';
import { BOTAO_BORDA, BOTAO_GHOST, BOTAO_ICONE, FOCO, ItemMenu, Menu, pilula, Propriedade, TituloSecao } from './tarefa/Propriedade';
import { ICONE_TIPO, ORDEM_PRIORIDADE, PRIORIDADE_INFO, PRIORIDADE_PILULA, StatusChip } from './TarefaBadges';
import { getDueState, estaAtrasada, tooltipPrazo } from '../lib/prazo';
import { somarDias } from '../lib/datas';
import { useMarketingProjetos, formatarData } from '../lib/marketingProjetos';

type EditorPresence = { name: string; avatarUrl?: string; color: string };

interface TaskSheetProps {
  task: Task | null;
  isOpen: boolean;
  /** `false` = a tarefa continuou aberta (faltam campos obrigatórios). */
  onClose: (localTaskState?: any) => void | boolean;
  projects: Project[];
  allLabels: Label[];
  onUpdateTask: (updated: Task) => void;
  onDeleteTask: (taskId: string) => void;
  allTasks?: Task[];
  onAddTask?: (task: Task) => void;
  onSelectTask?: (task: Task) => void;
  /** Tela de onde a tarefa foi aberta (rótulo do botão de voltar). */
  origem?: string;
  onAbrirProjeto?: (projetoId: string) => void;
  isCompareChild?: boolean;
  editingBy?: EditorPresence;
  editingMap?: Record<string, EditorPresence>;
  cooldown?: { name: string, expiresAt: number };
  briefingsLoading?: boolean;
}

const corDoTipo = (label?: Label | null) => label?.color.match(/text-[a-z]+-\d+/)?.[0] ?? 'text-zinc-400';

/** Cor de uma classe da tarefa, pelo nome: cada seção própria usa a da sua classe. */
const corDaClasse = (labels: Label[], nome: string) => corDoTipo(labels.find(l => l.name === nome));

/** Textarea que cresce com o texto. */
const TitleInput = ({ taskId, initialValue, onChange, missingTitle, disabled }: { taskId: string, initialValue: string, onChange: (val: string) => void, missingTitle: boolean, disabled?: boolean }) => {
  const [val, setVal] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (disabled) setVal(initialValue);
  }, [initialValue, disabled]);

  useEffect(() => {
    // Only reset on new task
    setVal(initialValue);
  }, [taskId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    ajustar();
    let largura = el.clientWidth;
    const obs = new ResizeObserver(() => {
      if (el.clientWidth === largura) return;
      largura = el.clientWidth;
      ajustar();
    });
    obs.observe(el);
    // A fonte carregada depois muda a quebra de linha sem mudar a largura.
    let ativo = true;
    document.fonts?.ready.then(() => { if (ativo) ajustar(); });
    return () => { ativo = false; obs.disconnect(); };
  }, [val]);

  return (
    <textarea
      ref={ref}
      value={val}
      disabled={disabled}
      aria-label="Título da tarefa"
      onChange={(e) => {
        if (disabled) return;
        setVal(e.target.value);
        onChange(e.target.value);
      }}
      placeholder="Dê um nome para sua tarefa…"
      rows={1}
      className={`block w-full p-0 bg-transparent border-0 outline-none focus:ring-0 text-title font-semibold resize-none overflow-hidden placeholder-zinc-500 ${missingTitle ? 'text-red-400 placeholder:text-red-400/70' : 'text-zinc-50'} ${disabled ? 'cursor-not-allowed' : ''}`}
    />
  );
};

export default function TaskSheet({
  task,
  isOpen,
  onClose,
  projects,
  allLabels,
  onUpdateTask,
  onDeleteTask,
  allTasks = [],
  onAddTask,
  onSelectTask,
  origem,
  onAbrirProjeto,
  isCompareChild = false,
  editingBy,
  editingMap,
  cooldown,
  briefingsLoading = false
}: TaskSheetProps) {
  const { allUsers: USERS, currentUser } = useAuth();
  const sortedUsers = currentUser
    ? [currentUser, ...USERS.filter(u => u.id !== currentUser.id)]
    : USERS;
  const { addNotification, notifications } = useNotifications();
  const { setDescriptionBase, onDescriptionConflict } = useSyncManager();
  const titleRef = useRef(task?.title || '');
  const descriptionRef = useRef(task?.description || '');
  // Última descrição conhecida como vinda do servidor. Serve para dois fins:
  // detectar se o texto no editor tem edições locais ainda não salvas, e não
  // reprocessar o mesmo valor a cada render.
  const lastServerDescRef = useRef<string | null>(null);
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const descTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Value of description/copyBriefing when this editing session started (task
  // opened). Used to log one history entry per session, on close, instead of
  // one per autosave.
  const descSessionBaselineRef = useRef<string>('');
  const copyBriefingSessionBaselineRef = useRef<string>('{}');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'no_priority');
  const [projectId, setProjectId] = useState(task?.projectId || '');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [taskLabels, setTaskLabels] = useState<Label[]>(task?.labels || []);
  const [dueDate, setDueDate] = useState<string | undefined>(task?.dueDate);
  const [reminderDate, setReminderDate] = useState<string | undefined>(task?.reminderDate);
  const [assigneeId, setAssigneeId] = useState<string | undefined>(task?.assigneeId);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Sem escolha do usuário, o chat abre só quando já tem mensagens.
  const [chatEscolha, setChatEscolha] = useState<boolean | null>(null);
  const isChatOpen = chatEscolha ?? (task?.chatMessages?.length ?? 0) > 0;
  const [descColumns, setDescColumns] = useState(1);
  const [deadlineRequestDraft, setDeadlineRequestDraft] = useState<{ date: string | undefined; reason: string } | null>(null);
  const { mapa: antecessores } = useAntecessores();
  // Hierarquia de datas: prazo da tarefa ≤ entrega do projeto.
  const { limiteDaTarefa } = useMarketingProjetos();
  const limitePrazo = task?.id ? limiteDaTarefa(task.id) : null;
  const [erroPrazo, setErroPrazo] = useState<string | null>(null);
  useEffect(() => { setErroPrazo(null); }, [task?.id]);
  const prazoForaDoLimite = (d?: string | null) => {
    if (!d || !limitePrazo || d.slice(0, 10) <= limitePrazo.data) return false;
    setErroPrazo(`O prazo não pode passar da entrega do projeto "${limitePrazo.projeto}" (${formatarData(limitePrazo.data)}).`);
    return true;
  };

  const plainDesc = (descriptionRef.current || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
  const missingTitle = !(titleRef.current && titleRef.current.trim());
  const missingDesc = !plainDesc;
  const missingLabel = !(taskLabels && taskLabels.length > 0);
  const missingProject = !projectId;
  const missingAssignee = !assigneeId;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isFullscreenDesc, setIsFullscreenDesc] = useState(false);
  const [descEditorKey, setDescEditorKey] = useState(0);
  // Autoriza o editor a substituir seu conteúdo pelo do servidor (ver camada A
  // em RichTextEditor). Só é incrementado quando não há edição local pendente.
  const [descSyncToken, setDescSyncToken] = useState(0);
  
  const [prevTaskId, setPrevTaskId] = useState(task?.id);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    properties: true,
    description: true,
    checklist: true,
    designProps: true,
    copyProps: true,
    planningProps: true,
    budgetProps: true,
    socialMediaProps: true,
    attachments: true
  });

  useEffect(() => {
    const handleOpenSection = (e: any) => {
      const payload = e.detail;
      if (!payload) return;
      
      const section = typeof payload === 'string' ? payload : payload.section;
      const targetId = typeof payload === 'string' ? undefined : payload.targetId;

      if (section && isOpen) {
        setOpenSections(prev => {
          const newSections = { ...prev };
          // Expand the targeted section
          newSections[section] = true;
          return newSections;
        });
        // Chat-mention notifications land on the description section, but the
        // chat side panel has its own isChatOpen toggle that persists across
        // task switches — force it open so the mentioned comment is visible.
        if (targetId && (targetId.startsWith('task-chat-') || targetId.startsWith('sienge-chat-'))) {
          setChatEscolha(true);
        }
        let attempts = 0;
        let scrolledToFallback = false;
        // Deliveries/creatives live in the on-demand briefing columns, which can take
        // several seconds to arrive. 15 tries (1.5s) gave up long before the target
        // element existed, so the user landed on an empty section. Keep polling for
        // the real target for ~8s, while scrolling to the section right away so the
        // wait happens with the loading skeleton in view.
        const MAX_ATTEMPTS = 80;
        const tryScroll = () => {
          let el = null;
          let fallbackEl = document.getElementById(`section-${section}`);

          if (targetId && targetId !== section && targetId !== task?.id) {
            el = document.getElementById(`target-${targetId}`);

            // Try to find by title if targetId is missing but we know it's a subtask (old notifications)
            if (!el && (!targetId || targetId === 'checklist')) {
              // This is handled below or we can't reliably do it here without the notification payload
            }
          }

          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('animate-highlight-glow', 'rounded-md');
            setTimeout(() => {
              el.classList.remove('animate-highlight-glow', 'rounded-md');
            }, 2200);
            return;
          }

          // Target not in the DOM yet: park the viewport on the section so the
          // loading state is visible, then keep waiting for the target itself.
          if (fallbackEl && !scrolledToFallback) {
            scrolledToFallback = true;
            fallbackEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (!targetId) {
              fallbackEl.classList.add('animate-highlight-glow', 'rounded-md');
              setTimeout(() => {
                fallbackEl.classList.remove('animate-highlight-glow', 'rounded-md');
              }, 2200);
            }
          }

          if (attempts < MAX_ATTEMPTS) {
            attempts++;
            setTimeout(tryScroll, 100);
          }
        };
        setTimeout(tryScroll, 100);
      }
    };
    window.addEventListener('openTaskSection', handleOpenSection);
    return () => window.removeEventListener('openTaskSection', handleOpenSection);
  }, [isOpen]);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const [compareTaskId, setCompareTaskId] = useState<string | null>(null);
  const [isCompareSearchOpen, setIsCompareSearchOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [compareSearchQuery, setCompareSearchQuery] = useState('');

  const [effectiveLock, setEffectiveLock] = useState<EditorPresence | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (editingBy) {
      setEffectiveLock(editingBy);
      setIsSyncing(false);
    } else if (cooldown && cooldown.expiresAt > Date.now()) {
      setEffectiveLock({ name: cooldown.name, color: 'blue' });
      setIsSyncing(true);
      const timeLeft = cooldown.expiresAt - Date.now();
      const timer = setTimeout(() => {
        setEffectiveLock(null);
        setIsSyncing(false);
      }, timeLeft);
      return () => clearTimeout(timer);
    } else {
      setEffectiveLock(null);
      setIsSyncing(false);
    }
  }, [editingBy, cooldown]);

  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id);
    let newLock: EditorPresence | null = editingBy || null;
    let newSyncing = false;
    if (!editingBy && cooldown && cooldown.expiresAt > Date.now()) {
      newLock = { name: cooldown.name, color: 'blue' };
      newSyncing = true;
    }
    setEffectiveLock(newLock);
    setIsSyncing(newSyncing);
    titleRef.current = task?.title || '';
    descriptionRef.current = task?.description || '';
    descSessionBaselineRef.current = task?.description || '';
    copyBriefingSessionBaselineRef.current = JSON.stringify(task?.copyBriefing || {});
    // Outra tarefa: zera a referência para o efeito de sync tratar como carga
    // inicial e registrar a base nova (senão compararia com o texto da anterior).
    lastServerDescRef.current = null;
    setStatus(task?.status || 'todo');
    setPriority(task?.priority || 'no_priority');
    setProjectId(task?.projectId || '');
    setTaskLabels(task?.labels || []);
    setDueDate(task?.dueDate || '');
    setReminderDate(task?.reminderDate || '');
    setAssigneeId(task?.assigneeId);
    setSubtasks(task?.subtasks || []);
    setShowDeleteConfirm(false);
    setChatEscolha(null);
  }

  useEffect(() => {
    if (effectiveLock && task) {
      titleRef.current = task.title || '';
      descriptionRef.current = task.description || '';
      setSubtasks(task.subtasks || []);
    }
  }, [task, effectiveLock]);

  // Camada A — adota no editor a descrição que chegou do servidor (Realtime ou
  // refetch). Sem isto o editor congela no texto do momento em que abriu, e o
  // primeiro clique reenvia esse texto obsoleto por cima do de quem editou depois.
  useEffect(() => {
    if (!task) return;
    const server = task.description || '';
    const previousServer = lastServerDescRef.current;
    if (server === previousServer) return;

    // Se o texto no editor já divergia do último valor do servidor, o usuário tem
    // edições locais em aberto: não sobrescreve. O guard da camada C decide quem
    // fica quando esse texto for gravado.
    const hasLocalEdits = previousServer !== null && descriptionRef.current !== previousServer;
    if (hasLocalEdits) return;

    lastServerDescRef.current = server;
    setDescriptionBase(task.id, server);
    if (server === descriptionRef.current) return;
    descriptionRef.current = server;
    setDescSyncToken(t => t + 1);
  }, [task?.id, task?.description]);

  // O write local foi recusado pelo guard (camada C): o texto no editor está
  // baseado numa versão que já não existe. Zerar a referência faz o efeito acima
  // tratar o próximo valor do servidor como carga inicial e adotá-lo, em vez de
  // preservar edições locais que nunca serão aceitas.
  useEffect(() => {
    return onDescriptionConflict((taskId) => {
      if (taskId !== task?.id) return;
      lastServerDescRef.current = null;
    });
  }, [onDescriptionConflict, task?.id]);

  useEffect(() => {
    if (task && task.status && task.status !== status) {
      setStatus(task.status);
    }
  }, [task?.status]);

  useEffect(() => {
    if (task && task.labels) {
      setTaskLabels(task.labels);
    }
  }, [JSON.stringify(task?.labels)]);

  const primaryLabelId = taskLabels.length > 0 ? taskLabels[0]?.id : null;
  const primaryLabelData = primaryLabelId ? allLabels.find(l => l.id === primaryLabelId) : null;
  const themeTextColor = primaryLabelData ? corDoTipo(primaryLabelData) : 'text-blue-400';

  useEffect(() => {
    if (!task) return;
    if (JSON.stringify(subtasks) === JSON.stringify(task.subtasks)) return;
    const timer = setTimeout(() => {
      saveChange({ subtasks });
    }, 500);
    return () => clearTimeout(timer);
  }, [subtasks]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Fecha primeiro o que estiver por cima do painel.
      if (showDeleteConfirm) setShowDeleteConfirm(false);
      else if (deadlineRequestDraft) setDeadlineRequestDraft(null);
      else if (isHistoryOpen) setIsHistoryOpen(false);
      else if (isCompareSearchOpen) setIsCompareSearchOpen(false);
      else if (isFullscreenDesc) { setIsFullscreenDesc(false); setDescEditorKey(k => k + 1); }
      else handleClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, task, projectId, assigneeId, taskLabels, showDeleteConfirm, deadlineRequestDraft, isHistoryOpen, isCompareSearchOpen, isFullscreenDesc]);

  if (!isOpen || !task) return null;

  const saveChange = (updates: Partial<Task>) => {
    if (!task || effectiveLock) return;
    onUpdateTask({ ...updates, id: task.id } as Task);
  };

  const isDeadlineAdmin = Number(currentUser?.permissionLevel) === 1;
  const pendingDeadlineChange = task?.pendingDeadlineChange || null;

  // Antecessores ainda em aberto: a tarefa não segue até eles serem concluídos.
  const esperando = task ? antecessoresPendentes(task.id, antecessores, allTasks || []) : [];
  const bloqueioAntecessor = esperando.length === 0 ? undefined
    : `Esta tarefa só pode seguir depois de concluir ${esperando.map(t => `"${t.title || 'Sem título'}"`).join(' e ')}`;

  const mudarStatus = (novo: TaskStatus) => {
    if (effectiveLock || novo === status) return;
    if (bloqueioAntecessor && avancaStatus(status, novo)) return;
    setStatus(novo);
    saveChange({ status: novo });
  };

  const formatDeadlineForNotif = (d: string | null | undefined) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem prazo';

  const handleDeadlinePicked = async (newDate: string | undefined) => {
    if (!task || effectiveLock) return;
    setErroPrazo(null);
    if (prazoForaDoLimite(newDate)) return;
    // Aprovação só faz sentido quando existe um prazo para ser alterado. Na primeira
    // definição (tarefa ainda sem prazo) qualquer um grava direto.
    const isFirstDeadline = !task.dueDate;
    if (isDeadlineAdmin || isFirstDeadline) {
      const mudancas = mudancasDeDatas(task, { dueDate: newDate || '' });
      const motivo = mudancas.length ? await pedirJustificativa(task.title, mudancas) : undefined;
      if (motivo === null) return;
      let newStatus = status;
      if (status === 'no_forecast' && newDate) newStatus = 'todo';
      else if (status === 'todo' && !newDate) newStatus = 'no_forecast';
      setDueDate(newDate);
      setStatus(newStatus);
      saveChange({ dueDate: newDate, status: newStatus, ...(motivo ? { justificativaData: motivo } : {}) });
      return;
    }
    // Não-admins não alteram o prazo direto: precisam justificar e enviar para aprovação do Cidnei.
    setDeadlineRequestDraft({ date: newDate, reason: '' });
  };

  const submitDeadlineChangeRequest = () => {
    if (!task || !currentUser || !deadlineRequestDraft) return;
    const reason = deadlineRequestDraft.reason.trim();
    if (!reason) return;

    const pending: PendingDeadlineChange = {
      requestedDueDate: deadlineRequestDraft.date || null,
      previousDueDate: task.dueDate || null,
      reason,
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      requestedAt: new Date().toISOString()
    };
    onUpdateTask({ id: task.id, pendingDeadlineChange: pending } as Task);

    const admin = USERS.find(u => Number(u.permissionLevel) === 1);
    if (admin) {
      addNotification({
        userId: admin.id,
        actorId: currentUser.id,
        taskId: task.id,
        type: 'deadline_change_requested',
        message: `${currentUser.name} solicitou alteração de prazo em "${task.title || 'Tarefa'}"`,
        details: `De ${formatDeadlineForNotif(pending.previousDueDate)} para ${formatDeadlineForNotif(pending.requestedDueDate)}. Motivo: ${reason}`,
        targetId: 'deadline'
      });
    }
    setDeadlineRequestDraft(null);
  };

  const approveDeadlineChange = () => {
    if (!task || !currentUser || !pendingDeadlineChange) return;
    const p = pendingDeadlineChange;
    if (prazoForaDoLimite(p.requestedDueDate)) return;
    let newStatus = status;
    if (status === 'no_forecast' && p.requestedDueDate) newStatus = 'todo';
    else if (status === 'todo' && !p.requestedDueDate) newStatus = 'no_forecast';
    setDueDate(p.requestedDueDate || undefined);
    setStatus(newStatus);
    onUpdateTask({ id: task.id, dueDate: p.requestedDueDate || undefined, status: newStatus, pendingDeadlineChange: null, justificativaData: `${p.reason} (pedido de ${p.requestedByName || 'alguém'}, aprovado)` } as Task);
    addNotification({
      userId: p.requestedBy,
      actorId: currentUser.id,
      taskId: task.id,
      type: 'deadline_changed',
      message: `Sua solicitação de alteração de prazo em "${task.title || 'Tarefa'}" foi aprovada`,
      details: `Novo prazo: ${formatDeadlineForNotif(p.requestedDueDate)}`,
      targetId: 'deadline'
    });
  };

  const rejectDeadlineChange = () => {
    if (!task || !currentUser || !pendingDeadlineChange) return;
    const p = pendingDeadlineChange;
    onUpdateTask({ id: task.id, pendingDeadlineChange: null } as Task);
    addNotification({
      userId: p.requestedBy,
      actorId: currentUser.id,
      taskId: task.id,
      type: 'deadline_change_rejected',
      message: `O prazo de "${task.title || 'Tarefa'}" não pode ser alterado`,
      details: `Sua solicitação (motivo: "${p.reason}") foi recusada pelo Cidnei. O prazo permanece ${formatDeadlineForNotif(p.previousDueDate)}.`,
      targetId: 'deadline'
    });
  };

  const stripHtml = (html: string) =>
    (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // Logs one history entry per editing session (called when the task is
  // closed) instead of one per autosave, comparing the value from when the
  // session started against the value when it ended.
  const flushSessionHistory = () => {
    if (!task || !currentUser) return;

    const descBase = stripHtml(descSessionBaselineRef.current);
    const descNow = stripHtml(descriptionRef.current || '');
    if (descNow !== descBase) {
      logTaskFieldHistory(task.id, 'description', descBase, descNow, currentUser.id).catch(console.error);
    }

    const copyBase = copyBriefingSessionBaselineRef.current;
    const copyNow = JSON.stringify(task.copyBriefing || {});
    if (copyNow !== copyBase) {
      logTaskFieldHistory(task.id, 'copy_briefing', null, null, currentUser.id).catch(console.error);
    }
  };

  const toggleSubtask = (subId: string) => {
    setSubtasks(prev => prev.map(s => {
      if (s.id !== subId) return s;
      // Concluído ou cancelado: reabre. Cancelar é ação do menu do item.
      return s.completed || s.canceled
        ? { ...s, completed: false, canceled: false, completedAt: undefined }
        : { ...s, completed: true, canceled: false, completedAt: new Date().toISOString() };
    }));
  };

  const toggleCancelSubtask = (subId: string) => {
    setSubtasks(prev => prev.map(s => {
      if (s.id !== subId) return s;
      return s.canceled
        ? { ...s, canceled: false, completedAt: undefined }
        : { ...s, completed: false, canceled: true, completedAt: new Date().toISOString() };
    }));
  };

  const handleSetSubtaskReminder = (subId: string, update: { reminderDate?: string; reminderType?: '3h' | '1d' | 'custom' | 'seen' }) => {
    setSubtasks(prev => prev.map(s => s.id === subId
      ? { ...s, reminderDate: update.reminderDate, reminderType: update.reminderType }
      : s
    ));
  };

  const handleSetSubtaskAssignee = (subId: string, userId: string) => {
    setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, assigneeId: userId || undefined } : s));
    
    if (userId && task) {
      const sub = subtasks.find(s => s.id === subId);
      addNotification({
        userId: userId,
        actorId: currentUser?.id || 'system',
        taskId: task.id,
        targetId: subId,
        type: 'task_assigned',
        message: 'Responsável por Item',
        details: `Você foi marcado como responsável pelo item "${sub?.title}" na tarefa "${task.title}".`
      });
    }
  };

  const handleEditSubtaskTitle = (subId: string, newTitle: string) => {
    setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, title: newTitle } : s));
  };

  const handleDeleteSubtask = (subId: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== subId));
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, subId: string) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const currentLevel = subtasks[index].level || 0;
      
      if (e.shiftKey) {
        if (currentLevel > 0) {
          setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, level: currentLevel - 1 } : s));
        }
      } else {
        const prevLevel = index > 0 ? (subtasks[index - 1].level || 0) : 0;
        if (currentLevel <= prevLevel) {
          setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, level: currentLevel + 1 } : s));
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const newId = `sub-${Date.now()}`;
      const newSubtask: Subtask = { 
        id: newId, 
        title: '', 
        completed: false,
        level: subtasks[index].level || 0
      };
      
      setSubtasks(prev => {
        const copy = [...prev];
        copy.splice(index + 1, 0, newSubtask);
        return copy;
      });

      setTimeout(() => {
        document.getElementById(`subtask-input-${newId}`)?.focus();
      }, 50);
    } else if (e.key === 'Backspace') {
      const target = e.currentTarget;
      const currentLevel = subtasks[index].level || 0;
      
      if (target.selectionStart === 0 && target.selectionEnd === 0) {
        if (currentLevel > 0) {
          e.preventDefault();
          setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, level: currentLevel - 1 } : s));
        } else if (subtasks[index].title === '') {
          e.preventDefault();
          handleDeleteSubtask(subId);
          if (index > 0) {
            setTimeout(() => {
              const prevInput = document.getElementById(`subtask-input-${subtasks[index - 1].id}`);
              if (prevInput) {
                prevInput.focus();
                (prevInput as HTMLInputElement).setSelectionRange(9999, 9999);
              }
            }, 50);
          }
        }
      }
    }
  };

  const adicionarSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks(prev => [...prev, { id: `sub-${Date.now()}`, title: newSubtaskTitle.trim(), completed: false, level: 0 }]);
    setNewSubtaskTitle('');
  };

  const toggleLabel = (label: Label) => {
    const isCurrentlySelected = taskLabels.some(l => l?.id === label.id);
    if (isCurrentlySelected) return;
    
    if (taskLabels.length >= 1) {
      saveChange({ 
        labels: [label],
        designBriefing: undefined
      });
      setTaskLabels([label]);
      setToastMessage('A classe da tarefa foi substituída. Cada tarefa permite apenas 1 classe simultaneamente.');
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      setTaskLabels([label]);
      saveChange({ labels: [label] });
    }
  };

  const handleCreateTaskClass = () => {
    if (!task) return;
    
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    flushSessionHistory();
    saveChange({ title: titleRef.current, description: descriptionRef.current });

    onClose({
      ...task,
      title: titleRef.current,
      description: descriptionRef.current,
      projectId,
      assigneeId,
      labels: taskLabels
    });
  };

  const handleClose = (e?: any) => {
    if (!task) {
      onClose();
      return;
    }

    // Flush debounced local state immediately
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);

    flushSessionHistory();
    saveChange({
      title: titleRef.current,
      description: descriptionRef.current
    });

    // Pass the full task object to avoid triggering false positive validation errors
    // Since App.tsx's handleCloseTaskSheet uses this strictly for validation (and doesn't save it),
    // it is perfectly safe to pass ...task.
    return onClose({
      ...task,
      title: titleRef.current,
      description: descriptionRef.current,
      projectId,
      assigneeId,
      labels: taskLabels
    });
  };

  const bloqueada = !!effectiveLock;
  const concluida = status === 'done';
  const IconePrio = PRIORIDADE_PILULA[priority].icone;
  const empreendimento = projects.find(p => p.id === projectId);
  const IconeTipo = (primaryLabelData && ICONE_TIPO[primaryLabelData.name]) || TagIcon;

  const infoPrazo = getDueState(dueDate, status);
  // Alertas da tarefa: ficam num lugar só, abaixo do título; as datas não mudam de cor.
  const alertas: { tom: 'erro' | 'aviso'; texto: string }[] = [];
  if (estaAtrasada(infoPrazo.state)) {
    alertas.push({ tom: 'erro', texto: `Tarefa atrasada há ${infoPrazo.daysLate} ${infoPrazo.daysLate === 1 ? 'dia' : 'dias'}` });
  }
  if (erroPrazo) alertas.push({ tom: 'erro', texto: erroPrazo });
  if (!concluida && dueDate && limitePrazo && dueDate.slice(0, 10) > limitePrazo.data) {
    alertas.push({ tom: 'aviso', texto: `O prazo passa da entrega do projeto (${formatarData(limitePrazo.data)})` });
  }
  esperando.forEach(t => alertas.push(antecessorAtrasado(t)
    ? { tom: 'erro', texto: `O antecessor "${t.title || 'Sem título'}" está atrasado (prazo ${formatarData(t.dueDate!)})` }
    : { tom: 'aviso', texto: `Aguardando o antecessor "${t.title || 'Sem título'}"` }));
  if (!concluida && dueDate && task.startDate && task.startDate.slice(0, 10) > dueDate.slice(0, 10)) {
    alertas.push({ tom: 'aviso', texto: 'O início está depois do prazo' });
  }

  const lembreteVisto = task.reminderType === 'seen'
    || notifications.some(n => n.type === 'reminder' && n.taskId === task.id && (!n.targetId || n.targetId === task.id) && n.status !== 'unread');

  const rotuloLembrete = !reminderDate ? 'Adicionar lembrete'
    : `Lembrete: ${formatarData(reminderDate)}${reminderDate.includes('T') ? ` às ${reminderDate.split('T')[1].slice(0, 5)}` : ''}${lembreteVisto ? ' · já visto, clique para remover' : ''}`;

  const itensValidos = subtasks.filter(s => !s.canceled);
  const itensFeitos = itensValidos.filter(s => s.completed).length;
  const totalMensagens = task.chatMessages?.length ?? 0;

  const compareTask = compareTaskId ? allTasks.find(t => t.id === compareTaskId) : undefined;
  const codigo = task.taskCode || 'Nova';
  const fecharTelaCheia = () => { setIsFullscreenDesc(false); setDescEditorKey(k => k + 1); };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-xs flex justify-end animate-fade-in pointer-events-none">
        <div className="flex-1 pointer-events-auto" onMouseDown={handleClose} />
      </div>

      <div className={isCompareChild
        ? "tela-tarefa h-full bg-[#08080a] flex flex-col text-zinc-200 w-full relative z-0 overflow-hidden"
        : `tela-tarefa fixed top-0 right-0 bottom-0 z-50 bg-[#08080a] border-l border-zinc-900 shadow-2xl flex flex-col animate-slide-in text-zinc-200 transition-all duration-300 ${compareTaskId ? 'w-full' : 'w-full md:w-[75vw] nb:w-[85vw] nbs:w-[92vw] max-md:!w-full'}`
      }>

        {/* Cabeçalho: de onde veio · código · criação | ação principal e menu */}
        <header className="h-14 short:h-12 px-3 sm:px-5 border-b border-zinc-900 flex items-center justify-between gap-3 shrink-0 relative z-40">
          <div className="flex items-center gap-1 min-w-0">
            <button type="button" onClick={handleClose} title="Voltar (Esc)" className={`${BOTAO_GHOST} pl-1.5 min-w-0`}>
              <ChevronLeft size={16} className="shrink-0" aria-hidden />
              <span className="truncate">{origem || 'Voltar'}</span>
            </button>
            <span className="text-body text-zinc-600" aria-hidden>/</span>
            <span className="px-1.5 text-body font-medium text-zinc-200 tabular-nums whitespace-nowrap">{codigo}</span>
            {task.createdAt && (
              <span className="hidden md:inline pl-1 text-body text-zinc-500 tabular-nums whitespace-nowrap">Criada em {formatarData(task.createdAt)}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {compareTaskId && (
              <button type="button" onClick={() => { setCompareTaskId(null); setCompareSearchQuery(''); }} className={`${BOTAO_GHOST} mr-1`}>
                <X size={14} aria-hidden /> Encerrar comparação
              </button>
            )}

            <div className="relative">
              <Menu rotulo="Mais ações da tarefa" titulo="Mais ações" classe={BOTAO_ICONE} alinhar="right" largura="w-64" gatilho={<MoreHorizontal size={17} aria-hidden />}>
                {fechar => <>
                  <ItemMenu onClick={() => { fechar(); setIsCompareSearchOpen(true); }}>
                    <Columns size={15} className="text-zinc-400" aria-hidden /> Comparar com outra tarefa
                  </ItemMenu>
                  <ItemMenu onClick={() => { fechar(); setIsHistoryOpen(true); }}>
                    <HistoryIcon size={15} className="text-zinc-400" aria-hidden /> Histórico de alterações
                  </ItemMenu>
                  {/* Tarefa privada — só nível 1 alterna. Quem não é nível 1 nem chega
                      a ver uma tarefa privada (a RLS filtra). */}
                  {Number(currentUser?.permissionLevel) === 1 && <>
                    <ItemMenu disabled={bloqueada} onClick={() => { fechar(); saveChange({ isPrivate: !task.isPrivate }); }}>
                      {task.isPrivate
                        ? <><Unlock size={15} className="text-zinc-400" aria-hidden /> Tornar visível ao time</>
                        : <><Lock size={15} className="text-zinc-400" aria-hidden /> Tornar privada</>}
                    </ItemMenu>
                    <div role="separator" className="my-1 border-t border-zinc-900" />
                    <ItemMenu perigo onClick={() => { fechar(); setShowDeleteConfirm(true); }}>
                      <Trash2 size={15} aria-hidden /> Excluir tarefa
                    </ItemMenu>
                  </>}
                </>}
              </Menu>

              {isCompareSearchOpen && (
                <>
                  <div className="fixed inset-0 z-40" onMouseDown={() => setIsCompareSearchOpen(false)} />
                  <div role="dialog" aria-label="Comparar com outra tarefa" className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-24px)] bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)] p-2 z-50">
                    <div className="relative mb-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
                      <input
                        type="search"
                        autoFocus
                        placeholder="Buscar tarefa…"
                        aria-label="Buscar tarefa"
                        value={compareSearchQuery}
                        onChange={e => setCompareSearchQuery(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0c0c0e] border border-zinc-800 text-body text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/60"
                      />
                    </div>
                    <div className="max-h-72 overflow-y-auto flex flex-col scrollbar-thin">
                      {allTasks
                        .filter(t => t.id !== task.id && (t.title.toLowerCase().includes(compareSearchQuery.toLowerCase()) || t.id.toLowerCase().includes(compareSearchQuery.toLowerCase())))
                        .slice(0, 10)
                        .map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setCompareTaskId(t.id);
                              setIsCompareSearchOpen(false);
                              setCompareSearchQuery('');
                            }}
                            className={`shrink-0 text-left px-2 py-1.5 rounded-lg hover:bg-[#1F1F22] flex flex-col ${FOCO}`}
                          >
                            <span className="text-caption text-zinc-500 tabular-nums">{t.taskCode || t.id}</span>
                            <span className="text-body text-zinc-200 truncate w-full">{t.title}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button type="button" onClick={handleClose} aria-label="Fechar" title="Fechar (Esc)" className={BOTAO_ICONE}>
              <X size={17} aria-hidden />
            </button>
          </div>
        </header>

        {effectiveLock && (
          <div
            className="flex items-center gap-2 px-5 py-2.5 border-b text-body font-medium"
            style={{ background: `${effectiveLock.color}18`, borderColor: `${effectiveLock.color}30`, color: effectiveLock.color }}
          >
            {isSyncing ? <Clock size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
            <span>
              {isSyncing
                ? `${effectiveLock.name} finalizou a edição. Sincronizando os últimos dados...`
                : `${effectiveLock.name} está editando esta tarefa agora — visualização somente leitura`}
            </span>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <div className={`flex-1 min-w-0 overflow-y-auto scrollbar-thin px-5 sm:px-8 pt-6 pb-16 ${compareTask ? 'border-r border-zinc-900' : ''}`}>
            <div className="w-full max-w-[1120px] mx-auto flex flex-col gap-8">

              {/* Título, estado e propriedades */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start gap-3 mb-2">
                  <span
                    aria-hidden
                    className={`size-8 shrink-0 inline-flex items-center justify-center rounded-lg border ${primaryLabelData ? `border-current/15 bg-current/10 ${corDoTipo(primaryLabelData)}` : 'border-dashed border-zinc-700 text-zinc-500'}`}
                  >
                    <IconeTipo size={16} />
                  </span>
                  <div className="flex-1 min-w-0 max-sm:basis-[calc(100%-2.75rem)]">
                    <TitleInput
                      taskId={task.id}
                      initialValue={effectiveLock ? (task.title || '') : titleRef.current}
                      missingTitle={missingTitle}
                      disabled={bloqueada}
                      onChange={(val) => {
                        titleRef.current = val;
                        if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
                        titleTimerRef.current = setTimeout(() => saveChange({ title: val }), 500);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                  <div key={`rotina-${task.id}`} id="section-routine">
                    <RoutineProperties
                      routine={task.routine}
                      disabled={bloqueada}
                      onChange={(update) => {
                        if (update && update.active) {
                          update.originalSnapshot = {
                            title: titleRef.current,
                            description: descriptionRef.current,
                            labels: taskLabels,
                            projectId: projectId,
                            priority: priority
                          };
                        }
                        saveChange({ routine: update });
                      }}
                    />
                  </div>
                  <Menu
                    rotulo={`Classe da tarefa: ${primaryLabelData?.name ?? 'não definida'}`}
                    titulo="Trocar a classe da tarefa"
                    disabled={bloqueada}
                    alinhar="right"
                    classe={`h-8 [@media(pointer:coarse)]:h-10 shrink-0 inline-flex items-center gap-2 pl-3 pr-2 rounded-lg border text-body font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
                      primaryLabelData ? `border-current/20 bg-current/10 hover:bg-current/20 ${corDoTipo(primaryLabelData)}`
                      : missingLabel ? 'border-dashed border-red-500/50 text-red-400 hover:bg-red-500/10'
                      : 'border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-200'
                    } ${FOCO}`}
                    gatilho={<>{primaryLabelData?.name ?? 'Definir classe'} <ChevronDown size={14} className="shrink-0 opacity-70" aria-hidden /></>}
                  >
                    {fechar => allLabels.map(label => {
                      const Icone = ICONE_TIPO[label.name] ?? TagIcon;
                      return (
                        <ItemMenu key={label.id} marcado={primaryLabelId === label.id} onClick={() => { fechar(); toggleLabel(label); }}>
                          <Icone size={15} className={corDoTipo(label)} aria-hidden />
                          <span>{label.name}</span>
                        </ItemMenu>
                      );
                    })}
                  </Menu>
                  </div>
                </div>

                {(alertas.length > 0 || pendingDeadlineChange) && (
                  <div role="status" className="flex flex-wrap items-center gap-2">
                    {alertas.map(a => (
                      <span key={a.texto} className={`inline-flex items-center gap-2 min-h-8 py-1 px-2.5 rounded-lg text-body ${a.tom === 'erro' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        <AlertTriangle size={15} className="shrink-0" aria-hidden />
                        {a.texto}
                      </span>
                    ))}
                  {pendingDeadlineChange && (
                    <div className="w-full max-w-xl flex flex-col gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-body">
                      <p className="font-semibold text-amber-400">
                        {isDeadlineAdmin ? 'Pedido de alteração de prazo' : 'Aguardando aprovação do Cidnei'}
                      </p>
                      <p className="text-zinc-300">
                        {pendingDeadlineChange.requestedByName || 'Alguém'} pediu para mudar de{' '}
                        <b className="text-zinc-100">{formatDeadlineForNotif(pendingDeadlineChange.previousDueDate)}</b> para{' '}
                        <b className="text-zinc-100">{formatDeadlineForNotif(pendingDeadlineChange.requestedDueDate)}</b>.
                      </p>
                      <p className="text-zinc-400">"{pendingDeadlineChange.reason}"</p>
                      {isDeadlineAdmin && (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={approveDeadlineChange} className={`btn-brand h-8 px-3 rounded-lg text-body font-medium ${FOCO}`}>Aprovar</button>
                          <button type="button" onClick={rejectDeadlineChange} className={`${BOTAO_BORDA} !h-8 !text-body`}>Recusar</button>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )}

                {/* Faixa de propriedades: preenchidas com fundo, vazias em cinza */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Propriedade rotulo="Prioridade">
                    <Menu
                      rotulo={`Prioridade: ${PRIORIDADE_INFO[priority].label}`}
                      classe={`${pilula(priority === 'no_priority' ? 'vazia' : 'cheia')} ${PRIORIDADE_PILULA[priority].pilula}`}
                      disabled={bloqueada}
                      gatilho={<>
                        <IconePrio size={15} className="shrink-0" aria-hidden />
                        <span className="truncate">{priority === 'no_priority' ? 'Prioridade' : PRIORIDADE_INFO[priority].label}</span>
                      </>}
                    >
                      {fechar => ORDEM_PRIORIDADE.map(p => {
                        const Icone = PRIORIDADE_PILULA[p].icone;
                        return (
                          <ItemMenu key={p} marcado={p === priority} onClick={() => { fechar(); setPriority(p); saveChange({ priority: p }); }}>
                            <Icone size={15} className={`shrink-0 ${PRIORIDADE_PILULA[p].cor}`} aria-hidden />
                            <span>{PRIORIDADE_INFO[p].label}</span>
                          </ItemMenu>
                        );
                      })}
                    </Menu>
                  </Propriedade>

                  <Responsaveis
                    key={`resp-${task.id}`}
                    taskId={task.id}
                    principalId={assigneeId}
                    obrigatorio={missingAssignee}
                    disabled={bloqueada}
                    onPrincipal={(id) => { setAssigneeId(id); saveChange({ assigneeId: id }); }}
                    onAdicionado={(userId) => {
                      if (userId === currentUser?.id) return;
                      addNotification({
                        userId,
                        actorId: currentUser?.id || 'system',
                        taskId: task.id,
                        type: 'task_assigned',
                        message: 'Tarefa Atribuída',
                        details: `Você foi adicionado como responsável na tarefa "${task.title || 'Tarefa'}".`,
                      });
                    }}
                  />

                  <Propriedade rotulo="Início e prazo">
                    <div className={`${pilula(dueDate || task.startDate ? 'cheia' : 'vazia')} !gap-0 !px-1.5`}>
                      <Calendar size={14} className="shrink-0 ml-1.5 mr-0.5" aria-hidden />
                      {dataInicio.ativa && <>
                        <span id="section-inicio" className="inline-flex">
                          <DatePicker
                            value={task.startDate || ''}
                            disabled={bloqueada}
                            onChange={d => saveChange({ startDate: d || '' })}
                            maxDate={dueDate?.slice(0, 10) || limitePrazo?.data}
                            trigger={
                              <button type="button" disabled={bloqueada} title="Início" className={`h-6 px-1.5 rounded-md tabular-nums enabled:hover:text-zinc-50 enabled:hover:bg-[#27272a] transition-colors ${task.startDate ? '' : 'text-zinc-400'} ${FOCO}`}>
                                {task.startDate ? formatarData(task.startDate) : 'Início'}
                              </button>
                            }
                          />
                        </span>
                        <ArrowRight size={14} className="shrink-0 text-zinc-500" aria-label="até" />
                      </>}
                      <span id="section-deadline" className="inline-flex">
                        <DatePicker
                          value={dueDate || ''}
                          disabled={bloqueada || !!pendingDeadlineChange}
                          onChange={handleDeadlinePicked}
                          maxDate={limitePrazo?.data}
                          trigger={
                            <button
                              type="button"
                              disabled={bloqueada || !!pendingDeadlineChange}
                              title={`${dueDate ? `Prazo · ${tooltipPrazo(dueDate)}` : 'Prazo'}${limitePrazo ? ` · entrega do projeto em ${formatarData(limitePrazo.data)}` : ''}`}
                              className={`h-6 px-1.5 rounded-md tabular-nums enabled:hover:text-zinc-50 enabled:hover:bg-[#27272a] transition-colors ${dueDate ? '' : 'text-zinc-400'} ${FOCO}`}
                            >
                              {dueDate ? formatarData(dueDate) : 'Prazo'}
                            </button>
                          }
                        />
                      </span>
                    </div>
                  </Propriedade>

                  <Propriedade id="section-reminder" rotulo="Lembrete">
                    <DatePicker
                      value={reminderDate || ''}
                      disabled={bloqueada}
                      onChange={(date) => {
                        if (effectiveLock) return;
                        setReminderDate(date || undefined);
                        saveChange({ reminderDate: date || undefined });
                      }}
                      enableTime={true}
                      suggestedDate={somarDias(1)}
                      trigger={
                        <button
                          type="button"
                          disabled={bloqueada}
                          aria-label={rotuloLembrete}
                          title={rotuloLembrete}
                          className={`${pilula()} !px-0 w-8 [@media(pointer:coarse)]:w-10 justify-center ${
                            !reminderDate ? '!text-zinc-400 hover:!text-zinc-200'
                            : lembreteVisto ? '!bg-emerald-500/15 !text-emerald-400 hover:!bg-emerald-500/25'
                            : '!bg-amber-500/15 !text-amber-400 hover:!bg-amber-500/25'
                          }`}
                          onClick={(e) => {
                            if (reminderDate && lembreteVisto) {
                              e.stopPropagation();
                              setReminderDate(undefined);
                              saveChange({ reminderDate: undefined, reminderType: undefined });
                            }
                          }}
                        >
                          <Bell size={14} className={reminderDate ? 'fill-current' : ''} aria-hidden />
                        </button>
                      }
                    />
                  </Propriedade>

                  <Antecessor key={`antecessor-${task.id}`} task={task} tarefas={allTasks || []} disabled={bloqueada} onAbrir={onSelectTask} />

                  <div className="sm:ml-auto min-w-0 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Propriedade rotulo="Empreendimento">
                    <Menu
                      rotulo={`Empreendimento: ${empreendimento?.name ?? 'nenhum'}`}
                      classe={pilula(empreendimento ? 'cheia' : missingProject ? 'erro' : 'vazia')}
                      disabled={bloqueada}
                      largura="w-64"
                      gatilho={<>
                        <MapPin size={14} className={`shrink-0 ${empreendimento ? 'text-zinc-400' : ''}`} aria-hidden />
                        <span className="truncate max-w-[220px]">{empreendimento?.name ?? 'Empreendimento'}</span>
                      </>}
                    >
                      {fechar => projects.map(p => (
                        <ItemMenu key={p.id} marcado={p.id === projectId} onClick={() => { fechar(); setProjectId(p.id); saveChange({ projectId: p.id }); }}>
                          <span className="truncate">{p.name}</span>
                        </ItemMenu>
                      ))}
                    </Menu>
                  </Propriedade>

                  <ProjetoPicker
                    key={`projeto-${task.id}`}
                    taskId={task.id}
                    dueDate={dueDate}
                    disabled={bloqueada}
                    onAbrir={onAbrirProjeto && (id => { if (handleClose() !== false) onAbrirProjeto(id); })}
                  />
                  </div>

                  {task.isPrivate && (
                    <span className="inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-amber-500/10 text-body font-medium text-amber-400" title="Visível somente para administradores">
                      <Lock size={14} aria-hidden /> Privada
                    </span>
                  )}
                  {task.routineOriginId && (
                    <span className="inline-flex items-center gap-2 h-8 px-2 text-body text-zinc-400">
                      <Repeat size={14} aria-hidden /> Gerada por uma rotina
                    </span>
                  )}
                </div>

                <div className="mt-2 @container">
                  <ProgressoStatus status={status} temPrazo={!!dueDate} bloqueio={bloqueioAntecessor} disabled={bloqueada} onMudar={mudarStatus} />
                </div>
              </div>

              {/* Descrição (e chat, quando aberto) */}
              <section id="section-description" className="flex flex-col gap-3 scroll-mt-20">
                <TituloSecao
                  cor={corDoTipo(primaryLabelData)}
                  aberta={openSections.description}
                  onAlternar={() => toggleSection('description')}
                  erro={missingDesc}
                  acoes={openSections.description && <>
                    <button type="button" aria-pressed={isChatOpen} onClick={() => setChatEscolha(!isChatOpen)} className={`${BOTAO_GHOST} ${isChatOpen ? 'bg-[#1f1f23] !text-zinc-100' : ''}`}>
                      <MessageSquare size={15} aria-hidden /> Chat
                      {totalMensagens > 0 && <span className="text-zinc-500 tabular-nums">{totalMensagens}</span>}
                    </button>
                    <button type="button" onClick={() => setIsFullscreenDesc(true)} aria-label="Abrir descrição em tela cheia" title="Tela cheia" className={BOTAO_ICONE}>
                      <Maximize2 size={15} aria-hidden />
                    </button>
                  </>}
                >
                  Descrição
                </TituloSecao>
                {openSections.description && (
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className={`min-w-0 ${isChatOpen ? 'md:flex-[2] h-[320px]' : 'flex-1'}`}>
                      <RichTextEditor
                        key={`desc-${descEditorKey}`}
                        taskId={task.id}
                        content={effectiveLock ? (task.description || '') : descriptionRef.current}
                        wrapperClassName={isChatOpen ? 'h-full' : 'max-h-[460px]'}
                        columns={descColumns as 1|2|3}
                        readOnly={bloqueada}
                        syncToken={descSyncToken}
                        capturarPrints={!compareTaskId && !isCompareChild && !isFullscreenDesc}
                        onColumnsChange={(c) => setDescColumns(c)}
                        onChange={(newContent) => {
                          descriptionRef.current = newContent;
                          saveChange({ description: newContent });
                        }}
                      />
                    </div>
                    {isChatOpen && (
                      <div className="min-w-0 md:flex-1 h-[320px]">
                        <TaskChat
                          task={task}
                          onUpdate={(chatMessages) => !effectiveLock && saveChange({ chatMessages })}
                          readOnly={bloqueada}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Checklist */}
              <section id="section-checklist" className="flex flex-col gap-2 scroll-mt-20">
                <TituloSecao
                  cor={corDoTipo(primaryLabelData)}
                  extra={itensValidos.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-body text-zinc-400 tabular-nums">{itensFeitos} de {itensValidos.length}</span>
                      <span className="w-24 h-1 rounded-full bg-[#30363d]/40 overflow-hidden" aria-hidden>
                        <span className="block h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${(itensFeitos / itensValidos.length) * 100}%` }} />
                      </span>
                    </div>
                  )}
                >
                  Checklist
                </TituloSecao>

                <div>
                  <Reorder.Group
                    as="div"
                    axis="y"
                    values={subtasks.map(s => s.id)}
                    onReorder={(newIds: string[]) => {
                      const newSubtasks = newIds.map(id => subtasks.find(s => s.id === id)!).filter(Boolean);
                      setSubtasks(newSubtasks);
                    }}
                  >
                    <AnimatePresence initial={false}>
                      {subtasks.map((subtask, index) => (
                        <ItemChecklist
                          key={subtask.id}
                          subtask={subtask}
                          index={index}
                          effectiveLock={bloqueada}
                          sortedUsers={sortedUsers}
                          onToggle={toggleSubtask}
                          onToggleCancel={toggleCancelSubtask}
                          onEditTitle={handleEditSubtaskTitle}
                          onKeyDown={handleSubtaskKeyDown}
                          onSetAssignee={handleSetSubtaskAssignee}
                          onSetReminder={handleSetSubtaskReminder}
                          onDelete={handleDeleteSubtask}
                        />
                      ))}
                    </AnimatePresence>
                  </Reorder.Group>

                  {!effectiveLock && (
                    <label className="flex items-start gap-2 min-h-9 py-2 px-2 -mx-2 rounded-lg cursor-text hover:bg-[#161619] focus-within:bg-[#161619] transition-colors">
                      <Plus size={16} className="shrink-0 mt-0.5 mr-1.5 text-zinc-400" aria-hidden />
                      <textarea
                        rows={1}
                        value={newSubtaskTitle}
                        aria-label="Adicionar item à checklist"
                        onChange={(e) => {
                          e.target.style.height = 'auto';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                          setNewSubtaskTitle(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            adicionarSubtask();
                          }
                        }}
                        placeholder="Adicionar item"
                        className="flex-1 min-w-0 block p-0 bg-transparent border-0 outline-none focus:ring-0 text-body text-zinc-200 placeholder-zinc-400 resize-none overflow-hidden"
                      />
                    </label>
                  )}
                </div>
              </section>

              {/* Documentos */}
              <section id="section-attachments" className="flex flex-col gap-3 scroll-mt-20">
                <TituloSecao
                  cor={corDoTipo(primaryLabelData)}
                  aberta={openSections.attachments}
                  onAlternar={() => toggleSection('attachments')}
                  extra={(task.attachments?.length ?? 0) > 0 && <span className="text-body text-zinc-400 tabular-nums">{task.attachments!.length}</span>}
                >
                  Documentos
                </TituloSecao>
                {openSections.attachments && (
                  <Anexos
                    key={`anexos-${task.id}`}
                    attachments={task.attachments}
                    onUpdate={(atts) => saveChange({ attachments: atts })}
                    taskId={task.id}
                    taskTitle={task.title}
                    taskAssigneeId={task.assigneeId}
                    disabled={bloqueada}
                  />
                )}
              </section>

              {/* Dynamic Design Properties */}
              {taskLabels.some(l => l.name === 'Design') && (
                <section id="section-designProps" className="scroll-mt-20">
                  <DesignProperties bloqueio={bloqueioAntecessor} task={task} allTasks={allTasks} saveChange={saveChange} cor={corDaClasse(taskLabels, 'Design')} disabled={bloqueada} carregando={briefingsLoading} />
                </section>
              )}

              {/* Dynamic Copy Properties */}
              {taskLabels.some(l => l.name === 'Copy') && (
                <section id="section-copyProps" className="scroll-mt-20">
                  <CopyProperties bloqueio={bloqueioAntecessor} task={task} cor={corDaClasse(taskLabels, 'Copy')} saveChange={saveChange} disabled={bloqueada} carregando={briefingsLoading} />
                </section>
              )}

              {/* Dynamic Budget Properties (Orçamento) */}
              {taskLabels.some(l => l.name === 'Orçamento') && (
                <section id="section-budgetProps" className="flex flex-col gap-3 scroll-mt-20">
                  <TituloSecao cor={corDaClasse(taskLabels, 'Orçamento')} aberta={openSections.budgetProps} onAlternar={() => toggleSection('budgetProps')}>Orçamento</TituloSecao>
                  <div className={openSections.budgetProps ? 'block' : 'hidden'}>
                    <BudgetProperties task={task} saveChange={saveChange} themeColor={themeTextColor} />
                  </div>
                </section>
              )}

              {/* Dynamic Social Media Approval */}
              {taskLabels.some(l => l.name === 'Social Media') && (
                <section id="section-socialMediaProps" className="flex flex-col gap-3 scroll-mt-20">
                  <TituloSecao cor={corDaClasse(taskLabels, 'Social Media')} aberta={openSections.socialMediaProps} onAlternar={() => toggleSection('socialMediaProps')}>Social media</TituloSecao>
                  <div className={`min-h-[600px] ${openSections.socialMediaProps ? 'block' : 'hidden'}`}>
                    <SocialMediaApproval
                      task={task}
                      allTasks={allTasks || []}
                      saveChange={saveChange}
                      currentUser={currentUser}
                    />
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Compare Task Panel (Read Only) */}
          {compareTask && (
            <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-5 sm:px-8 pt-6 pb-16 animate-slide-in">
              <div className="flex flex-col gap-8">
                <div>
                  <h2 className="text-title font-semibold text-zinc-300">{compareTask.title}</h2>
                  <div className="mt-4"><StatusChip status={compareTask.status} /></div>
                  <dl className="mt-6 flex flex-col gap-1">
                    {([
                      ['Responsável', USERS.find(u => u.id === compareTask.assigneeId)?.name || 'Sem responsável'],
                      ['Prazo', compareTask.dueDate ? formatarData(compareTask.dueDate) : 'Sem prazo'],
                      ['Prioridade', PRIORIDADE_INFO[compareTask.priority]?.label || compareTask.priority],
                      ['Empreendimento', projects.find(p => p.id === compareTask.projectId)?.name || 'Sem empreendimento'],
                    ] as const).map(([rotulo, valor]) => (
                      <div key={rotulo} className="grid grid-cols-[8.75rem_minmax(0,1fr)] items-center gap-x-2 min-h-8">
                        <dt className="text-body font-medium text-zinc-400">{rotulo}</dt>
                        <dd className="px-2 text-body text-zinc-200">{valor}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <section className="flex flex-col gap-3">
                  <TituloSecao cor={corDoTipo(compareTask.labels?.[0])}>Descrição</TituloSecao>
                  <div
                    className="rte-content !p-0"
                    dangerouslySetInnerHTML={{ __html: compareTask.description || '<p>Sem descrição.</p>' }}
                  />
                </section>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="excluir-tarefa-titulo"
            className="bg-[#18181b] border border-white/10 rounded-2xl p-5 flex flex-col gap-2 w-full max-w-[400px] shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="excluir-tarefa-titulo" className="text-heading font-semibold text-zinc-100">Excluir tarefa?</h3>
            <p className="text-body text-zinc-400">
              Esta ação não pode ser desfeita: todo o conteúdo, inclusive briefings e aprovações, será perdido.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" autoFocus onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className={BOTAO_BORDA}>
                Cancelar
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }} className={`btn-danger-soft h-9 px-3 rounded-lg text-body font-medium transition-colors ${FOCO}`}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Justificativa para Solicitação de Alteração de Prazo */}
      {deadlineRequestDraft && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setDeadlineRequestDraft(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedir-prazo-titulo"
            className="bg-[#18181b] border border-white/10 rounded-2xl p-5 flex flex-col gap-2 w-full max-w-[420px] shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pedir-prazo-titulo" className="text-heading font-semibold text-zinc-100">Solicitar alteração de prazo</h3>
            <p className="text-body text-zinc-400">
              Novo prazo: <b className="text-zinc-200">{formatDeadlineForNotif(deadlineRequestDraft.date)}</b>.
              A mudança precisa da aprovação do Cidnei. Explique o motivo antes de enviar.
            </p>
            <textarea
              value={deadlineRequestDraft.reason}
              onChange={(e) => setDeadlineRequestDraft(prev => prev ? { ...prev, reason: e.target.value } : prev)}
              placeholder="Motivo da alteração de prazo…"
              aria-label="Motivo da alteração de prazo"
              autoFocus
              className="mt-2 w-full min-h-[96px] p-3 rounded-lg bg-[#0c0c0e] border border-zinc-800 text-body text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/60 resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={(e) => { e.stopPropagation(); setDeadlineRequestDraft(null); }} className={BOTAO_BORDA}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!deadlineRequestDraft.reason.trim()}
                onClick={(e) => {
                  e.stopPropagation();
                  submitDeadlineChangeRequest();
                }}
                className={`btn-brand h-9 px-3 rounded-lg text-body font-medium disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`}
              >
                Enviar para aprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de Histórico de Alterações */}
      {isHistoryOpen && (
        <TaskHistoryPanel
          taskId={task.id}
          taskCode={task.taskCode}
          projects={projects}
          users={USERS}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {/* Modal de Tela Cheia para a Descrição */}
      {isFullscreenDesc && (
        <div className="tela-tarefa fixed inset-0 z-[150] bg-[#08080a] flex flex-col animate-fade-in">
          <div className="h-14 shrink-0 border-b border-zinc-900 flex items-center justify-between gap-3 px-5">
            <span className="min-w-0 truncate text-body font-semibold text-zinc-100">{titleRef.current || 'Sem título'}</span>
            <button type="button" onClick={fecharTelaCheia} title="Sair da tela cheia (Esc)" className={BOTAO_GHOST}>
              <Minimize2 size={15} aria-hidden /> Sair da tela cheia
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-8 max-w-5xl mx-auto w-full">
            <RichTextEditor
              taskId={task.id}
              content={effectiveLock ? (task.description || '') : descriptionRef.current}
              readOnly={bloqueada}
              syncToken={descSyncToken}
              onChange={(newContent) => {
                descriptionRef.current = newContent;
                if (descTimerRef.current) clearTimeout(descTimerRef.current);
                descTimerRef.current = setTimeout(() => {
                  descTimerRef.current = null;
                  saveChange({ description: newContent });
                }, 800);
              }}
              variant="borderless"
            />
          </div>
        </div>
      )}

      {toastMessage && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 max-w-[calc(100vw-32px)] bg-[#18181b] border border-zinc-700 text-zinc-100 text-body px-4 py-2.5 rounded-xl shadow-2xl">
          <AlertTriangle size={16} className="shrink-0 text-amber-400" aria-hidden />
          {toastMessage}
        </div>
      )}
    </>
  );
}

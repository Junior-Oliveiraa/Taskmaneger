import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Columns3, 
  List, 
  FolderKanban, 
  Calendar,
  Headset,
  Settings as SettingsIcon, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Plus, 
  Command, 
  User,
  Sparkles,
  LogOut,
  Bell,
  Inbox,
  CheckCircle,
  Clock,
  Star,
  Trash2,
  AlertCircle,
  AlertTriangle,
  X,
  Check,
  MessageSquare,
  Search,
  Receipt,
  BarChart2,
  Handshake,
  Home,
  Share2
} from 'lucide-react';
import { ViewType, Project, Task } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePermissoes, MODULOS_COMERCIAL } from '../lib/permissoes';
import { useNotifications } from '../context/NotificationContext';
import { useMediaQuery, SHORT_SCREEN } from '../hooks/useMediaQuery';


interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  activeTaskViewType: 'board' | 'list';
  setActiveTaskViewType: (type: 'board' | 'list') => void;
  projects: Project[];
  tasks: Task[];
  onOpenCommandBar: () => void;
  onNewTask: () => void;
  currentProjectFilter: string | null;
  setCurrentProjectFilter: (projectId: string | null) => void;
  onSelectTask?: (task: Task) => void;
}

export default function Sidebar({
  collapsed,
  setCollapsed,
  activeView,
  setActiveView,
  activeTaskViewType,
  setActiveTaskViewType,
  projects,
  tasks,
  onOpenCommandBar,
  onNewTask,
  currentProjectFilter,
  setCurrentProjectFilter,
  onSelectTask
}: SidebarProps) {
  const { currentUser, logout } = useAuth();
  const { pode, podeAlgum } = usePermissoes();
  const verTarefas = pode('tarefas');
  const { notifications, addNotification, markAsViewed, postpone, markAsImportant } = useNotifications();
  
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [busyNotificationIds, setBusyNotificationIds] = useState<Set<string>>(new Set());

  // Em notebook a prévia cai de 3 para 2 notificações: cada item custa ~40px e
  // a lista de Vistas precisa continuar visível sem rolagem.
  const isShortScreen = useMediaQuery(SHORT_SCREEN);
  const notificationPreviewCount = isShortScreen ? 2 : 3;

  // Guards against double-clicks/misclicks firing the same action twice while the
  // item is still animating out (list reflow made it easy to accidentally hit twice).
  const runNotificationAction = (id: string, action: (id: string) => void) => {
    if (busyNotificationIds.has(id)) return;
    setBusyNotificationIds(prev => new Set(prev).add(id));
    action(id);
    setTimeout(() => {
      setBusyNotificationIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 400);
  };

  // Filter my active notifications
  const myNotifications = notifications.filter(n => {
    if (n.userId !== currentUser?.id) return false;
    if (n.status === 'unread' || n.status === 'important' || n.status === 'read') return true;
    if (n.status === 'postponed' && n.postponedUntil && new Date() >= new Date(n.postponedUntil)) return true;
    return false;
  });

  const getIconForType = (type: string, size = 12) => {
    switch (type) {
      case 'task_assigned': return <CheckCircle size={size} className="text-zinc-400 shrink-0" />;
      case 'task_deleted': return <Trash2 size={size} className="text-zinc-400 shrink-0" />;
      case 'status_changed': return <Bell size={size} className="text-zinc-400 shrink-0" />;
      case 'assignee_replaced': return <AlertCircle size={size} className="text-zinc-400 shrink-0" />;
      case 'properties_changed': return <Bell size={size} className="text-zinc-400 shrink-0" />;
      case 'feedback_received': return <AlertTriangle size={size} className="text-zinc-400 shrink-0" />;
      case 'rejected': return <X size={size} className="text-zinc-400 shrink-0" />;
      case 'review_requested': return <AlertTriangle size={size} className="text-zinc-400 shrink-0" />;
      case 'approval_pending': return <AlertTriangle size={size} className="text-zinc-400 shrink-0" />;
      case 'approved': return <Check size={size} className="text-zinc-400 shrink-0" />;
      case 'reminder': return <Bell size={size} className="text-zinc-400 shrink-0 fill-zinc-400" />;
      case 'deadline': return <Calendar size={size} className="text-zinc-400 shrink-0" />;
      case 'deadline_changed': return <Calendar size={size} className="text-zinc-400 shrink-0" />;
      case 'deadline_change_requested': return <Calendar size={size} className="text-zinc-400 shrink-0" />;
      case 'deadline_change_rejected': return <Calendar size={size} className="text-zinc-400 shrink-0" />;
      case 'chat_mention': return <MessageSquare size={size} className="text-blue-400 shrink-0" />;
      default: return <Bell size={size} className="text-zinc-400 shrink-0" />;
    }
  };

  // Calculate task counts
  const noForecastCount = tasks.filter(t => t.status === 'no_forecast').length;
  const todoCount = tasks.filter(t => t.status === 'todo').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const pausedCount = tasks.filter(t => t.status === 'paused').length;
  const approvalCount = tasks.filter(t => t.status === 'approval').length;
  const reworkCount = tasks.filter(t => t.status === 'rework').length;
  const implementationCount = tasks.filter(t => t.status === 'implementation').length;
  const activeTasksCount = noForecastCount + todoCount + inProgressCount + pausedCount + approvalCount + reworkCount + implementationCount;
  // Posts de rede social ainda não concluídos (aprovado também conta como concluído).
  const openPostsCount = tasks.filter(t =>
    t.labels.some(l => l.name === 'Social Media') && t.status !== 'done' && t.socialMediaApproval?.status !== 'approved'
  ).length;

  const navigateToTasks = (subView: 'board' | 'list') => {
    setActiveView('tasks_board');
    setActiveTaskViewType(subView);
  };

  return (
    // `h-full` e não `h-screen`: o shell do App já reserva as áreas seguras, e
    // 100vh aqui dentro estouraria essa reserva. A largura expandida vem do
    // token `--d-sidebar-w`, que encolhe em notebook (ver index.css).
    <aside
      className={`relative h-full bg-[#08080a] text-zinc-400 border-r border-zinc-900 transition-all duration-300 flex flex-col z-20 shrink-0 ${
        collapsed ? 'w-[60px]' : 'sidebar-w'
      }`}
    >
      {/* Workspace Switcher */}
      <div className="appbar-h flex items-center justify-between px-4 border-b border-zinc-900 shrink-0 bg-[#08080a]">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-zinc-200 text-[10px] font-bold font-sans border border-zinc-700/55">
              O
            </div>
            <span className="font-semibold text-xs text-zinc-200 tracking-tight font-sans">Orbit Workspace</span>
            <span className="text-[9px] bg-zinc-900 text-zinc-500 py-0.2 px-1 rounded font-mono">v1.2</span>
          </div>
        ) : (
          <div className="mx-auto w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-zinc-200 text-[10px] font-bold font-sans border border-zinc-700/55">
            O
          </div>
        )}

        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded text-zinc-650 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors"
          title={collapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Quick Action Trigger Button */}
      <div className="p-3 short:p-2 shrink-0">
        {!collapsed ? (
          <button 
            onClick={onOpenCommandBar}
            className="w-full h-8 flex items-center justify-start px-2.5 bg-zinc-950/80 border border-zinc-900 hover:border-zinc-800 text-xs text-zinc-400 rounded-md transition-all"
          >
            <div className="flex items-center gap-1.5">
              <Search size={11} className="text-zinc-500" />
              <span className="text-[11px]">Buscar...</span>
            </div>
          </button>
        ) : (
          <div className="flex flex-col gap-2 items-center">
            <button 
              onClick={onOpenCommandBar}
              className="w-7 h-7 flex items-center justify-center bg-zinc-950/80 border border-zinc-900 text-zinc-400 rounded-md transition-colors hover:border-zinc-800"
              title="Buscar"
            >
              <Search size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 space-y-5 py-3 short:space-y-3 short:py-1.5 select-none scrollbar-thin">
        {/* Notifications Section */}
        <div className={showAllNotifications ? "flex flex-col flex-1 min-h-0" : ""}>
          {!collapsed && (
            <div 
              className={`text-[10px] font-semibold text-zinc-500 px-3 py-1.5 uppercase tracking-wider font-sans flex items-center justify-between ${myNotifications.length > notificationPreviewCount ? 'cursor-pointer hover:text-zinc-400 transition-colors' : ''}`}
              onClick={() => {
                if (myNotifications.length > notificationPreviewCount) {
                  setShowAllNotifications(!showAllNotifications);
                }
              }}
            >
              <div className="flex items-center gap-1.5">
                <span>Notificações</span>
                {myNotifications.length > 0 && (
                  <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-400/20 shadow-sm leading-none flex items-center justify-center">
                    {myNotifications.length}
                  </span>
                )}
              </div>
              {myNotifications.length > notificationPreviewCount && (
                showAllNotifications ? <ChevronDown size={12} className="text-zinc-600" /> : <ChevronRight size={12} className="text-zinc-600" />
              )}
            </div>
          )}

          <div className={`space-y-1 mt-1.5 ${showAllNotifications ? "flex-1 overflow-y-auto no-scrollbar min-h-0" : ""}`}>
            {!collapsed && myNotifications.length > 0 && (
              <div className="flex flex-col gap-1.5 px-2 mt-2 mb-2">
                <AnimatePresence initial={false} mode="popLayout">
                {(showAllNotifications ? myNotifications : myNotifications.slice(0, notificationPreviewCount)).map(n => {
                  let titlePart = n.message;
                  if (n.message.includes(':')) {
                    const parts = n.message.split(':');
                    titlePart = parts[0].trim();
                  }

                  const task = tasks.find(t => t.id === n.taskId);
                  const isBusy = busyNotificationIds.has(n.id);

                  return (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15, ease: 'easeIn' } }}
                      transition={{ layout: { duration: 0.25, ease: 'easeInOut' }, opacity: { duration: 0.2 }, y: { duration: 0.2 } }}
                      className={`group relative flex flex-col cursor-pointer rounded-lg px-2 py-1.5 hover:bg-zinc-900/60 hover:shadow-md transition-all ${isBusy ? 'pointer-events-none opacity-60' : ''}`}
                      onClick={() => {
                        // Special handling for Sienge Titles
                        if (n.message === 'Lembrete de Título' || n.details?.includes('título')) {
                          setActiveView('sienge');
                          setCurrentProjectFilter(null);
                          setTimeout(() => {
                            const titleEl = document.getElementById(`sienge-title-${n.taskId}`);
                            if (titleEl) {
                              titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              titleEl.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-black');
                              setTimeout(() => titleEl.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-black'), 3000);
                            }
                          }, 300);
                          return;
                        }

                        if (task && onSelectTask) {
                          onSelectTask(task);
                          
                          if (n.type === 'rejected' || n.type === 'review_requested' || n.type === 'approval_pending' || n.type === 'approved') {
                            setTimeout(() => {
                              let sectionName = 'attachments';
                              if (n.targetId?.startsWith('copy-')) sectionName = 'copyProps';
                              else if (n.targetId?.startsWith('proposal-')) sectionName = 'budgetProps';
                              else if (n.targetId?.startsWith('design-')) sectionName = 'designProps';
                              else if (n.targetId === 'socialMediaProps') sectionName = 'socialMediaProps';

                              const event = new CustomEvent('openTaskSection', { detail: { section: sectionName, targetId: n.targetId } });
                              window.dispatchEvent(event);
                            }, 400);
                          } else if (n.type === 'task_assigned') {
                            setTimeout(() => {
                              const event = new CustomEvent('openTaskSection', { detail: { section: 'checklist', targetId: n.targetId } });
                              window.dispatchEvent(event);
                            }, 400);
                          } else if (n.type === 'reminder') {
                            setTimeout(() => {
                              const isSubtaskReminder = (n.targetId && n.targetId !== 'reminder' && n.targetId !== n.taskId) || n.message === 'Lembrete Acionado';
                              const sectionName = isSubtaskReminder ? 'checklist' : 'reminder';
                              const event = new CustomEvent('openTaskSection', { detail: { section: sectionName, targetId: n.targetId } });
                              window.dispatchEvent(event);
                            }, 400);
                          } else if (n.type === 'deadline' || n.type === 'deadline_changed' || n.type === 'deadline_change_requested' || n.type === 'deadline_change_rejected') {
                            setTimeout(() => {
                              const event = new CustomEvent('openTaskSection', { detail: { section: 'deadline', targetId: 'deadline' } });
                              window.dispatchEvent(event);
                            }, 400);
                          } else if (n.type === 'chat_mention') {
                            setTimeout(() => {
                              const event = new CustomEvent('openTaskSection', { detail: { section: 'description', targetId: n.targetId } });
                              window.dispatchEvent(event);
                            }, 400);
                          }
                        } else {
                          setActiveView('inbox');
                          setCurrentProjectFilter(null);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 w-full">
                            {getIconForType(n.type, 12)}
                            <span className="text-[12px] font-medium leading-tight truncate transition-colors text-zinc-500 group-hover:text-zinc-200">
                              {titlePart}
                            </span>
                          </div>
                          {task && (
                            <span className="text-[10px] font-medium text-zinc-600/70 truncate pl-[18px] mt-0.5">
                              {task.title}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center justify-end min-h-[22px] min-w-[35px] mt-[-2px]">
                          <span className="text-[10px] text-zinc-500 font-medium group-hover:hidden transition-opacity">
                            {new Date(n.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                          <div className="hidden group-hover:flex items-center gap-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => runNotificationAction(n.id, markAsViewed)}
                              disabled={isBusy}
                              className="p-1 text-zinc-400 hover:text-emerald-400 rounded hover:bg-zinc-800/80 transition-colors disabled:opacity-50"
                              title="Marcar como Visto"
                            >
                              <CheckCircle size={14} />
                            </button>
                            <button
                              onClick={() => runNotificationAction(n.id, postpone)}
                              disabled={isBusy}
                              className="p-1 text-zinc-400 hover:text-blue-400 rounded hover:bg-zinc-800/80 transition-colors disabled:opacity-50"
                              title="Adiar Notificação"
                            >
                              <Clock size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              </div>
            )}
            
            {!collapsed && myNotifications.length === 0 && (
              <div className="px-3 py-2 text-[10px] text-zinc-500 flex items-center gap-2 mb-2">
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                Nenhuma novidade
              </div>
            )}
          </div>
        </div>

        {/* Workspace views list */}
        <div className={showAllNotifications ? "mt-auto" : ""}>
          {!collapsed && (
            <div 
              className="text-[10px] font-semibold text-zinc-500 px-3 py-1.5 uppercase tracking-wider font-sans mt-2 flex items-center justify-between cursor-pointer"
              onClick={() => setShowAllNotifications(!showAllNotifications)}
            >
              <span>Vistas</span>
              {showAllNotifications ? <ChevronRight size={12} className="text-zinc-600" /> : <ChevronDown size={12} className="text-zinc-600" />}
            </div>
          )}
          {!showAllNotifications && (
            <div className="space-y-0.5 mt-1">
              <button
                onClick={() => {
                  setActiveView('home');
                  setCurrentProjectFilter(null);
                }}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'home'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'home' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Home size={14} className={`relative z-10 ${activeView === 'home' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && <span className="relative z-10">Início</span>}
              </button>

              {verTarefas && (<>
              <button
                onClick={() => navigateToTasks('board')}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'tasks_board' && activeTaskViewType === 'board'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'tasks_board' && activeTaskViewType === 'board' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Columns3 size={14} className={`relative z-10 ${activeView === 'tasks_board' && activeTaskViewType === 'board' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && (
                  <div className="relative z-10 flex-1 flex items-center justify-between">
                    <span>Quadro Kanban</span>
                    <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-700/30">{activeTasksCount}</span>
                  </div>
                )}
              </button>

              <button
                onClick={() => setActiveView('rede_social')}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'rede_social'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'rede_social' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Share2 size={14} className={`relative z-10 ${activeView === 'rede_social' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && (
                  <div className="relative z-10 flex-1 flex items-center justify-between">
                    <span>Rede Social</span>
                    {openPostsCount > 0 && (
                      <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-700/30">{openPostsCount}</span>
                    )}
                  </div>
                )}
              </button>

              <button
                onClick={() => navigateToTasks('list')}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'tasks_board' && activeTaskViewType === 'list'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'tasks_board' && activeTaskViewType === 'list' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <List size={14} className={`relative z-10 ${activeView === 'tasks_board' && activeTaskViewType === 'list' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && (
                  <div className="relative z-10 flex-1 flex items-center justify-between">
                    <span>Lista Compacta</span>
                    <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-700/30">{tasks.length}</span>
                  </div>
                )}
              </button>

              <button
                onClick={() => setActiveView('calendar')}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'calendar'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'calendar' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Calendar size={14} className={`relative z-10 ${activeView === 'calendar' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && <span className="relative z-10">Calendário</span>}
              </button>
              </>)}

              {pode('crm') && (
              <button
                onClick={() => setActiveView('crm')}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'crm'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'crm' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Headset size={14} className={`relative z-10 ${activeView === 'crm' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && <span className="relative z-10">CRM</span>}
              </button>
              )}

              {!collapsed && <div className="border-t border-zinc-900/80 my-1" />}

              {podeAlgum(['financas', 'financas_orcamento']) && (
              <button
                onClick={() => setActiveView('sienge')}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'sienge'
                    ? 'text-blue-300'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'sienge' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-blue-500/10 border border-blue-500/20 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Receipt size={14} className={`relative z-10 ${activeView === 'sienge' ? 'text-blue-400' : 'text-zinc-550'}`} />
                {!collapsed && <span className="relative z-10">Finanças</span>}
              </button>
              )}

              {podeAlgum(MODULOS_COMERCIAL) && (
                <button
                  onClick={() => setActiveView('comercial')}
                  className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeView === 'comercial'
                      ? 'text-blue-300'
                      : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  {activeView === 'comercial' && (
                    <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-blue-500/10 border border-blue-500/20 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                  )}
                  <Handshake size={14} className={`relative z-10 ${activeView === 'comercial' ? 'text-blue-400' : 'text-zinc-550'}`} />
                  {!collapsed && <span className="relative z-10">Comercial</span>}
                </button>
              )}

              {!collapsed && <div className="border-t border-zinc-900/80 my-1" />}

              <button
                onClick={() => {
                  setActiveView('inbox');
                  setCurrentProjectFilter(null);
                }}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'inbox'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'inbox' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <Inbox size={14} className={`relative z-10 ${activeView === 'inbox' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && (
                  <div className="relative z-10 flex-1 flex items-center justify-between">
                    <span>Caixa de Entrada</span>
                    {myNotifications.length > 0 && (
                      <span className="text-[10px] text-zinc-300 font-medium bg-zinc-800/50 px-2 rounded-full border border-zinc-700/50">{myNotifications.length}</span>
                    )}
                  </div>
                )}
              </button>

              {!collapsed && <div className="border-t border-zinc-900/80 my-1" />}

              {pode('empreendimentos') && (
              <button
                onClick={() => {
                  setActiveView('projects');
                  setCurrentProjectFilter(null);
                }}
                className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'projects'
                    ? 'text-zinc-100'
                    : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {activeView === 'projects' && (
                  <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                )}
                <FolderKanban size={14} className={`relative z-10 ${activeView === 'projects' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                {!collapsed && (
                  <div className="relative z-10 flex-1 flex items-center justify-between text-left">
                    <span className="truncate pr-2">Empreendimentos</span>
                    <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-700/30 shrink-0">{projects.length}</span>
                  </div>
                )}
              </button>
              )}

              {pode('analytics') && (
                <button
                  onClick={() => {
                    setActiveView('dashboard');
                    setCurrentProjectFilter(null);
                  }}
                  className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeView === 'dashboard'
                      ? 'text-zinc-100'
                      : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  {activeView === 'dashboard' && (
                    <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
                  )}
                  <BarChart2 size={14} className={`relative z-10 ${activeView === 'dashboard' ? 'text-zinc-200' : 'text-zinc-550'}`} />
                  {!collapsed && <span className="relative z-10">Analytics</span>}
                </button>
              )}

          </div>
          )}
        </div>

        {/* Projects List Filter Box */}
        <div>
          {!collapsed && (
            <div 
              className="text-[10px] font-semibold text-zinc-500 px-3 py-1.5 uppercase tracking-wider font-sans flex items-center justify-between cursor-pointer"
              onClick={() => setShowAllNotifications(!showAllNotifications)}
            >
              <span>Empreendimentos</span>
              <div className="flex items-center gap-2">
                {currentProjectFilter && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setCurrentProjectFilter(null); }}
                    className="text-[9px] hover:text-zinc-250 normal-case font-medium font-sans transition-all"
                  >
                    Limpar
                  </button>
                )}
                {showAllNotifications ? <ChevronRight size={12} className="text-zinc-600" /> : <ChevronDown size={12} className="text-zinc-600" />}
              </div>
            </div>
          )}
          {!showAllNotifications && verTarefas && (
            <div className="grid grid-cols-2 gap-1 mt-1 px-1">
            {projects.map(project => {
              const projectCount = tasks.filter(t => t.projectId === project.id).length;
              const isFiltered = currentProjectFilter === project.id;
              
              return (
                <button
                  key={project.id}
                  onClick={() => {
                    setCurrentProjectFilter(isFiltered ? null : project.id);
                    // Ensure we go to board or list if we toggle project filtering
                    if (activeView !== 'tasks_board' && activeView !== 'projects') {
                      setActiveView('tasks_board');
                    }
                  }}
                  className={`w-full flex items-center px-1.5 py-1 rounded text-[10px] font-medium transition-all ${
                    isFiltered 
                      ? 'bg-zinc-900/80 text-zinc-100 border border-zinc-800/50' 
                      : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent text-zinc-400'
                  }`}
                  title={project.name}
                >
                  {!collapsed && (
                    <div className="flex-1 flex items-center gap-1.5 text-left truncate">
                      <span className="truncate flex-1">
                        {project.name}
                      </span>
                      <span className="text-[9px] text-zinc-500 font-mono bg-zinc-800/40 px-1 py-0.5 rounded border border-zinc-700/30 shrink-0">
                        {projectCount}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Profile Section */}
      {/* O `pb-8` original era folga para a barra de gestos do mobile; em
          notebook são 20px de tela morta logo abaixo do perfil. */}
      <div className="p-3 pb-4 short:p-2 short:pb-2.5 border-t border-zinc-900 bg-black shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-8 h-8 short:w-7 short:h-7 rounded-full object-cover shrink-0 border border-zinc-800 shadow-sm" />
            ) : (
              <div className="w-8 h-8 short:w-7 short:h-7 rounded-full bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center text-white text-[11px] font-bold leading-none select-none shrink-0 border border-zinc-800 shadow-sm">
                {currentUser?.initials || 'US'}
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 text-left flex-1 pl-0.5">
                <div className="text-xs font-semibold text-zinc-200 truncate leading-tight">{currentUser?.name || 'Usuário'}</div>
                <div className="text-[9px] text-zinc-500 truncate font-mono uppercase tracking-wider mt-0.5">{currentUser?.role || 'Membro'}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1 shrink-0">
              {/* Leva às Configurações Gerais — a edição de perfil virou a
                  primeira aba de lá, junto com usuários e integrações. */}
              <button
                onClick={() => setActiveView('settings')}
                className={`p-1.5 rounded-md transition-colors ${
                  activeView === 'settings'
                    ? 'text-zinc-200 bg-zinc-900/80'
                    : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/80'
                }`}
                title="Configurações"
              >
                <SettingsIcon size={14} />
              </button>
              <button 
                onClick={logout}
                className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

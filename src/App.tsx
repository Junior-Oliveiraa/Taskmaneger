import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Columns3, 
  List, 
  FolderKanban, 
  Calendar as CalendarIcon, 
  Settings as SettingsIcon,
  Moon,
  Sun,
  X,
  Sidebar as SidebarTriggerIcon,
  ChevronsRight,
  Filter,
  Sparkles,
  Loader2,
  Layers,
  Eye
} from 'lucide-react';

import { useAuth } from './context/AuthContext';
import { useNotifications } from './context/NotificationContext';
import Login from './components/Login';

import { Task, TaskStatus, Project, Label, ViewType, SiengeTitle, SiengeMensalidade, SiengeLote, SiengeFatura, SiengeCategoriaOrcamento, SiengeProjectTotal, SiengeProjectDisplay, SiengeTabelaVendaUnidade, SiengeTabelaVendaColuna, SiengeCalculoRegra, SiengeValidacao } from './types';
import { fetchTasks, fetchTaskBriefings, fetchProjects, fetchLabels, saveTask, patchTask, deleteTask, saveProject, renameProject, deleteProject, fetchSiengeTitles, saveSiengeTitle, deleteSiengeTitle, fetchSiengeMensalidades, saveSiengeMensalidade, deleteSiengeMensalidade, fetchSiengeLotes, saveSiengeLote, deleteSiengeLote, fetchSiengeFaturas, saveSiengeFatura, deleteSiengeFatura, fetchSiengeAlcadaConfig, saveSiengeAlcadaConfig, SiengeTitleConflictError, fetchSiengeCategoriaOrcamentos, saveSiengeCategoriaOrcamento, deleteSiengeCategoriaOrcamento, fetchSiengeTitleStatusHistory, fetchSiengeProjectTotais, saveSiengeProjectTotal, fetchSiengeProjectDisplays, fetchSiengeTabelaVendas, fetchSiengeTabelaVendaVersoes, saveSiengeTabelaVendaVersao, deleteSiengeTabelaVendaVersao, duplicarSiengeTabelaVendaVersao, definirVersaoPrincipal, fetchSiengeTabelaVendaConfigs, saveSiengeTabelaVendaConfig, saveSiengeTabelaVenda, deleteSiengeTabelaVenda, deleteAllSiengeTabelaVendasByProject, fetchSiengeTabelaVendaColunas, saveSiengeTabelaVendaColuna, deleteSiengeTabelaVendaColuna, fetchSiengeTabelaVendaRevisoes, applySiengeTabelaVendasReajuste, setSiengeTabelaVendasMargem, reverterSiengeTabelaVendasRevisao, alterarSituacaoUnidades, fetchSiengeVendas, fetchSiengeOrcamentoConfig, saveSiengeOrcamentoConfig, fetchSiengeCalculoRegras, saveSiengeCalculoRegra, deleteSiengeCalculoRegra, fetchSiengeValidacoes, saveSiengeValidacao, deleteSiengeValidacao, fetchSiengeCentrosCusto, addSiengeCentroCusto, fetchSiengeCategorias, addSiengeCategoria, renameSiengeCategoria, deleteSiengeCategoria, fetchSiengeSubcategorias, addSiengeSubcategoria, deleteSiengeSubcategoria } from './lib/api';
import { buildSiengeTaxonomy } from './lib/siengeCategorias';
import { supabase } from './lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncManager } from './lib/SyncManager';
import { USERS } from './lib/users';
import { startVersionWatcher } from './lib/versionCheck';
import { usePermissoes, Modulo, MODULOS_COMERCIAL } from './lib/permissoes';

import Sidebar from './components/Sidebar';
import CommandBar from './components/CommandBar';
import TaskSheet from './components/TaskSheet';
import KanbanView from './components/KanbanView';
import ListView from './components/ListView';
import CalendarView from './components/CalendarView';
import InboxView from './components/InboxView';
import ConfirmModal from './components/ConfirmModal';
import { ComercialTabBar, ComercialTab, ComercialDashboardTab, ABAS_COMERCIAL, ABAS_DASHBOARD } from './components/comercial/ComercialTabs';
import HomeView from './components/HomeView';

// Módulos carregados sob demanda: o código de cada área só é baixado quando
// alguém com acesso a abre. A proteção real é o RLS no banco; isto apenas
// evita entregar de graça, a quem não usa a área, o código dela.
const CrmView = lazy(() => import('./components/crm/CrmView'));
const ProjectsView = lazy(() => import('./components/ProjectsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const SiengeView = lazy(() => import('./components/SiengeView'));
const ComercialHistorico = lazy(() => import('./components/comercial/ComercialHistorico'));
const PropostasKanban = lazy(() => import('./components/comercial/PropostasKanban'));
const DashboardView = lazy(() => import('./components/DashboardView'));

/** Módulo(s) que liberam cada tela. Telas fora do mapa são de todos. */
const MODULOS_DA_TELA: Partial<Record<ViewType, Modulo[]>> = {
  tasks_board: ['tarefas'],
  tasks_list: ['tarefas'],
  calendar: ['tarefas'],
  crm: ['crm'],
  projects: ['empreendimentos'],
  sienge: ['financas', 'financas_orcamento'],
  comercial: MODULOS_COMERCIAL,
  dashboard: ['analytics'],
};

// Espelha o breakpoint `nbs` do index.css (largura < 1280px). Manter os dois
// em sincronia: é o limiar em que a sidebar deixa de caber junto do conteúdo.
const NARROW_VIEWPORT_QUERY = '(max-width: 1279.98px)';

// Stable color per user — used for presence avatars / ring
function colorFor(userId: string) {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
  let h = 0;
  for (const c of userId) h = (h << 5) - h + c.charCodeAt(0);
  return COLORS[Math.abs(h) % COLORS.length];
}

export type EditorPresence = { name: string; avatarUrl?: string; color: string };

export default function App() {
  const { currentUser, loading, updateProfile } = useAuth();
  const permissoes = usePermissoes();
  const { addNotification } = useNotifications();
  const previousTasksRef = useRef<Task[]>([]);
  const isFirstRender = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Always-current ref so reminder interval reads latest user without being a dep
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Toast state
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, id: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Forces every open tab to log out and reload once a new deploy lands, so a
  // stale bundle left open across an update can't keep writing against a
  // schema/API it no longer matches.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const stopWatcher = startVersionWatcher(() => {
      showToast('Uma nova versão do sistema está disponível. Atualizando em instantes...');
      setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore — reload proceeds either way.
        }
        window.location.reload();
      }, 4000);
    });
    return stopWatcher;
  }, []);

  // Navigation Routing states
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [activeTaskViewType, setActiveTaskViewType] = useState<'board' | 'list'>('board');
  const [comercialTab, setComercialTab] = useState<ComercialTab>('vendas_dashboard');
  // A sidebar expandida come 280px — 20% de um notebook de 1366px, e é o que
  // sobra de largura para o kanban. Abaixo de 1280px ela nasce recolhida e volta
  // sozinha quando a janela cresce. O listener reage só à TRANSIÇÃO do limiar
  // (não a cada resize), então um toggle manual dentro da mesma faixa nunca é
  // desfeito pelo sistema.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Database core states using React Query
  const queryClient = useQueryClient();
  const syncManager = useSyncManager();
  // Ref so Realtime handler always reads the latest syncManager without re-subscribing
  const syncManagerRef = useRef(syncManager);
  syncManagerRef.current = syncManager;

  // Presence: who is editing which task
  const presenceTrackRef = useRef<((taskId: string | null) => void) | null>(null);
  const presenceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingMap, setEditingMap] = useState<Record<string, EditorPresence>>({});
  const [cooldownMap, setCooldownMap] = useState<Record<string, { name: string, expiresAt: number }>>({});
  const previousPresencesRef = useRef<Record<string, any[]>>({});
  const cooldownTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // In-memory set of already-fired reminder IDs to prevent duplicate notifications
  // across rapid re-renders before updateProfile() persists to Supabase.
  const triggeredRemindersRef = useRef<Set<string>>(new Set());

  // Revalidação ao voltar para a aba: quando ela ficou oculta e há quanto tempo
  // foi a última revalidação (evita refetch a cada troca rápida de janela).
  const hiddenSinceRef = useRef<number | null>(null);
  const lastRevalidateRef = useRef<number>(Date.now());
  const hasBroadcastSubscribedRef = useRef(false);

  // Track recently saved task IDs to suppress self-triggered Realtime events
  const recentlySavedRef = useRef<Map<string, number>>(new Map());
  const markRecentlySaved = (taskId: string) => {
    recentlySavedRef.current.set(taskId, Date.now());
    setTimeout(() => recentlySavedRef.current.delete(taskId), 3000);
  };

  const queryFnTasks = async () => {
    const freshTasks = await fetchTasks();
    const oldTasks = queryClient.getQueryData<Task[]>(['tasks']);
    if (!oldTasks) return freshTasks;

    const merged = freshTasks.map(freshTask => {
      const oldTask = oldTasks.find(t => t.id === freshTask.id);
      if (!oldTask) return freshTask;
      
      const preserved = { ...freshTask };
      (Object.keys(freshTask) as (keyof Task)[]).forEach(key => {
        if (syncManager.isFieldDirty(freshTask.id, key)) {
            // @ts-ignore
            preserved[key] = oldTask[key];
        }
      });
      return preserved;
    });

    // Preserve locally created tasks that haven't appeared in the DB yet
    oldTasks.forEach(oldTask => {
      if ((oldTask as any)._isLocal && !freshTasks.some(ft => ft.id === oldTask.id)) {
        merged.push(oldTask);
      }
    });

    return merged;
  };

  const authReady = !loading && !!currentUser;

  // Rede de segurança contra falhas silenciosas do Realtime (WebSocket bloqueado por
  // proxy/antivírus, queda de conexão, etc.). Com o Broadcast de tasks já cobrindo o
  // caso principal em tempo real (<1s), este polling é apenas um último recurso, então
  // usamos um intervalo folgado (3 min) para minimizar tráfego. Só roda com a aba em
  // primeiro plano (refetchIntervalInBackground é false por padrão no React Query).
  const REALTIME_FALLBACK_POLL_MS = 180_000;

  const { data: tasks = [], isLoading: isTasksLoading } = useQuery({ queryKey: ['tasks'], queryFn: queryFnTasks, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: projects = [], isLoading: isProjectsLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: labels = [], isLoading: isLabelsLoading } = useQuery({ queryKey: ['labels'], queryFn: fetchLabels, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTitles = [], isLoading: isSiengeLoading } = useQuery({ queryKey: ['siengeTitles'], queryFn: fetchSiengeTitles, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeLotes = [], isLoading: isLotesLoading } = useQuery({ queryKey: ['siengeLotes'], queryFn: fetchSiengeLotes, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeFaturas = [], isLoading: isFaturasLoading } = useQuery({ queryKey: ['siengeFaturas'], queryFn: fetchSiengeFaturas, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeMensalidades = [] } = useQuery({ queryKey: ['siengeMensalidades'], queryFn: fetchSiengeMensalidades, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeAlcadaConfig = {} } = useQuery({ queryKey: ['siengeAlcadaConfig'], queryFn: fetchSiengeAlcadaConfig, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeCategoriaOrcamento = [] } = useQuery({ queryKey: ['siengeCategoriaOrcamento'], queryFn: fetchSiengeCategoriaOrcamentos, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeProjectTotais = [] } = useQuery({ queryKey: ['siengeProjectTotais'], queryFn: fetchSiengeProjectTotais, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeProjectDisplays = [] } = useQuery({ queryKey: ['siengeProjectDisplays'], queryFn: fetchSiengeProjectDisplays, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTitleStatusHistory = [] } = useQuery({ queryKey: ['siengeTitleStatusHistory'], queryFn: fetchSiengeTitleStatusHistory, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTabelaVendas = [] } = useQuery({ queryKey: ['siengeTabelaVendas'], queryFn: fetchSiengeTabelaVendas, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTabelaVendaVersoes = [] } = useQuery({ queryKey: ['siengeTabelaVendaVersoes'], queryFn: fetchSiengeTabelaVendaVersoes, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTabelaVendaConfigs = [] } = useQuery({ queryKey: ['siengeTabelaVendaConfigs'], queryFn: fetchSiengeTabelaVendaConfigs, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTabelaVendaRevisoes = [] } = useQuery({ queryKey: ['siengeTabelaVendaRevisoes'], queryFn: fetchSiengeTabelaVendaRevisoes, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeVendas = [] } = useQuery({ queryKey: ['siengeVendas'], queryFn: fetchSiengeVendas, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeOrcamentoConfig } = useQuery({ queryKey: ['siengeOrcamentoConfig'], queryFn: fetchSiengeOrcamentoConfig, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeTabelaVendaColunas = [] } = useQuery({ queryKey: ['siengeTabelaVendaColunas'], queryFn: fetchSiengeTabelaVendaColunas, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeCalculoRegras = [] } = useQuery({ queryKey: ['siengeCalculoRegras'], queryFn: fetchSiengeCalculoRegras, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeValidacoes = [] } = useQuery({ queryKey: ['siengeValidacoes'], queryFn: fetchSiengeValidacoes, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeCentrosCusto = [] } = useQuery({ queryKey: ['siengeCentrosCusto'], queryFn: fetchSiengeCentrosCusto, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeCategorias = [] } = useQuery({ queryKey: ['siengeCategorias'], queryFn: fetchSiengeCategorias, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const { data: siengeSubcategorias = [] } = useQuery({ queryKey: ['siengeSubcategorias'], queryFn: fetchSiengeSubcategorias, enabled: authReady, refetchInterval: REALTIME_FALLBACK_POLL_MS });
  const siengeTaxonomy = useMemo(
    () => buildSiengeTaxonomy(siengeCentrosCusto, siengeCategorias, siengeSubcategorias),
    [siengeCentrosCusto, siengeCategorias, siengeSubcategorias]
  );

  const isDataLoading = isTasksLoading || isProjectsLoading || isLabelsLoading || isSiengeLoading || isLotesLoading || isFaturasLoading || permissoes.carregando;

  // Telas e abas que o perfil pode abrir. Se a tela atual deixou de ser
  // permitida (perfil alterado, atalho, notificação), volta para o Início.
  const podeVerTela = (view: ViewType) => {
    const mods = MODULOS_DA_TELA[view];
    return !mods || permissoes.podeAlgum(mods);
  };
  const abasComercial = ABAS_COMERCIAL
    .filter(a => permissoes.pode(a.modulo) && (!a.apenasMaster || permissoes.isMaster))
    .map(a => a.id);
  useEffect(() => {
    if (permissoes.carregando) return;
    if (!podeVerTela(activeView)) setActiveView('home');
    if (abasComercial.length > 0 && !abasComercial.includes(comercialTab)) setComercialTab(abasComercial[0]);
  });
  // Módulo da tela aberta, para o aviso de somente leitura.
  const moduloAtual: Modulo | null =
    activeView === 'comercial' ? (ABAS_COMERCIAL.find(a => a.id === comercialTab)?.modulo ?? null)
    : activeView === 'sienge' ? (permissoes.pode('financas') ? 'financas' : 'financas_orcamento')
    : MODULOS_DA_TELA[activeView]?.[0] ?? null;
  const somenteLeitura = !!moduloAtual && permissoes.nivel(moduloAtual) === 'ver';
  
  // Custom Confirm Modal state for task sheet closure
  const [confirmModalData, setConfirmModalData] = useState<{
    isOpen: boolean; 
    taskId: string | null;
    message?: string;
    missingFields?: string[];
  }>({isOpen: false, taskId: null});
  
  // Selecting & filtering active scopes
  const [currentProjectFilter, setCurrentProjectFilter] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  // Ref para o handler de Broadcast sempre ler a task aberta atual (sem closure velha),
  // e assim atualizar os painéis de design/copy/documentos ao vivo enquanto ela está aberta.
  const selectedTaskRef = useRef<Task | null>(null);
  selectedTaskRef.current = selectedTask;
  // True while the on-demand briefing columns (design/copy/planning) are still
  // in flight for the open task. The creative approval UI reads this to show a
  // skeleton instead of an empty state, which otherwise looks like "nothing to approve".
  const [areBriefingsLoading, setAreBriefingsLoading] = useState(false);

  // Modal togglers
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  // Theme preference survives reloads; falls back to the OS setting on a first
  // visit so the app doesn't flash the wrong theme at people who run light.
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem('orbit:theme');
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
    return !window.matchMedia?.('(prefers-color-scheme: light)').matches;
  });
  const [socialMediaFilter, setSocialMediaFilter] = useState(false);

  // Presence + Broadcast channel: tracks who has which task open.
  // "First come, first served" — the user with the earliest joinedAt for a task is the owner.
  // Newcomers receive a re-announcement from the owner and get blocked.
  useEffect(() => {
    if (!currentUser) return;

    const ch = supabase.channel('task-presence', {
      config: {
        presence: { key: currentUser.id },
        broadcast: { self: false },
      },
    });

    // viewerMap: taskId → array of viewers (multiple users can be on same task)
    type Viewer = { userId: string; name: string; avatarUrl?: string; color: string; joinedAt: number };
    const viewerMapRef = { current: {} as Record<string, Viewer[]> };
    // myOpenedTasks: taskId → timestamp when current user opened it
    const myOpenedTasksRef = { current: {} as Record<string, number> };
    // currently open task for re-announcement
    const currentlyOpenRef = { current: null as string | null };

    const rebuildEditingMap = () => {
      const map: Record<string, EditorPresence> = {};
      for (const [taskId, viewers] of Object.entries(viewerMapRef.current)) {
        if (!viewers.length) continue;
        // Sort by joinedAt → earliest is the "owner"
        const sorted = [...viewers].sort((a, b) => a.joinedAt - b.joinedAt);
        const owner = sorted[0];
        const myJoinedAt = myOpenedTasksRef.current[taskId];

        // Block current user only if the owner arrived BEFORE them
        if (!myJoinedAt || owner.joinedAt < myJoinedAt) {
          map[taskId] = { name: owner.name, avatarUrl: owner.avatarUrl, color: owner.color };
        }
      }
      setEditingMap(map);
    };

    const sendBroadcast = async (event: 'task_open' | 'task_close', taskId: string, joinedAt: number) => {
      try {
        await ch.send({
          type: 'broadcast',
          event,
          payload: { userId: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl, color: colorFor(currentUser.id), taskId, joinedAt },
        });
      } catch (err) { console.error('Broadcast error:', err); }
    };

    // task_open: another user opened a task
    ch.on('broadcast', { event: 'task_open' }, ({ payload }: any) => {
      if (!payload || payload.userId === currentUser.id) return;
      const { userId, taskId, joinedAt, name, avatarUrl, color } = payload;

      // Remove this user from any previous task
      for (const [tid, viewers] of Object.entries(viewerMapRef.current)) {
        viewerMapRef.current[tid] = viewers.filter(v => v.userId !== userId);
        if (viewerMapRef.current[tid].length === 0) delete viewerMapRef.current[tid];
      }

      // Add to new task
      if (!viewerMapRef.current[taskId]) viewerMapRef.current[taskId] = [];
      viewerMapRef.current[taskId].push({ userId, name, avatarUrl, color, joinedAt });

      // Re-announce if current user has this task open (so newcomer knows we're here first)
      const myJoinedAt = myOpenedTasksRef.current[taskId];
      if (myJoinedAt && currentlyOpenRef.current === taskId) {
        sendBroadcast('task_open', taskId, myJoinedAt);
      }

      rebuildEditingMap();
    });

    // task_close: another user left a task
    ch.on('broadcast', { event: 'task_close' }, ({ payload }: any) => {
      if (!payload || payload.userId === currentUser.id) return;
      const { userId } = payload;

      for (const [tid, viewers] of Object.entries(viewerMapRef.current)) {
        const idx = viewers.findIndex(v => v.userId === userId);
        if (idx !== -1) {
          const lastUser = viewers[idx];
          viewerMapRef.current[tid] = viewers.filter(v => v.userId !== userId);
          if (viewerMapRef.current[tid].length === 0) delete viewerMapRef.current[tid];
          // Start cooldown only if this user was the owner (earliest joinedAt)
          const remaining = viewerMapRef.current[tid] || [];
          const myJoinedAt = myOpenedTasksRef.current[tid];
          const wasOwner = !remaining.length || lastUser.joinedAt <= remaining[0].joinedAt;
          if (wasOwner && (!myJoinedAt || lastUser.joinedAt < myJoinedAt)) {
            if (cooldownTimersRef.current[tid]) clearTimeout(cooldownTimersRef.current[tid]);
            setCooldownMap(m => ({ ...m, [tid]: { name: lastUser.name, expiresAt: Date.now() + 2000 } }));
            cooldownTimersRef.current[tid] = setTimeout(() => {
              setCooldownMap(m => { const n = { ...m }; delete n[tid]; return n; });
            }, 2000);
          }
          break;
        }
      }
      rebuildEditingMap();
    });

    // When a user closes the browser (tab closed) — clean up via presence leave
    ch.on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
      for (const p of (leftPresences || []) as any[]) {
        const userId = p.userId || p.key;
        for (const [tid, viewers] of Object.entries(viewerMapRef.current)) {
          const v = viewers.find(x => x.userId === userId);
          if (v) {
            viewerMapRef.current[tid] = viewers.filter(x => x.userId !== userId);
            if (viewerMapRef.current[tid].length === 0) delete viewerMapRef.current[tid];
            if (cooldownTimersRef.current[tid]) clearTimeout(cooldownTimersRef.current[tid]);
            setCooldownMap(m => ({ ...m, [tid]: { name: v.name, expiresAt: Date.now() + 2000 } }));
            cooldownTimersRef.current[tid] = setTimeout(() => {
              setCooldownMap(m => { const n = { ...m }; delete n[tid]; return n; });
            }, 2000);
          }
        }
      }
      rebuildEditingMap();
    });

    // presence sync: reconcilia o viewerMap contra a lista real de conectados.
    // Sem isso, um `leave`/`task_close` perdido (ex.: a máquina do outro usuário
    // foi desligada enquanto esta aba estava desconectada/dormindo) deixava o selo
    // "fulano está editando" grudado indefinidamente, até dar F5. O `leave` só é
    // entregue ao vivo; o `sync` chega em toda (re)conexão e é a única fonte
    // confiável de quem está realmente presente agora.
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, any[]>;
      const connectedIds = new Set<string>();
      for (const presences of Object.values(state)) {
        for (const p of (presences || []) as any[]) {
          const uid = p.userId || p.key;
          if (uid) connectedIds.add(uid);
        }
      }
      let changed = false;
      for (const [tid, viewers] of Object.entries(viewerMapRef.current)) {
        const kept = viewers.filter(v => connectedIds.has(v.userId));
        if (kept.length !== viewers.length) {
          changed = true;
          if (kept.length === 0) delete viewerMapRef.current[tid];
          else viewerMapRef.current[tid] = kept;
        }
      }
      if (changed) rebuildEditingMap();
    });

    ch.subscribe(async (status, err) => {
      if (status !== 'SUBSCRIBED') {
        // Sem log aqui, uma falha nesse canal se manifestava como "o indicador de
        // 'fulano está editando' simplesmente não aparece", sem nenhuma pista da causa.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[Realtime] task-presence: ${status}`, err ?? '');
        }
        return;
      }
      await ch.track({ userId: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl, color: colorFor(currentUser.id) });

      presenceTrackRef.current = (taskId: string | null) => {
          if (taskId) {
            const ts = myOpenedTasksRef.current[taskId] || Date.now();
            myOpenedTasksRef.current[taskId] = ts;
            currentlyOpenRef.current = taskId;
            sendBroadcast('task_open', taskId, ts);
          } else {
            const prev = currentlyOpenRef.current;
            currentlyOpenRef.current = null;
            if (prev) {
              delete myOpenedTasksRef.current[prev];
              sendBroadcast('task_close', prev, 0);
            }
          }
        };
    });

    return () => {
      presenceTrackRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [currentUser?.id]);

  // Tell broadcast channel when this user opens/closes a task.
  // Debounced to avoid rate-limit on rapid task switching.
  useEffect(() => {
    const taskId = isTaskSheetOpen && selectedTask ? selectedTask.id : null;
    if (presenceDebounceRef.current) clearTimeout(presenceDebounceRef.current);
    presenceDebounceRef.current = setTimeout(() => {
      presenceTrackRef.current?.(taskId);
    }, 300);
    return () => {
      if (presenceDebounceRef.current) clearTimeout(presenceDebounceRef.current);
    };
  }, [isTaskSheetOpen, selectedTask?.id]);

  // Conflito de descrição: o compare-and-swap no banco rejeitou a gravação porque
  // outra pessoa salvou primeiro. O texto local é descartado (nunca sobrescreve) e
  // recarregamos do servidor para o editor adotar a versão vigente.
  useEffect(() => {
    return syncManager.onDescriptionConflict((taskId) => {
      const author = tasks.find(t => t.id === taskId)?.updatedBy;
      const name = author ? USERS.find(u => u.id === author)?.name : null;
      showToast(name
        ? `${name} alterou esta descrição enquanto você editava. Sua tela foi atualizada com a versão mais recente.`
        : 'Esta descrição foi alterada por outra pessoa. Sua tela foi atualizada com a versão mais recente.');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
  }, [syncManager, queryClient, tasks]);

  // Realtime cai em silêncio quando a aba dorme (notebook fechado, aba em segundo
  // plano) e refetchOnWindowFocus está desligado — sem isso a tela pode ficar horas
  // exibindo dados velhos. As duas guardas evitam refetch a cada Alt+Tab.
  //
  // Revalida TUDO (não só ['tasks']): com a aba escondida o refetchInterval de 3 min
  // fica pausado pelo React Query, então os Broadcasts perdidos no período — inclusive
  // títulos que entraram na alçada do usuário — só apareciam com F5. E o WebSocket
  // frequentemente morre junto com a aba, então os canais que não voltaram sozinhos
  // ao estado 'joined' são reinscritos aqui.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
      hiddenSinceRef.current = null;
      if (hiddenFor < 30_000) return;
      if (Date.now() - lastRevalidateRef.current < 60_000) return;
      lastRevalidateRef.current = Date.now();

      // Só as queries montadas são refeitas — as demais ficam apenas marcadas como stale.
      queryClient.invalidateQueries();

      // Reconecta o Realtime: sem isso, um socket que morreu enquanto a aba dormia
      // deixa o app sem Broadcast até o próximo reload.
      if (!supabase.realtime.isConnected()) supabase.realtime.connect();
      supabase.getChannels().forEach(ch => {
        if (ch.state !== 'joined' && ch.state !== 'joining') {
          try { ch.subscribe(); } catch { /* rejoin é best-effort */ }
        }
      });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [queryClient]);

  // Realtime via BROADCAST para projects/labels/sienge.
  // Antes dependiam do canal postgres_changes lotado (que estava mudo); agora cada
  // domínio tem seu tópico próprio (triggers no banco publicam via realtime.send).
  // Mesma segurança das tasks: canal privado (só autenticado recebe).
  useEffect(() => {
    if (!currentUser) return;
    let channels: ReturnType<typeof supabase.channel>[] = [];
    let cancelled = false;

    const payloadOf = (msg: any) =>
      (msg?.payload?.table !== undefined || msg?.payload?.operation !== undefined)
        ? msg.payload
        : (msg?.payload?.payload ?? msg?.payload ?? {});

    // Coalescência: uma importação de tabela de vendas publica mais de mil eventos no
    // tópico 'sienge-changes' em menos de um segundo. Invalidar query a query nesse
    // volume trava a aba e ainda expõe o canal ao rate limit do Realtime — que, ao
    // derrubar o canal, levaria junto os títulos da alçada. Aqui juntamos a rajada
    // numa única rodada de invalidação por frame de 250 ms.
    const pendingKeys = new Set<string>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = (key: string) => {
      pendingKeys.add(key);
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const keys = [...pendingKeys];
        pendingKeys.clear();
        keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      }, 250);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
      if (cancelled) return;

      const onErr = (name: string) => (status: string, err?: any) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[Realtime] ${name} (broadcast): ${status}`, err ?? '');
        }
      };

      const projectsCh = supabase
        .channel('projects-changes', { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, () => invalidate('projects'))
        .on('broadcast', { event: 'UPDATE' }, () => invalidate('projects'))
        .on('broadcast', { event: 'DELETE' }, () => invalidate('projects'))
        .subscribe(onErr('projects-changes'));

      const labelsCh = supabase
        .channel('labels-changes', { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, () => invalidate('labels'))
        .on('broadcast', { event: 'UPDATE' }, () => invalidate('labels'))
        .on('broadcast', { event: 'DELETE' }, () => invalidate('labels'))
        .subscribe(onErr('labels-changes'));

      const siengeHandler = (msg: any) => {
        const table = payloadOf(msg).table;
        if (table === 'sienge_titles') invalidate('siengeTitles');
        else if (table === 'sienge_lotes') invalidate('siengeLotes');
        else if (table === 'sienge_faturas') invalidate('siengeFaturas');
        else if (table === 'sienge_categoria_orcamento') invalidate('siengeCategoriaOrcamento');
        else if (table === 'sienge_project_totais') invalidate('siengeProjectTotais');
        else if (table === 'sienge_project_display') invalidate('siengeProjectDisplays');
        else if (table === 'sienge_title_status_history') invalidate('siengeTitleStatusHistory');
        else if (table === 'sienge_tabela_vendas') invalidate('siengeTabelaVendas');
        else if (table === 'sienge_tabela_vendas_versoes') invalidate('siengeTabelaVendaVersoes');
        else if (table === 'sienge_tabela_vendas_config') invalidate('siengeTabelaVendaConfigs');
        else if (table === 'sienge_tabela_vendas_colunas') invalidate('siengeTabelaVendaColunas');
        else if (table === 'sienge_tabela_vendas_revisoes') invalidate('siengeTabelaVendaRevisoes');
        else if (table === 'sienge_vendas') invalidate('siengeVendas');
        else if (table === 'comercial_movimentos') invalidate('comercialMovimentos');
        else if (table === 'comercial_propostas') invalidate('comercialPropostas');
        else if (table === 'comercial_metas' || table === 'comercial_metas_empreendimentos') invalidate('comercialMetas');
        // O config guarda também o limite padrão de desconto das propostas.
        else if (table === 'comercial_metas_config') { invalidate('comercialMetas'); invalidate('comercialDescontos'); }
        else if (table === 'comercial_descontos_limite') invalidate('comercialDescontos');
        else if (table === 'sienge_unidade_historico') invalidate('siengeUnidadeHistorico');
        else if (table === 'sienge_orcamento_config') invalidate('siengeOrcamentoConfig');
        else if (table === 'sienge_calculo_regras') invalidate('siengeCalculoRegras');
        else if (table === 'sienge_validacoes') invalidate('siengeValidacoes');
        else if (table === 'sienge_centros_custo') invalidate('siengeCentrosCusto');
        else if (table === 'sienge_categorias') invalidate('siengeCategorias');
        else if (table === 'sienge_subcategorias') invalidate('siengeSubcategorias');
        else if (table === 'relatorio_vendas_config') invalidate('relatorioVendasConfig');
      };
      const siengeCh = supabase
        .channel('sienge-changes', { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, siengeHandler)
        .on('broadcast', { event: 'UPDATE' }, siengeHandler)
        .on('broadcast', { event: 'DELETE' }, siengeHandler)
        .subscribe(onErr('sienge-changes'));

      channels = [projectsCh, labelsCh, siengeCh];
    })();

    return () => {
      cancelled = true;
      if (flushTimer) clearTimeout(flushTimer);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [queryClient, currentUser?.id]);

  // Realtime via BROADCAST (tasks/subtasks/task_labels).
  // O postgres_changes acima ficava mudo com o canal lotado (9 inscrições), então
  // a sincronização entre usuários só chegava por F5/polling. Broadcast é o caminho
  // recomendado pela Supabase (baixa latência) — os triggers no banco publicam no
  // tópico 'tasks-changes' a cada INSERT/UPDATE/DELETE. O postgres_changes + polling
  // seguem ativos como fallback; podem ser removidos quando este caminho for validado.
  useEffect(() => {
    if (!currentUser) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let adminChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const invalidateTasksDebounced = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }, 400);
    };

    const applyBroadcast = (msg: any) => {
      // realtime.send entrega o objeto que montamos no trigger em msg.payload.
      // Guarda contra dupla-aninhamento dependendo da versão do realtime.
      const p = msg?.payload?.record !== undefined || msg?.payload?.operation !== undefined
        ? msg.payload
        : (msg?.payload?.payload ?? msg?.payload ?? {});
      const table = p.table;
      const op = p.operation;
      const record = p.record;
      const oldRecord = p.old_record;
      const sm = syncManagerRef.current;

      if (table === 'tasks') {
        if (op === 'INSERT') {
          // Precisa de refetch para trazer os joins (labels/subtasks).
          invalidateTasksDebounced();
        } else if (op === 'DELETE') {
          const delId = oldRecord?.id;
          if (delId) queryClient.setQueryData<Task[]>(['tasks'], (old) => old?.filter(t => t.id !== delId) ?? []);
        } else if (op === 'UPDATE') {
          const raw = record;
          // Tarefa virou privada: o trigger manda o evento sem conteúdo, só com o id,
          // para quem perdeu acesso descartá-la na hora em vez de deixá-la fantasma
          // na tela até o próximo refetch.
          if (!raw) {
            const goneId = oldRecord?.id;
            if (goneId) {
              queryClient.setQueryData<Task[]>(['tasks'], (old) => old?.filter(t => t.id !== goneId) ?? []);
              if (selectedTaskRef.current?.id === goneId) {
                setSelectedTask(null);
                setIsTaskSheetOpen(false);
              }
            }
            return;
          }

          // Patch dos campos presentes no cache da lista. Inclui attachments/proposals/
          // socialMediaApproval/chatMessages/timeTracking — antes ficavam de fora, então
          // ex.: um documento anexado só aparecia no outro PC via polling (o "delay").
          // Cada campo respeita isFieldDirty para não sobrescrever edição local em curso.
          const listPatch = (id: string): Partial<Task> => ({
            ...(sm.isFieldDirty(id, 'status')              ? {} : { status:              raw.status }),
            ...(sm.isFieldDirty(id, 'priority')            ? {} : { priority:            raw.priority }),
            ...(sm.isFieldDirty(id, 'title')               ? {} : { title:               raw.title }),
            ...(sm.isFieldDirty(id, 'assigneeId')          ? {} : { assigneeId:          raw.assignee_id }),
            ...(sm.isFieldDirty(id, 'dueDate')             ? {} : { dueDate:             raw.due_date }),
            ...(sm.isFieldDirty(id, 'reminderDate')        ? {} : { reminderDate:        raw.reminder_date }),
            ...(sm.isFieldDirty(id, 'reminderType')        ? {} : { reminderType:        raw.reminder_type }),
            ...(sm.isFieldDirty(id, 'projectId')           ? {} : { projectId:           raw.project_id }),
            ...(sm.isFieldDirty(id, 'description')         ? {} : { description:         raw.description }),
            ...(sm.isFieldDirty(id, 'attachments')         ? {} : { attachments:         raw.attachments || [] }),
            ...(sm.isFieldDirty(id, 'chatMessages')        ? {} : { chatMessages:        raw.chat_messages || [] }),
            ...(sm.isFieldDirty(id, 'proposals')           ? {} : { proposals:           raw.proposals || [] }),
            ...(sm.isFieldDirty(id, 'budgetApprovals')     ? {} : { budgetApprovals:     raw.budget_approvals || [] }),
            ...(sm.isFieldDirty(id, 'socialMediaApproval') ? {} : { socialMediaApproval: raw.social_media_approval }),
            ...(sm.isFieldDirty(id, 'timeTracking')        ? {} : { timeTracking:        raw.time_tracking }),
            ...(sm.isFieldDirty(id, 'isPrivate')           ? {} : { isPrivate:           raw.is_private ?? false }),
            updatedBy: raw.updated_by,
          });

          queryClient.setQueryData<Task[]>(['tasks'], (old) => {
            if (!old) return old;
            return old.map(t => t.id === raw.id ? { ...t, ...listPatch(t.id) } : t);
          });

          // Se a task alterada é a que está ABERTA neste cliente, atualiza também o
          // selectedTask — inclusive os briefings (design/copy/planning), que não vivem
          // no cache da lista mas VÊM no payload do broadcast (linha ~26KB no máximo).
          // Assim os painéis de Design/Aprovação e Copy/Aprovação atualizam ao vivo.
          if (selectedTaskRef.current?.id === raw.id) {
            setSelectedTask(prev => {
              if (!prev || prev.id !== raw.id) return prev;
              return {
                ...prev,
                ...listPatch(prev.id),
                ...(sm.isFieldDirty(prev.id, 'designBriefing')   ? {} : { designBriefing:   raw.design_briefing   ?? undefined }),
                ...(sm.isFieldDirty(prev.id, 'copyBriefing')     ? {} : { copyBriefing:     raw.copy_briefing     ?? undefined }),
                ...(sm.isFieldDirty(prev.id, 'planningBriefing') ? {} : { planningBriefing: raw.planning_briefing ?? undefined }),
              };
            });
          }
        }
      } else if (table === 'subtasks' || table === 'task_labels') {
        const taskId = record?.task_id || oldRecord?.task_id;
        // Pula eventos das nossas próprias gravações (evita refetch redundante).
        if (taskId && recentlySavedRef.current.has(taskId)) return;
        invalidateTasksDebounced();
      }
    };

    (async () => {
      // Canal privado exige o JWT do usuário no cliente de realtime.
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
      if (cancelled) return;

      channel = supabase
        .channel('tasks-changes', { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, applyBroadcast)
        .on('broadcast', { event: 'UPDATE' }, applyBroadcast)
        .on('broadcast', { event: 'DELETE' }, applyBroadcast)
        .subscribe((status, err) => {
          if (status !== 'SUBSCRIBED') {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn(`[Realtime] tasks-changes (broadcast): ${status}`, err ?? '');
            }
            return;
          }
          // Broadcast não reenvia o que passou enquanto o socket esteve caído. A cada
          // reconexão (menos a primeira, já coberta pelo fetch inicial) revalida tasks,
          // fechando o buraco na hora em vez de esperar o polling de 3 min.
          if (!hasBroadcastSubscribedRef.current) {
            hasBroadcastSubscribedRef.current = true;
            return;
          }
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        });

      // Tarefas privadas são publicadas num tópico à parte, entregue só a quem tem
      // nível 1 (policy em realtime.messages). Assinar aqui é inofensivo para os
      // demais: eles simplesmente não recebem nada.
      if (Number(currentUser?.permissionLevel) === 1) {
        adminChannel = supabase
          .channel('tasks-changes-admin', { config: { private: true } })
          .on('broadcast', { event: 'INSERT' }, applyBroadcast)
          .on('broadcast', { event: 'UPDATE' }, applyBroadcast)
          .on('broadcast', { event: 'DELETE' }, applyBroadcast)
          .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn(`[Realtime] tasks-changes-admin (broadcast): ${status}`, err ?? '');
            }
          });
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (adminChannel) supabase.removeChannel(adminChannel);
    };
  }, [queryClient, currentUser?.id, currentUser?.permissionLevel]);

  // Track task changes to generate notifications
  useEffect(() => {
    if (isFirstRender.current || !currentUser) {
      isFirstRender.current = false;
      previousTasksRef.current = tasks;
      return;
    }

    const prevTasks = previousTasksRef.current;
    
    // Skip notification logic on the very first real data load (when prevTasks is empty but tasks is populated)
    if (prevTasks.length === 0 && tasks.length > 0) {
      previousTasksRef.current = tasks;
      return;
    }

    // Check for deleted tasks where I was the assignee
    tasks.forEach(task => {
      const prevTask = prevTasks.find(pt => pt.id === task.id);
      
      if (prevTask) {
        // Here we removed the frontend logic for assigning, status and deadlines
        // since this is now handled perfectly by Postgres triggers in the backend!
      }
    });

    previousTasksRef.current = tasks;
  }, [tasks, currentUser]);

  // Deadline and reminder checks — currentUser is read via ref so that
  // updateProfile() (which creates a new object) does not reset the interval.
  useEffect(() => {
    if (!currentUserRef.current) return;
    const checkReminders = () => {
      const currentUser = currentUserRef.current;
      if (!currentUser) return;
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Merge persisted list with in-memory ref — prevents duplicates when
      // updateProfile() hasn't flushed to Supabase yet on rapid re-renders.
      const persisted: string[] = currentUser.preferences?.triggeredReminders || [];
      let triggeredReminders: string[] = [
        ...persisted,
        ...Array.from(triggeredRemindersRef.current).filter(id => !persisted.includes(id)),
      ];

      let hasNewTriggers = false;
      
      tasks.filter(t => t.status !== 'done').forEach(task => {
        const isMyTask = task.assigneeId === currentUser.id;

        // Check due date relative to today
        if (isMyTask && task.dueDate) {
          const due = new Date(task.dueDate + 'T00:00:00');
          due.setHours(0,0,0,0);
          const todayDate = new Date();
          todayDate.setHours(0,0,0,0);
          
          const diffTime = due.getTime() - todayDate.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          let message = '';
          let details = '';
          let deadlineKey = '';
          let milestone = '';

          const createdAtDate = new Date(task.createdAt.split('T')[0] + 'T00:00:00');
          createdAtDate.setHours(0,0,0,0);
          const totalDurationDays = Math.round((due.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays === 3 && totalDurationDays > 3) {
            message = 'Prazo em 3 dias';
            details = `O prazo da tarefa se encerra em 3 dias`;
            milestone = '3d';
            deadlineKey = `deadline_${task.id}_3d_${task.dueDate}`;
          } else if (diffDays === 1) {
            message = 'Prazo Amanhã';
            details = `O prazo da tarefa se encerra amanhã`;
            milestone = '1d';
            deadlineKey = `deadline_${task.id}_1d_${task.dueDate}`;
          } else if (diffDays === 0) {
            message = 'Prazo Vencendo Hoje';
            details = `O prazo desta tarefa vence hoje`;
            milestone = '0d';
            deadlineKey = `deadline_${task.id}_0d_${task.dueDate}`;
          } else if (diffDays === -3) {
            message = 'Prazo Atrasado (3 dias)';
            details = `A tarefa está 3 dias atrasada`;
            milestone = '-3d';
            deadlineKey = `deadline_${task.id}_-3d_${task.dueDate}`;
          } else if (diffDays === -7) {
            message = 'Prazo Atrasado (7 dias)';
            details = `A tarefa está 7 dias atrasada`;
            milestone = '-7d';
            deadlineKey = `deadline_${task.id}_-7d_${task.dueDate}`;
          } else if (diffDays === -15) {
            message = 'Prazo Atrasado (15 dias)';
            details = `A tarefa está 15 dias atrasada`;
            milestone = '-15d';
            deadlineKey = `deadline_${task.id}_-15d_${task.dueDate}`;
          }

          // Only fire each deadline alert once per task+type+dueDate combination
          if (message && deadlineKey && !triggeredReminders.includes(deadlineKey)) {
            addNotification({
              userId: currentUser.id,
              actorId: 'system',
              taskId: task.id,
              targetId: milestone,
              type: 'deadline',
              message,
              details
            });
            triggeredReminders = [...triggeredReminders, deadlineKey];
            hasNewTriggers = true;
          }
        }

        // Check task reminder — recipient is always the task's assignee
        if (isMyTask && task.reminderDate && task.reminderType !== 'seen') {
           const reminderTime = new Date(task.reminderDate).getTime();
           const reminderId = `task_${task.id}_${task.reminderDate}`;

           if (now.getTime() >= reminderTime && !triggeredReminders.includes(reminderId)) {
             addNotification({
               userId: currentUser.id,
               actorId: 'system',
               taskId: task.id,
               targetId: 'reminder',
               type: 'reminder',
               message: 'Lembrete de Tarefa',
               details: `O lembrete para a tarefa "${task.title}" foi acionado`
             });
             triggeredRemindersRef.current.add(reminderId);
             triggeredReminders = [...triggeredReminders, reminderId];
             hasNewTriggers = true;
           }
        }

        // Check subtask reminders — recipient is the subtask's own assignee if set,
        // otherwise it falls back to the parent task's assignee.
        task.subtasks.forEach(st => {
           const recipientId = st.assigneeId || task.assigneeId;
           if (recipientId !== currentUser.id) return;

           if (st.reminderDate && !st.completed && st.reminderType !== 'seen') {
             const reminderTime = new Date(st.reminderDate).getTime();
             const reminderId = `sub_${st.id}_${st.reminderDate}`;

             if (now.getTime() >= reminderTime && !triggeredReminders.includes(reminderId)) {
               addNotification({
                 userId: recipientId,
                 actorId: 'system',
                 taskId: task.id,
                 targetId: st.id,
                 type: 'reminder',
                 message: 'Lembrete Acionado',
                 details: `"${st.title}"`
               });
               triggeredRemindersRef.current.add(reminderId);
               triggeredReminders = [...triggeredReminders, reminderId];
               hasNewTriggers = true;
             }
           }
        });
      });

      // Check Sienge Titles reminders
      siengeTitles.filter(t => t.assigneeId === currentUser.id && t.status !== 'pago' && t.status !== 'recusados').forEach(title => {
        if (title.reminderDate) {
           const reminderTime = new Date(title.reminderDate).getTime();
           const reminderId = `sienge_${title.id}_${title.reminderDate}`;
           
           if (now.getTime() >= reminderTime && !triggeredReminders.includes(reminderId)) {
             addNotification({
               userId: currentUser.id,
               actorId: 'system',
               siengeTitleId: title.id,
               targetId: 'sienge_reminder',
               type: 'reminder',
               message: 'Lembrete de Título',
               details: `O lembrete para o título "${title.titulo}" foi acionado`
             });
             triggeredReminders = [...triggeredReminders, reminderId];
             hasNewTriggers = true;
           }
        }
      });

      // Check creative approvals for current user
      tasks.filter(t => t.status !== 'done').forEach(task => {
        task.designBriefing?.deliveries?.forEach((delivery, idx) => {
          if ((delivery.status === 'pending' || delivery.status === 'review_requested') && delivery.approverId === currentUser.id) {
            const markedTime = new Date(delivery.createdAt).getTime();
            const diffMs = now.getTime() - markedTime;
            const diffHours = diffMs / (1000 * 60 * 60);
            
            const milestones = [
              { id: '3h', hours: 3, label: 'Lembrete (3h): Aprovação Pendente' },
              { id: '1d', hours: 24, label: 'Atrasado (1 dia): Aprovação Pendente' },
              { id: '2d', hours: 48, label: 'Atrasado (2 dias): Aprovação Pendente' },
              { id: '3d', hours: 72, label: 'Atrasado (3 dias): Aprovação Pendente' },
              { id: '4d', hours: 96, label: 'Atrasado (4 dias): Aprovação Pendente' },
              { id: '5d', hours: 120, label: 'Atrasado (5 dias): Aprovação Pendente' },
              { id: '6d', hours: 144, label: 'Atrasado (6 dias): Aprovação Pendente' },
              { id: '7d', hours: 168, label: 'Atrasado (7 dias): Aprovação Pendente' },
            ];

            milestones.forEach(m => {
              const reminderId = `approval_${delivery.id}_${m.id}`;
              if (diffHours >= m.hours && !triggeredReminders.includes(reminderId)) {
                addNotification({
                  userId: currentUser.id,
                  actorId: 'system',
                  taskId: task.id,
                  type: 'approval_pending',
                  message: m.label,
                  details: `Criativo ${String(idx + 1).padStart(2, '0')} aguarda sua aprovação na tarefa "${task.title}"`
                });
                triggeredReminders = [...triggeredReminders, reminderId];
                hasNewTriggers = true;
              }
            });
          }
        });
      });
      
      if (hasNewTriggers) {
        // Persist to Supabase so it works across any device
        updateProfile({
          preferences: {
            ...currentUser.preferences,
            triggeredReminders
          }
        }).catch(console.error);
      }
    };
    
    const timeout = setTimeout(checkReminders, 5000); // Run 5 seconds after mount/update
    const interval = setInterval(checkReminders, 60000); // Check every minute

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  // currentUser is intentionally excluded — read via currentUserRef.current
  // to avoid resetting the interval on every updateProfile() call.
  }, [tasks, siengeTitles]);

  // Bind Cmd+K and on-screen toggling listeners
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandBarOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandBarOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  // Update selectedTask details live when the database copies alter.
  // Briefings are NOT in the list fetch — preserve them from the previous state.
  useEffect(() => {
    if (selectedTask) {
      const refreshedTask = tasks.find(t => t.id === selectedTask.id);
      if (refreshedTask) {
        setSelectedTask(prev => prev ? {
          ...refreshedTask,
          designBriefing: prev.designBriefing,
          copyBriefing: prev.copyBriefing,
          planningBriefing: prev.planningBriefing,
        } : refreshedTask);
      }
    }
  }, [tasks, selectedTask?.id]);

  // The `dark` class on <html> is what index.css keys the whole token system
  // off of — every zinc/gray/accent value flips when it toggles.
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', isDarkMode);
    root.style.backgroundColor = isDarkMode ? '#08080a' : '#e8eaed';
    root.style.colorScheme = isDarkMode ? 'dark' : 'light';
    localStorage.setItem('orbit:theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Queue for debouncing saveTask per task ID
  const saveTaskTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // TASK WORKFLOWS (CRUD)
  const handleUpdateTask = (updates: Partial<Task> & { id: string }) => {
    const targetTask = tasks.find(t => t.id === updates.id);
    if (!targetTask) return;
    
    // Always set updatedBy so backend triggers know who made the change
    if (currentUser?.id) {
      updates.updatedBy = currentUser.id;
    }

    const nowISO = new Date().toISOString();
    
    // Regra: tarefas sem prazo não podem estar em outro status além de 'no_forecast' e 'done'
    const resultingDueDate = 'dueDate' in updates ? updates.dueDate : targetTask.dueDate;
    const newStatus = updates.status;
    const statusIsChanging = newStatus !== undefined && newStatus !== targetTask.status;
    const statusMovingActive = statusIsChanging && newStatus !== 'no_forecast' && newStatus !== 'done';

    if (statusMovingActive && !resultingDueDate) {
      // Só o status é barrado. Descartar o update inteiro derrubava junto os dados que
      // vieram no mesmo write — o caso real foi a rodada de aprovação de orçamento, que
      // sobe com status 'approval': a rodada se perdia e o aprovador recebia a
      // notificação sem ter nada para aprovar.
      showToast('Adicione um prazo antes de mover esta tarefa para outro status.');
      delete updates.status;
      const hasOtherChanges = Object.keys(updates).some(k => k !== 'id' && k !== 'updatedBy');
      if (!hasOtherChanges) return;
    }

    // Automação: prazo removido de task ativa → volta silenciosamente para 'Sem Previsão'
    const dueDateBeingCleared = 'dueDate' in updates && !updates.dueDate && Boolean(targetTask.dueDate);
    if (dueDateBeingCleared && targetTask.status !== 'done') {
      updates.status = 'no_forecast';
    }

    const ignoredFields = ['id', 'description', 'designBriefing', 'copyBriefing', 'planningBriefing'];
    const updateKeys = Object.keys(updates);
    const isSignificantUpdate = updateKeys.some(k => !ignoredFields.includes(k));

    if (isSignificantUpdate) {
      updates.updatedAt = nowISO;
    }

    // --- Status History & Time Tracking Logic ---
    if (updates.status && updates.status !== targetTask.status) {
      // Status History Update
      const history = [...(targetTask.statusHistory || [])];
      if (history.length > 0) {
        history[history.length - 1].leftAt = nowISO;
      } else if (targetTask.status) {
        history.push({
          status: targetTask.status,
          enteredAt: targetTask.createdAt || nowISO,
          leftAt: nowISO
        });
      }
      history.push({
        status: updates.status as any,
        enteredAt: nowISO
      });
      updates.statusHistory = history;

      // Refação: cada vez que a tarefa entra em 'rework' conta como um ciclo de retrabalho
      if (updates.status === 'rework' && targetTask.status !== 'rework') {
        updates.reworkCount = (targetTask.reworkCount || 0) + 1;
      }

      const tt = targetTask.timeTracking ? { ...targetTask.timeTracking } : { accumulatedMs: 0, isTimerRunning: false };
      const nowMs = Date.now();

      const runStates = ['in_progress', 'rework'];
      const stopStates = ['implementation', 'done'];

      const isRunningNow = tt.isTimerRunning;
      const willRun = runStates.includes(updates.status);

      // Pause/Stop logic
      if (isRunningNow && !willRun) {
        const startedAtMs = tt.lastStartedAt ? new Date(tt.lastStartedAt).getTime() : nowMs;
        tt.accumulatedMs += Math.max(0, nowMs - startedAtMs);
        tt.isTimerRunning = false;
        tt.lastStartedAt = undefined;
      }

      // Start logic
      if (!isRunningNow && willRun) {
        tt.isTimerRunning = true;
        tt.lastStartedAt = nowISO;
      }

      if (stopStates.includes(updates.status)) {
        if (!tt.reachedImplementationAt) tt.reachedImplementationAt = nowISO;
      } else {
        tt.reachedImplementationAt = undefined;
      }

      updates.timeTracking = tt;
    }
    // ----------------------------
    
    // Determine if it's a text-heavy change requiring debounce
    const needsDebounce = Object.keys(updates).some(key => 
      ['description', 'title', 'chatMessages', 'designBriefing', 'copyBriefing', 'planningBriefing'].includes(key)
    );

    // Suppress self-triggered Realtime events for this task for the next 3s
    markRecentlySaved(updates.id);

    // Queue update via SyncManager
    syncManager.updateTask(updates.id, updates, { debounce: needsDebounce });

    // Update selectedTask details live immediately
    if (selectedTask?.id === updates.id) {
       setSelectedTask(prev => prev ? { ...prev, ...updates } as Task : null);
    }
  };

  const handleAddTask = (newTask: Task) => {
    // Tarefa criada já em 'in_progress'/'rework' (coluna do Kanban, "Nova Tarefa"
    // dentro de Em Progresso/Refação) nunca passa pela transição de status que
    // liga o cronômetro em handleUpdateTask — sem isto, ela ficava com
    // timeTracking vazio para sempre e o card não mostrava o tempo trabalhado.
    const runStates: TaskStatus[] = ['in_progress', 'rework'];
    if (runStates.includes(newTask.status) && !newTask.timeTracking) {
      const nowISO = new Date().toISOString();
      newTask = {
        ...newTask,
        timeTracking: { accumulatedMs: 0, isTimerRunning: true, lastStartedAt: nowISO },
        statusHistory: [{ status: newTask.status, enteredAt: nowISO }],
      };
    }
    markRecentlySaved(newTask.id);
    queryClient.setQueryData<Task[]>(['tasks'], prev => [newTask, ...(prev || [])]);
    saveTask(newTask).catch(console.error);
  };

  const handleDeleteTask = (taskId: string) => {
    queryClient.setQueryData<Task[]>(['tasks'], prev => (prev || []).filter(t => t.id !== taskId));
    deleteTask(taskId).catch(console.error);
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
      setIsTaskSheetOpen(false);
      setConfirmModalData({ isOpen: false, taskId: null });
    }
  };

  const handleAddNewTaskPrompt = () => {
    const newTask: any = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      status: 'no_forecast',
      priority: 'medium',
      projectId: '',
      labels: [labels.find(l => l.name === 'Tarefa') || labels[0]].filter(Boolean) as Label[],
      subtasks: [],
      createdAt: new Date().toISOString().split('T')[0],
      assigneeId: currentUser?.id,
      _isLocal: true, // Flag to prevent queryFnTasks from dropping it before DB sync
    };

    handleAddTask(newTask as Task);
    setSelectedTask(newTask as Task);
    setIsTaskSheetOpen(true);
  };

  const handleSelectTask = useCallback(async (task: Task) => {
    setSelectedTask(task);
    setIsTaskSheetOpen(true);
    // Load briefing columns on-demand (excluded from fetchTasks to save bandwidth).
    // These carry base64 creative images and can take several seconds, so the flag
    // lets the UI say "carregando" instead of rendering an empty approval section.
    setAreBriefingsLoading(true);
    try {
      const briefings = await fetchTaskBriefings(task.id);
      if (briefings) {
        setSelectedTask(prev => prev?.id === task.id ? { ...prev, ...briefings } : prev);
      }
    } catch {
      // Non-blocking — briefing sections will just appear empty
    } finally {
      setAreBriefingsLoading(false);
    }
  }, []);

  const handleCloseTaskSheet = (localTaskState?: any) => {
    if (isTaskSheetOpen && selectedTask) {
      const taskToCheck = localTaskState && !localTaskState.nativeEvent ? localTaskState : tasks.find(t => t.id === selectedTask.id);
      console.log('Validating task on close:', taskToCheck);
      if (taskToCheck) {
        const plainDesc = (taskToCheck.description || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
        const hasTitle = !!(taskToCheck.title && taskToCheck.title.trim());
        const hasDesc = !!plainDesc;
        const hasLabel = taskToCheck.labels && taskToCheck.labels.length > 0;
        const hasProject = !!taskToCheck.projectId;
        const hasAssignee = !!taskToCheck.assigneeId;
        console.log('Validation results:', { hasTitle, hasDesc, hasLabel, hasProject, hasAssignee, plainDesc });

        const missingFields: string[] = [];
        if (!hasTitle) missingFields.push('Nome da Tarefa');
        if (!hasDesc) missingFields.push('Descrição');
        if (!hasLabel) missingFields.push('Classe');
        if (!hasProject) missingFields.push('Empreendimento');
        if (!hasAssignee) missingFields.push('Responsável');

        if (missingFields.length > 0) {
           const formattedMessage = `Atenção: Os seguintes campos obrigatórios não foram preenchidos:\n\n${missingFields.map(f => `- ${f}`).join('\n')}\n\nSe você sair agora, a tarefa incompleta será EXCLUÍDA. Deseja realmente sair?`;
           setConfirmModalData({ 
             isOpen: true, 
             taskId: taskToCheck.id, 
             message: formattedMessage,
             missingFields
           });
           return;
        }
      }
    }
    setIsTaskSheetOpen(false);
    setSelectedTask(null);
    setConfirmModalData({ isOpen: false, taskId: null });
  };

  const handleAddProject = (newProject: Project) => {
    queryClient.setQueryData<Project[]>(['projects'], prev => [...(prev || []), newProject]);
    saveProject(newProject).catch(console.error);
  };

  const handleUpdateProject = async (updatedProject: Project) => {
    const anterior = projects.find(p => p.id === updatedProject.id);
    const renomeou = !!anterior && anterior.name !== updatedProject.name;

    queryClient.setQueryData<Project[]>(['projects'], prev => (prev || []).map(p => p.id === updatedProject.id ? updatedProject : p));

    try {
      // O nome sai primeiro e sozinho: a RPC religa os títulos (presos por nome)
      // na mesma transação. Só depois o upsert grava o resto dos campos.
      if (renomeou) {
        await renameProject(updatedProject.id, updatedProject.name);
        queryClient.invalidateQueries({ queryKey: ['siengeTitles'] });
        queryClient.invalidateQueries({ queryKey: ['siengeMensalidades'] });
      }
      await saveProject(updatedProject);
    } catch (e: any) {
      // Nome duplicado é a recusa esperada — o nome é chave de ligação, dois
      // empreendimentos homônimos fundiriam o gasto dos dois no dashboard.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast(e?.message || 'Erro ao salvar o empreendimento.');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const alvo = projects.find(p => p.id === projectId);
    queryClient.setQueryData<Project[]>(['projects'], prev => (prev || []).filter(p => p.id !== projectId));
    if (currentProjectFilter === projectId) setCurrentProjectFilter(null);
    try {
      await deleteProject(projectId);
      // O cascade do banco levou tarefas, unidades, vendas, metas e LP junto —
      // recarrega tudo que pode ter encolhido em vez de tentar espelhar na mão.
      ['tasks', 'siengeTabelaVendas', 'siengeTabelaVendaVersoes', 'siengeVendas',
       'comercialMetas', 'siengeCategoriaOrcamento', 'siengeTabelaVendaColunas',
       'siengeCalculoRegras', 'siengeValidacoes']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast(e?.message || `Erro ao excluir ${alvo?.name || 'o empreendimento'}.`);
    }
  };

  const handleResetDatabase = () => {
    // For Supabase, resetting the database requires a specific script, 
    // so we'll just alert for now or implement a truncate later.
    alert('Reset de banco de dados remoto não suportado nesta versão MVP.');
  };

  // Switch project trigger from other views safely
  const handleSelectProjectFilter = (projectId: string) => {
    setCurrentProjectFilter(projectId);
    setActiveView('tasks_board');
  };

  // Breadcrumbs text label parser
  const visibleTasks = tasks.filter(t => {
    let matches = true;
    if (currentProjectFilter) {
      matches = matches && t.projectId === currentProjectFilter;
    }
    if (socialMediaFilter) {
      matches = matches && t.labels.some(l => l.name === 'Social Media');
    }
    return matches;
  });

  const getBreadcrumbLabel = () => {
    switch (activeView) {
      case 'tasks_board':
        return activeTaskViewType === 'board' ? 'Quadro Kanban' : 'Lista Compacta';
      case 'projects':
        return 'Empreendimentos Globais';
      case 'calendar':
        return 'Calendário';
      case 'crm':
        return 'CRM';
      case 'settings':
        return 'Ajustes';
      case 'comercial':
        return 'Comercial';
      default:
        return 'Workspace';
    }
  };

  const activeProjectObject = projects.find(p => p.id === currentProjectFilter);

  // --- Main App Logic below ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080a] flex items-center justify-center">
        <Loader2 size={32} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  if (isDataLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#08080a] select-none">
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(99,102,241,0.15)] relative">
             <div className="absolute inset-0 rounded-2xl border-2 border-blue-500/30 border-t-blue-500 animate-spin"></div>
             <Layers className="text-blue-500" size={32} strokeWidth={1.5} />
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-200 tracking-tight">Preparando seu Workspace</h2>
            <p className="text-xs text-zinc-500 font-medium">Sincronizando tarefas, criativos e projetos...</p>
          </div>
          
          <div className="flex gap-1 mt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    // O index.html usa viewport-fit=cover por causa da LP do Corretor, que
    // sangra o banner até as bordas. O app não é desenhado para áreas seguras,
    // então recolhe os insets aqui para não passar por baixo do recorte nem do
    // indicador de gestos. Em telas sem recorte os env() valem 0.
    <div
      className={`h-dvh flex overflow-hidden bg-[#08080a] text-zinc-100 ${isDarkMode ? 'dark' : ''}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      
      {/* Collapsible Sidebar block */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        activeView={activeView}
        setActiveView={setActiveView}
        activeTaskViewType={activeTaskViewType}
        setActiveTaskViewType={setActiveTaskViewType}
        projects={projects}
        tasks={tasks}
        onOpenCommandBar={() => setIsCommandBarOpen(true)}
        onNewTask={handleAddNewTaskPrompt}
        currentProjectFilter={currentProjectFilter}
        setCurrentProjectFilter={setCurrentProjectFilter}
        onSelectTask={handleSelectTask}
      />

      {/* Main Container Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Top Header navbar */}
        <header className="appbar-h border-b border-zinc-900 view-pad-x flex items-center justify-between gap-3 shrink-0 bg-[#08080a]/60 backdrop-blur-md z-10 select-none">
          <div className="flex items-center gap-3 min-w-0">
            {/* "Workspace /" é redundante quando o espaço aperta — o rótulo da
                view sozinho já orienta, e a largura vai para o filtro ativo. */}
            <span className="hidden xl:inline text-zinc-500 text-[11px] font-semibold tracking-wider font-sans uppercase">Workspace</span>
            <span className="hidden xl:inline text-zinc-500 text-xs">/</span>

            {/* Breadcrumb indicator */}
            <span className="text-[11px] font-semibold text-zinc-200 tracking-tight flex items-center gap-1.5 font-sans whitespace-nowrap">
              {getBreadcrumbLabel()}
            </span>

            {/* Active Project Filter box */}
            {currentProjectFilter && activeProjectObject && (
              <div className="hidden sm:flex items-center gap-1.5 ml-1 lg:ml-4 min-w-0 bg-zinc-900/60 text-zinc-300 border border-zinc-800/80 px-2 py-0.5 rounded-md text-[10px] font-sans font-medium">
                <span className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${activeProjectObject.color}`} />
                <span className="truncate max-w-[16ch] lg:max-w-none" title={activeProjectObject.name}>{activeProjectObject.name}</span>
                <button
                  onClick={() => setCurrentProjectFilter(null)}
                  className="hover:text-zinc-100 transition-colors ml-1 text-zinc-400 font-bold"
                  title="Remover filtro"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mode switch helper triggers */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-md transition-colors border border-zinc-900 bg-zinc-950/40"
              title={isDarkMode ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
            >
              {isDarkMode ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} />}
            </button>

            {/* Nova Tarefa right button */}
            <button
              onClick={handleAddNewTaskPrompt}
              className="hidden md:flex h-7 items-center gap-1.5 px-2.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-medium text-zinc-200 hover:text-zinc-100 rounded-md transition-all active:scale-[0.98]"
            >
              <span>+ Novo Item</span>
            </button>
          </div>
        </header>

        {/* Dynamic Route views rendered here */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
        <AnimatePresence mode="wait">
        <motion.div
          key={`${activeView}-${activeView === 'tasks_board' ? activeTaskViewType : ''}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="flex-1 flex flex-col overflow-hidden min-h-0"
        >
          {somenteLeitura && (
            <div className="shrink-0 flex items-center gap-2 view-pad-x py-1.5 text-[11px] text-sky-300/90 bg-sky-500/10 border-b border-sky-500/20">
              <Eye size={12} /> Somente leitura: seu perfil pode consultar esta área, mas não alterar.
            </div>
          )}
          <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="text-zinc-600 animate-spin" /></div>}>
          {activeView === 'home' && (
            <HomeView
              tasks={tasks}
              projects={projects}
              labels={labels}
              onUpdateTask={handleUpdateTask}
              onSelectTask={handleSelectTask}
            />
          )}

          {activeView === 'inbox' && (
            <InboxView
              projects={projects}
              onSelectTask={handleSelectTask}
              tasks={tasks}
            />
          )}

          {activeView === 'tasks_board' && activeTaskViewType === 'board' && (
            <KanbanView
              tasks={visibleTasks}
              projects={projects}
              labels={labels}
              onSelectTask={handleSelectTask}
              onUpdateTask={handleUpdateTask}
              onAddTask={handleAddTask}
              currentProjectFilter={currentProjectFilter}
              socialMediaFilter={socialMediaFilter}
              setSocialMediaFilter={setSocialMediaFilter}
              editingMap={editingMap}
            />
          )}

          {activeView === 'tasks_board' && activeTaskViewType === 'list' && (
            <ListView
              tasks={visibleTasks}
              projects={projects}
              labels={labels}
              onSelectTask={handleSelectTask}
              onUpdateTask={handleUpdateTask}
              onAddTask={handleAddTask}
              currentProjectFilter={currentProjectFilter}
              editingMap={editingMap}
            />
          )}

          {activeView === 'calendar' && (
            <CalendarView
              tasks={visibleTasks}
              projects={projects}
              labels={labels}
              onSelectTask={handleSelectTask}
              onAddTask={handleAddTask}
              onUpdateTask={handleUpdateTask}
              currentProjectFilter={currentProjectFilter}
              socialMediaFilter={socialMediaFilter}
              setSocialMediaFilter={setSocialMediaFilter}
            />
          )}

          {activeView === 'crm' && (
            <CrmView projects={projects} />
          )}

          {activeView === 'projects' && (
            <ProjectsView
              projects={projects}
              tasks={tasks}
              onSelectProjectFilter={handleSelectProjectFilter}
              onAddProject={handleAddProject}
              onUpdateProject={handleUpdateProject}
              onDeleteProject={handleDeleteProject}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            />
          )}

          {activeView === 'comercial' && (
            <ComercialTabBar tab={comercialTab} onChange={setComercialTab} permitidas={abasComercial} />
          )}

          {activeView === 'comercial' && comercialTab === 'propostas' && (
            <div className="flex-1 min-h-0">
              <PropostasKanban
                projects={projects}
                projectDisplays={siengeProjectDisplays}
                unidades={siengeTabelaVendas}
                versoes={siengeTabelaVendaVersoes}
                colunas={siengeTabelaVendaColunas}
              />
            </div>
          )}

          {activeView === 'comercial' && comercialTab === 'historico' && (
            <div className="flex-1 min-h-0">
              <ComercialHistorico projects={projects} />
            </div>
          )}

          {/* Finanças e as abas Tabela de Vendas / Dashboard do Comercial são a
              mesma instância: no Comercial ela fica travada na aba escolhida e
              sem barra de abas própria. Compartilhar o componente evita duplicar
              toda a fiação de handlers abaixo. */}
          {(activeView === 'sienge' || (activeView === 'comercial' && (comercialTab === 'vendas' || ABAS_DASHBOARD.includes(comercialTab)))) && (
            <div className="flex-1 min-h-0">
            <SiengeView
              forcedTab={activeView === 'comercial' && (comercialTab === 'vendas' || ABAS_DASHBOARD.includes(comercialTab)) ? comercialTab as 'vendas' | ComercialDashboardTab : undefined}
              titles={siengeTitles}
              statusHistory={siengeTitleStatusHistory}
              lotes={siengeLotes}
              faturas={siengeFaturas}
              projects={projects}
              currentProjectFilter={currentProjectFilter}
              alcadaConfig={siengeAlcadaConfig}
              onSaveAlcadaConfig={async (config) => {
                queryClient.setQueryData(['siengeAlcadaConfig'], config);
                await saveSiengeAlcadaConfig(config);
              }}
              editingMap={editingMap}
              onTitlePresence={(titleId) => presenceTrackRef.current?.(titleId)}
              onSaveTitle={async (title) => {
                // __baseUpdatedAt é transiente (só serve ao compare-and-swap); não vai pro cache.
                const { __baseUpdatedAt, ...clean } = title as any;
                queryClient.setQueryData<SiengeTitle[]>(['siengeTitles'], prev => {
                  const exists = (prev || []).find(t => t.id === clean.id);
                  // attachmentsCount vem de coluna gerada, então não volta no objeto salvo:
                  // recalcula pelos anexos enviados ou preserva o que a lista já sabia —
                  // senão o clipe de anexo sumiria da tela até o próximo refetch.
                  const merged: SiengeTitle = {
                    ...clean,
                    attachmentsCount: clean.attachments?.length ?? exists?.attachmentsCount,
                  };
                  return exists
                    ? (prev || []).map(t => t.id === clean.id ? merged : t)
                    : [merged, ...(prev || [])];
                });
                saveSiengeTitle(title).catch((e) => {
                  if (e instanceof SiengeTitleConflictError) {
                    // Outro usuário salvou primeiro: descarta a alteração local e recarrega.
                    queryClient.invalidateQueries({ queryKey: ['siengeTitles'] });
                    showToast('Este título foi alterado por outra pessoa. Sua tela foi atualizada com a versão mais recente.');
                  } else {
                    console.error(e);
                  }
                });
              }}
              onDeleteTitle={async (id) => {
                queryClient.setQueryData<SiengeTitle[]>(['siengeTitles'], prev => (prev || []).filter(t => t.id !== id));
                deleteSiengeTitle(id).catch(console.error);
              }}
              mensalidades={siengeMensalidades}
              onSaveMensalidade={async (m) => {
                queryClient.setQueryData<SiengeMensalidade[]>(['siengeMensalidades'], prev => {
                  const exists = (prev || []).find(x => x.id === m.id);
                  return exists
                    ? (prev || []).map(x => x.id === m.id ? m : x)
                    : [m, ...(prev || [])];
                });
                saveSiengeMensalidade(m).catch(console.error);
              }}
              onDeleteMensalidade={async (id) => {
                queryClient.setQueryData<SiengeMensalidade[]>(['siengeMensalidades'], prev => (prev || []).filter(x => x.id !== id));
                deleteSiengeMensalidade(id).catch(console.error);
              }}
              onSaveLote={async (lote) => {
                queryClient.setQueryData<SiengeLote[]>(['siengeLotes'], prev => {
                  const exists = (prev || []).find(l => l.id === lote.id);
                  return exists
                    ? (prev || []).map(l => l.id === lote.id ? lote : l)
                    : [lote, ...(prev || [])];
                });
                saveSiengeLote(lote).catch(console.error);
              }}
              onDeleteLote={async (id) => {
                queryClient.setQueryData<SiengeLote[]>(['siengeLotes'], prev => (prev || []).filter(l => l.id !== id));
                deleteSiengeLote(id).catch(console.error);
              }}
              onSaveFatura={async (fatura) => {
                queryClient.setQueryData<SiengeFatura[]>(['siengeFaturas'], prev => {
                  const exists = (prev || []).find(f => f.id === fatura.id);
                  return exists
                    ? (prev || []).map(f => f.id === fatura.id ? fatura : f)
                    : [fatura, ...(prev || [])];
                });
                saveSiengeFatura(fatura).catch(console.error);
              }}
              onDeleteFatura={async (id) => {
                queryClient.setQueryData<SiengeFatura[]>(['siengeFaturas'], prev => (prev || []).filter(f => f.id !== id));
                deleteSiengeFatura(id).catch(console.error);
              }}
              categoriaOrcamento={siengeCategoriaOrcamento}
              projectTotais={siengeProjectTotais}
              projectDisplays={siengeProjectDisplays}
              onSaveProjectTotal={async (total) => {
                queryClient.setQueryData<SiengeProjectTotal[]>(['siengeProjectTotais'], prev => {
                  const exists = (prev || []).find(t => t.id === total.id);
                  return exists
                    ? (prev || []).map(t => t.id === total.id ? total : t)
                    : [total, ...(prev || [])];
                });
                saveSiengeProjectTotal(total).catch(console.error);
              }}
              onSaveCategoriaOrcamento={async (item) => {
                queryClient.setQueryData<SiengeCategoriaOrcamento[]>(['siengeCategoriaOrcamento'], prev => {
                  const exists = (prev || []).find(c => c.id === item.id);
                  return exists
                    ? (prev || []).map(c => c.id === item.id ? item : c)
                    : [item, ...(prev || [])];
                });
                saveSiengeCategoriaOrcamento(item).catch(console.error);
              }}
              onDeleteCategoriaOrcamento={async (id) => {
                queryClient.setQueryData<SiengeCategoriaOrcamento[]>(['siengeCategoriaOrcamento'], prev => (prev || []).filter(c => c.id !== id));
                deleteSiengeCategoriaOrcamento(id).catch(console.error);
              }}
              tabelaVendas={siengeTabelaVendas}
              tabelaVendaVersoes={siengeTabelaVendaVersoes}
              tabelaVendaConfigs={siengeTabelaVendaConfigs}
              onSaveTabelaVendaVersao={async (versao) => {
                await saveSiengeTabelaVendaVersao(versao);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendaVersoes'] });
              }}
              onDuplicarTabelaVendaVersao={async (versaoId, nome) => {
                await duplicarSiengeTabelaVendaVersao(versaoId, nome);
                // A cópia cria linhas nas cinco tabelas de uma vez.
                ['siengeTabelaVendaVersoes', 'siengeTabelaVendas', 'siengeTabelaVendaColunas', 'siengeCalculoRegras']
                  .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
              }}
              onDefinirVersaoPrincipal={async (versaoId) => {
                await definirVersaoPrincipal(versaoId);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendaVersoes'] });
              }}
              onDeleteTabelaVendaVersao={async (versaoId) => {
                await deleteSiengeTabelaVendaVersao(versaoId);
                ['siengeTabelaVendaVersoes', 'siengeTabelaVendas', 'siengeTabelaVendaColunas', 'siengeCalculoRegras', 'siengeValidacoes', 'siengeTabelaVendaRevisoes']
                  .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
              }}
              onSaveTabelaVendaConfig={async (config) => {
                await saveSiengeTabelaVendaConfig(config);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendaConfigs'] });
              }}
              tabelaVendaRevisoes={siengeTabelaVendaRevisoes}
              onSaveTabelaVenda={async (item) => {
                queryClient.setQueryData<SiengeTabelaVendaUnidade[]>(['siengeTabelaVendas'], prev => {
                  const exists = (prev || []).find(u => u.id === item.id);
                  return exists
                    ? (prev || []).map(u => u.id === item.id ? item : u)
                    : [item, ...(prev || [])];
                });
                saveSiengeTabelaVenda(item).catch(console.error);
              }}
              onDeleteTabelaVenda={async (id) => {
                queryClient.setQueryData<SiengeTabelaVendaUnidade[]>(['siengeTabelaVendas'], prev => (prev || []).filter(u => u.id !== id));
                deleteSiengeTabelaVenda(id).catch(console.error);
              }}
              onClearTabelaVenda={async (projectId) => {
                await deleteAllSiengeTabelaVendasByProject(projectId);
                queryClient.setQueryData<SiengeTabelaVendaUnidade[]>(['siengeTabelaVendas'], prev => (prev || []).filter(u => u.projectId !== projectId));
              }}
              onApplyTabelaVendaReajuste={async (params) => {
                await applySiengeTabelaVendasReajuste(params);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendas'] });
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendaRevisoes'] });
              }}
              onSetTabelaVendaMargem={async (params) => {
                await setSiengeTabelaVendasMargem(params);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendas'] });
              }}
              onReverterTabelaVendaRevisao={async (revisaoId) => {
                await reverterSiengeTabelaVendasRevisao(revisaoId);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendas'] });
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendaRevisoes'] });
              }}
              onAlterarSituacaoUnidades={async (params) => {
                await alterarSituacaoUnidades(params);
                queryClient.invalidateQueries({ queryKey: ['siengeTabelaVendas'] });
                // A trigger cria ou encerra o snapshot de venda no mesmo UPDATE.
                queryClient.invalidateQueries({ queryKey: ['siengeVendas'] });
              }}
              vendas={siengeVendas}
              orcamentoConfig={siengeOrcamentoConfig}
              onSaveOrcamentoConfig={async (config) => {
                queryClient.setQueryData(['siengeOrcamentoConfig'], config);
                saveSiengeOrcamentoConfig(config).catch(console.error);
              }}
              tabelaVendaColunas={siengeTabelaVendaColunas}
              onSaveTabelaVendaColuna={async (coluna) => {
                queryClient.setQueryData<SiengeTabelaVendaColuna[]>(['siengeTabelaVendaColunas'], prev => {
                  const exists = (prev || []).find(c => c.id === coluna.id);
                  return exists
                    ? (prev || []).map(c => c.id === coluna.id ? coluna : c)
                    : [...(prev || []), coluna];
                });
                saveSiengeTabelaVendaColuna(coluna).catch(console.error);
              }}
              onDeleteTabelaVendaColuna={async (id) => {
                queryClient.setQueryData<SiengeTabelaVendaColuna[]>(['siengeTabelaVendaColunas'], prev => (prev || []).filter(c => c.id !== id));
                deleteSiengeTabelaVendaColuna(id).catch(console.error);
              }}
              calculoRegras={siengeCalculoRegras}
              onSaveCalculoRegra={async (regra) => {
                queryClient.setQueryData<SiengeCalculoRegra[]>(['siengeCalculoRegras'], prev => {
                  const exists = (prev || []).find(r => r.id === regra.id);
                  return exists
                    ? (prev || []).map(r => r.id === regra.id ? regra : r)
                    : [...(prev || []), regra];
                });
                saveSiengeCalculoRegra(regra).catch(console.error);
              }}
              onDeleteCalculoRegra={async (id) => {
                queryClient.setQueryData<SiengeCalculoRegra[]>(['siengeCalculoRegras'], prev => (prev || []).filter(r => r.id !== id));
                deleteSiengeCalculoRegra(id).catch(console.error);
              }}
              validacoes={siengeValidacoes}
              onSaveValidacao={async (validacao) => {
                queryClient.setQueryData<SiengeValidacao[]>(['siengeValidacoes'], prev => {
                  const exists = (prev || []).find(v => v.id === validacao.id);
                  return exists
                    ? (prev || []).map(v => v.id === validacao.id ? validacao : v)
                    : [...(prev || []), validacao];
                });
                saveSiengeValidacao(validacao).catch(console.error);
              }}
              onDeleteValidacao={async (id) => {
                queryClient.setQueryData<SiengeValidacao[]>(['siengeValidacoes'], prev => (prev || []).filter(v => v.id !== id));
                deleteSiengeValidacao(id).catch(console.error);
              }}
              taxonomy={siengeTaxonomy}
              onAddCentroCusto={async (nome) => {
                queryClient.setQueryData<typeof siengeCentrosCusto>(['siengeCentrosCusto'], prev =>
                  [...(prev || []), { id: crypto.randomUUID(), nome, createdAt: new Date().toISOString() }]
                );
                await addSiengeCentroCusto(nome);
                queryClient.invalidateQueries({ queryKey: ['siengeCentrosCusto'] });
              }}
              onAddCategoria={async (centroCusto, categoria) => {
                await addSiengeCategoria(centroCusto, categoria);
                queryClient.invalidateQueries({ queryKey: ['siengeCategorias'] });
              }}
              onRenameCategoria={async (id, categoria) => {
                queryClient.setQueryData<typeof siengeCategorias>(['siengeCategorias'], prev =>
                  (prev || []).map(c => c.id === id ? { ...c, categoria } : c)
                );
                await renameSiengeCategoria(id, categoria);
              }}
              onDeleteCategoria={async (id) => {
                queryClient.setQueryData<typeof siengeCategorias>(['siengeCategorias'], prev => (prev || []).filter(c => c.id !== id));
                await deleteSiengeCategoria(id);
                queryClient.invalidateQueries({ queryKey: ['siengeSubcategorias'] });
              }}
              onAddSubcategoria={async (categoriaId, subcategoria) => {
                await addSiengeSubcategoria(categoriaId, subcategoria);
                queryClient.invalidateQueries({ queryKey: ['siengeSubcategorias'] });
              }}
              onDeleteSubcategoria={async (id) => {
                queryClient.setQueryData<typeof siengeSubcategorias>(['siengeSubcategorias'], prev => (prev || []).filter(s => s.id !== id));
                await deleteSiengeSubcategoria(id);
              }}
            />
            </div>
          )}

          {activeView === 'dashboard' && (
            <DashboardView
              tasks={tasks}
              projects={projects}
              labels={labels}
            />
          )}
          </Suspense>
          </motion.div>
        </AnimatePresence>
        </div>
      </div>

      {/* Task detail slide-out drawer */}
      <TaskSheet
        task={selectedTask}
        isOpen={isTaskSheetOpen}
        onClose={handleCloseTaskSheet}
        projects={projects}
        allLabels={labels}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        allTasks={tasks}
        onAddTask={handleAddTask}
        onSelectTask={handleSelectTask}
        editingBy={selectedTask ? editingMap[selectedTask.id] : undefined}
        cooldown={selectedTask ? cooldownMap[selectedTask.id] : undefined}
        editingMap={editingMap}
        briefingsLoading={areBriefingsLoading}
      />

      {/* Cmd+K global Command Palette overlay popover */}
      <CommandBar
        isOpen={isCommandBarOpen}
        onClose={() => setIsCommandBarOpen(false)}
        tasks={tasks}
        projects={projects}
        onSelectTask={handleSelectTask}
        onSelectView={setActiveView}
        onSelectTaskViewType={setActiveTaskViewType}
        onNewTask={handleAddNewTaskPrompt}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />
      {/* Toast de erro */}
      {toast && (
        <div
          key={toast.id}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 bg-zinc-900 border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl shadow-black/60 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <span className="text-red-500 text-base leading-none">⚠</span>
          {toast.message}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModalData.isOpen}
        title="Campos Incompletos"
        message={confirmModalData.message || "Atenção: Campos obrigatórios não preenchidos. Se você sair agora, a tarefa incompleta será EXCLUÍDA. Deseja realmente sair?"}
        confirmText="Excluir e Sair"
        cancelText="Voltar à Tarefa"
        onConfirm={() => {
          if (confirmModalData.taskId) {
            handleDeleteTask(confirmModalData.taskId);
          }
          setIsTaskSheetOpen(false);
          setSelectedTask(null);
          setConfirmModalData({ isOpen: false, taskId: null });
        }}
        onCancel={() => {
          setConfirmModalData({ isOpen: false, taskId: null });
        }}
      />
    </div>
  );
}

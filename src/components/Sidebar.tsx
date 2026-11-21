import React from 'react';
import { motion } from 'framer-motion';
import {
  FolderKanban,
  Headset,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Inbox,
  Search,
  Receipt,
  BarChart2,
  Home,
  Share2,
  CheckSquare,
  FolderOpen,
  Briefcase,
  FileSignature,
  LineChart,
  Table2,
  CreditCard,
  PieChart,
  LucideIcon,
} from 'lucide-react';
import { Task, Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePermissoes } from '../lib/permissoes';
import { useNotifications } from '../context/NotificationContext';
import type { NavItemId } from '../lib/navegacao';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** Item do menu correspondente à tela aberta (null = nenhum, ex.: Configurações). */
  activeItem: NavItemId | null;
  onNavigate: (item: NavItemId) => void;
  settingsActive: boolean;
  onOpenSettings: () => void;
  projects: Project[];
  tasks: Task[];
  /** Quantidade de projetos de Marketing, para o contador do item. */
  projetosCount: number;
  onOpenCommandBar: () => void;
}

interface Item {
  id: NavItemId;
  label: string;
  icon: LucideIcon;
  visivel: boolean;
  contador?: number;
}

export default function Sidebar({
  collapsed,
  setCollapsed,
  activeItem,
  onNavigate,
  settingsActive,
  onOpenSettings,
  projects,
  tasks,
  projetosCount,
  onOpenCommandBar,
}: SidebarProps) {
  const { currentUser, logout } = useAuth();
  const { pode, podeAlgum } = usePermissoes();
  const { notifications } = useNotifications();

  const verTarefas = pode('tarefas');

  // Mesma regra da Caixa de entrada: não lidas, importantes, lidas e adiadas vencidas.
  const inboxCount = notifications.filter(n => {
    if (n.userId !== currentUser?.id) return false;
    if (n.status === 'unread' || n.status === 'important' || n.status === 'read') return true;
    return n.status === 'postponed' && !!n.postponedUntil && new Date() >= new Date(n.postponedUntil);
  }).length;

  const myOpenTasks = tasks.filter(t => t.assigneeId === currentUser?.id && t.status !== 'done').length;
  // Posts de rede social ainda não concluídos (aprovado também conta como concluído).
  const openPostsCount = tasks.filter(t =>
    t.labels.some(l => l.name === 'Social Media') && t.status !== 'done' && t.socialMediaApproval?.status !== 'approved'
  ).length;

  const grupos: { titulo: string | null; itens: Item[] }[] = [
    {
      titulo: 'Marketing',
      itens: [
        { id: 'home', label: 'Início', icon: Home, visivel: true },
        { id: 'inbox', label: 'Caixa de entrada', icon: Inbox, visivel: true, contador: inboxCount },
        { id: 'my_tasks', label: 'Minhas tarefas', icon: CheckSquare, visivel: verTarefas, contador: myOpenTasks },
        { id: 'projetos', label: 'Projetos', icon: FolderOpen, visivel: verTarefas, contador: projetosCount },
        { id: 'portfolios', label: 'Portfólios', icon: Briefcase, visivel: verTarefas },
        { id: 'rede_social', label: 'Rede Social', icon: Share2, visivel: verTarefas, contador: openPostsCount },
        { id: 'empreendimentos', label: 'Empreendimentos', icon: FolderKanban, visivel: pode('empreendimentos'), contador: projects.length },
        { id: 'analytics', label: 'Analytics', icon: BarChart2, visivel: pode('analytics') },
      ],
    },
    {
      titulo: 'Comercial',
      itens: [
        { id: 'leads', label: 'Leads', icon: Headset, visivel: pode('crm') },
        { id: 'propostas', label: 'Propostas', icon: FileSignature, visivel: pode('comercial_propostas') },
        { id: 'dashboard_comercial', label: 'Dashboard Comercial', icon: LineChart, visivel: podeAlgum(['comercial_dashboard', 'comercial_movimentos']) },
        { id: 'tabelas_vendas', label: 'Tabelas de Vendas', icon: Table2, visivel: pode('comercial_tabela') },
      ],
    },
    {
      titulo: 'Financeiro',
      itens: [
        { id: 'titulos', label: 'Títulos', icon: Receipt, visivel: pode('financas') },
        { id: 'cartao', label: 'Cartão de crédito', icon: CreditCard, visivel: pode('financas') },
        { id: 'dashboard_financeiro', label: 'Dashboard Financeiro', icon: PieChart, visivel: pode('financas_orcamento') },
      ],
    },
  ];

  const renderItem = (item: Item) => {
    const ativo = activeItem === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        title={collapsed ? item.label : undefined}
        className={`relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          ativo ? 'text-zinc-100' : 'hover:bg-zinc-900/55 hover:text-zinc-200 border border-transparent'
        }`}
      >
        {ativo && (
          <motion.div layoutId="sidebar-active-pill" className="absolute inset-0 bg-zinc-900/80 border border-zinc-800/50 rounded-md" transition={{ duration: 0.18, ease: 'easeOut' }} />
        )}
        <Icon size={14} className={`relative z-10 shrink-0 ${ativo ? 'text-zinc-200' : 'text-zinc-550'}`} />
        {!collapsed && (
          <div className="relative z-10 flex-1 min-w-0 flex items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            {!!item.contador && item.contador > 0 && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                item.id === 'inbox'
                  ? 'text-white bg-blue-500 border-blue-400/20 font-bold'
                  : 'text-zinc-400 bg-zinc-800/40 border-zinc-700/30'
              }`}>
                {item.contador}
              </span>
            )}
          </div>
        )}
        {collapsed && item.id === 'inbox' && inboxCount > 0 && (
          <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-blue-500" />
        )}
      </button>
    );
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
          title={collapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Busca */}
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

      {/* Menus */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 space-y-4 py-2 short:space-y-2.5 short:py-1 select-none scrollbar-thin">
        {grupos.map(grupo => {
          const visiveis = grupo.itens.filter(i => i.visivel);
          if (visiveis.length === 0) return null;
          return (
            <div key={grupo.titulo}>
              {!collapsed ? (
                <div className="text-[10px] font-semibold text-zinc-500 px-3 py-1.5 uppercase tracking-wider font-sans">
                  {grupo.titulo}
                </div>
              ) : (
                <div className="border-t border-zinc-900/80 mx-2 mb-1.5" />
              )}
              <div className="space-y-0.5">{visiveis.map(renderItem)}</div>
            </div>
          );
        })}
      </nav>

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
                onClick={onOpenSettings}
                className={`p-1.5 rounded-md transition-colors ${
                  settingsActive
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

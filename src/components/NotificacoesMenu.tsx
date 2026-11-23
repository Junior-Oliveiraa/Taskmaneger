import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, Clock, Star, Archive, CalendarClock, UserPlus, MessageSquare, Eye, Check,
  RefreshCw, AtSign, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Task, AppNotification } from '../types';

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';
const ACAO = `size-7 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-md text-zinc-400 hover:bg-[#1f1f23] transition ${EASE} ${FOCO}`;

// Ícone por tipo: neutro (a cor fica para "não lida" e "destacada").
const ICONE: Partial<Record<AppNotification['type'], typeof Bell>> = {
  task_assigned: UserPlus,
  assignee_replaced: UserPlus,
  feedback_received: MessageSquare,
  rejected: MessageSquare,
  review_requested: Eye,
  approval_pending: Eye,
  alcada_pending: Eye,
  approved: Check,
  status_changed: RefreshCw,
  properties_changed: RefreshCw,
  reminder: Clock,
  deadline: CalendarClock,
  deadline_changed: CalendarClock,
  deadline_change_requested: CalendarClock,
  deadline_change_rejected: CalendarClock,
  predecessor_done: Check,
  predecessor_late: CalendarClock,
  chat_mention: AtSign,
};

/** Notificações do usuário ainda não arquivadas, e quantas não lidas. */
export function useMinhasNotificacoes() {
  const { currentUser } = useAuth();
  const { notifications } = useNotifications();
  const lista = notifications.filter(n => n.status !== 'viewed' && (n.userId === currentUser?.id || n.userId === 'all'));
  return { lista, naoLidas: lista.filter(n => n.status === 'unread').length };
}

/** Lista de notificações com ações (arquivar, adiar, destacar) sempre visíveis. Usada no sino e na Home. */
export function ListaNotificacoes({ lista, tasks, onSelectTask, className = '' }: {
  lista: AppNotification[];
  tasks: Task[];
  onSelectTask: (t: Task) => void;
  className?: string;
}) {
  const { markAsViewed, postpone, markAsImportant } = useNotifications();

  return (
    <ul className={`overflow-y-auto scrollbar-minimal divide-y divide-zinc-900 ${className}`}>
      {lista.length === 0 ? (
        <li className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
          <span className="size-10 inline-flex items-center justify-center rounded-xl bg-[#1f1f23] border border-white/10">
            <Bell size={18} className="text-zinc-400" aria-hidden />
          </span>
          <p className="mt-3 text-body font-medium text-zinc-200">Tudo em dia</p>
          <p className="mt-1 text-caption text-zinc-400 max-w-[30ch]">Atribuições, aprovações e menções aparecem aqui.</p>
        </li>
      ) : lista.map(n => {
        const destacada = n.status === 'important';
        const naoLida = n.status === 'unread';
        const task = tasks.find(t => t.id === n.taskId);

        let titulo = n.message;
        let descricao = n.details || '';
        if (n.message.includes(':')) {
          const partes = n.message.split(':');
          titulo = partes[0].trim();
          const resto = partes.slice(1).join(':').trim();
          descricao = resto + (descricao ? ' — ' + descricao : '');
        }
        // Atraso crítico: ⚠ vermelho (único caso em que o ícone ganha cor de alerta).
        const critico = n.type === 'deadline' && n.targetId === 'critico';
        if (critico && task) {
          titulo = `Tarefa com atraso crítico · ${n.details || ''}`.replace(/ · $/, '');
          descricao = '';
        }
        const Icone = critico ? AlertTriangle : ICONE[n.type] || Bell;
        const data = new Date(n.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

        return (
          <li key={n.id} className="flex items-start gap-1 px-2 py-1 hover:bg-[#161619] focus-within:bg-[#161619] transition-colors">
            <button
              type="button"
              onClick={() => { if (task) onSelectTask(task); }}
              disabled={!task}
              className={`flex-1 min-w-0 flex items-start gap-3 text-left rounded-md px-2 py-2 disabled:cursor-default ${FOCO}`}
            >
              <span className={`relative mt-0.5 size-7 shrink-0 inline-flex items-center justify-center rounded-lg border ${
                critico ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : naoLida ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-[#1f1f23] border-white/10 text-zinc-400'
              }`}>
                <Icone size={14} aria-hidden />
                {naoLida && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-blue-500" aria-label="Não lida" />}
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className={`text-body truncate ${naoLida || destacada ? 'font-medium text-zinc-100' : 'text-zinc-300'}`}>{titulo}</span>
                  {destacada && <Star size={12} className="shrink-0 self-center text-amber-400 fill-amber-400" aria-label="Destacada" />}
                  <span className="ml-auto shrink-0 text-caption text-zinc-500 tabular-nums">{data}</span>
                </span>
                {descricao && <span className="text-caption text-zinc-400 line-clamp-2">{descricao.replace(/\n/g, ' ')}</span>}
                {task && <span className="mt-1 text-caption text-zinc-500 truncate">{task.title}</span>}
              </span>
            </button>

            <div className="flex items-center pt-1.5">
              <button type="button" aria-label="Arquivar notificação" title="Arquivar" className={`${ACAO} hover:text-zinc-100`} onClick={() => markAsViewed(n.id)}>
                <Archive size={14} aria-hidden />
              </button>
              <button type="button" aria-label="Adiar notificação" title="Adiar" className={`${ACAO} hover:text-zinc-100`} onClick={() => postpone(n.id)}>
                <Clock size={14} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Destacar notificação"
                aria-pressed={destacada}
                title="Destacar"
                className={`${ACAO} ${destacada ? 'text-amber-400' : 'hover:text-amber-400'}`}
                onClick={() => markAsImportant(n.id)}
              >
                <Star size={14} className={destacada ? 'fill-amber-400' : ''} aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BotaoVerTodas({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-7 px-2 -mr-2 rounded-md text-caption font-medium text-zinc-400 hover:text-zinc-100 hover:bg-[#161619] transition ${EASE} ${FOCO}`}
    >
      Ver todas <ArrowRight size={12} aria-hidden />
    </button>
  );
}

/** Painel de notificações do Início (ao lado de Meus projetos). */
export function PainelNotificacoes({ tasks, onSelectTask, onOpenInbox, className = '' }: {
  tasks: Task[];
  onSelectTask: (t: Task) => void;
  onOpenInbox?: () => void;
  className?: string;
}) {
  const { lista, naoLidas } = useMinhasNotificacoes();
  return (
    <section
      aria-labelledby="painel-notificacoes-titulo"
      className={`flex flex-col min-w-0 bg-[#121214] border border-zinc-900 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] overflow-hidden ${className}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900">
        <h2 id="painel-notificacoes-titulo" className="flex items-center gap-2 text-heading font-semibold text-zinc-100">
          Notificações
          {naoLidas > 0 && (
            <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-blue-500/15 text-blue-400 text-caption font-medium tabular-nums">
              {naoLidas} {naoLidas === 1 ? 'nova' : 'novas'}
            </span>
          )}
        </h2>
        {onOpenInbox && <BotaoVerTodas onClick={onOpenInbox} />}
      </header>
      <ListaNotificacoes lista={lista} tasks={tasks} onSelectTask={onSelectTask} className="flex-1 min-h-0 max-h-[420px]" />
    </section>
  );
}

/**
 * Sino do header. O badge mostra as não lidas (some quando zero); o popover
 * traz a mesma lista do painel do Início.
 */
export default function NotificacoesMenu({ tasks, onSelectTask, onOpenInbox }: {
  tasks: Task[];
  onSelectTask: (t: Task) => void;
  onOpenInbox?: () => void;
}) {
  const { lista, naoLidas } = useMinhasNotificacoes();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div className="relative" ref={raiz}>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'}` : 'Notificações'}
        className={`relative size-8 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-lg border border-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-[#161619] transition ${EASE} ${FOCO} ${aberto ? 'bg-[#161619] text-zinc-100' : ''}`}
      >
        <Bell size={15} aria-hidden />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-500 hl-top text-white text-caption leading-none font-semibold tabular-nums" aria-hidden>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 mt-1.5 w-[min(400px,calc(100vw-24px))] bg-[#121214] border border-white/10 rounded-2xl shadow-[0_16px_40px_rgb(0_0_0/0.32)] z-40 animate-dropdown-in origin-top-right overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900">
            <h2 className="text-heading font-semibold text-zinc-100">Notificações</h2>
            {onOpenInbox && <BotaoVerTodas onClick={() => { setAberto(false); onOpenInbox(); }} />}
          </header>
          <ListaNotificacoes
            lista={lista}
            tasks={tasks}
            onSelectTask={t => { setAberto(false); onSelectTask(t); }}
            className="max-h-[min(480px,70dvh)]"
          />
        </div>
      )}
    </div>
  );
}

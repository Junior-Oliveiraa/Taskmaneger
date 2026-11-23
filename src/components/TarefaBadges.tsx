// Badges compartilhados de tarefa: prazo, prioridade e status. Lista, Kanban,
// Calendário e os pickers leem daqui, para a mesma tarefa ter a mesma cara em
// qualquer vista.
//
// Semântica de cor:
// - vermelho = atraso (e só Urgente na prioridade); nenhum status usa vermelho
//   nem ícone de alerta, para o ⚠ significar "prazo estourado".
// - âmbar = vence em breve / hoje.
// - azul é o acento do app (seleção, foco), por isso não pinta prioridade.
import React from 'react';
import {
  AlertTriangle, ChevronsUp, Circle, CircleDashed, Contrast, CirclePause, Clock, RotateCcw, CirclePlay, CheckCircle2, Pen, Type, Clipboard, DollarSign, Share2, Tag as TagIcon, Flame, Equal, ChevronDown, Ellipsis, LucideIcon,
} from 'lucide-react';
import type { TaskPriority, TaskStatus } from '../types';
import { getDueState, rotuloPrazo, rotuloPrazoLista, tooltipPrazo, DueState } from '../lib/prazo';
import { hojeLocal } from '../lib/datas';

// ─── Tipo ────────────────────────────────────────────────────────────

// Nenhum ícone em forma de checkbox: ao lado do título só o checkbox de concluir
// pode parecer um controle.
export const ICONE_TIPO: Record<string, LucideIcon> = {
  Design: Pen, Copy: Type, Tarefa: Clipboard, Orçamento: DollarSign, 'Social Media': Share2,
};

/** Tipo da tarefa (1ª etiqueta): cinza em repouso, na cor do tipo no hover/foco do `group` (linha ou card). */
export function TipoIcone({ etiqueta, size = 14, className = '' }: {
  etiqueta?: { name: string; color: string } | null; size?: number; className?: string;
}) {
  if (!etiqueta) return null;
  const Icone = ICONE_TIPO[etiqueta.name] ?? TagIcon;
  const cor = etiqueta.color.match(/text-[a-z]+-\d+/)?.[0] ?? 'text-zinc-500';
  return (
    <span title={etiqueta.name} role="img" aria-label={`Tipo: ${etiqueta.name}`} className={`shrink-0 ${cor} ${className}`}>
      <Icone size={size} className="text-zinc-400 group-hover:text-inherit group-focus-within:text-inherit transition-colors" aria-hidden />
    </span>
  );
}

// ─── Status ──────────────────────────────────────────────────────────

export const STATUS_INFO: Record<TaskStatus, { label: string; icon: LucideIcon; cor: string; dot: string }> = {
  no_forecast: { label: 'Sem previsão', icon: CircleDashed, cor: 'text-zinc-500', dot: 'bg-zinc-500' },
  todo: { label: 'A fazer', icon: Circle, cor: 'text-zinc-400', dot: 'bg-zinc-400' },
  in_progress: { label: 'Em progresso', icon: Contrast, cor: 'text-blue-400', dot: 'bg-blue-500' },
  paused: { label: 'Pausado', icon: CirclePause, cor: 'text-zinc-400', dot: 'bg-zinc-500' },
  approval: { label: 'Aprovação', icon: Clock, cor: 'text-purple-400', dot: 'bg-purple-500' },
  rework: { label: 'Refação', icon: RotateCcw, cor: 'text-orange-400', dot: 'bg-orange-500' },
  implementation: { label: 'Implementação', icon: CirclePlay, cor: 'text-teal-400', dot: 'bg-teal-400' },
  done: { label: 'Concluído', icon: CheckCircle2, cor: 'text-emerald-400', dot: 'bg-emerald-500' },
};

export const ORDEM_STATUS: TaskStatus[] = ['no_forecast', 'todo', 'in_progress', 'paused', 'approval', 'rework', 'implementation', 'done'];

export function StatusIcone({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.todo;
  const Icon = info.icon;
  // Em progresso: meio círculo preenchido.
  return <Icon
    size={size}
    className={`shrink-0 ${info.cor} ${status === 'in_progress' ? '[&_path]:fill-current' : ''}`}
    aria-hidden
  />;
}

/** Ícone + rótulo do status (o rótulo é obrigatório: o ícone sozinho não basta). */
export function StatusRotulo({ status, size = 14, className = '' }: { status: TaskStatus; size?: number; className?: string }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.todo;
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <StatusIcone status={status} size={size} />
      <span className="truncate">{info.label}</span>
    </span>
  );
}

/** Status em destaque (painel da tarefa): chip na cor do status. */
export function StatusChip({ status, children }: { status: TaskStatus; children?: React.ReactNode }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.todo;
  return (
    <span className={`inline-flex items-center gap-2 h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg bg-current/10 text-body font-medium whitespace-nowrap ${info.cor}`}>
      <StatusIcone status={status} size={14} />
      {info.label}
      {children}
    </span>
  );
}

// ─── Prioridade ──────────────────────────────────────────────────────

/** Ícone e cor de cada nível: os mesmos no painel da tarefa, na Lista, no Kanban e no Cronograma. */
export const PRIORIDADE_INFO: Record<TaskPriority, { label: string; icon: LucideIcon | null; cls: string; cor: string }> = {
  urgent: { label: 'Urgente', icon: Flame, cls: 'text-red-400 bg-red-500/10 border-red-500/20', cor: 'text-red-400' },
  high: { label: 'Alta', icon: ChevronsUp, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20', cor: 'text-orange-400' },
  medium: { label: 'Média', icon: Equal, cls: 'text-zinc-300 bg-transparent border-transparent', cor: 'text-amber-400' },
  low: { label: 'Baixa', icon: ChevronDown, cls: 'text-zinc-400 bg-transparent border-transparent', cor: 'text-sky-400' },
  no_priority: { label: 'Sem prioridade', icon: null, cls: 'text-zinc-500 bg-transparent border-transparent', cor: 'text-zinc-500' },
};

/** Prioridade em destaque (painel da tarefa): ícone e fundo próprios de cada nível. */
export const PRIORIDADE_PILULA: Record<TaskPriority, { icone: LucideIcon; cor: string; pilula: string }> = {
  urgent: { icone: Flame, cor: 'text-red-400', pilula: '!bg-red-500/15 !text-red-400 hover:!bg-red-500/25' },
  high: { icone: ChevronsUp, cor: 'text-orange-400', pilula: '!bg-orange-500/15 !text-orange-400 hover:!bg-orange-500/25' },
  medium: { icone: Equal, cor: 'text-amber-400', pilula: '!bg-amber-500/15 !text-amber-400 hover:!bg-amber-500/25' },
  low: { icone: ChevronDown, cor: 'text-sky-400', pilula: '!bg-sky-500/15 !text-sky-400 hover:!bg-sky-500/25' },
  no_priority: { icone: Ellipsis, cor: 'text-zinc-500', pilula: '' },
};

export const ORDEM_PRIORIDADE: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'no_priority'];

export function IconePrioridade({ prioridade, size = 10 }: { prioridade: TaskPriority; size?: number }) {
  const info = PRIORIDADE_INFO[prioridade];
  const Icon = info?.icon;
  return Icon ? <Icon size={size} className={`shrink-0 ${info.cor}`} aria-hidden /> : null;
}

export function PrioridadeBadge({ prioridade, compacto = false, plano = false }: { prioridade: TaskPriority; compacto?: boolean; plano?: boolean }) {
  const info = PRIORIDADE_INFO[prioridade] ?? PRIORIDADE_INFO.no_priority;
  const Icon = info.icon;
  if (plano) {
    // Ícone na cor do nível + rótulo neutro, sem chip.
    if (!Icon) return <span className="inline-flex items-center text-body text-zinc-400">—<span className="sr-only">Sem prioridade</span></span>;
    return (
      <span className="inline-flex items-center gap-1.5 text-body text-zinc-400 whitespace-nowrap select-none">
        <Icon size={14} className={`shrink-0 ${info.cor}`} aria-hidden />
        {info.label}
      </span>
    );
  }
  if (compacto) {
    // Só o ícone, com rótulo acessível (cards compactos do Kanban/Calendário).
    return Icon ? (
      <span className={`inline-flex items-center shrink-0 ${info.cor}`} title={`Prioridade ${info.label.toLowerCase()}`}>
        <Icon size={13} aria-hidden />
        <span className="sr-only">Prioridade {info.label.toLowerCase()}</span>
      </span>
    ) : null;
  }
  if (prioridade === 'no_priority') {
    return <span className="inline-flex items-center h-5 px-1.5 text-caption text-zinc-500">—<span className="sr-only">Sem prioridade</span></span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded border text-caption whitespace-nowrap select-none ${info.cls}`}>
      {Icon && <Icon size={12} className="shrink-0" aria-hidden />}
      {info.label}
    </span>
  );
}

// ─── Prazo ───────────────────────────────────────────────────────────

const COR_PRAZO: Record<DueState, string> = {
  none: 'text-zinc-500',
  ok: 'text-zinc-400',
  soon: 'text-amber-400',
  today: 'text-amber-400 font-semibold',
  overdue: 'text-red-400 font-medium',
  critical: 'tone-danger-soft font-semibold',
};

const CHIP_PRAZO: Record<DueState, string> = {
  none: 'text-zinc-500 border-transparent',
  ok: 'text-zinc-300 bg-zinc-800/50 border-zinc-700/50',
  soon: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  today: 'text-amber-300 bg-amber-500/15 border-amber-500/30 font-semibold',
  overdue: 'text-red-400 bg-red-500/10 border-red-500/20 font-medium',
  critical: 'tone-danger-soft font-semibold',
};

function rotuloCurto(state: DueState, diff: number | null, daysLate: number, longo: string): string {
  if (state === 'today') return 'Hoje';
  if (state === 'soon') return diff === 1 ? 'Amanhã' : `Em ${diff} dias`;
  if (state === 'overdue' || state === 'critical') return `Atrasada ${daysLate}d`;
  return longo;
}

/**
 * Prazo com a régua de severidade.
 * - `texto`: célula da Lista ("Atrasada há 4 dias").
 * - `chip`: card do Kanban, com borda.
 * - `compacto`: card compacto/Calendário, rótulo curto ("Atrasada 4d").
 */
export function PrazoBadge({ dueDate, status, variante = 'texto', today = hojeLocal(), ocultarSemPrazo = false }: {
  dueDate?: string | null;
  status: TaskStatus;
  variante?: 'texto' | 'chip' | 'compacto' | 'lista';
  today?: string;
  ocultarSemPrazo?: boolean;
}) {
  const info = getDueState(dueDate, status, today);
  if (info.state === 'none' && ocultarSemPrazo) return null;
  if (variante === 'lista') {
    // Lista de Minhas tarefas: texto simples; vermelho só no atraso, sem pílula nem ícone.
    const cor = info.state === 'overdue' || info.state === 'critical' ? 'text-red-400 font-medium'
      : info.state === 'today' ? 'text-amber-400 font-medium'
      : 'text-zinc-400';
    return (
      <span title={tooltipPrazo(dueDate)} className={`whitespace-nowrap tabular-nums text-body ${cor}`}>
        {rotuloPrazoLista(info, dueDate, today)}
      </span>
    );
  }
  const longo = rotuloPrazo(info, dueDate, today);
  const texto = variante === 'texto' ? longo : rotuloCurto(info.state, info.diff, info.daysLate, longo);
  const critico = info.state === 'critical';
  const base = 'inline-flex items-center gap-1 whitespace-nowrap tabular-nums';

  if (variante === 'texto') {
    return (
      <span
        title={tooltipPrazo(dueDate)}
        className={`${base} text-caption ${COR_PRAZO[info.state]} ${critico ? 'h-5 px-1.5 rounded' : ''}`}
      >
        {critico && <AlertTriangle size={12} className="shrink-0" aria-hidden />}
        {texto}
      </span>
    );
  }
  return (
    <span
      title={`${longo} · ${tooltipPrazo(dueDate)}`}
      className={`${base} h-5 px-1.5 rounded border text-caption ${CHIP_PRAZO[info.state]}`}
    >
      {critico && <AlertTriangle size={10} className="shrink-0" aria-hidden />}
      {texto}
    </span>
  );
}

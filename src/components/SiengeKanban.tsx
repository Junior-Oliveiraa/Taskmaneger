import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Hash, DollarSign, Building2, Calendar, Tag, Receipt,
  ChevronRight, AlertTriangle, CheckCircle2, Clock, XCircle,
  Banknote, ArrowRight, Search, SlidersHorizontal, User,
  LayoutGrid, AlignJustify, Check, ChevronDown, Paperclip, Copy, Settings, Table as TableIcon, Repeat,
} from 'lucide-react';
import { SiengeTitle, SiengeStatus, SiengeLote, SiengeFatura, Project, SiengeAlcadaConfig, SiengeMensalidade } from '../types';
import SiengeTitleModal from './SiengeTitleModal';
import SiengeMensalidadeModal from './SiengeMensalidadeModal';
import SiengeMensalidadesList from './SiengeMensalidadesList';
import SiengeTitleTable from './SiengeTitleTable';
import SiengeConfigPanel from './SiengeConfigPanel';
import ReminderBell from './ReminderBell';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { fetchSiengeTitleById } from '../lib/api';
import {
  siengeDaysOverdue, withVencimentoOriginal,
  getPositiveAction, showsRejectAction, notificacaoAlcada, reprovarTitulo,
  EVENTO_ABRIR_TITULO, consumirAberturaTitulo,
} from '../lib/siengeHelpers';
import { SiengeTaxonomy } from '../lib/siengeCategorias';
import MonthFilterDropdown, { MonthFilterValue } from './MonthFilterDropdown';

// Not a real status — titles keep 'aguardando_pagamento' in the data so
// payment/lote logic elsewhere is unaffected. This id only exists to give
// overdue titles their own column between Aguardando and Recusados.
const ATRASADOS_COL = 'atrasados' as const;
type ColumnId = SiengeStatus | typeof ATRASADOS_COL;

function isOverdueAwaitingPayment(title: SiengeTitle): boolean {
  return title.status === 'aguardando_pagamento' && siengeDaysOverdue(title.vencimentoOriginal || title.vencimento) >= 1;
}

interface SiengeKanbanProps {
  titles: SiengeTitle[];
  openLotes: SiengeLote[];
  openFaturas: SiengeFatura[];
  projects: Project[];
  currentProjectFilter: string | null;
  alcadaConfig: SiengeAlcadaConfig;
  onSave: (title: SiengeTitle) => void;
  onDelete: (id: string) => void;
  onSaveAlcadaConfig: (config: SiengeAlcadaConfig) => Promise<void> | void;
  // Presença nos títulos (mesmo sistema das tasks): mapa id→editor e callback para
  // anunciar qual título este usuário tem aberto para edição.
  editingMap?: Record<string, { name: string; avatarUrl?: string; color: string }>;
  onTitlePresence?: (titleId: string | null) => void;
  taxonomy: SiengeTaxonomy;
  onAddCentroCusto: (nome: string) => Promise<void> | void;
  onAddCategoria: (centroCusto: string, categoria: string) => Promise<void> | void;
  onRenameCategoria: (id: string, categoria: string) => Promise<void> | void;
  onDeleteCategoria: (id: string) => Promise<void> | void;
  onAddSubcategoria: (categoriaId: string, subcategoria: string) => Promise<void> | void;
  onDeleteSubcategoria: (id: string) => Promise<void> | void;
  mensalidades: SiengeMensalidade[];
  onSaveMensalidade: (m: SiengeMensalidade) => void;
  onDeleteMensalidade: (id: string) => void;
}

const COLUMNS: { id: ColumnId; label: string; shortLabel: string; color: string; dotColor: string; bg: string; border: string; icon: React.ReactNode }[] = [
  {
    id: 'a_lancar',
    label: 'A Lançar',
    shortLabel: 'A Lançar',
    color: 'text-zinc-400',
    dotColor: 'bg-zinc-500',
    bg: 'bg-zinc-500/5',
    border: 'border-zinc-500/20',
    icon: <Clock size={12} />,
  },
  {
    id: 'aprovacao_1',
    label: 'Aprovação em 1ª Alçada',
    shortLabel: '1ª Alçada',
    color: 'text-sky-400',
    dotColor: 'bg-sky-500',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/20',
    icon: <ChevronRight size={12} />,
  },
  {
    id: 'aprovacao_2',
    label: 'Aprovação em 2ª Alçada',
    shortLabel: '2ª Alçada',
    color: 'text-blue-400',
    dotColor: 'bg-blue-500',
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    icon: <ChevronRight size={12} />,
  },
  {
    id: 'aprovacao_3',
    label: 'Aprovação em 3ª Alçada',
    shortLabel: '3ª Alçada',
    color: 'text-violet-400',
    dotColor: 'bg-violet-500',
    bg: 'bg-violet-500/5',
    border: 'border-violet-500/20',
    icon: <ChevronRight size={12} />,
  },
  {
    id: 'aguardando_pagamento',
    label: 'Aguardando Pagamento',
    shortLabel: 'Aguardando',
    color: 'text-amber-400',
    dotColor: 'bg-amber-500',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    icon: <Banknote size={12} />,
  },
  {
    id: ATRASADOS_COL,
    label: 'Atrasados',
    shortLabel: 'Atrasados',
    color: 'text-orange-400',
    dotColor: 'bg-orange-500',
    bg: 'bg-orange-500/5',
    border: 'border-orange-500/20',
    icon: <AlertTriangle size={12} />,
  },
  {
    id: 'recusados',
    label: 'Recusados',
    shortLabel: 'Recusados',
    color: 'text-red-400',
    dotColor: 'bg-danger-400',
    bg: 'bg-red-500/5',
    border: 'border-red-500/20',
    icon: <XCircle size={12} />,
  },
  {
    id: 'pago',
    label: 'Pago',
    shortLabel: 'Pago',
    color: 'text-emerald-400',
    dotColor: 'bg-emerald-500',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
    icon: <CheckCircle2 size={12} />,
  },
];

function formatCurrencyDisplay(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function isExpired(vencimento?: string): boolean {
  if (!vencimento) return false;
  return new Date(vencimento + 'T00:00:00') < new Date(new Date().toDateString());
}

function isTodayDate(vencimento?: string): boolean {
  if (!vencimento) return false;
  return new Date(vencimento + 'T00:00:00').getTime() === new Date(new Date().toDateString()).getTime();
}

interface TitleCardProps {
  title: SiengeTitle;
  column: typeof COLUMNS[0];
  onClick: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  isDragging: boolean;
  lotes: SiengeLote[];
  onUpdateTitle: (title: SiengeTitle) => void;
  isCompact: boolean;
}

function TitleCard({ title, column, onClick, onDragStart, isDragging, lotes, onUpdateTitle, isCompact }: TitleCardProps) {
  const [isDraggable, setIsDraggable] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [motivo, setMotivo] = useState('');
  const { allUsers } = useAuth();

  const expired = isExpired(title.vencimento);
  const isDueToday = isTodayDate(title.vencimento);
  const isPaid = title.status === 'pago';
  const positiveAction = getPositiveAction(title.status);
  const showReject = showsRejectAction(title.status);
  // Always measured against the first vencimento the title ever had while
  // awaiting payment — a rejection being resolved with a new date doesn't
  // reset how late it already is. Never shown once the title is paid.
  const diasAtraso = isPaid ? 0 : siengeDaysOverdue(title.vencimentoOriginal || title.vencimento);
  const resolvedLoteName = title.loteId ? lotes.find(l => l.id === title.loteId)?.nome : title.lote;
  const assignee = title.assigneeId ? allUsers.find(u => u.id === title.assigneeId) : null;

  const handleTextHover = (hovering: boolean) => setIsDraggable(!hovering);

  let badgeColor = 'bg-zinc-800/60 text-zinc-400'; // Default: cinza (dentro do prazo)
  if (isPaid) {
    badgeColor = 'bg-emerald-900/40 text-emerald-300'; // Verde: pago
  } else if (expired) {
    badgeColor = 'bg-red-900/50 text-red-400 font-bold'; // Vermelho: atrasado e não pago
  } else if (isDueToday) {
    badgeColor = 'bg-amber-900/40 text-amber-300'; // Amarelo: vence hoje
  }

  const handleClick = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return; // If text is selected, don't open modal
    }
    onClick();
  };

  const handlePositiveAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!positiveAction) return;
    onUpdateTitle({ ...title, status: positiveAction.nextStatus });
  };

  const handleRequestReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMotivo('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = () => {
    if (!motivo.trim()) return;
    onUpdateTitle(reprovarTitulo(title, motivo));
    setShowRejectModal(false);
  };

  const rejectModal = showRejectModal && (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { e.stopPropagation(); setShowRejectModal(false); }}
    >
      <div
        className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 flex flex-col gap-3 w-full max-w-[380px] shadow-2xl animate-slide-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-[15px] font-semibold text-zinc-100 flex items-center gap-2">
            <XCircle className="text-red-500" size={16} />
            Recusar Título
          </h3>
          <p className="text-[13px] text-zinc-400 mt-1 leading-relaxed">
            Informe o motivo da recusa. Ele ficará registrado neste título.
          </p>
        </div>
        <textarea
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Descreva o motivo da recusa..."
          rows={3}
          className="w-full bg-zinc-900/60 border border-red-900/50 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-red-500/30 resize-none"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowRejectModal(false)}
            className="px-3 py-1.5 text-[13px] font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmReject}
            disabled={!motivo.trim()}
            className="px-3 py-1.5 text-[13px] font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Confirmar Recusa
          </button>
        </div>
      </div>
    </div>
  );

  if (isCompact) {
    return (
      <>
      <div
        id={`sienge-title-${title.id}`}
        draggable={isDraggable}
        onDragStart={e => {
          if (isDraggable) onDragStart(e, title.id);
        }}
        onClick={handleClick}
        className={`group flex items-center gap-2 bg-[#121214] hover:bg-[#161619] border border-zinc-900/60 hover:border-zinc-800 rounded-md px-2.5 py-1.5 transition-all duration-150 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-0' : ''}`}
      >
        <span
          className="text-xs text-blue-400 font-mono tracking-wide cursor-pointer shrink-0 hover:text-blue-300 transition-colors"
          title={copied ? "Copiado!" : "Copiar Título"}
          onClick={(e) => {
            e.stopPropagation();
            if (title.titulo) {
              navigator.clipboard.writeText(title.titulo);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          onMouseEnter={() => handleTextHover(true)}
          onMouseLeave={() => handleTextHover(false)}
        >
          {title.titulo || '-'}
        </span>

        <span className="flex-1 text-[11px] font-medium text-zinc-200 truncate min-w-0 cursor-text"
          onMouseEnter={() => handleTextHover(true)}
          onMouseLeave={() => handleTextHover(false)}
          title={title.descricao}
        >
          {title.descricao || ''}
        </span>

        {title.vencimento && (
          <span className={`shrink-0 px-1 py-0.5 rounded text-[9px] tracking-wide ${badgeColor}`}>
            {formatDate(title.vencimento)}{diasAtraso > 0 ? ` · ${diasAtraso}d atraso` : ''}
          </span>
        )}

        {(positiveAction || showReject) && (
          <div className="shrink-0 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {positiveAction && (
              <button
                type="button"
                onClick={handlePositiveAction}
                className="flex items-center justify-center w-4 h-4 rounded text-zinc-500 hover:text-emerald-400 transition-colors"
                title={positiveAction.label}
              >
                <CheckCircle2 size={12} />
              </button>
            )}
            {showReject && (
              <button
                type="button"
                onClick={handleRequestReject}
                className="flex items-center justify-center w-4 h-4 rounded text-zinc-500 hover:text-red-400 transition-colors"
                title="Recusar título"
              >
                <XCircle size={12} />
              </button>
            )}
          </div>
        )}

        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <ReminderBell
            reminderDate={title.reminderDate}
            reminderType={title.reminderType}
            size={11}
            align="right"
            disableAutoScroll
            onChange={({ reminderDate, reminderType }) => onUpdateTitle({ ...title, reminderDate, reminderType })}
          />
        </div>
      </div>
      {rejectModal}
      </>
    );
  }

  return (
    <>
    <div
      id={`sienge-title-${title.id}`}
      draggable={isDraggable}
      onDragStart={e => {
        if (isDraggable) onDragStart(e, title.id);
      }}
      onClick={handleClick}
      className={`group relative bg-[#18181b] hover:bg-[#1f1f23] border border-transparent hover:border-zinc-800/80 rounded-xl p-3 cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-black/40 ${isDragging ? 'opacity-0' : ''}`}
    >
      {/* Top Row: Título & Descrição */}
      <div className="flex flex-col mb-3">
        <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-widest mb-0.5">Título</span>
        <div className="flex items-center gap-3">
          <div 
            className="flex items-center gap-1.5 cursor-pointer shrink-0 group/copy"
            title={copied ? "Copiado!" : "Copiar Título"}
            onClick={(e) => {
              e.stopPropagation();
              if (title.titulo) {
                navigator.clipboard.writeText(title.titulo);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            onMouseEnter={() => handleTextHover(true)}
            onMouseLeave={() => handleTextHover(false)}
          >
            <span className={`text-sm font-medium tracking-wide transition-colors ${copied ? 'text-emerald-400' : 'text-zinc-100 group-hover/copy:text-blue-400'}`}>
              {title.titulo || '-'}
            </span>
            {copied ? (
              <Check size={12} className="text-emerald-400 animate-in fade-in zoom-in" />
            ) : (
              <Copy size={12} className="text-blue-400 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
            )}
          </div>
          <span 
            className="text-sm text-zinc-100 font-medium tracking-wide truncate cursor-text"
            onMouseEnter={() => handleTextHover(true)}
            onMouseLeave={() => handleTextHover(false)}
            title={title.descricao}
          >
            {title.descricao || ''}
          </span>
        </div>
      </div>

      {/* Middle Row: Empreendimento, Lote, Vencimento */}
      <div className="flex justify-between items-end mb-3">
        <div className="flex gap-4">
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-widest mb-0.5">Empreendimento:</span>
            <span 
              className="text-xs text-zinc-300 font-normal cursor-text truncate max-w-[90px]"
              onMouseEnter={() => handleTextHover(true)}
              onMouseLeave={() => handleTextHover(false)}
            >
              {title.empreendimento || '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-widest mb-0.5">Lote</span>
            <span 
              className="text-xs text-zinc-300 font-normal cursor-text"
              onMouseEnter={() => handleTextHover(true)}
              onMouseLeave={() => handleTextHover(false)}
            >
              {resolvedLoteName || '-'}
            </span>
          </div>
        </div>
        {title.vencimento && (
          <div className="flex flex-col items-end gap-0.5">
            <div className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border border-transparent ${
              isPaid ? 'border-emerald-500/20' : expired ? 'border-red-500/20' : isDueToday ? 'border-amber-500/20' : 'border-zinc-700/30'
            } ${badgeColor}`}>
              {formatDate(title.vencimento)}
            </div>
            {diasAtraso > 0 && (
              <span className="text-[9px] font-semibold text-red-400/90 tracking-wide">
                {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Row: Valor & Ícones */}
      <div className="flex justify-between items-center pt-2 border-t border-zinc-800/40">
        <span className="text-sm text-zinc-100 font-bold tracking-tight">
          {formatCurrencyDisplay(title.valor)}
        </span>
        <div className="flex items-center gap-2">
          {title.mensalidadeId && (
            <span
              title="Gerado automaticamente por uma mensalidade"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 border-blue-500/25"
            >
              <Repeat size={9} /> Mensalidade
            </span>
          )}
          {(positiveAction || showReject) && (
            <div className="flex items-center gap-0.5">
              {positiveAction && (
                <button
                  type="button"
                  onClick={handlePositiveAction}
                  className="flex items-center justify-center w-5 h-5 rounded text-zinc-500 hover:text-emerald-400 transition-colors"
                  title={positiveAction.label}
                >
                  <CheckCircle2 size={14} />
                </button>
              )}
              {showReject && (
                <button
                  type="button"
                  onClick={handleRequestReject}
                  className="flex items-center justify-center w-5 h-5 rounded text-zinc-500 hover:text-red-400 transition-colors"
                  title="Recusar título"
                >
                  <XCircle size={14} />
                </button>
              )}
            </div>
          )}
          {/* Só o contador chega pela listagem (a coluna `attachments` fica de fora),
              então o clipe é apenas um indicador — o conteúdo abre no modal do título. */}
          {(title.attachmentsCount ?? title.attachments?.length ?? 0) > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 mr-1"
              title={`${title.attachmentsCount ?? title.attachments!.length} anexo(s) — abra o título para visualizar`}
            >
              <Paperclip size={11} />
            </span>
          )}
          {assignee && (
            assignee.avatarUrl ? (
              <img 
                src={assignee.avatarUrl} 
                alt={assignee.name} 
                title={assignee.name}
                className="w-5 h-5 rounded-full object-cover border border-zinc-800"
              />
            ) : (
              <div 
                title={assignee.name}
                className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold border border-zinc-800"
              >
                {assignee.initials}
              </div>
            )
          )}
          {/* Lembrete de Sino */}
          <div onClick={(e) => e.stopPropagation()}>
            <ReminderBell
              reminderDate={title.reminderDate}
              reminderType={title.reminderType}
              size={13}
              showLabel={true}
              align="right"
              disableAutoScroll
              onChange={({ reminderDate, reminderType }) => onUpdateTitle({ ...title, reminderDate, reminderType })}
            />
          </div>
        </div>
      </div>
    </div>
    {rejectModal}
    </>
  );
}

function LoteFilterDropdown({ openLotes, value, onChange }: { openLotes: SiengeLote[], value: string, onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const selectedLote = value === 'all' ? null : openLotes.find(l => l.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all bg-[#121214] border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 min-w-[140px] shadow-sm"
      >
        <span className="truncate flex-1 text-left">{selectedLote ? selectedLote.nome : 'Todos os Lotes'}</span>
        <ChevronDown size={12} className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-[220px] bg-[#1a1a1e] border border-zinc-800 rounded-lg shadow-2xl py-1 z-50 animate-fade-in origin-top-right flex flex-col max-h-[300px] overflow-y-auto no-scrollbar">
          <button
            onClick={() => { onChange('all'); setIsOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${value === 'all' ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'}`}
          >
            <span>Todos os Lotes</span>
            {value === 'all' && <Check size={14} />}
          </button>
          
          {openLotes.length > 0 && <div className="h-px bg-zinc-800/50 my-1 mx-2" />}

          {openLotes.map(lote => (
            <button
              key={lote.id}
              onClick={() => { onChange(lote.id); setIsOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${value === lote.id ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'}`}
            >
              <span className="truncate pr-2 text-left">{lote.nome}</span>
              {value === lote.id && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SiengeKanban({ titles, openLotes, openFaturas, projects, currentProjectFilter, alcadaConfig, onSave, onDelete, onSaveAlcadaConfig, editingMap = {}, onTitlePresence, taxonomy, onAddCentroCusto, onAddCategoria, onRenameCategoria, onDeleteCategoria, onAddSubcategoria, onDeleteSubcategoria, mensalidades, onSaveMensalidade, onDeleteMensalidade }: SiengeKanbanProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState<SiengeTitle | null>(null);
  const [modalInitialStatus, setModalInitialStatus] = useState<SiengeStatus>('a_lancar');
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ColumnId | null>(null);
  const [search, setSearch] = useState('');
  const [isCompact, setIsCompact] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'table' | 'mensalidades'>('kanban');
  const [mensalidadeModalOpen, setMensalidadeModalOpen] = useState(false);
  const [editingMensalidade, setEditingMensalidade] = useState<SiengeMensalidade | null>(null);
  const [filterLoteId, setFilterLoteId] = useState<string | 'all'>('all');
  const [filterMonth, setFilterMonth] = useState<MonthFilterValue>(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const { currentUser } = useAuth();
  const { addNotification } = useNotifications();

  // Horizontal pan state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Notifies the responsible for the alçada level a title just entered.
  // No-op if the status didn't actually change or no responsible is configured.
  const notifyAlcadaIfNeeded = useCallback((title: SiengeTitle, previousStatus?: SiengeStatus) => {
    const notif = notificacaoAlcada(title, previousStatus, alcadaConfig, currentUser?.id || 'system');
    if (notif) addNotification(notif);
  }, [alcadaConfig, currentUser, addNotification]);

  const handleUpdateTitle = useCallback((title: SiengeTitle) => {
    const prev = titles.find(t => t.id === title.id);
    onSave(title);
    notifyAlcadaIfNeeded(title, prev?.status);
    if (editingTitle?.id === title.id) {
      setEditingTitle(title);
    }
  }, [titles, onSave, notifyAlcadaIfNeeded, editingTitle]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: ColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(colId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColId: ColumnId) => {
    e.preventDefault();
    if (!dragId) return;
    // 'atrasados' isn't a real status — dropping there just means "awaiting payment".
    const targetStatus: SiengeStatus = targetColId === ATRASADOS_COL ? 'aguardando_pagamento' : targetColId;
    const dragged = titles.find(t => t.id === dragId);
    if (dragged && dragged.status !== targetStatus) {
      handleUpdateTitle(withVencimentoOriginal({ ...dragged, status: targetStatus, updatedAt: new Date().toISOString() }));
    }
    setDragId(null);
    setDropTarget(null);
  }, [dragId, titles, handleUpdateTitle]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  // Salvamento inline pela tabela — mesma lógica de status change do drag/drop:
  // recalcula vencimentoOriginal quando a situação muda pela edição em linha.
  const handleTableSave = useCallback((title: SiengeTitle) => {
    const prev = titles.find(t => t.id === title.id);
    const next = prev && prev.status !== title.status ? withVencimentoOriginal(title) : title;
    handleUpdateTitle(next);
  }, [titles, handleUpdateTitle]);

  // Presença: anuncia qual título este usuário tem aberto para edição (só títulos já
  // existentes — um título novo ainda não salvo não pode estar em edição por outro).
  useEffect(() => {
    onTitlePresence?.(modalOpen && editingTitle ? editingTitle.id : null);
  }, [modalOpen, editingTitle?.id]);
  // Ao sair da tela do Sienge (desmontar), libera a presença.
  useEffect(() => () => { onTitlePresence?.(null); }, []);

  const openNew = (colId: ColumnId) => {
    setEditingTitle(null);
    setModalInitialStatus(colId === ATRASADOS_COL ? 'aguardando_pagamento' : colId);
    setModalOpen(true);
  };

  const openNewMensalidade = () => {
    setEditingMensalidade(null);
    setMensalidadeModalOpen(true);
  };

  // Horizontal Pan Handlers
  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.kanban-column')) return;
    if (e.deltaY !== 0) {
      document.querySelectorAll('.kanban-column').forEach(col => { (col as HTMLElement).scrollTop += e.deltaY; });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('[draggable]') || target.closest('.cursor-text')) return;
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

  const openEdit = async (title: SiengeTitle) => {
    setIsLoadingTitle(true);
    try {
      const full = await fetchSiengeTitleById(title.id);
      setEditingTitle(full ?? title);
    } catch {
      setEditingTitle(title);
    } finally {
      setIsLoadingTitle(false);
    }
    setModalOpen(true);
  };

  // Pedido vindo da Caixa de entrada: abre o título solicitado (ao montar ou ao vivo).
  useEffect(() => {
    const abrirPendente = () => {
      const id = consumirAberturaTitulo();
      if (!id) return;
      const t = titles.find(x => x.id === id);
      if (t) { openEdit(t); return; }
      fetchSiengeTitleById(id)
        .then(full => { if (full) { setEditingTitle(full); setModalOpen(true); } })
        .catch(console.error);
    };
    abrirPendente();
    window.addEventListener(EVENTO_ABRIR_TITULO, abrirPendente);
    return () => window.removeEventListener(EVENTO_ABRIR_TITULO, abrirPendente);
  }, []);

  const handleSave = (title: SiengeTitle) => {
    handleUpdateTitle(title);
    setModalOpen(false);
    setEditingTitle(null);
  };

  const handleDelete = (id: string) => {
    onDelete(id);
    setModalOpen(false);
    setEditingTitle(null);
  };

  const filteredTitles = useMemo(() => {
    // Despesas de cartão (faturaId preenchido) vivem só dentro da fatura, na aba
    // Cartão de Crédito. O que chega ao kanban pela fatura é o título gerado por
    // ela, que não tem faturaId e por isso passa por aqui normalmente.
    let list = titles.filter(t => !t.faturaId);

    // Filter by project if active
    if (currentProjectFilter) {
      const activeProject = projects.find(p => p.id === currentProjectFilter);
      if (activeProject) {
        list = list.filter(t => t.empreendimento === activeProject.name);
      }
    }

    // Filter by lote if active
    if (filterLoteId !== 'all') {
      list = list.filter(t => t.loteId === filterLoteId);
    }

    // Filter by month if active — usa o vencimento do próprio título.
    if (filterMonth) {
      const monthKey = `${filterMonth.year}-${String(filterMonth.month + 1).padStart(2, '0')}`;
      list = list.filter(t => t.vencimento?.startsWith(monthKey));
    }

    if (!search) return list;
    const lower = search.toLowerCase();
    return list.filter(t =>
      t.titulo.toLowerCase().includes(lower) ||
      (t.empreendimento || '').toLowerCase().includes(lower) ||
      (t.descricao || '').toLowerCase().includes(lower) ||
      (t.lote || '').toLowerCase().includes(lower)
    );
  }, [titles, search, projects, currentProjectFilter, filterLoteId, filterMonth]);

  const lotesForFilter = useMemo(() => {
    if (!filterMonth) return openLotes;
    const monthKey = `${filterMonth.year}-${String(filterMonth.month + 1).padStart(2, '0')}`;
    return openLotes.filter(l => l.vencimento?.startsWith(monthKey));
  }, [openLotes, filterMonth]);

  useEffect(() => {
    if (filterLoteId !== 'all' && !lotesForFilter.some(l => l.id === filterLoteId)) {
      setFilterLoteId('all');
    }
  }, [lotesForFilter, filterLoteId]);

  const totalValue = titles.reduce((sum, t) => sum + t.valor, 0);
  const pendingCount = titles.filter(t => t.status !== 'pago' && t.status !== 'recusados').length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#08080a]">
      <AnimatePresence mode="wait">
      {showConfigPanel ? (
        <SiengeConfigPanel
          key="config"
          alcadaConfig={alcadaConfig}
          onSaveAlcadaConfig={onSaveAlcadaConfig}
          taxonomy={taxonomy}
          onAddCentroCusto={onAddCentroCusto}
          onAddCategoria={onAddCategoria}
          onRenameCategoria={onRenameCategoria}
          onDeleteCategoria={onDeleteCategoria}
          onAddSubcategoria={onAddSubcategoria}
          onDeleteSubcategoria={onDeleteSubcategoria}
          onClose={() => setShowConfigPanel(false)}
        />
      ) : (
      <motion.div
        key="board"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="flex flex-col h-full overflow-hidden"
      >
      {/* Header */}
      <div className="flex items-center justify-between view-pad-x py-4 short:py-2.5 border-b border-zinc-900/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <Receipt size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100">Títulos Sienge</h1>
            <p className="text-[11px] text-zinc-600">
              {titles.length} título{titles.length !== 1 ? 's' : ''} · {pendingCount} em andamento · {formatCurrencyDisplay(totalValue)} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro de Mês */}
          <MonthFilterDropdown
            value={filterMonth}
            onChange={setFilterMonth}
          />
          {/* Filtro de Lote */}
          <LoteFilterDropdown
            openLotes={lotesForFilter}
            value={filterLoteId}
            onChange={setFilterLoteId}
          />
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar título..."
              className="w-48 bg-zinc-900/60 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
            />
          </div>
          {/* Kanban / Tabela toggle */}
          <div className="flex items-center rounded-lg border border-zinc-800/50 bg-zinc-900/40 p-0.5">
            <button
              onClick={() => setViewMode('kanban')}
              title="Visualização em Kanban"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${viewMode === 'kanban' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <LayoutGrid size={12} />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Visualização em Tabela"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${viewMode === 'table' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <TableIcon size={12} />
              <span className="hidden sm:inline">Tabela</span>
            </button>
            <button
              onClick={() => setViewMode('mensalidades')}
              title="Mensalidades (títulos recorrentes)"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${viewMode === 'mensalidades' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Repeat size={12} />
              <span className="hidden sm:inline">Mensalidade</span>
            </button>
          </div>
          {viewMode === 'kanban' && (
            <button
              onClick={() => setIsCompact(v => !v)}
              title={isCompact ? 'Modo Normal' : 'Modo Ultra-Compacto'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${isCompact ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
            >
              {isCompact ? <LayoutGrid size={12} /> : <AlignJustify size={12} />}
              <span className="hidden sm:inline">{isCompact ? 'Normal' : 'Compacto'}</span>
            </button>
          )}
          <button
            onClick={() => setShowConfigPanel(true)}
            title="Configurações de Títulos"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700 transition-all"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={() => viewMode === 'mensalidades' ? openNewMensalidade() : openNew('a_lancar')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
          >
            <Plus size={13} /> {viewMode === 'mensalidades' ? 'Nova Mensalidade' : 'Novo Título'}
          </button>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <SiengeTitleTable
          titles={filteredTitles}
          openLotes={openLotes}
          projects={projects}
          onSave={handleTableSave}
          onOpenFull={openEdit}
          taxonomy={taxonomy}
        />
      )}

      {/* Mensalidades (títulos recorrentes) */}
      {viewMode === 'mensalidades' && (
        <SiengeMensalidadesList
          mensalidades={mensalidades}
          openLotes={openLotes}
          onSave={onSaveMensalidade}
          onDelete={onDeleteMensalidade}
          onEdit={(m) => { setEditingMensalidade(m); setMensalidadeModalOpen(true); }}
        />
      )}

      {/* Kanban Board */}
      {viewMode === 'kanban' && (
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex-1 flex overflow-x-auto min-h-0 view-pad view-gap-sm select-none scrollbar-minimal ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {COLUMNS.map(col => {
          const colTitles = col.id === ATRASADOS_COL
            ? filteredTitles.filter(isOverdueAwaitingPayment)
            : col.id === 'aguardando_pagamento'
              ? filteredTitles.filter(t => t.status === col.id && !isOverdueAwaitingPayment(t))
              : filteredTitles.filter(t => t.status === col.id);
          const colValue = colTitles.reduce((sum, t) => sum + t.valor, 0);
          const isDropTarget = dropTarget === col.id;

          return (
            <div
              key={col.id}
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={e => handleDrop(e, col.id)}
              onDragEnd={handleDragEnd}
              className={`flex flex-col flex-shrink-0 w-[300px] nb:w-[272px] nbs:w-[248px] rounded-xl border transition-all duration-200 overflow-hidden ${
                isDropTarget ? `${col.bg} ${col.border}` : 'border-zinc-900/60 bg-zinc-900/20'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2 sticky top-0 z-10 bg-[#08080a]">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${col.dotColor} shrink-0`} />
                  <span className={`${col.color} shrink-0`}>{col.icon}</span>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                    {col.shortLabel}
                  </span>
                  <span className="text-[10px] text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-full px-1.5 py-0.5 font-mono leading-none">
                    {colTitles.length}
                  </span>
                </div>
                {colValue > 0 && (
                  <span className="text-[10px] font-semibold text-zinc-500 truncate ml-1">
                    {formatCurrencyDisplay(colValue)}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div className={`kanban-column flex flex-col px-2 pb-2 flex-1 overflow-y-auto no-scrollbar ${isCompact ? 'gap-1' : 'gap-2'}`}>
                {colTitles.map(title => (
                  <TitleCard
                    key={title.id}
                    title={title}
                    column={col}
                    lotes={openLotes}
                    onClick={() => openEdit(title)}
                    onDragStart={handleDragStart}
                    isDragging={dragId === title.id}
                    onUpdateTitle={handleUpdateTitle}
                    isCompact={isCompact}
                  />
                ))}

                {/* Add Button */}
                <button
                  onClick={() => openNew(col.id)}
                  className="w-full mt-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/40 rounded-lg transition-colors border border-dashed border-transparent hover:border-zinc-700/50"
                >
                  <Plus size={11} /> Adicionar
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
      </motion.div>
      )}
      </AnimatePresence>

      {isLoadingTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Modal */}
      <SiengeTitleModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTitle(null); }}
        onSave={handleSave}
        onUpdateOnly={handleUpdateTitle}
        onDelete={handleDelete}
        initialData={editingTitle}
        initialStatus={modalInitialStatus}
        openLotes={openLotes}
        openFaturas={openFaturas}
        projects={projects}
        editingBy={editingTitle ? editingMap[editingTitle.id] : undefined}
        taxonomy={taxonomy}
      />

      <SiengeMensalidadeModal
        isOpen={mensalidadeModalOpen}
        onClose={() => { setMensalidadeModalOpen(false); setEditingMensalidade(null); }}
        onSave={(m) => { onSaveMensalidade(m); setMensalidadeModalOpen(false); setEditingMensalidade(null); }}
        initialData={editingMensalidade}
        openLotes={openLotes}
        projects={projects}
        taxonomy={taxonomy}
      />
    </div>
  );
}

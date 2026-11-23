import React, { useState } from 'react';
import { Task, Proposal, BudgetApprovalRound, BudgetProposalDecision, BudgetDecisionStatus } from '../types';
import { Plus, X, Building2, DollarSign, Handshake, Link2, AlignLeft, Check, Edit2, Upload, ExternalLink, Clock, CheckCircle2, XCircle, MessageCircle, Send, Tag, Grid, Loader2, ChevronLeft, ChevronRight, ChevronDown, Lock, RotateCcw, Users, Trash2, Image as ImageIcon } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { uploadToStorage, UPLOAD_LIMITS, sanitizeFileName } from '../lib/storage';

interface BudgetPropertiesProps {
  task: Task;
  saveChange: (updates: Partial<Task>) => void;
  themeColor: string;
}

const formatCurrencyValue = (value: string | undefined) => {
  if (!value) return '-';
  let cleanStr = value.replace(/[^\d.,-]/g, '');
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
  } else if (cleanStr.includes(',')) {
    cleanStr = cleanStr.replace(',', '.');
  }
  const parsed = parseFloat(cleanStr);
  if (isNaN(parsed)) return value;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed);
};

// Junta o campo legado `documento` (string única) com o array novo `documentos`, sem
// duplicar. Toda leitura de links passa por aqui para que propostas antigas continuem
// aparecendo mesmo depois de migrarmos para o array.
const docLinks = (p: Pick<Proposal, 'documento' | 'documentos'>): string[] => {
  const arr = (p.documentos || []).filter(Boolean);
  if (p.documento && !arr.includes(p.documento)) return [p.documento, ...arr];
  return arr;
};

const proposalImages = (p: Pick<Proposal, 'imagens'>): string[] => (p.imagens || []).filter(Boolean);

const linkHref = (doc: string) =>
  doc.startsWith('http') || doc.startsWith('blob:') ? doc : `https://${doc}`;

// URLs de arquivos anexados (blob local ou storage) mostram um rótulo curto em vez do
// endereço enorme; links colados pelo usuário aparecem por inteiro.
const linkLabel = (doc: string) =>
  doc.startsWith('blob:') || doc.includes('/attachments/') ? 'Documento Anexado' : doc;

// Lista somente-leitura de links + grade de prints. Compartilhada entre o card da aba
// Propostas e o resumo da aba Aprovação.
function DocsAndImagesView({ p }: { p: Proposal }) {
  const links = docLinks(p);
  const images = proposalImages(p);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
          <Link2 size={10} /> Documentos / Links
        </label>
        {links.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {links.map((doc, i) => (
              <div key={i} className="flex items-center gap-2">
                <a href={linkHref(doc)} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline truncate flex-1 min-w-0">
                  {linkLabel(doc)}
                </a>
                <a href={linkHref(doc)} target="_blank" rel="noreferrer" className="shrink-0 flex items-center gap-1 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-colors text-[9px] font-semibold uppercase tracking-wider">
                  <ExternalLink size={10} /> Abrir
                </a>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-zinc-600">-</span>
        )}
      </div>

      {images.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <ImageIcon size={10} /> Prints / Imagens
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {images.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden border border-zinc-800/80 hover:border-zinc-600 transition-colors">
                <img src={src} alt={`Print ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Sempre deriva a lista de decisões a partir de proposalIds. Rodadas gravadas antes de
// `decisions` existir (ou com o array incompleto) voltam a funcionar em vez de ficarem
// com botões que não gravam nada.
const decisionsForRound = (round: BudgetApprovalRound): BudgetProposalDecision[] =>
  round.proposalIds.map(proposalId =>
    (round.decisions || []).find(d => d.proposalId === proposalId)
      || { proposalId, status: 'pending' as const }
  );

const DECISION_META: Record<BudgetDecisionStatus, { label: string; text: string; badge: string; card: string }> = {
  pending:  { label: 'Aguardando',  text: 'text-zinc-400',    badge: 'bg-zinc-800/60 border-zinc-700/50',      card: 'border-zinc-800/80' },
  approved: { label: 'Aprovada',    text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25', card: 'border-emerald-500/40' },
  rejected: { label: 'Reprovada',   text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/25',        card: 'border-red-500/30' },
  rework:   { label: 'Refazer',     text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/25',    card: 'border-amber-500/30' },
};

// Rola horizontalmente uma fileira de cards com setas laterais. Usado nas duas abas
// para que as propostas em aprovação apareçam no mesmo formato da aba Propostas.
function CardCarousel({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  // Sem dep array: recalcula após qualquer render (card adicionado/removido, aba trocada)
  // sem precisar que o pai avise a contagem.
  React.useEffect(() => { update(); });

  React.useEffect(() => {
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-carousel-card]');
    const step = (card?.offsetWidth || 300) + 16;
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {canLeft && (
        <>
          <div className="absolute left-0 top-0 bottom-2 w-10 bg-gradient-to-r from-[#08080a] to-transparent z-10 pointer-events-none" />
          <button
            onClick={() => scroll('left')}
            className="absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-[#18181b] border border-zinc-700/80 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 shadow-lg transition-colors"
            title="Anteriores"
          >
            <ChevronLeft size={16} />
          </button>
        </>
      )}
      {canRight && (
        <>
          <div className="absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-[#08080a] to-transparent z-10 pointer-events-none" />
          <button
            onClick={() => scroll('right')}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-[#18181b] border border-zinc-700/80 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 shadow-lg transition-colors"
            title="Ver mais"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
      <div ref={ref} onScroll={update} className="flex overflow-x-auto gap-4 pb-2 no-scrollbar snap-x scroll-smooth">
        {children}
      </div>
    </div>
  );
}

// Resumo somente-leitura com os mesmos campos do card da aba Propostas, para o
// aprovador avaliar sem precisar alternar de aba.
function ProposalSummary({ p }: { p: Proposal }) {
  const Field = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
        {icon} {label}
      </label>
      <span className="text-[11px] text-zinc-300 truncate">{formatCurrencyValue(value)}</span>
    </div>
  );

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field icon={<DollarSign size={10} />} label="Valor" value={p.valor} />
        <Field icon={<Handshake size={10} />} label="Negociado" value={p.negociado} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field icon={<Tag size={10} />} label="Valor Unitário" value={p.valorUnitario} />
        <Field icon={<Grid size={10} />} label="Valor m²" value={p.valorM2} />
      </div>
      <Field icon={<DollarSign size={10} />} label="Valor Mensal" value={p.valorMensal} />

      <DocsAndImagesView p={p} />

      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
          <AlignLeft size={10} /> Observações
        </label>
        <p className="text-[11px] text-zinc-400 whitespace-pre-wrap">{p.observacao || '-'}</p>
      </div>
    </div>
  );
}

// Fora de EditableProposalFields de propósito: definido dentro, era recriado a cada
// tecla digitada (novo tipo de componente a cada render), e o React desmontava e
// remontava o <input>, perdendo o foco — por isso só um caractere entrava por vez.
function EditableField({ icon, label, value, onValue, placeholder }: { icon: React.ReactNode; label: string; value?: string; onValue: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
        {icon} {label}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onValue(e.target.value)}
        placeholder={placeholder}
        className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all w-full"
      />
    </div>
  );
}

// Formulário editável reaproveitando os mesmos campos do ProposalSummary — usado quando
// o solicitante ajusta a proposta direto dentro do fluxo, depois de um "refazer".
function EditableProposalFields({ draft, onChange }: { draft: Proposal; onChange: (patch: Partial<Proposal>) => void }) {
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <EditableField icon={<DollarSign size={10} />} label="Valor" value={draft.valor} onValue={v => onChange({ valor: v })} placeholder="R$ 0,00" />
        <EditableField icon={<Handshake size={10} />} label="Negociado" value={draft.negociado} onValue={v => onChange({ negociado: v })} placeholder="R$ 0,00" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <EditableField icon={<Tag size={10} />} label="Valor Unitário" value={draft.valorUnitario} onValue={v => onChange({ valorUnitario: v })} placeholder="R$ 0,00 / un" />
        <EditableField icon={<Grid size={10} />} label="Valor m²" value={draft.valorM2} onValue={v => onChange({ valorM2: v })} placeholder="R$ 0,00 / m²" />
      </div>
      <EditableField icon={<DollarSign size={10} />} label="Valor Mensal" value={draft.valorMensal} onValue={v => onChange({ valorMensal: v })} placeholder="R$ 0,00 / mês" />

      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
          <Link2 size={10} /> Documentos / Links
        </label>
        {(() => {
          const links = docLinks(draft);
          const rows = links.length > 0 ? links : [''];
          const commit = (next: string[]) => onChange({ documentos: next.filter(l => l.trim() !== ''), documento: '' });
          return (
            <>
              {rows.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={doc}
                    onChange={e => { const next = [...rows]; next[idx] = e.target.value; commit(next); }}
                    placeholder="Link (https://...)"
                    className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all flex-1 min-w-0"
                  />
                  {rows.length > 1 && (
                    <button
                      onClick={() => commit(rows.filter((_, i) => i !== idx))}
                      className="shrink-0 p-1.5 text-zinc-500 hover:text-red-400 bg-zinc-800/50 hover:bg-zinc-800 rounded transition-colors"
                      title="Remover link"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => commit([...links, ''])}
                className="self-start flex items-center gap-1 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                <Plus size={10} /> Adicionar link
              </button>
            </>
          );
        })()}
      </div>

      {proposalImages(draft).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <ImageIcon size={10} /> Prints / Imagens
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {proposalImages(draft).map((src, idx) => (
              <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-zinc-800/80 group/img">
                <img src={src} alt={`Print ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => onChange({ imagens: proposalImages(draft).filter((_, i) => i !== idx) })}
                  className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-zinc-300 hover:text-red-400 opacity-0 group-hover/img:opacity-100 transition-opacity"
                  title="Remover imagem"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
          <AlignLeft size={10} /> Observações
        </label>
        <textarea
          rows={2}
          value={draft.observacao || ''}
          onChange={e => onChange({ observacao: e.target.value })}
          placeholder="Detalhes ou condições da proposta..."
          className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none placeholder-zinc-700 transition-all"
        />
      </div>
    </div>
  );
}

interface ApprovalProposalCardProps {
  proposal: Proposal;
  decision: BudgetProposalDecision;
  canDecide: boolean;
  // Só enquanto a rodada não fechou; depois disso a decisão é definitiva.
  canReopen: boolean;
  // Quem enviou a rodada — pode ajustar e reenviar mesmo sendo também o aprovador.
  isRequester: boolean;
  onDecide: (proposalId: string, status: BudgetDecisionStatus, note?: string) => void;
  onResend: (proposalId: string, updates: Partial<Proposal>) => void;
}

function ApprovalProposalCard({ proposal, decision, canDecide, canReopen, isRequester, onDecide, onResend }: ApprovalProposalCardProps) {
  // Quando preenchido, o card mostra a caixa de justificativa da ação escolhida.
  const [noteFor, setNoteFor] = useState<'rejected' | 'rework' | null>(null);
  const [note, setNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Proposal>(proposal);

  const meta = DECISION_META[decision.status];
  const isPending = decision.status === 'pending';
  // Quem enviou a rodada sempre pode ajustar e reenviar, mesmo quando também é o
  // aprovador (times pequenos onde a mesma pessoa acumula os dois papéis). Fora isso,
  // qualquer um que não seja o aprovador pode fazer o ajuste.
  const canResend = decision.status === 'rework' && (isRequester || !canDecide);

  const cancelNote = () => { setNoteFor(null); setNote(''); };
  const startEditing = () => { setDraft(proposal); setIsEditing(true); };
  const confirmResend = () => {
    const { id, empresa, comments, approvalStatus, approverId, ...rest } = draft;
    onResend(proposal.id, rest);
    setIsEditing(false);
  };

  return (
    <div
      data-carousel-card
      className={`w-[300px] flex-shrink-0 bg-zinc-900/40 border rounded-xl flex flex-col snap-start overflow-hidden transition-colors ${meta.card}`}
    >
      <div className="flex justify-between items-center gap-2 p-3 border-b border-zinc-800/50 bg-zinc-900/60">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={13} className="text-zinc-500 shrink-0" />
          <span className="text-xs font-semibold text-zinc-200 truncate">{proposal.empresa || 'Nova Empresa'}</span>
        </div>
        <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider ${meta.text} ${meta.badge}`}>
          {meta.label}
        </span>
      </div>

      {isEditing ? (
        <>
          <EditableProposalFields draft={draft} onChange={patch => setDraft(prev => ({ ...prev, ...patch }))} />
          <div className="p-3 pt-0 flex items-center gap-2">
            <button onClick={() => setIsEditing(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-1.5 px-3 rounded-md transition-colors text-[10px]">
              Cancelar
            </button>
            <button
              onClick={confirmResend}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
            >
              <Send size={11} /> Reenviar para Aprovação
            </button>
          </div>
        </>
      ) : (
        <>
          <ProposalSummary p={proposal} />

          {decision.note && (
            <div className={`mx-3 mb-3 rounded-md p-2.5 text-[11px] leading-relaxed border-l-2 ${
              decision.status === 'rework'
                ? 'bg-amber-500/5 border border-amber-500/20 border-l-amber-500 text-amber-100'
                : 'bg-red-500/5 border border-red-500/20 border-l-red-500 text-red-100'
            }`}>
              <span className={`block text-[9px] font-bold uppercase tracking-wide mb-1 ${meta.text}`}>
                {decision.status === 'rework' ? 'O que ajustar' : 'Motivo da reprovação'}
              </span>
              {decision.note}
            </div>
          )}

          {canResend && (
            <div className="mx-3 mb-3">
              <button
                onClick={startEditing}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"
              >
                <Edit2 size={12} /> Refazer Proposta
              </button>
            </div>
          )}

          {/* Para 'rework' o card já mostra tudo que importa acima: o selo no cabeçalho,
              a nota "O que ajustar" e o botão de refazer — repetir rótulo+data aqui era
              redundante. Mantido só para aprovada/reprovada, que não têm nota+botão. */}
          {!isPending && decision.status !== 'rework' && (
            <div className={`mt-auto mx-3 mb-3 flex items-center gap-2 px-3 py-2.5 rounded-lg border ${meta.badge}`}>
              {decision.status === 'approved' && <CheckCircle2 size={15} className={meta.text} />}
              {decision.status === 'rejected' && <XCircle size={15} className={meta.text} />}
              <div className="flex flex-col min-w-0 flex-1">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${meta.text}`}>{meta.label}</span>
                {decision.decidedAt && (
                  <span className="text-[10px] text-zinc-500">
                    {new Date(decision.decidedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')}
                  </span>
                )}
              </div>
              {/* Reabre a decisão enquanto a rodada não fechou — evita que um clique errado
                  fique preso sem nenhuma saída. */}
              {canDecide && canReopen && (
                <button
                  onClick={() => onDecide(proposal.id, 'pending')}
                  className="shrink-0 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200 underline underline-offset-2 transition-colors"
                  title="Voltar esta proposta para não analisada"
                >
                  Alterar
                </button>
              )}
            </div>
          )}
        </>
      )}

      {canDecide && isPending && (
        <div className="mt-auto p-3 pt-0">
          {noteFor ? (
            <div className="flex flex-col gap-2 border-t border-zinc-800/50 pt-3">
              <label className={`text-[9px] font-bold uppercase tracking-wider ${noteFor === 'rework' ? 'text-amber-400' : 'text-red-400'}`}>
                {noteFor === 'rework' ? 'O que precisa ser ajustado?' : 'Por que está sendo reprovada?'}
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                autoFocus
                placeholder={noteFor === 'rework' ? 'Descreva os ajustes necessários...' : 'Explique o motivo...'}
                className={`bg-[#1C1C21] border rounded-md p-2 text-[11px] text-zinc-200 min-h-[70px] outline-none resize-y ${
                  noteFor === 'rework' ? 'border-amber-900/50 focus:border-amber-500/50' : 'border-red-900/50 focus:border-red-500/50'
                }`}
              />
              <div className="flex items-center gap-2">
                <button onClick={cancelNote} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-1.5 px-3 rounded-md transition-colors text-[10px]">
                  Cancelar
                </button>
                <button
                  onClick={() => { onDecide(proposal.id, noteFor, note.trim()); cancelNote(); }}
                  disabled={!note.trim()}
                  className={`flex-1 py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    noteFor === 'rework'
                      ? 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                      : 'border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400'
                  }`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 border-t border-zinc-800/50 pt-3">
              <button
                onClick={() => onDecide(proposal.id, 'approved')}
                className="flex items-center justify-center gap-1 py-2 bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors"
              >
                <CheckCircle2 size={12} /> Aprovar
              </button>
              <button
                onClick={() => setNoteFor('rejected')}
                className="flex items-center justify-center gap-1 py-2 bg-red-600/15 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors"
              >
                <XCircle size={12} /> Reprovar
              </button>
              <button
                onClick={() => setNoteFor('rework')}
                className="flex items-center justify-center gap-1 py-2 bg-amber-600/15 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors"
              >
                <RotateCcw size={12} /> Refazer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface BudgetRoundCardProps {
  round: BudgetApprovalRound;
  index: number;
  proposals: Proposal[];
  allUsers: { id: string; name: string; avatarUrl?: string }[];
  currentUserId?: string;
  // Exclusão do fluxo é restrita ao nível de permissão 1.
  canDeleteRound: boolean;
  onDelete: (roundId: string) => void;
  onDecide: (roundId: string, proposalId: string, status: BudgetDecisionStatus, note?: string) => void;
  onResend: (roundId: string, proposalId: string, updates: Partial<Proposal>) => void;
}

function BudgetRoundCard({ round, index, proposals, allUsers, currentUserId, canDeleteRound, onDelete, onDecide, onResend }: BudgetRoundCardProps) {
  const isApprover = currentUserId === round.approverId;
  // Rodadas antigas podem não ter requesterId gravado — nesse caso não há como saber
  // quem enviou, então não travamos o reenvio por falta de dado.
  const isRequester = !round.requesterId || currentUserId === round.requesterId;
  const approver = allUsers.find(u => u.id === round.approverId);
  const decisions = decisionsForRound(round);
  const openCount = decisions.filter(d => d.status === 'pending').length;

  const counts = {
    approved: decisions.filter(d => d.status === 'approved').length,
    rejected: decisions.filter(d => d.status === 'rejected').length,
    rework: decisions.filter(d => d.status === 'rework').length,
  };

  return (
    <div id={`target-proposal-round-${round.id}`} className="bg-zinc-900/30 border border-zinc-800/70 rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="h-6 px-2 rounded bg-[#1C1C21] flex items-center justify-center text-[10px] font-mono text-zinc-500 shrink-0 border border-zinc-800/50">
            RODADA {index + 1}
          </div>
          {openCount > 0 ? (
            <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border text-emerald-400 bg-emerald-500/10 border-emerald-500/25">
              {decisions.length - openCount} de {decisions.length} analisadas
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {counts.approved > 0 && <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border text-emerald-400 bg-emerald-500/10 border-emerald-500/25">{counts.approved} aprovada(s)</span>}
              {counts.rework > 0 && <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border text-amber-400 bg-amber-500/10 border-amber-500/25">{counts.rework} p/ refazer</span>}
              {counts.rejected > 0 && <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border text-red-400 bg-red-500/10 border-red-500/25">{counts.rejected} reprovada(s)</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">
            {new Date(round.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          {canDeleteRound && (
            <button
              onClick={() => onDelete(round.id)}
              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="Excluir fluxo de aprovação"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {approver && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <img src={approver.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
          <span>Aprovador: <strong className="text-zinc-300">{approver.name}</strong></span>
        </div>
      )}

      <CardCarousel>
        {round.proposalIds.map(pid => {
          const p = proposals.find(pr => pr.id === pid);
          if (!p) return null;
          const decision = decisions.find(d => d.proposalId === pid) || { proposalId: pid, status: 'pending' as const };
          return (
            <ApprovalProposalCard
              key={pid}
              proposal={p}
              decision={decision}
              canDecide={isApprover}
              canReopen={openCount > 0}
              isRequester={isRequester}
              onDecide={(proposalId, status, note) => onDecide(round.id, proposalId, status, note)}
              onResend={(proposalId, updates) => onResend(round.id, proposalId, updates)}
            />
          );
        })}
      </CardCarousel>
    </div>
  );
}

export default function BudgetProperties({ task, saveChange, themeColor }: BudgetPropertiesProps) {
  const { currentUser, allUsers } = useAuth();
  const sortedAllUsers = currentUser
    ? [currentUser, ...allUsers.filter(u => u.id !== currentUser.id)]
    : allUsers;
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'propostas' | 'aprovacao'>('propostas');
  const [proposals, setProposals] = useState<Proposal[]>(task.proposals || []);
  const [rounds, setRounds] = useState<BudgetApprovalRound[]>(task.budgetApprovals || []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteRoundConfirmId, setDeleteRoundConfirmId] = useState<string | null>(null);

  // Excluir um fluxo de aprovação apaga histórico e destrava as propostas envolvidas,
  // por isso fica restrito ao nível 1.
  const canDeleteRound = Number(currentUser?.permissionLevel) === 1;
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Batch approval sending
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [selectedApproverId, setSelectedApproverId] = useState<string>('');
  const [isApproverSelectOpen, setIsApproverSelectOpen] = useState(false);
  const [activeMentionForId, setActiveMentionForId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);

  const filteredUsers = allUsers.filter(u => 
    u.name.toLowerCase().includes(mentionQuery.toLowerCase()) && u.id !== currentUser?.id
  );

  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const proposalsRef = React.useRef(proposals);

  React.useEffect(() => {
    proposalsRef.current = proposals;
  }, [proposals]);

  // Flush pending saves immediately if component is unmounted (e.g. user closed task sheet quickly)
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveChange({ proposals: proposalsRef.current });
      }
    };
  }, []); // run only on unmount

  // Sincroniza apenas quando o array cresce/diminui vindo do backend (garante que não perca foco ao digitar)
  React.useEffect(() => {
    if (task.proposals && task.proposals.length !== proposals.length) {
      setProposals(task.proposals);
    }
  }, [task.proposals?.length]);

  // Diferente de `proposals`, aqui sincronizamos por conteúdo e não por tamanho: uma decisão
  // do aprovador muda o conteúdo da rodada sem alterar a contagem, e sem isso a decisão feita
  // em outra máquina só apareceria no próximo refetch. Não há input controlado ligado a
  // `rounds` (a justificativa vive no estado do card), então re-sincronizar não rouba foco.
  const roundsSignature = JSON.stringify(task.budgetApprovals || []);
  React.useEffect(() => {
    setRounds(task.budgetApprovals || []);
  }, [roundsSignature]);

  React.useEffect(() => {
    const handleOpenSection = (e: CustomEvent<{ section: string, targetId?: string }>) => {
      // 'proposal-round-<id>' vem das notificações de aprovação (enviado/decidido) e
      // vive na aba Aprovação; 'proposal-<id>' é a proposta em si, na aba Propostas.
      // Antes isso sempre forçava 'propostas', então clicar numa notificação de
      // aprovação abria a aba errada e a rodada parecia ter sumido.
      if (e.detail.targetId?.startsWith('proposal-round-')) {
        setActiveTab('aprovacao');
      } else if (e.detail.targetId?.startsWith('proposal-')) {
        setActiveTab('propostas');
      }
    };
    window.addEventListener('openTaskSection', handleOpenSection as EventListener);
    return () => window.removeEventListener('openTaskSection', handleOpenSection as EventListener);
  }, []);

  const triggerSave = (updated: Proposal[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveChange({ proposals: updated });
    }, 600);
  };

  const handleAddProposal = () => {
    const newId = `prop-${Date.now()}`;
    const newProposal: Proposal = {
      id: newId,
      empresa: '',
      valor: '',
      negociado: '',
      documento: '',
      observacao: ''
    };
    const updated = [...proposals, newProposal];
    setProposals(updated);
    setEditingId(newId);
    saveChange({ proposals: updated }); // Salva imediatamente ao criar
  };

  const handleUpdateProposal = (id: string, updates: Partial<Proposal>, taskUpdates?: Partial<Task>) => {
    const updated = proposals.map(p => p.id === id ? { ...p, ...updates } : p);
    setProposals(updated); // UI atualiza instantaneamente
    
    if (taskUpdates) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveChange({ proposals: updated, ...taskUpdates });
    } else {
      triggerSave(updated); // Backend salva com debounce
    }
  };

  const handleDeleteProposal = (id: string) => {
    const updated = proposals.filter(p => p.id !== id);
    setProposals(updated);
    saveChange({ proposals: updated }); // Salva imediatamente ao deletar
  };

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadingImgFor, setUploadingImgFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Escreve os links no array novo e zera o campo legado — evita duplicar o mesmo link
  // (que docLinks() juntaria de volta) depois da migração.
  const setDocLinks = (id: string, links: string[]) =>
    handleUpdateProposal(id, { documentos: links.filter(l => l.trim() !== ''), documento: '' });

  const updateDocLinkAt = (p: Proposal, idx: number, value: string) => {
    const links = docLinks(p);
    links[idx] = value;
    handleUpdateProposal(p.id, { documentos: links, documento: '' });
  };

  const addDocLink = (p: Proposal) => setDocLinks(p.id, [...docLinks(p).filter(l => l.trim() !== ''), '']);

  const removeDocLinkAt = (p: Proposal, idx: number) =>
    handleUpdateProposal(p.id, { documentos: docLinks(p).filter((_, i) => i !== idx), documento: '' });

  const handleFileUpload = async (id: string, file: File) => {
    setUploadingFor(id);
    setUploadError(null);
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `proposals/${task.id}/${id}_${Date.now()}_${safeName}`;
      const url = await uploadToStorage('attachments', path, file, UPLOAD_LIMITS.proposal);
      const p = proposalsRef.current.find(x => x.id === id);
      const existing = p ? docLinks(p).filter(l => l.trim() !== '') : [];
      handleUpdateProposal(id, { documentos: [...existing, url], documento: '' });
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao enviar arquivo.');
    } finally {
      setUploadingFor(null);
    }
  };

  // Aceita um ou mais prints/imagens do computador. Cada arquivo vale no máximo 1MB;
  // tudo vira link no Storage para não inchar a linha da tarefa no banco.
  const handleImageUpload = async (id: string, files: FileList | File[]) => {
    setUploadingImgFor(id);
    setUploadError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) throw new Error('Selecione apenas imagens.');
        const safeName = sanitizeFileName(file.name);
        const path = `proposals/${task.id}/${id}_img_${Date.now()}_${safeName}`;
        urls.push(await uploadToStorage('attachments', path, file, UPLOAD_LIMITS.proposalImage));
      }
      const p = proposalsRef.current.find(x => x.id === id);
      handleUpdateProposal(id, { imagens: [...(p ? proposalImages(p) : []), ...urls] });
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao enviar imagem.');
    } finally {
      setUploadingImgFor(null);
    }
  };

  const removeImageAt = (p: Proposal, idx: number) =>
    handleUpdateProposal(p.id, { imagens: proposalImages(p).filter((_, i) => i !== idx) });

  // Print colado (Ctrl+V) em qualquer campo do card de edição vira imagem da proposta,
  // igual ao upload manual. Só age no card que está de fato em edição — colar em outro
  // lugar da página (ex. campo de comentário) não deve disparar upload.
  const handlePasteImages = (id: string, e: React.ClipboardEvent) => {
    if (editingId !== id) return;
    const files = Array.from(e.clipboardData?.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length === 0) return;
    e.preventDefault();
    handleImageUpload(id, files);
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>, proposalId: string) => {
    const val = e.target.value;
    setCommentInputs(prev => ({ ...prev, [proposalId]: val }));

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPosition);
    
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_ ]*)$/);
    if (match) {
      setActiveMentionForId(proposalId);
      setMentionQuery(match[1]);
    } else {
      setActiveMentionForId(null);
    }
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, proposalId: string) => {
    if (activeMentionForId === proposalId && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredUsers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedIndex = Math.max(0, mentionIndex);
        handleMentionSelect(filteredUsers[selectedIndex], proposalId);
        return;
      }
      if (e.key === 'Escape') {
        setActiveMentionForId(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddComment(proposalId);
    }
  };

  const handleMentionSelect = (user: any, proposalId: string) => {
    const textarea = document.getElementById(`comment-input-${proposalId}`) as HTMLTextAreaElement;
    if (!textarea) return;

    const text = commentInputs[proposalId] || '';
    const cursorPosition = textarea.selectionStart || 0;
    const textBeforeCursor = text.substring(0, cursorPosition);
    const textAfterCursor = text.substring(cursorPosition);
    
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    if (lastAtPos === -1) return;

    const newTextBefore = textBeforeCursor.substring(0, lastAtPos);
    
    const newText = `${newTextBefore}@${user.name} ${textAfterCursor}`;
    setCommentInputs(prev => ({ ...prev, [proposalId]: newText }));
    setActiveMentionForId(null);
    setMentionQuery('');
    setMentionIndex(-1);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = lastAtPos + user.name.length + 2;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleAddComment = (proposalId: string) => {
    const text = commentInputs[proposalId]?.trim();
    if (!text) return;
    
    const newComment = {
      id: `comment-${Date.now()}`,
      userId: currentUser?.id,
      userName: currentUser?.name || 'Usuário',
      content: text,
      createdAt: new Date().toISOString()
    };

    const targetProposal = proposals.find(p => p.id === proposalId);
    if (!targetProposal) return;

    const updatedComments = [...(targetProposal.comments || []), newComment];
    handleUpdateProposal(proposalId, { comments: updatedComments });

    allUsers.forEach(user => {
      if (user.id !== currentUser?.id && text.includes(`@${user.name}`)) {
        addNotification({
          userId: user.id,
          actorId: currentUser?.id || '',
          taskId: task.id,
          type: 'chat_mention',
          message: `${currentUser?.name} mencionou você no chat da proposta da empresa "${targetProposal.empresa || 'Nova Empresa'}" na tarefa "${task.title}"`,
          targetId: `proposal-${proposalId}`
        });
      }
    });
    
    setCommentInputs(prev => ({ ...prev, [proposalId]: '' }));
    setActiveMentionForId(null);
  };

  const formatCurrency = formatCurrencyValue;

  const roundsNewestFirst = [...rounds].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Última decisão que recai sobre a proposta — define o selo e o bloqueio de edição.
  const latestDecisionFor = (proposalId: string): BudgetProposalDecision | null => {
    const round = roundsNewestFirst.find(r => r.proposalIds.includes(proposalId));
    if (!round) return null;
    return decisionsForRound(round).find(d => d.proposalId === proposalId) || null;
  };

  // Uma vez enviada para aprovação, a proposta fica travada na aba Propostas
  // permanentemente — o ajuste de um "refazer" acontece dentro do próprio fluxo
  // (card da rodada), não voltando a ficar editável aqui.
  const isProposalLocked = (proposalId: string) => !!latestDecisionFor(proposalId);

  // Rodada ainda com alguma proposta sem decisão: bloqueia novo envio.
  const activePendingRound = rounds.find(r => decisionsForRound(r).some(d => d.status === 'pending'));

  // Só propostas nunca enviadas entram numa rodada nova — uma vez travada, o único
  // caminho de volta é o ajuste dentro do próprio fluxo (ver isProposalLocked acima).
  const sendableProposals = proposals.filter(p => !isProposalLocked(p.id));

  const saveRounds = (updated: BudgetApprovalRound[], taskUpdates?: Partial<Task>) => {
    setRounds(updated);
    saveChange({ budgetApprovals: updated, ...(taskUpdates || {}) });
  };

  const openSendForm = () => {
    setSelectedProposalIds([]);
    setSelectedApproverId('');
    setIsSendingBatch(true);
  };

  const closeSendForm = () => {
    setIsSendingBatch(false);
    setSelectedProposalIds([]);
    setSelectedApproverId('');
  };

  const handleSendBatch = () => {
    if (selectedProposalIds.length === 0 || !selectedApproverId) return;
    const newRound: BudgetApprovalRound = {
      id: `budground-${Date.now()}`,
      proposalIds: selectedProposalIds,
      approverId: selectedApproverId,
      requesterId: currentUser?.id,
      decisions: selectedProposalIds.map(proposalId => ({ proposalId, status: 'pending' as const })),
      createdAt: new Date().toISOString()
    };

    const taskUpdates: Partial<Task> = {};
    if (task.status !== 'approval') taskUpdates.status = 'approval';

    saveRounds([newRound, ...rounds], Object.keys(taskUpdates).length > 0 ? taskUpdates : undefined);

    addNotification({
      userId: selectedApproverId,
      actorId: currentUser?.id || '',
      taskId: task.id,
      type: 'review_requested',
      message: 'Aprovação de Orçamento',
      details: `Você foi selecionado para aprovar ${selectedProposalIds.length} proposta(s) na tarefa "${task.title}".`,
      targetId: `proposal-round-${newRound.id}`
    });

    closeSendForm();
  };

  const handleDeleteRound = (roundId: string) => {
    // Só remove a rodada. O status da tarefa é preservado de propósito: reverter
    // automaticamente adivinharia o estado anterior e poderia desfazer algo já em andamento.
    saveRounds(rounds.filter(r => r.id !== roundId));
  };

  const handleDecide = (roundId: string, proposalId: string, status: BudgetDecisionStatus, note?: string) => {
    const now = new Date().toISOString();

    const updated = rounds.map(r => {
      if (r.id !== roundId) return r;
      const decisions = decisionsForRound(r).map(d => {
        if (d.proposalId !== proposalId) return d;
        // "Alterar" (correção antes de fechar) limpa a justificativa — não é um ciclo
        // completo, só um clique desfeito.
        if (status === 'pending') return { proposalId, status: 'pending' as const };
        return { ...d, status, note, decidedAt: now, decidedBy: currentUser?.id };
      });
      const stillOpen = decisions.some(d => d.status === 'pending');
      return { ...r, decisions, resolvedAt: stillOpen ? undefined : now };
    });

    // A rodada só fecha quando todas as propostas foram analisadas — até lá o status da
    // tarefa não muda, senão ela ficaria pulando de estado a cada clique do aprovador.
    const round = updated.find(r => r.id === roundId);
    const decisions = round ? decisionsForRound(round) : [];
    const stillOpen = decisions.some(d => d.status === 'pending');

    let taskUpdates: Partial<Task> | undefined;
    if (!stillOpen) {
      if (decisions.some(d => d.status === 'rework')) {
        // Qualquer "refazer" tem precedência: há proposta a ajustar antes de seguir.
        taskUpdates = { status: 'rework' };
      } else if (decisions.some(d => d.status === 'approved')) {
        taskUpdates = { status: 'implementation' };
      } else {
        // Todas reprovadas: nada aproveitável, volta para o início.
        taskUpdates = { status: 'todo' };
      }
    }

    saveRounds(updated, taskUpdates);

    const notifyTarget = round?.requesterId || task.assigneeId;
    if (!stillOpen && notifyTarget) {
      const approved = decisions.filter(d => d.status === 'approved').length;
      const rework = decisions.filter(d => d.status === 'rework').length;
      const rejected = decisions.filter(d => d.status === 'rejected').length;
      const parts = [
        approved > 0 ? `${approved} aprovada(s)` : null,
        rework > 0 ? `${rework} para refazer` : null,
        rejected > 0 ? `${rejected} reprovada(s)` : null,
      ].filter(Boolean).join(', ');

      // Espelha a mesma precedência aplicada ao status da tarefa.
      const headline = rework > 0
        ? 'Orçamento precisa de ajustes'
        : approved > 0
        ? 'Orçamento Aprovado'
        : 'Orçamento Reprovado';

      addNotification({
        userId: notifyTarget,
        actorId: currentUser?.id || '',
        message: headline,
        details: `As propostas da tarefa "${task.title}" foram avaliadas: ${parts}.`,
        type: rework === 0 && approved > 0 ? 'approved' : 'rejected',
        taskId: task.id,
        targetId: `proposal-round-${roundId}`
      });
    }
  };

  // Ajusta a proposta direto no fluxo (depois de um "refazer") e abre uma rodada nova
  // só para ela — a rodada antiga permanece fechada como está, e a lista de rodadas
  // (RODADA 1, RODADA 2...) já funciona como o histórico de quando cada ajuste foi feito.
  const handleResendProposal = (roundId: string, proposalId: string, updates: Partial<Proposal>) => {
    const now = new Date().toISOString();
    const oldRound = rounds.find(r => r.id === roundId);
    if (!oldRound) return;

    const updatedProposals = proposals.map(p => p.id === proposalId ? { ...p, ...updates } : p);
    setProposals(updatedProposals);

    const newRound: BudgetApprovalRound = {
      id: `budground-${Date.now()}`,
      proposalIds: [proposalId],
      approverId: oldRound.approverId,
      requesterId: currentUser?.id,
      decisions: [{ proposalId, status: 'pending' }],
      createdAt: now
    };
    const updatedRounds = [newRound, ...rounds];
    setRounds(updatedRounds);

    saveChange({ proposals: updatedProposals, budgetApprovals: updatedRounds, status: 'approval' });

    addNotification({
      userId: oldRound.approverId,
      actorId: currentUser?.id || '',
      taskId: task.id,
      type: 'review_requested',
      message: 'Proposta Ajustada',
      details: `A proposta da empresa "${updatedProposals.find(p => p.id === proposalId)?.empresa || 'Nova Empresa'}" foi ajustada e reenviada para sua aprovação na tarefa "${task.title}".`,
      targetId: `proposal-round-${newRound.id}`
    });
  };

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 mb-4">
        <div className="flex">
          <button
            onClick={() => setActiveTab('propostas')}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === 'propostas' ? `${themeColor} border-b-2 border-current` : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Propostas
          </button>
          <button
            onClick={() => setActiveTab('aprovacao')}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === 'aprovacao' ? `${themeColor} border-b-2 border-current` : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Aprovação
          </button>
        </div>
        {activeTab === 'propostas' && (
          <button
            onClick={handleAddProposal}
            className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-md text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <Plus size={12} /> Adicionar Proposta
          </button>
        )}
      </div>

      {activeTab === 'propostas' && (
        <div className="flex flex-col gap-4">
          <CardCarousel>
            {proposals.map(p => (
              <div
                id={`target-proposal-${p.id}`}
                key={p.id}
                data-carousel-card
                onPaste={(e) => handlePasteImages(p.id, e)}
                className="w-[300px] flex-shrink-0 bg-zinc-900/40 border border-zinc-800/80 rounded-xl flex flex-col relative group snap-start transition-all hover:border-zinc-700/80 overflow-hidden"
              >
                {/* Header */}
                {(() => {
                  const isLocked = isProposalLocked(p.id);
                  const decision = latestDecisionFor(p.id);

                  return (
                <div className="flex justify-between items-center p-3 border-b border-zinc-800/50 bg-zinc-900/60 relative">
                  <div className="flex items-center gap-2 max-w-[65%]">
                    <Building2 size={13} className="text-zinc-500 flex-shrink-0" />
                    {editingId === p.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={p.empresa}
                        onChange={(e) => handleUpdateProposal(p.id, { empresa: e.target.value })}
                        placeholder="Nome da Empresa"
                        className="bg-transparent text-xs font-semibold text-zinc-200 outline-none placeholder-zinc-600 w-full"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-zinc-200 truncate pr-2">
                        {p.empresa || 'Nova Empresa'}
                      </span>
                    )}

                    {/* Status somente leitura — a decisão acontece na aba Aprovação */}
                    {decision && (
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border whitespace-nowrap ${DECISION_META[decision.status].text} ${DECISION_META[decision.status].badge}`}>
                        {decision.status === 'pending' && <Clock size={10} />}
                        {decision.status === 'approved' && <CheckCircle2 size={10} />}
                        {decision.status === 'rejected' && <XCircle size={10} />}
                        {decision.status === 'rework' && <RotateCcw size={10} />}
                        <span className="text-[9px] font-semibold uppercase tracking-wider">
                          {decision.status === 'pending' ? 'Em Aprovação' : DECISION_META[decision.status].label}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isLocked ? (
                      <div className="flex items-center gap-1 text-zinc-500 px-1.5 py-1" title="Enviada para aprovação — só pode ser editada se o aprovador marcar &quot;Refazer&quot;">
                        <Lock size={12} />
                      </div>
                    ) : (
                      <>
                        {editingId !== p.id && (
                          <button
                            onClick={() => setEditingId(p.id)}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-md flex items-center justify-center"
                            title="Editar proposta"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirmId(p.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors p-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-md flex items-center justify-center"
                          title="Remover proposta"
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                  );
                })()}

                {/* Form Body */}
                <div className="p-3 flex flex-col gap-3">
                  {/* Row 1: Valor e Negociado */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign size={10} /> Valor
                      </label>
                      {editingId === p.id ? (
                        <input 
                          type="text" 
                          value={p.valor} 
                          onChange={(e) => handleUpdateProposal(p.id, { valor: e.target.value })} 
                          placeholder="R$ 0,00" 
                          className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all" 
                        />
                      ) : (
                        <span className="text-[11px] text-zinc-300 truncate">{formatCurrency(p.valor)}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <Handshake size={10} /> Negociado
                      </label>
                      {editingId === p.id ? (
                        <input 
                          type="text" 
                          value={p.negociado} 
                          onChange={(e) => handleUpdateProposal(p.id, { negociado: e.target.value })} 
                          placeholder="R$ 0,00" 
                          className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all" 
                        />
                      ) : (
                        <span className="text-[11px] text-zinc-300 truncate">{formatCurrency(p.negociado)}</span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Valor Unitário e Valor m2 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <Tag size={10} /> Valor Unitário
                      </label>
                      {editingId === p.id ? (
                        <input 
                          type="text" 
                          value={p.valorUnitario || ''} 
                          onChange={(e) => handleUpdateProposal(p.id, { valorUnitario: e.target.value })} 
                          placeholder="R$ 0,00 / un" 
                          className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all" 
                        />
                      ) : (
                        <span className="text-[11px] text-zinc-300 truncate">{formatCurrency(p.valorUnitario)}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <Grid size={10} /> Valor m²
                      </label>
                      {editingId === p.id ? (
                        <input 
                          type="text" 
                          value={p.valorM2 || ''} 
                          onChange={(e) => handleUpdateProposal(p.id, { valorM2: e.target.value })} 
                          placeholder="R$ 0,00 / m²" 
                          className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all" 
                        />
                      ) : (
                        <span className="text-[11px] text-zinc-300 truncate">{formatCurrency(p.valorM2)}</span>
                      )}
                    </div>
                  </div>

                  {/* Row 2b: Valor Mensal */}
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign size={10} /> Valor Mensal
                      </label>
                      {editingId === p.id ? (
                        <input 
                          type="text" 
                          value={p.valorMensal || ''} 
                          onChange={(e) => handleUpdateProposal(p.id, { valorMensal: e.target.value })} 
                          placeholder="R$ 0,00 / mês" 
                          className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all" 
                        />
                      ) : (
                        <span className="text-[11px] text-zinc-300 truncate">{formatCurrency(p.valorMensal)}</span>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Documentos / Links + Prints */}
                  {editingId === p.id ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                          <Link2 size={10} /> Documentos / Links
                        </label>
                        {(() => {
                          const links = docLinks(p);
                          const rows = links.length > 0 ? links : [''];
                          return rows.map((doc, idx) => (
                            <div key={idx} className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={doc}
                                onChange={(e) => updateDocLinkAt(p, idx, e.target.value)}
                                placeholder="Link (https://...)"
                                className="bg-zinc-950/50 border border-zinc-800/80 rounded p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-700 transition-all flex-1 min-w-0"
                              />
                              {rows.length > 1 && (
                                <button
                                  onClick={() => removeDocLinkAt(p, idx)}
                                  className="shrink-0 p-1.5 text-zinc-500 hover:text-red-400 bg-zinc-800/50 hover:bg-zinc-800 rounded transition-colors"
                                  title="Remover link"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          ));
                        })()}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => addDocLink(p)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
                          >
                            <Plus size={10} /> Adicionar link
                          </button>
                          <label className={`flex items-center gap-1.5 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors ${uploadingFor === p.id ? 'opacity-60 pointer-events-none' : ''}`}>
                            {uploadingFor === p.id ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                            {uploadingFor === p.id ? '...' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleFileUpload(p.id, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                          <ImageIcon size={10} /> Prints / Imagens
                          <span className="text-zinc-600 normal-case font-normal tracking-normal">(máx. 1MB cada · Ctrl+V para colar)</span>
                        </label>
                        {proposalImages(p).length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {proposalImages(p).map((src, idx) => (
                              <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-zinc-800/80 group/img">
                                <img src={src} alt={`Print ${idx + 1}`} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => removeImageAt(p, idx)}
                                  className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-zinc-300 hover:text-red-400 opacity-0 group-hover/img:opacity-100 transition-opacity"
                                  title="Remover imagem"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className={`flex items-center justify-center gap-1.5 px-2 py-2 bg-zinc-800/50 hover:bg-zinc-800 border border-dashed border-zinc-700 rounded cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors ${uploadingImgFor === p.id ? 'opacity-60 pointer-events-none' : ''}`}>
                          {uploadingImgFor === p.id ? <Loader2 size={10} className="animate-spin" /> : <ImageIcon size={10} />}
                          {uploadingImgFor === p.id ? 'Enviando...' : 'Adicionar print(s) / imagem(ns)'}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleImageUpload(p.id, e.target.files);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {uploadError && uploadingFor === null && uploadingImgFor === null && (
                        <p className="text-[10px] text-red-400 -mt-1">{uploadError}</p>
                      )}
                    </>
                  ) : (
                    <DocsAndImagesView p={p} />
                  )}

                  {/* Row 4: Observação */}
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                      <AlignLeft size={10} /> Observações
                    </label>
                    {editingId === p.id ? (
                      <textarea 
                        rows={2}
                        value={p.observacao} 
                        onChange={(e) => handleUpdateProposal(p.id, { observacao: e.target.value })} 
                        placeholder="Detalhes ou condições da proposta..." 
                        className="bg-zinc-950/50 border border-zinc-800/80 rounded flex-1 p-1.5 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none placeholder-zinc-700 transition-all" 
                      />
                    ) : (
                      <p className="text-[11px] text-zinc-400 line-clamp-3">
                        {p.observacao || '-'}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {editingId === p.id && (
                    <div className="mt-2 pt-3 border-t border-zinc-800/50 flex justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className={`flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded text-[11px] font-semibold text-white transition-colors ${themeColor.replace('text-', 'bg-').split('/')[0]} hover:opacity-90`}
                      >
                        <Check size={12} /> Salvar Proposta
                      </button>
                    </div>
                  )}

                  {/* Chat Section */}
                  <div className="mt-1 border-t border-zinc-800/50 pt-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      <MessageCircle size={10} /> Chat da Proposta
                    </div>
                    
                    {/* Comments List */}
                    <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto no-scrollbar">
                      {p.comments && p.comments.length > 0 ? (
                        p.comments.map(c => (
                          <div key={c.id} className="flex gap-2 bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/30">
                            <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">
                              {c.userName?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold text-zinc-300">{c.userName}</span>
                              <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug break-words">
                                {(() => {
                                  if (!allUsers || allUsers.length === 0) return c.content;
                                  const names = allUsers.map(u => u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                                  const regex = new RegExp(`(@(?:${names.join('|')}))`, 'g');
                                  return c.content.split(regex).map((part, i) => {
                                    if (part.startsWith('@') && allUsers.some(u => `@${u.name}` === part)) {
                                      return <span key={i} className={`font-semibold ${themeColor}`}>{part}</span>;
                                    }
                                    return <React.Fragment key={i}>{part}</React.Fragment>;
                                  });
                                })()}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-zinc-600 italic px-1">Nenhum comentário ainda.</div>
                      )}
                    </div>

                    {/* Chat Input */}
                    <div className="flex items-end gap-1.5 mt-1 relative">
                      <textarea
                        id={`comment-input-${p.id}`}
                        rows={1}
                        value={commentInputs[p.id] || ''}
                        onChange={(e) => handleCommentChange(e, p.id)}
                        onKeyDown={(e) => handleCommentKeyDown(e, p.id)}
                        placeholder="Adicionar comentário..."
                        className="flex-1 bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-2 text-[10px] text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none min-h-[32px] max-h-[80px]"
                      />
                      
                      {activeMentionForId === p.id && filteredUsers.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#18181b] border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
                          {filteredUsers.map((u, i) => (
                            <div
                              key={u.id}
                              onClick={() => handleMentionSelect(u, p.id)}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                                i === mentionIndex || (mentionIndex === -1 && i === 0)
                                  ? 'bg-zinc-800'
                                  : 'hover:bg-zinc-800/60'
                              }`}
                            >
                              <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                              <span className="text-xs text-zinc-300 font-medium">{u.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => handleAddComment(p.id)}
                        disabled={!commentInputs[p.id]?.trim()}
                        className={`p-2 rounded-lg transition-colors shrink-0 ${
                          commentInputs[p.id]?.trim() 
                            ? 'bg-blue-600 text-white hover:bg-blue-500' 
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            <button
              onClick={handleAddProposal}
              data-carousel-card
              className="w-[300px] flex-shrink-0 flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-800 rounded-xl p-4 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/30 transition-all min-h-[160px] snap-start"
            >
              <Plus size={18} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-center">Adicionar Proposta</span>
            </button>
          </CardCarousel>
        </div>
      )}

      {activeTab === 'aprovacao' && (
        <div className="flex flex-col gap-5">
          {!isSendingBatch && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Fluxo de Aprovação</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5">Envie um conjunto de propostas — o aprovador decide cada uma separadamente.</p>
              </div>
              {/* O selo "Aguardando" é só informativo: mesmo com uma rodada em aberto,
                  ainda é possível abrir uma nova rodada para as propostas que nunca foram
                  enviadas (sendableProposals já exclui tudo que está travado em algum fluxo). */}
              <div className="flex items-center gap-2 flex-wrap">
                {activePendingRound && (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-3 py-1.5 rounded-md text-[11px] font-semibold">
                    <Clock size={12} /> Aguardando {allUsers.find(u => u.id === activePendingRound.approverId)?.name || 'aprovador'}
                  </div>
                )}
                {sendableProposals.length > 0 && (
                  <button
                    onClick={() => openSendForm()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-md text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
                  >
                    <Send size={12} /> Enviar Propostas para Aprovação
                  </button>
                )}
              </div>
            </div>
          )}

          {isSendingBatch && (
            <div className="flex flex-col gap-4 bg-[#0a0a0c] border border-zinc-800/80 p-5 rounded-lg animate-fade-in">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Nova Rodada de Aprovação</h4>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Selecione as Propostas</label>
                <div className="flex flex-col gap-1.5">
                  {sendableProposals.length === 0 && (
                    <div className="text-xs text-zinc-500 italic px-1">Nenhuma proposta disponível — as demais já estão em algum fluxo de aprovação.</div>
                  )}
                  {sendableProposals.map(p => {
                    const isChecked = selectedProposalIds.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setSelectedProposalIds(prev => isChecked ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${isChecked ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800/70 hover:border-zinc-700'}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'}`}>
                            {isChecked && <Check size={11} className="text-white" />}
                          </div>
                          <Building2 size={13} className="text-zinc-500 shrink-0" />
                          <span className="text-sm text-zinc-200 truncate">{p.empresa || 'Nova Empresa'}</span>
                        </div>
                        <span className="text-xs text-zinc-500 shrink-0">{formatCurrency(p.valor)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2 relative">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Selecione o Aprovador</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsApproverSelectOpen(!isApproverSelectOpen)}
                    className={`w-full flex items-center justify-between bg-[#121214] border ${isApproverSelectOpen ? 'border-emerald-500/50 shadow-[0_0_0_2px_rgba(16,185,129,0.1)]' : 'border-zinc-800/80'} hover:border-zinc-700/80 rounded-lg px-4 py-2.5 text-sm text-left transition-all outline-none`}
                  >
                    <span className={selectedApproverId ? 'text-zinc-200 font-medium' : 'text-zinc-500'}>
                      {selectedApproverId
                        ? (allUsers.find(u => u.id === selectedApproverId)?.name || 'Usuário não encontrado')
                        : 'Selecione um aprovador...'}
                    </span>
                    <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${isApproverSelectOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isApproverSelectOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsApproverSelectOpen(false)} />
                      <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-[#18181b] border border-zinc-800/80 rounded-lg shadow-xl overflow-hidden animate-fade-in flex flex-col py-1">
                        <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Aprovadores Disponíveis</span>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                          {sortedAllUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setSelectedApproverId(u.id);
                                setIsApproverSelectOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${selectedApproverId === u.id ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
                            >
                              <div className="flex items-center gap-2">
                                <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                                <span>{u.name}</span>
                              </div>
                              {selectedApproverId === u.id && <Check size={14} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={closeSendForm} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider">
                  Cancelar
                </button>
                <button
                  disabled={selectedProposalIds.length === 0 || !selectedApproverId}
                  onClick={handleSendBatch}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-50 transition-colors"
                >
                  <Send size={14} /> Enviar para Aprovação
                </button>
              </div>
            </div>
          )}

          {!isSendingBatch && (
            rounds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-600 text-xs italic gap-2">
                <Users size={22} className="text-zinc-700" />
                Nenhum fluxo de aprovação configurado.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {roundsNewestFirst.map((round, idx) => (
                  <BudgetRoundCard
                    key={round.id}
                    round={round}
                    index={roundsNewestFirst.length - 1 - idx}
                    proposals={proposals}
                    allUsers={allUsers}
                    currentUserId={currentUser?.id}
                    canDeleteRound={canDeleteRound}
                    onDelete={setDeleteRoundConfirmId}
                    onDecide={handleDecide}
                    onResend={handleResendProposal}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {deleteRoundConfirmId && (
        <ConfirmModal
          isOpen={true}
          title="Excluir Fluxo de Aprovação"
          message="Tem certeza que deseja excluir esta rodada de aprovação? Todo o histórico de decisões e justificativas será perdido, e as propostas envolvidas voltam a ficar editáveis. Esta ação não pode ser desfeita."
          confirmText="Excluir"
          onConfirm={() => {
            handleDeleteRound(deleteRoundConfirmId);
            setDeleteRoundConfirmId(null);
          }}
          onCancel={() => setDeleteRoundConfirmId(null)}
        />
      )}

      {deleteConfirmId && (
        <ConfirmModal
          isOpen={true}
          title="Excluir Proposta"
          message="Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita."
          confirmText="Excluir"
          onConfirm={() => {
            handleDeleteProposal(deleteConfirmId);
            setDeleteConfirmId(null);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Clock, Banknote, XCircle, CheckCircle2,
  Save, X, ExternalLink, Columns3, Check, RotateCcw,
} from 'lucide-react';
import { SiengeTitle, SiengeStatus, SiengeLote, Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { SiengeTaxonomy, taxonomyCategoriasFor, taxonomySubcategoriasFor } from '../lib/siengeCategorias';

interface SiengeTitleTableProps {
  titles: SiengeTitle[];
  openLotes: SiengeLote[];
  projects: Project[];
  onSave: (title: SiengeTitle) => void;
  onOpenFull: (title: SiengeTitle) => void;
  taxonomy: SiengeTaxonomy;
}

const STATUS_GROUPS: { id: SiengeStatus; label: string; color: string; dotColor: string; icon: React.ReactNode }[] = [
  { id: 'a_lancar', label: 'A Lançar', color: 'text-zinc-400', dotColor: 'bg-zinc-500', icon: <Clock size={12} /> },
  { id: 'aprovacao_1', label: 'Aprovação em 1ª Alçada', color: 'text-sky-400', dotColor: 'bg-sky-500', icon: <ChevronRight size={12} /> },
  { id: 'aprovacao_2', label: 'Aprovação em 2ª Alçada', color: 'text-blue-400', dotColor: 'bg-blue-500', icon: <ChevronRight size={12} /> },
  { id: 'aprovacao_3', label: 'Aprovação em 3ª Alçada', color: 'text-violet-400', dotColor: 'bg-violet-500', icon: <ChevronRight size={12} /> },
  { id: 'aguardando_pagamento', label: 'Aguardando Pagamento', color: 'text-amber-400', dotColor: 'bg-amber-500', icon: <Banknote size={12} /> },
  { id: 'recusados', label: 'Recusados', color: 'text-red-400', dotColor: 'bg-danger-400', icon: <XCircle size={12} /> },
  { id: 'pago', label: 'Pago', color: 'text-emerald-400', dotColor: 'bg-emerald-500', icon: <CheckCircle2 size={12} /> },
];

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const cellInputClass = 'w-full bg-transparent hover:bg-zinc-900/60 focus:bg-zinc-900 border border-transparent focus:border-blue-500/40 rounded px-1.5 py-1 text-[12px] text-zinc-200 outline-none transition-colors';
// appearance-none remove a seta nativa do <select> — cada célula já deixa claro
// que é editável ao passar o mouse (fundo destacado), sem precisar do ícone.
const cellSelectClass = `${cellInputClass} appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`;
// Esconde o ícone nativo de calendário do input de data — o campo continua clicável e editável.
const dateInputClass = `${cellInputClass} [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full`;

interface ColDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'right' | 'center';
  lockVisible?: boolean; // não aparece no menu de ocultar colunas
}

const COLS: ColDef[] = [
  { key: 'titulo', label: 'Nº Título', defaultWidth: 110, minWidth: 70 },
  { key: 'descricao', label: 'Descrição', defaultWidth: 220, minWidth: 100 },
  { key: 'empreendimento', label: 'Empreendimento', defaultWidth: 160, minWidth: 90 },
  { key: 'centroCusto', label: 'Centro de Custo', defaultWidth: 130, minWidth: 90 },
  { key: 'categoria', label: 'Categoria', defaultWidth: 160, minWidth: 90 },
  { key: 'subcategoria', label: 'Subcategoria', defaultWidth: 180, minWidth: 90 },
  { key: 'lote', label: 'Lote', defaultWidth: 145, minWidth: 90 },
  { key: 'valor', label: 'Valor', defaultWidth: 120, minWidth: 80, align: 'right' },
  { key: 'vencimento', label: 'Vencimento', defaultWidth: 120, minWidth: 90 },
  { key: 'assignee', label: 'Responsável', defaultWidth: 150, minWidth: 90 },
  { key: 'acoes', label: '', defaultWidth: 56, minWidth: 56, align: 'center', lockVisible: true },
];

const WIDTHS_STORAGE_KEY = 'sienge-title-table-col-widths';
const HIDDEN_STORAGE_KEY = 'sienge-title-table-hidden-cols';

function loadWidths(): Record<string, number> {
  const defaults = Object.fromEntries(COLS.map(c => [c.key, c.defaultWidth]));
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    return Object.fromEntries(COLS.map(c => [c.key, typeof saved[c.key] === 'number' ? saved[c.key] : c.defaultWidth]));
  } catch {
    return defaults;
  }
}

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (!raw) return new Set();
    const saved: string[] = JSON.parse(raw);
    return new Set(saved.filter(k => COLS.some(c => c.key === k && !c.lockVisible)));
  } catch {
    return new Set();
  }
}

function isRowValid(t: SiengeTitle): boolean {
  return !!(
    t.titulo.trim() &&
    t.empreendimento?.trim() &&
    t.centroCusto &&
    t.categoria &&
    t.subcategoria &&
    t.valor > 0 &&
    t.vencimento &&
    t.assigneeId &&
    (t.loteId || t.faturaId)
  );
}

interface RowProps {
  title: SiengeTitle;
  patch: Partial<SiengeTitle> | undefined;
  visibleCols: ColDef[];
  lotes: SiengeLote[];
  projects: Project[];
  taxonomy: SiengeTaxonomy;
  onChange: (id: string, patch: Partial<SiengeTitle>) => void;
  onDiscard: (id: string) => void;
  onSaveRow: (id: string) => void;
  onOpenFull: (title: SiengeTitle) => void;
}

function EditableRow({ title, patch, visibleCols, lotes, projects, taxonomy, onChange, onDiscard, onSaveRow, onOpenFull }: RowProps) {
  const { allUsers } = useAuth();
  const local: SiengeTitle = patch ? { ...title, ...patch } : title;
  const dirty = !!patch;

  const update = <K extends keyof SiengeTitle>(key: K, value: SiengeTitle[K]) => {
    const next: Partial<SiengeTitle> = { [key]: value };
    if (key === 'centroCusto') { next.categoria = undefined; next.subcategoria = undefined; }
    if (key === 'categoria') { next.subcategoria = undefined; }
    onChange(title.id, next);
  };

  const categoriaOptions = taxonomyCategoriasFor(taxonomy, local.centroCusto);
  const subcategoriaOptions = taxonomySubcategoriasFor(taxonomy, local.centroCusto, local.categoria);
  const usesFatura = !!local.faturaId && !local.loteId;
  const valid = isRowValid(local);

  const cells: Record<string, React.ReactNode> = {
    titulo: (
      <input value={local.titulo} onChange={e => update('titulo', e.target.value)} className={cellInputClass} />
    ),
    descricao: (
      <input value={local.descricao || ''} onChange={e => update('descricao', e.target.value)} className={cellInputClass} />
    ),
    empreendimento: (
      <select value={local.empreendimento || ''} onChange={e => update('empreendimento', e.target.value || undefined)} className={cellSelectClass}>
        <option value="">—</option>
        {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
      </select>
    ),
    centroCusto: (
      <select value={local.centroCusto || ''} onChange={e => update('centroCusto', e.target.value || undefined)} className={cellSelectClass}>
        <option value="">—</option>
        {taxonomy.centrosCusto.map(cc => <option key={cc.value} value={cc.value}>{cc.label}</option>)}
      </select>
    ),
    categoria: (
      <select value={local.categoria || ''} disabled={!local.centroCusto} onChange={e => update('categoria', e.target.value || undefined)} className={cellSelectClass}>
        <option value="">—</option>
        {categoriaOptions.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    ),
    subcategoria: (
      <select value={local.subcategoria || ''} disabled={!local.categoria} onChange={e => update('subcategoria', e.target.value || undefined)} className={cellSelectClass}>
        <option value="">—</option>
        {subcategoriaOptions.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    ),
    lote: usesFatura ? (
      <span className="block px-1.5 py-1 text-[12px] text-zinc-500 italic truncate" title="Lançado no cartão de crédito — edite pelo modal completo">Cartão de crédito</span>
    ) : (
      <select value={local.loteId || ''} onChange={e => update('loteId', e.target.value || undefined)} className={cellSelectClass}>
        <option value="">—</option>
        {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
    ),
    valor: (
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-[11px] text-zinc-500 font-medium">R$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={Number.isFinite(local.valor) ? local.valor : 0}
          onChange={e => update('valor', parseFloat(e.target.value) || 0)}
          className={`${cellInputClass} text-right`}
        />
      </div>
    ),
    vencimento: (
      <input
        type="date"
        value={local.vencimento || ''}
        onChange={e => update('vencimento', e.target.value || undefined)}
        className={dateInputClass}
      />
    ),
    assignee: (
      <select value={local.assigneeId || ''} onChange={e => update('assigneeId', e.target.value || undefined)} className={cellSelectClass}>
        <option value="">—</option>
        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    ),
    acoes: (
      <div className="flex items-center justify-center gap-0.5">
        <button
          type="button"
          onClick={() => onOpenFull(title)}
          title="Abrir detalhes completos"
          className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ExternalLink size={12} />
        </button>
        {dirty && (
          <>
            <button
              type="button"
              onClick={() => onDiscard(title.id)}
              title="Descartar alterações"
              className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={12} />
            </button>
            <button
              type="button"
              onClick={() => onSaveRow(title.id)}
              disabled={!valid}
              title={valid ? 'Salvar alterações' : 'Preencha os campos obrigatórios para salvar'}
              className="flex items-center justify-center w-6 h-6 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={12} />
            </button>
          </>
        )}
      </div>
    ),
  };

  return (
    <tr className={`border-b border-zinc-900/40 transition-colors ${dirty ? 'bg-blue-500/[0.06]' : 'hover:bg-zinc-900/30'}`}>
      {visibleCols.map(col => (
        <td key={col.key} className="px-1.5 py-1 overflow-hidden">
          {cells[col.key]}
        </td>
      ))}
    </tr>
  );
}

function useResizableColumns() {
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  const resizing = useRef<{ key: string; startX: number; startWidth: number; minWidth: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(widths)); } catch { /* noop */ }
  }, [widths]);

  const handleMove = useCallback((e: MouseEvent) => {
    const r = resizing.current;
    if (!r) return;
    const delta = e.clientX - r.startX;
    setWidths(prev => ({ ...prev, [r.key]: Math.max(r.minWidth, r.startWidth + delta) }));
  }, []);

  const handleUp = useCallback(() => {
    resizing.current = null;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
  }, [handleMove]);

  const startResize = useCallback((key: string, minWidth: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { key, startX: e.clientX, startWidth: widths[key], minWidth };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [widths, handleMove, handleUp]);

  const resetWidths = useCallback(() => {
    setWidths(Object.fromEntries(COLS.map(c => [c.key, c.defaultWidth])));
  }, []);

  useEffect(() => () => {
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
  }, [handleMove, handleUp]);

  return { widths, startResize, resetWidths };
}

function ColumnsMenu({ hidden, onToggle }: { hidden: Set<string>; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleable = COLS.filter(c => !c.lockVisible);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-800/60 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
      >
        <Columns3 size={12} /> Colunas
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#141417] border border-zinc-800/80 rounded-xl shadow-xl shadow-black/60 z-50 py-1.5 flex flex-col">
          {toggleable.map(col => {
            const isHidden = hidden.has(col.key);
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => onToggle(col.key)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100 transition-colors text-left"
              >
                <span className={isHidden ? 'text-zinc-600' : ''}>{col.label}</span>
                {!isHidden && <Check size={13} className="text-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SiengeTitleTable({ titles, openLotes, projects, onSave, onOpenFull, taxonomy }: SiengeTitleTableProps) {
  const [collapsed, setCollapsed] = useState<Set<SiengeStatus>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [edits, setEdits] = useState<Record<string, Partial<SiengeTitle>>>({});
  const { widths, startResize, resetWidths } = useResizableColumns();

  useEffect(() => {
    try { localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(Array.from(hidden))); } catch { /* noop */ }
  }, [hidden]);

  // Uma edição pendente deixa de existir se o título for removido da lista
  // filtrada/realtime — evita manter "sujeira" órfã.
  useEffect(() => {
    setEdits(prev => {
      const ids = new Set(titles.map(t => t.id));
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [titles]);

  const toggleColumn = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleChange = useCallback((id: string, patch: Partial<SiengeTitle>) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleDiscardRow = useCallback((id: string) => {
    setEdits(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleSaveRow = useCallback((id: string) => {
    const base = titles.find(t => t.id === id);
    const patch = edits[id];
    if (!base || !patch) return;
    const merged = { ...base, ...patch };
    if (!isRowValid(merged)) return;
    onSave({ ...merged, updatedAt: new Date().toISOString() });
    handleDiscardRow(id);
  }, [titles, edits, onSave, handleDiscardRow]);

  const dirtyIds = useMemo(() => Object.keys(edits), [edits]);
  const validDirtyIds = useMemo(() => dirtyIds.filter(id => {
    const base = titles.find(t => t.id === id);
    return base && isRowValid({ ...base, ...edits[id] });
  }), [dirtyIds, titles, edits]);

  const handleSaveAll = () => {
    validDirtyIds.forEach(id => handleSaveRow(id));
  };

  const handleDiscardAll = () => setEdits({});

  const grouped = useMemo(() => {
    const map = new Map<SiengeStatus, SiengeTitle[]>();
    STATUS_GROUPS.forEach(g => map.set(g.id, []));
    titles.forEach(t => {
      const bucket = map.get(t.status);
      if (bucket) bucket.push(t);
    });
    return map;
  }, [titles]);

  const toggleGroup = (status: SiengeStatus) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const visibleCols = useMemo(() => COLS.filter(c => c.lockVisible || !hidden.has(c.key)), [hidden]);
  const totalWidth = visibleCols.reduce((sum, c) => sum + widths[c.key], 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-1 shrink-0">
        <div className="text-[11px] text-zinc-600">
          {dirtyIds.length > 0 ? `${dirtyIds.length} título${dirtyIds.length !== 1 ? 's' : ''} com alterações pendentes` : ''}
        </div>
        <div className="flex items-center gap-2">
          {dirtyIds.length > 0 && (
            <button
              type="button"
              onClick={handleDiscardAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
            >
              <X size={12} /> Descartar tudo
            </button>
          )}
          <button
            type="button"
            onClick={resetWidths}
            title="Restaurar largura padrão das colunas"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-800/60 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
          >
            <RotateCcw size={12} /> Redefinir colunas
          </button>
          <ColumnsMenu hidden={hidden} onToggle={toggleColumn} />
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={validDirtyIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/10"
          >
            <Save size={12} /> Salvar Alterações{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ''}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 px-5 pb-5">
        <table className="border-separate border-spacing-0" style={{ width: totalWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {visibleCols.map(col => <col key={col.key} style={{ width: widths[col.key] }} />)}
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-10 bg-[#08080a]">
              {visibleCols.map(col => (
                <th
                  key={col.key}
                  className={`relative px-1.5 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80 overflow-hidden ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {col.label}
                  <span
                    onMouseDown={startResize(col.key, col.minWidth)}
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATUS_GROUPS.map(group => {
              const rows = grouped.get(group.id) || [];
              const groupValue = rows.reduce((sum, t) => sum + t.valor, 0);
              const isCollapsed = collapsed.has(group.id);
              return (
                <React.Fragment key={group.id}>
                  <tr>
                    <td colSpan={visibleCols.length} className="pt-4 pb-1.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        className="flex items-center gap-2 w-full text-left"
                      >
                        <ChevronDown size={12} className={`text-zinc-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        <span className={`w-1.5 h-1.5 rounded-full ${group.dotColor} shrink-0`} />
                        <span className={`${group.color} shrink-0`}>{group.icon}</span>
                        <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">{group.label}</span>
                        <span className="text-[10px] text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-full px-1.5 py-0.5 font-mono leading-none">
                          {rows.length}
                        </span>
                        {groupValue > 0 && (
                          <span className="text-[10px] font-semibold text-zinc-500 ml-1">{formatCurrency(groupValue)}</span>
                        )}
                        <span className="flex-1 border-t border-zinc-900/80 ml-2" />
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed && rows.length === 0 && (
                    <tr>
                      <td colSpan={visibleCols.length} className="py-3 px-4 text-[11px] text-zinc-700 italic">Nenhum título nesta situação.</td>
                    </tr>
                  )}
                  {!isCollapsed && rows.map(t => (
                    <EditableRow
                      key={t.id}
                      title={t}
                      patch={edits[t.id]}
                      visibleCols={visibleCols}
                      lotes={openLotes}
                      projects={projects}
                      taxonomy={taxonomy}
                      onChange={handleChange}
                      onDiscard={handleDiscardRow}
                      onSaveRow={handleSaveRow}
                      onOpenFull={onOpenFull}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

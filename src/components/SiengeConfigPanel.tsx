import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Settings, User, ChevronDown, Save, Loader2, Plus, X, Trash2, Tag, Layers, Pencil, Check,
} from 'lucide-react';
import { useAuth, UserProfile } from '../context/AuthContext';
import { SiengeAlcadaConfig, SiengeCategoriaDef } from '../types';
import { SiengeTaxonomy } from '../lib/siengeCategorias';
import { usePermissoes } from '../lib/permissoes';

interface SiengeConfigPanelProps {
  alcadaConfig: SiengeAlcadaConfig;
  onSaveAlcadaConfig: (config: SiengeAlcadaConfig) => Promise<void> | void;
  taxonomy: SiengeTaxonomy;
  onAddCentroCusto: (nome: string) => Promise<void> | void;
  onAddCategoria: (centroCusto: string, categoria: string) => Promise<void> | void;
  onRenameCategoria: (id: string, categoria: string) => Promise<void> | void;
  onDeleteCategoria: (id: string) => Promise<void> | void;
  onAddSubcategoria: (categoriaId: string, subcategoria: string) => Promise<void> | void;
  onDeleteSubcategoria: (id: string) => Promise<void> | void;
  onClose: () => void;
}

function ResponsavelPicker({
  label,
  users,
  value,
  onChange,
}: {
  label: string;
  users: UserProfile[];
  value?: string;
  onChange: (userId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = users.find(u => u.id === value);

  return (
    <div className="space-y-1.5 relative">
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
        <User size={13} className="text-zinc-500" />
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(p => !p)}
        className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-100 flex items-center justify-between cursor-pointer transition-all"
      >
        <div className="flex items-center gap-2">
          {selected ? (
            <>
              {selected.avatarUrl ? (
                <img src={selected.avatarUrl} alt={selected.name} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold">
                  {selected.initials}
                </div>
              )}
              <span>{selected.name}</span>
            </>
          ) : (
            <span className="text-zinc-500">Selecionar responsável...</span>
          )}
        </div>
        <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#18181b] border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
            <div className="max-h-48 overflow-y-auto">
              {users.map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => { onChange(user.id); setIsOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-zinc-800/50 transition-colors ${value === user.id ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-300'}`}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold">
                      {user.initials}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span>{user.name}</span>
                    <span className="text-[10px] text-zinc-500">{user.role}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AlcadaSection({ alcadaConfig, onSaveAlcadaConfig }: Pick<SiengeConfigPanelProps, 'alcadaConfig' | 'onSaveAlcadaConfig'>) {
  const { allUsers } = useAuth();
  const [alcada1UserId, setAlcada1UserId] = useState(alcadaConfig.alcada1UserId || '');
  const [alcada2UserId, setAlcada2UserId] = useState(alcadaConfig.alcada2UserId || '');
  const [alcada3UserId, setAlcada3UserId] = useState(alcadaConfig.alcada3UserId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = alcada1UserId !== (alcadaConfig.alcada1UserId || '')
    || alcada2UserId !== (alcadaConfig.alcada2UserId || '')
    || alcada3UserId !== (alcadaConfig.alcada3UserId || '');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveAlcadaConfig({
        alcada1UserId: alcada1UserId || undefined,
        alcada2UserId: alcada2UserId || undefined,
        alcada3UserId: alcada3UserId || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <User size={15} className="text-blue-400" /> Responsáveis por Alçada
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Defina quem recebe a notificação em cada etapa de aprovação dos títulos.</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !dirty}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ResponsavelPicker label="1ª Alçada" users={allUsers} value={alcada1UserId} onChange={setAlcada1UserId} />
        <ResponsavelPicker label="2ª Alçada" users={allUsers} value={alcada2UserId} onChange={setAlcada2UserId} />
        <ResponsavelPicker label="3ª Alçada" users={allUsers} value={alcada3UserId} onChange={setAlcada3UserId} />
      </div>
    </div>
  );
}

function AddInlineForm({ placeholder, onAdd, small }: { placeholder: string; onAdd: (value: string) => Promise<void> | void; small?: boolean }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder={placeholder}
        className={`bg-zinc-900/60 border border-zinc-800 rounded-lg outline-none text-zinc-200 placeholder-zinc-600 focus:border-blue-500/50 transition-colors ${small ? 'px-2 py-1 text-[12px] w-40' : 'px-3 py-1.5 text-sm w-56'}`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || saving}
        className={`flex items-center justify-center rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${small ? 'w-6 h-6' : 'w-8 h-8'}`}
      >
        {saving ? <Loader2 size={small ? 12 : 14} className="animate-spin" /> : <Plus size={small ? 12 : 14} />}
      </button>
    </div>
  );
}

function SubcategoriaRow({ nome, onDelete }: { nome: string; onDelete: () => Promise<void> | void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-[12px] text-red-300">
        <span>Remover "{nome}"?</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={async () => { setDeleting(true); await onDelete(); }}
            className="px-1.5 py-0.5 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded hover:bg-red-500/20"
          >
            {deleting ? <Loader2 size={10} className="animate-spin" /> : 'Sim'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 rounded">Não</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md hover:bg-zinc-800/50 text-[12px] text-zinc-300 transition-colors">
      <span className="truncate">{nome}</span>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Remover subcategoria"
        className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function CategoriaCard({
  categoria, taxonomy, onRenameCategoria, onDeleteCategoria, onAddSubcategoria, onDeleteSubcategoria,
}: {
  categoria: SiengeCategoriaDef;
  taxonomy: SiengeTaxonomy;
  onRenameCategoria: (id: string, categoria: string) => Promise<void> | void;
  onDeleteCategoria: (id: string) => Promise<void> | void;
  onAddSubcategoria: (categoriaId: string, subcategoria: string) => Promise<void> | void;
  onDeleteSubcategoria: (id: string) => Promise<void> | void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(categoria.categoria);
  const [saving, setSaving] = useState(false);
  const subcats = taxonomy.subcategoriasPorCategoria[categoria.id] || [];

  const commitRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === categoria.categoria) {
      setNameDraft(categoria.categoria);
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRenameCategoria(categoria.id, trimmed);
      setIsEditing(false);
    } catch {
      setNameDraft(categoria.categoria);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameDraft(categoria.categoria); setIsEditing(false); } }}
              className="flex-1 min-w-0 bg-zinc-900/80 border border-blue-500/50 rounded px-2 py-1 text-[13px] font-semibold text-zinc-100 outline-none"
            />
            <button type="button" onClick={commitRename} disabled={saving} className="w-6 h-6 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/10 shrink-0">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button type="button" onClick={() => { setNameDraft(categoria.categoria); setIsEditing(false); }} className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 shrink-0">
              <X size={12} />
            </button>
          </div>
        ) : (
          <span className="group/name text-[13px] font-semibold text-zinc-200 flex items-center gap-1.5 min-w-0">
            <Tag size={12} className="text-zinc-500 shrink-0" />
            <span className="truncate">{categoria.categoria}</span>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              title="Renomear categoria"
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 opacity-0 group-hover/name:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 transition-all shrink-0"
            >
              <Pencil size={11} />
            </button>
          </span>
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-red-400">Remover categoria e subcategorias?</span>
            <button type="button" onClick={() => onDeleteCategoria(categoria.id)} className="px-1.5 py-0.5 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded hover:bg-red-500/20">Sim</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 rounded">Não</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Remover categoria"
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="flex flex-col divide-y divide-zinc-900/60 border border-zinc-900/60 rounded-md overflow-hidden">
        {subcats.map(s => (
          <SubcategoriaRow key={s.id} nome={s.nome} onDelete={() => onDeleteSubcategoria(s.id)} />
        ))}
        {subcats.length === 0 && <span className="px-2.5 py-2 text-[11px] text-zinc-700 italic">Nenhuma subcategoria ainda.</span>}
      </div>
      <AddInlineForm placeholder="Nova subcategoria..." small onAdd={(v) => onAddSubcategoria(categoria.id, v)} />
    </div>
  );
}

function CentroCustoSection({
  centroCusto, label, taxonomy, categorias, onAddCategoria, onRenameCategoria, onDeleteCategoria, onAddSubcategoria, onDeleteSubcategoria,
}: {
  centroCusto: string;
  label: string;
  taxonomy: SiengeTaxonomy;
  categorias: SiengeCategoriaDef[];
  onAddCategoria: (centroCusto: string, categoria: string) => Promise<void> | void;
  onRenameCategoria: (id: string, categoria: string) => Promise<void> | void;
  onDeleteCategoria: (id: string) => Promise<void> | void;
  onAddSubcategoria: (categoriaId: string, subcategoria: string) => Promise<void> | void;
  onDeleteSubcategoria: (id: string) => Promise<void> | void;
}) {
  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
          <Layers size={15} className="text-blue-400" /> {label}
        </h3>
        <AddInlineForm placeholder="Nova categoria..." onAdd={(v) => onAddCategoria(centroCusto, v)} />
      </div>
      {categorias.length === 0 ? (
        <p className="text-[12px] text-zinc-700 italic">Nenhuma categoria cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {categorias.map(c => (
            <CategoriaCard
              key={c.id}
              categoria={c}
              taxonomy={taxonomy}
              onRenameCategoria={onRenameCategoria}
              onDeleteCategoria={onDeleteCategoria}
              onAddSubcategoria={onAddSubcategoria}
              onDeleteSubcategoria={onDeleteSubcategoria}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SiengeConfigPanel({
  alcadaConfig, onSaveAlcadaConfig, taxonomy, onAddCentroCusto, onAddCategoria, onRenameCategoria, onDeleteCategoria, onAddSubcategoria, onDeleteSubcategoria, onClose,
}: SiengeConfigPanelProps) {
  const { isAdmin } = usePermissoes();
  const categoriasByCentro = (centroCusto: string): SiengeCategoriaDef[] =>
    (taxonomy.categoriasPorCentro[centroCusto] || []).map(categoria => ({
      id: taxonomy.categoriaIdFor[`${centroCusto}::${categoria}`],
      centroCusto,
      categoria,
      createdAt: '',
    }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="flex flex-col h-full overflow-hidden bg-[#08080a]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 view-pad-x py-4 short:py-2.5 border-b border-zinc-900/80 shrink-0">
        <button
          onClick={onClose}
          title="Voltar para Títulos"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700 transition-all"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
          <Settings size={16} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-zinc-100">Configurações de Títulos</h1>
          <p className="text-[11px] text-zinc-600">Aprovadores por alçada e taxonomia de centro de custo / categoria / subcategoria</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto view-pad flex flex-col view-gap-sm">
        {/* Alçada é configuração exclusiva do administrador. */}
        {isAdmin && <AlcadaSection alcadaConfig={alcadaConfig} onSaveAlcadaConfig={onSaveAlcadaConfig} />}

        {taxonomy.centrosCusto.map(cc => (
          <CentroCustoSection
            key={cc.value}
            centroCusto={cc.value}
            label={cc.label}
            taxonomy={taxonomy}
            categorias={categoriasByCentro(cc.value)}
            onAddCategoria={onAddCategoria}
            onRenameCategoria={onRenameCategoria}
            onDeleteCategoria={onDeleteCategoria}
            onAddSubcategoria={onAddSubcategoria}
            onDeleteSubcategoria={onDeleteSubcategoria}
          />
        ))}

        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Adicionar novo Centro de Custo</h3>
            <p className="text-[11px] text-zinc-600 mt-0.5">Centros de custo existentes não podem ser removidos, apenas novos podem ser adicionados.</p>
          </div>
          <AddInlineForm placeholder="Nome do centro de custo..." onAdd={onAddCentroCusto} />
        </div>
      </div>
    </motion.div>
  );
}

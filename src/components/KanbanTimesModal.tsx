import React, { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermissoes } from '../lib/permissoes';
import {
  KanbanTime,
  criarKanbanTime,
  definirMembroKanbanTime,
  excluirKanbanTime,
  renomearKanbanTime,
  useKanbanTimes,
} from '../lib/kanbanTimes';
import ConfirmModal from './ConfirmModal';

interface Props {
  onClose: () => void;
}

export default function KanbanTimesModal({ onClose }: Props) {
  const { allUsers } = useAuth();
  const { isMaster } = usePermissoes();
  const { times, carregando, recarregar } = useKanbanTimes();

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState('');
  const [excluir, setExcluir] = useState<KanbanTime | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!selecionadoId || !times.some(t => t.id === selecionadoId)) {
      setSelecionadoId(times[0]?.id ?? null);
    }
  }, [times, selecionadoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !excluir) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, excluir]);

  const selecionado = times.find(t => t.id === selecionadoId) ?? null;
  const usuarios = [...allUsers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const semTime = usuarios.filter(u => !times.some(t => t.membros.includes(u.id)));

  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    setErro(null);
    try { await acao(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(false); await recarregar(); }
  };

  const criar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    const ordem = times.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1;
    executar(async () => { await criarKanbanTime(novoNome, ordem); setNovoNome(''); });
  };

  const salvarNome = (id: string) => {
    const nome = editandoNome.trim();
    setEditandoId(null);
    if (!nome || nome === times.find(t => t.id === id)?.nome) return;
    executar(() => renomearKanbanTime(id, nome));
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div
        className="bg-[#18181b] border border-zinc-800/80 rounded-xl w-full max-w-[720px] max-h-[85vh] flex flex-col shadow-2xl animate-slide-up"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div>
            <h3 className="text-[15px] font-semibold text-zinc-100 flex items-center gap-2"><Users size={16} className="text-blue-400" /> Times do quadro</h3>
            <p className="text-[12px] text-zinc-500 mt-1">Só quem está em algum time aparece no quadro Kanban. Uma pessoa pode estar em mais de um time.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><X size={16} /></button>
        </div>

        {erro && <div className="mx-5 mt-3 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</div>}
        {!isMaster && <div className="mx-5 mt-3 text-[12px] text-zinc-400 bg-zinc-800/40 border border-zinc-700/40 rounded-lg px-3 py-2">Somente o administrador ou o master altera os times.</div>}

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Times */}
          <div className="sm:w-[250px] shrink-0 border-b sm:border-b-0 sm:border-r border-zinc-800/80 p-3 flex flex-col gap-1 overflow-y-auto">
            {carregando && <span className="text-[12px] text-zinc-500 px-2 py-1">Carregando…</span>}
            {!carregando && times.length === 0 && (
              <span className="text-[12px] text-zinc-500 px-2 py-1">Nenhum time ainda. Enquanto não houver times, o quadro mostra todos os usuários.</span>
            )}
            {times.map(t => (
              <div
                key={t.id}
                onClick={() => setSelecionadoId(t.id)}
                className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-[13px] ${t.id === selecionadoId ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
              >
                {editandoId === t.id ? (
                  <input
                    autoFocus
                    value={editandoNome}
                    onChange={e => setEditandoNome(e.target.value)}
                    onBlur={() => salvarNome(t.id)}
                    onKeyDown={e => { if (e.key === 'Enter') salvarNome(t.id); if (e.key === 'Escape') { e.stopPropagation(); setEditandoId(null); } }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[13px] text-zinc-100 outline-none focus:border-blue-500"
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate">{t.nome}</span>
                )}
                <span className="text-[10px] text-zinc-500 tabular-nums">{t.membros.length}</span>
                {isMaster && editandoId !== t.id && (
                  <span className="hidden group-hover:flex items-center gap-0.5">
                    <button title="Renomear" onClick={e => { e.stopPropagation(); setEditandoId(t.id); setEditandoNome(t.nome); }} className="p-1 rounded text-zinc-500 hover:text-zinc-200"><Pencil size={11} /></button>
                    <button title="Excluir" onClick={e => { e.stopPropagation(); setExcluir(t); }} className="p-1 rounded text-zinc-500 hover:text-red-400"><Trash2 size={11} /></button>
                  </span>
                )}
              </div>
            ))}
            {isMaster && (
              <form onSubmit={criar} className="flex items-center gap-1.5 mt-2">
                <input
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  placeholder="Novo time"
                  className="flex-1 min-w-0 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-blue-500"
                />
                <button type="submit" disabled={ocupado || !novoNome.trim()} className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><Plus size={14} /></button>
              </form>
            )}
          </div>

          {/* Membros */}
          <div className="flex-1 min-h-0 p-3 overflow-y-auto">
            {selecionado ? (
              <>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold px-1 mb-2">Membros de {selecionado.nome}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {usuarios.map(u => {
                    const membro = selecionado.membros.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        disabled={!isMaster || ocupado}
                        onClick={() => executar(() => definirMembroKanbanTime(selecionado.id, u.id, !membro))}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[12px] border transition-colors disabled:cursor-default ${membro ? 'bg-blue-500/10 border-blue-500/25 text-zinc-100' : 'border-transparent text-zinc-400 hover:bg-zinc-800/50'}`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${membro ? 'bg-blue-500 border-blue-500' : 'border-zinc-600'}`}>
                          {membro && <Check size={11} className="text-white" />}
                        </span>
                        <span className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">
                          {u.avatarUrl ? <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" /> : u.initials}
                        </span>
                        <span className="truncate">{u.name}</span>
                      </button>
                    );
                  })}
                </div>
                {times.length > 0 && semTime.length > 0 && (
                  <p className="text-[11px] text-zinc-500 mt-4 px-1">
                    Fora do quadro (sem time): {semTime.map(u => u.name).join(', ')}
                  </p>
                )}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-[12px] text-zinc-500">Crie um time para escolher os membros.</div>
            )}
          </div>
        </div>
      </div>

      <div onMouseDown={e => e.stopPropagation()}>
        <ConfirmModal
          isOpen={!!excluir}
          title="Excluir time"
          message={`Excluir o time "${excluir?.nome}"? Quem estiver só nele sai do quadro Kanban.`}
          confirmText="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={() => { const t = excluir; setExcluir(null); if (t) executar(() => excluirKanbanTime(t.id)); }}
        />
      </div>
    </div>
  );
}

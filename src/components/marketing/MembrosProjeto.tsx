import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, X, Check } from 'lucide-react';
import { Task } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useMarketingProjetos } from '../../lib/marketingProjetos';
import { pilula } from '../tarefa/Propriedade';

interface Membro {
  id: string;
  name: string;
  avatarUrl?: string;
  initials?: string;
  cadastrado: boolean;
  tarefas: number;
}

/**
 * Membros do projeto: os cadastrados mais quem é responsável por alguma tarefa
 * dele (marcados "com tarefa").
 */
export function useMembrosProjeto(projetoId: string, tarefasDoProjeto: Task[]): Membro[] {
  const { allUsers } = useAuth();
  const { membrosDoProjeto } = useMarketingProjetos();
  return useMemo(() => {
    const cadastrados = new Set(membrosDoProjeto[projetoId] || []);
    const porResponsavel: Record<string, number> = {};
    for (const t of tarefasDoProjeto) {
      if (t.assigneeId) porResponsavel[t.assigneeId] = (porResponsavel[t.assigneeId] || 0) + 1;
    }
    const ids = new Set([...cadastrados, ...Object.keys(porResponsavel)]);
    return [...ids]
      .map((id): Membro | null => {
        const u = allUsers.find(x => x.id === id);
        if (!u) return null;
        return { id, name: u.name, avatarUrl: u.avatarUrl, initials: u.initials, cadastrado: cadastrados.has(id), tarefas: porResponsavel[id] || 0 };
      })
      .filter((m): m is Membro => !!m)
      .sort((a, b) => Number(b.cadastrado) - Number(a.cadastrado) || a.name.localeCompare(b.name));
  }, [allUsers, membrosDoProjeto, projetoId, tarefasDoProjeto]);
}

/** Anel na cor do card, para separar os avatares empilhados nos dois temas. */
const ANEL = 'var(--t-card)';

export function Avatar({ m, tamanho = 24 }: { m: { name: string; avatarUrl?: string; initials?: string }; tamanho?: number }) {
  const estilo = { width: tamanho, height: tamanho, borderColor: ANEL };
  return m.avatarUrl ? (
    <img src={m.avatarUrl} alt={m.name} title={m.name} style={estilo} className="rounded-full object-cover border-2 shrink-0" />
  ) : (
    <div title={m.name} style={estilo} className="rounded-full bg-zinc-800 border-2 flex items-center justify-center text-zinc-200 text-[10px] leading-none font-semibold shrink-0">
      {m.initials || m.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** Pilha de avatares (card do projeto). */
export function AvataresMembros({ membros, max = 5 }: { membros: Membro[]; max?: number }) {
  if (membros.length === 0) return <span className="text-caption text-zinc-500">Sem membros</span>;
  const extra = membros.length - max;
  return (
    <div className="flex items-center -space-x-1">
      {membros.slice(0, max).map(m => <Avatar key={m.id} m={m} />)}
      {extra > 0 && (
        <div style={{ borderColor: ANEL }} className="size-6 shrink-0 rounded-full bg-zinc-800 border-2 flex items-center justify-center text-[10px] leading-none font-semibold text-zinc-300">
          +{extra}
        </div>
      )}
    </div>
  );
}

/** Avatares + painel para ver, adicionar e remover membros (dentro do projeto). */
export default function MembrosProjeto({ projetoId, tarefasDoProjeto, podeEditar }: {
  projetoId: string;
  tarefasDoProjeto: Task[];
  podeEditar: boolean;
}) {
  const { allUsers } = useAuth();
  const { alterarMembro } = useMarketingProjetos();
  const membros = useMembrosProjeto(projetoId, tarefasDoProjeto);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const alternar = async (userId: string, membro: boolean) => {
    setErro(null);
    try { await alterarMembro(projetoId, userId, membro); }
    catch (e: any) { setErro(e.message); }
  };

  const cadastrados = new Set(membros.filter(m => m.cadastrado).map(m => m.id));
  const candidatos = allUsers
    .filter(u => !cadastrados.has(u.id) && u.name.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className={`${pilula(membros.length ? 'cheia' : 'vazia')} !pl-1.5`}
        title="Membros do projeto"
        aria-expanded={aberto}
      >
        {membros.length > 0 ? <AvataresMembros membros={membros} max={6} /> : <span className="pl-1.5">Membros</span>}
        {podeEditar && <UserPlus size={14} className="shrink-0 text-zinc-400" aria-hidden />}
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-1.5 w-72 bg-[#121214] border border-zinc-800 rounded-lg shadow-2xl z-50">
          <div className="px-3 py-2.5 border-b border-zinc-800/80 text-caption font-semibold text-zinc-200">
            Membros ({membros.length})
          </div>
          <div className="max-h-56 overflow-y-auto scrollbar-thin py-1">
            {membros.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-3 py-1.5">
                <Avatar m={m} tamanho={24} />
                <div className="flex-1 min-w-0">
                  <div className="text-caption text-zinc-200 truncate">{m.name}</div>
                  <div className="text-caption text-zinc-500">
                    {m.cadastrado ? 'Membro' : 'Com tarefa'}
                    {m.tarefas > 0 && ` · ${m.tarefas} tarefa${m.tarefas > 1 ? 's' : ''}`}
                  </div>
                </div>
                {podeEditar && (m.cadastrado ? (
                  <button onClick={() => alternar(m.id, false)} className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800/60" title="Remover do projeto">
                    <X size={12} />
                  </button>
                ) : (
                  <button onClick={() => alternar(m.id, true)} className="p-1 text-zinc-500 hover:text-emerald-400 rounded hover:bg-zinc-800/60" title="Cadastrar como membro">
                    <Check size={12} />
                  </button>
                ))}
              </div>
            ))}
            {membros.length === 0 && <p className="px-3 py-2 text-caption text-zinc-600">Ninguém neste projeto ainda.</p>}
          </div>

          {podeEditar && (
            <div className="border-t border-zinc-800/80 p-2">
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Adicionar pessoa..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-caption text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <div className="max-h-40 overflow-y-auto scrollbar-thin mt-1">
                {candidatos.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { alternar(u.id, true); setBusca(''); }}
                    className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-zinc-800/60 text-left"
                  >
                    <Avatar m={u} tamanho={20} />
                    <span className="text-caption text-zinc-300 truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {erro && <p className="px-3 pb-2 text-caption text-red-400">{erro}</p>}
        </div>
      )}
    </div>
  );
}

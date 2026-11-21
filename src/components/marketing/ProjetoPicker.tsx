import React, { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useMarketingProjetos, limiteDoProjeto, formatarData } from '../../lib/marketingProjetos';

/** Campo "Projeto" da tarefa: em qual projeto de Marketing ela está. */
export default function ProjetoPicker({ taskId, dueDate, disabled }: { taskId: string; dueDate?: string; disabled?: boolean }) {
  const { projetos, portfolios, projetoDaTarefa, vincularTarefa } = useMarketingProjetos();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atual = projetos.find(p => p.id === projetoDaTarefa[taskId]);

  const escolher = async (id: string | null) => {
    setAberto(false);
    setErro(null);
    // O prazo da tarefa precisa caber na entrega do projeto escolhido.
    const limite = id ? limiteDoProjeto(projetos.find(p => p.id === id), portfolios) : null;
    if (limite && dueDate && dueDate.slice(0, 10) > limite) {
      setErro(`O prazo da tarefa passa da entrega deste projeto (${formatarData(limite)}). Ajuste o prazo antes.`);
      return;
    }
    try { await vincularTarefa(taskId, id); }
    catch (e: any) { setErro(e.message); }
  };

  return (
    <div className="flex flex-col gap-1.5 relative min-w-[140px]">
      <span className="text-zinc-500 font-medium font-sans flex items-center gap-1.5"><FolderOpen size={13} className="opacity-60" /> Projeto</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAberto(!aberto)}
        onBlur={() => setTimeout(() => setAberto(false), 200)}
        className="inline-flex items-center justify-between gap-1.5 text-[10px] font-sans font-medium px-2 py-1 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 min-h-[26px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-1.5 truncate max-w-[150px]">
          {atual && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: atual.cor }} />}
          {atual?.nome || 'Nenhum'}
        </span>
        <span className="text-[10px] opacity-60 ml-1">▼</span>
      </button>
      {erro && <span className="text-[10px] text-red-400 max-w-[200px]">{erro}</span>}

      {aberto && (
        <div className="absolute top-full left-0 w-full min-w-[180px] mt-1.5 bg-[#121214] border border-zinc-800 rounded-[8px] shadow-2xl p-1.5 z-50 flex flex-col gap-1 max-h-[220px] overflow-y-auto scrollbar-thin">
          <button onMouseDown={e => e.preventDefault()} onClick={() => escolher(null)} className="w-full text-left text-[10px] px-2 py-1.5 rounded text-zinc-500 hover:bg-zinc-800/60">
            Nenhum
          </button>
          {projetos.filter(p => p.status !== 'concluido' || p.id === atual?.id).map(p => (
            <button
              key={p.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => escolher(p.id)}
              className="w-full flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.cor }} />
              <span className="truncate">{p.nome}</span>
            </button>
          ))}
          {projetos.length === 0 && <span className="text-[10px] text-zinc-600 px-2 py-1">Nenhum projeto criado.</span>}
        </div>
      )}
    </div>
  );
}

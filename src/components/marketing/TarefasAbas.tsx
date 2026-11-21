import React from 'react';
import { ArrowLeft, Columns3, List, Calendar, Pencil, Briefcase } from 'lucide-react';
import type { ModoTarefas } from '../../lib/navegacao';

const MODOS: { id: ModoTarefas; label: string; icon: typeof Columns3 }[] = [
  { id: 'board', label: 'Kanban', icon: Columns3 },
  { id: 'list', label: 'Lista compacta', icon: List },
  { id: 'calendar', label: 'Calendário', icon: Calendar },
];

/** Cabeçalho das telas de tarefas: título (projeto, Minhas tarefas...) e as vistas. */
export default function TarefasAbas({ titulo, cor, subtitulo, portfolio, direita, modo, onModo, onVoltar, onEditar }: {
  titulo: string;
  cor?: string;
  subtitulo?: string;
  /** Portfólio do projeto aberto, mostrado ao lado do nome. */
  portfolio?: { nome: string; cor: string } | null;
  /** Conteúdo à direita do título (ex.: membros do projeto). */
  direita?: React.ReactNode;
  modo: ModoTarefas;
  onModo: (m: ModoTarefas) => void;
  onVoltar?: () => void;
  onEditar?: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-zinc-800/60 bg-[#08080a]">
      <div className="flex items-center gap-2 view-pad-x pt-3.5 short:pt-2.5">
        {onVoltar && (
          <button onClick={onVoltar} className="p-1 -ml-1 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-900" title="Voltar para Projetos">
            <ArrowLeft size={15} />
          </button>
        )}
        {cor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />}
        <h1 className="text-[15px] font-semibold text-zinc-100 truncate">{titulo}</h1>
        {portfolio && (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-300 bg-zinc-900/80 border border-zinc-800 px-2 py-0.5 rounded-md shrink-0" title="Portfólio">
            <Briefcase size={11} className="text-zinc-500" />
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: portfolio.cor }} />
            {portfolio.nome}
          </span>
        )}
        {subtitulo && <span className="text-[12px] text-zinc-500 truncate hidden lg:inline">{subtitulo}</span>}
        {onEditar && (
          <button onClick={onEditar} className="p-1 text-zinc-600 hover:text-zinc-200 rounded hover:bg-zinc-900 shrink-0" title="Editar projeto">
            <Pencil size={12} />
          </button>
        )}
        {direita && <div className="ml-auto shrink-0">{direita}</div>}
      </div>
      <div className="flex items-center gap-5 view-pad-x mt-2.5 short:mt-1.5 overflow-x-auto no-scrollbar">
        {MODOS.map(m => {
          const Icon = m.icon;
          const ativo = modo === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onModo(m.id)}
              className={`flex items-center gap-1.5 pb-2.5 short:pb-2 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                ativo ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              <Icon size={13} /> {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

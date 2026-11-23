import React from 'react';

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';

export interface OpcaoSegmentada<T extends string> {
  id: T;
  label: string;
  /** Número ao lado do rótulo (ex.: Atrasadas 7). */
  contagem?: number;
}

/**
 * Controle segmentado para filtrar dentro de uma visão (ex.: Início).
 * Trocar de visão (Lista/Kanban/...) é papel das abas com sublinhado.
 */
export default function ControleSegmentado<T extends string>({ opcoes, valor, onChange, ariaLabel }: {
  opcoes: OpcaoSegmentada<T>[];
  /** `null` = nenhuma opção ativa (ex.: filtro transitório por status). */
  valor: T | null;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0c0c0e] border border-zinc-900" role="tablist" aria-label={ariaLabel}>
      {opcoes.map(o => {
        const ativa = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => onChange(o.id)}
            // Ativa = fundo preenchido + texto em contraste total (zinc-100 é
            // texto claro no escuro e texto escuro no claro; zinc-950 inverte).
            className={`inline-flex items-center gap-1.5 h-7 [@media(pointer:coarse)]:h-10 px-3 whitespace-nowrap rounded-md text-body font-medium transition-colors ${EASE} ${FOCO} ${
              ativa ? 'bg-zinc-100 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#161619]'
            }`}
          >
            {o.label}
            {o.contagem !== undefined && <span className="tabular-nums">{o.contagem}</span>}
          </button>
        );
      })}
    </div>
  );
}

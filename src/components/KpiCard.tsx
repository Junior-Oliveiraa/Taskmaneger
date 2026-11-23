// Card de indicador do Início e de Projetos.
import React from 'react';
import type { LucideIcon } from 'lucide-react';

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';
const CARD = 'bg-[#121214] rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]';
const CARD_BORDA = 'border border-zinc-900';

/** Link do rodapé. */
export const LINK_KPI = `inline-flex items-center gap-1 rounded text-caption font-medium text-zinc-400 hover:text-zinc-100 transition-colors ${FOCO}`;
/** Botão do rodapé do card em alerta. */
export const BOTAO_KPI = `inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-3 -ml-0.5 rounded-lg border border-white/10 text-body font-medium text-zinc-100 hover:bg-[#1f1f23] active:scale-[0.98] transition ${EASE} ${FOCO}`;

/**
 * Card da linha de indicadores. Todos com o mesmo padding, raio e cabeçalho
 * (ícone + título no mesmo eixo); o rodapé fica preso embaixo para os cards da
 * linha terminarem alinhados mesmo com conteúdos de alturas diferentes.
 */
export default function KpiCard({ icone: Icone, titulo, alerta, acao, rodape, children }: {
  icone: LucideIcon;
  titulo: string;
  alerta?: boolean;
  acao?: React.ReactNode;
  rodape?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className={`relative h-full flex flex-col gap-3 p-4 ${CARD} ${alerta ? 'border border-red-500/30' : CARD_BORDA}`}
      style={alerta ? {
        backgroundImage: 'radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--color-red-500) 10%, transparent), transparent 70%)',
      } : undefined}
    >
      <header className="flex items-center gap-2.5 h-8">
        <span className={`size-8 shrink-0 inline-flex items-center justify-center rounded-lg border ${
          alerta ? 'bg-red-500/10 border-red-500/25 text-red-400' : 'bg-[#1f1f23] border-white/10 text-zinc-300'
        }`}>
          <Icone size={16} aria-hidden />
        </span>
        <h2 className="text-body font-medium text-zinc-300 truncate">{titulo}</h2>
        {acao && <div className="ml-auto shrink-0">{acao}</div>}
      </header>
      {children}
      {rodape && <div className="mt-auto pt-1 min-h-5 flex items-center">{rodape}</div>}
    </section>
  );
}

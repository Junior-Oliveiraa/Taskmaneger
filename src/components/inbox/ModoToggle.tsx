// Toggle de modo da Caixa de entrada: Pendentes | Histórico. Fica no início da
// barra de filtros e nunca recolhe em "Filtros · n".
import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Archive, Inbox } from 'lucide-react';
import type { Aba } from '../../lib/inboxFiltros';

const MODOS = [
  { valor: 'pendentes', rotulo: 'Pendentes', Icone: Inbox },
  { valor: 'historico', rotulo: 'Histórico', Icone: Archive },
] as const;

export default function ModoToggle({ modo, onMudar, pendentes, compacto }: {
  modo: Aba;
  onMudar: (m: Aba) => void;
  /** Total de pendentes, sem filtros. */
  pendentes: number;
  /** Só ícones; o rótulo vira tooltip. */
  compacto: boolean;
}) {
  const grupo = useRef<HTMLDivElement>(null);
  const menosMovimento = useReducedMotion();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = MODOS.findIndex(m => m.valor === modo) === 0 ? 1 : 0;
    onMudar(MODOS[i].valor);
    grupo.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  };

  return (
    <div
      ref={grupo}
      role="radiogroup"
      aria-label="Modo de visualização"
      onKeyDown={onKeyDown}
      // Contorno por sombra interna: 44 = 4 + 36 + 4, sem a borda roubar altura.
      className="segment-track inline-flex shrink-0 h-11 [@media(pointer:coarse)]:h-12 p-1 rounded-[10px]"
    >
      {MODOS.map(({ valor, rotulo, Icone }) => {
        const ativo = modo === valor;
        const n = valor === 'pendentes' ? pendentes : 0;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={n > 0 ? `${rotulo}, ${n}` : rotulo}
            title={compacto ? rotulo : undefined}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onMudar(valor)}
            className={`group relative isolate h-full inline-flex items-center gap-2 rounded-[7px] text-body font-medium tracking-[0.02em] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
              compacto ? 'px-2.5' : 'px-3.5'
            } ${ativo ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {ativo && (
              <motion.span
                layoutId="inbox-modo"
                aria-hidden
                className="segment-thumb absolute inset-0 -z-10 rounded-[7px]"
                transition={{ duration: menosMovimento ? 0 : 0.2, ease: 'easeOut' }}
              />
            )}
                        <Icone size={16} strokeWidth={2} className={`shrink-0 transition-colors ${ativo ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} aria-hidden />
            {!compacto && rotulo}
          </button>
        );
      })}
    </div>
  );
}

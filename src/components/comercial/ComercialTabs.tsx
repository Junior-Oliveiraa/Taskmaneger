import React from 'react';
import type { Modulo } from '../../lib/permissoes';

// Fica fora de ComercialInicio para o App poder importar a barra sem puxar o
// código das telas do Comercial, que só é baixado quando a aba é aberta.

export type ComercialTab = 'inicio' | 'propostas' | 'vendas' | 'vendas_dashboard' | 'historico';

export const ABAS_COMERCIAL: { id: ComercialTab; label: string; modulo: Modulo }[] = [
  { id: 'inicio',           label: 'Início',           modulo: 'comercial_movimentos' },
  { id: 'propostas',        label: 'Propostas',        modulo: 'comercial_propostas' },
  { id: 'vendas',           label: 'Tabela de Vendas', modulo: 'comercial_tabela' },
  { id: 'vendas_dashboard', label: 'Dashboard',        modulo: 'comercial_dashboard' },
  { id: 'historico',        label: 'Histórico',        modulo: 'comercial_movimentos' },
];

export function ComercialTabBar({ tab, onChange, permitidas }: {
  tab: ComercialTab;
  onChange: (tab: ComercialTab) => void;
  /** Abas que o perfil pode ver; ausente = todas. */
  permitidas?: ComercialTab[];
}) {
  const abas = permitidas ? ABAS_COMERCIAL.filter(a => permitidas.includes(a.id)) : ABAS_COMERCIAL;
  return (
    <div className="flex items-center gap-4 xl:gap-6 view-pad-x pt-4 short:pt-2.5 border-b border-zinc-800/60 shrink-0 overflow-x-auto no-scrollbar bg-[#08080a]">
      {abas.map(a => (
        <button
          key={a.id}
          onClick={() => onChange(a.id)}
          className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${
            tab === a.id ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

import React, { useState } from 'react';
import DesempenhoComercial from './DesempenhoComercial';

type SubAba = 'estoque' | 'desempenho';

const SUB_ABAS: { id: SubAba; label: string }[] = [
  { id: 'estoque', label: 'Estoque e VGV' },
  { id: 'desempenho', label: 'Desempenho' },
];

/** Aba Dashboard do Comercial. `estoque` é o Dashboard de Vendas que já existia. */
export default function ComercialDashboard({ estoque }: { estoque: React.ReactNode }) {
  const [aba, setAba] = useState<SubAba>('estoque');
  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      <div role="tablist" aria-label="Dashboard do Comercial" className="flex items-center gap-1 view-pad-x py-2 border-b border-zinc-900/80 shrink-0">
        {SUB_ABAS.map(a => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              aba === a.id
                ? 'bg-zinc-800/80 text-zinc-100 border-zinc-700/70'
                : 'text-zinc-500 border-transparent hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {aba === 'estoque' ? estoque : <DesempenhoComercial />}
      </div>
    </div>
  );
}

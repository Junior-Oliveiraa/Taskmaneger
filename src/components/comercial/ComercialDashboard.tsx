import React, { useState } from 'react';
import DesempenhoComercial from './DesempenhoComercial';
import MetasComercial from './MetasComercial';

type SubAba = 'estoque' | 'desempenho' | 'metas';

const SUB_ABAS: { id: SubAba; label: string }[] = [
  { id: 'estoque', label: 'Estoque e VGV' },
  { id: 'desempenho', label: 'Desempenho' },
  { id: 'metas', label: 'Metas' },
];

/** Aba Dashboard do Comercial. `estoque` é o Dashboard de Vendas que já existia. */
export default function ComercialDashboard({ estoque }: { estoque: React.ReactNode }) {
  const [aba, setAba] = useState<SubAba>('estoque');
  // Metas fica montada depois da primeira visita: trocar de aba não perde o que não foi salvo.
  const [metasVisitada, setMetasVisitada] = useState(false);
  const abrir = (a: SubAba) => { setAba(a); if (a === 'metas') setMetasVisitada(true); };
  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      <div role="tablist" aria-label="Dashboard do Comercial" className="flex items-center gap-1 view-pad-x py-2 border-b border-zinc-900/80 shrink-0">
        {SUB_ABAS.map(a => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => abrir(a.id)}
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
        {aba === 'estoque' && estoque}
        {aba === 'desempenho' && <DesempenhoComercial />}
        {metasVisitada && (
          <div className={aba === 'metas' ? 'h-full' : 'hidden'}>
            <MetasComercial />
          </div>
        )}
      </div>
    </div>
  );
}

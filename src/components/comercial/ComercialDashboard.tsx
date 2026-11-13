import React, { useEffect, useState } from 'react';
import DesempenhoComercial from './DesempenhoComercial';
import MetasComercial from './MetasComercial';
import type { ComercialDashboardTab } from './ComercialTabs';
import { usePermissoes } from '../../lib/permissoes';

/**
 * Abas Dashboard, Estoque e VGV e Metas do Comercial. A aba é escolhida na
 * barra principal; `estoque` é o Dashboard de Vendas que já existia.
 */
export default function ComercialDashboard({ aba, estoque }: { aba: ComercialDashboardTab; estoque: React.ReactNode }) {
  // Metas fica montada depois da primeira visita: trocar de aba não perde o que não foi salvo.
  // Metas é só do master; a barra já esconde a aba, isto cobre um estado antigo.
  const { isMaster } = usePermissoes();
  const [metasVisitada, setMetasVisitada] = useState(aba === 'vendas_metas');
  useEffect(() => { if (aba === 'vendas_metas') setMetasVisitada(true); }, [aba]);
  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      <div className="flex-1 min-h-0">
        {aba === 'vendas_dashboard' && <DesempenhoComercial />}
        {aba === 'vendas_estoque' && estoque}
        {metasVisitada && isMaster && (
          <div className={aba === 'vendas_metas' ? 'h-full' : 'hidden'}>
            <MetasComercial />
          </div>
        )}
      </div>
    </div>
  );
}

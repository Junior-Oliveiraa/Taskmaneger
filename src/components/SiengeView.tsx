import React, { useMemo, useState } from 'react';
import { SiengeTitle, SiengeMensalidade, SiengeLote, SiengeFatura, Project, SiengeAlcadaConfig, SiengeCategoriaOrcamento, SiengeTitleStatusHistoryEntry, SiengeProjectTotal, SiengeProjectDisplay, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao, SiengeTabelaVendaConfig, SiengeTabelaVendaColuna, SiengeTabelaVendaRevisao, SiengeVenda, SiengeOrcamentoConfig, SiengeCalculoRegra, SiengeValidacao, SiengeVendaSituacao } from '../types';
import { SiengeTaxonomy } from '../lib/siengeCategorias';
import SiengeKanban from './SiengeKanban';
import SiengeLotes from './SiengeLotes';
import SiengeFaturas from './SiengeFaturas';
import SiengeMetasDashboard from './SiengeMetasDashboard';
import SiengeVendasModal from './SiengeVendasModal';
import SiengeVendasDashboard from './SiengeVendasDashboard';
import ComercialDashboard from './comercial/ComercialDashboard';
import { useAuth } from '../context/AuthContext';

// Exportado: o Sidebar usa o mesmo e-mail para decidir se mostra "Tabela de
// Vendas" como item próprio do menu — mesma regra de acesso de sempre, só que
// checada num lugar novo agora que a aba saiu daqui.
export const METAS_DASHBOARD_EMAIL = 'cidnei@uchoaempreendimentos.com.br';

// Administradores (permissionLevel 1) enxergam tudo; fora deles, só o e-mail
// acima tem acesso às telas de vendas e metas.
export const canAccessMetasDashboard = (user?: { email?: string; permissionLevel?: number } | null) =>
  !!user && (Number(user.permissionLevel) === 1 || user.email === METAS_DASHBOARD_EMAIL);

interface SiengeViewProps {
  titles: SiengeTitle[];
  statusHistory: SiengeTitleStatusHistoryEntry[];
  lotes: SiengeLote[];
  faturas: SiengeFatura[];
  projects: Project[];
  currentProjectFilter: string | null;
  alcadaConfig: SiengeAlcadaConfig;
  onSaveTitle: (title: SiengeTitle) => void;
  onDeleteTitle: (id: string) => void;
  onSaveLote: (lote: SiengeLote) => void;
  onDeleteLote: (id: string) => void;
  onSaveFatura: (fatura: SiengeFatura) => void;
  onDeleteFatura: (id: string) => void;
  onSaveAlcadaConfig: (config: SiengeAlcadaConfig) => Promise<void> | void;
  editingMap?: Record<string, { name: string; avatarUrl?: string; color: string }>;
  onTitlePresence?: (titleId: string | null) => void;
  categoriaOrcamento: SiengeCategoriaOrcamento[];
  projectTotais: SiengeProjectTotal[];
  projectDisplays: SiengeProjectDisplay[];
  onSaveCategoriaOrcamento: (item: SiengeCategoriaOrcamento) => void;
  onDeleteCategoriaOrcamento: (id: string) => void;
  onSaveProjectTotal: (total: SiengeProjectTotal) => void;
  tabelaVendas: SiengeTabelaVendaUnidade[];
  tabelaVendaVersoes: SiengeTabelaVendaVersao[];
  tabelaVendaConfigs: SiengeTabelaVendaConfig[];
  onSaveTabelaVendaVersao: (versao: SiengeTabelaVendaVersao) => Promise<void> | void;
  onDuplicarTabelaVendaVersao: (versaoId: string, nome?: string) => Promise<void> | void;
  onDefinirVersaoPrincipal: (versaoId: string) => Promise<void> | void;
  onDeleteTabelaVendaVersao: (versaoId: string) => Promise<void> | void;
  onSaveTabelaVendaConfig: (config: SiengeTabelaVendaConfig) => Promise<void> | void;
  tabelaVendaRevisoes: SiengeTabelaVendaRevisao[];
  onSaveTabelaVenda: (item: SiengeTabelaVendaUnidade) => void;
  onDeleteTabelaVenda: (id: string) => void;
  onClearTabelaVenda: (projectId: string) => Promise<void> | void;
  onApplyTabelaVendaReajuste: (params: { projectId: string; versaoId: string; unidadeIds: string[] | null; percentual: number; descricao: string | null; motivo: string; colunas: string[] }) => Promise<void> | void;
  onSetTabelaVendaMargem: (params: { projectId: string; versaoId: string; unidadeIds: string[] | null; coluna: string; valor: number }) => Promise<void> | void;
  onReverterTabelaVendaRevisao: (revisaoId: string) => Promise<void> | void;
  onAlterarSituacaoUnidades: (params: {
    projectId: string;
    unidadeIds: string[];
    situacao: SiengeVendaSituacao;
    motivo: string;
    comprador: string | null;
    data: string | null;
  }) => Promise<void> | void;
  vendas: SiengeVenda[];
  orcamentoConfig?: SiengeOrcamentoConfig;
  onSaveOrcamentoConfig: (config: SiengeOrcamentoConfig) => void;
  tabelaVendaColunas: SiengeTabelaVendaColuna[];
  onSaveTabelaVendaColuna: (coluna: SiengeTabelaVendaColuna) => void;
  onDeleteTabelaVendaColuna: (id: string) => void;
  calculoRegras: SiengeCalculoRegra[];
  onSaveCalculoRegra: (regra: SiengeCalculoRegra) => void;
  onDeleteCalculoRegra: (id: string) => void;
  validacoes: SiengeValidacao[];
  onSaveValidacao: (validacao: SiengeValidacao) => void;
  onDeleteValidacao: (id: string) => void;
  taxonomy: SiengeTaxonomy;
  onAddCentroCusto: (nome: string) => Promise<void> | void;
  onAddCategoria: (centroCusto: string, categoria: string) => Promise<void> | void;
  onRenameCategoria: (id: string, categoria: string) => Promise<void> | void;
  onDeleteCategoria: (id: string) => Promise<void> | void;
  onAddSubcategoria: (categoriaId: string, subcategoria: string) => Promise<void> | void;
  onDeleteSubcategoria: (id: string) => Promise<void> | void;
  mensalidades: SiengeMensalidade[];
  onSaveMensalidade: (m: SiengeMensalidade) => void;
  onDeleteMensalidade: (id: string) => void;
  /**
   * Presente quando esta instância está servindo o item "Tabela de Vendas" do
   * menu lateral, não a aba de dentro de Finanças: esconde a barra de abas
   * (não há o que trocar) e trava o conteúdo nela, ignorando o estado interno
   * de aba. As duas rotas compartilham o mesmo componente para não duplicar a
   * fiação enorme de handlers que o App.tsx já monta uma vez.
   */
  forcedTab?: 'vendas' | 'vendas_dashboard';
}

export default function SiengeView({
  titles, statusHistory, lotes, faturas, projects, currentProjectFilter, alcadaConfig,
  onSaveTitle, onDeleteTitle, onSaveLote, onDeleteLote, onSaveFatura, onDeleteFatura, onSaveAlcadaConfig,
  editingMap, onTitlePresence,
  categoriaOrcamento, projectTotais, projectDisplays, onSaveCategoriaOrcamento, onDeleteCategoriaOrcamento, onSaveProjectTotal,
  tabelaVendas, tabelaVendaVersoes, tabelaVendaConfigs, onSaveTabelaVendaVersao, onDuplicarTabelaVendaVersao, onDefinirVersaoPrincipal, onDeleteTabelaVendaVersao, onSaveTabelaVendaConfig, tabelaVendaRevisoes, onSaveTabelaVenda, onDeleteTabelaVenda, onClearTabelaVenda, onApplyTabelaVendaReajuste, onSetTabelaVendaMargem, onReverterTabelaVendaRevisao, onAlterarSituacaoUnidades,
  vendas, orcamentoConfig, onSaveOrcamentoConfig,
  tabelaVendaColunas, onSaveTabelaVendaColuna, onDeleteTabelaVendaColuna, calculoRegras, onSaveCalculoRegra, onDeleteCalculoRegra,
  validacoes, onSaveValidacao, onDeleteValidacao,
  taxonomy, onAddCentroCusto, onAddCategoria, onRenameCategoria, onDeleteCategoria, onAddSubcategoria, onDeleteSubcategoria,
  mensalidades, onSaveMensalidade, onDeleteMensalidade,
  forcedTab,
}: SiengeViewProps) {
  const [activeTab, setActiveTab] = useState<'titulos' | 'lotes' | 'faturas' | 'metas' | 'vendas' | 'vendas_dashboard'>('titulos');
  const openLotes = lotes.filter(l => l.status === 'aberto');
  const openFaturas = faturas.filter(f => f.status === 'aberto');
  const { currentUser } = useAuth();
  const showMetasTab = canAccessMetasDashboard(currentUser);
  const tab = forcedTab ?? activeTab;

  // Mesma regra de visibilidade/ordem usada no Dashboard Analítico — empreendimentos
  // ocultados (sienge_project_display) também somem da Tabela de Vendas.
  const visibleProjects = useMemo(() => {
    const displayOf = (id: string) => projectDisplays.find(d => d.projectId === id);
    return projects
      .filter(p => !displayOf(p.id)?.hidden)
      .sort((a, b) => {
        const oa = displayOf(a.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const ob = displayOf(b.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return projects.indexOf(a) - projects.indexOf(b);
      });
  }, [projects, projectDisplays]);

  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      {/* View Header with Tabs — ausente no modo dedicado: lá a navegação é o
          próprio menu lateral, e uma barra de abas com uma aba só seria ruído. */}
      {!forcedTab && (
      <div className="flex items-center gap-4 xl:gap-6 view-pad-x pt-4 short:pt-2.5 border-b border-zinc-800/60 shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('titulos')}
          className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${
            activeTab === 'titulos'
              ? 'text-zinc-100 border-blue-500'
              : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          Títulos
        </button>
        <button
          onClick={() => setActiveTab('lotes')}
          className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'lotes'
              ? 'text-zinc-100 border-blue-500'
              : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          Lotes de Pagamento
          {openLotes.length > 0 && (
            <span className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {openLotes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('faturas')}
          className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'faturas'
              ? 'text-zinc-100 border-blue-500'
              : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          Cartão de Crédito
          {openFaturas.length > 0 && (
            <span className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {openFaturas.length}
            </span>
          )}
        </button>
        {showMetasTab && (
          <button
            onClick={() => setActiveTab('metas')}
            className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              activeTab === 'metas'
                ? 'text-zinc-100 border-blue-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            Dashboard Analítico
          </button>
        )}
      </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {tab === 'titulos' ? (
          <SiengeKanban
            titles={titles}
            openLotes={openLotes}
            openFaturas={openFaturas}
            projects={projects}
            currentProjectFilter={currentProjectFilter}
            alcadaConfig={alcadaConfig}
            onSave={onSaveTitle}
            onDelete={onDeleteTitle}
            onSaveAlcadaConfig={onSaveAlcadaConfig}
            editingMap={editingMap}
            onTitlePresence={onTitlePresence}
            taxonomy={taxonomy}
            onAddCentroCusto={onAddCentroCusto}
            onAddCategoria={onAddCategoria}
            onRenameCategoria={onRenameCategoria}
            onDeleteCategoria={onDeleteCategoria}
            onAddSubcategoria={onAddSubcategoria}
            onDeleteSubcategoria={onDeleteSubcategoria}
            mensalidades={mensalidades}
            onSaveMensalidade={onSaveMensalidade}
            onDeleteMensalidade={onDeleteMensalidade}
          />
        ) : tab === 'lotes' ? (
          <SiengeLotes
            lotes={lotes}
            titles={titles}
            statusHistory={statusHistory}
            onSaveLote={onSaveLote}
            onDeleteLote={onDeleteLote}
          />
        ) : tab === 'faturas' ? (
          <SiengeFaturas
            faturas={faturas}
            titles={titles}
            onSaveFatura={onSaveFatura}
            onDeleteFatura={onDeleteFatura}
            onSaveTitle={onSaveTitle}
            onDeleteTitle={onDeleteTitle}
            openLotes={openLotes}
            projects={projects}
            taxonomy={taxonomy}
          />
        ) : tab === 'vendas_dashboard' ? (
          <ComercialDashboard
            estoque={
              <SiengeVendasDashboard
                projects={visibleProjects}
                unidades={tabelaVendas}
                versoes={tabelaVendaVersoes}
              />
            }
          />
        ) : tab === 'vendas' ? (
          <SiengeVendasModal
            projects={visibleProjects}
            unidades={tabelaVendas}
            revisoes={tabelaVendaRevisoes}
            vendas={vendas}
            colunas={tabelaVendaColunas}
            regras={calculoRegras}
            onSaveUnidade={onSaveTabelaVenda}
            onDeleteUnidade={onDeleteTabelaVenda}
            onClearUnidades={onClearTabelaVenda}
            versoes={tabelaVendaVersoes}
            versaoConfigs={tabelaVendaConfigs}
            onSaveVersao={onSaveTabelaVendaVersao}
            onDuplicarVersao={onDuplicarTabelaVendaVersao}
            onDefinirVersaoPrincipal={onDefinirVersaoPrincipal}
            onDeleteVersao={onDeleteTabelaVendaVersao}
            onSaveVersaoConfig={onSaveTabelaVendaConfig}
            onApplyReajuste={onApplyTabelaVendaReajuste}
            onSetMargem={onSetTabelaVendaMargem}
            onReverterRevisao={onReverterTabelaVendaRevisao}
            onAlterarSituacao={onAlterarSituacaoUnidades}
            onSaveColuna={onSaveTabelaVendaColuna}
            onDeleteColuna={onDeleteTabelaVendaColuna}
            onSaveRegra={onSaveCalculoRegra}
            onDeleteRegra={onDeleteCalculoRegra}
            validacoes={validacoes}
            onSaveValidacao={onSaveValidacao}
            onDeleteValidacao={onDeleteValidacao}
          />
        ) : (
          <SiengeMetasDashboard
            titles={titles}
            projects={projects}
            categoriaOrcamento={categoriaOrcamento}
            projectTotais={projectTotais}
            onSaveCategoriaOrcamento={onSaveCategoriaOrcamento}
            onDeleteCategoriaOrcamento={onDeleteCategoriaOrcamento}
            onSaveProjectTotal={onSaveProjectTotal}
            tabelaVendas={tabelaVendas}
            vendas={vendas}
            orcamentoConfig={orcamentoConfig}
            onSaveOrcamentoConfig={onSaveOrcamentoConfig}
            taxonomy={taxonomy}
          />
        )}
      </div>
    </div>
  );
}

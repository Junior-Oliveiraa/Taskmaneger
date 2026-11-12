import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Building2, ChevronDown, Check, PieChart, TrendingUp, TrendingDown, Minus, Target, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Project, SiengeTitle, SiengeCategoriaOrcamento, SiengeProjectTotal, SiengeTabelaVendaUnidade, SiengeVenda, SiengeOrcamentoConfig } from '../types';
import { useAuth } from '../context/AuthContext';
import MonthFilterDropdown, { MonthFilterValue } from './MonthFilterDropdown';
import { MONTHS_FULL } from './MonthSelectDropdown';
import { fetchMetasComercial, metasParaOrcamento, projetosDasMetas } from '../lib/comercialMetas';
import SiengeAlocacaoModal from './SiengeAlocacaoModal';
import SiengeSpendChart from './SiengeSpendChart';
import { analyzeProjectsForPeriod, buildCategoriasBase } from '../lib/siengeMetasAnalysis';
import { CENTRO_CUSTO_LABELS, SiengeTaxonomy } from '../lib/siengeCategorias';
import { analyzeProjectBudgetReal, analyzeProjectBudgetPeriodo, categoriaKey, getRitmoMes, getTitulosNoPeriodo, ORCAMENTO_PCT, RitmoMes } from '../lib/siengeVendasBudget';

import { usePermissoes } from '../lib/permissoes';

interface SiengeMetasDashboardProps {
  titles: SiengeTitle[];
  projects: Project[];
  categoriaOrcamento: SiengeCategoriaOrcamento[];
  projectTotais: SiengeProjectTotal[];
  onSaveCategoriaOrcamento: (item: SiengeCategoriaOrcamento) => void;
  onDeleteCategoriaOrcamento: (id: string) => void;
  onSaveProjectTotal: (total: SiengeProjectTotal) => void;
  tabelaVendas: SiengeTabelaVendaUnidade[];
  vendas: SiengeVenda[];
  orcamentoConfig?: SiengeOrcamentoConfig;
  onSaveOrcamentoConfig: (config: SiengeOrcamentoConfig) => void;
  taxonomy: SiengeTaxonomy;
}

const RITMO_LABELS: Record<RitmoMes, string> = { acima: 'Acima do ritmo', dentro: 'Dentro do esperado', abaixo: 'Abaixo do ritmo' };
const RITMO_STYLES: Record<RitmoMes, string> = {
  acima: 'text-red-400 bg-red-500/10 border-red-500/20',
  dentro: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  abaixo: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
};
const RITMO_ICONS: Record<RitmoMes, typeof TrendingUp> = { acima: TrendingUp, dentro: Minus, abaixo: TrendingDown };

// ─── Vocabulário visual da barra de filtros ───────────────────────────────
// O mesmo da Lista Compacta: rótulo em mono maiúsculo antes de cada grupo,
// opções em pílula dentro de um trilho arredondado, paleta zinc e tudo dentro
// de um card. Antes esta tela falava um dialeto só dela (paleta em hex própria,
// 11px contra 12px, com e sem borda), e duas telas do mesmo app não deveriam
// precisar ser reaprendidas uma depois da outra.
const FILTER_LABEL = 'text-[10px] font-mono uppercase text-zinc-500 font-semibold shrink-0';
const PILL_GROUP = 'flex items-center gap-1.5 bg-zinc-900/40 p-1 rounded-full border border-zinc-800/50 shrink-0';
const PILL = 'px-2.5 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap';
const PILL_ON = 'bg-zinc-800 text-zinc-100 shadow-sm';
const PILL_OFF = 'bg-transparent text-zinc-500 hover:text-zinc-300';

// Gatilhos de dropdown e botões de ação: mesma pílula dos grupos, agora como
// controle único. O azul translúcido é o mesmo acento que a Lista Compacta usa
// no toggle ativo — chapado (bg-blue-600) ele gritava no meio da paleta zinc.
const CTRL = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-medium transition-all shrink-0';
const CTRL_NEUTRAL = `${CTRL} bg-zinc-900/40 text-zinc-500 border-zinc-800/50 hover:text-zinc-300`;
const CTRL_PRIMARY = `${CTRL} bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/15`;

// Popover: o mesmo do menu "Colunas" da Lista Compacta.
const MENU_SURFACE = 'bg-[#121214] border border-zinc-800 rounded-lg shadow-xl z-50 animate-fade-in';
const MENU_ITEM = 'w-full flex items-center justify-between px-3 py-2 text-[11px] transition-colors';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}%`;
}

function ProjectFilterDropdown({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = value === 'all' ? null : projects.find(p => p.id === value);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(p => !p)}
        className={`${isOpen ? `${CTRL} bg-zinc-800 text-zinc-200 border-zinc-700` : CTRL_NEUTRAL} w-[190px]`}
      >
        <Building2 size={12} className="shrink-0" />
        <span className="truncate flex-1 text-left">{selected ? selected.name : 'Todos os Empreendimentos'}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`${MENU_SURFACE} absolute right-0 top-full mt-2 w-[220px] origin-top-right flex flex-col p-1 max-h-[280px] overflow-y-auto no-scrollbar`}>
            <button
              onClick={() => { onChange('all'); setIsOpen(false); }}
              className={`${MENU_ITEM} rounded ${value === 'all' ? 'text-blue-400' : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'}`}
            >
              <span>Todos os Empreendimentos</span>
              {value === 'all' && <Check size={13} />}
            </button>
            {projects.length > 0 && <div className="h-px bg-zinc-800 my-1 mx-2" />}
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => { onChange(p.id); setIsOpen(false); }}
                className={`${MENU_ITEM} rounded ${value === p.id ? 'text-blue-400' : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'}`}
              >
                <span className="truncate pr-2 text-left">{p.name}</span>
                {value === p.id && <Check size={13} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function SiengeMetasDashboard({
  titles, projects, categoriaOrcamento, projectTotais,
  onSaveCategoriaOrcamento, onDeleteCategoriaOrcamento, onSaveProjectTotal,
  tabelaVendas,
  vendas, orcamentoConfig, onSaveOrcamentoConfig, taxonomy,
}: SiengeMetasDashboardProps) {
  const { currentUser } = useAuth();
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<MonthFilterValue>({ year: now.getFullYear(), month: now.getMonth() });
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [showAlocacaoPanel, setShowAlocacaoPanel] = useState(false);
  /** Linha aberta no comparativo (chave da categoria), com os títulos que a compõem. */
  const [openCategoria, setOpenCategoria] = useState<string | null>(null);

  const allowed = usePermissoes().pode('financas_orcamento');

  // Metas de VGV: vêm de Comercial > Dashboard > Metas (fonte única). Cada
  // empreendimento das metas aponta para um empreendimento do Orbit.
  const metasQuery = useQuery({ queryKey: ['comercialMetas'], queryFn: fetchMetasComercial, staleTime: 60 * 1000 });
  const projectMetas = useMemo(() => (metasQuery.data ? metasParaOrcamento(metasQuery.data) : []), [metasQuery.data]);

  // Aparecem os empreendimentos do Orbit vinculados a alguma meta comercial, na
  // ordem das colunas da aba Metas.
  const visibleProjects = useMemo(() => {
    const ordem = metasQuery.data ? projetosDasMetas(metasQuery.data) : [];
    const porId = new Map(projects.map(p => [p.id, p]));
    return ordem.map(id => porId.get(id)).filter((p): p is Project => !!p);
  }, [projects, metasQuery.data]);

  const scopedProjects = useMemo(
    () => filterProjectId === 'all' ? visibleProjects : visibleProjects.filter(p => p.id === filterProjectId),
    [visibleProjects, filterProjectId]
  );

  const year = filterMonth?.year ?? now.getFullYear();
  const month = filterMonth?.month ?? null;

  const controleInicio = orcamentoConfig?.controleInicio || now.toISOString().slice(0, 10);

  // Filtro de centro de custo — escopa o dashboard inteiro (cards, gráfico e
  // categorias). Títulos sem centro de custo preenchido ficam de fora enquanto
  // houver filtro ativo; por isso "Visão Geral" existe e não filtra nada.
  const [filterCentroCusto, setFilterCentroCusto] = useState<'marketing' | 'comercial' | 'todos'>('marketing');

  const scopedTitles = useMemo(
    () => filterCentroCusto === 'todos' ? titles : titles.filter(t => t.centroCusto === filterCentroCusto),
    [titles, filterCentroCusto]
  );

  // Alocações do centro filtrado — o orçamento projetado/real do recorte é a soma
  // dos percentuais desse centro, não os 2% cheios do VGV.
  const scopedCategoriaOrcamento = useMemo(
    () => filterCentroCusto === 'todos' ? categoriaOrcamento : categoriaOrcamento.filter(c => c.centroCusto === filterCentroCusto),
    [categoriaOrcamento, filterCentroCusto]
  );

  // Categorias percorridas pela análise: as configuradas em "Alocação de Orçamento"
  // (taxonomia do banco) + as que aparecem em títulos já lançados, para que nenhum
  // gasto fique fora da quebra por categoria.
  const categoriasBase = useMemo(
    () => buildCategoriasBase(taxonomy?.categoriasPorCentro, scopedTitles)
      .filter(c => filterCentroCusto === 'todos' || c.centroCusto === filterCentroCusto),
    [taxonomy, scopedTitles, filterCentroCusto]
  );

  // Fatia do VGV alocada ao centro filtrado, por empreendimento. Sem filtro vale a
  // regra geral dos 2%.
  const pctOrcamentoFor = useMemo(() => {
    // Só alocações de categorias que ainda existem entram na conta. Alocação órfã
    // (categoria apagada) inflava o Orçamento Real do cabeçalho sem ter linha
    // correspondente, e a soma das categorias não fechava com ele.
    const validas = new Set(categoriasBase.filter(c => !c.obsoleta).map(c => categoriaKey(c.centroCusto, c.categoria)));
    const map = new Map<string, number>();
    if (filterCentroCusto !== 'todos') {
      scopedCategoriaOrcamento
        .filter(c => validas.has(categoriaKey(c.centroCusto, c.categoria)))
        .forEach(c => map.set(c.projectId, (map.get(c.projectId) || 0) + (c.percentual || 0)));
    }
    return (projectId: string) =>
      filterCentroCusto === 'todos' ? ORCAMENTO_PCT : (map.get(projectId) || 0) / 100;
  }, [scopedCategoriaOrcamento, filterCentroCusto, categoriasBase]);

  const analysis = useMemo(
    () => analyzeProjectsForPeriod(scopedProjects, scopedTitles, projectMetas, scopedCategoriaOrcamento, year, month, tabelaVendas, controleInicio, categoriasBase),
    [scopedProjects, scopedTitles, projectMetas, scopedCategoriaOrcamento, year, month, tabelaVendas, controleInicio, categoriasBase]
  );

  // Orçamento Projetado (Meta): sempre 2% da meta de VGV do período, independente
  // de como as categorias estão alocadas — mesmo % fixo usado no Teto do Produto
  // e no Orçamento Real Acumulado, para os três serem comparáveis entre si.
  // Com filtro ativo o projetado é a soma do que está alocado ao centro (a.totalOrcamento
  // já é % × VGV meta); sem filtro segue os 2% cheios do VGV.
  const totalBudget = filterCentroCusto === 'todos'
    ? analysis.reduce((s, a) => s + a.vgvMeta, 0) * ORCAMENTO_PCT
    : analysis.reduce((s, a) => s + a.totalOrcamento, 0);

  // Camada 1 (real): até a data de hoje, ou o fim do período filtrado se ele já
  // tiver passado — nunca no futuro (não dá pra "acumular" vendas que ainda não aconteceram).
  const ateData = useMemo(() => {
    const periodEnd = month !== null ? new Date(year, month + 1, 0, 23, 59, 59) : new Date(year, 11, 31, 23, 59, 59);
    return periodEnd < now ? periodEnd : now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const budgetReal = useMemo(
    () => scopedProjects.map(p => analyzeProjectBudgetReal(p, tabelaVendas, vendas, scopedTitles, scopedCategoriaOrcamento, controleInicio, ateData, categoriasBase, pctOrcamentoFor(p.id))),
    [scopedProjects, tabelaVendas, vendas, scopedTitles, scopedCategoriaOrcamento, controleInicio, ateData, categoriasBase, pctOrcamentoFor]
  );
  const budgetRealByProjectId = useMemo(() => new Map(budgetReal.map(b => [b.project.id, b])), [budgetReal]);

  // ─── Cards do mês: recorte fechado do período, não o acumulado. Antes os dois
  // usavam a mesma janela (início do controle → hoje) e, no mês corrente, a faixa
  // de cima repetia exatamente os números da de baixo.
  const deData = useMemo(() => {
    const periodStart = month !== null ? new Date(year, month, 1) : new Date(year, 0, 1);
    const inicio = new Date(`${controleInicio}T00:00:00`);
    // Não há gasto confiável antes do início do controle: a janela nunca começa antes dele.
    return periodStart > inicio ? periodStart : inicio;
  }, [year, month, controleInicio]);

  const budgetPeriodo = useMemo(
    () => scopedProjects.map(p => analyzeProjectBudgetPeriodo(p, vendas, scopedTitles, deData, ateData, pctOrcamentoFor(p.id), categoriasBase)),
    [scopedProjects, vendas, scopedTitles, deData, ateData, pctOrcamentoFor, categoriasBase]
  );

  const budgetPeriodoByProjectId = useMemo(() => new Map(budgetPeriodo.map(b => [b.project.id, b])), [budgetPeriodo]);

  const mesOrcamentoReal = budgetPeriodo.reduce((s, b) => s + b.orcamentoRealPeriodo, 0);
  const mesGastoReal = budgetPeriodo.reduce((s, b) => s + b.gastoRealPeriodo, 0);

  // Estouro/economia do conjunto selecionado, sempre líquido: orçamento total menos
  // gasto total. Antes cada empreendimento ia para um balde (soma dos que estouraram
  // vs soma dos que economizaram) e os dois cards apareciam preenchidos ao mesmo
  // tempo, sem responder "no geral, estamos dentro do orçamento?". Agora a economia
  // de um empreendimento abate o estouro de outro, e o Saving só aparece quando não
  // há estouro nenhum. Com um único empreendimento selecionado o resultado é o mesmo.
  const mesDiferenca = mesOrcamentoReal - mesGastoReal;
  const mesOverspend = Math.max(-mesDiferenca, 0);
  const mesSaving = Math.max(mesDiferenca, 0);

  // ─── Cards do topo: sempre o acumulado geral do ano (ignora o mês do filtro,
  // só respeita o empreendimento selecionado) — quando um empreendimento
  // específico está selecionado, a segunda fileira de cards abaixo é que reflete
  // o mês filtrado.
  const yearlyAnalysis = useMemo(
    () => analyzeProjectsForPeriod(scopedProjects, scopedTitles, projectMetas, scopedCategoriaOrcamento, year, null, tabelaVendas, controleInicio, categoriasBase),
    [scopedProjects, scopedTitles, projectMetas, scopedCategoriaOrcamento, year, tabelaVendas, controleInicio, categoriasBase]
  );
  const yearlyTotalBudget = filterCentroCusto === 'todos'
    ? yearlyAnalysis.reduce((s, a) => s + a.vgvMeta, 0) * ORCAMENTO_PCT
    : yearlyAnalysis.reduce((s, a) => s + a.totalOrcamento, 0);

  const yearlyAteData = useMemo(() => {
    const periodEnd = new Date(year, 11, 31, 23, 59, 59);
    return periodEnd < now ? periodEnd : now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const yearlyBudgetReal = useMemo(
    () => scopedProjects.map(p => analyzeProjectBudgetReal(p, tabelaVendas, vendas, scopedTitles, scopedCategoriaOrcamento, controleInicio, yearlyAteData, categoriasBase, pctOrcamentoFor(p.id))),
    [scopedProjects, tabelaVendas, vendas, scopedTitles, scopedCategoriaOrcamento, controleInicio, yearlyAteData, categoriasBase, pctOrcamentoFor]
  );
  const yearlyTotalOrcamentoReal = yearlyBudgetReal.reduce((s, b) => s + b.orcamentoRealAcumulado, 0);
  const yearlyTotalGastoReal = yearlyBudgetReal.reduce((s, b) => s + b.gastoRealAcumulado, 0);

  // Mesma regra líquida da faixa do período — as duas faixas precisam responder à
  // pergunta do mesmo jeito, senão comparar uma com a outra engana.
  const yearlyDiferenca = yearlyTotalOrcamentoReal - yearlyTotalGastoReal;
  const yearlyTotalOverspend = Math.max(-yearlyDiferenca, 0);
  const yearlyTotalSaving = Math.max(yearlyDiferenca, 0);

  // Ritmo do mês corrente (não do período filtrado) — sinal de alerta contra a
  // meta, nunca decide estouro.
  const currentMonthAnalysis = useMemo(
    () => analyzeProjectsForPeriod(scopedProjects, scopedTitles, projectMetas, scopedCategoriaOrcamento, now.getFullYear(), now.getMonth(), tabelaVendas, controleInicio, categoriasBase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedProjects, scopedTitles, projectMetas, scopedCategoriaOrcamento, tabelaVendas, controleInicio, categoriasBase]
  );
  const ritmo = getRitmoMes(
    currentMonthAnalysis.reduce((s, a) => s + a.totalGasto, 0),
    filterCentroCusto === 'todos'
      ? currentMonthAnalysis.reduce((s, a) => s + a.vgvMeta, 0) * ORCAMENTO_PCT
      : currentMonthAnalysis.reduce((s, a) => s + a.totalOrcamento, 0)
  );
  const RitmoIcon = RITMO_ICONS[ritmo];

  if (!allowed) return null;

  const hasMetas = yearlyAnalysis.length > 0;
  const selectedProject = filterProjectId !== 'all' ? scopedProjects[0] : undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0A0A0A]">
      <AnimatePresence mode="wait">
        {showAlocacaoPanel ? (
          <motion.div
            key="alocacao-panel"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <SiengeAlocacaoModal
              projects={projects}
              categoriaOrcamento={categoriaOrcamento}
              tabelaVendas={tabelaVendas}
              taxonomy={taxonomy}
              onSaveCategoria={onSaveCategoriaOrcamento}
              onDeleteCategoria={onDeleteCategoriaOrcamento}
              onClose={() => setShowAlocacaoPanel(false)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            {/* Título da view */}
            <div className="flex items-center justify-between gap-4 view-pad-x py-4 short:py-2.5 border-b border-zinc-900 shrink-0">
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-zinc-100">Dashboard Analítico</h1>
                <p className="text-[11px] text-zinc-600 mt-0.5 truncate">Comparativo de orçamento de marketing/comercial vs VGV por empreendimento</p>
              </div>
              {/* Pílula, e não controle: é leitura de estado, não coisa em que
                  se clica — daí ficar junto do título e fora da barra. */}
              {hasMetas && (
                <span
                  title="Compara o gasto real do mês contra a projeção por meta — é só um sinal de ritmo, nunca decide estouro."
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap shrink-0 ${RITMO_STYLES[ritmo]}`}
                >
                  <RitmoIcon size={11} className="shrink-0" /> Ritmo do mês: {RITMO_LABELS[ritmo]}
                </span>
              )}
            </div>

            {/* Barra de filtros — mesmo card, mesmos rótulos e mesmas pílulas da
                Lista Compacta. Filtros à esquerda, ações à direita. */}
            <div className="view-pad-x pt-3 short:pt-2 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/50 p-3 short:p-2 rounded-lg border border-zinc-900">
                <div className="flex items-center gap-2 xl:gap-4 flex-wrap">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={FILTER_LABEL}>Centro de Custo:</span>
                    <div className={PILL_GROUP}>
                      {([
                        { value: 'marketing', label: 'Marketing' },
                        { value: 'comercial', label: 'Comercial' },
                        { value: 'todos', label: 'Visão Geral' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFilterCentroCusto(opt.value)}
                          title={opt.value === 'todos' ? 'Marketing e Comercial somados' : `Somente ${opt.label}`}
                          className={`${PILL} ${filterCentroCusto === opt.value ? PILL_ON : PILL_OFF}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={FILTER_LABEL}>Empreendimento:</span>
                    <ProjectFilterDropdown projects={visibleProjects} value={filterProjectId} onChange={setFilterProjectId} />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={FILTER_LABEL}>Período:</span>
                    <MonthFilterDropdown
                      value={filterMonth}
                      onChange={setFilterMonth}
                      allLabel="Ver Todos"
                      triggerClassName={`${CTRL_NEUTRAL} w-[150px]`}
                      menuClassName={MENU_SURFACE}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  <span
                    title="As metas de VGV são cadastradas em Comercial › Dashboard › Metas"
                    className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-zinc-500 whitespace-nowrap"
                  >
                    <Target size={12} className="shrink-0" /> Metas: Comercial › Metas
                  </span>
                  <button onClick={() => setShowAlocacaoPanel(true)} className={CTRL_NEUTRAL}>
                    <PieChart size={12} className="shrink-0" />
                    Alocação de Orçamento
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto view-pad-x view-pad-y flex flex-col view-gap">
              {metasQuery.isLoading ? (
                <div className="flex items-center justify-center py-16 text-[#6B6B70] gap-2 text-sm">
                  <RefreshCw size={16} className="animate-spin" /> Carregando metas
                </div>
              ) : !hasMetas ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#6B6B70] gap-2 text-center">
                  <BarChart3 size={28} strokeWidth={1.5} />
                  <p className="text-sm">
                    {metasQuery.isError ? 'Não foi possível carregar as metas.' : 'Nenhum empreendimento com meta de VGV cadastrada para este período.'}
                  </p>
                  <p className="text-xs text-zinc-600 max-w-md">
                    As metas são cadastradas em Comercial › Dashboard › Metas. Cada empreendimento de lá precisa estar
                    vinculado a um empreendimento do Orbit (menu ⋯ da coluna) para aparecer aqui.
                  </p>
                </div>
              ) : (
                <>
            {/* Empreendimento + mês em escopo — destaque máximo, bem acima de tudo */}
            <h2 className="text-4xl font-semibold text-[#EDEDED] tracking-[-0.02em]">
              {selectedProject && <span>{selectedProject.name} </span>}
              <span className={selectedProject ? 'text-[#6B6B70] font-normal' : ''}>
                {selectedProject && '/ '}{month !== null ? `${MONTHS_FULL[month]} ${year}` : `Ano de ${year}`}
              </span>
            </h2>

            {/* Cards do mês — destaque principal, sempre respeitam mês + empreendimento filtrados. */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 view-gap">
              <div className="bg-[#111113] rounded-lg p-5 flex flex-col gap-3">
                <div className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]" title="2% do VGV meta cadastrado para o período selecionado — sinal de ritmo, não decide estouro.">Orçamento Projetado (Meta)</div>
                <div className="text-4xl font-semibold text-[#EDEDED] tracking-[-0.02em]">{formatCurrency(totalBudget)}</div>
              </div>
              <div className="bg-[#111113] rounded-lg p-5 flex flex-col gap-3">
                <div className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]" title="2% do VGV das unidades vendidas dentro do período selecionado (só as vendas do período, sem acumular meses anteriores).">Orçamento Real do Período</div>
                <div className="text-4xl font-semibold text-[#EDEDED] tracking-[-0.02em]">{formatCurrency(mesOrcamentoReal)}</div>
              </div>
              <div className="bg-[#111113] rounded-lg p-5 flex flex-col gap-3">
                <div className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]" title="Soma dos títulos Sienge (marketing/comercial) com vencimento dentro do período selecionado. O acumulado desde o início do controle fica na faixa de baixo.">Gasto Real do Período</div>
                <div className="text-4xl font-semibold text-[#EDEDED] tracking-[-0.02em]">{formatCurrency(mesGastoReal)}</div>
              </div>
              <div className="bg-[#111113] rounded-lg p-5 flex flex-col gap-3">
                <div className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]" title="Gasto real do período menos orçamento real do período, somando todos os empreendimentos selecionados — a economia de um abate o estouro de outro.">Overspend</div>
                <div className={`text-4xl font-semibold tracking-[-0.02em] ${mesOverspend > 0 ? 'text-[#F85149]' : 'text-[#EDEDED]'}`}>{formatCurrency(mesOverspend)}</div>
              </div>
              <div className="bg-[#111113] rounded-lg p-5 flex flex-col gap-3">
                <div className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]" title="O que sobrou do orçamento real do período no conjunto selecionado. Só aparece quando não há estouro algum.">Saving</div>
                <div className={`text-4xl font-semibold tracking-[-0.02em] ${mesSaving > 0 ? 'text-[#3FB950]' : 'text-[#EDEDED]'}`}>{formatCurrency(mesSaving)}</div>
              </div>
            </div>

            {/* Cards do ano — menor destaque, abaixo dos cards do mês. Sempre
                acumulado dos 12 meses, só respeita o empreendimento filtrado. */}
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-medium text-[#4A4A4E] uppercase tracking-[0.05em]">
                Acumulado do ano — {selectedProject ? selectedProject.name : 'todos os empreendimentos'}
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 view-gap-sm">
                <div className="bg-[#0D0D0F] rounded-lg p-3.5 flex flex-col gap-1.5">
                  <div className="text-[10px] font-medium text-[#5A5A5E] uppercase tracking-[0.05em]" title="2% do VGV meta cadastrado, somado nos 12 meses do ano — sinal de ritmo, não decide estouro.">Orçamento Projetado (Meta)</div>
                  <div className="text-xl font-extralight text-[#A0A0A5] tracking-[-0.02em]">{formatCurrency(yearlyTotalBudget)}</div>
                </div>
                <div className="bg-[#0D0D0F] rounded-lg p-3.5 flex flex-col gap-1.5">
                  <div className="text-[10px] font-medium text-[#5A5A5E] uppercase tracking-[0.05em]" title="2% do VGV das unidades efetivamente vendidas — é isso que define estouro/economia de verdade.">Orçamento Real Acumulado</div>
                  <div className="text-xl font-extralight text-[#A0A0A5] tracking-[-0.02em]">{formatCurrency(yearlyTotalOrcamentoReal)}</div>
                </div>
                <div className="bg-[#0D0D0F] rounded-lg p-3.5 flex flex-col gap-1.5">
                  <div className="text-[10px] font-medium text-[#5A5A5E] uppercase tracking-[0.05em]" title="Soma dos títulos Sienge (marketing/comercial) com vencimento desde o início do controle de orçamento até hoje.">Gasto Real Acumulado</div>
                  <div className="text-xl font-extralight text-[#A0A0A5] tracking-[-0.02em]">{formatCurrency(yearlyTotalGastoReal)}</div>
                </div>
                <div className="bg-[#0D0D0F] rounded-lg p-3.5 flex flex-col gap-1.5">
                  <div className="text-[10px] font-medium text-[#5A5A5E] uppercase tracking-[0.05em]">Overspend</div>
                  <div className={`text-xl font-extralight tracking-[-0.02em] ${yearlyTotalOverspend > 0 ? 'text-[#C24941]' : 'text-[#A0A0A5]'}`}>{formatCurrency(yearlyTotalOverspend)}</div>
                </div>
                <div className="bg-[#0D0D0F] rounded-lg p-3.5 flex flex-col gap-1.5">
                  <div className="text-[10px] font-medium text-[#5A5A5E] uppercase tracking-[0.05em]">Saving</div>
                  <div className={`text-xl font-extralight tracking-[-0.02em] ${yearlyTotalSaving > 0 ? 'text-[#2F9E52]' : 'text-[#A0A0A5]'}`}>{formatCurrency(yearlyTotalSaving)}</div>
                </div>
              </div>
            </div>

            {/* Gráfico */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Acumulado Real vs Projeção por Meta</h3>
              <div className="bg-[#111113] rounded-lg p-5">
                <SiengeSpendChart
                  projects={scopedProjects}
                  titles={scopedTitles}
                  projectMetas={projectMetas}
                  categoriaOrcamento={scopedCategoriaOrcamento}
                  tabelaVendas={tabelaVendas}
                  vendas={vendas}
                  controleInicio={controleInicio}
                  year={year}
                  month={month}
                />
              </div>
            </div>

            {/* Por empreendimento — compacto, 2+ por linha */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Por Empreendimento</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 view-gap">
                {analysis.map((a, i) => {
                  const br = budgetRealByProjectId.get(a.project.id);
                  // O card passou a falar do PERÍODO selecionado (era acumulado desde o
                  // início do controle), para casar com os cards do topo.
                  const bp = budgetPeriodoByProjectId.get(a.project.id);
                  const gastoPeriodo = bp?.gastoRealPeriodo ?? 0;
                  const orcamentoRealPeriodo = bp?.orcamentoRealPeriodo ?? 0;
                  const vgvRealPeriodo = bp?.vgvRealPeriodo ?? 0;
                  const diferencaPeriodo = orcamentoRealPeriodo - gastoPeriodo;
                  const metaMes = a.vgvMeta * ORCAMENTO_PCT;
                  return (
                  <div
                    key={a.project.id}
                    className={`bg-[#101012] border border-[#1A1A1E] rounded-xl p-5 flex flex-col gap-3.5 ${
                      // Último card sozinho na linha (contagem ímpar) ocupa a linha inteira, evitando buraco no grid.
                      analysis.length % 2 === 1 && i === analysis.length - 1 ? 'lg:col-span-2' : ''
                    }`}
                  >
                    {/* ── Identidade ─────────────────────────────────────────── */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: a.project.color }} />
                      <span className="text-[11px] font-medium text-[#8B8B93] uppercase tracking-[0.08em] truncate">
                        {a.project.name}
                      </span>
                    </div>

                    {/* ── Métrica principal: um único ponto focal ─────────────── */}
                    <div className="flex items-end justify-between gap-3 -mt-1">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[26px] leading-none font-semibold text-[#F0F0F2] tracking-[-0.03em] tabular-nums">
                          {formatCurrency(gastoPeriodo)}
                        </span>
                        <span className="mt-1.5 text-[9px] text-[#5A5A62] uppercase tracking-[0.1em]">
                          Gasto no período
                        </span>
                      </div>
                      {diferencaPeriodo !== 0 && (
                        <span
                          title={diferencaPeriodo < 0 ? 'Gasto acima do orçamento real do período' : 'Sobra do orçamento real do período'}
                          className={`shrink-0 px-2 py-1 rounded-md text-[11px] font-medium tabular-nums border ${
                            diferencaPeriodo < 0
                              ? 'text-[#FB7185] bg-[#FB7185]/[0.08] border-[#FB7185]/20'
                              : 'text-[#34D399] bg-[#34D399]/[0.08] border-[#34D399]/20'
                          }`}
                        >
                          {diferencaPeriodo < 0 ? 'Overspend' : 'Saving'} {formatCurrency(Math.abs(diferencaPeriodo))}
                        </span>
                      )}
                    </div>

                    {/* ── Trio de referência: mesmo formato rótulo/valor ──────── */}
                    <div className="grid grid-cols-3 rounded-lg bg-[#0C0C0E] border border-[#1A1A1E] divide-x divide-[#1A1A1E]">
                      {[
                        {
                          label: 'Meta/Mês',
                          value: formatCurrency(metaMes),
                          tip: 'Orçamento projetado: 2% da meta de VGV do período',
                        },
                        {
                          label: 'Orçamento Real',
                          value: formatCurrency(orcamentoRealPeriodo),
                          tip: 'Fatia do VGV efetivamente vendido no período',
                        },
                        {
                          label: 'VGV Meta',
                          value: formatCurrency(a.vgvMeta),
                          tip: 'Meta de VGV do período, cadastrada em Comercial › Metas',
                        },
                      ].map(m => (
                        <div key={m.label} title={m.tip} className="flex flex-col gap-1 px-3 py-2.5">
                          <span className="text-[8.5px] text-[#77777F] uppercase tracking-[0.1em] truncate">{m.label}</span>
                          <span className="text-[12px] text-[#DCDCE2] tabular-nums truncate">{m.value}</span>
                        </div>
                      ))}
                    </div>

                    {br && br.tetoTotalProduto > 0 && (
                      <div className="flex items-center gap-2.5 text-[10px] text-[#5A5A62]">
                        <span className="shrink-0">Teto do produto</span>
                        <div className="flex-1 h-[2px] rounded-full bg-[#15151A] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(br.pctTetoConsumido, 100)}%`, background: 'linear-gradient(90deg,#6E6EC4,#8B8BF0)' }}
                          />
                        </div>
                        <span className="shrink-0 tabular-nums text-[#7A7A82]">{formatPct(br.pctTetoConsumido)}</span>
                      </div>
                    )}

                    {/* ── Categorias ─────────────────────────────────────────── */}
                    {a.categorias.some(c => c.percentual > 0 || c.gasto > 0) && (
                      <div className="flex flex-col gap-3 pt-3.5 border-t border-[#1A1A1E]">
                        <div className="flex items-center justify-end gap-2.5 text-[8.5px] text-[#70707A] -mb-0.5">
                          {/* A amostra da meta é quase preta e sumiria sobre o card — a borda
                              fina é só para ela continuar legível na legenda. */}
                          <span className="flex items-center gap-1"><span className="w-[8px] h-[2px] rounded-full bg-black ring-1 ring-[#2A2A32]" /> meta</span>
                          <span className="flex items-center gap-1"><span className="w-[8px] h-[2px] rounded-full bg-[#2C2C38]" /> orç. real</span>
                          <span className="flex items-center gap-1"><span className="w-[8px] h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg,#3FCF9B,#0FA771)' }} /> gasto</span>
                        </div>

                        {/* Cabeçalho das colunas — mesma grade das linhas, para os números
                            ficarem ancorados sob o rótulo certo. */}
                        <div className="grid grid-cols-[1fr_auto_76px_76px_80px] items-baseline gap-2 text-[8.5px] text-[#70707A] uppercase tracking-[0.1em] pb-1 border-b border-[#18181C]">
                          <span>Categorias</span>
                          <span className="text-right">%</span>
                          <span className="text-right">Orç. Meta</span>
                          <span className="text-right">Orç. Real</span>
                          <span className="text-right text-[#9A9AA4]">Consumo</span>
                        </div>
                        {a.categorias
                          // Obsoletas saem da lista; as que ainda têm gasto no período ficam,
                          // senão esse dinheiro sumiria da quebra e ela não fecharia com o total.
                          .filter(c => !c.obsoleta || (bp?.gastoPorCategoria[categoriaKey(c.centroCusto, c.categoria)] ?? 0) > 0)
                          .filter(c => c.percentual > 0 || (bp?.gastoPorCategoria[categoriaKey(c.centroCusto, c.categoria)] ?? 0) > 0)
                          .map(c => {
                          // Três referências por categoria, todas do período selecionado:
                          //   meta         = % × VGV meta      (orçamento projetado)
                          //   orçamentoCat = % × VGV vendido    (verba que existe de fato)
                          //   gasto        = títulos do período
                          const metaCat = c.orcamento;
                          const orcamentoCat = vgvRealPeriodo * (c.percentual / 100);
                          const semOrcamento = c.percentual <= 0;
                          // Gasto da MESMA janela usada no total do card (para em hoje), e não
                          // o mês fechado que vinha de analyzeProjectMonth.
                          const gastoCat = bp?.gastoPorCategoria[categoriaKey(c.centroCusto, c.categoria)] ?? 0;

                          // Régua normalmente termina na meta; se o gasto passar dela, estende
                          // para caber e o cinza escuro deixa de ocupar a linha toda — o próprio
                          // fim da barra de meta passa a sinalizar o estouro.
                          const escala = Math.max(metaCat, orcamentoCat, gastoCat) || 1;
                          const p = (v: number) => Math.min((v / escala) * 100, 100);

                          const estourouMeta = !semOrcamento && gastoCat > metaCat;
                          const estourouReal = !semOrcamento && gastoCat > orcamentoCat;
                          const semGasto = gastoCat <= 0;

                          // Degradês suaves: mesma matiz em duas paradas, dando profundidade
                          // sem introduzir uma segunda cor na disputa. A barra de consumo
                          // sempre parte do zero — passar do orçamento muda só a cor.
                          // Sem glow: qualquer box-shadow em barra de 5px vira halo e engrossa
                          // a linha. O âmbar também foi rebaixado — amarelo puro tem a maior
                          // luminância do espectro e, sobre fundo escuro, "transborda" a própria
                          // área (irradiação), parecendo mais espesso que o verde e o vermelho.
                          const gradGasto = semOrcamento
                            ? 'linear-gradient(90deg,#55555F,#70707C)'
                            : estourouMeta ? 'linear-gradient(90deg,#F2647A,#D92D44)'
                            : estourouReal ? 'linear-gradient(90deg,#E0A93B,#C97F12)'
                            : 'linear-gradient(90deg,#3FCF9B,#0FA771)';
                          const corValor = estourouMeta ? 'text-[#FF8A9B]'
                            : estourouReal ? 'text-[#FCD34D]'
                            : semGasto ? 'text-[#5C5C66]' : 'text-[#E8E8EC]';

                          const tip = [
                            `Gasto real: ${formatCurrency(gastoCat)}`,
                            semOrcamento ? 'Sem % alocado' : `Orçamento real (${formatPct(c.percentual)} do vendido): ${formatCurrency(orcamentoCat)}`,
                            semOrcamento ? '' : `Meta (${formatPct(c.percentual)} do VGV meta): ${formatCurrency(metaCat)}`,
                          ].filter(Boolean).join('\n');

                          return (
                            <div
                              key={`${c.centroCusto}-${c.categoria}`}
                              className={`flex flex-col gap-[7px] transition-opacity duration-200 ${semGasto ? 'opacity-60 hover:opacity-100' : ''}`}
                              title={tip}
                            >
                              {/* Grid fixo: rótulo flui, % e valor têm largura própria, então
                                  as colunas ficam alinhadas de uma linha para a outra. */}
                              {/* Meta e orçamento real são referência: ficam em cinza suave para
                                  o consumo (colorido e com peso maior) ser o que salta na linha. */}
                              <div className="grid grid-cols-[1fr_auto_76px_76px_80px] items-baseline gap-2 text-[11px]">
                                <span className="text-[#A8A8B2] truncate min-w-0">
                                  {c.categoria}
                                  {c.obsoleta && (
                                    <span className="ml-1.5 text-[9px] text-[#C08A2E]" title="Categoria fora da configuração atual — continua aqui porque ainda há gasto lançado nela no período.">
                                      obsoleta
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] text-[#66666F] tabular-nums text-right">
                                  {semOrcamento ? '—' : formatPct(c.percentual)}
                                </span>
                                <span className="text-[10.5px] tabular-nums text-right text-[#74747E]" title="Orçamento meta da categoria no período">
                                  {semOrcamento ? '—' : formatCurrency(metaCat)}
                                </span>
                                <span className="text-[10.5px] tabular-nums text-right text-[#8A8A96]" title="Orçamento real da categoria no período (% sobre o VGV vendido)">
                                  {semOrcamento ? '—' : formatCurrency(orcamentoCat)}
                                </span>
                                <span className={`tabular-nums text-right font-medium ${corValor}`} title="Consumo real do período">
                                  {formatCurrency(gastoCat)}
                                </span>
                              </div>

                              {/* Três camadas sobre a mesma régua, do fundo para a frente:
                                  meta → orçamento real → gasto. Dentro do orçamento o gasto é
                                  verde desde o zero; ao estourar, a cor começa só onde o
                                  orçamento real acaba, isolando o excesso. */}
                              {/* Trilha fina. O fundo é levemente mais claro que a barra de meta
                                  (preta), para a faixa "além da meta" continuar visível. */}
                              <div className="relative h-[3px] rounded-full bg-[#15151A] overflow-hidden">
                                {metaCat > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                    style={{ width: `${p(metaCat)}%`, background: 'linear-gradient(90deg,#000000,#050507)' }}
                                  />
                                )}
                                {orcamentoCat > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                    style={{ width: `${p(orcamentoCat)}%`, background: 'linear-gradient(90deg,#20202A,#2C2C38)' }}
                                  />
                                )}
                                {!semGasto && (
                                  <div
                                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                    style={{ width: `${p(gastoCat)}%`, background: gradGasto }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Tabela comparativa entre empreendimentos */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Comparativo entre Empreendimentos (gasto real por categoria)</h3>
              <div className="overflow-x-auto bg-[#111113] rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1F1F22]">
                      <th className="text-left px-4 py-3 pl-5 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Categoria</th>
                      {analysis.map(a => (
                        <th key={a.project.id} className="text-right px-4 py-3 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em] whitespace-nowrap">{a.project.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoriasBase.map(({ centroCusto, categoria, obsoleta }) => {
                      const rowKey = categoriaKey(centroCusto, categoria);
                      const isOpen = openCategoria === rowKey;
                      // Os mesmos títulos que somam os valores da linha, agora por
                      // extenso: mesma função de filtro que alimenta o gasto.
                      const titulosDaLinha = isOpen
                        ? analysis.flatMap(a =>
                            getTitulosNoPeriodo(scopedTitles, a.project.name, controleInicio, ateData, { centroCusto, categoria })
                              .map(t => ({ titulo: t, projectName: a.project.name }))
                          ).sort((x, y) => y.titulo.valor - x.titulo.valor)
                        : [];
                      const totalDaLinha = titulosDaLinha.reduce((s, x) => s + x.titulo.valor, 0);

                      return (
                        <React.Fragment key={rowKey}>
                          <tr
                            onClick={() => setOpenCategoria(isOpen ? null : rowKey)}
                            className={`border-b border-[#1F1F22] cursor-pointer transition-colors ${isOpen ? 'bg-[#151519]' : 'hover:bg-[#151519]'}`}
                          >
                            <td className="px-4 py-2.5 pl-5 text-[#A0A0A5]">
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronDown size={12} className={`text-[#6B6B70] shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                                <span>
                                  <span className="text-[#6B6B70] mr-1">{CENTRO_CUSTO_LABELS[centroCusto] || centroCusto} ·</span>{categoria}
                                </span>
                                {obsoleta && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[#8A6D3B] bg-[#3A2E17] border border-[#5C4718]" title="Categoria fora da configuração atual — aparece porque ainda há título lançado nela.">
                                    obsoleta
                                  </span>
                                )}
                              </span>
                            </td>
                            {analysis.map(a => {
                              // Gasto real acumulado da categoria. O vermelho continua
                              // marcando estouro do orçamento alocado pela meta — só o
                              // número exibido mudou de % para reais.
                              const gastoC = (budgetRealByProjectId.get(a.project.id)?.categorias || a.categorias).find(x => x.centroCusto === centroCusto && x.categoria === categoria)!;
                              const metaC = a.categorias.find(x => x.centroCusto === centroCusto && x.categoria === categoria)!;
                              const over = metaC.percentual > 0 && metaC.orcamento > 0 && gastoC.gasto > metaC.orcamento;
                              return (
                                <td
                                  key={a.project.id}
                                  title={metaC.orcamento > 0 ? `Orçamento da categoria: ${formatCurrency(metaC.orcamento)} (${formatPct(metaC.orcamento > 0 ? (gastoC.gasto / metaC.orcamento) * 100 : 0)} consumido)` : undefined}
                                  className={`px-4 py-2.5 text-right font-normal tabular-nums ${over ? 'text-[#F85149]' : gastoC.gasto > 0 ? 'text-[#A0A0A5]' : 'text-[#3A3A3E]'}`}
                                >
                                  {gastoC.gasto > 0 ? formatCurrency(gastoC.gasto) : '—'}
                                </td>
                              );
                            })}
                          </tr>

                          {isOpen && (
                            <tr className="border-b border-[#1F1F22]">
                              <td colSpan={analysis.length + 1} className="p-0">
                                <div className="bg-[#0C0C0E] px-5 py-3 border-l-2 border-blue-500/40">
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-[10px] font-mono uppercase tracking-[0.05em] text-[#6B6B70]">
                                      Títulos que geraram o custo · {CENTRO_CUSTO_LABELS[centroCusto] || centroCusto} · {categoria}
                                    </span>
                                    <span className="text-[10px] text-[#6B6B70] shrink-0">
                                      {titulosDaLinha.length} {titulosDaLinha.length === 1 ? 'título' : 'títulos'} · <span className="text-[#A0A0A5] tabular-nums">{formatCurrency(totalDaLinha)}</span>
                                    </span>
                                  </div>

                                  {titulosDaLinha.length === 0 ? (
                                    <p className="text-[11px] text-[#3A3A3E] py-1">Nenhum título lançado nesta categoria no período.</p>
                                  ) : (
                                    <div className="flex flex-col">
                                      {titulosDaLinha.map(({ titulo: t, projectName }) => (
                                        <div key={t.id} className="grid grid-cols-[1fr_130px_92px_110px] items-baseline gap-3 py-1.5 border-b border-[#1F1F22]/60 last:border-b-0 text-[11px]">
                                          <span className="text-[#A8A8B2] truncate min-w-0" title={t.descricao || t.titulo}>
                                            {t.titulo}
                                            {t.descricao && <span className="text-[#6B6B70]"> · {t.descricao}</span>}
                                          </span>
                                          <span className="text-[#6B6B70] truncate">{projectName}</span>
                                          <span className="text-[#6B6B70] tabular-nums">{t.vencimento?.split('-').reverse().join('/')}</span>
                                          <span className="text-[#A0A0A5] text-right tabular-nums">{formatCurrency(t.valor)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ranking real: quem economizou/estourou mais, e quanto do teto do produto já foi consumido */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Orçamento Real e Teto do Produto por Empreendimento</h3>
              <div className="overflow-x-auto bg-[#111113] rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1F1F22]">
                      <th className="text-left px-4 py-3 pl-5 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Empreendimento</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Orçamento Real</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Gasto Real</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Saldo</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">Teto do Produto</th>
                      <th className="text-right px-4 py-3 pr-5 text-[11px] font-medium text-[#6B6B70] uppercase tracking-[0.05em]">% Teto Consumido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...budgetReal].sort((a, b) => a.diferencaReal - b.diferencaReal).map(b => (
                      <tr key={b.project.id} className="border-b border-[#1F1F22] last:border-b-0 hover:bg-[#151519] transition-colors">
                        <td className="px-4 py-2.5 pl-5 text-[#EDEDED]">
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: b.project.color }} />
                            {b.project.name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#A0A0A5]">{formatCurrency(b.orcamentoRealAcumulado)}</td>
                        <td className="px-4 py-2.5 text-right text-[#A0A0A5]">{formatCurrency(b.gastoRealAcumulado)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${b.diferencaReal >= 0 ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
                          {b.diferencaReal >= 0 ? '+' : '-'}{formatCurrency(Math.abs(b.diferencaReal))}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#A0A0A5]">{b.tetoTotalProduto > 0 ? formatCurrency(b.tetoTotalProduto) : '—'}</td>
                        <td className="px-4 py-2.5 pr-5 text-right text-[#A0A0A5]">{b.tetoTotalProduto > 0 ? formatPct(b.pctTetoConsumido) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

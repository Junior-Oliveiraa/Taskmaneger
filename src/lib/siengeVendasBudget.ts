import { Project, SiengeTabelaVendaUnidade, SiengeVenda, SiengeTitle, SiengeCategoriaOrcamento, SiengeCentroCusto } from '../types';
import { ALL_CATEGORIAS, CategoriaAnalysis, CategoriaRef } from './siengeMetasAnalysis';

// 2% do VGV é o teto de orçamento de marketing/comercial adotado pela Uchôa —
// mesmo percentual usado em toda a análise de metas do Dashboard Analítico.
export const ORCAMENTO_PCT = 0.02;

// ─── Camada 1 — VGV real (vendas efetivamente confirmadas) ──────────────────

// VGV real "ativo" num instante: soma do valor congelado das vendas cuja janela
// [dataVenda, dataDistrato) cobre `ateData`. Uma venda distratada deixa de contar
// a partir do momento do distrato — o VGV real pode cair, não é só crescente.
export function getVgvRealAcumulado(vendas: SiengeVenda[], ateData: Date): number {
  return vendas
    .filter(v => new Date(v.dataVenda) <= ateData && (!v.dataDistrato || new Date(v.dataDistrato) > ateData))
    .reduce((s, v) => s + v.valorCongelado, 0);
}

export function getOrcamentoRealAcumulado(vendas: SiengeVenda[], ateData: Date): number {
  return getVgvRealAcumulado(vendas, ateData) * ORCAMENTO_PCT;
}

// VGV vendido DENTRO de uma janela (não acumulado): só vendas cuja data cai no
// período, ignorando as que já foram distratadas até o fim dele.
export function getVgvRealNoPeriodo(vendas: SiengeVenda[], deData: Date, ateData: Date): number {
  return vendas
    .filter(v => {
      const dv = new Date(v.dataVenda);
      return dv >= deData && dv <= ateData && (!v.dataDistrato || new Date(v.dataDistrato) > ateData);
    })
    .reduce((s, v) => s + v.valorCongelado, 0);
}

// ─── Gasto real (títulos Sienge), sempre limitado ao início do controle ─────

// Gasto dentro de uma janela [deData, ateData] pelo vencimento do título. Mesmas
// regras de inclusão do acumulado (inclusive títulos sem categoria) — só muda o
// limite inferior, para permitir o gasto de um mês isolado.
export function getTitulosNoPeriodo(
  titles: SiengeTitle[],
  projectName: string,
  deData: string,  // YYYY-MM-DD
  ateData: Date,
  filtro?: { centroCusto: SiengeCentroCusto; categoria: string },
): SiengeTitle[] {
  const ateStr = ateData.toISOString().slice(0, 10);
  return titles.filter(t =>
    t.empreendimento === projectName &&
    t.vencimento && t.vencimento >= deData && t.vencimento <= ateStr &&
    (!filtro || (t.centroCusto === filtro.centroCusto && t.categoria === filtro.categoria))
  );
}

// O valor e a lista que o explica saem do MESMO filtro de propósito: quem abre
// a linha para ver "de onde veio esse número" não pode receber um conjunto de
// títulos que soma outra coisa.
export function getGastoRealNoPeriodo(
  titles: SiengeTitle[],
  projectName: string,
  deData: string,  // YYYY-MM-DD
  ateData: Date,
  filtro?: { centroCusto: SiengeCentroCusto; categoria: string },
): number {
  return getTitulosNoPeriodo(titles, projectName, deData, ateData, filtro)
    .reduce((s, t) => s + t.valor, 0);
}

export function getGastoRealAcumulado(
  titles: SiengeTitle[],
  projectName: string,
  controleInicio: string, // YYYY-MM-DD
  ateData: Date,
  filtro?: { centroCusto: SiengeCentroCusto; categoria: string },
): number {
  return getGastoRealNoPeriodo(titles, projectName, controleInicio, ateData, filtro);
}

// Mesma coisa, para um conjunto de empreendimentos de uma vez (usado no gráfico).
export function getGastoRealAcumuladoProjetos(
  titles: SiengeTitle[],
  projects: Project[],
  controleInicio: string,
  ateData: Date,
): number {
  return projects.reduce((s, p) => s + getGastoRealAcumulado(titles, p.name, controleInicio, ateData), 0);
}

// ─── Tabela de Vendas: saldo, teto do produto e VGV médio disponível ────────

export function getSaldoRemanescente(unidades: SiengeTabelaVendaUnidade[]): number {
  return unidades
    .filter(u => u.situacao === 'disponivel' || u.situacao === 'bloqueada')
    .reduce((s, u) => s + u.valorTabela, 0);
}

export function getTetoTotalProduto(unidades: SiengeTabelaVendaUnidade[]): number {
  return getSaldoRemanescente(unidades) * ORCAMENTO_PCT;
}

// % do envelope total de 2% (já vendido + ainda disponível) que já foi
// desbloqueado por vendas confirmadas — não é a mesma coisa que estouro/economia,
// é um indicador de longo prazo de quanto do produto já "girou".
export function getPctTetoConsumido(orcamentoRealAcumulado: number, tetoTotalProduto: number): number {
  const envelope = orcamentoRealAcumulado + tetoTotalProduto;
  return envelope > 0 ? (orcamentoRealAcumulado / envelope) * 100 : 0;
}

// ─── Ritmo do mês: sinal de alerta, nunca decide estouro ────────────────────

export type RitmoMes = 'acima' | 'dentro' | 'abaixo';

export function getRitmoMes(gastoRealDoMes: number, orcamentoMetaDoMes: number): RitmoMes {
  if (orcamentoMetaDoMes <= 0) return 'dentro';
  if (gastoRealDoMes > orcamentoMetaDoMes) return 'acima';
  if (gastoRealDoMes < orcamentoMetaDoMes * 0.7) return 'abaixo';
  return 'dentro';
}

// ─── Camada 1 por categoria — mesma estrutura de CategoriaAnalysis usada na Camada 2 ───

export interface ProjectBudgetReal {
  project: Project;
  vgvRealAcumulado: number;
  orcamentoRealAcumulado: number;
  gastoRealAcumulado: number;
  diferencaReal: number;
  categorias: CategoriaAnalysis[];
  saldoRemanescente: number;
  tetoTotalProduto: number;
  pctTetoConsumido: number;
}

// ─── Recorte do período (não acumulado) — usado nos cards do mês ────────────
// Mesmas fórmulas da camada real, mas com a janela fechada nos dois lados: serve
// para responder "quanto entrou e quanto saiu NESTE mês", enquanto a versão
// acumulada responde "quanto entrou e saiu desde o início do controle".
export interface ProjectBudgetPeriodo {
  project: Project;
  vgvRealPeriodo: number;
  orcamentoRealPeriodo: number;
  gastoRealPeriodo: number;
  diferencaPeriodo: number;
  // Gasto por categoria na MESMA janela do período. Sem isso as linhas de categoria
  // somavam o mês inteiro (incluindo o que ainda vai vencer) e não fechavam com o
  // total do card, que para na data de hoje.
  gastoPorCategoria: Record<string, number>;
}

export const categoriaKey = (centroCusto: string, categoria: string) => `${centroCusto}::${categoria}`;

export function analyzeProjectBudgetPeriodo(
  project: Project,
  vendas: SiengeVenda[],
  titles: SiengeTitle[],
  deData: Date,
  ateData: Date,
  // Fração do VGV que compõe o orçamento. Padrão são os 2% cheios; ao filtrar por
  // centro de custo vira só a fatia alocada àquele centro.
  pctOrcamento: number = ORCAMENTO_PCT,
  categoriasBase: CategoriaRef[] = ALL_CATEGORIAS,
): ProjectBudgetPeriodo {
  const deISO = deData.toISOString().slice(0, 10);
  const vgvRealPeriodo = getVgvRealNoPeriodo(vendas.filter(v => v.projectId === project.id), deData, ateData);
  const orcamentoRealPeriodo = vgvRealPeriodo * pctOrcamento;
  const gastoRealPeriodo = getGastoRealNoPeriodo(titles, project.name, deISO, ateData);

  const gastoPorCategoria: Record<string, number> = {};
  categoriasBase.forEach(({ centroCusto, categoria }) => {
    gastoPorCategoria[categoriaKey(centroCusto, categoria)] =
      getGastoRealNoPeriodo(titles, project.name, deISO, ateData, { centroCusto, categoria });
  });

  return {
    project,
    vgvRealPeriodo,
    orcamentoRealPeriodo,
    gastoRealPeriodo,
    diferencaPeriodo: orcamentoRealPeriodo - gastoRealPeriodo,
    gastoPorCategoria,
  };
}

export function analyzeProjectBudgetReal(
  project: Project,
  unidades: SiengeTabelaVendaUnidade[],
  vendas: SiengeVenda[],
  titles: SiengeTitle[],
  categoriaOrcamento: SiengeCategoriaOrcamento[],
  controleInicio: string,
  ateData: Date,
  categoriasBase: CategoriaRef[] = ALL_CATEGORIAS,
  pctOrcamento: number = ORCAMENTO_PCT,
): ProjectBudgetReal {
  const unidadesDoProjeto = unidades.filter(u => u.projectId === project.id);
  const vendasDoProjeto = vendas.filter(v => v.projectId === project.id);

  const vgvReal = getVgvRealAcumulado(vendasDoProjeto, ateData);
  const orcamentoRealAcumulado = vgvReal * pctOrcamento;

  const categorias: CategoriaAnalysis[] = categoriasBase.map(({ centroCusto, categoria, obsoleta }) => {
    const alocacao = categoriaOrcamento.find(c => c.projectId === project.id && c.centroCusto === centroCusto && c.categoria === categoria);
    // Ver analyzeProjectMonth: alocação órfã (categoria inexistente) não gera orçamento.
    const percentual = obsoleta ? 0 : (alocacao?.percentual || 0);
    const orcamento = vgvReal * (percentual / 100);
    const gasto = getGastoRealAcumulado(titles, project.name, controleInicio, ateData, { centroCusto, categoria });
    const pctGastoDoVgv = vgvReal > 0 ? (gasto / vgvReal) * 100 : 0;
    return { centroCusto, categoria, percentual, orcamento, gasto, diferenca: orcamento - gasto, pctGastoDoVgv, obsoleta };
  });

  const gastoRealAcumulado = getGastoRealAcumulado(titles, project.name, controleInicio, ateData);
  const saldoRemanescente = getSaldoRemanescente(unidadesDoProjeto);
  const tetoTotalProduto = saldoRemanescente * ORCAMENTO_PCT;

  return {
    project,
    vgvRealAcumulado: vgvReal,
    orcamentoRealAcumulado,
    gastoRealAcumulado,
    diferencaReal: orcamentoRealAcumulado - gastoRealAcumulado,
    categorias,
    saldoRemanescente,
    tetoTotalProduto,
    pctTetoConsumido: getPctTetoConsumido(orcamentoRealAcumulado, tetoTotalProduto),
  };
}

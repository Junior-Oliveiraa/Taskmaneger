import { SiengeCalculoRegra, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade } from '../types';
import { calcRegraValor, getRegraQuantidade } from './siengeVendasTabela';
import type { PropostaParcela } from './comercialApi';

// Fluxo de pagamento da proposta: parte do fluxo padrão da Tabela de Vendas da
// unidade e é remodelado por cliente (mais parcelas, ato + parcelado, parcela
// final…). Tudo aqui é puro, sem estado de tela.

export interface ParcelaFluxo {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  /** Meses entre parcelas; 0 = pagamento único. */
  periodicidade: number;
  atualizacao: PropostaParcela['atualizacao'];
  /** yyyy-mm-dd */
  primeiroVencimento: string;
}

export const PERIODICIDADES: { meses: number; label: string; plural: string }[] = [
  { meses: 0, label: 'Única', plural: 'única' },
  { meses: 1, label: 'Mensal', plural: 'mensais' },
  { meses: 2, label: 'Bimestral', plural: 'bimestrais' },
  { meses: 3, label: 'Trimestral', plural: 'trimestrais' },
  { meses: 6, label: 'Semestral', plural: 'semestrais' },
  { meses: 12, label: 'Anual', plural: 'anuais' },
];

export const rotuloPeriodicidade = (meses: number) => PERIODICIDADES.find(p => p.meses === meses)?.label ?? `${meses} meses`;

export const centavos = (v: number) => Math.round(v * 100) / 100;

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Mensais", "48 MENSAIS" → 1; "Semestral" → 6; sem pista: única se 1x, senão mensal. */
export function inferirPeriodicidade(descricao: string, quantidade: number): number {
  const d = sem(descricao);
  if (/bimest/.test(d)) return 2;
  if (/trimest/.test(d)) return 3;
  if (/semest/.test(d)) return 6;
  if (/anua/.test(d)) return 12;
  if (/mens/.test(d)) return 1;
  return quantidade > 1 ? 1 : 0;
}

// Pagamentos de entrada não sofrem correção.
const ehEntrada = (descricao: string) => /sinal|ato|entrada|adesao/.test(sem(descricao));

/** Soma meses a uma data ISO, prendendo o dia ao fim do mês (31/01 + 1 → 28/02). */
export function somarMeses(iso: string, meses: number): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimo);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Vencimento da última parcela da linha. */
export function ultimoVencimento(p: Pick<ParcelaFluxo, 'primeiroVencimento' | 'quantidade' | 'periodicidade'>): string {
  if (!p.primeiroVencimento) return '';
  return somarMeses(p.primeiroVencimento, Math.max(0, (p.quantidade || 1) - 1) * p.periodicidade);
}

/** Primeiro vencimento padrão a partir da data do contrato: único no ato, periódico um período depois. */
export const vencimentoPadrao = (dataContrato: string, periodicidade: number) =>
  dataContrato ? somarMeses(dataContrato, periodicidade) : '';

// Título sem o % e sem parênteses/traços que sobram: "48 MENSAIS (60%)" → "48 MENSAIS".
const limparTitulo = (titulo: string) =>
  titulo.replace(/(\d+(?:[.,]\d+)?)\s*%/, '').replace(/[()[\]]/g, ' ').replace(/\s*[-–—:·]\s*$/, '').replace(/\s+/g, ' ').trim();

/**
 * Regra que calcula o valor do m²: informação para o cliente, não pagamento.
 * Reconhecida pelo título ou por dividir pela coluna de área.
 */
export function ehRegraDeM2(regra: SiengeCalculoRegra, colunas: SiengeTabelaVendaColuna[]): boolean {
  if (/m²|m2\b|metro/i.test(regra.titulo)) return true;
  const area = new Set(colunas.filter(c => c.versaoId === regra.versaoId && c.tipo === 'area').map(c => c.key));
  return !!regra.quantidadeColunaKey && area.has(regra.quantidadeColunaKey);
}

/**
 * Fluxo padrão da unidade: cada regra de cálculo da versão dela é uma série
 * (sinal, mensais, semestrais…), na ordem da Tabela de Vendas, com a
 * quantidade e o valor de parcela que a própria regra calcula. A única regra
 * que não entra é a do valor do m².
 *
 * Os centavos de arredondamento vão para o primeiro pagamento único, para o
 * fluxo fechar exatamente no valor de tabela; uma diferença maior (regras que
 * não somam 100%) fica no saldo, à vista de quem monta a proposta.
 */
export function fluxoDaTabela(
  unidade: SiengeTabelaVendaUnidade,
  regras: SiengeCalculoRegra[],
  colunas: SiengeTabelaVendaColuna[],
  dataContrato: string,
): ParcelaFluxo[] {
  const series = regras
    .filter(r => r.versaoId === unidade.versaoId && !ehRegraDeM2(r, colunas))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const linhas: ParcelaFluxo[] = [];
  for (const r of series) {
    // "Dividir" reparte o % em N parcelas; "multiplicar" já dá o valor da série inteira.
    const dividir = (r.operacao ?? 'dividir') === 'dividir';
    const quantidade = dividir ? Math.max(1, Math.round(getRegraQuantidade(unidade, r))) : 1;
    const valorUnitario = centavos(calcRegraValor(unidade, r));
    if (valorUnitario <= 0) continue;

    // Sem o % e sem a quantidade ("48 Mensais (60%)" → "Mensais"): ela tem campo próprio e pode mudar.
    const limpo = limparTitulo(r.titulo);
    const semQtd = limpo.replace(/^\d{1,3}\s*[x×]?\s*/i, '');
    const descricao = (semQtd || limpo || r.titulo).replace(/^\p{Ll}/u, c => c.toUpperCase());
    const periodicidade = inferirPeriodicidade(descricao, quantidade);
    linhas.push({
      descricao,
      quantidade,
      valorUnitario,
      periodicidade,
      atualizacao: ehEntrada(descricao) ? 'FIXA' : 'INCC',
      primeiroVencimento: vencimentoPadrao(dataContrato, periodicidade),
    });
  }
  if (!linhas.length) return linhas;

  const soma = linhas.reduce((t, l) => t + l.quantidade * l.valorUnitario, 0);
  const resto = centavos(unidade.valorTabela - soma);
  const unica = linhas.find(l => l.quantidade === 1);
  if (unica && Math.abs(resto) >= 0.01 && Math.abs(resto) < 1) unica.valorUnitario = centavos(unica.valorUnitario + resto);
  return linhas;
}

/**
 * Mesmo fluxo sobre outro valor da unidade (com desconto ou ágio): cada série
 * mantém o % que tem na tabela e a quantidade; só o valor da parcela muda. Os
 * centavos de arredondamento vão para o primeiro pagamento único, para o fluxo
 * fechar exatamente no novo valor.
 */
export function escalarFluxo(linhas: ParcelaFluxo[], valorOriginal: number, novoValor: number): ParcelaFluxo[] {
  if (!linhas.length || valorOriginal <= 0 || novoValor <= 0 || Math.abs(novoValor - valorOriginal) < 0.01) return linhas;
  const fator = novoValor / valorOriginal;
  const escaladas = linhas.map(l => ({ ...l, valorUnitario: centavos(l.valorUnitario * fator) }));
  const soma = escaladas.reduce((t, l) => t + l.quantidade * l.valorUnitario, 0);
  const resto = centavos(novoValor - soma);
  const unica = escaladas.find(l => l.quantidade === 1);
  if (unica && Math.abs(resto) >= 0.01) unica.valorUnitario = centavos(unica.valorUnitario + resto);
  return escaladas;
}

// ── Remodelagens ──────────────────────────────────────────────────────────

/** Mesma soma em outra quantidade de parcelas. Os centavos que sobram ficam no saldo. */
export function redistribuir(total: number, quantidade: number) {
  return quantidade > 0 ? centavos(total / quantidade) : 0;
}

/**
 * Ato fixo + restante parcelado: a linha vira um pagamento único (o ato) e o
 * resto em N parcelas a partir de um período depois. Centavos vão para o ato.
 */
export function dividirEmAtoEParcelado(
  linha: ParcelaFluxo,
  valorAto: number,
  parcelas: number,
  periodicidade: number,
  dataContrato: string,
): [ParcelaFluxo, ParcelaFluxo] {
  const total = centavos(linha.quantidade * linha.valorUnitario);
  const resto = centavos(total - valorAto);
  // Parcela arredondada para baixo: a sobra de centavos soma no ato, nunca o reduz.
  const unit = Math.floor((resto / parcelas) * 100 + 1e-6) / 100;
  const ajuste = centavos(resto - unit * parcelas);
  const vencAto = linha.primeiroVencimento || dataContrato;
  return [
    { descricao: 'Ato', quantidade: 1, valorUnitario: centavos(valorAto + ajuste), periodicidade: 0, atualizacao: 'FIXA', primeiroVencimento: vencAto },
    {
      descricao: `${linha.descricao} parcelado`,
      quantidade: parcelas,
      valorUnitario: unit,
      periodicidade,
      atualizacao: linha.atualizacao,
      primeiroVencimento: vencAto ? somarMeses(vencAto, periodicidade || 1) : '',
    },
  ];
}

/**
 * Parcelas menores + parcela final: cada parcela cai para `novoValor` e a
 * diferença acumulada vira um pagamento único um período depois da última.
 */
export function reduzirComParcelaFinal(linha: ParcelaFluxo, novoValor: number): [ParcelaFluxo, ParcelaFluxo] {
  const final = centavos(linha.quantidade * (linha.valorUnitario - novoValor));
  const ultimo = ultimoVencimento(linha);
  return [
    { ...linha, valorUnitario: centavos(novoValor) },
    {
      descricao: `Parcela final${linha.descricao ? ` · ${linha.descricao}` : ''}`,
      quantidade: 1,
      valorUnitario: final,
      periodicidade: 0,
      atualizacao: linha.atualizacao,
      primeiroVencimento: ultimo ? somarMeses(ultimo, linha.periodicidade || 1) : '',
    },
  ];
}

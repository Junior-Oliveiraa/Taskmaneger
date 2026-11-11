import { SiengeCalculoRegra, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeValidacao } from '../types';
import { REGRA_KEY_PREFIX, calcRegraValor, getColunaBaseValue, getRegraQuantidade } from './siengeVendasTabela';
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

/**
 * Fluxo padrão da unidade segundo a Tabela de Vendas da versão dela:
 * - os termos (positivos) da validação "valor da unidade" dizem o que compõe o
 *   preço; um termo que é base de regras de cálculo vira as próprias regras
 *   (ex.: custo de construção → 48 mensais + 7 semestrais);
 * - sem essa validação, valem só as regras de divisão;
 * - o que faltar para o valor de tabela entra como "Saldo" (centavos de
 *   arredondamento vão para o pagamento único, se houver).
 */
export function fluxoDaTabela(
  unidade: SiengeTabelaVendaUnidade,
  regras: SiengeCalculoRegra[],
  validacoes: SiengeValidacao[],
  colunas: SiengeTabelaVendaColuna[],
  dataContrato: string,
): ParcelaFluxo[] {
  const regrasVersao = regras
    .filter(r => r.versaoId === unidade.versaoId && (r.operacao ?? 'dividir') === 'dividir')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const validacao = validacoes
    .filter(v => v.versaoId === unidade.versaoId && v.tipo === 'valor_unidade')
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  const deRegra = (r: SiengeCalculoRegra) => {
    const quantidade = Math.max(1, Math.round(getRegraQuantidade(unidade, r)));
    return { descricao: r.titulo, quantidade, valorUnitario: centavos(calcRegraValor(unidade, r)) };
  };

  const brutas: { descricao: string; quantidade: number; valorUnitario: number }[] = [];
  const usadas = new Set<string>();
  if (validacao) {
    for (const t of validacao.termos) {
      if (t.sinal === '-') continue;
      if (t.colunaKey.startsWith(REGRA_KEY_PREFIX)) {
        const r = regrasVersao.find(x => x.id === t.colunaKey.slice(REGRA_KEY_PREFIX.length));
        if (r && !usadas.has(r.id)) { usadas.add(r.id); brutas.push(deRegra(r)); }
        continue;
      }
      const filhas = regrasVersao.filter(r => r.colunaBaseKey === t.colunaKey && !usadas.has(r.id));
      if (filhas.length) {
        filhas.forEach(r => { usadas.add(r.id); brutas.push(deRegra(r)); });
        continue;
      }
      const valor = centavos(getColunaBaseValue(unidade, t.colunaKey));
      if (valor <= 0) continue;
      const label = t.colunaKey === 'valor_tabela' ? 'Valor de tabela' : colunas.find(c => c.versaoId === unidade.versaoId && c.key === t.colunaKey)?.label ?? t.colunaKey;
      brutas.push({ descricao: label, quantidade: 1, valorUnitario: valor });
    }
  } else {
    regrasVersao.forEach(r => brutas.push(deRegra(r)));
  }

  const linhas: ParcelaFluxo[] = brutas
    .filter(b => b.valorUnitario > 0)
    .map((b): ParcelaFluxo => {
      const periodicidade = inferirPeriodicidade(b.descricao, b.quantidade);
      return {
        ...b,
        periodicidade,
        atualizacao: ehEntrada(b.descricao) ? 'FIXA' : 'INCC',
        primeiroVencimento: vencimentoPadrao(dataContrato, periodicidade),
      };
    })
    // Pagamentos únicos primeiro, depois do período mais curto ao mais longo.
    .sort((a, b) => (a.periodicidade === 0 ? -1 : a.periodicidade) - (b.periodicidade === 0 ? -1 : b.periodicidade));

  const soma = linhas.reduce((s, l) => s + l.quantidade * l.valorUnitario, 0);
  const resto = centavos(unidade.valorTabela - soma);
  if (Math.abs(resto) >= 0.01) {
    const unica = linhas.find(l => l.quantidade === 1);
    if (Math.abs(resto) < 5 && unica) {
      unica.valorUnitario = centavos(unica.valorUnitario + resto);
    } else if (resto > 0) {
      linhas.push({
        descricao: linhas.length ? 'Saldo' : 'Sinal',
        quantidade: 1,
        valorUnitario: resto,
        periodicidade: 0,
        atualizacao: linhas.length ? 'INCC' : 'FIXA',
        primeiroVencimento: vencimentoPadrao(dataContrato, 0),
      });
    }
  }
  return linhas;
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

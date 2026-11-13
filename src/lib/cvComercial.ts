// Dados e cálculos da aba Desempenho (CV CRM). `calcularPainel` é pura: a tela
// inteira deriva dela, sempre a partir do mesmo recorte de filtros.

import { supabase } from './supabase';

export interface CvReserva {
  idreserva: number;
  idempreendimento: number;
  empreendimento: string;
  idunidade: number | null;
  unidade: string | null;
  bloco: string | null;
  situacao: string;
  data_cad: string | null;
  data_venda: string | null;
  data_cancelamento: string | null;
  data_distrato: string | null;
  valor_contrato: number;
  area_privativa: number | null;
  imobiliaria: string | null;
  corretor: string | null;
  /** Valor de tabela que o CV guardou na reserva (vgv_tabela); vazio na maioria das vendas recentes. */
  valor_tabela_cv: number | null;
  canal: string;
  midia: string | null;
  motivo_cancelamento: string | null;
  motivo_distrato: string | null;
  tipo_pessoa: string | null;
  faixa_etaria: string | null;
  sexo: string | null;
  estado_civil: string | null;
  cidade: string | null;
  /** Pelas séries ativas da condição de pagamento; nulo quando o CV não tem condição. */
  financiamento?: string | null;
}

export interface CvUnidade {
  idunidade: number;
  idempreendimento: number;
  empreendimento: string;
  unidade: string;
  situacao: string;
  /** Só nas bloqueadas; "Permutante" marca as permutas. */
  motivo_bloqueio?: string | null;
}

export interface CvSync {
  concluido_em: string | null;
  status: string | null;
  erro: string | null;
}

export interface CvDados {
  reservas: CvReserva[];
  unidades: CvUnidade[];
  sync: CvSync | null;
}

async function lerTudo<T>(tabela: string): Promise<T[]> {
  const out: T[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase.from(tabela).select('*').range(de, de + passo - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < passo) return out;
  }
}

// ── Padronização de texto ────────────────────────────────────────────────────
// O CV devolve o mesmo campo ora em CAIXA ALTA, ora em minúsculas. Tudo passa
// por aqui ao carregar: nome próprio (pessoa, imobiliária, cidade) com cada
// palavra em maiúscula; o resto só com a primeira letra.

const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von']);
/** Siglas que ficam em caixa alta mesmo dentro de um nome. */
const SIGLAS_TEXTO = ['cv', 'crm', 'pj', 'pf', 'fgts', 'mcmv', 'sbpe', 'olx', 'rh', 'tv', 'spc'];
const SIGLAS = new Set(['ltda', 'me', 'epp', 'eireli', 's/a', 'sa', 's.a.', 'ii', 'iii', 'iv', 'creci', ...SIGLAS_TEXTO]);
/** Nomes próprios que costumam aparecer em texto comum (mídia, motivos). */
const PROPRIOS = new Map<string, string>([
  ...['uchoa', 'uchôa', 'instagram', 'facebook', 'google', 'whatsapp', 'youtube', 'tiktok', 'linkedin', 'caixa',
    'zap', 'vivareal', 'orbit', 'sienge', 'botanic', 'martin', 'rivage', 'flow', 'gênova', 'serasa']
    .map(p => [p, p.charAt(0).toUpperCase() + p.slice(1)] as [string, string]),
  ...SIGLAS_TEXTO.map(p => [p, p.toUpperCase()] as [string, string]),
]);

const capitalizar = (p: string) => p.replace(/^(\p{L})/u, c => c.toUpperCase());

/** "JOÃO DA SILVA" → "João da Silva"; "IMOB X LTDA" → "Imob X LTDA". */
export function nomeProprio(v: string | null): string | null {
  const s = v?.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return s.toLowerCase().split(' ').map((p, i) => {
    if (SIGLAS.has(p)) return p.toUpperCase();
    if (i > 0 && CONECTIVOS.has(p)) return p;
    // "maria-josé" e "d'ávila" também levam maiúscula depois do hífen/apóstrofo.
    return p.split(/([-'’])/).map(capitalizar).join('');
  }).join(' ');
}

/** "INDICAÇÃO DE AMIGO" → "Indicação de amigo"; nomes conhecidos seguem maiúsculos. */
export function textoComum(v: string | null): string | null {
  const s = v?.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const out = s.toLowerCase().split(' ').map(p => PROPRIOS.get(p) ?? p).join(' ');
  return capitalizar(out);
}

/**
 * As duas primeiras palavras do nome, para caber nas listas; o nome inteiro vai
 * no balão. Um conectivo entre elas fica ("Maria de Souza", não "Maria de").
 */
export function nomeCurto(nome: string): string {
  const p = nome.split(' ');
  if (p.length <= 2) return nome;
  return CONECTIVOS.has(p[1].toLowerCase()) ? p.slice(0, 3).join(' ') : p.slice(0, 2).join(' ');
}

export async function fetchCvComercial(): Promise<CvDados> {
  const [reservas, unidades, sync] = await Promise.all([
    lerTudo<CvReserva>('cv_comercial_reservas'),
    lerTudo<CvUnidade>('cv_comercial_unidades'),
    supabase.from('cv_comercial_sync').select('concluido_em,status,erro').eq('id', 'default').maybeSingle(),
  ]);
  if (sync.error) throw sync.error;
  return {
    reservas: reservas.map(r => ({
      ...r,
      valor_contrato: Number(r.valor_contrato) || 0,
      area_privativa: r.area_privativa == null ? null : Number(r.area_privativa),
      imobiliaria: nomeProprio(r.imobiliaria),
      corretor: nomeProprio(r.corretor),
      cidade: nomeProprio(r.cidade),
      midia: textoComum(r.midia),
      motivo_cancelamento: textoComum(r.motivo_cancelamento),
      motivo_distrato: textoComum(r.motivo_distrato),
      estado_civil: textoComum(r.estado_civil),
    })),
    unidades,
    sync: (sync.data as CvSync | null) ?? null,
  };
}

// ── Filtros ──────────────────────────────────────────────────────────────────

export interface Periodo {
  /** Inclusivos, yyyy-mm-dd. Nulos = todo o histórico. */
  de: string | null;
  ate: string | null;
}

export interface FiltrosPainel {
  empreendimentos: number[] | null;
  periodo: Periodo;
  /** Período usado nas variações dos cartões; nulo esconde a comparação. */
  comparacao: Periodo | null;
  canal: string | null;
  /** Só com canal escolhido. */
  imobiliaria: string | null;
  /** Só com imobiliária escolhida (ou canal de imobiliária única, como Autônomos). */
  corretor: string | null;
  /** Um de FINANCIAMENTOS; nulo = todos. */
  financiamento?: string | null;
  /**
   * Estende o eixo da série além do fim do período (yyyy-mm-dd), sem vendas:
   * em "Este mês" a meta cobre o mês inteiro, inclusive os dias que ainda virão.
   */
  fimSerie?: string | null;
}

export const hojeBrasilia = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function ultimos12Meses(hoje: string): Periodo {
  const [y, m] = hoje.split('-').map(Number);
  const inicio = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
  return { de: inicio, ate: hoje };
}

const fimDoMesDe = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/** Quantos meses inteiros o período cobre (do dia 1 ao último dia), ou 0 se não for de meses inteiros. */
function mesesInteiros(p: Periodo): number {
  if (!p.de || !p.ate || !p.de.endsWith('-01')) return 0;
  const [ya, ma] = p.ate.split('-').map(Number);
  if (p.ate !== fimDoMesDe(ya, ma)) return 0;
  const [yd, md] = p.de.split('-').map(Number);
  return (ya - yd) * 12 + (ma - md) + 1;
}

/** Desloca um período de meses inteiros em n meses, mantendo-o de meses inteiros. */
function deslocarMeses(p: Periodo, n: number): Periodo {
  const [yd, md] = p.de!.split('-').map(Number);
  const [ya, ma] = p.ate!.split('-').map(Number);
  const de = new Date(Date.UTC(yd, md - 1 + n, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ya, ma - 1 + n, 1));
  return { de, ate: fimDoMesDe(fim.getUTCFullYear(), fim.getUTCMonth() + 1) };
}

/** O mesmo intervalo um ano antes; 29/02 vira 28/02. Meses inteiros continuam inteiros. */
export function periodoAnoAnterior(p: Periodo): Periodo | null {
  if (!p.de || !p.ate) return null;
  if (mesesInteiros(p)) return deslocarMeses(p, -12);
  const menosUm = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, new Date(Date.UTC(y - 1, m, 0)).getUTCDate())).padStart(2, "0")}`;
  };
  return { de: menosUm(p.de), ate: menosUm(p.ate) };
}

/**
 * Período imediatamente anterior, de mesma duração. Se o período for de meses
 * inteiros (ex.: novembro todo), o anterior também é (outubro todo, 1 a 31).
 */
export function periodoAnterior(p: Periodo): Periodo | null {
  if (!p.de || !p.ate) return null;
  const meses = mesesInteiros(p);
  if (meses) return deslocarMeses(p, -meses);
  const de = Date.parse(`${p.de}T00:00:00Z`);
  const ate = Date.parse(`${p.ate}T00:00:00Z`);
  const dur = ate - de;
  const fim = de - 86400000;
  return {
    de: new Date(fim - dur).toISOString().slice(0, 10),
    ate: new Date(fim).toISOString().slice(0, 10),
  };
}

const dentro = (d: string | null, p: Periodo) =>
  !!d && (!p.de || d >= p.de) && (!p.ate || d <= p.ate);

// ── Rótulos ──────────────────────────────────────────────────────────────────

const SIGLAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function nomeEmpreendimento(nome: string): string {
  const curto = nome.split(' - ')[0].trim();
  if (curto !== curto.toUpperCase()) return curto;
  return curto.toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && SIGLAS_MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const NOMES_CURTOS: [RegExp, string][] = [
  [/botanic/i, 'Botanic'],
  [/martin/i, 'Martin'],
  [/rivage/i, 'Rivage'],
  [/flow/i, 'Flow'],
  [/g[eê]nova/i, 'Gênova'],
];

/** Nome do filtro. Empreendimento novo cai no nome completo e vai para o fim. */
export function nomeCurtoEmpreendimento(nome: string): { nome: string; ordem: number } {
  const i = NOMES_CURTOS.findIndex(([re]) => re.test(nome));
  return i >= 0 ? { nome: NOMES_CURTOS[i][1], ordem: i } : { nome: nomeEmpreendimento(nome), ordem: NOMES_CURTOS.length };
}

export type Desfecho ='Vendida' | 'Pré-venda' | 'Em andamento' | 'Distrato' | 'Cancelada' | 'Vencida';
export const DESFECHOS: Desfecho[] = ['Vendida', 'Pré-venda', 'Em andamento', 'Distrato', 'Cancelada', 'Vencida'];

export function desfechoDaReserva(situacao: string): Desfecho {
  if (situacao === 'Vendida') return 'Vendida';
  if (situacao === 'Termo Assinado') return 'Pré-venda';
  if (situacao === 'Distrato') return 'Distrato';
  if (situacao === 'Cancelada') return 'Cancelada';
  if (situacao === 'Vencida') return 'Vencida';
  return 'Em andamento';
}

export const CANAIS = ['Imobiliárias', 'Autônomos', 'House', 'Não classificado'];

/** Valores gravados pela cvcrm-sync; "Sem informação" agrupa as reservas sem condição no CV. */
export const FINANCIAMENTOS = ['Caixa', 'Banco privado', 'Caixa e banco privado', 'Sem financiamento', 'Sem informação'];
export const financiamentoDe = (r: CvReserva) => r.financiamento ?? 'Sem informação';

export const FAIXAS_ETARIAS = ['18–29', '30–39', '40–49', '50–59', '60+'];

export type SituacaoEstoque = 'vendida' | 'reservada' | 'disponível' | 'permuta' | 'bloqueada';
export const SITUACOES_ESTOQUE: SituacaoEstoque[] = ['vendida', 'reservada', 'disponível', 'permuta', 'bloqueada'];

/** O CV não tem situação "permuta": vem como bloqueada com motivo "Permutante". */
export function situacaoEstoqueDe(u: CvUnidade): string {
  if (u.situacao === 'bloqueada' && /permut/i.test(u.motivo_bloqueio ?? '')) return 'permuta';
  return u.situacao;
}

/** Unidades fora da venda (permuta e bloqueada) pelo valor de tabela. */
export interface ValorParado {
  unidades: number;
  /** Nulo se nenhuma das unidades tiver preço na tabela. */
  valor: number | null;
  semPreco: number;
}

// ── Resultado ────────────────────────────────────────────────────────────────

export interface Fatia { label: string; valor: number; unidades: number }

export interface PontoSerie {
  chave: string;
  label: string;
  labelLongo: string;
  valor: number;
  unidades: number;
  /** Quanto do ponto o período cobre, em meses: base para ratear a meta mensal. */
  fracaoMeses: number;
  /** A mesma cobertura aberta por mês ('2026-03' → 0,5): a meta varia de mês a mês. */
  meses: Record<string, number>;
}

export interface Kpis {
  /** Vendas ativas (situação Vendida) do período: base de ticket, meta, curva e tabelas. */
  vgv: number;
  /** Tudo o que foi vendido no período, inclusive o que depois virou distrato. */
  vgvBruto: number;
  /** Bruto menos o valor dos distratos do período (pela data do distrato). */
  vgvLiquido: number;
  unidades: number;
  ticket: number;
  precoM2: number;
  vso: number;
  distratos: number;
  distratosValor: number;
  taxaDistrato: number;
  preVenda: number;
  preVendaValor: number;
}

export interface LinhaEmpreendimento {
  id: number;
  nome: string;
  vendidasPeriodo: number;
  vgvPeriodo: number;
  ticket: number;
  precoM2: number;
  estoque: Record<SituacaoEstoque, number>;
  total: number;
  vendaveis: number;
  pctVendido: number;
  vso: number;
  /** Disponíveis + reservadas pelo valor de tabela; nulo se nenhuma tiver preço. */
  valorEstoque: number | null;
  /** Unidades do estoque sem preço na tabela de vendas. */
  estoqueSemPreco: number;
  permuta: ValorParado;
  bloqueada: ValorParado;
  /** As vendas do período que somam o VGV da linha, mais recentes primeiro. */
  vendas: CvReserva[];
}

// ── Valor de tabela na data da venda ─────────────────────────────────────────

/** Venda congelada pelo Orbit (sienge_vendas): o valor de tabela no instante da venda. */
export interface VendaOrbit {
  projeto: string;
  unidade: string;
  valor: number;
  dataVenda: string;
}

export interface ValorTabela {
  valor: number;
  fonte: 'Orbit' | 'CV';
}

const normUnidade = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+(?=\d)/, '');

/**
 * Valor de tabela de cada venda do CV. Primeiro o Orbit, que congela o valor da
 * unidade quando ela vira vendida; se o Orbit não tiver a venda, o vgv_tabela
 * que o CV guardou na reserva. Sem nenhum dos dois, a venda fica sem comparação.
 */
export function valoresDeTabela(reservas: CvReserva[], orbit: VendaOrbit[]): Map<number, ValorTabela> {
  const porProjeto = new Map<string, VendaOrbit[]>();
  orbit.forEach(v => {
    if (!(v.valor > 0)) return;
    const p = nomeCurtoEmpreendimento(v.projeto).nome;
    porProjeto.set(p, [...(porProjeto.get(p) ?? []), v]);
  });
  const dias = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10)));

  const out = new Map<number, ValorTabela>();
  reservas.forEach(r => {
    const lista = r.unidade ? porProjeto.get(nomeCurtoEmpreendimento(r.empreendimento).nome) ?? [] : [];
    const u = r.unidade ? normUnidade(r.unidade) : '';
    let cands = lista.filter(v => normUnidade(v.unidade) === u);
    // "A-101" no Orbit x "101" no CV: aceita só se o final da unidade não for ambíguo.
    if (!cands.length && u) {
      const fim = lista.filter(v => normUnidade(v.unidade).endsWith(u));
      if (new Set(fim.map(v => normUnidade(v.unidade))).size === 1) cands = fim;
    }
    if (cands.length) {
      // A unidade pode ter sido vendida, distratada e vendida de novo: vale a venda mais próxima da data do CV.
      const ref = r.data_venda ?? r.data_cad ?? '';
      const melhor = ref ? cands.reduce((m, v) => (dias(v.dataVenda, ref) < dias(m.dataVenda, ref) ? v : m)) : cands[0];
      out.set(r.idreserva, { valor: melhor.valor, fonte: 'Orbit' });
    } else if (r.valor_tabela_cv) {
      out.set(r.idreserva, { valor: r.valor_tabela_cv, fonte: 'CV' });
    }
  });
  return out;
}

/** Unidade da tabela de vendas do Orbit (versão principal), com o preço atual. */
export interface PrecoOrbit {
  projeto: string;
  unidade: string;
  valor: number;
}

/** Preço de tabela atual de cada unidade do CV, casada com o Orbit pelo número. */
export function precosDasUnidades(unidades: CvUnidade[], orbit: PrecoOrbit[]): Map<number, number> {
  const porProjeto = new Map<string, Map<string, number>>();
  orbit.forEach(u => {
    if (!(u.valor > 0)) return;
    const p = nomeCurtoEmpreendimento(u.projeto).nome;
    const m = porProjeto.get(p) ?? new Map<string, number>();
    m.set(normUnidade(u.unidade), u.valor);
    porProjeto.set(p, m);
  });
  const out = new Map<number, number>();
  unidades.forEach(u => {
    const m = porProjeto.get(nomeCurtoEmpreendimento(u.empreendimento).nome);
    if (!m) return;
    const n = normUnidade(u.unidade);
    let v = m.get(n);
    if (v === undefined && n) {
      // "A-101" no Orbit x "101" no CV: só se o final não for ambíguo.
      const fim = [...m.entries()].filter(([k]) => k.endsWith(n));
      if (fim.length === 1) v = fim[0][1];
    }
    if (v !== undefined) out.set(Number(u.idunidade), v);
  });
  return out;
}

/**
 * Unidades do CV que ficam fora do painel: o empreendimento tem tabela no Orbit,
 * mas a unidade não está nela (garagens, cadastros avulsos do CV). Empreendimento
 * sem tabela no Orbit fica inteiro, só sem valor.
 */
export function unidadesForaDoOrbit(unidades: CvUnidade[], orbit: PrecoOrbit[]): Set<number> {
  const porProjeto = new Map<string, string[]>();
  orbit.forEach(u => {
    const p = nomeCurtoEmpreendimento(u.projeto).nome;
    porProjeto.set(p, [...(porProjeto.get(p) ?? []), normUnidade(u.unidade)]);
  });
  const conjuntos = new Map([...porProjeto].map(([p, l]) => [p, new Set(l)]));
  const fora = new Set<number>();
  unidades.forEach(u => {
    const s = conjuntos.get(nomeCurtoEmpreendimento(u.empreendimento).nome);
    if (!s) return;
    const n = normUnidade(u.unidade);
    // Mesma regra do preço: igual, ou o final do nome do Orbit sem ambiguidade.
    if (s.has(n) || (n && [...s].filter(k => k.endsWith(n)).length === 1)) return;
    fora.add(Number(u.idunidade));
  });
  return fora;
}

export interface Contagem { label: string; n: number }

export interface Painel {
  kpis: Kpis;
  anterior: Kpis | null;
  /** Desde sempre, ignorando o período: os demais filtros continuam valendo. */
  acumulado: Kpis;
  serie: PontoSerie[];
  granularidade: Granularidade;
  empreendimentos: LinhaEmpreendimento[];
  estoqueTotal: Record<SituacaoEstoque, number>;
  canais: Fatia[];
  /** As mesmas fatias no período de comparação. */
  canaisAnterior: Fatia[] | null;
  imobiliarias: Fatia[];
  midias: Fatia[];
  midiasSemInfo: number;
  desfechos: Contagem[];
  reservasNoPeriodo: number;
  conversao: number;
  motivosCancelamento: Contagem[];
  motivosCancelamentoSemInfo: number;
  motivosDistrato: Contagem[];
  perfil: {
    base: number;
    tipoPessoa: Contagem[];
    faixaEtaria: Contagem[];
    estadoCivil: Contagem[];
    sexo: Contagem[];
    cidades: Contagem[];
    semInfo: { tipoPessoa: number; faixaEtaria: number; estadoCivil: number; sexo: number; cidade: number };
  };
}

const ehVenda = (r: CvReserva) => r.situacao === 'Vendida';

const somaValor = (rows: CvReserva[]) => rows.reduce((s, r) => s + r.valor_contrato, 0);

function somarKpis(
  vendas: CvReserva[], preVendas: CvReserva[], distratos: CvReserva[], estoqueAberto: number,
  /** Vendas do período que depois viraram distrato: entram no bruto. */
  vendasDistratadas: CvReserva[] = [],
): Kpis {
  const vgv = somaValor(vendas);
  const vgvBruto = vgv + somaValor(vendasDistratadas);
  const distratosValor = somaValor(distratos);
  const comValor = vendas.filter(r => r.valor_contrato > 0);
  const comArea = comValor.filter(r => r.area_privativa && r.area_privativa > 0);
  const area = comArea.reduce((s, r) => s + (r.area_privativa as number), 0);
  const unidades = vendas.length;
  return {
    vgv,
    vgvBruto,
    vgvLiquido: vgvBruto - distratosValor,
    unidades,
    ticket: comValor.length ? comValor.reduce((s, r) => s + r.valor_contrato, 0) / comValor.length : 0,
    precoM2: area > 0 ? comArea.reduce((s, r) => s + r.valor_contrato, 0) / area : 0,
    vso: unidades + estoqueAberto > 0 ? unidades / (unidades + estoqueAberto) : 0,
    distratos: distratos.length,
    distratosValor,
    taxaDistrato: unidades + distratos.length > 0 ? distratos.length / (unidades + distratos.length) : 0,
    preVenda: preVendas.length,
    preVendaValor: preVendas.reduce((s, r) => s + r.valor_contrato, 0),
  };
}

function agruparFatias(rows: CvReserva[], chave: (r: CvReserva) => string | null): { fatias: Fatia[]; semInfo: number } {
  const m = new Map<string, Fatia>();
  let semInfo = 0;
  rows.forEach(r => {
    const k = chave(r);
    if (!k) { semInfo += 1; return; }
    const f = m.get(k) ?? { label: k, valor: 0, unidades: 0 };
    f.valor += r.valor_contrato;
    f.unidades += 1;
    m.set(k, f);
  });
  return { fatias: [...m.values()].sort((a, b) => b.valor - a.valor), semInfo };
}

function topComOutras(fatias: Fatia[], n: number, rotulo: string): Fatia[] {
  if (fatias.length <= n) return fatias;
  const resto = fatias.slice(n);
  return [...fatias.slice(0, n), {
    label: `${rotulo} (${resto.length})`,
    valor: resto.reduce((s, f) => s + f.valor, 0),
    unidades: resto.reduce((s, f) => s + f.unidades, 0),
  }];
}

function contar(rows: CvReserva[], chave: (r: CvReserva) => string | null): { itens: Contagem[]; semInfo: number } {
  const m = new Map<string, number>();
  let semInfo = 0;
  rows.forEach(r => {
    const k = chave(r);
    if (!k) { semInfo += 1; return; }
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return { itens: [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n), semInfo };
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const diasNoMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type Granularidade = 'semana' | 'mês' | 'trimestre';

/** Segunda-feira da semana de uma data (yyyy-mm-dd). */
const segundaDe = (ymd: string) => {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
};

function montarSerie(vendas: CvReserva[], p: Periodo): { serie: PontoSerie[]; granularidade: Granularidade } {
  const datas = vendas.map(r => r.data_venda as string).sort();
  const de = p.de ?? datas[0];
  const ate = p.ate ?? datas[datas.length - 1];
  if (!de || !ate || de > ate) return { serie: [], granularidade: 'mês' };

  const [yi, mi] = de.split('-').map(Number);
  const [yf, mf] = ate.split('-').map(Number);
  const meses = (yf - yi) * 12 + (mf - mi) + 1;
  const dias = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000) + 1;
  // A meta é mensal, então o gráfico é por mês. Só um recorte menor que um mês
  // (ou que não fecha meses inteiros e é curto) vai por semana; nunca por dia.
  const granularidade: Granularidade = meses > 24 ? 'trimestre'
    : mesesInteiros({ de, ate }) ? 'mês'
    : dias <= 45 ? 'semana' : 'mês';

  const chaveDe = (ymd: string) => {
    if (granularidade === 'semana') return segundaDe(ymd);
    if (granularidade === 'mês') return ymd.slice(0, 7);
    return `${ymd.slice(0, 4)}-T${Math.ceil(Number(ymd.slice(5, 7)) / 3)}`;
  };
  const novoPonto = (ymd: string): PontoSerie => {
    const [y, m, d] = ymd.split('-').map(Number);
    const chave = chaveDe(ymd);
    if (granularidade === 'semana') {
      // Rótulo pelo primeiro dia da semana dentro do período; o longo ganha o fim depois.
      return { chave, label: `${String(d).padStart(2, '0')}/${MES_CURTO[m - 1]}`, labelLongo: `${d} de ${MES_LONGO[m - 1]}`, valor: 0, unidades: 0, fracaoMeses: 0, meses: {} };
    }
    if (granularidade === 'mês') {
      return { chave, label: `${MES_CURTO[m - 1]}/${String(y).slice(2)}`, labelLongo: `${MES_LONGO[m - 1]} de ${y}`, valor: 0, unidades: 0, fracaoMeses: 0, meses: {} };
    }
    const tri = Math.ceil(m / 3);
    return { chave, label: `${tri}T${String(y).slice(2)}`, labelLongo: `${tri}º trimestre de ${y}`, valor: 0, unidades: 0, fracaoMeses: 0, meses: {} };
  };

  // Dia a dia, para saber quanto de cada mês o período cobre: a meta mensal é
  // proporcional a isso (meio mês selecionado = meia meta).
  const serie: PontoSerie[] = [];
  const porChave = new Map<string, PontoSerie>();
  const ultimoDiaDe = new Map<string, string>();
  for (let t = Date.parse(`${de}T00:00:00Z`), fim = Date.parse(`${ate}T00:00:00Z`); t <= fim; t += 86400000) {
    const ymd = new Date(t).toISOString().slice(0, 10);
    const chave = chaveDe(ymd);
    let ponto = porChave.get(chave);
    if (!ponto) { ponto = novoPonto(ymd); porChave.set(chave, ponto); serie.push(ponto); }
    ultimoDiaDe.set(chave, ymd);
    const [y, m] = ymd.split('-').map(Number);
    ponto.fracaoMeses += 1 / diasNoMes(y, m);
    const ym = ymd.slice(0, 7);
    ponto.meses[ym] = (ponto.meses[ym] ?? 0) + 1 / diasNoMes(y, m);
  }
  vendas.forEach(r => {
    const ponto = porChave.get(chaveDe(r.data_venda as string));
    if (ponto) { ponto.valor += r.valor_contrato; ponto.unidades += 1; }
  });
  if (granularidade === 'semana') {
    serie.forEach(p => {
      const [y, m, d] = ultimoDiaDe.get(p.chave)!.split('-').map(Number);
      p.labelLongo = `Semana de ${p.labelLongo} a ${d} de ${MES_LONGO[m - 1]} de ${y}`;
    });
  }
  return { serie, granularidade };
}

export function calcularPainel(dados: CvDados, f: FiltrosPainel, precos: Map<number, number> = new Map()): Painel {
  const noRecorte = (r: { idempreendimento: number }) =>
    !f.empreendimentos || f.empreendimentos.includes(Number(r.idempreendimento));

  const reservas = dados.reservas.filter(r => noRecorte(r)
    && (!f.canal || r.canal === f.canal)
    && (!f.imobiliaria || r.imobiliaria === f.imobiliaria)
    && (!f.corretor || r.corretor === f.corretor)
    && (!f.financiamento || financiamentoDe(r) === f.financiamento));
  const unidades = dados.unidades.filter(noRecorte);

  const estoqueVazio = (): Record<SituacaoEstoque, number> => ({ vendida: 0, reservada: 0, 'disponível': 0, permuta: 0, bloqueada: 0 });
  const estoqueTotal = estoqueVazio();
  const estoquePor = new Map<number, Record<SituacaoEstoque, number>>();
  // Valor de tabela por empreendimento: "estoque" (disponível + reservada), permuta e bloqueada.
  type Soma = { valor: number; comPreco: number; semPreco: number };
  type Grupo = 'estoque' | 'permuta' | 'bloqueada';
  const valorPor = new Map<number, Record<Grupo, Soma>>();
  const somaVazia = (): Soma => ({ valor: 0, comPreco: 0, semPreco: 0 });
  const nomePor = new Map<number, string>();
  unidades.forEach(u => {
    const id = Number(u.idempreendimento);
    const e = estoquePor.get(id) ?? estoqueVazio();
    const s = situacaoEstoqueDe(u) as SituacaoEstoque;
    if (s in e) { e[s] += 1; estoqueTotal[s] += 1; }
    estoquePor.set(id, e);
    nomePor.set(id, nomeEmpreendimento(u.empreendimento));
    const grupo: Grupo | null = s === 'disponível' || s === 'reservada' ? 'estoque'
      : s === 'permuta' || s === 'bloqueada' ? s : null;
    if (grupo) {
      const g = valorPor.get(id) ?? { estoque: somaVazia(), permuta: somaVazia(), bloqueada: somaVazia() };
      const v = g[grupo];
      const preco = precos.get(Number(u.idunidade));
      if (preco !== undefined) { v.valor += preco; v.comPreco += 1; } else v.semPreco += 1;
      valorPor.set(id, g);
    }
  });
  const parado = (n: number, v: Soma | undefined): ValorParado =>
    ({ unidades: n, valor: v && v.comPreco > 0 ? v.valor : null, semPreco: v?.semPreco ?? 0 });
  const estoqueAberto = estoqueTotal['disponível'] + estoqueTotal.reservada;

  const vendasDe = (p: Periodo) => reservas.filter(r => ehVenda(r) && dentro(r.data_venda, p));
  const preVendasDe = (p: Periodo) => reservas.filter(r => r.situacao === 'Termo Assinado' && dentro(r.data_cad, p));
  const distratosDe = (p: Periodo) => reservas.filter(r => r.situacao === 'Distrato' && dentro(r.data_distrato ?? r.data_cad, p));

  // A venda distratada deixa de ser "Vendida" no CV, mas foi venda na data dela: conta no bruto.
  const vendasDistratadasDe = (p: Periodo) => reservas.filter(r => r.situacao === 'Distrato' && dentro(r.data_venda ?? r.data_cad, p));
  const kpisDe = (p: Periodo) => somarKpis(vendasDe(p), preVendasDe(p), distratosDe(p), estoqueAberto, vendasDistratadasDe(p));

  const vendas = vendasDe(f.periodo);
  const kpis = kpisDe(f.periodo);
  const pa = f.comparacao;
  const anterior = pa ? kpisDe(pa) : null;
  const acumulado = kpisDe({ de: null, ate: null });

  const { serie, granularidade } = montarSerie(vendas, {
    de: f.periodo.de,
    ate: f.fimSerie && f.periodo.ate && f.fimSerie > f.periodo.ate ? f.fimSerie : f.periodo.ate,
  });

  const empreendimentos: LinhaEmpreendimento[] = [...estoquePor.entries()].map(([id, estoque]) => {
    const vs = vendas.filter(r => Number(r.idempreendimento) === id);
    const k = somarKpis(vs, [], [], estoque['disponível'] + estoque.reservada);
    const vendaveis = estoque.vendida + estoque.reservada + estoque['disponível'];
    const g = valorPor.get(id);
    const ve = g?.estoque;
    return {
      valorEstoque: ve && ve.comPreco > 0 ? ve.valor : null,
      estoqueSemPreco: ve?.semPreco ?? 0,
      permuta: parado(estoque.permuta, g?.permuta),
      bloqueada: parado(estoque.bloqueada, g?.bloqueada),
      id,
      nome: nomePor.get(id) ?? String(id),
      vendidasPeriodo: k.unidades,
      vgvPeriodo: k.vgv,
      ticket: k.ticket,
      precoM2: k.precoM2,
      estoque,
      total: vendaveis + estoque.permuta + estoque.bloqueada,
      vendaveis,
      pctVendido: vendaveis > 0 ? estoque.vendida / vendaveis : 0,
      vso: k.vso,
      vendas: [...vs].sort((a, b) => (b.data_venda ?? '').localeCompare(a.data_venda ?? '')),
    };
  }).sort((a, b) => b.vgvPeriodo - a.vgvPeriodo || b.pctVendido - a.pctVendido);

  const canais = agruparFatias(vendas, r => r.canal).fatias;
  const canaisAnterior = pa ? agruparFatias(vendasDe(pa), r => r.canal).fatias : null;
  const imobiliarias = topComOutras(agruparFatias(vendas, r => r.imobiliaria).fatias, 8, 'Outras');
  const midiasAg = agruparFatias(vendas, r => r.midia);

  const noPeriodo = reservas.filter(r => dentro(r.data_cad, f.periodo));
  const desfechoMapa = new Map<string, number>();
  noPeriodo.forEach(r => {
    const d = desfechoDaReserva(r.situacao);
    desfechoMapa.set(d, (desfechoMapa.get(d) ?? 0) + 1);
  });
  const desfechos = DESFECHOS.map(label => ({ label, n: desfechoMapa.get(label) ?? 0 }));
  const vendidasDoPeriodo = desfechoMapa.get('Vendida') ?? 0;

  const canceladas = reservas.filter(r => r.situacao === 'Cancelada' && dentro(r.data_cancelamento ?? r.data_cad, f.periodo));
  const motivosC = contar(canceladas, r => r.motivo_cancelamento);
  const motivosD = contar(distratosDe(f.periodo), r => r.motivo_distrato);

  const tipo = contar(vendas, r => r.tipo_pessoa);
  // PJ não tem estado civil, sexo nem idade: a base desses recortes é só PF.
  const pf = vendas.filter(r => r.tipo_pessoa !== 'Pessoa jurídica');
  const faixaPf = contar(pf, r => r.faixa_etaria);
  const civil = contar(pf, r => r.estado_civil);
  const sexo = contar(pf, r => r.sexo);
  const cidade = contar(vendas, r => r.cidade);

  return {
    kpis,
    anterior,
    acumulado,
    serie,
    granularidade,
    empreendimentos,
    estoqueTotal,
    canais,
    canaisAnterior,
    imobiliarias,
    midias: topComOutras(midiasAg.fatias, 6, 'Outras'),
    midiasSemInfo: midiasAg.semInfo,
    desfechos,
    reservasNoPeriodo: noPeriodo.length,
    conversao: noPeriodo.length ? vendidasDoPeriodo / noPeriodo.length : 0,
    motivosCancelamento: motivosC.itens.slice(0, 6),
    motivosCancelamentoSemInfo: motivosC.semInfo,
    motivosDistrato: motivosD.itens,
    perfil: {
      base: vendas.length,
      tipoPessoa: tipo.itens,
      faixaEtaria: FAIXAS_ETARIAS.map(label => ({ label, n: faixaPf.itens.find(i => i.label === label)?.n ?? 0 })),
      estadoCivil: civil.itens,
      sexo: sexo.itens,
      cidades: cidade.itens.slice(0, 8),
      semInfo: {
        tipoPessoa: tipo.semInfo,
        faixaEtaria: faixaPf.semInfo,
        estadoCivil: civil.semInfo,
        sexo: sexo.semInfo,
        cidade: cidade.semInfo,
      },
    },
  };
}

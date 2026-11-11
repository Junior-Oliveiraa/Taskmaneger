// Transformação pura do CVDW (CV CRM) para as tabelas cv_comercial_*.
//
// É aqui que os dados pessoais param: nome, documento, e-mail, CEP, renda e idade
// exata nunca saem desta função. Do documento fica só PF/PJ; da idade, a faixa.

export interface CvReservaRow {
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
  /** 'Caixa', 'Banco privado', 'Caixa e banco privado' ou 'Sem financiamento'; nulo sem condição ativa. */
  financiamento: string | null;
}

export interface CvUnidadeRow {
  idunidade: number;
  idempreendimento: number;
  empreendimento: string;
  unidade: string;
  situacao: string;
}

// deno-lint-ignore no-explicit-any
type Raw = Record<string, any>;

const texto = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s === '' ? null : s;
};

/** O CV manda "2026-10-22 09:51:03" em horário local; só o dia interessa. */
const dia = (v: unknown): string | null => {
  const s = texto(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) && !s.startsWith('0000') ? s.slice(0, 10) : null;
};

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizarImobiliaria(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  return /aut[oô]nom/i.test(s) ? 'Autônomo' : s;
}

/** Canal comercial derivado da imobiliária; o CV não tem esse campo. */
export function classificarCanal(imobiliaria: string | null): string {
  if (!imobiliaria || /demonstra[cç][aã]o/i.test(imobiliaria)) return 'Não classificado';
  if (imobiliaria === 'Autônomo') return 'Autônomos';
  if (/uch[oô]a/i.test(imobiliaria)) return 'House';
  return 'Imobiliárias';
}

export function faixaEtaria(v: unknown): string | null {
  const i = numero(v);
  if (i < 18 || i > 100) return null;
  if (i < 30) return '18–29';
  if (i < 40) return '30–39';
  if (i < 50) return '40–49';
  if (i < 60) return '50–59';
  return '60+';
}

export function tipoPessoa(documento: unknown): string | null {
  const d = String(documento ?? '').replace(/\D/g, '').length;
  return d === 14 ? 'Pessoa jurídica' : d === 11 ? 'Pessoa física' : null;
}

export function normalizarEstadoCivil(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  return s.startsWith('Casado') ? 'Casado(a)' : s;
}

export function normalizarSexo(v: unknown): string | null {
  const s = texto(v);
  return s === 'Masculino' || s === 'Feminino' ? s : null;
}

/** Parte das APIs do CV devolve m² multiplicado por 1000 (65.26 vira 65260). */
export function normalizarArea(v: unknown): number | null {
  const a = numero(v);
  if (a <= 0) return null;
  return a >= 2000 ? a / 1000 : a;
}

/**
 * Tipo de financiamento pelas séries da condição de pagamento. A reserva guarda
 * todas as simulações (troca de Caixa para privado e vice-versa); só as linhas
 * com ativo = 'S' são a condição vigente.
 */
export function financiamentoPorReserva(condicoes: Raw[]): Map<string, string> {
  const series = new Map<string, Set<string>>();
  condicoes.forEach(c => {
    if (c.ativo !== 'S') return;
    const id = String(c.idreserva);
    const s = series.get(id) ?? new Set<string>();
    const nome = String(c.serie ?? '');
    if (/financ/i.test(nome) && /caixa/i.test(nome)) s.add('caixa');
    else if (/financ/i.test(nome) && /privad/i.test(nome)) s.add('privado');
    series.set(id, s);
  });
  const out = new Map<string, string>();
  series.forEach((s, id) => out.set(id,
    s.has('caixa') && s.has('privado') ? 'Caixa e banco privado'
      : s.has('caixa') ? 'Caixa'
      : s.has('privado') ? 'Banco privado'
      : 'Sem financiamento'));
  return out;
}

export function montarReservas(reservas: Raw[], vendas: Raw[], distratos: Raw[], condicoes: Raw[] = []): CvReservaRow[] {
  const vendaPor = new Map(vendas.map(v => [String(v.idreserva), v]));
  const distratoPor = new Map(distratos.map(d => [String(d.idreserva), d]));
  const financiamentoPor = financiamentoPorReserva(condicoes);

  return reservas.map(r => {
    const venda = vendaPor.get(String(r.idreserva));
    const distrato = distratoPor.get(String(r.idreserva));
    const imobiliaria = normalizarImobiliaria(r.imobiliaria);
    return {
      idreserva: numero(r.idreserva),
      idempreendimento: numero(r.idempreendimento),
      empreendimento: texto(r.empreendimento) ?? 'Sem empreendimento',
      idunidade: r.idunidade == null ? null : numero(r.idunidade),
      unidade: texto(r.unidade),
      bloco: texto(r.bloco),
      situacao: texto(r.situacao) ?? 'Sem situação',
      data_cad: dia(r.data_cad),
      data_venda: dia(venda?.data_venda ?? r.data_venda),
      data_cancelamento: dia(r.data_cancelamento),
      data_distrato: dia(distrato?.situacao_data),
      valor_contrato: numero(r.valor_contrato),
      area_privativa: normalizarArea(venda?.area_privativa),
      imobiliaria,
      // Corretor é o profissional da venda, não dado do cliente.
      corretor: texto(venda?.corretor ?? r.corretor),
      valor_tabela_cv: numero(r.vgv_tabela) > 0 ? numero(r.vgv_tabela) : null,
      canal: classificarCanal(imobiliaria),
      midia: texto(r.midia),
      motivo_cancelamento: texto(r.motivo_cancelamento),
      motivo_distrato: texto(distrato?.motivo_distrato),
      tipo_pessoa: tipoPessoa(r.documento_cliente),
      faixa_etaria: faixaEtaria(r.idade),
      sexo: normalizarSexo(r.sexo),
      estado_civil: normalizarEstadoCivil(r.estado_civil),
      cidade: texto(r.cidade),
      financiamento: financiamentoPor.get(String(r.idreserva)) ?? null,
    };
  });
}

export function montarUnidades(idempreendimento: number, empreendimento: string, mapa: Raw[]): CvUnidadeRow[] {
  return mapa.map(u => ({
    idunidade: numero(u.idunidade),
    idempreendimento,
    empreendimento,
    unidade: texto(u.unidade) ?? '',
    situacao: (texto(u.situacao) ?? 'sem situação').toLowerCase(),
  }));
}

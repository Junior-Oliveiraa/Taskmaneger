// Lançamentos do menu Comercial (venda, distrato, reserva). A escrita passa
// sempre pela RPC: é ela que muda a situação da unidade na Tabela de Vendas no
// mesmo passo em que grava o lançamento.
import { supabase } from './supabase';
import { SiengeVendaSituacao } from '../types';
import { UPLOAD_LIMITS, sanitizeFileName, uploadToStorage } from './storage';

export type ComercialMovimentoTipo = 'venda' | 'distrato' | 'reserva';
export type ComercialReservaStatus = 'ativa' | 'convertida' | 'expirada' | 'cancelada';

export interface ComercialMovimento {
  id: string;
  tipo: ComercialMovimentoTipo;
  projectId: string;
  unidadeId: string | null;
  unidade: string;
  cliente: string;
  corretor: string;
  imobiliaria: string | null;
  dataAssinatura: string | null;
  dataDistrato: string | null;
  diasParaCair: number | null;
  reservaExpiraEm: string | null;
  reservaStatus: ComercialReservaStatus | null;
  situacaoAnterior: SiengeVendaSituacao;
  situacaoNova: SiengeVendaSituacao;
  createdAt: string;
}

// Espelha as transições validadas em registrar_movimento_comercial: de quais
// situações cada lançamento pode partir e para qual ele leva a unidade.
export const COMERCIAL_TRANSICOES: Record<ComercialMovimentoTipo, { de: SiengeVendaSituacao[]; para: SiengeVendaSituacao }> = {
  venda:    { de: ['disponivel', 'reservado'], para: 'vendida' },
  reserva:  { de: ['disponivel'],              para: 'reservado' },
  distrato: { de: ['vendida'],                 para: 'disponivel' },
};

function toMovimento(r: any): ComercialMovimento {
  return {
    id: r.id,
    tipo: r.tipo,
    projectId: r.project_id,
    unidadeId: r.unidade_id ?? null,
    unidade: r.unidade,
    cliente: r.cliente,
    corretor: r.corretor,
    imobiliaria: r.imobiliaria ?? null,
    dataAssinatura: r.data_assinatura ?? null,
    dataDistrato: r.data_distrato ?? null,
    diasParaCair: r.dias_para_cair ?? null,
    reservaExpiraEm: r.reserva_expira_em ?? null,
    reservaStatus: r.reserva_status ?? null,
    situacaoAnterior: r.situacao_anterior,
    situacaoNova: r.situacao_nova,
    createdAt: r.created_at,
  };
}

export async function fetchComercialMovimentos(): Promise<ComercialMovimento[]> {
  const { data, error } = await supabase
    .from('comercial_movimentos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toMovimento);
}

export async function registrarMovimentoComercial(params: {
  tipo: ComercialMovimentoTipo;
  unidadeId: string;
  cliente: string;
  corretor: string;
  imobiliaria?: string | null;
  /** yyyy-mm-dd — assinatura do contrato (venda) ou data do distrato. */
  data?: string | null;
  diasParaCair?: number | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_movimento_comercial', {
    p_tipo: params.tipo,
    p_unidade_id: params.unidadeId,
    p_cliente: params.cliente,
    p_corretor: params.corretor,
    p_data: params.data ?? null,
    p_dias_para_cair: params.diasParaCair ?? null,
    p_imobiliaria: params.imobiliaria ?? null,
  });
  if (error) throw error;
  return String(data);
}

// ─── Propostas ────────────────────────────────────────────────────────────
// Acompanhamento da negociação. Não mexe na situação da unidade: é CRUD simples.

export type PropostaEtapa = 'visita' | 'realizada' | 'em_analise' | 'contra_proposta' | 'analise_final' | 'venda';

export const PROPOSTA_ETAPAS: { id: PropostaEtapa; label: string; dot: string; accentBg: string; accentBorder: string }[] = [
  { id: 'visita',          label: 'Visitas',              dot: 'bg-sky-400',     accentBg: 'bg-sky-500/[0.04]',     accentBorder: 'border-sky-500/30' },
  { id: 'realizada',       label: 'Propostas realizadas', dot: 'bg-violet-400',  accentBg: 'bg-violet-500/[0.04]',  accentBorder: 'border-violet-500/30' },
  { id: 'em_analise',      label: 'Propostas em análise', dot: 'bg-blue-400',    accentBg: 'bg-blue-500/[0.04]',    accentBorder: 'border-blue-500/30' },
  { id: 'contra_proposta', label: 'Contra proposta',      dot: 'bg-amber-400',   accentBg: 'bg-amber-500/[0.04]',   accentBorder: 'border-amber-500/30' },
  { id: 'analise_final',   label: 'Análise final',        dot: 'bg-orange-400',  accentBg: 'bg-orange-500/[0.04]',  accentBorder: 'border-orange-500/30' },
  { id: 'venda',           label: 'Venda',                dot: 'bg-emerald-400', accentBg: 'bg-emerald-500/[0.04]', accentBorder: 'border-emerald-500/30' },
];

export interface PropostaAnexo {
  name: string;
  url: string;
}

export interface PropostaParcela {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  /** yyyy-mm-dd */
  primeiroVencimento: string;
  atualizacao: 'FIXA' | 'INCC';
  /** Meses entre parcelas (0 = única). Ausente nas fichas anteriores ao campo. */
  periodicidade?: number;
}

export interface PropostaAutorizacao {
  torre: string;
  /** yyyy-mm-dd (fichas antigas: yyyy-mm) */
  dataContrato: string;
  emails: string;
  /** Ausente nas fichas anteriores ao campo. */
  telefone?: string;
  /** yyyy-mm-dd (fichas antigas: yyyy-mm) */
  vigenciaTabela: string;
  areaPrivativa: number | null;
  valorTabela: number;
  formaPagamentoSinal: string;
  parcelas: PropostaParcela[];
  observacoes: string;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

// Tudo o que a ficha deriva do que foi digitado: o valor contratado é sempre a
// soma das parcelas, para os dois nunca divergirem.
export function calcularAutorizacao(a: Pick<PropostaAutorizacao, 'areaPrivativa' | 'valorTabela' | 'parcelas'>) {
  const totais = a.parcelas.map(p => centavos(p.quantidade * p.valorUnitario));
  const contratado = centavos(totais.reduce((s, t) => s + t, 0));
  const area = a.areaPrivativa && a.areaPrivativa > 0 ? a.areaPrivativa : null;
  let acumulado = 0;
  return {
    contratado,
    m2Tabela: area ? a.valorTabela / area : null,
    m2Contratado: area ? contratado / area : null,
    difValor: centavos(contratado - a.valorTabela),
    difPercentual: a.valorTabela > 0 ? (contratado / a.valorTabela - 1) * 100 : null,
    linhas: totais.map(total => {
      acumulado += total;
      return {
        total,
        percentual: contratado > 0 ? (total / contratado) * 100 : 0,
        acumulado: contratado > 0 ? (acumulado / contratado) * 100 : 0,
      };
    }),
  };
}

export interface ComercialProposta {
  id: string;
  autorizacao: PropostaAutorizacao | null;
  projectId: string;
  unidadeId: string | null;
  unidade: string | null;
  cliente: string;
  corretor: string;
  imobiliaria: string | null;
  fluxoPagamento: string;
  anexos: PropostaAnexo[];
  etapa: PropostaEtapa;
  /** yyyy-mm-dd */
  enviadaEm: string;
  createdAt: string;
}

function toProposta(r: any): ComercialProposta {
  return {
    id: r.id,
    autorizacao: r.autorizacao ?? null,
    projectId: r.project_id,
    unidadeId: r.unidade_id ?? null,
    unidade: r.unidade ?? null,
    cliente: r.cliente,
    corretor: r.corretor,
    imobiliaria: r.imobiliaria ?? null,
    fluxoPagamento: r.fluxo_pagamento ?? '',
    anexos: Array.isArray(r.anexos) ? r.anexos : [],
    etapa: r.etapa,
    enviadaEm: r.enviada_em,
    createdAt: r.created_at,
  };
}

export async function fetchComercialPropostas(): Promise<ComercialProposta[]> {
  const { data, error } = await supabase
    .from('comercial_propostas')
    .select('*')
    .order('enviada_em', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toProposta);
}

export async function criarProposta(params: {
  projectId: string;
  unidadeId?: string | null;
  unidade?: string | null;
  cliente: string;
  corretor: string;
  imobiliaria?: string | null;
  fluxoPagamento: string;
  /** yyyy-mm-dd */
  enviadaEm: string;
  arquivos: File[];
  autorizacao?: PropostaAutorizacao | null;
}): Promise<void> {
  // O id nasce no cliente para os anexos já irem para a pasta da própria proposta.
  const id = crypto.randomUUID();
  const anexos: PropostaAnexo[] = [];
  for (const file of params.arquivos) {
    const url = await uploadToStorage(
      'attachments',
      `comercial/propostas/${id}/${Date.now()}-${sanitizeFileName(file.name)}`,
      file,
      UPLOAD_LIMITS.task,
    );
    anexos.push({ name: file.name, url });
  }

  const { error } = await supabase.from('comercial_propostas').insert({
    id,
    project_id: params.projectId,
    unidade_id: params.unidadeId ?? null,
    unidade: params.unidade ?? null,
    cliente: params.cliente,
    corretor: params.corretor,
    imobiliaria: params.imobiliaria ?? null,
    fluxo_pagamento: params.fluxoPagamento,
    anexos,
    enviada_em: params.enviadaEm,
    // Só envia a coluna quando há ficha: o lançamento pelo Início não a usa.
    ...(params.autorizacao ? { autorizacao: params.autorizacao } : {}),
  });
  if (error) throw error;
}

export async function moverProposta(id: string, etapa: PropostaEtapa): Promise<void> {
  const { error } = await supabase.from('comercial_propostas').update({ etapa }).eq('id', id);
  if (error) throw error;
}

export async function excluirProposta(id: string): Promise<void> {
  const { error } = await supabase.from('comercial_propostas').delete().eq('id', id);
  if (error) throw error;
}

// ─── Histórico de situação das unidades ───────────────────────────────────
// Gravado por trigger a cada mudança de situação na Tabela de Vendas; o client
// só lê.

export type UnidadeHistoricoOrigem = 'comercial' | 'tabela' | 'prazo' | 'importado';

export const HISTORICO_ORIGEM_LABELS: Record<UnidadeHistoricoOrigem, string> = {
  comercial: 'Lançamento no Comercial',
  tabela: 'Alterar Situação (Tabela de Vendas)',
  prazo: 'Reserva caiu por prazo',
  importado: 'Registro anterior ao histórico',
};

export interface UnidadeHistorico {
  id: string;
  projectId: string;
  unidade: string;
  situacaoAnterior: SiengeVendaSituacao | null;
  situacaoNova: SiengeVendaSituacao;
  motivo: string | null;
  cliente: string | null;
  corretor: string | null;
  imobiliaria: string | null;
  origem: UnidadeHistoricoOrigem;
  alteradoPorNome: string | null;
  createdAt: string;
}

export async function fetchUnidadeHistorico(): Promise<UnidadeHistorico[]> {
  const { data, error } = await supabase
    .from('sienge_unidade_historico')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    unidade: r.unidade,
    situacaoAnterior: r.situacao_anterior ?? null,
    situacaoNova: r.situacao_nova,
    motivo: r.motivo ?? null,
    cliente: r.cliente ?? null,
    corretor: r.corretor ?? null,
    imobiliaria: r.imobiliaria ?? null,
    origem: r.origem,
    alteradoPorNome: r.alterado_por_nome ?? null,
    createdAt: r.created_at,
  }));
}

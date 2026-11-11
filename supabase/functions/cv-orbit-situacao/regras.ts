// Regras puras de tradução da situação de uma unidade do CV CRM para o Orbit.
// Sem rede e sem banco: o index.ts busca os dados e aplica o que sair daqui.

export type SituacaoOrbit = 'disponivel' | 'reservado' | 'vendida' | 'permuta' | 'bloqueada';

// deno-lint-ignore no-explicit-any
type Raw = Record<string, any>;

export interface Alvo {
  situacao: SituacaoOrbit;
  /** Texto gravado em situacao_motivo; sempre começa por "CV CRM". */
  motivo: string;
  /** Exigido pelo Orbit para vendida e permuta. */
  comprador: string | null;
  /** ISO com fuso; só para vendida/permuta (carimbo da venda). */
  data: string | null;
  idreserva: number | null;
}

export interface Alteracao {
  unidadeId: string;
  unidade: string;
  de: string;
  alvo: Alvo;
}

/** Reservas que não ocupam mais a unidade. */
const ENCERRADAS = new Set(['Cancelada', 'Vencida', 'Distrato']);

export const normalizarUnidade = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/** O CV manda "2026-11-06 16:20:18" no horário de Maceió (UTC-3, sem horário de verão). */
export function dataCv(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || s.startsWith('0000')) return null;
  const hora = /\d{2}:\d{2}:\d{2}$/.test(s) ? s.slice(11, 19) : '12:00:00';
  return `${s.slice(0, 10)}T${hora}-03:00`;
}

/**
 * Reserva que ocupa cada unidade hoje (a mais recente entre as não encerradas)
 * e a venda mais recente de cada unidade.
 */
export function indexarReservas(reservas: Raw[]) {
  const ativa = new Map<number, Raw>();
  const venda = new Map<number, Raw>();
  const maisNova = (a: Raw | undefined, b: Raw, campo: string) =>
    !a || String(b[campo] ?? '') > String(a[campo] ?? '') ? b : a;
  for (const r of reservas) {
    const id = Number(r.idunidade);
    if (!id || r.ativo === 'N') continue;
    if (!ENCERRADAS.has(r.situacao)) ativa.set(id, maisNova(ativa.get(id), r, 'data_cad'));
    if (r.situacao === 'Vendida') venda.set(id, maisNova(venda.get(id), r, 'data_venda'));
  }
  return { ativa, venda };
}

const nome = (r: Raw | undefined) => String(r?.cliente ?? '').trim() || null;

/**
 * Situação que a unidade deve ter no Orbit, segundo o CV.
 * `termoAssinadoVendida`: no Flow, reserva em "Termo Assinado" já conta como venda.
 * Devolve null quando o CV traz um código desconhecido: nesse caso não se mexe.
 */
export function alvoDaUnidade(
  u: Raw,
  termoAssinadoVendida: boolean,
  idx: ReturnType<typeof indexarReservas>,
): Alvo | null {
  const mapa = Number(u.situacao_mapa_disponibilidade);
  const reserva = idx.ativa.get(Number(u.idunidade));

  if (mapa === 1) return { situacao: 'disponivel', motivo: 'CV CRM: disponível', comprador: null, data: null, idreserva: null };

  if (mapa === 2 || mapa === 5) {
    const etapa = String(u.situacao_reservada_nomesituacao ?? reserva?.situacao ?? '').trim();
    const idreserva = reserva ? Number(reserva.idreserva) : null;
    if (termoAssinadoVendida && /termo assinado/i.test(etapa)) {
      return {
        situacao: 'vendida',
        motivo: `CV CRM: Termo Assinado${idreserva ? ` (reserva ${idreserva})` : ''}`,
        comprador: nome(reserva) ?? 'Não informado no CV',
        data: dataCv(reserva?.data_ultima_alteracao_situacao) ?? dataCv(reserva?.data_cad),
        idreserva,
      };
    }
    return {
      situacao: 'reservado',
      motivo: `CV CRM: reservada${etapa ? ` · ${etapa}` : ''}${idreserva ? ` (reserva ${idreserva})` : ''}`,
      comprador: null, data: null, idreserva,
    };
  }

  if (mapa === 3) {
    const v = idx.venda.get(Number(u.idunidade));
    const idreserva = v ? Number(v.idreserva) : null;
    return {
      situacao: 'vendida',
      motivo: `CV CRM: vendida${idreserva ? ` (reserva ${idreserva})` : ''}`,
      comprador: nome(v) ?? 'Não informado no CV',
      data: dataCv(v?.data_venda),
      idreserva,
    };
  }

  if (mapa === 4) {
    const motivo = String(u.situacao_bloqueada_motivo ?? '').trim();
    if (/permut/i.test(motivo)) {
      return { situacao: 'permuta', motivo: 'CV CRM: bloqueada · Permutante', comprador: 'Permutante', data: dataCv(u.data_bloqueio), idreserva: null };
    }
    return { situacao: 'bloqueada', motivo: `CV CRM: bloqueada${motivo ? ` · ${motivo}` : ''}`, comprador: null, data: null, idreserva: null };
  }

  return null;
}

/**
 * Compara as unidades do CV de um empreendimento com as linhas da versão principal
 * do Orbit. Só entram unidades que existem nos dois lados com o mesmo nome; nomes
 * repetidos no CV são ignorados (não dá para saber qual é qual) e voltam em `ambiguas`.
 */
export function compararEmpreendimento(
  cvUnidades: Raw[],
  orbit: { id: string; unidade: string; situacao: string }[],
  termoAssinadoVendida: boolean,
  idx: ReturnType<typeof indexarReservas>,
) {
  const porNome = new Map<string, Raw[]>();
  for (const u of cvUnidades) {
    const k = normalizarUnidade(u.nome);
    porNome.set(k, [...(porNome.get(k) ?? []), u]);
  }
  const alteracoes: Alteracao[] = [];
  const ambiguas: string[] = [];
  let conferidas = 0;
  for (const linha of orbit) {
    const achadas = porNome.get(normalizarUnidade(linha.unidade));
    if (!achadas) continue;
    if (achadas.length > 1) { ambiguas.push(linha.unidade); continue; }
    const alvo = alvoDaUnidade(achadas[0], termoAssinadoVendida, idx);
    if (!alvo) continue;
    conferidas++;
    if (alvo.situacao !== linha.situacao) alteracoes.push({ unidadeId: linha.id, unidade: linha.unidade, de: linha.situacao, alvo });
  }
  return { alteracoes, ambiguas, conferidas };
}

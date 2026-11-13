// VSO mensal (venda sobre oferta) do painel Desempenho.
//
//   VSO do mês = vendas líquidas do mês ÷ estoque do mês
//   vendas líquidas = vendas com data no mês − distratos com data no mês
//   estoque do mês  = estoque no fechamento (disponíveis + reservadas) + vendas líquidas
//                     (ou seja, o que estava à venda no dia 1)
//
// O estoque do fechamento vem da foto que o banco tira na virada de cada mês
// (cv_comercial_unidades_fechamento). Mês sem foto, anterior à criação dela, é
// estimado de trás para frente a partir da foto seguinte (ou do estoque atual),
// devolvendo ao estoque as vendas líquidas que vieram depois. O mês corrente
// ainda não fechou: usa o estoque de agora.

import { supabase } from './supabase';
import { CvReserva, CvUnidade, situacaoEstoqueDe } from './cvComercial';

/** Fotos do estoque por mês ('2026-10' → unidades no fechamento de outubro). */
export type FotosEstoque = Map<string, CvUnidade[]>;

export async function fetchFotosEstoque(): Promise<FotosEstoque> {
  const fotos: FotosEstoque = new Map();
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase
      .from('cv_comercial_unidades_fechamento')
      .select('mes,idunidade,idempreendimento,empreendimento,unidade,situacao,motivo_bloqueio')
      .order('mes')
      .order('idunidade')
      .range(de, de + passo - 1);
    if (error) throw error;
    (data ?? []).forEach(r => {
      const mes = String(r.mes).slice(0, 7);
      const { mes: _, ...u } = r;
      fotos.set(mes, [...(fotos.get(mes) ?? []), u as CvUnidade]);
    });
    if (!data || data.length < passo) return fotos;
  }
}

export type OrigemVso = 'fechamento' | 'estimado' | 'parcial';

export interface MesVso {
  /** yyyy-mm */
  mes: string;
  label: string;
  labelLongo: string;
  vendas: number;
  distratos: number;
  liquidas: number;
  estoqueFinal: number;
  estoqueInicial: number;
  /** Nulo quando não havia nada à venda no mês. */
  vso: number | null;
  origem: OrigemVso;
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function somarMeses(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Meses de `de` a `ate` (yyyy-mm), inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let m = de; m <= ate; m = somarMeses(m, 1)) out.push(m);
  return out;
}

const emAberto = (u: CvUnidade) => {
  const s = situacaoEstoqueDe(u);
  return s === 'disponível' || s === 'reservada';
};

function contarAbertos(unidades: CvUnidade[], noRecorte: (id: number) => boolean): Map<number, number> {
  const m = new Map<number, number>();
  unidades.forEach(u => {
    const id = Number(u.idempreendimento);
    if (noRecorte(id) && emAberto(u)) m.set(id, (m.get(id) ?? 0) + 1);
  });
  return m;
}

/**
 * VSO de cada mês de `meses`, para os empreendimentos do recorte (nulo = todos).
 * `unidadesAtuais` e as fotos já devem vir sem as unidades fora da tabela do Orbit.
 */
export function calcularVsoMensal({ reservas, unidadesAtuais, fotos, empreendimentos, meses, mesAtual }: {
  reservas: CvReserva[];
  unidadesAtuais: CvUnidade[];
  fotos: FotosEstoque;
  empreendimentos: number[] | null;
  meses: string[];
  mesAtual: string;
}): MesVso[] {
  const noRecorte = (id: number) => !empreendimentos || empreendimentos.includes(id);

  // Vendas e distratos por empreendimento e mês, e o primeiro mês com movimento de cada um.
  type Mov = { vendas: number; distratos: number };
  const mov = new Map<number, Map<string, Mov>>();
  const inicio = new Map<number, string>();
  const somar = (id: number, ym: string, campo: keyof Mov) => {
    const porMes = mov.get(id) ?? new Map<string, Mov>();
    const v = porMes.get(ym) ?? { vendas: 0, distratos: 0 };
    v[campo] += 1;
    porMes.set(ym, v);
    mov.set(id, porMes);
  };
  reservas.forEach(r => {
    const id = Number(r.idempreendimento);
    if (!noRecorte(id)) return;
    const primeira = r.data_cad ?? r.data_venda;
    if (primeira && (!inicio.has(id) || primeira.slice(0, 7) < inicio.get(id)!)) inicio.set(id, primeira.slice(0, 7));
    // A venda distratada deixa de ser "Vendida" no CV, mas foi venda no mês dela.
    if (r.situacao === 'Vendida' && r.data_venda) somar(id, r.data_venda.slice(0, 7), 'vendas');
    if (r.situacao === 'Distrato') {
      const dv = r.data_venda ?? r.data_cad;
      if (dv) somar(id, dv.slice(0, 7), 'vendas');
      const dd = r.data_distrato ?? r.data_cad;
      if (dd) somar(id, dd.slice(0, 7), 'distratos');
    }
  });
  const liquidas = (id: number, ym: string) => {
    const v = mov.get(id)?.get(ym);
    return v ? v.vendas - v.distratos : 0;
  };
  /** Vendas líquidas de `de` a `ate`, inclusive. */
  const liquidasEntre = (id: number, de: string, ate: string) =>
    de > ate ? 0 : mesesEntre(de, ate).reduce((t, ym) => t + liquidas(id, ym), 0);

  const abertosAgora = contarAbertos(unidadesAtuais, noRecorte);
  const abertosNaFoto = new Map([...fotos].map(([ym, us]) => [ym, contarAbertos(us, noRecorte)]));
  const mesesComFoto = [...fotos.keys()].filter(ym => ym < mesAtual).sort();

  const ids = new Set<number>([
    ...abertosAgora.keys(), ...mov.keys(),
    ...[...abertosNaFoto.values()].flatMap(m => [...m.keys()]),
  ]);

  return meses.filter(ym => ym <= mesAtual).map(ym => {
    const origem: OrigemVso = ym === mesAtual ? 'parcial' : abertosNaFoto.has(ym) ? 'fechamento' : 'estimado';
    // Foto mais próxima depois do mês, para estimar quando o mês não tem a sua.
    const ancora = origem === 'estimado' ? mesesComFoto.find(f => f > ym) ?? null : null;

    let vendas = 0, distratos = 0, estoqueFinal = 0;
    ids.forEach(id => {
      const v = mov.get(id)?.get(ym);
      vendas += v?.vendas ?? 0;
      distratos += v?.distratos ?? 0;
      if (origem === 'parcial') estoqueFinal += abertosAgora.get(id) ?? 0;
      else if (origem === 'fechamento') estoqueFinal += abertosNaFoto.get(ym)!.get(id) ?? 0;
      else {
        // Antes da primeira reserva o empreendimento ainda não estava à venda.
        const desde = inicio.get(id);
        if (!desde || desde > ym) return;
        estoqueFinal += ancora
          ? (abertosNaFoto.get(ancora)!.get(id) ?? 0) + liquidasEntre(id, somarMeses(ym, 1), ancora)
          : (abertosAgora.get(id) ?? 0) + liquidasEntre(id, somarMeses(ym, 1), mesAtual);
      }
    });
    const liq = vendas - distratos;
    const estoqueInicial = Math.max(estoqueFinal + liq, 0);
    const [y, m] = ym.split('-').map(Number);
    return {
      mes: ym,
      label: `${MES_CURTO[m - 1]}/${String(y).slice(2)}`,
      labelLongo: `${MES_LONGO[m - 1]} de ${y}`,
      vendas,
      distratos,
      liquidas: liq,
      estoqueFinal,
      estoqueInicial,
      vso: estoqueInicial > 0 ? liq / estoqueInicial : null,
      origem,
    };
  });
}

/** Média simples dos VSOs dos meses já fechados (o mês corrente fica fora). */
export function mediaVso(meses: MesVso[]): { media: number | null; meses: MesVso[] } {
  const validos = meses.filter(m => m.origem !== 'parcial' && m.vso !== null);
  return {
    media: validos.length ? validos.reduce((t, m) => t + (m.vso as number), 0) / validos.length : null,
    meses: validos,
  };
}

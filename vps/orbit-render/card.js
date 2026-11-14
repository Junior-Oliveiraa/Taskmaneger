// Card de "proposta aguardando aprovação" enviado por WhatsApp ao diretor.
//
// Satori transforma uma árvore de elementos (subconjunto de CSS/flexbox) em SVG
// e o resvg converte em PNG. Nada de navegador: cabe na VPS de 1 GB.
//
// Entrada (o que a Edge Function manda): dados crus da proposta. Os cálculos
// (contratado, %, m², diferença) são feitos aqui com a mesma regra de
// src/lib/comercialApi.ts > calcularAutorizacao.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve('@fontsource/inter/package.json')), 'files');
const font = (w) => readFileSync(path.join(fontDir, `inter-latin-${w}-normal.woff`));
const FONTS = [400, 500, 600, 700].map((weight) => ({ name: 'Inter', data: font(weight), weight, style: 'normal' }));

const W = 720;
const C = {
  bg: '#0b0b0d',
  card: '#141417',
  border: '#27272c',
  text: '#f4f4f5',
  muted: '#8b8b95',
  faint: '#5d5d66',
  red: '#f87171',
  redBg: '#3a1a1c',
  amber: '#fbbf24',
  amberBg: '#3a2a0c',
  track: '#2a2a30',
  green: '#34d399',
  greenBg: '#0f2e24',
  blue: '#60a5fa',
  blueBg: '#13233d',
};
const SELOS = {
  aprovacao: { texto: 'APROVAÇÃO PENDENTE', cor: C.amber, bg: C.amberBg },
  contra: { texto: 'CONTRA PROPOSTA', cor: C.blue, bg: C.blueBg },
};
const SERIES = ['#3b82f6', '#818cf8', '#38bdf8', '#14b8a6', '#f59e0b', '#ec4899', '#a3e635', '#f97316'];

// ── formatação ─────────────────────────────────────────────────────────────
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const cent = (v) => Math.round(v * 100) / 100;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || '');
  return m ? { y: +m[1], mo: +m[2], d: m[3] ? +m[3] : 1 } : null;
}
const fmtDate = (d) => (d ? `${String(d.d).padStart(2, '0')}/${String(d.mo).padStart(2, '0')}/${d.y}` : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function addMonths(d, n) {
  const t = d.y * 12 + (d.mo - 1) + n;
  return { y: Math.floor(t / 12), mo: (t % 12) + 1, d: d.d };
}
const PERIODO = { 0: 'única', 1: 'mensal', 2: 'bimestral', 3: 'trimestral', 4: 'quadrimestral', 6: 'semestral', 12: 'anual' };
const PERIODO_PLURAL = { 1: 'mensais', 2: 'bimestrais', 3: 'trimestrais', 4: 'quadrimestrais', 6: 'semestrais', 12: 'anuais' };

function detalheParcela(p) {
  const ini = parseDate(p.primeiroVencimento);
  const q = Number(p.quantidade) || 0;
  const per = p.periodicidade ?? (q > 1 ? 1 : 0);
  if (q <= 1 || per === 0) return `parcela única · ${fmtDate(ini)}`;
  const nome = PERIODO_PLURAL[per] || `a cada ${per} meses`;
  const fim = ini ? addMonths(ini, (q - 1) * per) : null;
  return `${q}× ${brl(p.valorUnitario)} ${nome} · ${fmtDate(ini)} até ${fim ? `${MESES[fim.mo - 1]}/${String(fim.y).slice(2)}` : '—'}`;
}

// ── mini-JSX ───────────────────────────────────────────────────────────────
function h(style, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
const label = (t) => h({ fontSize: 13, fontWeight: 600, letterSpacing: 1.2, color: C.muted }, t.toUpperCase());
const row = (k, v, opts = {}) =>
  h(
    { justifyContent: 'space-between', alignItems: 'center', fontSize: 17, padding: '7px 0' },
    h({ color: C.muted }, k),
    h({ fontWeight: 600, color: opts.color || C.text }, v),
  );

// ── card ───────────────────────────────────────────────────────────────────
export function buildCard(input) {
  const a = input.autorizacao || {};
  const parcelas = (a.parcelas || []).filter((p) => (Number(p.quantidade) || 0) > 0);
  const totais = parcelas.map((p) => cent(p.quantidade * p.valorUnitario));
  const contratado = cent(totais.reduce((s, t) => s + t, 0));
  const tabela = Number(input.valorTabela ?? a.valorTabela) || 0;
  const area = a.areaPrivativa > 0 ? a.areaPrivativa : null;
  const dif = cent(contratado - tabela);
  const desconto = input.descontoPct ?? (tabela > 0 ? Math.max(0, (1 - contratado / tabela) * 100) : 0);
  const limite = input.limitePct ?? 1.5;
  const ratio = tabela > 0 ? Math.min(1, contratado / tabela) : 1;

  const subtitulo = [a.torre, input.unidade ? `Unidade ${input.unidade}` : null].filter(Boolean).join(' · ');
  const selo = SELOS[input.selo] || SELOS.aprovacao;

  // Diferença sobre a tabela: desconto (vermelho, âmbar se dentro do limite), ágio (verde) ou nenhuma.
  const agio = tabela > 0 && contratado > tabela + 0.005;
  const semDif = !agio && desconto < 0.005;
  const acimaLimite = desconto > limite + 0.0001;
  const tom = agio ? { cor: C.green, bg: C.greenBg } : semDif ? { cor: C.muted, bg: C.track } : acimaLimite ? { cor: C.red, bg: C.redBg } : { cor: C.amber, bg: C.amberBg };
  const badge = agio ? `+${pct((contratado / tabela - 1) * 100)}` : semDif ? '0,00%' : `-${pct(desconto)}`;
  const badgeTexto = agio ? 'acima da tabela' : semDif ? 'igual à tabela' : `abaixo da tabela · limite ${pct(limite)}`;

  const header = h(
    { flexDirection: 'column', gap: 6 },
    h(
      { justifyContent: 'space-between', alignItems: 'center' },
      h(
        { alignItems: 'center', gap: 8, backgroundColor: selo.bg, color: selo.cor, fontSize: 14, fontWeight: 700, padding: '6px 12px', borderRadius: 999, letterSpacing: 0.8 },
        selo.texto,
      ),
      h({ fontSize: 15, color: C.muted, fontWeight: 500 }, [input.numero ? `Proposta nº ${input.numero}` : 'Proposta', input.data].filter(Boolean).join(' · ')),
    ),
    h({ fontSize: 30, fontWeight: 700, color: C.text, marginTop: 14 }, input.empreendimento || 'Empreendimento'),
    subtitulo ? h({ fontSize: 17, color: C.muted }, subtitulo) : null,
    h({ fontSize: 17, color: C.muted, marginTop: 2 }, `Cliente: ${input.cliente || '—'}`),
  );

  const resumo = h(
    { flexDirection: 'column', backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 24px', marginTop: 24 },
    h({ fontSize: 15, color: C.muted }, 'Valor contratado'),
    h({ fontSize: 40, fontWeight: 700, color: C.text, marginTop: 2 }, brl(contratado)),
    h(
      { alignItems: 'center', gap: 10, marginTop: 8 },
      h({ backgroundColor: tom.bg, color: tom.cor, fontSize: 15, fontWeight: 700, padding: '3px 10px', borderRadius: 6 }, badge),
      h({ fontSize: 15, color: C.muted }, badgeTexto),
    ),
    // barra contratado x tabela, com marca no limite
    h(
      { position: 'relative', height: 8, backgroundColor: C.track, borderRadius: 4, marginTop: 18, marginBottom: 10 },
      h({ width: `${ratio * 100}%`, height: 8, backgroundColor: semDif ? C.muted : tom.cor, borderRadius: 4, opacity: 0.85 }),
      h({ position: 'absolute', left: `${(1 - limite / 100) * 100}%`, top: -4, width: 2, height: 16, backgroundColor: C.text }),
    ),
    row('Valor de tabela', brl(tabela)),
    row('Diferença', brl(dif), { color: dif < 0 ? tom.cor : dif > 0 ? C.green : C.text }),
    h({ height: 1, backgroundColor: C.border, margin: '6px 0' }),
    row('m² tabela', area ? brl(tabela / area) : '—'),
    row('m² contratado', area ? brl(contratado / area) : '—'),
  );

  const barra = h(
    { height: 10, gap: 3, marginTop: 14, marginBottom: 6 },
    totais.map((t, i) =>
      h({ flexGrow: contratado > 0 ? t / contratado : 1, flexBasis: 0, height: 10, borderRadius: 3, backgroundColor: SERIES[i % SERIES.length] }),
    ),
  );

  const linhas = parcelas.map((p, i) =>
    h(
      { alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < parcelas.length - 1 ? `1px solid ${C.border}` : 'none' },
      h({ width: 4, height: 40, borderRadius: 2, backgroundColor: SERIES[i % SERIES.length] }),
      h(
        { flexDirection: 'column', flexGrow: 1, gap: 3 },
        h({ fontSize: 18, fontWeight: 600, color: C.text }, p.descricao || `Parcela ${i + 1}`),
        h({ fontSize: 14, color: C.muted }, detalheParcela(p)),
      ),
      h(
        { flexDirection: 'column', alignItems: 'flex-end', gap: 3 },
        h({ fontSize: 18, fontWeight: 700, color: C.text }, brl(totais[i])),
        h({ fontSize: 14, color: C.muted }, pct(contratado > 0 ? (totais[i] / contratado) * 100 : 0)),
      ),
    ),
  );

  const fluxo = h(
    { flexDirection: 'column', marginTop: 28 },
    h({ justifyContent: 'space-between', alignItems: 'center' }, label('Fluxo de pagamento'), h({ fontSize: 13, color: C.faint }, `${parcelas.length} ${parcelas.length === 1 ? 'série' : 'séries'}`)),
    barra,
    linhas,
  );

  const rodape = h(
    { flexDirection: 'column', gap: 4, marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.border}` },
    h({ fontSize: 15, color: C.muted }, ['Corretor: ' + (input.corretor || '—'), input.imobiliaria].filter(Boolean).join(' · ')),
    input.solicitante ? h({ fontSize: 15, color: C.muted }, `Enviada por ${input.solicitante}`) : null,
  );

  const height = 40 + 150 + 24 + 330 + 28 + 50 + parcelas.length * 70 + 24 + 18 + (input.solicitante ? 50 : 26) + 5;

  return {
    height,
    element: h(
      { flexDirection: 'column', width: W, height, backgroundColor: C.bg, padding: '40px 36px', fontFamily: 'Inter', color: C.text },
      header,
      resumo,
      fluxo,
      rodape,
    ),
  };
}

export async function renderCard(input) {
  const { element, height } = buildCard(input);
  const svg = await satori(element, { width: W, height, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W * 2 }, background: C.bg }).render().asPng();
  return png;
}

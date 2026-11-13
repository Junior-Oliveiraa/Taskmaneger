import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Table2, BarChart3 } from 'lucide-react';

// Gráficos da aba Desempenho, sem biblioteca: barras em HTML (acompanham a largura
// do card sem medir nada) e rosca em SVG. As cores vêm de --cv-* em index.css,
// escolhidas por tema e validadas contra a superfície de cada um.

export const COR = {
  azul: 'var(--cv-azul)',
  roxo: 'var(--cv-roxo)',
  verde: 'var(--cv-verde)',
  amarelo: 'var(--cv-amarelo)',
  cinza: 'var(--cv-cinza)',
  cinzaClaro: 'var(--cv-cinza-claro)',
};

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TipEstado { x: number; y: number; conteudo: React.ReactNode }

function useTip() {
  const [tip, setTip] = useState<TipEstado | null>(null);
  const props = (conteudo: React.ReactNode, ariaLabel: string) => ({
    tabIndex: 0,
    'aria-label': ariaLabel,
    onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, conteudo }),
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, conteudo }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement | SVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, conteudo });
    },
    onBlur: () => setTip(null),
  });
  const camada = tip && createPortal(
    <div
      role="tooltip"
      className="fixed z-[100] pointer-events-none max-w-[260px] rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-300 shadow-xl shadow-black/40"
      style={{
        left: Math.min(tip.x + 12, window.innerWidth - 270),
        top: Math.max(tip.y - 12, 8),
        transform: 'translateY(-100%)',
      }}
    >
      {tip.conteudo}
    </div>,
    document.body,
  );
  return { props, camada };
}

export const TipTitulo = ({ children }: { children: React.ReactNode }) => (
  <p className="font-semibold text-zinc-100">{children}</p>
);

// ── Card com alternância para tabela ─────────────────────────────────────────

export interface TabelaDoGrafico {
  colunas: string[];
  linhas: (string | number)[][];
}

export function CardGrafico({ titulo, subtitulo, acao, tabela, rodape, children, className = '' }: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
  tabela?: TabelaDoGrafico;
  rodape?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className={`flex flex-col min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 short:p-3 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-zinc-100">{titulo}</h4>
          {subtitulo && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {acao}
          {tabela && (
            <button
              type="button"
              onClick={() => setVerTabela(v => !v)}
              aria-pressed={verTabela}
              title={verTabela ? 'Ver gráfico' : 'Ver tabela'}
              aria-label={verTabela ? 'Ver gráfico' : 'Ver tabela'}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
            >
              {verTabela ? <BarChart3 size={14} /> : <Table2 size={14} />}
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {verTabela && tabela ? <TabelaSimples {...tabela} /> : children}
      </div>
      {rodape && <p className="text-[11px] text-zinc-500 mt-3">{rodape}</p>}
    </section>
  );
}

function TabelaSimples({ colunas, linhas }: TabelaDoGrafico) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500">
            {colunas.map((c, i) => (
              <th key={c} className={`font-semibold py-1.5 px-2 border-b border-zinc-800 ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="text-zinc-300">
              {l.map((v, j) => (
                <td key={j} className={`py-1.5 px-2 border-b border-zinc-800/50 ${j === 0 ? 'text-left' : 'text-right tabular-nums'}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SemDados = ({ texto = 'Sem dados neste recorte.' }: { texto?: string }) => (
  <div className="h-full min-h-[120px] flex items-center justify-center text-xs text-zinc-500 text-center px-4">{texto}</div>
);

// ── Colunas ──────────────────────────────────────────────────────────────────

function passoRedondo(max: number, divisoes = 4) {
  if (max <= 0) return 1;
  const bruto = max / divisoes;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export interface Coluna {
  chave: string;
  label: string;
  valor: number;
  tip: React.ReactNode;
  aria: string;
}

const ALTURA_PLOT = 176;

export function GraficoColunas({ colunas, formatarEixo, formatarRotulo, cor = COR.azul, rotularTodas = false }: {
  colunas: Coluna[];
  formatarEixo: (n: number) => string;
  formatarRotulo: (n: number) => string;
  cor?: string;
  rotularTodas?: boolean;
}) {
  const { props, camada } = useTip();
  const maxValor = Math.max(0, ...colunas.map(c => c.valor));
  if (maxValor <= 0) return <SemDados />;

  const passo = passoRedondo(maxValor);
  const topo = Math.ceil(maxValor / passo) * passo;
  const ticks: number[] = [];
  for (let t = 0; t <= topo + passo / 2; t += passo) ticks.push(t);

  const iMax = colunas.reduce((m, c, i) => (c.valor > colunas[m].valor ? i : m), 0);
  const iUlt = colunas.length - 1;
  const cadaLabel = Math.ceil(colunas.length / 12);

  return (
    <div className="flex gap-2">
      <div className="relative w-12 shrink-0" style={{ height: ALTURA_PLOT }} aria-hidden>
        {ticks.map(t => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2 text-[10px] text-zinc-500 tabular-nums whitespace-nowrap"
            style={{ top: ALTURA_PLOT - (t / topo) * ALTURA_PLOT }}
          >
            {formatarEixo(t)}
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative" style={{ height: ALTURA_PLOT }}>
          {ticks.map(t => (
            <div key={t} className="absolute inset-x-0 h-px bg-zinc-800/70" style={{ top: ALTURA_PLOT - (t / topo) * ALTURA_PLOT }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {colunas.map((c, i) => {
              const h = (c.valor / topo) * ALTURA_PLOT;
              const rotular = c.valor > 0 && (rotularTodas || i === iMax || i === iUlt);
              return (
                <div
                  key={c.chave}
                  {...props(c.tip, c.aria)}
                  className="group relative flex-1 min-w-0 h-full flex flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:bg-zinc-800/30"
                >
                  {rotular && (
                    <span className="mb-1 text-[10px] font-semibold text-zinc-300 tabular-nums whitespace-nowrap">
                      {formatarRotulo(c.valor)}
                    </span>
                  )}
                  <div
                    className="w-[70%] max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{ height: c.valor > 0 ? Math.max(h, 2) : 0, background: cor }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex mt-1.5" aria-hidden>
          {colunas.map((c, i) => (
            <div key={c.chave} className="flex-1 min-w-0 flex justify-center text-[10px] text-zinc-500 whitespace-nowrap">
              {/* Em tela estreita, só metade dos rótulos cabe sem encostar. */}
              {(colunas.length - 1 - i) % cadaLabel === 0 && (
                <span className={colunas.length > 6 && (colunas.length - 1 - i) % (cadaLabel * 2) !== 0 ? 'hidden sm:inline' : ''}>{c.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {camada}
    </div>
  );
}

// ── Colunas com meta (meta x realizado) ──────────────────────────────────────

export interface ColunaMeta {
  chave: string;
  label: string;
  valor: number;
  meta: number | null;
  tip: React.ReactNode;
  aria: string;
}

/** Altura mínima do gráfico; com espaço sobrando no card, ele cresce até ocupá-lo. */
const ALTURA_META_MIN = 150;

/** Altura atual do elemento, acompanhando o redimensionamento do card. */
function useAltura<T extends HTMLElement>(inicial: number) {
  const [el, setEl] = useState<T | null>(null);
  const [altura, setAltura] = useState(inicial);
  // Ref por callback: o elemento só existe quando há dados, e pode surgir depois.
  useLayoutEffect(() => {
    if (!el) return;
    const medir = () => setAltura(Math.max(inicial, Math.round(el.getBoundingClientRect().height)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, inicial]);
  return [setEl, altura] as const;
}

/**
 * Uma coluna por período com o realizado; a meta do período é um traço fino
 * tracejado sobre a coluna. Traços vizinhos com o mesmo valor se emendam
 * numa linha só, sem disputar atenção com as colunas.
 */
export function GraficoColunasMeta({ colunas, formatarEixo, formatarRotulo }: {
  colunas: ColunaMeta[];
  formatarEixo: (n: number) => string;
  formatarRotulo: (n: number) => string;
}) {
  const { props, camada } = useTip();
  const [refPlot, ALTURA_META] = useAltura<HTMLDivElement>(ALTURA_META_MIN);
  const maximo = Math.max(0, ...colunas.flatMap(c => [c.valor, c.meta ?? 0]));
  if (maximo <= 0) return <SemDados />;

  const passo = passoRedondo(maximo, 3);
  const topo = Math.ceil(maximo / passo) * passo;
  const ticks: number[] = [];
  for (let t = 0; t <= topo + passo / 2; t += passo) ticks.push(t);
  const y = (v: number) => ALTURA_META - (v / topo) * ALTURA_META;

  const n = colunas.length;
  const iMax = colunas.reduce((m, c, i) => (c.valor > colunas[m].valor ? i : m), 0);
  const cadaLabel = Math.ceil(n / 12);

  // Meta ligada ponto a ponto pelo centro de cada coluna; período sem meta interrompe a linha.
  const xMeio = (i: number) => ((i + 0.5) / n) * 100;
  let linhaMeta = '';
  colunas.forEach((c, i) => {
    if (c.meta === null) return;
    const anteriorTem = i > 0 && colunas[i - 1].meta !== null;
    linhaMeta += `${anteriorTem ? 'L' : 'M'}${xMeio(i)},${y(c.meta)} `;
  });
  const pontosMeta = n <= 31;

  return (
    <div className="flex-1 flex flex-col">
      {/* A área do gráfico ocupa a sobra do card; posições internas são absolutas
          para a altura medida não empurrar o card e crescer sem fim. */}
      <div ref={refPlot} className="flex-1 flex gap-2" style={{ minHeight: ALTURA_META_MIN }}>
      <div className="relative w-10 shrink-0" aria-hidden>
        {ticks.map(t => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-[10px] text-zinc-500 tabular-nums whitespace-nowrap" style={{ top: y(t) }}>
            {formatarEixo(t)}
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0 relative">
        <div className="absolute inset-0">
          {ticks.map(t => (
            <div key={t} className="absolute inset-x-0 h-px bg-zinc-800/50" style={{ top: y(t) }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {colunas.map((c, i) => {
              const rotular = c.valor > 0 && (i === iMax || i === n - 1) && n <= 31;
              return (
                <div
                  key={c.chave}
                  {...props(c.tip, c.aria)}
                  className="group relative flex-1 min-w-0 h-full flex flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:bg-zinc-800/30"
                >
                  {rotular && (
                    <span className="mb-1 text-[10px] font-semibold text-zinc-300 tabular-nums whitespace-nowrap">
                      {formatarRotulo(c.valor)}
                    </span>
                  )}
                  {/* Até a meta a coluna é azul; só o que passou dela fica verde. */}
                  <div
                    className="w-[64%] max-w-7 rounded-t-[4px] overflow-hidden flex flex-col transition-opacity group-hover:opacity-80"
                    style={{ height: c.valor > 0 ? Math.max((c.valor / topo) * ALTURA_META, 2) : 0 }}
                  >
                    {c.meta !== null && c.meta > 0 && c.valor > c.meta && (
                      <div className="shrink-0" style={{ height: ((c.valor - c.meta) / topo) * ALTURA_META, background: COR.verde }} />
                    )}
                    <div className="flex-1" style={{ background: COR.azul }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Meta: linha fina ligando os pontos; os pontos ficam em HTML para não deformar. */}
          {linhaMeta && (
            <>
              <svg viewBox={`0 0 100 ${ALTURA_META}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" aria-hidden>
                <path d={linhaMeta} fill="none" stroke={COR.cinza} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {pontosMeta && colunas.map((c, i) => c.meta === null ? null : (
                <span
                  key={c.chave}
                  aria-hidden
                  className="absolute w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full pointer-events-none"
                  style={{ left: `${xMeio(i)}%`, top: y(c.meta), background: COR.cinza }}
                />
              ))}
            </>
          )}
        </div>
      </div>
      </div>
      <div className="pl-12">
        <div className="flex mt-1.5" aria-hidden>
          {colunas.map((c, i) => (
            <div key={c.chave} className="flex-1 min-w-0 flex justify-center text-[10px] text-zinc-500 whitespace-nowrap">
              {(n - 1 - i) % cadaLabel === 0 && (
                <span className={n > 6 && (n - 1 - i) % (cadaLabel * 2) !== 0 ? 'hidden sm:inline' : ''}>{c.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {camada}
    </div>
  );
}

// ── Barras horizontais ───────────────────────────────────────────────────────

export interface Barra {
  label: string;
  /** Texto do balão nativo quando o label é abreviado; também serve de chave. */
  titulo?: string;
  valor: number;
  rotulo: string;
  tip: React.ReactNode;
}

export function ListaBarras({ barras, cor = COR.azul }: { barras: Barra[]; cor?: string }) {
  const { props, camada } = useTip();
  const max = Math.max(0, ...barras.map(b => b.valor));
  if (max <= 0) return <SemDados />;
  return (
    <ul className="flex flex-col gap-2">
      {barras.map(b => (
        <li
          key={b.titulo ?? b.label}
          {...props(b.tip, `${b.titulo ?? b.label}: ${b.rotulo}`)}
          className="group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 min-h-6 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="text-xs leading-tight text-zinc-300 line-clamp-2" title={b.titulo ?? b.label}>{b.label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 h-3 flex items-center">
              <span
                className="block h-3 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                style={{ width: `${Math.max((b.valor / max) * 100, b.valor > 0 ? 1 : 0)}%`, background: cor }}
              />
            </span>
            <span className="w-[72px] shrink-0 text-right text-[11px] font-semibold text-zinc-200 tabular-nums whitespace-nowrap">{b.rotulo}</span>
          </span>
        </li>
      ))}
      {camada}
    </ul>
  );
}

// ── Rosca ────────────────────────────────────────────────────────────────────

export interface Fatia {
  label: string;
  valor: number;
  cor: string;
  rotulo: string;
  tip: React.ReactNode;
}

const RAIO = 54;
const ESPESSURA = 16;
const CIRC = 2 * Math.PI * RAIO;
// 2px de superfície entre as fatias, convertidos para o viewBox de 140.
const VAO = 2;

export function Rosca({ fatias, centro, centroLabel }: {
  fatias: Fatia[];
  centro: string;
  centroLabel: string;
}) {
  const { props, camada } = useTip();
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) return <SemDados />;
  const visiveis = fatias.filter(f => f.valor > 0);
  let acumulado = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      <div className="relative w-[148px] h-[148px] shrink-0">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90" role="img" aria-label={`${centroLabel}: ${centro}`}>
          {visiveis.map(f => {
            const compr = (f.valor / total) * CIRC;
            const inicio = acumulado;
            acumulado += compr;
            const gap = visiveis.length > 1 ? VAO : 0;
            return (
              <circle
                key={f.label}
                {...props(f.tip, `${f.label}: ${f.rotulo}`)}
                cx="70" cy="70" r={RAIO} fill="none"
                stroke={f.cor} strokeWidth={ESPESSURA}
                strokeDasharray={`${Math.max(compr - gap, 0.5)} ${CIRC}`}
                strokeDashoffset={-inicio}
                className="outline-none transition-opacity hover:opacity-80 focus-visible:opacity-70"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <span className="text-base font-bold text-zinc-100 leading-tight">{centro}</span>
          <span className="text-[10px] text-zinc-500 leading-tight mt-0.5">{centroLabel}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 min-w-[150px] flex-1">
        {fatias.map(f => (
          <li key={f.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: f.cor }} />
            <span className="text-zinc-300 truncate flex-1" title={f.label}>{f.label}</span>
            <span className="font-semibold text-zinc-200 tabular-nums whitespace-nowrap">{f.rotulo}</span>
          </li>
        ))}
      </ul>
      {camada}
    </div>
  );
}

// ── Barra segmentada (uma linha = um todo) ───────────────────────────────────

export interface Segmento {
  label: string;
  valor: number;
  cor: string;
  tip: React.ReactNode;
}

export function BarraSegmentada({ segmentos, nome }: { segmentos: Segmento[]; nome: string }) {
  const { props, camada } = useTip();
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  if (total <= 0) return <div className="h-2 rounded-full bg-zinc-800/60" />;
  return (
    <div className="flex h-2 w-full gap-0.5" role="group" aria-label={nome}>
      {segmentos.filter(s => s.valor > 0).map(s => (
        <div
          key={s.label}
          {...props(s.tip, `${nome}, ${s.label}: ${s.valor}`)}
          className="h-full first:rounded-l-full last:rounded-r-full outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{ width: `${(s.valor / total) * 100}%`, background: s.cor }}
        />
      ))}
      {camada}
    </div>
  );
}

export function Legenda({ itens }: { itens: { label: string; cor: string; tracejado?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {itens.map(i => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          {i.tracejado
            ? <span className="relative w-3.5 h-[1.5px] rounded-full" style={{ background: i.cor }}>
                <span className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full" style={{ background: i.cor }} />
              </span>
            : <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: i.cor }} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

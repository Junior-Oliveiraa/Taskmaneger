import React, { useId, useState } from 'react';

// ---------------------------------------------------------------------------
// Gráficos compactos do Início. SVG puro; as cores vêm dos tokens
// (--color-blue-*, --color-zinc-*), então seguem os temas claro e escuro.
// ---------------------------------------------------------------------------

/**
 * Sparkline: tendência, não leitura de valores. Sem eixos; o valor de cada
 * ponto aparece só no hover (nunca fixo).
 */
export function Sparkline({ valores, rotulos, altura = 40, descricao }: {
  valores: number[];
  /** Rótulo de cada ponto, usado no tooltip (ex.: "semana de 17/11"). */
  rotulos: string[];
  altura?: number;
  /** Texto para leitor de tela. */
  descricao: string;
}) {
  const id = useId().replace(/:/g, '');
  const [ativo, setAtivo] = useState<number | null>(null);
  const L = 120;
  const pad = 3;
  const max = Math.max(1, ...valores);
  const n = valores.length;
  const x = (i: number) => (n === 1 ? L / 2 : (i / (n - 1)) * L);
  const y = (v: number) => pad + (1 - v / max) * (altura - pad * 2);

  const linha = valores.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const area = `${linha} L ${L} ${altura} L 0 ${altura} Z`;
  const ponto = ativo ?? n - 1;

  return (
    <div className="relative w-full" style={{ height: altura }} onMouseLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${L} ${altura}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={descricao}>
        <defs>
          <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-blue-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-blue-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#sp-${id})`} />
        <path d={linha} fill="none" stroke="var(--color-blue-400)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {valores.map((_, i) => {
          const ini = i === 0 ? 0 : (x(i - 1) + x(i)) / 2;
          const fim = i === n - 1 ? L : (x(i) + x(i + 1)) / 2;
          return <rect key={i} x={ini} width={fim - ini} y={0} height={altura} fill="transparent" onMouseEnter={() => setAtivo(i)} />;
        })}
      </svg>

      {/* Marcador em HTML: o SVG é esticado e um círculo viraria elipse.
          Parado no último ponto; segue o mouse no hover. */}
      <span
        className="pointer-events-none absolute size-2 -ml-1 -mt-1 rounded-full bg-blue-400 ring-[3px] ring-blue-500/25 transition-[left,top] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ left: `${(x(ponto) / L) * 100}%`, top: y(valores[ponto]) }}
      />
      {ativo !== null && (
        <span
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full -mt-2 px-2 py-0.5 rounded-md bg-[#1f1f23] border border-white/10 text-caption font-medium text-zinc-100 tabular-nums whitespace-nowrap"
          style={{ left: `clamp(40px, ${(x(ativo) / L) * 100}%, calc(100% - 40px))`, top: y(valores[ativo]) }}
        >
          {valores[ativo]} · {rotulos[ativo]}
        </span>
      )}
    </div>
  );
}

export interface SegmentoStatus {
  id: string;
  label: string;
  valor: number;
  /** Cor CSS (use tokens: `var(--color-blue-500)`). */
  cor: string;
}

/** Barra horizontal segmentada: distribuição por status num card compacto. */
export function BarraStatus({ segmentos }: { segmentos: SegmentoStatus[] }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  return (
    <div
      className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-800"
      role="img"
      aria-label={segmentos.map(s => `${s.label}: ${s.valor}`).join(', ')}
    >
      {total > 0 && segmentos.filter(s => s.valor > 0).map(s => (
        <span key={s.id} className="h-full" style={{ width: `${(s.valor / total) * 100}%`, background: s.cor }} />
      ))}
    </div>
  );
}

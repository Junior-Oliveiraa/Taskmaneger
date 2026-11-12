import React from 'react';

// Primitivos visuais da ficha de proposta, compartilhados pelo modal e pelo
// editor de fluxo de pagamento.

export const numeroBr = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const moedaBr = (v: number) => `R$ ${numeroBr(v)}`;
export const percentualBr = (v: number) => `${numeroBr(v)}%`;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "2026-11-10" ou "2026-11" → "nov/26". */
export const mesCurto = (iso: string) => {
  const [ano, mes] = iso.split('-');
  return ano && mes ? `${MESES[Number(mes) - 1]}/${ano.slice(2)}` : '—';
};

// color-scheme escuro deixa visíveis os controles nativos restantes.
export const campoCls =
  'w-full h-9 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 text-[13px] text-zinc-100 outline-none [color-scheme:dark] ' +
  'placeholder:text-zinc-600 hover:border-zinc-700 focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-[border-color,box-shadow]';

export function Campo({ label, obrigatorio, hint, className = '', children }: {
  label: string;
  obrigatorio?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="text-[11px] font-medium text-zinc-400">
        {label}
        {obrigatorio && <span className="text-blue-400/80 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

// Digita-se da direita para a esquerda, em centavos: "5572501" vira 55.725,01.
export function ValorInput({ value, onChange, prefixo, sufixo, compacto, autoFocus }: {
  value: number | null;
  onChange: (v: number | null) => void;
  prefixo?: string;
  sufixo?: string;
  compacto?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      {prefixo && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-zinc-500">{prefixo}</span>}
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        className={`${campoCls} text-right tabular-nums ${compacto ? 'px-2' : ''} ${prefixo ? 'pl-9' : ''} ${sufixo ? 'pr-9' : ''}`}
        placeholder="0,00"
        value={value === null ? '' : numeroBr(value)}
        onChange={e => {
          const digitos = e.target.value.replace(/\D/g, '');
          onChange(digitos ? Number(digitos) / 100 : null);
        }}
      />
      {sufixo && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-zinc-500">{sufixo}</span>}
    </div>
  );
}

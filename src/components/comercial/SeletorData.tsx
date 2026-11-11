import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { gatilhoCls, useCliqueFora, usePosicao } from './CampoLista';

// Substitui o <input type="date"> nativo, cujo calendário é desenhado pelo
// sistema operacional e não segue o tema. Aceita digitação (dd/mm/aaaa) ou clique.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const dois = (n: number) => String(n).padStart(2, '0');
const isoData = (ano: number, mes: number, dia: number) => `${ano}-${dois(mes + 1)}-${dois(dia)}`;
const diasNoMes = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate();
const hojeIso = () => { const d = new Date(); return isoData(d.getFullYear(), d.getMonth(), d.getDate()); };

// "dd/mm/aaaa" → "AAAA-MM-DD", ou '' se incompleta/inválida.
function lerDataBr(texto: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return '';
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (mes < 0 || mes > 11 || ano < 1900 || ano > 2200 || dia < 1 || dia > diasNoMes(ano, mes)) return '';
  return isoData(ano, mes, dia);
}
const formatarDataBr = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const mascara = (bruto: string) => {
  const d = bruto.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
};
const mesDe = (iso: string) => {
  const base = iso || hojeIso();
  return { ano: Number(base.slice(0, 4)), mes: Number(base.slice(5, 7)) - 1 };
};

/** Data "AAAA-MM-DD". */
export default function SeletorData({ value, onChange, compacto }: {
  value: string;
  onChange: (v: string) => void;
  /** Versão estreita para células de tabela. */
  compacto?: boolean;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(formatarDataBr(value));
  const [visivel, setVisivel] = useState(() => mesDe(value));
  const estilo = usePosicao(caixaRef, aberto, 272, 340);
  const refs = useMemo(() => [caixaRef, popRef] as React.RefObject<HTMLElement>[], []);
  const fechar = () => setAberto(false);
  useCliqueFora(refs, aberto, fechar);

  // Só ressincroniza quando o valor muda por fora; não apaga o que está sendo digitado.
  useEffect(() => {
    if (lerDataBr(texto) !== value) setTexto(formatarDataBr(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = () => { setVisivel(mesDe(value)); setAberto(true); };
  const escolher = (iso: string) => {
    onChange(iso);
    setTexto(formatarDataBr(iso));
    fechar();
    inputRef.current?.focus();
  };
  const mudarMes = (delta: number) => setVisivel(v => {
    const d = new Date(v.ano, v.mes + delta, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });

  // Grade fixa de 6 semanas começando no domingo, para o popover não mudar de altura.
  const inicio = new Date(visivel.ano, visivel.mes, 1).getDay();
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(visivel.ano, visivel.mes, 1 - inicio + i);
    return { iso: isoData(d.getFullYear(), d.getMonth(), d.getDate()), dia: d.getDate(), doMes: d.getMonth() === visivel.mes };
  });
  const hoje = hojeIso();
  const navCls = 'w-7 h-7 grid place-items-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors';

  return (
    <>
      <div ref={caixaRef} className="relative">
        <input
          ref={inputRef}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={texto}
          onChange={e => {
            const t = mascara(e.target.value);
            setTexto(t);
            const iso = lerDataBr(t);
            if (iso || !t) onChange(iso);
            else if (value) onChange('');
          }}
          onBlur={() => { if (!lerDataBr(texto)) setTexto(formatarDataBr(value)); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); abrir(); }
            else if (e.key === 'Escape' && aberto) { e.preventDefault(); fechar(); }
          }}
          className={`${gatilhoCls} tabular-nums ${compacto ? 'pl-2 pr-8' : 'pr-10'} ${aberto ? 'border-blue-500/70 ring-2 ring-blue-500/15' : ''}`}
        />
        <button
          type="button"
          tabIndex={-1}
          title="Abrir calendário"
          // Mantém o foco no campo; o clique só alterna o calendário.
          onMouseDown={e => e.preventDefault()}
          onClick={() => (aberto ? fechar() : abrir())}
          className={`absolute top-1/2 -translate-y-1/2 ${compacto ? 'right-1' : 'right-1.5'} w-7 h-7 grid place-items-center rounded-md transition-colors ${
            aberto ? 'text-blue-300 bg-blue-500/10' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <Calendar size={14} />
        </button>
      </div>

      {aberto && createPortal(
        <div
          ref={popRef}
          style={estilo}
          className="z-[60] rounded-xl border border-zinc-800 bg-[#141418] p-3 shadow-2xl shadow-black/60 ring-1 ring-black/40"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" className={navCls} onClick={() => mudarMes(-1)} title="Mês anterior"><ChevronLeft size={15} /></button>
            <span className="text-[13px] font-semibold text-zinc-100 capitalize">{MESES[visivel.mes]} {visivel.ano}</span>
            <button type="button" className={navCls} onClick={() => mudarMes(1)} title="Próximo mês"><ChevronRight size={15} /></button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DIAS_SEMANA.map((d, i) => (
              <span key={i} className="h-7 grid place-items-center text-[10px] font-semibold text-zinc-500">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {dias.map(d => (
              <button
                key={d.iso}
                type="button"
                onClick={() => escolher(d.iso)}
                className={`h-8 rounded-lg text-[12px] tabular-nums transition-colors ${
                  d.iso === value ? 'bg-blue-600 text-white font-semibold'
                    : d.iso === hoje ? 'text-blue-300 ring-1 ring-inset ring-blue-500/40 hover:bg-zinc-800'
                    : d.doMes ? 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50'
                    : 'text-zinc-600 hover:bg-zinc-800/60'
                }`}
              >
                {d.dia}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-800">
            {value
              ? <button type="button" onClick={() => { onChange(''); setTexto(''); fechar(); }} className="text-[12px] text-zinc-500 hover:text-zinc-200 px-1.5 py-1 rounded-md">Limpar</button>
              : <span />}
            <button type="button" onClick={() => escolher(hoje)} className="text-[12px] font-medium text-blue-400 hover:text-blue-300 px-1.5 py-1 rounded-md">
              Hoje
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

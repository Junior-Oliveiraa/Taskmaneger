import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Periodo, periodoAnoAnterior, periodoAnterior } from '../../lib/cvComercial';
import { BOTAO_FILTRO, ICONE_FILTRO, TEXTO_APOIO } from './filtroEstilo';

// Seletor de período: atalhos à esquerda, dois meses lado a lado, comparação e
// datas digitáveis. Nada vale até "Atualizar"; "Cancelar" descarta o rascunho.
// Datas são yyyy-mm-dd puras, sempre no fuso de Brasília (o mesmo do CV CRM).

export type IdAtalho =
  | 'hoje' | 'ontem' | 'ultimos_7' | 'ultimos_30' | 'ultimos_90'
  | 'esta_semana' | 'semana_passada' | 'este_mes' | 'mes_passado'
  | 'este_ano' | 'ano_passado' | 'maximo' | 'personalizado';

export type TipoComparacao = 'anterior' | 'ano_anterior';

export interface SelecaoPeriodo {
  atalho: IdAtalho;
  de: string;
  ate: string;
  comparar: boolean;
  tipoComparacao: TipoComparacao;
}

const ATALHOS: { id: IdAtalho; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'ultimos_7', label: 'Últimos 7 dias' },
  { id: 'ultimos_30', label: 'Últimos 30 dias' },
  { id: 'ultimos_90', label: 'Últimos 90 dias' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'semana_passada', label: 'Semana passada' },
  { id: 'este_mes', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'este_ano', label: 'Este ano' },
  { id: 'ano_passado', label: 'Ano passado' },
  { id: 'maximo', label: 'Máximo' },
  { id: 'personalizado', label: 'Personalizado' },
];

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// ── Datas ────────────────────────────────────────────────────────────────────

const utc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const ymdDe = (t: number) => new Date(t).toISOString().slice(0, 10);
const somarDias = (ymd: string, n: number) => ymdDe(utc(ymd) + n * 86400000);
const diaSemana = (ymd: string) => (new Date(utc(ymd)).getUTCDay() + 6) % 7; // 0 = segunda
const mesDe = (ymd: string) => ymd.slice(0, 7);
const somarMeses = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const ultimoDia = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export const dataBr = (ymd: string) => ymd.split('-').reverse().join('/');
const dataExtenso = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} de ${MES_LONGO[m - 1]} de ${y}`;
};

export function resolverAtalho(id: IdAtalho, hoje: string, primeira: string): { de: string; ate: string } | null {
  const ano = hoje.slice(0, 4);
  switch (id) {
    case 'hoje': return { de: hoje, ate: hoje };
    case 'ontem': { const o = somarDias(hoje, -1); return { de: o, ate: o }; }
    case 'ultimos_7': return { de: somarDias(hoje, -6), ate: hoje };
    case 'ultimos_30': return { de: somarDias(hoje, -29), ate: hoje };
    case 'ultimos_90': return { de: somarDias(hoje, -89), ate: hoje };
    case 'esta_semana': return { de: somarDias(hoje, -diaSemana(hoje)), ate: hoje };
    case 'semana_passada': {
      const seg = somarDias(hoje, -diaSemana(hoje) - 7);
      return { de: seg, ate: somarDias(seg, 6) };
    }
    case 'este_mes': return { de: `${mesDe(hoje)}-01`, ate: hoje };
    case 'mes_passado': { const m = somarMeses(mesDe(hoje), -1); return { de: `${m}-01`, ate: ultimoDia(m) }; }
    case 'este_ano': return { de: `${ano}-01-01`, ate: hoje };
    case 'ano_passado': return { de: `${Number(ano) - 1}-01-01`, ate: `${Number(ano) - 1}-12-31` };
    case 'maximo': return { de: primeira < hoje ? primeira : hoje, ate: hoje };
    default: return null;
  }
}

export function periodoDeComparacao(s: SelecaoPeriodo): Periodo | null {
  if (!s.comparar) return null;
  const p = { de: s.de, ate: s.ate };
  return s.tipoComparacao === 'ano_anterior' ? periodoAnoAnterior(p) : periodoAnterior(p);
}

export function rotuloSelecao(s: SelecaoPeriodo): string {
  if (s.atalho === 'personalizado') return s.de === s.ate ? dataBr(s.de) : `${dataBr(s.de)} – ${dataBr(s.ate)}`;
  return ATALHOS.find(a => a.id === s.atalho)?.label ?? '';
}

export const rotuloComparacao = (t: TipoComparacao) => (t === 'ano_anterior' ? 'vs. ano anterior' : 'vs. período anterior');

// ── Calendário de um mês ─────────────────────────────────────────────────────

function Mes({ ym, de, ate, hover, hoje, onDia, onHover }: {
  ym: string;
  de: string;
  ate: string | null;
  hover: string | null;
  hoje: string;
  onDia: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const primeiro = `${ym}-01`;
  const total = Number(ultimoDia(ym).slice(8));
  const vazios = diaSemana(primeiro);
  // Com só o início escolhido, a faixa acompanha o mouse até o segundo clique.
  const fim = ate ?? hover ?? de;
  const [a, b] = de <= fim ? [de, fim] : [fim, de];

  return (
    <div className="w-[238px]" onMouseLeave={() => onHover(null)}>
      <div className="grid grid-cols-7 mb-1">
        {SEMANA.map(s => <span key={s} className="h-7 flex items-center justify-center text-[11px] font-medium text-zinc-500">{s}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: total }, (_, i) => {
          const d = `${ym}-${String(i + 1).padStart(2, '0')}`;
          const futuro = d > hoje;
          const ponta = d === a || d === b;
          const dentro = d >= a && d <= b;
          const col = (vazios + i) % 7;
          // A faixa é contínua na semana e arredonda nas pontas e nas bordas da linha.
          const faixa = dentro && a !== b
            ? `bg-blue-500/15 ${d === a || col === 0 || i === 0 ? 'rounded-l-md' : ''} ${d === b || col === 6 || i === total - 1 ? 'rounded-r-md' : ''}`
            : '';
          return (
            <div key={d} className={`h-8 ${faixa}`}>
              <button
                type="button"
                disabled={futuro}
                onClick={() => onDia(d)}
                onMouseEnter={() => onHover(d)}
                aria-label={dataExtenso(d)}
                aria-pressed={ponta}
                className={`w-full h-8 text-xs rounded-md tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                  ${ponta ? 'bg-blue-500 text-white font-semibold' : futuro ? 'text-zinc-700 cursor-default' : d === hoje ? 'text-blue-400 font-semibold hover:bg-zinc-800' : 'text-zinc-300 hover:bg-zinc-800'}`}
              >
                {i + 1}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SELECT = 'h-7 pl-1.5 pr-0.5 text-xs font-semibold text-zinc-200 bg-transparent hover:bg-zinc-800/70 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer';

function CabecalhoMes({ ym, anos, onChange }: { ym: string; anos: number[]; onChange: (ym: string) => void }) {
  const [y, m] = ym.split('-').map(Number);
  return (
    <div className="flex items-center justify-center gap-1">
      <select aria-label="Mês" value={m} onChange={e => onChange(`${y}-${String(e.target.value).padStart(2, '0')}`)} className={SELECT}>
        {MES_CURTO.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <select aria-label="Ano" value={y} onChange={e => onChange(`${e.target.value}-${String(m).padStart(2, '0')}`)} className={SELECT}>
        {anos.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}

// ── Seletor ──────────────────────────────────────────────────────────────────

const DATA = 'h-9 w-full min-w-0 px-2.5 text-xs text-zinc-100 bg-zinc-900 border border-zinc-800 rounded-lg outline-none focus:border-blue-500/60';

export default function SeletorPeriodo({ valor, onChange, hoje, primeiraData }: {
  valor: SelecaoPeriodo;
  onChange: (s: SelecaoPeriodo) => void;
  hoje: string;
  /** Data mais antiga com venda: é o início do atalho "Máximo". */
  primeiraData: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  // Início escolhido e fim ainda pendente: o próximo clique fecha o intervalo.
  const [pendente, setPendente] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [mesDireita, setMesDireita] = useState(mesDe(valor.ate));

  const abrir = () => {
    setRascunho(valor);
    setPendente(false);
    setMesDireita(mesDe(valor.ate));
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto]);

  const anos = useMemo(() => {
    const fim = Number(hoje.slice(0, 4));
    const inicio = Math.min(Number(primeiraData.slice(0, 4)), fim);
    return Array.from({ length: fim - inicio + 1 }, (_, i) => fim - i);
  }, [hoje, primeiraData]);

  const mesAtual = mesDe(hoje);
  const mesEsquerda = somarMeses(mesDireita, -1);
  const navegarPara = (ym: string) => setMesDireita(ym > mesAtual ? mesAtual : ym);

  const escolherAtalho = (id: IdAtalho) => {
    setPendente(false);
    const r = resolverAtalho(id, hoje, primeiraData);
    if (!r) { setRascunho(s => ({ ...s, atalho: 'personalizado' })); return; }
    setRascunho(s => ({ ...s, atalho: id, ...r }));
    setMesDireita(mesDe(r.ate));
  };

  const clicarDia = (d: string) => {
    if (!pendente) {
      setRascunho(s => ({ ...s, atalho: 'personalizado', de: d, ate: d }));
      setPendente(true);
      return;
    }
    setRascunho(s => (d < s.de ? { ...s, de: d, ate: s.de } : { ...s, ate: d }));
    setPendente(false);
  };

  const digitar = (campo: 'de' | 'ate', v: string) => {
    if (!v) return;
    setPendente(false);
    setRascunho(s => ({ ...s, atalho: 'personalizado', [campo]: v > hoje ? hoje : v }));
    if (campo === 'ate') navegarPara(mesDe(v));
  };

  const valido = !pendente && rascunho.de <= rascunho.ate;
  const comp = periodoDeComparacao({ ...rascunho, comparar: true });

  const aplicar = () => {
    if (!valido) return;
    onChange(rascunho);
    setAberto(false);
  };

  const intervaloAtual = valor.de === valor.ate ? dataBr(valor.de) : `${dataBr(valor.de)} – ${dataBr(valor.ate)}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`Período: ${rotuloSelecao(valor)}, ${intervaloAtual}`}
        className={BOTAO_FILTRO}
      >
        <CalendarRange size={13} className={ICONE_FILTRO} />
        {rotuloSelecao(valor)}
        {valor.atalho !== "personalizado" && <span className={`${TEXTO_APOIO} hidden sm:inline`}>{intervaloAtual}</span>}
        <ChevronDown size={12} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div
            role="dialog"
            aria-label="Selecionar período"
            className="fixed inset-x-3 top-24 max-h-[calc(100vh-7rem)] overflow-y-auto md:overflow-visible md:max-h-none md:absolute md:inset-x-auto md:top-full md:left-0 md:mt-2 z-50 flex flex-col md:flex-row bg-[#141417] border border-zinc-800 rounded-xl shadow-2xl shadow-black/60"
          >
            {/* Atalhos */}
            <div role="radiogroup" aria-label="Atalhos de período" className="flex md:flex-col gap-1 md:gap-0 p-2 md:py-2 md:px-1.5 overflow-x-auto md:overflow-visible no-scrollbar border-b md:border-b-0 md:border-r border-zinc-800 md:w-44 shrink-0">
              {ATALHOS.map(a => {
                const on = rascunho.atalho === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => escolherAtalho(a.id)}
                    className={`flex items-center gap-2.5 shrink-0 px-2.5 py-1.5 text-xs rounded-lg text-left whitespace-nowrap transition-colors ${on ? 'text-zinc-100 bg-zinc-800/70' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40'}`}
                  >
                    <span className={`hidden md:flex w-4 h-4 rounded-full border items-center justify-center shrink-0 ${on ? 'border-blue-500' : 'border-zinc-600'}`}>
                      {on && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                    </span>
                    {a.label}
                  </button>
                );
              })}
            </div>

            <div className="p-4 flex flex-col gap-4 min-w-0">
              {/* Dois meses no desktop; no celular, só o da data final. */}
              <div className="flex items-start justify-center gap-6">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() => setMesDireita(m => somarMeses(m, -1))}
                  className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="hidden md:flex flex-col gap-2">
                  <CabecalhoMes ym={mesEsquerda} anos={anos} onChange={ym => navegarPara(somarMeses(ym, 1))} />
                  <Mes ym={mesEsquerda} de={rascunho.de} ate={pendente ? null : rascunho.ate} hover={hover} hoje={hoje} onDia={clicarDia} onHover={setHover} />
                </div>
                <div className="flex flex-col gap-2">
                  <CabecalhoMes ym={mesDireita} anos={anos} onChange={navegarPara} />
                  <Mes ym={mesDireita} de={rascunho.de} ate={pendente ? null : rascunho.ate} hover={hover} hoje={hoje} onDia={clicarDia} onHover={setHover} />
                </div>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  disabled={mesDireita >= mesAtual}
                  onClick={() => navegarPara(somarMeses(mesDireita, 1))}
                  className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Datas digitáveis */}
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500/40 shrink-0" aria-hidden />
                <input type="date" aria-label="Data inicial" value={rascunho.de} max={hoje} onChange={e => digitar('de', e.target.value)} className={DATA} />
                <span className="text-zinc-500 text-xs">–</span>
                <input type="date" aria-label="Data final" value={pendente ? '' : rascunho.ate} max={hoje} onChange={e => digitar('ate', e.target.value)} className={DATA} />
              </div>

              {/* Comparação */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rascunho.comparar}
                    onChange={e => setRascunho(s => ({ ...s, comparar: e.target.checked }))}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                  />
                  Comparar com
                </label>
                <select
                  aria-label="Tipo de comparação"
                  value={rascunho.tipoComparacao}
                  disabled={!rascunho.comparar}
                  onChange={e => setRascunho(s => ({ ...s, tipoComparacao: e.target.value as TipoComparacao }))}
                  className="h-8 px-2 text-xs text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg outline-none focus:border-blue-500/60 disabled:opacity-40"
                >
                  <option value="anterior">Período anterior</option>
                  <option value="ano_anterior">Mesmo período do ano anterior</option>
                </select>
                {rascunho.comparar && comp?.de && comp.ate && valido && (
                  <span className="text-[11px] text-zinc-500 tabular-nums">{dataBr(comp.de)} – {dataBr(comp.ate)}</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <span className="text-[11px] text-zinc-500">Fuso horário das datas: America/Sao_Paulo</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setAberto(false)} className="px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:bg-zinc-800 rounded-lg">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!valido}
                    onClick={aplicar}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-40"
                  >
                    Atualizar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

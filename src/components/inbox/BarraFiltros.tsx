// Barra de filtros da Caixa de entrada e de Minhas tarefas: controles da tela,
// Período, Empreendimento e Projeto. Um único padrão visual (36 px, 13 px).
// Ocupa a largura total da tela e se arranja pelo que cabe de fato: as larguras
// naturais são medidas numa cópia invisível.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import DatePicker from '../DatePicker';
import ModoToggle from './ModoToggle';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { normalizar } from '../../lib/inbox';
import {
  PERIODOS, arranjoBarra, ddmmaaaa, periodoPadrao, periodoPersonalizado, rotuloPeriodo,
  type Aba, type FiltrosInbox, type LayoutBarra, type Periodo,
} from '../../lib/inboxFiltros';

export const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
export const ALTURA = 'h-9 [@media(pointer:coarse)]:h-10 text-body rounded-lg';
export const GATILHO = (ativo: boolean) =>
  `${ALTURA} min-w-0 max-w-[min(260px,100%)] inline-flex items-center gap-1.5 px-2.5 border transition-colors ${FOCO} ${
    ativo
      ? 'bg-brand-tint border-zinc-800 hover:border-zinc-700 text-brand-300 font-medium'
      : 'bg-[#121214] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
  }`;
const PAINEL = 'absolute top-full mt-1 z-50 max-w-[calc(100vw-32px)] bg-[#18181b] border border-zinc-800 rounded-lg shadow-xl';
export const OPCAO = 'w-full flex items-center gap-2 min-h-9 px-2.5 py-1.5 rounded-md text-left text-body cursor-pointer';

export interface Opcao { id: string; nome: string }

// ─── Painel suspenso ─────────────────────────────────────────────────

/**
 * Botão + painel. Fecha ao clicar fora, ao sair com Tab ou com Esc (devolvendo o
 * foco). Esc para aqui: um painel dentro de outro fecha só o de dentro.
 */
export function Suspenso({ rotulo, aria, ativo, icone, largura, papel, children, fluido, rigido }: {
  rotulo: React.ReactNode;
  aria: string;
  ativo: boolean;
  icone?: React.ReactNode;
  largura: string;
  papel: 'listbox' | 'dialog';
  /** Ocupa a largura disponível (dentro do painel "Filtros"). */
  fluido?: boolean;
  /** Não encolhe quando falta espaço (o vizinho encolhe no lugar). */
  rigido?: boolean;
  children: (fechar: () => void) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [aDireita, setADireita] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  const fechar = () => { setAberto(false); botao.current?.focus(); };

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  // Não deixa o painel passar da borda direita da janela.
  useLayoutEffect(() => {
    if (!aberto || !raiz.current || !painel.current) return;
    setADireita(raiz.current.getBoundingClientRect().left + painel.current.offsetWidth > window.innerWidth - 16);
  }, [aberto]);

  return (
    <div
      ref={raiz}
      className={`relative ${rigido ? 'shrink-0' : 'min-w-0'} ${fluido ? 'w-full' : ''}`}
      onKeyDown={e => { if (e.key === 'Escape' && aberto) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); fechar(); } }}
      onBlur={e => { if (aberto && e.relatedTarget && !raiz.current?.contains(e.relatedTarget as Node)) setAberto(false); }}
    >
      <button
        ref={botao}
        type="button"
        aria-label={aria}
        aria-haspopup={papel}
        aria-expanded={aberto}
        onClick={() => setAberto(v => !v)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); setAberto(true); } }}
        className={`${GATILHO(ativo)} ${fluido ? 'w-full max-w-none' : ''}`}
      >
        {icone}
        <span className="truncate">{rotulo}</span>
        <ChevronDown size={14} aria-hidden className={`ml-auto shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div ref={painel} className={`${PAINEL} ${largura} ${aDireita ? 'right-0' : 'left-0'}`}>
          {children(fechar)}
        </div>
      )}
    </div>
  );
}

// ─── Multi-seleção com busca (Empreendimento, Projeto) ─────

function rotuloSelecao(opcoes: Opcao[], valor: string[]): string {
  if (valor.length === 0) return 'Todos';
  if (valor.length === 1) return opcoes.find(o => o.id === valor[0])?.nome ?? '1 selecionado';
  return `${valor.length} selecionados`;
}

function ListaMulti({ nome, opcoes, valor, onChange, vazio }: {
  nome: string; opcoes: Opcao[]; valor: string[]; onChange: (v: string[]) => void; vazio: string;
}) {
  const id = useId();
  const [termo, setTermo] = useState('');
  const [foco, setFoco] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const q = normalizar(termo.trim());
  const filtradas = q ? opcoes.filter(o => normalizar(o.nome).includes(q)) : opcoes;
  // Índice 0 = "Todos" (só sem busca).
  const itens: (Opcao | null)[] = q ? filtradas : [null, ...filtradas];
  const atual = Math.min(foco, itens.length - 1);

  const alternar = (o: Opcao | null) => {
    if (!o) { onChange([]); return; }
    onChange(valor.includes(o.id) ? valor.filter(x => x !== o.id) : [...valor, o.id]);
  };

  useEffect(() => {
    lista.current?.querySelector('[data-foco="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [atual]);

  return (
    <div className="p-1.5">
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${id}-lista`}
        aria-activedescendant={atual >= 0 ? `${id}-${atual}` : undefined}
        aria-label={`Buscar ${nome.toLowerCase()}`}
        placeholder={`Buscar ${nome.toLowerCase()}…`}
        value={termo}
        onChange={e => { setTermo(e.target.value); setFoco(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setFoco(Math.min(atual + 1, itens.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco(Math.max(atual - 1, 0)); }
          else if (e.key === 'Home') { e.preventDefault(); setFoco(0); }
          else if (e.key === 'End') { e.preventDefault(); setFoco(itens.length - 1); }
          else if (e.key === 'Enter') { e.preventDefault(); if (atual >= 0) alternar(itens[atual]); }
        }}
        className={`${ALTURA} w-full px-2.5 bg-[#08080a] border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 ${FOCO}`}
      />
      <ul ref={lista} id={`${id}-lista`} role="listbox" aria-multiselectable="true" aria-label={nome} className="mt-1.5 max-h-72 overflow-y-auto scrollbar-minimal flex flex-col gap-1">
        {itens.map((o, i) => {
          const marcado = o ? valor.includes(o.id) : valor.length === 0;
          return (
            <li
              key={o?.id ?? 'todos'}
              id={`${id}-${i}`}
              role="option"
              aria-selected={marcado}
              data-foco={i === atual ? '1' : undefined}
              onMouseDown={e => e.preventDefault()}
              onMouseMove={() => setFoco(i)}
              onClick={() => alternar(o)}
              className={`${OPCAO} ${i === atual ? 'bg-[#1f1f23]' : ''} ${marcado ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}
            >
              <span className={`size-4 shrink-0 inline-flex items-center justify-center rounded border ${marcado ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-550'}`} aria-hidden>
                {marcado && <Check size={12} />}
              </span>
              <span className="truncate">{o?.nome ?? 'Todos'}</span>
            </li>
          );
        })}
        {filtradas.length === 0 && (
          <li role="presentation" className="px-2.5 py-2 text-body text-zinc-400">{q ? 'Nada encontrado' : vazio}</li>
        )}
      </ul>
    </div>
  );
}

export function FiltroMulti({ nome, opcoes, valor, onChange, vazio, fluido }: {
  nome: string; opcoes: Opcao[]; valor: string[]; onChange: (v: string[]) => void; vazio: string; fluido?: boolean;
}) {
  const texto = rotuloSelecao(opcoes, valor);
  const curto = valor.length === 0 ? nome : `${nome}: ${texto}`;
  return (
    <Suspenso
      papel="listbox"
      largura="w-64"
      fluido={fluido}
      ativo={valor.length > 0}
      aria={`Filtrar por ${nome.toLowerCase()}: ${texto}`}
      rotulo={curto}
    >
      {() => <ListaMulti nome={nome} opcoes={opcoes} valor={valor} onChange={onChange} vazio={vazio} />}
    </Suspenso>
  );
}

// ─── Período ─────────────────────────────────────────────────────────

function PainelPeriodo({ valor, onChange, fechar, opcoes }: { valor: Periodo; onChange: (p: Periodo) => void; fechar: () => void; opcoes: typeof PERIODOS }) {
  const personalizado = valor.preset === 'personalizado';
  const [editando, setEditando] = useState(personalizado);
  const [de, setDe] = useState(valor.preset === 'personalizado' ? valor.de : '');
  const [ate, setAte] = useState(valor.preset === 'personalizado' ? valor.ate : '');
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    raiz.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const opcoes = Array.from(raiz.current?.querySelectorAll<HTMLElement>('[role="radio"]') || []);
    const i = opcoes.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const alvo = e.key === 'Home' ? 0 : e.key === 'End' ? opcoes.length - 1
      : Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), opcoes.length - 1);
    opcoes[alvo].focus();
  };

  const opcao = (chave: string, rotulo: string, marcada: boolean, aoEscolher: () => void) => (
    <button
      key={chave}
      type="button"
      role="radio"
      aria-checked={marcada}
      onClick={aoEscolher}
      className={`${OPCAO} hover:bg-[#1f1f23] focus-visible:bg-[#1f1f23] ${marcada ? 'text-zinc-100 font-medium' : 'text-zinc-300'} ${FOCO}`}
    >
      <span className="truncate">{rotulo}</span>
      {marcada && <Check size={14} className="ml-auto shrink-0 text-blue-400" aria-hidden />}
    </button>
  );

  const campo = (rotulo: string, v: string, set: (x: string) => void) => (
    <div className="flex-1 min-w-0">
      <span className="block mb-1 text-caption text-zinc-400">{rotulo}</span>
      <DatePicker
        value={v}
        onChange={set}
        fullWidth
        align={rotulo === 'Até' ? 'right' : 'left'}
        trigger={(
          <button type="button" aria-label={`${rotulo}: ${v ? ddmmaaaa(v) : 'escolher data'}`} className={`${GATILHO(false)} w-full tabular-nums`}>
            {v ? ddmmaaaa(v) : 'dd/mm/aaaa'}
          </button>
        )}
      />
    </div>
  );

  return (
    <div ref={raiz} className="p-1.5" onKeyDown={onKeyDown}>
      <div role="radiogroup" aria-label="Período" className="flex flex-col gap-1">
        {opcoes.map(p => opcao(p.valor, p.rotulo, !editando && valor.preset === p.valor, () => { onChange({ preset: p.valor }); fechar(); }))}
        {opcao('personalizado', 'Personalizado…', editando, () => setEditando(true))}
      </div>
      {editando && (
        <div className="mt-1.5 pt-2.5 px-1 pb-1 border-t border-zinc-800 flex flex-col gap-2.5">
          <div className="flex gap-2">
            {campo('De', de, setDe)}
            {campo('Até', ate, setAte)}
          </div>
          <button
            type="button"
            disabled={!de || !ate}
            onClick={() => { onChange(periodoPersonalizado(de, ate)); fechar(); }}
            className={`${ALTURA} px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed ${FOCO}`}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Barra ───────────────────────────────────────────────────────────

/** Abaixo disso o toggle mostra só ícones e contador. */
const TELA_COMPACTA = '(max-width: 1099.98px)';

/** O que a barra filtra, comum à Caixa de entrada e a Minhas tarefas. */
export type FiltrosBarra = Pick<FiltrosInbox, 'periodo' | 'empreendimentos' | 'projetos'>;

interface Props {
  aba: Aba;
  onModo: (a: Aba) => void;
  /** Total de pendentes, sem filtros. */
  pendentes: number;
  filtros: FiltrosInbox;
  onMudar: (f: Partial<FiltrosInbox>) => void;
  onLimpar: () => void;
  temFiltros: boolean;
  empreendimentos: Opcao[];
  projetos: Opcao[];
}

export default function BarraFiltros({ aba, onModo, pendentes, filtros, ...resto }: Props) {
  const compacto = useMediaQuery(TELA_COMPACTA);
  return (
    <BarraRecolhivel
      {...resto}
      filtros={filtros}
      rotulo="Filtros da caixa de entrada"
      rotuloPeriodoAria="período de chegada"
      periodos={PERIODOS}
      periodoAtivo={!periodoPadrao(filtros, aba) || filtros.periodo.preset === 'personalizado'}
      inicio={<ModoToggle modo={aba} onMudar={onModo} pendentes={pendentes} compacto={compacto} />}
    />
  );
}

/** Controles da tela à esquerda e os filtros depois; o que não cabe recolhe em "Filtros · n". */
export function BarraRecolhivel({
  inicio, fim, junto = false, rotulo, rotuloPeriodoAria, periodos, periodoAtivo,
  filtros, onMudar, onLimpar, temFiltros, empreendimentos, projetos,
}: {
  inicio: React.ReactNode;
  /** Controles na ponta direita (nunca recolhem). */
  fim?: React.ReactNode;
  /** Filtros logo depois do início, em vez de encostados à direita. */
  junto?: boolean;
  rotulo: string;
  rotuloPeriodoAria: string;
  periodos: typeof PERIODOS;
  periodoAtivo: boolean;
  filtros: FiltrosBarra;
  onMudar: (f: Partial<FiltrosBarra>) => void;
  onLimpar: () => void;
  temFiltros: boolean;
  empreendimentos: Opcao[];
  projetos: Opcao[];
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const molde = useRef<HTMLDivElement>(null);
  const modo = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const [{ visiveis, modoEmLinhaPropria }, setArranjo] = useState<LayoutBarra>({ visiveis: 0, modoEmLinhaPropria: true });

  // Mede o molde, o toggle e a barra; cobre janela, rótulos, contador e fonte.
  useLayoutEffect(() => {
    const el = raiz.current;
    const m = molde.current;
    const t = modo.current;
    if (!el || !m || !t) return;
    const medir = () => {
      const w = (k: string) => Math.ceil(m.querySelector<HTMLElement>(`[data-m="${k}"]`)?.getBoundingClientRect().width ?? 0);
      const novo = arranjoBarra({
        modo: Math.ceil(t.getBoundingClientRect().width), periodo: w('periodo'),
        escopo: [w('emp'), w('proj')], filtros: w('filtros'), limpar: w('limpar'),
      }, el.clientWidth - (fimRef.current ? Math.ceil(fimRef.current.getBoundingClientRect().width) + 8 : 0));
      setArranjo(a => a.visiveis === novo.visiveis && a.modoEmLinhaPropria === novo.modoEmLinhaPropria ? a : novo);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    ro.observe(t);
    if (fimRef.current) ro.observe(fimRef.current);
    m.querySelectorAll('[data-m]').forEach(x => ro.observe(x));
    return () => ro.disconnect();
  }, []);

  const campos = [
    { m: 'emp', nome: 'Empreendimento', opcoes: empreendimentos, valor: filtros.empreendimentos, mudar: (v: string[]) => onMudar({ empreendimentos: v }), vazio: 'Nenhum empreendimento' },
    { m: 'proj', nome: 'Projeto', opcoes: projetos, valor: filtros.projetos, mudar: (v: string[]) => onMudar({ projetos: v }),
      vazio: 'Nenhum projeto' },
  ];
  const campo = (c: typeof campos[number], fluido: boolean) => (
    <FiltroMulti key={c.m} fluido={fluido} nome={c.nome} opcoes={c.opcoes} valor={c.valor} onChange={c.mudar} vazio={c.vazio} />
  );
  const recolhidos = campos.slice(visiveis);
  const nEscopo = recolhidos.filter(c => c.valor.length > 0).length;
  const rotuloCurtoPeriodo = periodoAtivo ? `Período: ${rotuloPeriodo(filtros.periodo)}` : 'Período';

  const seletores = (
    <>
      <Suspenso
        papel="dialog"
        largura="w-72"
        ativo={periodoAtivo}
        aria={`Filtrar por ${rotuloPeriodoAria}: ${rotuloPeriodo(filtros.periodo)}`}
        rotulo={rotuloCurtoPeriodo}
      >
        {fechar => <PainelPeriodo valor={filtros.periodo} onChange={p => onMudar({ periodo: p })} fechar={fechar} opcoes={periodos} />}
      </Suspenso>
      {campos.slice(0, visiveis).map(c => campo(c, false))}
      {recolhidos.length > 0 && (
        <Suspenso
          papel="dialog"
          largura="w-72"
          rigido
          ativo={nEscopo > 0}
          aria={`Filtros de ${recolhidos.map(c => c.nome.toLowerCase()).join(', ')}: ${nEscopo} ${nEscopo === 1 ? 'ativo' : 'ativos'}`}
          icone={<SlidersHorizontal size={14} className="shrink-0" aria-hidden />}
          rotulo={<span className="tabular-nums">Filtros{nEscopo > 0 ? ` · ${nEscopo}` : ''}</span>}
        >
          {() => <div role="dialog" aria-label="Filtros" className="p-2 flex flex-col gap-2">{recolhidos.map(c => campo(c, true))}</div>}
        </Suspenso>
      )}
      {temFiltros && (
        <button type="button" onClick={onLimpar} aria-label="Limpar filtros" className={`${ALTURA} shrink-0 px-2 text-zinc-400 hover:text-zinc-100 hover:underline underline-offset-2 ${FOCO}`}>
          Limpar
        </button>
      )}
    </>
  );

  // Cópia invisível só para medir: mesmas classes e textos, sem interação.
  const gabarito = (
    <div ref={molde} aria-hidden inert className="absolute left-0 top-0 h-0 w-0 overflow-hidden invisible">
      <div className="flex w-max gap-2">
        <span data-m="periodo" className={`${GATILHO(periodoAtivo)} shrink-0`}><span className="truncate">{rotuloCurtoPeriodo}</span><ChevronDown size={14} className="shrink-0" /></span>
        {campos.map(c => (
          <span key={c.m} data-m={c.m} className={`${GATILHO(c.valor.length > 0)} shrink-0`}><span className="truncate">{c.valor.length === 0 ? c.nome : `${c.nome}: ${rotuloSelecao(c.opcoes, c.valor)}`}</span><ChevronDown size={14} className="shrink-0" /></span>
        ))}
        <span data-m="filtros" className={`${GATILHO(true)} shrink-0`}><SlidersHorizontal size={14} className="shrink-0" />Filtros · 3<ChevronDown size={14} className="shrink-0" /></span>
        <span data-m="limpar" className={`${ALTURA} shrink-0 px-2`}>Limpar</span>
      </div>
    </div>
  );

  return (
    <div ref={raiz} role="search" aria-label={rotulo} className="relative z-30 shrink-0 min-w-0">
      {gabarito}
      {/* Uma linha; no celular o grupo de filtros desce inteiro para a segunda. */}
      <div className={`flex min-w-0 ${modoEmLinhaPropria ? 'flex-col items-start gap-2' : 'items-center'}`}>
        <div ref={modo} className="shrink-0 max-w-full">{inicio}</div>
        <div className={`flex items-center gap-2 min-w-0 ${modoEmLinhaPropria ? 'w-full' : `flex-1 ${junto ? 'pl-2' : 'justify-end pl-4'}`}`}>
          {seletores}
          {fim && <div ref={fimRef} className="shrink-0 ml-auto flex items-center gap-1">{fim}</div>}
        </div>
      </div>
    </div>
  );
}

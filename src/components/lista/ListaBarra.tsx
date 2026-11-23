// Barra da Lista: busca, Filtros e Exibição, com os chips dos filtros ativos.
import React, { useEffect, useRef, useState } from 'react';
import { Filter, Search, Settings2, SlidersHorizontal, X } from 'lucide-react';
import type { Project } from '../../types';
import { ALTURA, BarraRecolhivel } from '../inbox/BarraFiltros';
import { PRIORIDADE_INFO, ORDEM_PRIORIDADE } from '../TarefaBadges';
import { PERIODOS_TAREFAS } from '../../lib/inboxFiltros';
import type { MarketingProjeto } from '../../lib/marketingProjetos';
import { OVERDUE_CRITICAL_DAYS, DUE_WEEK_DAYS } from '../../lib/prazo';
import {
  contarFiltros, FILTROS_VAZIOS,
  type Agrupamento, type FiltroPrazo, type FiltrosLista, type Ordenacao, type PrefsLista,
} from '../../lib/listaPrefs';

export const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

const PRAZOS: { id: FiltroPrazo; rotulo: string; dica?: string }[] = [
  { id: 'overdue', rotulo: `Atrasadas (até ${OVERDUE_CRITICAL_DAYS} dias)` },
  { id: 'critical', rotulo: `Atraso crítico (+${OVERDUE_CRITICAL_DAYS} dias)` },
  { id: 'week', rotulo: 'Vence esta semana', dica: `Vence hoje ou nos próximos ${DUE_WEEK_DAYS} dias` },
  { id: 'none', rotulo: 'Sem prazo' },
];

interface Pessoa { id: string; name: string }
export interface OpcaoColuna { id: string; label: string; visivel: boolean }

interface Props {
  busca: string;
  onBusca: (v: string) => void;
  prefs: PrefsLista;
  onPrefs: (p: Partial<PrefsLista>) => void;
  projects: Project[];
  /** Vazio em Minhas tarefas: lá o filtro de responsável não existe. */
  pessoas: Pessoa[];
  colunas?: OpcaoColuna[];
  onColuna?: (id: string, visivel: boolean) => void;
  /** Substitui o conteúdo do painel Exibição (Kanban e Cronograma). */
  exibicao?: React.ReactNode;
  /** Controles depois de Exibição. */
  acoes?: React.ReactNode;
  /** Filtros próprios da vista, dentro de "Mais filtros". */
  extras?: { conteudo: React.ReactNode; ativos: number; limpar: () => void };
  /** Minhas tarefas: os mesmos filtros da Caixa de entrada, na linha da busca. */
  minhas?: {
    projetos: MarketingProjeto[];
  };
}

/** Fecha ao clicar fora ou com Esc (devolvendo o foco ao botão). */
export function useFecharFora(raiz: React.RefObject<HTMLElement | null>, aberto: boolean, fechar: () => void) {
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) fecharRef.current(); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      fecharRef.current();
      raiz.current?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto, raiz]);
}

const botao = (ativo: boolean) =>
  // Ghost: sem borda, fundo só no hover (ou quando aberto/ativo).
  `inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-3 rounded-lg text-body font-medium transition-colors ${FOCO} ${
    ativo ? 'bg-[#1f1f23] text-zinc-100' : 'text-zinc-300 hover:bg-[#1f1f23] hover:text-zinc-100'
  }`;

/** Só ícone, na altura da barra. */
const ICONE = 'h-9';

export function Caixa({ rotulo, dica, marcada, onChange }: {
  rotulo: string; dica?: string; marcada: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label title={dica} className="flex items-center gap-2 px-1.5 min-h-7 rounded text-caption text-zinc-300 hover:bg-zinc-800/50 cursor-pointer">
      <input type="checkbox" checked={marcada} onChange={e => onChange(e.target.checked)} className="size-3.5 shrink-0 accent-blue-500" />
      <span className="truncate">{rotulo}</span>
    </label>
  );
}

export function Segmentos<T extends string>({ legenda, opcoes, valor, onChange, emLinhas = false }: {
  /** Duas colunas, para rótulos longos. */
  emLinhas?: boolean;
  legenda: string; opcoes: { id: T; rotulo: string }[]; valor: T; onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-caption font-medium text-zinc-400 mb-1.5">{legenda}</legend>
      <div className={`${emLinhas ? 'grid grid-cols-2' : 'flex'} gap-1 p-0.5 rounded-md bg-[#08080a] border border-zinc-800`}>
        {opcoes.map(o => (
          <button
            key={o.id}
            type="button"
            aria-pressed={valor === o.id}
            onClick={() => onChange(o.id)}
            className={`flex-1 h-7 px-2 rounded text-caption font-medium transition-colors ${FOCO} ${valor === o.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const alternar = <T,>(lista: T[], v: T, ligar: boolean) => ligar ? [...lista.filter(x => x !== v), v] : lista.filter(x => x !== v);

export default function ListaBarra({ busca, onBusca, prefs, onPrefs, projects, pessoas, colunas = [], onColuna, exibicao, acoes, extras, minhas }: Props) {
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [exibicaoAberta, setExibicaoAberta] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const exibicaoRef = useRef<HTMLDivElement>(null);
  useFecharFora(filtrosRef, filtrosAbertos, () => setFiltrosAbertos(false));
  useFecharFora(exibicaoRef, exibicaoAberta, () => setExibicaoAberta(false));

  const { filtros } = prefs;
  const comResponsavel = pessoas.length > 0;
  // Com a barra da Caixa de entrada, o painel só tem o que ela não cobre.
  const total = minhas ? filtros.prazos.length + filtros.prioridades.length + (extras?.ativos ?? 0) : contarFiltros(filtros, comResponsavel);
  const mudar = (f: Partial<FiltrosLista>) => onPrefs({ filtros: { ...filtros, ...f } });
  const limpar = () => onPrefs({ filtros: FILTROS_VAZIOS });

  const chips: { chave: string; rotulo: string; remover: () => void }[] = [
    ...filtros.prazos.map(p => ({ chave: `z${p}`, rotulo: PRAZOS.find(x => x.id === p)!.rotulo, remover: () => mudar({ prazos: alternar(filtros.prazos, p, false) }) })),
    ...filtros.prioridades.map(p => ({ chave: `p${p}`, rotulo: `Prioridade: ${PRIORIDADE_INFO[p].label}`, remover: () => mudar({ prioridades: alternar(filtros.prioridades, p, false) }) })),
    ...(minhas ? [] : filtros.empreendimentos).map(id => ({ chave: `e${id}`, rotulo: projects.find(p => p.id === id)?.name ?? 'Empreendimento', remover: () => mudar({ empreendimentos: alternar(filtros.empreendimentos, id, false) }) })),
    ...(comResponsavel && filtros.responsavel !== 'all'
      ? [{ chave: 'r', rotulo: `Responsável: ${pessoas.find(p => p.id === filtros.responsavel)?.name ?? 'removido'}`, remover: () => mudar({ responsavel: 'all' }) }]
      : []),
  ];

  const painel = 'absolute top-full mt-1 max-w-[calc(100vw-32px)] max-h-[70dvh] overflow-y-auto scrollbar-thin bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)] p-3 z-50 flex flex-col gap-3';

  const campoBusca = (
    <div className="relative w-full sm:w-72">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
      <input
        type="search"
        placeholder="Buscar tarefas…"
        aria-label="Buscar tarefas"
        value={busca}
        onChange={e => onBusca(e.target.value)}
        className={`w-full pl-8 pr-3 border text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/60 ${
          minhas ? `${ALTURA} bg-[#121214] border-zinc-800` : 'h-8 [@media(pointer:coarse)]:h-10 text-body rounded-lg bg-[#0c0c0e] border-zinc-900'
        }`}
      />
    </div>
  );
  const botaoFiltros = (
    <div className="relative" ref={filtrosRef}>
      <button type="button" aria-haspopup="dialog" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(o => !o)} title={minhas ? 'Mais filtros: prazo e prioridade' : undefined} aria-label={minhas ? `Mais filtros${total ? `, ${total} ativos` : ''}` : undefined} className={`${botao(filtrosAbertos || total > 0)} ${minhas ? ICONE : ''}`}>
        <Filter size={14} aria-hidden />{!minhas && ' Filtros'}{total > 0 && <span className="tabular-nums">· {total}</span>}
      </button>
      {filtrosAbertos && (
        <div role="dialog" aria-label="Filtros" className={`${painel} ${minhas ? 'right-0' : 'left-0'} w-72`}>
          <fieldset>
            <legend className="text-caption font-medium text-zinc-400 mb-1">Prazo</legend>
            {PRAZOS.map(p => <Caixa key={p.id} rotulo={p.rotulo} dica={p.dica} marcada={filtros.prazos.includes(p.id)} onChange={v => mudar({ prazos: alternar(filtros.prazos, p.id, v) })} />)}
          </fieldset>
          <fieldset>
            <legend className="text-caption font-medium text-zinc-400 mb-1">Prioridade</legend>
            {ORDEM_PRIORIDADE.map(p => <Caixa key={p} rotulo={PRIORIDADE_INFO[p].label} marcada={filtros.prioridades.includes(p)} onChange={v => mudar({ prioridades: alternar(filtros.prioridades, p, v) })} />)}
          </fieldset>
          {projects.length > 0 && !minhas && (
            <fieldset>
              <legend className="text-caption font-medium text-zinc-400 mb-1">Empreendimento</legend>
              <div className="max-h-44 overflow-y-auto scrollbar-thin">
                {projects.map(p => <Caixa key={p.id} rotulo={p.name} marcada={filtros.empreendimentos.includes(p.id)} onChange={v => mudar({ empreendimentos: alternar(filtros.empreendimentos, p.id, v) })} />)}
              </div>
            </fieldset>
          )}
          {extras?.conteudo}
          {comResponsavel && (
            <label className="flex flex-col gap-1">
              <span className="text-caption font-medium text-zinc-400">Responsável</span>
              <select
                value={filtros.responsavel}
                onChange={e => mudar({ responsavel: e.target.value })}
                className={`h-8 bg-[#08080a] border border-zinc-800 rounded-md px-2 text-caption text-zinc-200 ${FOCO}`}
              >
                <option value="all">Todos</option>
                {pessoas.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={total === 0} onClick={minhas ? () => { mudar({ prazos: [], prioridades: [] }); extras?.limpar(); } : limpar} className={`self-start h-7 px-2 -ml-2 rounded-md text-caption font-medium text-zinc-300 hover:text-zinc-100 disabled:opacity-40 ${FOCO}`}>
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
  const botaoExibicao = (
    <div className="relative" ref={exibicaoRef}>
      <button type="button" aria-haspopup="dialog" aria-expanded={exibicaoAberta} onClick={() => setExibicaoAberta(o => !o)} title={minhas ? 'Exibição' : undefined} aria-label="Exibição" className={`${botao(exibicaoAberta)} ${minhas ? ICONE : ''}`}>
        {minhas ? <Settings2 size={15} aria-hidden /> : <SlidersHorizontal size={14} aria-hidden />}{!minhas && ' Exibição'}
      </button>
      {exibicaoAberta && (
        <div role="dialog" aria-label="Opções de exibição" className={`${painel} right-0 w-72`}>
          {exibicao ?? <>
          <Segmentos<Agrupamento> legenda="Agrupar por" valor={prefs.groupBy} onChange={groupBy => onPrefs({ groupBy })}
            opcoes={[{ id: 'prazo', rotulo: 'Prazo' }, { id: 'status', rotulo: 'Status' }, { id: 'priority', rotulo: 'Prioridade' }, { id: 'none', rotulo: 'Nenhum' }]} />
          <Segmentos<Ordenacao> legenda="Ordenar por" valor={prefs.ordenacao} onChange={ordenacao => onPrefs({ ordenacao })}
            opcoes={[{ id: 'vencimento', rotulo: 'Vencimento' }, { id: 'prioridade', rotulo: 'Prioridade' }]} />
          {minhas && <Caixa rotulo="Mostrar concluídas" marcada={prefs.mostrarConcluidas} onChange={mostrarConcluidas => onPrefs({ mostrarConcluidas })} />}
          <fieldset className="border-t border-zinc-800 pt-3">
            <legend className="sr-only">Colunas visíveis</legend>
            <span className="block text-caption font-medium text-zinc-400 mb-1">Colunas visíveis</span>
            {colunas.map(c => (
              <Caixa key={c.id} rotulo={c.label} marcada={c.visivel} onChange={v => onColuna?.(c.id, v)} />
            ))}
          </fieldset>
          <p className="border-t border-zinc-800 pt-3 text-caption text-zinc-400">
            Atalhos: ↑↓ navegar · Enter abrir · X selecionar · E concluir · D prazo
          </p>
          </>}
        </div>
      )}
    </div>
  );

  const barra = minhas ? (
    <BarraRecolhivel
      junto
      rotulo="Filtros de Minhas tarefas"
      rotuloPeriodoAria="período do prazo"
      periodos={PERIODOS_TAREFAS}
      periodoAtivo={filtros.periodo.preset !== 'todo'}
      inicio={campoBusca}
      fim={<>{botaoFiltros}{botaoExibicao}{acoes}</>}
      filtros={filtros}
      onMudar={f => onPrefs({ filtros: { ...filtros, ...f } })}
      onLimpar={limpar}
      temFiltros={filtros.periodo.preset !== 'todo' || filtros.empreendimentos.length + filtros.projetos.length > 0}
      empreendimentos={projects.map(p => ({ id: p.id, nome: p.name }))}
      projetos={minhas.projetos}
    />
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {campoBusca}
      {botaoFiltros}
      <div className="ml-auto">{botaoExibicao}</div>
    </div>
  );

  return (
    <div className="shrink-0 flex flex-col gap-2">
      {barra}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
          {chips.map(c => (
            <span key={c.chave} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md bg-[#1f1f23] border border-white/10 text-caption text-zinc-200">
              <span className="max-w-[24ch] truncate">{c.rotulo}</span>
              <button type="button" onClick={c.remover} aria-label={`Remover filtro ${c.rotulo}`} className={`size-5 inline-flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 ${FOCO}`}>
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          <button type="button" onClick={limpar} className={`h-7 px-2 rounded-md text-caption font-medium text-zinc-400 hover:text-zinc-100 ${FOCO}`}>
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}

// Barra única do Cronograma: busca, vistas, período, zoom, agrupamento, concluídas
// e filtros (com os chips dos ativos logo abaixo).
import React from 'react';
import {
  Check, ChevronLeft, ChevronRight, Filter, Layers, CircleCheck, Minus, Plus, Search, Share2, X,
} from 'lucide-react';
import type { TaskPriority, TaskStatus } from '../../types';
import type { ModoCronograma } from '../../lib/cronograma';
import { OPCAO, Suspenso } from '../inbox/BarraFiltros';
import { Caixa, FOCO } from '../lista/ListaBarra';
import { ORDEM_PRIORIDADE, ORDEM_STATUS, PRIORIDADE_INFO, STATUS_INFO } from '../TarefaBadges';

const GRUPO = 'shrink-0 inline-flex items-center gap-0.5 h-9 [@media(pointer:coarse)]:h-10 p-0.5 rounded-lg bg-[#121214] border border-zinc-800';
const BOTAO = `h-full inline-flex items-center justify-center rounded-md text-body font-medium text-zinc-300 hover:text-zinc-100 hover:bg-[#1f1f23] disabled:opacity-40 disabled:pointer-events-none transition-colors ${FOCO}`;

const alternar = <T,>(lista: T[], v: T, ligar: boolean) => ligar ? [...lista, v] : lista.filter(x => x !== v);

interface Props {
  /** Espaço para os rótulos por extenso. */
  larga: boolean;
  abas?: React.ReactNode;
  busca: string;
  onBusca: (v: string) => void;
  modo: ModoCronograma;
  onModo: (m: ModoCronograma) => void;
  onMover: (sentido: 1 | -1) => void;
  onHoje: () => void;
  zoom: number;
  zooms: readonly number[];
  onZoom: (z: number) => void;
  agrupar: string;
  opcoesAgrupar: { id: string; rotulo: string }[];
  onAgrupar: (id: string) => void;
  ocultarConcluidas: boolean;
  onOcultarConcluidas: (v: boolean) => void;
  status: TaskStatus[];
  onStatus: (v: TaskStatus[]) => void;
  prioridades: TaskPriority[];
  onPrioridades: (v: TaskPriority[]) => void;
  pessoas: { id: string; name: string }[];
  /** 'all' = todos. */
  responsavel: string;
  responsavelPadrao: string;
  onResponsavel: (id: string) => void;
  social?: { ativo: boolean; onMudar: (v: boolean) => void };
  atrasadas: { ativo: boolean; onMudar: (v: boolean) => void };
}

export default function BarraDoCronograma(p: Props) {
  const i = p.zooms.indexOf(p.zoom);
  const unidade = p.modo === 'semana' ? ['Semana anterior', 'Próxima semana'] : ['Mês anterior', 'Próximo mês'];
  const rotuloAgrupar = p.opcoesAgrupar.find(o => o.id === p.agrupar)?.rotulo ?? '';
  const statusFiltro = ORDEM_STATUS.filter(s => s !== 'no_forecast' && (s !== 'done' || !p.ocultarConcluidas));

  const chips: { chave: string; rotulo: string; remover: () => void }[] = [
    ...(p.atrasadas.ativo ? [{ chave: 'atrasadas', rotulo: 'Atrasadas', remover: () => p.atrasadas.onMudar(false) }] : []),
    ...p.status.map(s => ({ chave: `s${s}`, rotulo: `Status: ${STATUS_INFO[s].label}`, remover: () => p.onStatus(alternar(p.status, s, false)) })),
    ...p.prioridades.map(x => ({ chave: `p${x}`, rotulo: `Prioridade: ${PRIORIDADE_INFO[x].label}`, remover: () => p.onPrioridades(alternar(p.prioridades, x, false)) })),
    ...(p.responsavel !== p.responsavelPadrao
      ? [{ chave: 'r', rotulo: p.responsavel === 'all' ? 'Responsável: todos' : `Responsável: ${p.pessoas.find(x => x.id === p.responsavel)?.name ?? 'removido'}`, remover: () => p.onResponsavel(p.responsavelPadrao) }]
      : []),
    ...(p.social?.ativo ? [{ chave: 'rs', rotulo: 'Rede Social', remover: () => p.social!.onMudar(false) }] : []),
  ];
  const ativos = chips.length - (p.atrasadas.ativo ? 1 : 0);
  const limpar = () => {
    p.atrasadas.onMudar(false);
    p.onStatus([]);
    p.onPrioridades([]);
    p.onResponsavel(p.responsavelPadrao);
    p.social?.onMudar(false);
  };

  return (
    <div className="relative z-30 flex flex-col gap-2">
      <div role="toolbar" aria-label="Cronograma" className="flex flex-wrap min-[1000px]:flex-nowrap items-center gap-2">
        <div className="relative w-full min-[1000px]:w-auto min-[1000px]:flex-1 min-w-32 max-w-none min-[1000px]:max-w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input type="search" placeholder="Buscar tarefas…" aria-label="Buscar tarefas" value={p.busca} onChange={e => p.onBusca(e.target.value)} className="w-full h-9 [@media(pointer:coarse)]:h-10 pl-8 pr-3 text-body rounded-lg bg-[#121214] border border-zinc-800 text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/60" />
        </div>
        {p.abas}
        <div role="group" aria-label="Período" className={`${GRUPO} min-[1000px]:ml-auto`}>
          <button type="button" aria-label={unidade[0]} title={unidade[0]} onClick={() => p.onMover(-1)} className={`${BOTAO} w-8`}><ChevronLeft size={15} aria-hidden /></button>
          <button type="button" onClick={p.onHoje} className={`${BOTAO} px-2`}>Hoje</button>
          <button type="button" aria-label={unidade[1]} title={unidade[1]} onClick={() => p.onMover(1)} className={`${BOTAO} w-8`}><ChevronRight size={15} aria-hidden /></button>
        </div>
        <div role="group" aria-label="Escala" className={GRUPO}>
          {([['semana', 'Semana'], ['mes', 'Mês']] as const).map(([id, rotulo]) => (
            <button key={id} type="button" aria-pressed={p.modo === id} onClick={() => p.onModo(id)} className={`${BOTAO} px-2.5 ${p.modo === id ? 'bg-[#1f1f23] !text-zinc-100' : '!text-zinc-400 hover:!text-zinc-100'}`}>{rotulo}</button>
          ))}
        </div>
        <div role="group" aria-label="Zoom" className={GRUPO}>
          <button type="button" aria-label="Diminuir zoom" title="Diminuir zoom" disabled={i <= 0} onClick={() => p.onZoom(p.zooms[i - 1])} className={`${BOTAO} w-8`}><Minus size={14} aria-hidden /></button>
          <button type="button" aria-label="Aumentar zoom" title="Aumentar zoom" disabled={i >= p.zooms.length - 1} onClick={() => p.onZoom(p.zooms[i + 1])} className={`${BOTAO} w-8`}><Plus size={14} aria-hidden /></button>
        </div>
        <Suspenso papel="listbox" largura="w-52" ativo={false} rigido aria={`Agrupar por: ${rotuloAgrupar}`} icone={<Layers size={14} className="shrink-0" aria-hidden />} rotulo={p.larga ? <><span className="text-zinc-400">Agrupar por:</span> {rotuloAgrupar}</> : rotuloAgrupar}>
          {fechar => (
            <div role="listbox" aria-label="Agrupar por" className="p-1.5">
              {p.opcoesAgrupar.map(o => (
                <button key={o.id} type="button" role="option" aria-selected={p.agrupar === o.id} onClick={() => { p.onAgrupar(o.id); fechar(); }} className={`${OPCAO} hover:bg-[#1f1f23] ${p.agrupar === o.id ? 'text-zinc-100 font-medium' : 'text-zinc-300'} ${FOCO}`}>
                  {o.rotulo}
                  {p.agrupar === o.id && <Check size={14} className="ml-auto shrink-0 text-blue-400" aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </Suspenso>
        <button
          type="button"
          aria-pressed={p.ocultarConcluidas}
          aria-label="Ocultar concluídas"
          title="Ocultar concluídas"
          onClick={() => p.onOcultarConcluidas(!p.ocultarConcluidas)}
          className={`shrink-0 h-9 [@media(pointer:coarse)]:h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border text-body transition-colors ${FOCO} ${p.larga ? 'px-2.5' : 'w-9'} ${
            p.ocultarConcluidas ? 'bg-brand-tint border-zinc-800 text-brand-300 font-medium' : 'bg-[#121214] border-zinc-800 text-zinc-300 hover:text-zinc-100'
          }`}
        >
          <CircleCheck size={15} aria-hidden />{p.larga && 'Ocultar concluídas'}
        </button>
        <Suspenso papel="dialog" largura="w-72" ativo={ativos > 0} rigido aria={`Filtros${ativos ? `, ${ativos} ativos` : ''}`} icone={<Filter size={14} className="shrink-0" aria-hidden />} rotulo={<>Filtros{ativos > 0 && <span className="tabular-nums"> · {ativos}</span>}</>}>
          {() => (
            <div className="max-h-[70dvh] overflow-y-auto scrollbar-thin p-3 flex flex-col gap-3">
              <fieldset>
                <legend className="text-caption font-medium text-zinc-400 mb-1">Status</legend>
                {statusFiltro.map(s => <React.Fragment key={s}><Caixa rotulo={STATUS_INFO[s].label} marcada={p.status.includes(s)} onChange={v => p.onStatus(alternar(p.status, s, v))} /></React.Fragment>)}
              </fieldset>
              <fieldset>
                <legend className="text-caption font-medium text-zinc-400 mb-1">Prioridade</legend>
                {ORDEM_PRIORIDADE.map(x => <React.Fragment key={x}><Caixa rotulo={PRIORIDADE_INFO[x].label} marcada={p.prioridades.includes(x)} onChange={v => p.onPrioridades(alternar(p.prioridades, x, v))} /></React.Fragment>)}
              </fieldset>
              {p.pessoas.length > 1 && (
                <label className="flex flex-col gap-1">
                  <span className="text-caption font-medium text-zinc-400">Responsável</span>
                  <select value={p.responsavel} onChange={e => p.onResponsavel(e.target.value)} className={`h-9 bg-[#08080a] border border-zinc-800 rounded-md px-2 text-body text-zinc-200 ${FOCO}`}>
                    <option value="all">Todos</option>
                    {p.pessoas.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
              )}
              {p.social && (
                <fieldset>
                  <legend className="text-caption font-medium text-zinc-400 mb-1 inline-flex items-center gap-1.5"><Share2 size={12} aria-hidden />Tipo</legend>
                  <Caixa rotulo="Só Rede Social" marcada={p.social.ativo} onChange={p.social.onMudar} />
                </fieldset>
              )}
              <button type="button" disabled={chips.length === 0} onClick={limpar} className={`self-start h-8 px-2 -ml-2 rounded-md text-caption font-medium text-zinc-300 hover:text-zinc-100 disabled:opacity-40 ${FOCO}`}>Limpar filtros</button>
            </div>
          )}
        </Suspenso>
      </div>
      {chips.length > 0 && (
        <div aria-label="Filtros ativos" className="flex flex-wrap items-center gap-1.5">
          {chips.map(c => (
            <span key={c.chave} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md bg-[#1f1f23] border border-white/10 text-caption text-zinc-200">
              <span className="max-w-[28ch] truncate">{c.rotulo}</span>
              <button type="button" onClick={c.remover} aria-label={`Remover filtro ${c.rotulo}`} className={`size-5 inline-flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 ${FOCO}`}><X size={12} aria-hidden /></button>
            </span>
          ))}
          <button type="button" onClick={limpar} className={`h-7 px-2 rounded-md text-caption font-medium text-zinc-400 hover:text-zinc-100 ${FOCO}`}>Limpar filtros</button>
        </div>
      )}
    </div>
  );
}

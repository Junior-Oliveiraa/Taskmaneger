// Barra do Kanban. Em Minhas tarefas é a mesma da Lista (busca, Período,
// Empreendimento, Projeto); nas demais telas, Time (só Kanban),
// Responsáveis e Prioridade, no mesmo padrão visual (36 px, 13 px).
import React from 'react';
import { ArrowDown, ArrowUp, Settings, Share2 } from 'lucide-react';
import type { Project, TaskPriority } from '../types';
import type { MarketingProjeto } from '../lib/marketingProjetos';
import type { PrefsLista } from '../lib/listaPrefs';
import ControleSegmentado from './ControleSegmentado';
import ListaBarra, { FOCO } from './lista/ListaBarra';
import { GATILHO, Suspenso } from './inbox/BarraFiltros';
import { IconePrioridade, ORDEM_PRIORIDADE, PRIORIDADE_INFO } from './TarefaBadges';

export type Sentido = 'none' | 'asc' | 'desc';
export interface PessoaBarra { id: string; name: string; initials?: string; avatarUrl?: string }

interface Props {
  /** Minhas tarefas: filtros compartilhados com a Lista. */
  minhas?: {
    busca: string;
    onBusca: (v: string) => void;
    prefs: PrefsLista;
    onPrefs: (p: Partial<PrefsLista>) => void;
    projects: Project[];
    projetos: MarketingProjeto[];
    usuarioId?: string;
  };
  /** Vazio = sem filtro de time. */
  times?: { id: string; nome: string }[];
  time?: string;
  onTime?: (id: string) => void;
  pessoas: PessoaBarra[];
  responsavel: string;
  onResponsavel: (id: string) => void;
  prioridade: TaskPriority | 'all';
  onPrioridade: (p: TaskPriority | 'all') => void;
  /** Painel de exibição próprio da vista. */
  exibicao: React.ReactNode;
  exibicaoRotulo: string;
  social?: { ativo: boolean; onMudar: (v: boolean) => void };
  onConfigurarTimes?: () => void;
}

const proximo: Record<Sentido, Sentido> = { none: 'asc', asc: 'desc', desc: 'none' };

/** Grupo de botões na altura dos gatilhos da barra. */
const GRUPO = 'inline-flex items-center gap-1 h-9 [@media(pointer:coarse)]:h-10 px-1 rounded-lg bg-[#121214] border border-zinc-800';
const ITEM = (ativo: boolean) =>
  `h-7 px-2.5 inline-flex items-center justify-center rounded-md text-body font-medium transition-colors ${FOCO} ${
    ativo ? 'bg-[#1f1f23] text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#161619]'
  }`;

function Pessoas({ pessoas, responsavel, onResponsavel }: Pick<Props, 'pessoas' | 'responsavel' | 'onResponsavel'>) {
  return (
    <>
      <button type="button" aria-pressed={responsavel === 'all'} onClick={() => onResponsavel('all')} className={ITEM(responsavel === 'all')}>Todos</button>
      {pessoas.map(u => {
        const ativo = responsavel === u.id;
        return (
          <button
            key={u.id}
            type="button"
            title={u.name}
            aria-label={`Responsável: ${u.name}`}
            aria-pressed={ativo}
            onClick={() => onResponsavel(u.id)}
            className={`size-6 shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full bg-[#1f1f23] text-caption font-medium text-zinc-300 transition ${FOCO} ${
              ativo ? 'ring-2 ring-blue-500' : 'opacity-60 hover:opacity-100'
            }`}
          >
            {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="size-full object-cover" /> : (u.initials || u.name)[0]}
          </button>
        );
      })}
    </>
  );
}

function BotaoOrdem({ rotulo, sentido, onMudar }: { rotulo: string; sentido: Sentido; onMudar: (s: Sentido) => void }) {
  const estado = sentido === 'none' ? 'desligado' : sentido === 'asc' ? 'crescente' : 'decrescente';
  return (
    <button
      type="button"
      aria-label={`Ordenar por ${rotulo.toLowerCase()}: ${estado}. Alterar`}
      title={`Ordem: ${estado}`}
      onClick={() => onMudar(proximo[sentido])}
      className={`${ITEM(sentido !== 'none')} w-full !justify-between gap-2`}
    >
      {rotulo}
      <span className="inline-flex items-center" aria-hidden>
        <ArrowUp size={12} className={sentido === 'asc' ? 'text-blue-400' : 'opacity-40'} />
        <ArrowDown size={12} className={sentido === 'desc' ? 'text-blue-400' : 'opacity-40'} />
      </span>
    </button>
  );
}

export function OrdemKanban(p: {
  ordemPrioridade: Sentido; onOrdemPrioridade: (s: Sentido) => void; ordemPrazo: Sentido; onOrdemPrazo: (s: Sentido) => void;
}) {
  return (
    <fieldset>
      <legend className="text-caption font-medium text-zinc-400 mb-1.5">Ordenar por</legend>
      <div className="flex flex-col gap-1">
        <BotaoOrdem rotulo="Prioridade" sentido={p.ordemPrioridade} onMudar={p.onOrdemPrioridade} />
        <BotaoOrdem rotulo="Prazo" sentido={p.ordemPrazo} onMudar={p.onOrdemPrazo} />
      </div>
    </fieldset>
  );
}

export default function TarefasBarra(p: Props) {
  const { minhas, social, times = [] } = p;

  const configurar = p.onConfigurarTimes && (
    <button type="button" onClick={p.onConfigurarTimes} title="Configurar times" aria-label="Configurar times" className={`size-9 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-[#1f1f23] transition-colors ${FOCO}`}>
      <Settings size={15} aria-hidden />
    </button>
  );
  const redeSocial = social && (
    <button type="button" aria-pressed={social.ativo} onClick={() => social.onMudar(!social.ativo)} className={GATILHO(social.ativo)}>
      <Share2 size={14} aria-hidden /> Rede Social
    </button>
  );

  if (minhas) {
    const outraPessoa = p.responsavel !== 'all' && p.responsavel !== minhas.usuarioId;
    return (
      <ListaBarra
        busca={minhas.busca}
        onBusca={minhas.onBusca}
        prefs={minhas.prefs}
        onPrefs={minhas.onPrefs}
        projects={minhas.projects}
        pessoas={[]}
        minhas={{ projetos: minhas.projetos }}
        exibicao={p.exibicao}
        acoes={configurar}
        extras={{
          ativos: (outraPessoa ? 1 : 0) + (social?.ativo ? 1 : 0),
          conteudo: (
            <>
              {p.pessoas.length > 1 && (
                <fieldset>
                  <legend className="text-caption font-medium text-zinc-400 mb-1.5">Responsável</legend>
                  <div className="flex flex-wrap items-center gap-1.5"><Pessoas pessoas={p.pessoas} responsavel={p.responsavel} onResponsavel={p.onResponsavel} /></div>
                </fieldset>
              )}
              {redeSocial}
            </>
          ),
          limpar: () => { p.onResponsavel('all'); social?.onMudar(false); },
        }}
      />
    );
  }

  return (
    <div className="relative z-30 flex flex-wrap items-center gap-2">
      {times.length > 0 && p.onTime && (
        <div className="[&_button]:text-body">
          <ControleSegmentado ariaLabel="Time" valor={p.time ?? 'all'} onChange={p.onTime} opcoes={[{ id: 'all', label: 'Todos' }, ...times.map(t => ({ id: t.id, label: t.nome }))]} />
        </div>
      )}
      <div role="group" aria-label="Responsáveis" className={`${GRUPO} max-w-full overflow-x-auto no-scrollbar pr-2`}>
        <Pessoas pessoas={p.pessoas} responsavel={p.responsavel} onResponsavel={p.onResponsavel} />
      </div>
      <div role="group" aria-label="Prioridade" className={GRUPO}>
        <button type="button" aria-pressed={p.prioridade === 'all'} onClick={() => p.onPrioridade('all')} className={ITEM(p.prioridade === 'all')}>Todas</button>
        {ORDEM_PRIORIDADE.map(x => (
          <button key={x} type="button" title={PRIORIDADE_INFO[x].label} aria-label={`Prioridade: ${PRIORIDADE_INFO[x].label}`} aria-pressed={p.prioridade === x} onClick={() => p.onPrioridade(x)} className={`${ITEM(p.prioridade === x)} !px-0 w-7`}>
            {x === 'no_priority' ? '—' : <IconePrioridade prioridade={x} size={14} />}
          </button>
        ))}
      </div>
      {redeSocial}
      <div className="ml-auto flex items-center gap-1">
        <Suspenso papel="dialog" largura="w-56" ativo={false} aria={p.exibicaoRotulo} rotulo={p.exibicaoRotulo}>
          {() => <div className="p-3">{p.exibicao}</div>}
        </Suspenso>
        {configurar}
      </div>
    </div>
  );
}

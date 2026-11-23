import React from 'react';
import { ArrowLeft, Columns3, List, ChartGantt, Pencil, Folder, X } from 'lucide-react';
import type { ModoTarefas } from '../../lib/navegacao';

const MODOS: { id: ModoTarefas; label: string; icon: typeof Columns3 }[] = [
  { id: 'list', label: 'Lista', icon: List },
  { id: 'board', label: 'Kanban', icon: Columns3 },
  { id: 'calendar', label: 'Cronograma', icon: ChartGantt },
];

/** As vistas em formato compacto, para a barra única do Cronograma. */
export function AbasCompactas({ modo, onModo, soIcones }: {
  modo: ModoTarefas; onModo: (m: ModoTarefas) => void;
  /** Rótulo só na vista ativa. */
  soIcones: boolean;
}) {
  return (
    <nav aria-label="Visões" className="shrink-0 inline-flex items-center gap-0.5 h-9 [@media(pointer:coarse)]:h-10 p-0.5 rounded-lg bg-[#121214] border border-zinc-800">
      {MODOS.map(m => {
        const Icon = m.icon;
        const ativo = modo === m.id;
        return (
          <button
            key={m.id}
            type="button"
            aria-current={ativo ? 'page' : undefined}
            aria-label={m.label}
            title={soIcones && !ativo ? m.label : undefined}
            onClick={() => onModo(m.id)}
            className={`h-full inline-flex items-center justify-center gap-1.5 rounded-md text-body font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${soIcones && !ativo ? 'w-8' : 'px-2.5'} ${
              ativo ? 'bg-[#1f1f23] text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#161619]'
            }`}
          >
            <Icon size={14} aria-hidden />{(!soIcones || ativo) && m.label}
          </button>
        );
      })}
    </nav>
  );
}

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

/** Botão de ícone com superfície em repouso (editar), no tamanho das pílulas. */
const BOTAO_ICONE = `shrink-0 size-8 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-lg bg-[#161619] text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition-colors ${FOCO}`;

/**
 * Cabeçalho das telas de tarefas, de cima para baixo: voltar, título (projeto,
 * Minhas tarefas...) com o apoio em cinza, propriedades do projeto e as vistas.
 */
export default function TarefasAbas({ titulo, pasta, subtitulo, propriedades, direita, modo, onModo, onVoltar, rotuloVoltar = 'Projetos', onEditar, atrasadas }: {
  /** Só no Cronograma: chip que filtra as atrasadas. */
  atrasadas?: { total: number; ativo: boolean; onMudar: (v: boolean) => void };
  titulo: string;
  /** Ícone de pasta antes do título (tela de um projeto). */
  pasta?: boolean;
  subtitulo?: string;
  /** Faixa de pílulas entre o título e as vistas (propriedades do projeto). */
  propriedades?: React.ReactNode;
  /** Conteúdo à direita do título. */
  direita?: React.ReactNode;
  modo: ModoTarefas;
  onModo: (m: ModoTarefas) => void;
  onVoltar?: () => void;
  rotuloVoltar?: string;
  onEditar?: () => void;
}) {
  const cronograma = modo === 'calendar';
  const chipAtrasadas = cronograma && !!atrasadas && (atrasadas.total > 0 || atrasadas.ativo);
  return (
    <div className="shrink-0 border-b border-zinc-800/60 bg-[#08080a]">
      <div className="view-pad-x pt-5 short:pt-3">
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            title={`Voltar para ${rotuloVoltar}`}
            className={`-ml-2.5 mb-4 short:mb-2 inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg text-body font-medium text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition-colors ${FOCO}`}
          >
            <ArrowLeft size={16} aria-hidden />
            {rotuloVoltar}
          </button>
        )}

        {/* Título e, embaixo, o apoio em cinza (mesmo padrão da Caixa de entrada). */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {pasta && <Folder size={22} className="shrink-0 text-zinc-500" aria-hidden />}
              <h1 className="text-title font-semibold text-zinc-100 truncate">{titulo}</h1>
              {onEditar && (
                <button type="button" onClick={onEditar} className={BOTAO_ICONE} title="Editar projeto" aria-label="Editar projeto">
                  <Pencil size={14} aria-hidden />
                </button>
              )}
            </div>
            {(subtitulo || chipAtrasadas) && (
              <div className="flex items-center gap-2 min-w-0 min-h-6 mt-1">
                {subtitulo && <p className="text-body text-zinc-400 truncate">{subtitulo}</p>}
                {chipAtrasadas && atrasadas && (
                  <button
                    type="button"
                    aria-pressed={atrasadas.ativo}
                    title={atrasadas.ativo ? 'Mostrar todas' : 'Mostrar só as atrasadas'}
                    onClick={() => atrasadas.onMudar(!atrasadas.ativo)}
                    className={`shrink-0 inline-flex items-center gap-1 h-6 [@media(pointer:coarse)]:h-9 px-2 rounded-md border text-caption font-medium tabular-nums text-red-400 transition-colors ${FOCO} ${
                      atrasadas.ativo ? 'bg-red-500/20 border-red-500/60' : 'bg-red-500/10 border-red-500/25 hover:bg-red-500/20'
                    }`}
                  >
                    {atrasadas.total} {atrasadas.total === 1 ? 'atrasada' : 'atrasadas'}
                    {atrasadas.ativo && <X size={12} aria-hidden />}
                  </button>
                )}
              </div>
            )}
          </div>
          {direita && <div className="ml-auto shrink-0">{direita}</div>}
        </div>

        {propriedades && <div className="mt-5 short:mt-3">{propriedades}</div>}
      </div>

      {/* As vistas ficam sempre no mesmo lugar, também no Cronograma. */}
      <div className="flex items-center gap-5 view-pad-x mt-6 short:mt-3 overflow-x-auto no-scrollbar">
        {MODOS.map(m => {
          const Icon = m.icon;
          const ativo = modo === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onModo(m.id)}
              className={`flex items-center gap-1.5 pb-2.5 short:pb-2 text-body font-medium whitespace-nowrap border-b-2 transition-colors ${
                ativo ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              <Icon size={13} /> {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

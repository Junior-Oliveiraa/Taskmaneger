// Propriedade "Antecessor": tarefas do mesmo projeto que precisam terminar antes desta.
import React, { useState } from 'react';
import { ArrowUpRight, CheckCircle2, Workflow } from 'lucide-react';
import type { Task } from '../../types';
import { antecessorAtrasado, criaCiclo } from '../../lib/antecessores';
import { useAntecessores } from '../../hooks/useAntecessores';
import { formatarData, useMarketingProjetos } from '../../lib/marketingProjetos';
import { StatusIcone } from '../TarefaBadges';
import { BOTAO_ICONE, ItemMenu, Menu, pilula, Propriedade } from './Propriedade';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function Antecessor({ task, tarefas, disabled, onAbrir }: {
  task: Task;
  tarefas: Task[];
  disabled?: boolean;
  onAbrir?: (t: Task) => void;
}) {
  const { mapa, ativa, alterar } = useAntecessores();
  const { projetoDaTarefa } = useMarketingProjetos();
  const [erro, setErro] = useState<string | null>(null);

  const ids = mapa[task.id] || [];
  const escolhidos = ids.map(id => tarefas.find(t => t.id === id)).filter((t): t is Task => !!t);
  const pendentes = escolhidos.filter(t => t.status !== 'done');
  const atrasado = pendentes.some(t => antecessorAtrasado(t));
  const projeto = projetoDaTarefa[task.id];
  const opcoes = tarefas
    .filter(t => ids.includes(t.id) || (projeto && projetoDaTarefa[t.id] === projeto && t.id !== task.id && t.status !== 'done' && !criaCiclo(task.id, t.id, mapa)))
    .sort((a, b) => Number(ids.includes(b.id)) - Number(ids.includes(a.id)) || (a.dueDate || '9').localeCompare(b.dueDate || '9') || a.title.localeCompare(b.title, 'pt-BR'));

  const alternar = async (id: string) => {
    setErro(null);
    try { await alterar(task.id, id, !ids.includes(id)); }
    catch (e: any) { setErro(e.message); }
  };

  const nomes = escolhidos.map(t => t.title || 'Sem título').join(', ');
  const cor = escolhidos.length === 0 ? ''
    : atrasado ? '!bg-red-500/15 !text-red-400 hover:!bg-red-500/25'
    : pendentes.length ? '!bg-amber-500/15 !text-amber-400 hover:!bg-amber-500/25'
    : '!bg-emerald-500/15 !text-emerald-400 hover:!bg-emerald-500/25';

  return (
    <Propriedade
      id="section-antecessor"
      rotulo={nomes ? `Antecessor: ${nomes}` : 'Antecessor'}
      nota={erro && <p className="text-body text-red-400">{erro}</p>}
    >
      <Menu
        rotulo={`Antecessor: ${nomes || 'nenhum'}`}
        classe={`${pilula(escolhidos.length ? 'cheia' : 'vazia')} ${cor}`}
        disabled={disabled}
        largura="w-96"
        gatilho={<>
          {escolhidos.length > 0 && pendentes.length === 0 ? <CheckCircle2 size={14} className="shrink-0" aria-hidden /> : <Workflow size={14} className="shrink-0" aria-hidden />}
          <span className="truncate max-w-[180px]">
            {escolhidos.length === 0 ? 'Antecessor' : escolhidos.length === 1 ? escolhidos[0].title || 'Sem título' : `${escolhidos.length} antecessores`}
          </span>
        </>}
      >
        {fechar => !ativa
          ? <p className="px-2 py-1.5 text-body text-zinc-400">O antecessor ainda não está disponível: falta aplicar a migração do banco.</p>
          : <Opcoes
              opcoes={opcoes}
              ids={ids}
              semProjeto={!projeto}
              onAlternar={id => void alternar(id)}
              onAbrir={onAbrir && (t => { fechar(); onAbrir(t); })}
            />}
      </Menu>
    </Propriedade>
  );
}

function Opcoes({ opcoes, ids, semProjeto, onAlternar, onAbrir }: {
  opcoes: Task[];
  ids: string[];
  semProjeto: boolean;
  onAlternar: (id: string) => void;
  onAbrir?: (t: Task) => void;
}) {
  const [busca, setBusca] = useState('');
  const filtro = semAcento(busca);
  const visiveis = opcoes.filter(t => semAcento(`${t.taskCode || ''} ${t.title}`).includes(filtro));
  return (
    <>
      {opcoes.length > 8 && (
        <div className="sticky -top-1 z-10 shrink-0 -mx-1 -mt-1 mb-1 p-1 bg-[#18181b] border-b border-white/10">
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            autoFocus={!window.matchMedia('(pointer: coarse)').matches}
            aria-label="Buscar tarefa"
            placeholder="Buscar tarefa…"
            className="w-full h-8 [@media(pointer:coarse)]:h-10 px-2 bg-transparent text-body text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
        </div>
      )}
      <p className="px-2 pt-1 pb-1.5 text-caption text-zinc-500">Esta tarefa só segue depois que o antecessor for concluído.</p>
      {visiveis.map(t => (
        <div key={t.id} className="shrink-0 flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <ItemMenu marcado={ids.includes(t.id)} onClick={() => onAlternar(t.id)}>
              <StatusIcone status={t.status} size={15} />
              <span className="min-w-0 truncate">{t.title || 'Sem título'}</span>
              {t.dueDate && <span className={`ml-auto shrink-0 text-caption tabular-nums ${antecessorAtrasado(t) ? 'text-red-400' : 'text-zinc-500'}`}>{formatarData(t.dueDate)}</span>}
            </ItemMenu>
          </div>
          {onAbrir && ids.includes(t.id) && (
            <button type="button" onClick={() => onAbrir(t)} aria-label={`Abrir ${t.title || 'tarefa'}`} title="Abrir tarefa" className={BOTAO_ICONE}>
              <ArrowUpRight size={15} aria-hidden />
            </button>
          )}
        </div>
      ))}
      {visiveis.length === 0 && (
        <p className="px-2 py-1.5 text-body text-zinc-400">
          {filtro ? 'Nenhuma tarefa encontrada.' : semProjeto ? 'Escolha um projeto para esta tarefa: a lista mostra as tarefas do mesmo projeto.' : 'Nenhuma outra tarefa em aberto neste projeto.'}
        </p>
      )}
    </>
  );
}

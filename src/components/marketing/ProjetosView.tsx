import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Layers, FolderOpen, Briefcase, CalendarClock } from 'lucide-react';
import { Task } from '../../types';
import { useMarketingProjetos, STATUS_PROJETO, MarketingProjeto, MarketingPortfolio, ProjetoStatus, formatarData } from '../../lib/marketingProjetos';
import { ProjetoModal } from './ProjetoModais';
import { useMembrosProjeto, AvataresMembros } from './MembrosProjeto';

export interface ResumoTarefas { total: number; concluidas: number; atrasadas: number }

export function resumir(tarefas: Task[]): ResumoTarefas {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    total: tarefas.length,
    concluidas: tarefas.filter(t => t.status === 'done').length,
    atrasadas: tarefas.filter(t => t.status !== 'done' && !!t.dueDate && t.dueDate < hoje).length,
  };
}

export function BarraProgresso({ resumo, cor }: { resumo: ResumoTarefas; cor: string }) {
  const pct = resumo.total ? Math.round((resumo.concluidas / resumo.total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1.5">
        <span>{resumo.concluidas} de {resumo.total} concluídas</span>
        <span className="font-mono text-zinc-400">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
      </div>
      {resumo.atrasadas > 0 && (
        <div className="text-[10px] text-red-400 mt-1.5">{resumo.atrasadas} atrasada{resumo.atrasadas > 1 ? 's' : ''}</div>
      )}
    </div>
  );
}

export function ChipStatus({ status }: { status: ProjetoStatus }) {
  const s = STATUS_PROJETO.find(x => x.id === status) ?? STATUS_PROJETO[0];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.classe}`}>{s.label}</span>;
}

/** Linha "Entrega: dd/mm/aaaa", em vermelho quando vencida. */
export function DataEntrega({ data, herdada, concluido }: { data?: string | null; herdada?: string | null; concluido?: boolean }) {
  const d = data || herdada;
  if (!d) return <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 mt-3"><CalendarClock size={12} /> Sem data de entrega</div>;
  const hoje = new Date().toISOString().slice(0, 10);
  const vencida = !concluido && d < hoje;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] mt-3 ${vencida ? 'text-red-400' : 'text-zinc-400'}`}>
      <CalendarClock size={12} />
      Entrega: {formatarData(d)}
      {!data && herdada && <span className="text-zinc-600">(do portfólio)</span>}
      {vencida && <span>· vencida</span>}
    </div>
  );
}

function CardProjeto({ projeto: p, tarefas, portfolio, podeEditar, onAbrir, onEditar }: {
  projeto: MarketingProjeto;
  tarefas: Task[];
  portfolio?: MarketingPortfolio;
  podeEditar: boolean;
  onAbrir: () => void;
  onEditar: () => void;
}) {
  const membros = useMembrosProjeto(p.id, tarefas);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={e => { if (e.key === 'Enter') onAbrir(); }}
      className="group relative text-left p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/40 transition-colors cursor-pointer flex flex-col"
    >
      <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r" style={{ backgroundColor: p.cor }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">{p.nome}</div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ChipStatus status={p.status} />
            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
              portfolio ? 'text-zinc-300 bg-zinc-900/80 border-zinc-800' : 'text-zinc-600 border-zinc-800/60 border-dashed'
            }`} title="Portfólio">
              <Briefcase size={10} className="text-zinc-500" />
              {portfolio && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: portfolio.cor }} />}
              <span className="truncate max-w-[14ch]">{portfolio ? portfolio.nome : 'Sem portfólio'}</span>
            </span>
          </div>
        </div>
        {podeEditar && (
          <button
            onClick={e => { e.stopPropagation(); onEditar(); }}
            className="p-1 text-zinc-600 hover:text-zinc-200 rounded hover:bg-zinc-800/60 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Editar projeto"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
      {p.descricao && <p className="text-[12px] text-zinc-500 mt-2 line-clamp-2">{p.descricao}</p>}
      <DataEntrega data={p.dataEntrega} herdada={!p.dataEntrega ? portfolio?.dataEntrega : null} concluido={p.status === 'concluido'} />
      <div className="mt-3"><BarraProgresso resumo={resumir(tarefas)} cor={p.cor} /></div>
      <div className="mt-3 pt-3 border-t border-zinc-900 flex items-center justify-between gap-2">
        <AvataresMembros membros={membros} />
        {membros.length > 0 && (
          <span className="text-[10px] text-zinc-500">{membros.length} membro{membros.length > 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

export default function ProjetosView({ tasks, onAbrirProjeto, onAbrirTodas, podeEditar }: {
  tasks: Task[];
  onAbrirProjeto: (id: string) => void;
  onAbrirTodas: () => void;
  podeEditar: boolean;
}) {
  const { projetos, portfolios, projetoDaTarefa, recarregar } = useMarketingProjetos();
  const [filtro, setFiltro] = useState<'ativos' | 'todos'>('ativos');
  const [editando, setEditando] = useState<MarketingProjeto | null | 'novo'>(null);

  const tarefasPorProjeto = useMemo(() => {
    const mapa: Record<string, Task[]> = {};
    for (const t of tasks) {
      const pid = projetoDaTarefa[t.id];
      if (pid) (mapa[pid] ||= []).push(t);
    }
    return mapa;
  }, [tasks, projetoDaTarefa]);

  const lista = projetos.filter(p => filtro === 'todos' || p.status !== 'concluido');
  const semProjeto = tasks.filter(t => !projetoDaTarefa[t.id] && t.status !== 'done').length;

  return (
    <div className="flex-1 overflow-y-auto view-pad-x py-6 short:py-4">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Projetos</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">Cada projeto tem seu Kanban, lista compacta e calendário.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900/60 border border-zinc-800 rounded-md p-0.5">
            {(['ativos', 'todos'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded ${filtro === f ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {f === 'ativos' ? 'Em andamento' : 'Todos'}
              </button>
            ))}
          </div>
          {podeEditar && (
            <button
              onClick={() => setEditando('novo')}
              className="flex items-center gap-1.5 h-8 px-3 bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium rounded-md"
            >
              <Plus size={13} /> Novo projeto
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        <button
          onClick={onAbrirTodas}
          className="text-left p-4 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40 transition-colors"
        >
          <div className="flex items-center gap-2 text-zinc-200 text-sm font-semibold">
            <Layers size={15} className="text-zinc-500" /> Todas as tarefas
          </div>
          <p className="text-[12px] text-zinc-500 mt-2">
            O quadro completo, com tarefas de todos os projetos.
            {semProjeto > 0 && <> {semProjeto} tarefa{semProjeto > 1 ? 's' : ''} em aberto sem projeto.</>}
          </p>
        </button>

        {lista.map(p => (
          <CardProjeto
            key={p.id}
            projeto={p}
            tarefas={tarefasPorProjeto[p.id] || []}
            portfolio={portfolios.find(x => x.id === p.portfolioId)}
            podeEditar={podeEditar}
            onAbrir={() => onAbrirProjeto(p.id)}
            onEditar={() => setEditando(p)}
          />
        ))}
      </div>

      {projetos.length === 0 && (
        <div className="flex flex-col items-center text-center py-16 text-zinc-500">
          <FolderOpen size={28} className="text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">Nenhum projeto ainda.</p>
          <p className="text-[12px] mt-1">Crie um projeto para organizar tarefas em Kanban, lista e calendário.</p>
        </div>
      )}

      {editando && (
        <ProjetoModal
          projeto={editando === 'novo' ? null : editando}
          portfolios={portfolios}
          tarefas={tasks}
          onClose={() => setEditando(null)}
          onSalvo={(id) => {
            const eraNovo = editando === 'novo';
            setEditando(null);
            recarregar();
            if (eraNovo && id) onAbrirProjeto(id);
          }}
        />
      )}
    </div>
  );
}

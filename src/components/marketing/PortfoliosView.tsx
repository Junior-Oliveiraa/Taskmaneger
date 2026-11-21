import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Briefcase, ChevronRight } from 'lucide-react';
import { Task } from '../../types';
import { useMarketingProjetos, MarketingPortfolio, MarketingProjeto } from '../../lib/marketingProjetos';
import { PortfolioModal, ProjetoModal } from './ProjetoModais';
import { resumir, BarraProgresso, ChipStatus } from './ProjetosView';

export default function PortfoliosView({ tasks, onAbrirProjeto, podeEditar }: {
  tasks: Task[];
  onAbrirProjeto: (id: string) => void;
  podeEditar: boolean;
}) {
  const { projetos, portfolios, projetoDaTarefa, recarregar } = useMarketingProjetos();
  const [editando, setEditando] = useState<MarketingPortfolio | null | 'novo'>(null);
  const [novoProjetoEm, setNovoProjetoEm] = useState<string | null>(null);

  const tarefasPorProjeto = useMemo(() => {
    const mapa: Record<string, Task[]> = {};
    for (const t of tasks) {
      const pid = projetoDaTarefa[t.id];
      if (pid) (mapa[pid] ||= []).push(t);
    }
    return mapa;
  }, [tasks, projetoDaTarefa]);

  const semPortfolio = projetos.filter(p => !p.portfolioId);

  const LinhaProjeto = ({ p }: { p: MarketingProjeto }) => {
    const resumo = resumir(tarefasPorProjeto[p.id] || []);
    return (
      <button
        onClick={() => onAbrirProjeto(p.id)}
        className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_110px_200px_16px] items-center gap-4 px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.cor }} />
          <span className="text-[13px] text-zinc-200 truncate">{p.nome}</span>
        </div>
        <div className="hidden sm:block"><ChipStatus status={p.status} /></div>
        <div className="hidden sm:block"><BarraProgresso resumo={resumo} cor={p.cor} /></div>
        <ChevronRight size={14} className="text-zinc-600" />
      </button>
    );
  };

  const resumoPortfolio = (id: string) =>
    resumir(projetos.filter(p => p.portfolioId === id).flatMap(p => tarefasPorProjeto[p.id] || []));

  return (
    <div className="flex-1 overflow-y-auto view-pad-x py-6 short:py-4">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Portfólios</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">Grupos de projetos, com o andamento de cada um.</p>
        </div>
        {podeEditar && (
          <button
            onClick={() => setEditando('novo')}
            className="flex items-center gap-1.5 h-8 px-3 bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium rounded-md"
          >
            <Plus size={13} /> Novo portfólio
          </button>
        )}
      </div>

      <div className="space-y-4">
        {portfolios.map(pf => {
          const doPortfolio = projetos.filter(p => p.portfolioId === pf.id);
          return (
            <section key={pf.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 overflow-hidden">
              <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: pf.cor }} />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-zinc-100 truncate">{pf.nome}</h2>
                    {pf.descricao && <p className="text-[11px] text-zinc-500 truncate">{pf.descricao}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden md:block w-48"><BarraProgresso resumo={resumoPortfolio(pf.id)} cor={pf.cor} /></div>
                  {podeEditar && (
                    <>
                      <button onClick={() => setNovoProjetoEm(pf.id)} className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-800/60">
                        <Plus size={12} /> Projeto
                      </button>
                      <button onClick={() => setEditando(pf)} className="p-1 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-800/60" title="Editar portfólio">
                        <Pencil size={13} />
                      </button>
                    </>
                  )}
                </div>
              </header>
              <div className="divide-y divide-zinc-900">
                {doPortfolio.map(p => <LinhaProjeto key={p.id} p={p} />)}
                {doPortfolio.length === 0 && (
                  <p className="px-4 py-4 text-[12px] text-zinc-600">Nenhum projeto neste portfólio.</p>
                )}
              </div>
            </section>
          );
        })}

        {semPortfolio.length > 0 && (
          <section className="rounded-xl border border-dashed border-zinc-800/80 overflow-hidden">
            <header className="px-4 py-3 border-b border-zinc-800/60 text-[12px] font-semibold text-zinc-400">Projetos sem portfólio</header>
            <div className="divide-y divide-zinc-900">
              {semPortfolio.map(p => <LinhaProjeto key={p.id} p={p} />)}
            </div>
          </section>
        )}

        {portfolios.length === 0 && (
          <div className="flex flex-col items-center text-center py-16 text-zinc-500">
            <Briefcase size={28} className="text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-400">Nenhum portfólio ainda.</p>
            <p className="text-[12px] mt-1">Agrupe projetos relacionados para acompanhar o andamento deles juntos.</p>
          </div>
        )}
      </div>

      {editando && (
        <PortfolioModal
          portfolio={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar(); }}
        />
      )}
      {novoProjetoEm && (
        <ProjetoModal
          portfolios={portfolios}
          portfolioInicial={novoProjetoEm}
          onClose={() => setNovoProjetoEm(null)}
          onSalvo={() => { setNovoProjetoEm(null); recarregar(); }}
        />
      )}
    </div>
  );
}

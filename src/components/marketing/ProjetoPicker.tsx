import React, { useState } from 'react';
import { useMarketingProjetos, conflitoDePrazo } from '../../lib/marketingProjetos';
import { ArrowUpRight, Folder } from 'lucide-react';
import { BOTAO_ICONE, ItemMenu, Menu, pilula, Propriedade } from '../tarefa/Propriedade';

/** Campo "Projeto" da tarefa: em qual projeto de Marketing ela está. */
export default function ProjetoPicker({ taskId, dueDate, disabled, onAbrir }: {
  taskId: string;
  dueDate?: string;
  disabled?: boolean;
  /** Sai da tarefa e abre o projeto, com as tarefas dele. */
  onAbrir?: (projetoId: string) => void;
}) {
  const { projetos, projetoDaTarefa, vincularTarefa } = useMarketingProjetos();
  const [erro, setErro] = useState<string | null>(null);
  const atual = projetos.find(p => p.id === projetoDaTarefa[taskId]);

  const escolher = async (id: string | null) => {
    setErro(null);
    // O prazo da tarefa precisa caber na entrega do projeto escolhido.
    const conflito = id ? conflitoDePrazo(projetos.find(p => p.id === id), dueDate) : null;
    if (conflito) { setErro(conflito); return; }
    try { await vincularTarefa(taskId, id); }
    catch (e: any) { setErro(e.message); }
  };

  return (
    <Propriedade rotulo="Projeto" nota={erro && <p className="text-body text-red-400">{erro}</p>}>
      <Menu
        rotulo={`Projeto: ${atual?.nome ?? 'nenhum'}`}
        classe={pilula(atual ? 'cheia' : 'vazia')}
        disabled={disabled}
        largura="w-72"
        gatilho={<>
          <Folder size={14} className="shrink-0" aria-hidden />
          <span className="truncate max-w-[220px]">{atual?.nome || 'Projeto'}</span>
        </>}
      >
        {fechar => <>
          <div className={`shrink-0 ${onAbrir ? 'pr-9 [@media(pointer:coarse)]:pr-11' : ''}`}>
            <ItemMenu marcado={!atual} onClick={() => { fechar(); escolher(null); }}><span className="text-zinc-400">Sem projeto</span></ItemMenu>
          </div>
          {projetos.filter(p => p.status !== 'concluido' || p.id === atual?.id).map(p => (
            <div key={p.id} className="shrink-0 flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <ItemMenu marcado={p.id === atual?.id} onClick={() => { fechar(); escolher(p.id); }}>
                  <Folder size={14} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="truncate">{p.nome}</span>
                </ItemMenu>
              </div>
              {onAbrir && (
                <button type="button" onClick={() => { fechar(); onAbrir(p.id); }} aria-label={`Abrir o projeto ${p.nome}`} title="Abrir o projeto e ver as tarefas" className={BOTAO_ICONE}>
                  <ArrowUpRight size={15} aria-hidden />
                </button>
              )}
            </div>
          ))}
          {projetos.length === 0 && <p className="px-2 py-1.5 text-body text-zinc-400">Nenhum projeto criado.</p>}
        </>}
      </Menu>
    </Propriedade>
  );
}

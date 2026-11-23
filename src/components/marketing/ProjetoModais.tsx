import React, { useEffect, useState } from 'react';
import {
  X, Loader2, Trash2, CircleDot, Folder, Flag, MapPin, Calendar, Palette, Users,
} from 'lucide-react';
import { Task, TaskPriority } from '../../types';
import {
  MarketingProjeto, ProjetoStatus, STATUS_PROJETO, CORES_PROJETO,
  salvarProjeto, excluirProjeto, definirMembroProjeto,
  useMarketingProjetos, useEmpreendimentos, propriedadesProjeto, maiorPrazo, formatarData,
  validarDatasProjeto,
} from '../../lib/marketingProjetos';
import { PRIORIDADE_INFO, PRIORIDADE_PILULA } from '../TarefaBadges';
import { FOCO, pilula } from '../tarefa/Propriedade';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from './MembrosProjeto';
import { CampoDatas, MenuEmpreendimentos, MenuMulti, MenuPrioridade, MenuStatus, corStatus } from './ProjetoCampos';

function Moldura({ titulo, onClose, largura = 'max-w-md', children }: {
  titulo: string; onClose: () => void; largura?: string; children: React.ReactNode;
}) {
  // Esc fecha (menus e calendários abertos seguram a tecla antes).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);
  return (
    // A rolagem fica no fundo, não no cartão: assim os menus suspensos não são cortados.
    <div className="fixed inset-0 z-[100] flex overflow-y-auto bg-black/60 backdrop-blur-sm p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`m-auto w-full ${largura} bg-[#0f0f12] border border-zinc-800 rounded-xl shadow-2xl`}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80">
          <h2 className="text-body font-semibold text-zinc-100">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className={`p-1 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-800/60 ${FOCO}`}><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const campo = 'w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-body text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600';
const rotulo = 'block text-caption font-medium text-zinc-500 mb-1.5';

function SeletorCor({ cor, onChange }: { cor: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
      {CORES_PROJETO.map(c => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={cor === c}
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full border-2 transition-transform ${cor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'} ${FOCO}`}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        />
      ))}
    </div>
  );
}

function Rodape({ salvando, erro, podeExcluir, onExcluir, onCancelar, rotuloSalvar }: {
  salvando: boolean; erro: string | null; podeExcluir: boolean; onExcluir: () => void; onCancelar: () => void; rotuloSalvar: string;
}) {
  return (
    <>
      {erro && <p role="alert" className="text-caption text-red-400">{erro}</p>}
      <div className="flex items-center justify-between pt-1">
        {podeExcluir ? (
          <button type="button" onClick={onExcluir} disabled={salvando} className={`flex items-center gap-1.5 h-8 px-2 -ml-2 rounded-lg text-body text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 ${FOCO}`}>
            <Trash2 size={14} aria-hidden /> Excluir
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancelar} className={`h-8 px-3 rounded-lg text-body text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] ${FOCO}`}>Cancelar</button>
          <button type="submit" disabled={salvando} className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg btn-brand text-body font-medium disabled:opacity-60 ${FOCO}`}>
            {salvando && <Loader2 size={13} className="animate-spin" aria-hidden />} {rotuloSalvar}
          </button>
        </div>
      </div>
    </>
  );
}

/** Linha de propriedade: rótulo à esquerda, valor clicável à direita. */
function LinhaPropriedade({ icone: Icone, rotulo: texto, children }: { icone: React.ElementType; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3 min-h-9">
      <span className="inline-flex items-center gap-2 text-body text-zinc-500">
        <Icone size={14} className="shrink-0" aria-hidden /> {texto}
      </span>
      <div className="min-w-0 flex">{children}</div>
    </div>
  );
}

export function ProjetoModal({ projeto, tarefas, onClose, onSalvo }: {
  projeto?: MarketingProjeto | null;
  /** Todas as tarefas: o modal pega as do projeto para checar os prazos. */
  tarefas: Task[];
  onClose: () => void;
  onSalvo: (id: string | null) => void;
}) {
  const { projetoDaTarefa, membrosDoProjeto } = useMarketingProjetos();
  const { allUsers } = useAuth();
  const membrosIniciais = projeto ? membrosDoProjeto[projeto.id] ?? [] : [];
  const [membros, setMembros] = useState<string[]>(membrosIniciais);
  const empreendimentos = useEmpreendimentos();
  const comPropriedades = propriedadesProjeto.ativa;
  const [nome, setNome] = useState(projeto?.nome ?? '');
  const [descricao, setDescricao] = useState(projeto?.descricao ?? '');
  const [cor, setCor] = useState(projeto?.cor ?? CORES_PROJETO[0]);
  const [status, setStatus] = useState<ProjetoStatus>(projeto?.status ?? 'ativo');
  const [dataEntrega, setDataEntrega] = useState(projeto?.dataEntrega ?? '');
  const [dataInicio, setDataInicio] = useState(projeto?.dataInicio ?? '');
  const [prioridade, setPrioridade] = useState<TaskPriority>(projeto?.prioridade ?? 'no_priority');
  const [empreendimentoIds, setEmpreendimentoIds] = useState<string[]>(projeto?.empreendimentoIds ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const maiorTarefa = projeto ? maiorPrazo(tarefas.filter(t => projetoDaTarefa[t.id] === projeto.id)) : null;
  const nomesEmpreendimentos = empreendimentoIds.flatMap(id => empreendimentos.find(e => e.id === id)?.name ?? []);
  const membrosSel = membros.flatMap(id => allUsers.find(u => u.id === id) ?? []);
  const nomesMembros = membrosSel.map(u => u.name);
  const IconePrio = PRIORIDADE_PILULA[prioridade].icone;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setErro('Dê um nome ao projeto.'); return; }
    const problema = validarDatasProjeto({ dataInicio, dataEntrega, maiorTarefa });
    if (problema) { setErro(problema); return; }
    setSalvando(true); setErro(null);
    try {
      const id = await salvarProjeto({
        id: projeto?.id, nome, descricao, cor, status,
        dataEntrega: dataEntrega || null, dataInicio: dataInicio || null, prioridade, empreendimentoIds,
      });
      // Membros: só o que mudou.
      const mudancas = [
        ...membros.filter(m => !membrosIniciais.includes(m)).map(m => definirMembroProjeto(id, m, true)),
        ...membrosIniciais.filter(m => !membros.includes(m)).map(m => definirMembroProjeto(id, m, false)),
      ];
      await Promise.all(mudancas);
      onSalvo(id);
    } catch (err: any) {
      setErro(err.message); setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!projeto || !confirm(`Excluir o projeto "${projeto.nome}"? As tarefas continuam existindo, só saem do projeto.`)) return;
    setSalvando(true);
    try { await excluirProjeto(projeto.id); onSalvo(null); }
    catch (err: any) { setErro(err.message); setSalvando(false); }
  };

  // Dica das datas: só o que limita.
  const dica = maiorTarefa ? `Tarefa mais tardia em ${formatarData(maiorTarefa)}` : '';

  return (
    <Moldura titulo={projeto ? 'Editar projeto' : 'Novo projeto'} onClose={onClose} largura="max-w-xl">
      <form onSubmit={salvar} className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <Folder size={18} className="shrink-0 transition-colors" style={{ color: cor }} aria-hidden />
            <input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              aria-label="Nome do projeto"
              placeholder="Nome do projeto"
              className="w-full min-w-0 bg-transparent text-heading font-semibold text-zinc-100 placeholder:text-zinc-600 outline-none border-b border-transparent focus:border-zinc-700 py-1"
            />
          </div>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={2}
            aria-label="Descrição"
            placeholder="Adicione uma descrição: objetivo, escopo…"
            className="w-full resize-none bg-transparent text-body text-zinc-300 placeholder:text-zinc-600 outline-none rounded-lg px-2 py-1.5 -mx-2 hover:bg-[#161619] focus:bg-[#161619] transition-colors"
          />
        </div>

        <div className="space-y-1 border-t border-zinc-800/80 pt-4">
          <LinhaPropriedade icone={CircleDot} rotulo="Status">
            <MenuStatus
              valor={status}
              onChange={setStatus}
              rotulo={`Status: ${STATUS_PROJETO.find(s => s.id === status)?.label}`}
              classe={pilula('cheia')}
              gatilho={<>
                <span className={`size-2 rounded-full shrink-0 bg-current ${corStatus(status)}`} aria-hidden />
                <span>{STATUS_PROJETO.find(s => s.id === status)?.label}</span>
              </>}
            />
          </LinhaPropriedade>

          {comPropriedades && (
            <LinhaPropriedade icone={Flag} rotulo="Prioridade">
              <MenuPrioridade
                valor={prioridade}
                onChange={setPrioridade}
                rotulo={`Prioridade: ${PRIORIDADE_INFO[prioridade].label}`}
                classe={`${pilula(prioridade === 'no_priority' ? 'vazia' : 'cheia')} ${PRIORIDADE_PILULA[prioridade].pilula}`}
                gatilho={<>
                  <IconePrio size={15} className="shrink-0" aria-hidden />
                  <span>{prioridade === 'no_priority' ? 'Sem prioridade' : PRIORIDADE_INFO[prioridade].label}</span>
                </>}
              />
            </LinhaPropriedade>
          )}

          {comPropriedades && (
            <LinhaPropriedade icone={MapPin} rotulo="Empreendimentos">
              <MenuEmpreendimentos
                valor={empreendimentoIds}
                opcoes={empreendimentos}
                onChange={setEmpreendimentoIds}
                rotulo={`Empreendimentos: ${nomesEmpreendimentos.join(', ') || 'nenhum'}`}
                classe={pilula(nomesEmpreendimentos.length ? 'cheia' : 'vazia')}
                gatilho={nomesEmpreendimentos.length
                  ? <span className="truncate" title={nomesEmpreendimentos.join(', ')}>{nomesEmpreendimentos.join(', ')}</span>
                  : <span>Adicionar empreendimento</span>}
              />
            </LinhaPropriedade>
          )}

          <LinhaPropriedade icone={Users} rotulo="Membros">
            <MenuMulti
              item="pessoa"
              vazio="Nenhum usuário"
              valor={membros}
              opcoes={allUsers.map(u => ({ id: u.id, name: u.name }))}
              onChange={setMembros}
              icone={id => { const u = allUsers.find(x => x.id === id); return u ? <Avatar m={u} tamanho={20} /> : null; }}
              rotulo={`Membros: ${nomesMembros.join(", ") || "nenhum"}`}
              classe={pilula(membros.length ? "cheia" : "vazia")}
              gatilho={membrosSel.length ? <>
                <span className="flex -space-x-1.5 shrink-0">{membrosSel.slice(0, 4).map(u => <Avatar key={u.id} m={u} tamanho={20} />)}</span>
                <span className="truncate" title={nomesMembros.join(", ")}>{membrosSel.length === 1 ? membrosSel[0].name : `${membrosSel.length} membros`}</span>
              </> : <span>Adicionar membros</span>}
            />
          </LinhaPropriedade>

          <LinhaPropriedade icone={Calendar} rotulo="Datas">
            {comPropriedades ? (
              <CampoDatas
                inicio={dataInicio}
                entrega={dataEntrega}
                maxInicio={dataEntrega || null}
                onInicio={setDataInicio}
                onEntrega={setDataEntrega}
                classe={pilula(dataInicio || dataEntrega ? 'cheia' : 'vazia')}
              />
            ) : (
              <input
                type="date"
                aria-label="Data de entrega"
                value={dataEntrega}
                onChange={e => setDataEntrega(e.target.value)}
                className={`${campo} [color-scheme:dark] max-w-48`}
              />
            )}
          </LinhaPropriedade>
          {dica && <p className="pl-[144px] -mt-0.5 text-caption text-zinc-500">{dica}</p>}

          <LinhaPropriedade icone={Palette} rotulo="Cor">
            <SeletorCor cor={cor} onChange={setCor} />
          </LinhaPropriedade>
        </div>

        <div className="border-t border-zinc-800/80 pt-4 space-y-3">
          <Rodape salvando={salvando} erro={erro} podeExcluir={!!projeto} onExcluir={excluir} onCancelar={onClose} rotuloSalvar={projeto ? 'Salvar' : 'Criar projeto'} />
        </div>
      </form>
    </Moldura>
  );
}

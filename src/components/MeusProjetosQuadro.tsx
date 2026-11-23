import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight, ChevronDown, Folder,
} from 'lucide-react';
import { Task, Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { useMarketingProjetos, MarketingProjeto, ProjetoStatus } from '../lib/marketingProjetos';
import { temResponsavel } from '../lib/responsaveis';
import { hojeLocal } from '../lib/datas';
import { resumir } from '../lib/projetosLista';
import { diasEntre } from '../lib/prazo';
import { EntregaProjeto, ProgressoLinha } from './marketing/ProjetoBadges';
import { AvataresMembros } from './marketing/MembrosProjeto';
import { PrioridadeBadge } from './TarefaBadges';

type AbaProjetos = ProjetoStatus; // 'ativo' | 'pausado' | 'concluido'

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';
const BOTAO_ACAO = `size-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition ${EASE} ${FOCO}`;

// md: Projeto 28 / Prioridade 13 / Membros 11 / Progresso 18 / Minhas tarefas 14 / Entrega 12 / Ações 4.
// 2xl: entra Empreendimento (o quadro só tem largura para ele em telas largas).
const COLUNAS =
  'md:grid-cols-[minmax(0,28fr)_minmax(88px,13fr)_minmax(88px,11fr)_minmax(0,18fr)_minmax(0,14fr)_minmax(0,12fr)_minmax(48px,4fr)] ' +
  '2xl:grid-cols-[minmax(0,30fr)_minmax(0,16fr)_minmax(88px,10fr)_minmax(88px,9fr)_minmax(0,14fr)_minmax(0,11fr)_minmax(0,10fr)_minmax(48px,4fr)]';

interface Membro { id: string; name: string; avatarUrl?: string; initials?: string; cadastrado: boolean; tarefas: number }

interface LinhaDados {
  projeto: MarketingProjeto;
  membros: Membro[];
  empreendimentos: string[];
  entrega: string | null;
  total: number;
  concluidas: number;
  minhasAbertas: number;
  minhasAtrasadas: number;
}

/**
 * Quadro "Meus projetos" do Início: mesmo padrão de "Minhas tarefas".
 * Meu projeto = sou membro cadastrado OU responsável por alguma tarefa dele
 * (a mesma regra de membros da tela de Projetos).
 * Não renderiza nada quando o usuário não participa de nenhum projeto.
 */
export default function MeusProjetosQuadro({ tasks, projects = [], onAbrirProjeto, limiteLinhas = 6 }: {
  tasks: Task[];
  /** Empreendimentos, para nomear os do projeto. */
  projects?: Project[];
  onAbrirProjeto: (projetoId: string) => void;
  limiteLinhas?: number;
}) {
  const { currentUser, allUsers } = useAuth();
  const { projetos, projetoDaTarefa, membrosDoProjeto } = useMarketingProjetos();
  const [abaEscolhida, setAbaEscolhida] = useState<AbaProjetos | null>(null);
  const [expandida, setExpandida] = useState(false);
  const hoje = hojeLocal();

  const linhas = useMemo<LinhaDados[]>(() => {
    if (!currentUser) return [];
    const empreendimentoPorId = new Map(projects.map(e => [e.id, e.name]));
    const usuarioPorId = new Map(allUsers.map(u => [u.id, u]));
    const tarefasPorProjeto: Record<string, Task[]> = {};
    for (const t of tasks) {
      const pid = projetoDaTarefa[t.id];
      if (pid) (tarefasPorProjeto[pid] ||= []).push(t);
    }
    return projetos
      .filter(p => {
        const membro = (membrosDoProjeto[p.id] || []).includes(currentUser.id);
        const responsavel = (tarefasPorProjeto[p.id] || []).some(t => temResponsavel(t, currentUser.id));
        return membro || responsavel;
      })
      .map(p => {
        const tarefas = tarefasPorProjeto[p.id] || [];
        const resumo = resumir(tarefas);
        const minhas = tarefas.filter(t => temResponsavel(t, currentUser.id) && t.status !== 'done' && t.status !== 'implementation');
        const entrega = p.dataEntrega || null;
        // Membros = cadastrados + responsáveis por tarefas (mesma regra da tela do projeto).
        const cadastrados = new Set(membrosDoProjeto[p.id] || []);
        const porResponsavel: Record<string, number> = {};
        for (const t of tarefas) if (t.assigneeId) porResponsavel[t.assigneeId] = (porResponsavel[t.assigneeId] || 0) + 1;
        const membros = [...new Set([...cadastrados, ...Object.keys(porResponsavel)])]
          .map((id): Membro | null => {
            const u = usuarioPorId.get(id);
            return u ? { id, name: u.name, avatarUrl: u.avatarUrl, initials: u.initials, cadastrado: cadastrados.has(id), tarefas: porResponsavel[id] || 0 } : null;
          })
          .filter((m): m is Membro => !!m)
          .sort((a, b) => Number(b.cadastrado) - Number(a.cadastrado) || a.name.localeCompare(b.name));
        const empreendimentos = (p.empreendimentoIds || [])
          .map(id => empreendimentoPorId.get(id))
          .filter((n): n is string => !!n);
        return {
          projeto: p,
          membros,
          empreendimentos,
          entrega,
          total: resumo.total,
          concluidas: resumo.concluidas,
          minhasAbertas: minhas.length,
          minhasAtrasadas: minhas.filter(t => !!t.dueDate && t.dueDate.slice(0, 10) < hoje).length,
        };
      })
      // Entrega mais próxima primeiro; sem data no fim; empate por nome.
      .sort((a, b) => {
        if (a.entrega && b.entrega) return a.entrega.localeCompare(b.entrega) || a.projeto.nome.localeCompare(b.projeto.nome);
        if (a.entrega) return -1;
        if (b.entrega) return 1;
        return a.projeto.nome.localeCompare(b.projeto.nome);
      });
  }, [currentUser, allUsers, projects, projetos, projetoDaTarefa, membrosDoProjeto, tasks, hoje]);

  if (linhas.length === 0) return null;

  const porStatus = (s: ProjetoStatus) => linhas.filter(l => l.projeto.status === s);
  const aba: AbaProjetos = abaEscolhida ?? (porStatus('ativo').length > 0 ? 'ativo' : porStatus('pausado').length > 0 ? 'pausado' : 'concluido');
  const listaCompleta = porStatus(aba);
  const lista = !expandida ? listaCompleta.slice(0, limiteLinhas) : listaCompleta;
  const restantes = listaCompleta.length - lista.length;

  const abas: { id: AbaProjetos; label: string }[] = [
    { id: 'ativo', label: 'Ativos' },
    { id: 'pausado', label: 'Pausados' },
    { id: 'concluido', label: 'Concluídos' },
  ];
  const vazio = {
    ativo: { titulo: 'Nenhum projeto ativo', texto: 'Projetos em andamento em que você participa aparecem aqui.' },
    pausado: { titulo: 'Nenhum projeto pausado', texto: 'Projetos pausados em que você participa aparecem aqui.' },
    concluido: { titulo: 'Nenhum projeto concluído', texto: 'Projetos entregues em que você participou aparecem aqui.' },
  }[aba];

  return (
    // Sem overflow-hidden, como em Minhas tarefas (consistência de borda e hover).
    <section
      aria-labelledby="meus-projetos-titulo"
      className="h-full flex flex-col bg-[#121214] border border-zinc-900 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900 flex-wrap">
        <h2 id="meus-projetos-titulo" className="text-heading font-semibold text-zinc-100">Meus projetos</h2>
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0c0c0e] border border-zinc-900" role="tablist" aria-label="Filtrar projetos">
          {abas.map(a => {
            const ativa = aba === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => { setAbaEscolhida(a.id); setExpandida(false); }}
                className={`h-7 [@media(pointer:coarse)]:h-10 px-3 rounded-md text-body font-medium transition-colors ${EASE} ${FOCO} ${
                  ativa ? 'bg-zinc-100 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#161619]'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Cabeçalho das colunas */}
      <div aria-hidden className={`hidden md:grid ${COLUNAS} gap-4 px-4 py-2 text-caption font-medium text-zinc-500 border-b border-zinc-900`}>
        <span>Projeto</span>
        <span className="hidden 2xl:block">Empreendimento</span>
        <span>Prioridade</span>
        <span>Membros</span>
        <span>Progresso</span>
        <span>Minhas tarefas</span>
        <span className="text-right">Entrega</span>
        <span className="text-right">Ações</span>
      </div>

      <div className="flex flex-col divide-y divide-zinc-900">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-6 py-10">
            <span className="size-10 inline-flex items-center justify-center rounded-xl bg-[#1f1f23] border border-white/10">
              <Folder size={18} className="text-zinc-400" aria-hidden />
            </span>
            <p className="mt-3 text-body font-medium text-zinc-200">{vazio.titulo}</p>
            <p className="mt-1 text-caption text-zinc-400 max-w-[36ch]">{vazio.texto}</p>
          </div>
        ) : lista.map((l, i) => {
          const p = l.projeto;
          const concluido = p.status === 'concluido';
          const atraso = !concluido && l.entrega && l.entrega < hoje ? diasEntre(l.entrega, hoje) : 0;
          const ultima = i === lista.length - 1 && restantes === 0;

          return (
            <div
              key={p.id}
              onClick={() => onAbrirProjeto(p.id)}
              className={`group grid grid-cols-[minmax(0,1fr)_auto] ${COLUNAS} items-center gap-4 px-4 min-h-12 py-2 cursor-pointer hover:bg-[#161619] focus-within:bg-[#161619] transition-colors ${EASE} ${ultima ? 'rounded-b-2xl' : ''}`}
            >
              {/* Projeto: pasta + nome */}
              <div className="flex items-center gap-2.5 min-w-0">
                <Folder size={14} className="shrink-0 text-zinc-500" aria-hidden />
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onAbrirProjeto(p.id); }}
                    title={p.nome}
                    className={`block max-w-full truncate text-left text-body rounded ${FOCO} ${concluido ? 'text-zinc-400' : 'text-zinc-100'}`}
                  >
                    {p.nome}
                  </button>
                </div>
              </div>

              {/* Empreendimento(s): o primeiro + quantos mais */}
              <div className="hidden 2xl:block min-w-0 text-body truncate" title={l.empreendimentos.join(', ') || undefined}>
                {l.empreendimentos.length > 0 ? (
                  <span className="text-zinc-400">
                    {l.empreendimentos[0]}
                    {l.empreendimentos.length > 1 && <span className="text-zinc-500 tabular-nums"> +{l.empreendimentos.length - 1}</span>}
                  </span>
                ) : <span className="text-zinc-500">—</span>}
              </div>

              {/* Prioridade: mesmo ícone e cor de Minhas tarefas */}
              <span className="hidden md:flex min-w-0"><PrioridadeBadge prioridade={p.prioridade} plano /></span>

              {/* Membros */}
              <div className="hidden md:flex min-w-0"><AvataresMembros membros={l.membros} max={3} /></div>

              {/* Progresso: tarefas concluídas do projeto inteiro */}
              <div className="hidden md:block min-w-0"><ProgressoLinha concluidas={l.concluidas} total={l.total} cor={p.cor} /></div>

              {/* Minhas tarefas abertas no projeto */}
              <div className="hidden md:block text-body tabular-nums">
                {l.minhasAbertas > 0 ? (
                  <span className="text-zinc-200">
                    {l.minhasAbertas} {l.minhasAbertas === 1 ? 'aberta' : 'abertas'}
                    {l.minhasAtrasadas > 0 && (
                      <span className="text-caption text-red-400 font-medium"> · {l.minhasAtrasadas} {l.minhasAtrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>
                    )}
                  </span>
                ) : <span className="text-zinc-500">Nenhuma</span>}
              </div>

              {/* Entrega */}
              <span className="flex justify-end"><EntregaProjeto entrega={l.entrega} diasAtraso={atraso} concluido={concluido} /></span>

              {/* Ações, sempre visíveis */}
              <div onClick={e => e.stopPropagation()} className="hidden md:flex items-center justify-end">
                <button type="button" aria-label={`Abrir projeto ${p.nome}`} title="Abrir projeto" className={BOTAO_ACAO} onClick={() => onAbrirProjeto(p.id)}>
                  <ArrowUpRight size={15} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}

        {restantes > 0 && (
          <button
            type="button"
            onClick={() => setExpandida(true)}
            className={`flex items-center justify-center gap-1.5 h-10 rounded-b-2xl text-body font-medium text-zinc-400 hover:text-zinc-100 hover:bg-[#161619] transition-colors ${FOCO}`}
          >
            Mostrar mais {restantes} <ChevronDown size={14} aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

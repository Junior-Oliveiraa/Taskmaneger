import React, { useState } from 'react';
import {
  Bell, Check, CheckCircle2, Calendar, Plus, UserRound, X, ChevronDown, Folder,
} from 'lucide-react';
import { Task, Project, Label } from '../types';
import ControleSegmentado from './ControleSegmentado';
import DatePicker from './DatePicker';
import AssigneePicker from './AssigneePicker';
import { hojeLocal, somarDias } from '../lib/datas';
import { PrioridadeBadge, PrazoBadge, TipoIcone } from './TarefaBadges';
import { useMarketingProjetos } from '../lib/marketingProjetos';

export type AbaTarefas = 'proximas' | 'atrasadas' | 'concluidas';

/** Atraso (em dias) a partir do qual a entrega de PROJETO fica vermelha (tarefas usam lib/prazo). */
export const LIMITE_ALERTA_ATRASO_DIAS = 30;

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';
const BOTAO_ACAO_BASE = `size-7 inline-flex items-center justify-center rounded-md hover:bg-[#1f1f23] transition ${EASE} ${FOCO}`;
const BOTAO_ACAO = `${BOTAO_ACAO_BASE} text-zinc-400 hover:text-zinc-100`;

// md: Tarefa 40 / Projeto 24 / Prioridade 12 / Prazo 14 / Ações 10.
// lg: entra Empreendimento → Tarefa 34 / Projeto 20 / Empreendimento 16 / Prioridade 10 / Prazo 12 / Ações 8.
// Prioridade e Ações têm piso (chip e 4 botões).
const COLUNAS =
  'md:grid-cols-[minmax(0,40fr)_minmax(0,24fr)_minmax(88px,12fr)_minmax(104px,14fr)_minmax(128px,10fr)] ' +
  'lg:grid-cols-[minmax(0,34fr)_minmax(0,20fr)_minmax(0,16fr)_minmax(88px,10fr)_minmax(152px,12fr)_minmax(128px,8fr)]';

const concluida = (t: Task) => t.status === 'done' || t.status === 'implementation';

/** Separa as tarefas em próximas (com prazo primeiro), atrasadas e concluídas (recentes primeiro). */
export function separarTarefas(tarefas: Task[]) {
  const hoje = hojeLocal();
  const atrasadas = tarefas
    .filter(t => !concluida(t) && !!t.dueDate && t.dueDate.slice(0, 10) < hoje)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const ids = new Set(atrasadas.map(t => t.id));
  const proximas = tarefas
    .filter(t => !concluida(t) && !ids.has(t.id))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  const concluidas = tarefas
    .filter(concluida)
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  return { proximas, atrasadas, concluidas };
}

export interface FiltroStatus {
  status: Task['status'];
  label: string;
}

/** Quadro "Minhas tarefas": abas Próximas / Atrasadas / Concluídas, em tabela. */
export default function MinhasTarefasQuadro({
  proximas, atrasadas, concluidas, projects, labels, onSelectTask, onUpdateTask,
  className = '', aba: abaControlada, onAbaChange, onNovaTarefa,
  filtroStatus, onLimparFiltro, limiteLinhas,
}: {
  proximas: Task[];
  atrasadas: Task[];
  concluidas: Task[];
  projects: Project[];
  labels: Label[];
  onSelectTask: (t: Task) => void;
  onUpdateTask: (updates: Partial<Task> & { id: string }) => void;
  className?: string;
  /** Aba controlada de fora (os KPIs do Início trocam a aba). */
  aba?: AbaTarefas | null;
  onAbaChange?: (aba: AbaTarefas) => void;
  /** Mostra "Criar tarefa" no estado vazio de Próximas. */
  onNovaTarefa?: () => void;
  /** Filtro transitório por status (ex.: "Em aprovação"), sobre todas as tarefas em aberto. */
  filtroStatus?: FiltroStatus | null;
  onLimparFiltro?: () => void;
  /** Sem rolagem interna: mostra N linhas e um "Mostrar mais" (Início). */
  limiteLinhas?: number;
}) {
  // Sem escolha do usuário, a aba segue os dados: abre em Atrasadas quando há
  // alguma. Derivar (em vez de fixar no primeiro render) evita abrir em
  // Próximas só porque as tarefas ainda não tinham carregado.
  const [abaEscolhida, setAbaEscolhida] = useState<AbaTarefas | null>(null);
  const [expandida, setExpandida] = useState(false);

  // Projeto de Marketing (cache compartilhado do React Query).
  const { projetos: projetosMkt, projetoDaTarefa } = useMarketingProjetos();
  const projetoPorId = new Map(projetosMkt.map(p => [p.id, p]));
  const projetoPorTarefa = (taskId: string) => {
    const pid = projetoDaTarefa[taskId];
    return pid ? projetoPorId.get(pid) : undefined;
  };
  const aba: AbaTarefas = abaControlada ?? abaEscolhida ?? (atrasadas.length > 0 ? 'atrasadas' : 'proximas');
  const trocarAba = (a: AbaTarefas) => {
    setAbaEscolhida(a);
    setExpandida(false);
    onLimparFiltro?.();
    onAbaChange?.(a);
  };

  // Abas sem contador: os totais já estão nos indicadores acima (sem número duplicado).
  const abas: { id: AbaTarefas; label: string }[] = [
    { id: 'proximas', label: 'Próximas' },
    { id: 'atrasadas', label: 'Atrasadas' },
    { id: 'concluidas', label: 'Concluídas' },
  ];

  const listaCompleta = filtroStatus
    ? [...atrasadas, ...proximas].filter(t => t.status === filtroStatus.status)
    : aba === 'proximas' ? proximas : aba === 'atrasadas' ? atrasadas : concluidas;
  const lista = limiteLinhas && !expandida ? listaCompleta.slice(0, limiteLinhas) : listaCompleta;
  const restantes = listaCompleta.length - lista.length;
  const abaFeita = !filtroStatus && aba === 'concluidas';

  const vazio = filtroStatus
    ? { icone: CheckCircle2, titulo: `Nada ${filtroStatus.label.toLowerCase()}`, texto: 'Nenhuma tarefa sua neste status.' }
    : {
      proximas: { icone: Calendar, titulo: 'Nada pela frente', texto: 'Você não tem tarefas em aberto.' },
      atrasadas: { icone: CheckCircle2, titulo: 'Tudo em dia', texto: 'Nenhuma tarefa com prazo vencido.' },
      concluidas: { icone: CheckCircle2, titulo: 'Nenhuma concluída ainda', texto: 'As tarefas que você entregar aparecem aqui.' },
    }[aba];
  const IconeVazio = vazio.icone;

  return (
    // Sem overflow-hidden: os popovers de data e responsável (absolutos)
    // precisam escapar do card.
    <section
      aria-labelledby="minhas-tarefas-titulo"
      className={`flex flex-col bg-[#121214] border border-zinc-900 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] ${className}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h2 id="minhas-tarefas-titulo" className="text-heading font-semibold text-zinc-100">Minhas tarefas</h2>
          {filtroStatus && (
            <span className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-blue-500/15 text-blue-300 text-caption font-medium">
              {filtroStatus.label}
              <button
                type="button"
                onClick={onLimparFiltro}
                aria-label={`Remover filtro ${filtroStatus.label}`}
                className={`size-4 inline-flex items-center justify-center rounded-full hover:bg-blue-500/25 ${FOCO}`}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          )}
        </div>
        <ControleSegmentado<AbaTarefas> ariaLabel="Filtrar tarefas" opcoes={abas} valor={filtroStatus ? null : aba} onChange={trocarAba} />
      </header>

      {/* Cabeçalho das colunas */}
      <div aria-hidden className={`hidden md:grid ${COLUNAS} gap-4 px-4 py-2 text-caption font-medium text-zinc-500 border-b border-zinc-900`}>
        <span className="pl-9">Tarefa</span>
        <span>Projeto</span>
        <span className="hidden lg:block">Empreendimento</span>
        <span>Prioridade</span>
        <span className="text-right">Prazo</span>
        <span className="text-right">Ações</span>
      </div>

      <div className="flex flex-col divide-y divide-zinc-900">
        {lista.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
            <span className="size-10 inline-flex items-center justify-center rounded-xl bg-[#1f1f23] border border-white/10">
              <IconeVazio size={18} className="text-zinc-400" aria-hidden />
            </span>
            <p className="mt-3 text-body font-medium text-zinc-200">{vazio.titulo}</p>
            <p className="mt-1 text-caption text-zinc-400 max-w-[32ch]">{vazio.texto}</p>
            {!filtroStatus && aba === 'proximas' && onNovaTarefa && (
              <button
                type="button"
                onClick={onNovaTarefa}
                className={`mt-4 inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-11 px-3 rounded-lg border border-white/10 text-body font-medium text-zinc-200 hover:bg-[#161619] active:scale-[0.98] transition ${EASE} ${FOCO}`}
              >
                <Plus size={14} aria-hidden /> Criar tarefa
              </button>
            )}
          </div>
        ) : lista.map((t, i) => {
          const etiqueta = t.labels?.[0] ? labels.find(l => l.id === t.labels[0].id) : undefined;
          const projeto = projects.find(p => p.id === t.projectId);
          const projetoMkt = projetoPorTarefa(t.id);
          const feita = concluida(t);
          const ultima = i === lista.length - 1 && restantes === 0;

          return (
            <div
              key={t.id}
              // Clique na linha abre a tarefa (atalho de mouse); pelo teclado o
              // alvo é o botão do título, sem botões aninhados.
              onClick={() => onSelectTask(t)}
              className={`group grid grid-cols-[minmax(0,1fr)_auto] ${COLUNAS} items-center gap-4 px-4 min-h-11 [@media(pointer:coarse)]:min-h-12 py-1.5 cursor-pointer hover:bg-[#161619] focus-within:bg-[#161619] transition-colors ${EASE} ${ultima ? 'rounded-b-2xl' : ''}`}
            >
              {/* Tarefa: checkbox (concluir) + ícone da classe + nome (+ prioridade entre sm e md) */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={feita}
                  aria-label={feita ? `${t.title || 'Tarefa'} concluída` : `Concluir ${t.title || 'tarefa'}`}
                  disabled={feita}
                  onClick={e => { e.stopPropagation(); onUpdateTask({ id: t.id, status: 'done' }); }}
                  className={`shrink-0 size-7 [@media(pointer:coarse)]:size-10 -ml-1.5 inline-flex items-center justify-center rounded-md disabled:cursor-default ${FOCO}`}
                >
                  <span className={`size-4 inline-flex items-center justify-center rounded-[5px] border transition-colors ${EASE} ${
                    feita ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-500 hover:border-blue-400 hover:bg-blue-500/10'
                  }`}>
                    {feita && <Check size={12} strokeWidth={3} aria-hidden />}
                  </span>
                </button>
                <TipoIcone etiqueta={etiqueta} />
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onSelectTask(t); }}
                  title={t.title}
                  className={`min-w-0 truncate text-left text-body rounded ${FOCO} ${feita ? 'text-zinc-500 line-through decoration-zinc-600' : 'text-zinc-100'}`}
                >
                  {t.title || 'Sem título'}
                </button>
                {/* Entre sm e md não há coluna de prioridade: o ícone vai ao lado do nome. */}
                {!feita && (
                  <span className="hidden sm:inline-flex md:hidden">
                    <PrioridadeBadge prioridade={t.priority} compacto />
                  </span>
                )}
              </div>

              {/* Projeto (Marketing) */}
              <div className="hidden md:flex flex-col justify-center min-w-0">
                {projetoMkt ? (
                  <span className="flex items-center gap-1.5 min-w-0 text-body text-zinc-200" title={projetoMkt.nome}>
                    <Folder size={12} className="shrink-0 text-zinc-500" aria-hidden />
                    <span className="truncate">{projetoMkt.nome}</span>
                  </span>
                ) : (
                  <span className="text-body text-zinc-500">—</span>
                )}
              </div>

              <span className="hidden lg:block text-body text-zinc-400 truncate">{projeto?.name || '—'}</span>

              {/* Prioridade: coluna própria (escaneável de cima a baixo) */}
              <span className="hidden md:flex">
                <PrioridadeBadge prioridade={t.priority} plano />
              </span>

              {/* Régua única de prazo; rótulo curto onde a coluna é estreita. */}
              <span className="flex justify-end lg:hidden"><PrazoBadge dueDate={t.dueDate} status={feita ? 'done' : t.status} variante="compacto" /></span>
              <span className="hidden lg:flex justify-end"><PrazoBadge dueDate={t.dueDate} status={feita ? 'done' : t.status} /></span>

              {/* Ações rápidas (desktop), sempre visíveis. */}
              <div onClick={e => e.stopPropagation()} className="hidden md:flex items-center justify-end gap-0.5">
                {!feita && (
                  <>
                    <button type="button" aria-label={`Concluir ${t.title || 'tarefa'}`} title="Concluir" className={BOTAO_ACAO} onClick={() => onUpdateTask({ id: t.id, status: 'done' })}>
                      <Check size={15} aria-hidden />
                    </button>
                    <div>
                      <DatePicker
                        value={t.dueDate || ''}
                        align="right"
                        disableAutoScroll
                        disablePast
                        onChange={date => onUpdateTask({ id: t.id, dueDate: date || undefined })}
                        trigger={
                          <button type="button" aria-label={`Adiar ${t.title || 'tarefa'}`} title="Adiar" className={BOTAO_ACAO}>
                            <Calendar size={15} aria-hidden />
                          </button>
                        }
                      />
                    </div>
                    <div>
                      <AssigneePicker
                        value={t.assigneeId}
                        onChange={id => { if (id && id !== t.assigneeId) onUpdateTask({ id: t.id, assigneeId: id }); }}
                        trigger={
                          <button type="button" aria-label={`Reatribuir ${t.title || 'tarefa'}`} title="Reatribuir" className={BOTAO_ACAO}>
                            <UserRound size={15} aria-hidden />
                          </button>
                        }
                      />
                    </div>
                    <div>
                      <DatePicker
                        value={t.reminderDate || ''}
                        align="right"
                        disableAutoScroll
                        enableTime
                        onChange={date => onUpdateTask({ id: t.id, reminderDate: date || undefined })}
                        onQuickAdd={() => onUpdateTask({ id: t.id, reminderDate: `${somarDias(1)}T09:00` })}
                        trigger={
                          <button
                            type="button"
                            aria-label={t.reminderDate ? 'Lembrete ativo: editar' : 'Criar lembrete'}
                            title={t.reminderDate ? 'Lembrete ativo' : 'Criar lembrete'}
                            className={t.reminderDate ? `${BOTAO_ACAO_BASE} text-amber-400` : BOTAO_ACAO}
                          >
                            <Bell size={15} className={t.reminderDate ? 'fill-amber-400' : ''} aria-hidden />
                          </button>
                        }
                      />
                    </div>
                  </>
                )}
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

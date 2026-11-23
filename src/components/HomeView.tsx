import React from 'react';
import {
  CheckCircle2, AlertTriangle, Calendar, Layers, ArrowRight, ArrowUpRight, ArrowUp, ArrowDown, Equal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Task, Project, Label } from '../types';
import { temResponsavel } from '../lib/responsaveis';
import MinhasTarefasQuadro, { separarTarefas, AbaTarefas, FiltroStatus } from './MinhasTarefasQuadro';
import KpiCard, { LINK_KPI as LINK, BOTAO_KPI } from './KpiCard';
import MeusProjetosQuadro from './MeusProjetosQuadro';
import { PainelNotificacoes } from './NotificacoesMenu';
import { Sparkline, BarraStatus, SegmentoStatus } from './HomeGraficos';
import { hojeLocal, somarDias, inicioDaSemana } from '../lib/datas';

interface HomeViewProps {
  tasks?: Task[];
  projects?: Project[];
  labels?: Label[];
  onUpdateTask?: (updates: Partial<Task> & { id: string }) => void;
  onSelectTask?: (task: Task) => void;
  /** Criação de tarefa (estado vazio da tabela). O CTA principal fica no header do app. */
  onNewTask?: () => void;
  /** Abre um projeto de Marketing. Sem ela (sem permissão), "Meus projetos" não aparece. */
  onAbrirProjeto?: (projetoId: string) => void;
  /** "Ver todas" das notificações → Caixa de entrada. */
  onOpenInbox?: () => void;
}

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';

const SEMANAS = 8;
const DIA_MS = 864e5;
const LINHAS_VISIVEIS = 8;

function saudacao(hora: number) {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const concluida = (t: Task) => t.status === 'done' || t.status === 'implementation';
const dataLocal = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Momentos em que a tarefa chegou em implementação/concluído. */
function datasDeConclusao(t: Task): string[] {
  if (t.statusHistory && t.statusHistory.length > 0) {
    return t.statusHistory
      .filter(h => h.status === 'implementation' || h.status === 'done')
      .map(h => h.enteredAt);
  }
  // Tarefas antigas, sem histórico mapeado.
  const datas: string[] = [];
  if (t.timeTracking?.reachedImplementationAt) datas.push(t.timeTracking.reachedImplementationAt);
  else if (concluida(t)) {
    const d = t.updatedAt || t.createdAt;
    if (d) datas.push(d);
  }
  return datas;
}

export default function HomeView({
  tasks = [],
  projects = [],
  labels = [],
  onUpdateTask = () => {},
  onSelectTask = () => {},
  onNewTask,
  onAbrirProjeto,
  onOpenInbox,
}: HomeViewProps) {
  const { currentUser } = useAuth();
  const [aba, setAba] = React.useState<AbaTarefas | null>(null);
  const [filtroStatus, setFiltroStatus] = React.useState<FiltroStatus | null>(null);
  const quadroRef = React.useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------
  // Datas
  // ---------------------------------------------------------------------
  const agora = new Date();
  const hoje = hojeLocal();
  const amanha = somarDias(1);
  const dataExtenso = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dataExtensoFmt = dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1);
  const primeiroNome = currentUser?.name?.trim().split(/\s+/)[0];

  // ---------------------------------------------------------------------
  // Agregações (mesmas regras de antes)
  // ---------------------------------------------------------------------
  const myTasks = tasks.filter(t => !!currentUser && temResponsavel(t, currentUser.id));
  const { proximas, atrasadas, concluidas } = separarTarefas(myTasks);

  // Concluídas por semana (segunda a domingo), das 8 últimas. Uma tarefa conta
  // uma vez por semana, mesmo que tenha ido e voltado de implementação.
  const inicioSemanaAtual = inicioDaSemana(agora);
  const inicioSerie = new Date(inicioSemanaAtual);
  inicioSerie.setDate(inicioSerie.getDate() - 7 * (SEMANAS - 1));
  const porSemana = new Array(SEMANAS).fill(0);
  for (const t of myTasks) {
    const semanas = new Set<number>();
    for (const iso of datasDeConclusao(t)) {
      const idx = Math.floor((new Date(iso).getTime() - inicioSerie.getTime()) / (7 * DIA_MS));
      if (idx >= 0 && idx < SEMANAS) semanas.add(idx);
    }
    semanas.forEach(i => { porSemana[i]++; });
  }
  const rotulosSemana = porSemana.map((_, i) => {
    const d = new Date(inicioSerie);
    d.setDate(d.getDate() + 7 * i);
    return `semana de ${ddmm(d)}`;
  });
  const concluidasSemana = porSemana[SEMANAS - 1];
  const variacao = concluidasSemana - porSemana[SEMANAS - 2];

  const emAberto = proximas.length + atrasadas.length;
  const noPrazo = proximas.length;
  const vencemHoje = proximas.filter(t => t.dueDate?.slice(0, 10) === hoje).length;
  const vencemAmanha = proximas.filter(t => t.dueDate?.slice(0, 10) === amanha).length;
  const abertas = [...atrasadas, ...proximas];
  const emAndamento = abertas.filter(t => t.status === 'in_progress' || t.status === 'rework').length;
  const emAprovacao = abertas.filter(t => t.status === 'approval').length;
  const pausadas = abertas.filter(t => t.status === 'paused').length;
  const naoIniciadas = abertas.filter(t => t.status === 'todo' || t.status === 'no_forecast').length;
  const diasAtrasoMaisAntiga = atrasadas[0]?.dueDate
    ? Math.round((dataLocal(hoje).getTime() - dataLocal(atrasadas[0].dueDate).getTime()) / DIA_MS)
    : 0;

  // Escala do acento para o que anda, neutros para o que está parado.
  const segmentos: (SegmentoStatus & { filtro?: FiltroStatus })[] = [
    { id: 'andamento', label: 'Em andamento', valor: emAndamento, cor: 'var(--color-blue-500)' },
    { id: 'aprovacao', label: 'Em aprovação', valor: emAprovacao, cor: 'var(--color-blue-300)', filtro: { status: 'approval', label: 'Em aprovação' } },
    { id: 'pausadas', label: 'Pausadas', valor: pausadas, cor: 'var(--color-zinc-500)' },
    { id: 'nao-iniciadas', label: 'Não iniciadas', valor: naoIniciadas, cor: 'var(--color-zinc-700)' },
  ];

  const irParaTabela = () => {
    requestAnimationFrame(() => quadroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  const abrirAba = (a: AbaTarefas) => { setFiltroStatus(null); setAba(a); irParaTabela(); };
  const filtrar = (f: FiltroStatus) => { setFiltroStatus(f); irParaTabela(); };

  const Comparativo = () => {
    if (variacao === 0) {
      return <span className="inline-flex items-center gap-1 text-caption text-zinc-400"><Equal size={12} aria-hidden /> Igual à semana passada</span>;
    }
    const melhor = variacao > 0;
    const n = Math.abs(variacao);
    return (
      <span className={`inline-flex items-center gap-1 text-caption font-medium ${melhor ? 'text-emerald-400' : 'text-red-400'}`}>
        {melhor ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
        {n} a {melhor ? 'mais' : 'menos'} que a semana passada
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-[#08080a] view-pad text-zinc-200 scrollbar-minimal">
      <div className="max-w-[1600px] w-full mx-auto flex flex-col view-gap">

        {/* 1. Saudação + data. O CTA único ("+ Novo") vive no header do app. */}
        <header className="min-w-0">
          <p className="text-caption text-zinc-400">{dataExtensoFmt}</p>
          <h1 className="mt-0.5 text-title font-semibold text-zinc-100 truncate">
            {saudacao(agora.getHours())}{primeiroNome ? `, ${primeiroNome}` : ''}
          </h1>
        </header>

        {/* 2. Indicadores: mesma altura, mesmo padding, atrasadas primeiro. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 view-gap-sm">

          <KpiCard
            icone={AlertTriangle}
            titulo="Atrasadas"
            alerta={atrasadas.length > 0}
            rodape={atrasadas.length > 0 ? (
              <button
                type="button"
                onClick={() => abrirAba('atrasadas')}
                className={BOTAO_KPI}
              >
                Revisar atrasadas <ArrowRight size={14} aria-hidden />
              </button>
            ) : (
              <span className="text-caption text-zinc-400">Nada vencido</span>
            )}
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={`text-metric font-semibold tabular-nums ${atrasadas.length > 0 ? 'text-red-400' : 'text-zinc-50'}`}>{atrasadas.length}</span>
              {atrasadas.length > 0 && (
                <span className="text-caption text-zinc-400 truncate">
                  mais antiga há <span className="tabular-nums">{diasAtrasoMaisAntiga}</span> {diasAtrasoMaisAntiga === 1 ? 'dia' : 'dias'}
                </span>
              )}
            </div>
          </KpiCard>

          <KpiCard
            icone={Calendar}
            titulo="Vencem hoje"
            rodape={
              <button type="button" onClick={() => abrirAba('proximas')} className={LINK}>
                Ver próximas <ArrowRight size={12} aria-hidden />
              </button>
            }
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-metric font-semibold tabular-nums text-zinc-50">{vencemHoje}</span>
              <span className="text-caption text-zinc-400 truncate">
                <span className="tabular-nums">{vencemAmanha}</span> {vencemAmanha === 1 ? 'vence' : 'vencem'} amanhã
              </span>
            </div>
          </KpiCard>

          <KpiCard
            icone={Layers}
            titulo="Em aberto"
            rodape={
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {segmentos.map(s => (
                  <li key={s.id} className="inline-flex items-center gap-1.5 text-caption">
                    <span className="size-2 rounded-full shrink-0" style={{ background: s.cor }} aria-hidden />
                    {s.filtro && s.valor > 0 ? (
                      <button
                        type="button"
                        onClick={() => filtrar(s.filtro!)}
                        className={`rounded text-zinc-200 underline decoration-zinc-500 underline-offset-2 hover:text-zinc-50 hover:decoration-zinc-300 transition-colors ${FOCO}`}
                      >
                        {s.label} <span className="tabular-nums font-medium">{s.valor}</span>
                      </button>
                    ) : (
                      <span className="text-zinc-400">{s.label} <span className="tabular-nums font-medium text-zinc-200">{s.valor}</span></span>
                    )}
                  </li>
                ))}
              </ul>
            }
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-metric font-semibold tabular-nums text-zinc-50">{emAberto}</span>
              <span className="text-caption text-zinc-400 truncate">
                <span className="tabular-nums">{noPrazo}</span> no prazo
              </span>
            </div>
            <BarraStatus segmentos={segmentos} />
          </KpiCard>

          <KpiCard
            icone={CheckCircle2}
            titulo="Concluídas na semana"
            acao={
              <button type="button" onClick={() => abrirAba('concluidas')} aria-label="Ver concluídas" title="Ver concluídas" className={`size-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition ${EASE} ${FOCO}`}>
                <ArrowUpRight size={15} aria-hidden />
              </button>
            }
            rodape={<Comparativo />}
          >
            <div className="flex items-end gap-4 min-w-0">
              <span className="text-metric font-semibold tabular-nums text-zinc-50">{concluidasSemana}</span>
              <div className="flex-1 min-w-0 max-w-[160px] ml-auto">
                <Sparkline
                  valores={porSemana}
                  rotulos={rotulosSemana}
                  altura={36}
                  descricao={`Concluídas por semana, últimas ${SEMANAS}: ${porSemana.join(', ')}`}
                />
              </div>
            </div>
          </KpiCard>
        </div>

        {/* 3. Minhas tarefas em largura total */}
        <div ref={quadroRef} className="min-w-0 scroll-mt-4">
          <MinhasTarefasQuadro
            proximas={proximas}
            atrasadas={atrasadas}
            concluidas={concluidas}
            projects={projects}
            labels={labels}
            onSelectTask={onSelectTask}
            onUpdateTask={onUpdateTask}
            aba={aba}
            onAbaChange={setAba}
            onNovaTarefa={onNewTask}
            filtroStatus={filtroStatus}
            onLimparFiltro={() => setFiltroStatus(null)}
            limiteLinhas={LINHAS_VISIVEIS}
          />
        </div>

        {/* 4. Meus projetos (2/3) + Notificações (1/3). Sem projetos, o
            wrapper fica vazio (`empty:hidden`) e Notificações ocupa a linha. */}
        <div className="flex flex-col lg:flex-row items-stretch view-gap-sm">
          <div className="min-w-0 lg:flex-[2] empty:hidden">
            {onAbrirProjeto && <MeusProjetosQuadro tasks={tasks} projects={projects} onAbrirProjeto={onAbrirProjeto} />}
          </div>
          <PainelNotificacoes
            className="min-w-0 lg:flex-1"
            tasks={tasks}
            onSelectTask={onSelectTask}
            onOpenInbox={onOpenInbox}
          />
        </div>
      </div>
    </div>
  );
}

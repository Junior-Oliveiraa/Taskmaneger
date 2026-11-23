// Cronograma das tarefas (semana ou mês), agrupado em seções recolhíveis: à
// esquerda título, prazo e status; à direita a barra do início ao prazo. O
// preenchido da barra é o avanço do status; o atraso aparece no prazo e na tampa.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, Inbox, MoreHorizontal, Plus } from 'lucide-react';
import type { Label, Project, Task, TaskStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDesfazer } from '../hooks/useDesfazer';
import { casaBusca, usePrefsLista } from '../hooks/usePrefsLista';
import { limiteDoProjeto, useMarketingProjetos } from '../lib/marketingProjetos';
import {
  barraDaTarefa, deIso, diasDaJanela, inicioDaTarefa, moverJanela, noCronograma, progressoDaTarefa, rotuloJanela,
  rotuloPrazoCurto, situacaoDoStatus, somarIso, statusAnterior, trechoNaJanela, type BarraCronograma, type ModoCronograma, type SituacaoCronograma,
} from '../lib/cronograma';
import { hojeLocal } from '../lib/datas';
import { dataInicio, mudancasDeDatas } from '../lib/dataInicio';
import { pedirJustificativa } from './JustificarDatas';
import { compararUrgencia, formatarDataExtensaCurta, getDueState, tooltipPrazo } from '../lib/prazo';
import { idsResponsaveis } from '../lib/responsaveis';
import { getHolidays } from '../utils/holidays';
import ConfirmModal from './ConfirmModal';
import BarraDoCronograma from './cronograma/Barra';
import { MenuTarefa, NovaTarefa, Reagendar, type Ponto } from './cronograma/Flutuantes';
import { FOCO } from './lista/ListaBarra';
import { IconePrioridade, PRIORIDADE_INFO, STATUS_INFO, TipoIcone } from './TarefaBadges';

type Agrupar = 'projeto' | 'empreendimento' | 'nenhum';
const AGRUPAR: { id: Agrupar; rotulo: string }[] = [
  { id: 'projeto', rotulo: 'Projeto' }, { id: 'empreendimento', rotulo: 'Empreendimento' },
  { id: 'nenhum', rotulo: 'Nenhum' },
];

interface Props {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  onSelectTask: (task: Task) => void;
  /** Resolve quando a tarefa existe no banco (para ligar ao projeto). */
  onAddTask: (task: Task) => Promise<unknown> | void;
  onUpdateTask: (updates: Partial<Task> & { id: string }) => void;
  onDeleteTask: (id: string) => void;
  /** As vistas (Lista, Kanban, Cronograma), para a barra única. */
  /** Vistas dentro da barra (opcional; nas telas de tarefas elas ficam no cabeçalho). */
  abas?: (soIcones: boolean) => React.ReactNode;
  /** Filtro ligado pelo chip "atrasadas" do cabeçalho. */
  soAtrasadas?: boolean;
  onSoAtrasadas?: (v: boolean) => void;
  currentProjectFilter: string | null;
  socialMediaFilter?: boolean;
  setSocialMediaFilter?: (val: boolean) => void;
  /** Restringe as pessoas do filtro de responsáveis (Minhas tarefas). */
  usuariosFiltro?: string[];
  podeEditar?: boolean;
}

interface Item { task: Task; barra: BarraCronograma | null }
interface Grupo {
  id: string;
  chave: string;
  rotulo: string;
  cor?: React.ReactNode;
  itens: Item[];
  /** Tarefas do grupo (concluídas inclusive) e o avanço médio, para o anel. */
  total: number;
  concluidas: number;
  progresso: number;
}
/** Onde a nova tarefa nasce. */
interface Criacao { ponto: Ponto; data: string; projeto?: string; empreendimento?: string }

const MARCA = 'size-2.5 shrink-0 rounded-[3px]';
const LARGURA_DIA: Record<ModoCronograma, number> = { semana: 88, mes: 26 };
const LEGENDA: { situacao: SituacaoCronograma; feito: string; rotulo: string }[] = [
  { situacao: 'ativa', feito: '0%', rotulo: 'A fazer' },
  { situacao: 'ativa', feito: '50%', rotulo: 'Em andamento (preenchido = avanço)' },
  { situacao: 'concluida', feito: '100%', rotulo: 'Concluída' },
  { situacao: 'pausada', feito: '50%', rotulo: 'Pausada' },
];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LINHA = 'h-9 [@media(pointer:coarse)]:h-11';
const ZOOMS = [1, 1.5, 2, 3] as const;
/** Larguras da coluna da esquerda conforme a tela. */
function colunasDe(largura: number) {
  if (largura >= 1360) return { titulo: 312, prazo: 112, status: 132 };
  if (largura >= 1100) return { titulo: 264, prazo: 112, status: 132 };
  if (largura >= 760) return { titulo: 208, prazo: 108, status: 40 };
  return { titulo: 132, prazo: 0, status: 36 };
}
const pctTexto = (p: number) => `${Math.round(p * 100)}%`;

/** Preferência simples, só deste navegador. */
function usePreferencia<T extends string>(chave: string, opcoes: readonly T[], padrao: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try { const v = localStorage.getItem(chave) as T; return opcoes.includes(v) ? v : padrao; } catch { return padrao; }
  });
  return [valor, v => { setValor(v); try { localStorage.setItem(chave, v); } catch { /* vale só nesta sessão */ } }];
}

/** Grupos recolhidos, por usuário, neste navegador. */
function useRecolhidos(usuario: string): [string[], (chave: string) => void] {
  const chaveLocal = `orbit:cronograma:recolhidos:${usuario}`;
  const [lista, setLista] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(chaveLocal) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
  });
  return [lista, chave => setLista(atual => {
    const nova = atual.includes(chave) ? atual.filter(x => x !== chave) : [...atual, chave];
    try { localStorage.setItem(chaveLocal, JSON.stringify(nova)); } catch { /* vale só nesta sessão */ }
    return nova;
  })];
}

export default function CronogramaView({
  tasks: recebidas, projects, labels, onSelectTask, onAddTask, onUpdateTask, onDeleteTask, currentProjectFilter,
  abas, soAtrasadas = false, onSoAtrasadas, socialMediaFilter, setSocialMediaFilter, usuariosFiltro, podeEditar = true,
}: Props) {
  const { allUsers, currentUser } = useAuth();
  const { limiteDaTarefa, projetoDaTarefa, vincularTarefa } = useMarketingProjetos();
  const minhas = !!usuariosFiltro;
  const { prefs, mudarPrefs, casaFiltros, projetos } = usePrefsLista(projects, minhas, false);
  const hoje = hojeLocal();
  const prazoAdmin = Number(currentUser?.permissionLevel) === 1;

  const [modo, setModo] = usePreferencia<ModoCronograma>('cronograma.modo', ['semana', 'mes'], 'mes');
  const [agrupar, setAgrupar] = usePreferencia<Agrupar>('cronograma.agruparPor', ['projeto', 'empreendimento', 'nenhum'], 'projeto');
  const [referencia, setReferencia] = useState(hoje);
  const [recolhidos, alternar] = useRecolhidos(currentUser?.id ?? 'anon');
  const [busca, setBusca] = useState('');
  const responsavelPadrao = minhas ? currentUser?.id || 'all' : 'all';
  const [responsavel, setResponsavel] = useState<string>(currentUser?.id || 'all');
  const [filtroStatus, setFiltroStatus] = useState<TaskStatus[]>([]);
  const [zoom, setZoom] = useState<number>(1);
  const [menu, setMenu] = useState<{ task: Task; ponto: Ponto } | null>(null);
  const [criacao, setCriacao] = useState<Criacao | null>(null);
  const [reagendando, setReagendando] = useState<{ task: Task; ponto: Ponto } | null>(null);
  const [excluindo, setExcluindo] = useState<Task | null>(null);
  /** Aviso sem desfazer (link copiado, tarefa criada). */
  const [aviso, setAviso] = useState<{ texto: string; abrir?: Task } | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avisar = (texto: string, abrir?: Task) => {
    clearTimeout(avisoTimer.current);
    setAviso({ texto, abrir });
    avisoTimer.current = setTimeout(() => setAviso(null), 4000);
  };
  /** Datas em arraste (prévia; só grava ao soltar). */
  const [arraste, setArraste] = useState<{ id: string; startDate?: string; dueDate?: string } | null>(null);
  /** O clique que encerra um arraste não pode abrir a tarefa. */
  const arrastou = useRef(false);

  // ─── Desfazer ──────────────────────────────────────────────────────
  // Arrastar, concluir e excluir aparecem na hora e só gravam depois da janela.
  const { pendente, agendar, desfazer } = useDesfazer(p => {
    if (!p.updates) { onDeleteTask(p.id); return; }
    const t = recebidas.find(x => x.id === p.id);
    const mudou = Object.entries(p.updates).filter(([k, v]) => t?.[k as keyof Task] !== v);
    if (t && mudou.length) onUpdateTask({ id: p.id, ...Object.fromEntries(mudou) });
  });
  const tasks = !pendente ? recebidas
    : pendente.updates ? recebidas.map(t => t.id !== pendente.id ? t : {
        ...t, ...pendente.updates,
        // Prévia do histórico, para Pausado herdar o avanço certo.
        ...(pendente.updates.status ? { statusHistory: [...(t.statusHistory ?? []), { status: t.status, enteredAt: hoje }] } : {}),
      })
    : recebidas.filter(t => t.id !== pendente.id);

  // Larguras reais: definem as colunas e se o título cabe na barra.
  const raiz = useRef<HTMLDivElement>(null);
  const tabela = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ tela: 1200, tabela: 0 });
  useLayoutEffect(() => {
    if (!raiz.current || !tabela.current) return;
    const medir = () => {
      const tela = raiz.current?.clientWidth ?? 0, larg = tabela.current?.clientWidth ?? 0;
      setMedida(m => m.tela === tela && m.tabela === larg ? m : { tela, tabela: larg });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(raiz.current);
    obs.observe(tabela.current);
    return () => obs.disconnect();
  }, []);

  // As atrasadas são listadas a partir de hoje.
  useEffect(() => { if (soAtrasadas) setReferencia(hojeLocal()); }, [soAtrasadas]);

  const dias = diasDaJanela(modo, referencia);
  const n = dias.length;
  const indiceHoje = dias.indexOf(hoje);
  const feriados = new Map<string, ReturnType<typeof getHolidays>[number]>([...new Set(dias.map(d => Number(d.slice(0, 4))))].flatMap(ano =>
    getHolidays(ano).map(f => [`${ano}-${f.date}`, f] as [string, typeof f])));

  const ordenados = currentUser ? [currentUser, ...allUsers.filter(u => u.id !== currentUser.id)] : allUsers;
  const pessoas = usuariosFiltro ? ordenados.filter(u => usuariosFiltro.includes(u.id)) : ordenados;

  // ─── Tarefas ───────────────────────────────────────────────────────
  // Concluídas entram no anel do grupo mesmo quando ocultas na lista.
  const doFiltro = tasks.filter(t => {
    if (!noCronograma(t)) return false;
    if (currentProjectFilter && t.projectId !== currentProjectFilter) return false;
    if (responsavel !== 'all' && !idsResponsaveis(t).includes(responsavel)) return false;
    if (filtroStatus.length && !filtroStatus.includes(t.status)) return false;
    if (soAtrasadas && !getDueState(t.dueDate, t.status, hoje).daysLate) return false;
    return casaFiltros(t) && casaBusca(t, busca);
  });
  const comArraste = (t: Task): Task => arraste?.id === t.id ? { ...t, ...arraste } : t;
  const itens: Item[] = doFiltro
    .filter(t => t.status !== 'done' || prefs.mostrarConcluidas)
    .map(task => ({ task, barra: barraDaTarefa(task, dias, hoje) }))
    .filter(i => i.barra)
    .sort((a, b) => compararUrgencia(a.task, b.task));

  const grupos: Grupo[] = (() => {
    const marca = (cor: string) => <span aria-hidden className={MARCA} style={{ backgroundColor: cor }} />;
    const projetoDe = new Map(projetos.map(p => [p.id, p]));
    const idDoGrupo = (t: Task): string => {
      const projeto = projetoDe.get(projetoDaTarefa[t.id]);
      if (agrupar === 'projeto') return projeto?.id ?? '';
      if (agrupar === 'empreendimento') return projects.some(p => p.id === t.projectId) ? t.projectId : '';
      return '';
    };
    const base: { id: string; rotulo: string; cor?: React.ReactNode }[] =
      agrupar === 'projeto' ? [...projetos.map(p => ({ id: p.id, rotulo: p.nome, cor: marca(p.cor) })), { id: '', rotulo: 'Sem projeto' }]
      : agrupar === 'empreendimento' ? [...projects.map(p => ({ id: p.id, rotulo: p.name, cor: <span aria-hidden className={`${MARCA} bg-current ${p.color}`} /> })), { id: '', rotulo: 'Sem empreendimento' }]
      : [{ id: '', rotulo: 'Tarefas' }];
    return base.map(g => {
      const todas = doFiltro.filter(t => idDoGrupo(t) === g.id);
      return {
        id: g.id, chave: `${agrupar}:${g.id}`, rotulo: g.rotulo, cor: g.cor,
        itens: itens.filter(i => idDoGrupo(i.task) === g.id),
        total: todas.length, concluidas: todas.filter(t => t.status === 'done').length,
        progresso: todas.length ? todas.reduce((s, t) => s + progressoDaTarefa(t), 0) / todas.length : 0,
      };
    }).filter(g => g.itens.length > 0);
  })();

  // ─── Programar arrastando ──────────────────────────────────────────
  // Ponta esquerda = início; ponta direita = prazo; meio = as duas datas. O prazo
  // segue a regra de dentro da tarefa: só o admin muda direto; os demais justificam.
  const gravar = async (t: Task, datas: { startDate?: string; dueDate?: string }) => {
    const u: Partial<Task> = {};
    if (datas.startDate && dataInicio.ativa && datas.startDate !== t.startDate?.slice(0, 10)) u.startDate = datas.startDate;
    if (datas.dueDate && datas.dueDate !== t.dueDate?.slice(0, 10)) u.dueDate = datas.dueDate;
    if (!Object.keys(u).length) return;
    const inicio = u.startDate ?? t.startDate?.slice(0, 10), prazo = u.dueDate ?? t.dueDate!.slice(0, 10);
    const texto = inicio && inicio < prazo ? `${formatarDataExtensaCurta(inicio, hoje)} a ${formatarDataExtensaCurta(prazo, hoje)}` : formatarDataExtensaCurta(prazo, hoje);
    // Data já definida só muda com justificativa; pedida na hora, antes da janela de desfazer.
    const mudancas = mudancasDeDatas(t, u);
    if (mudancas.length) {
      const motivo = await pedirJustificativa(t.title, mudancas);
      if (!motivo) return;
      u.justificativaData = motivo;
    }
    agendar({ id: t.id, updates: u, mensagem: `Reagendada: ${texto}` });
  };
  const limitar = (t: Task, data: string) => {
    const limite = limiteDaTarefa(t.id)?.data;
    return limite && data > limite ? limite : data;
  };
  const naJanela = (d: string) => d < dias[0] ? dias[0] : d > dias[n - 1] ? dias[n - 1] : d;
  const pedirPrazo = (t: Task) => {
    onSelectTask(t);
    setTimeout(() => window.dispatchEvent(new CustomEvent('openTaskSection', { detail: { section: 'deadline', targetId: 'deadline' } })), 100);
  };

  /** Segue o ponteiro até soltar (grava) ou cancelar/Esc (descarta). */
  const acompanhar = (e: React.PointerEvent, t: Task, calcular: (x: number) => { startDate?: string; dueDate?: string }) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    let datas: { startDate?: string; dueDate?: string } | null = null;
    const mover = (ev: PointerEvent) => {
      // Tremor de clique não é arraste.
      if (!datas && Math.abs(ev.clientX - x0) < 5) return;
      const nova = calcular(ev.clientX);
      arrastou.current = true;
      // Só redesenha ao trocar de dia.
      if (datas && datas.startDate === nova.startDate && datas.dueDate === nova.dueDate) return;
      datas = nova;
      setArraste({ id: t.id, ...datas });
    };
    const terminar = (salvar: boolean) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      window.removeEventListener('keydown', tecla, true);
      setArraste(null);
      if (salvar && datas) gravar(t, datas);
      // Depois do clique que o navegador ainda vai disparar.
      setTimeout(() => { arrastou.current = false; }, 0);
    };
    const soltar = () => terminar(true);
    const cancelar = () => terminar(false);
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); terminar(false); } };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
    window.addEventListener('keydown', tecla, true);
  };

  const iniciarArraste = (e: React.PointerEvent, t: Task, b: BarraCronograma, parte: 'inicio' | 'fim' | 'tudo') => {
    const area = e.currentTarget.closest('[data-trilho]');
    if (!area) return;
    e.stopPropagation();
    const largura = area.getBoundingClientRect().width / n;
    const x0 = e.clientX;
    acompanhar(e, t, x => {
      const d = Math.round((x - x0) / largura);
      if (parte === 'inicio') {
        const novo = naJanela(somarIso(b.inicio, d));
        return { startDate: novo > b.prazo ? b.prazo : novo };
      }
      if (parte === 'fim') {
        const novo = limitar(t, naJanela(somarIso(b.prazo, d)));
        return { dueDate: b.programado && novo < b.inicio ? b.inicio : novo };
      }
      // Barra inteira: mantém a duração e para no limite do projeto.
      const prazo = limitar(t, somarIso(b.prazo, d));
      const passo = Math.round((deIso(prazo).getTime() - deIso(b.prazo).getTime()) / 864e5);
      const inicio = somarIso(b.inicio, passo);
      return prazo < dias[0] || inicio > dias[n - 1] ? { startDate: b.inicio, dueDate: b.prazo } : { startDate: inicio, dueDate: prazo };
    });
  };

  // ─── Ações da tarefa ───────────────────────────────────────────────
  const mudarStatus = (t: Task, status: TaskStatus) => {
    if (t.status === status) return;
    agendar({ id: t.id, updates: { status }, mensagem: status === 'done' ? 'Tarefa concluída' : `Status: ${STATUS_INFO[status].label}` });
  };
  const concluirOuReabrir = (t: Task) => {
    if (t.status !== 'done') { mudarStatus(t, 'done'); return; }
    const anterior = statusAnterior(t.statusHistory, 'done');
    mudarStatus(t, anterior === 'no_forecast' ? 'todo' : anterior);
  };
  const copiarLink = async (t: Task) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?tarefa=${t.id}`);
      avisar('Link copiado');
    } catch { avisar('Não foi possível copiar o link'); }
  };
  /** Cria e, se houver, liga ao projeto depois que a tarefa existe no banco. */
  const adicionar = (t: Task, projeto?: string) => {
    const salvo = onAddTask(t);
    if (projeto) vincularTarefa(t.id, projeto, Promise.resolve(salvo)).catch(() => avisar('A tarefa foi criada, mas não entrou no projeto'));
  };
  const duplicar = (t: Task) => {
    const copia = {
      id: crypto.randomUUID(), title: `${t.title} (cópia)`, description: t.description, status: 'todo', priority: t.priority,
      projectId: t.projectId, labels: t.labels, createdAt: hoje, startDate: t.startDate, dueDate: t.dueDate, assigneeId: t.assigneeId,
      isPrivate: t.isPrivate, updatedBy: currentUser?.id,
      subtasks: (t.subtasks ?? []).filter(s => !s.canceled).map(s => ({ ...s, id: crypto.randomUUID(), completed: false, completedAt: undefined, reminderDate: undefined, reminderType: undefined })),
      _isLocal: true,
    } as Task;
    adicionar(copia, projetoDaTarefa[t.id]);
    avisar('Tarefa duplicada', copia);
  };
  const criar = (titulo: string, data: string) => {
    if (!criacao) return;
    const nova = {
      id: crypto.randomUUID(), title: titulo, description: '', status: 'todo', priority: 'medium',
      projectId: criacao.empreendimento ?? currentProjectFilter ?? '',
      labels: [labels.find(l => l.name === 'Tarefa') || labels[0]].filter(Boolean), subtasks: [],
      createdAt: hoje, startDate: dataInicio.ativa ? data : undefined, dueDate: data, assigneeId: currentUser?.id, _isLocal: true,
    } as unknown as Task;
    adicionar(nova, criacao.projeto);
    setCriacao(null);
    avisar('Tarefa criada', nova);
  };
  const abrirMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    // Aberto por teclado, o evento não traz posição.
    const r = e.currentTarget.getBoundingClientRect();
    const ponto = e.type === 'click' ? { x: r.left, y: r.bottom + 4 } : e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.left + 24, y: r.bottom };
    setMenu({ task, ponto });
  };
  /** Clique num dia vazio do trilho. */
  const criarNoDia = (e: React.MouseEvent<HTMLElement>, destino: Pick<Criacao, 'projeto' | 'empreendimento'>) => {
    if (!podeEditar || arrastou.current || e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
    setCriacao({ ...destino, data: dias[i], ponto: { x: e.clientX, y: e.clientY + 8 } });
  };
  const destinoDaTarefa = (t: Task) => ({ projeto: projetos.some(p => p.id === projetoDaTarefa[t.id]) ? projetoDaTarefa[t.id] : undefined, empreendimento: t.projectId });
  const destinoDoGrupo = (g: Grupo) => ({
    projeto: agrupar === 'projeto' && g.id ? g.id : undefined,
    empreendimento: agrupar === 'empreendimento' && g.id ? g.id : undefined,
  });

  // ─── Render ────────────────────────────────────────────────────────
  const col = colunasDe(medida.tela);
  const larguraEsq = col.titulo + col.prazo + col.status;
  const larguraDia = LARGURA_DIA[modo];
  const trilhoMin = zoom === 1 ? n * larguraDia : Math.round(Math.max(n * larguraDia, medida.tela - larguraEsq) * zoom);
  const diaPx = Math.max(trilhoMin, medida.tabela - larguraEsq) / n;
  const grade: React.CSSProperties = { gridTemplateColumns: `${larguraEsq}px minmax(${trilhoMin}px, 1fr)` };
  const gradeEsq: React.CSSProperties = { gridTemplateColumns: [col.titulo, col.prazo, col.status].filter(Boolean).map(x => `${x}px`).join(' ') };
  const pct = (dia: number) => `${(dia / n) * 100}%`;
  const periodo = rotuloJanela(modo, dias);
  const rotuloStatus = col.status > 60;

  // O zoom mantém o meio da tela; sem rolagem, parte de hoje.
  const ancora = useRef<number | null>(null);
  const mudarZoom = (z: number) => {
    const el = raiz.current;
    const visivel = medida.tela - larguraEsq;
    if (el) ancora.current = el.scrollWidth > el.clientWidth ? (el.scrollLeft + visivel / 2) / (diaPx * n) : indiceHoje >= 0 ? (indiceHoje + 0.5) / n : 0;
    setZoom(z);
  };
  useLayoutEffect(() => {
    if (raiz.current && ancora.current !== null) raiz.current.scrollLeft = ancora.current * trilhoMin - (medida.tela - larguraEsq) / 2;
    ancora.current = null;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quando o período não cabe na tela, abre mostrando hoje.
  const mostrarHoje = () => {
    const el = raiz.current;
    const linha = el?.querySelector('[data-hoje]');
    if (!el) return;
    if (!linha) { el.scrollLeft = 0; return; }
    el.scrollLeft += linha.getBoundingClientRect().left - el.getBoundingClientRect().left - (el.clientWidth + larguraEsq) / 2;
  };
  useLayoutEffect(mostrarHoje, [modo, referencia, larguraEsq]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderLinha = (original: Task, info: BarraCronograma | null) => {
    const t = comArraste(original);
    const b = arraste?.id === t.id ? barraDaTarefa(t, dias, hoje) : info;
    const barra = b?.barra ?? null;
    const etiqueta = t.labels?.[0] ? labels.find(l => l.id === t.labels[0]?.id) : undefined;
    const feita = t.status === 'done';
    const st = STATUS_INFO[t.status] ?? STATUS_INFO.todo;
    const prio = PRIORIDADE_INFO[t.priority] ?? PRIORIDADE_INFO.no_priority;
    const situacao = situacaoDoStatus(t.status);
    const progresso = progressoDaTarefa(t);
    const atraso = b?.diasAtraso ?? 0;
    const nome = t.title || 'Sem título';
    const textoProgresso = `${pctTexto(progresso)} pronta`;
    const descricao = b ? [
      `${nome}: ${formatarDataExtensaCurta(b.inicio)}${b.programado ? '' : ' (início estimado)'} a ${formatarDataExtensaCurta(b.prazo)}`,
      st.label, feita ? '' : textoProgresso, atraso ? `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso` : '',
    ].filter(Boolean).join(', ') : '';
    const larguraBarra = barra ? barra.span * diaPx - 4 : 0;
    // ~6,8px por letra a 12px; com a seta de "começou antes", 14px a menos.
    const cabe = nome.length * 6.8 + 16 + (barra?.cortaEsq ? 14 : 0) <= larguraBarra;
    const cabeAtraso = !!barra && (n - barra.col - barra.span) * diaPx >= 44;
    const alca = `absolute z-[2] top-1/2 -translate-y-1/2 h-6 w-2.5 inline-flex items-center justify-center touch-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 ${FOCO}`;
    const sobra = barra ? (n - barra.col - barra.span) * diaPx : 0;
    return (
      <div key={t.id} role="row" data-tarefa={t.id} onContextMenu={e => abrirMenu(e, t)} className={`group relative grid ${LINHA} border-t cron-linha hover:bg-[var(--cron-linha)] transition-colors`} style={grade}>
        <div className="sticky left-0 z-[12] min-w-0 grid items-center bg-[#121214] group-hover:bg-[#161619] border-r cron-linha transition-colors" style={gradeEsq}>
          <div role="rowheader" className="min-w-0 flex items-center gap-2 pl-9 pr-3 max-[760px]:pl-3">
            <TipoIcone etiqueta={etiqueta} />
            <button type="button" onClick={() => onSelectTask(original)} title={t.title} className={`min-w-0 truncate text-left text-body font-medium rounded-sm ${FOCO} ${feita ? 'text-zinc-400 line-through' : 'text-zinc-100'}`}>{nome}</button>
            {prio.icon && (
              <span title={`Prioridade ${prio.label.toLowerCase()}`} className="shrink-0 text-zinc-400">
                <IconePrioridade prioridade={t.priority} size={13} /><span className="sr-only">Prioridade {prio.label.toLowerCase()}</span>
              </span>
            )}
            <button type="button" aria-label={`Ações de ${nome}`} aria-haspopup="menu" title="Ações" onClick={e => abrirMenu(e, t)} className={`ml-auto -mr-1.5 shrink-0 size-6 [@media(pointer:coarse)]:size-9 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(pointer:coarse)]:opacity-100 ${FOCO}`}><MoreHorizontal size={15} aria-hidden /></button>
          </div>
          {col.prazo > 0 && (
            <div role="cell" title={tooltipPrazo(t.dueDate)} className={`pr-3 text-right text-caption tabular-nums whitespace-nowrap ${atraso || getDueState(t.dueDate, t.status, hoje).daysLate ? 'text-red-400 font-medium' : 'text-zinc-400'}`}>
              {rotuloPrazoCurto(t.dueDate?.slice(0, 10), t.status, hoje)}
            </div>
          )}
          <div role="cell" title={`${st.label} · ${pctTexto(progresso)}`} className={`min-w-0 flex items-center gap-2 text-caption text-zinc-300 ${rotuloStatus ? 'pr-3' : 'justify-center'}`}>
            <AnelProgresso valor={progresso} situacao={situacao} />
            <span className={rotuloStatus ? 'truncate' : 'sr-only'}>{st.label}</span>
          </div>
        </div>
        <div
          role="cell"
          data-trilho
          title={podeEditar ? 'Clique num dia vazio para criar uma tarefa' : undefined}
          onClick={e => criarNoDia(e, destinoDaTarefa(original))}
          className={`relative min-w-0 overflow-hidden ${podeEditar ? 'cursor-copy' : ''}`}
        >
          {/* Venceu antes do período: a seta leva ao mês do prazo. */}
          {b && !barra && (
            <button type="button" onClick={() => setReferencia(b.prazo)} title={`Prazo em ${formatarDataExtensaCurta(b.prazo)}. Ir para esse período`} aria-label={`${descricao}. Ir para o período do prazo`} className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 px-1.5 inline-flex items-center gap-0.5 rounded-md text-caption font-medium tabular-nums text-red-400 hover:bg-[#1f1f23] ${FOCO}`}>
              <ChevronLeft size={14} aria-hidden />{atraso}d
            </button>
          )}
          {barra && (
            <div className="absolute inset-y-0 flex items-center px-0.5" style={{ left: pct(barra.col), width: pct(barra.span) }}>
              <button
                type="button"
                onClick={() => { if (arrastou.current) arrastou.current = false; else onSelectTask(original); }}
                onPointerDown={e => { if (podeEditar && prazoAdmin && !feita) iniciarArraste(e, original, b!, 'tudo'); }}
                title={descricao}
                aria-label={descricao}
                data-situacao={situacao}
                style={{ '--feito': pctTexto(progresso) } as React.CSSProperties}
                className={`cron-barra relative z-[1] w-full h-6 min-w-0 flex items-center overflow-hidden text-zinc-100 ${podeEditar && prazoAdmin && !feita ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:brightness-110 ${FOCO} ${barra.cortaEsq ? 'pl-0.5 border-l-0' : 'pl-2 rounded-l-md'} ${barra.cortaDir ? 'border-r-0' : 'rounded-r-md'}`}
              >
                {barra.cortaEsq && <ChevronLeft size={14} className="shrink-0" aria-hidden />}
                {cabe && <span className="text-caption font-medium whitespace-nowrap">{nome}</span>}
                {atraso > 0 && !barra.cortaDir && <span aria-hidden className="absolute -inset-y-px -right-px w-[3px] bg-[var(--cron-atraso)]" />}
              </button>
              {atraso > 0 && cabeAtraso && (
                <span aria-hidden className={`absolute left-full top-1/2 -translate-y-1/2 pl-1 text-caption font-medium tabular-nums text-red-400 whitespace-nowrap pointer-events-none ${podeEditar ? 'group-hover:opacity-0' : ''}`}>{atraso}d</span>
              )}
              {podeEditar && !barra.cortaDir && sobra >= 28 && (
                <button
                  type="button"
                  aria-label={`Nova tarefa depois de ${nome}`}
                  title="Nova tarefa em seguida"
                  onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCriacao({ ...destinoDaTarefa(original), data: somarIso(b!.prazo, 1), ponto: { x: r.left, y: r.bottom + 4 } }); }}
                  className={`absolute z-[2] left-full top-1/2 -translate-y-1/2 size-6 inline-flex items-center justify-center rounded-md border border-white/10 bg-[#1f1f23] text-zinc-300 hover:text-zinc-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${FOCO}`}
                ><Plus size={14} aria-hidden /></button>
              )}
              {podeEditar && !feita && !barra.cortaEsq && dataInicio.ativa && (
                <button
                  type="button"
                  aria-label={`Início de ${nome}: ${formatarDataExtensaCurta(b!.inicio)}. Arraste ou use as setas`}
                  title="Arraste para mudar o início"
                  onPointerDown={e => iniciarArraste(e, original, b!, 'inicio')}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                    e.preventDefault();
                    const novo = somarIso(b!.inicio, e.key === 'ArrowRight' ? 1 : -1);
                    if (novo <= b!.prazo) gravar(original, { startDate: novo });
                  }}
                  className={`${alca} left-0.5 rounded-l-md cursor-ew-resize`}
                >
                  <span className="h-3 w-0.5 rounded-full bg-zinc-100" aria-hidden />
                </button>
              )}
              {podeEditar && !feita && !barra.cortaDir && (
                <button
                  type="button"
                  aria-label={prazoAdmin ? `Prazo de ${nome}: ${formatarDataExtensaCurta(b!.prazo)}. Arraste ou use as setas` : `Pedir novo prazo para ${nome}`}
                  title={prazoAdmin ? 'Arraste para mudar o prazo' : 'Mudar o prazo (pede justificativa)'}
                  onPointerDown={e => { if (prazoAdmin) iniciarArraste(e, original, b!, 'fim'); }}
                  onClick={e => { e.stopPropagation(); if (!prazoAdmin) pedirPrazo(original); }}
                  onKeyDown={e => {
                    if (!prazoAdmin || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                    e.preventDefault();
                    const novo = limitar(original, somarIso(b!.prazo, e.key === 'ArrowRight' ? 1 : -1));
                    if (!b!.programado || novo >= b!.inicio) gravar(original, { dueDate: novo });
                  }}
                  className={`${alca} right-1 rounded-r-md ${prazoAdmin ? 'cursor-ew-resize' : 'cursor-pointer'}`}
                >
                  <span className="h-3 w-0.5 rounded-full bg-zinc-100" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  /** Cabeçalho do grupo, com a barra-resumo do menor início ao maior prazo. */
  const renderGrupo = (g: Grupo, primeiro: boolean) => {
    const fechado = recolhidos.includes(g.chave);
    const comPrazo = g.itens.map(i => i.task).filter(t => t.dueDate);
    const inicio = comPrazo.map(inicioDaTarefa).sort()[0];
    const fim = comPrazo.map(t => t.dueDate!.slice(0, 10)).sort().pop();
    const resumo = inicio && fim ? trechoNaJanela(inicio, fim, dias) : null;
    const { progresso } = g;
    const textoProgresso = `${pctTexto(progresso)} pronto: ${g.concluidas} de ${g.total} ${g.total === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`;
    return (
      <div key={g.chave} role="rowgroup" aria-label={g.rotulo}>
        <div role="row" className={`relative grid ${primeiro ? 'h-10' : 'h-14 pt-4'} [@media(pointer:coarse)]:min-h-12`} style={grade}>
          {/* Cobre o respiro acima, para o título não deixar passar a grade ao rolar de lado. */}
          <div role="rowheader" className={`sticky left-0 z-[12] min-w-0 bg-[#121214] border-r cron-linha ${primeiro ? '' : '-mt-4 pt-4'}`}>
            <button type="button" aria-expanded={!fechado} onClick={() => alternar(g.chave)} className={`w-full h-full grid items-center text-left ${FOCO}`} style={gradeEsq}>
              <span className={`min-w-0 flex items-center gap-2 pl-3 pr-3 ${col.prazo > 0 ? 'col-span-2' : ''}`}>
                <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform ${fechado ? '-rotate-90' : ''}`} aria-hidden />
                {g.cor}
                <span className="min-w-0 truncate text-heading font-semibold text-zinc-100">{g.rotulo}</span>
                <span className="text-caption tabular-nums text-zinc-400">{g.itens.length}</span>
              </span>
              <span title={textoProgresso} className={`min-w-0 flex items-center gap-2 text-caption tabular-nums text-zinc-300 ${rotuloStatus ? '' : 'justify-center'}`}>
                <AnelProgresso valor={progresso} situacao={progresso === 1 ? 'concluida' : 'ativa'} />
                {rotuloStatus && <span aria-hidden>{pctTexto(progresso)}</span>}
                <span className="sr-only">{textoProgresso}</span>
              </span>
            </button>
          </div>
          <div role="cell" onClick={e => criarNoDia(e, destinoDoGrupo(g))} title={podeEditar ? 'Clique num dia vazio para criar uma tarefa' : undefined} className={`relative min-w-0 overflow-hidden ${podeEditar ? 'cursor-copy' : ''}`}>
            {resumo && (
              <div aria-hidden title={`${formatarDataExtensaCurta(inicio)} a ${formatarDataExtensaCurta(fim!)}`} className="absolute top-1/2 -translate-y-1/2 h-3 px-0.5" style={{ left: pct(resumo.col), width: pct(resumo.span) }}>
                <div className="relative h-1.5 bg-[var(--cron-resumo)]">
                  {!resumo.cortaEsq && <span className="absolute left-0 top-0 h-3 w-1.5 bg-[var(--cron-resumo)] [clip-path:polygon(0_0,100%_0,100%_50%,0_100%)]" />}
                  {!resumo.cortaDir && <span className="absolute right-0 top-0 h-3 w-1.5 bg-[var(--cron-resumo)] [clip-path:polygon(0_0,100%_0,100%_100%,0_50%)]" />}
                </div>
              </div>
            )}
          </div>
        </div>
        {!fechado && g.itens.map(i => renderLinha(i.task, i.barra))}
      </div>
    );
  };

  const eixo = dias.map(d => {
    const data = deIso(d);
    const folga = data.getDay() === 0 || data.getDay() === 6;
    const feriado = feriados.get(d);
    const nome = `${DIAS[data.getDay()]}, ${data.getDate()} de ${data.toLocaleDateString('pt-BR', { month: 'long' })}${feriado ? ` · ${feriado.name}` : ''}`;
    const eHoje = d === hoje;
    return (
      <div key={d} role="columnheader" aria-label={nome} aria-current={eHoje ? 'date' : undefined} title={nome} className="flex-1 min-w-0 flex flex-col items-center">
        <span className={`text-caption ${eHoje ? 'text-blue-400 font-semibold' : 'text-zinc-400'}`}>{modo === 'semana' ? DIAS[data.getDay()] : DIAS[data.getDay()][0]}</span>
        <span className={`text-body tabular-nums ${eHoje ? 'text-blue-400 font-semibold' : folga ? 'text-zinc-400' : 'text-zinc-200'}`}>{data.getDate()}</span>
      </div>
    );
  });

  const nomeDoDestino = (c: Criacao) => projetos.find(p => p.id === c.projeto)?.nome ?? projects.find(p => p.id === c.empreendimento)?.name;
  const limiteDaCriacao = (c: Criacao) => {
    const projeto = projetos.find(p => p.id === c.projeto);
    const data = limiteDoProjeto(projeto);
    return projeto && data ? { data, projeto: projeto.nome } : null;
  };
  const limiteDe = (t: Task) => limiteDaTarefa(t.id);

  return (
    <div className="tela-cronograma relative flex-1 min-h-0 flex flex-col bg-[#08080a]">
      <div className="relative z-30 shrink-0 view-pad-x py-3">
        <div className="max-w-[1800px] mx-auto">
          <BarraDoCronograma
            larga={medida.tela >= 1480}
            abas={abas?.(medida.tela < 1480)}
            busca={busca}
            onBusca={setBusca}
            modo={modo}
            onModo={m => {
              // Do mês atual para a semana: abre a semana de hoje, não a do dia 1.
              if (m === 'semana' && indiceHoje >= 0) setReferencia(hoje);
              setModo(m);
            }}
            onMover={s => setReferencia(r => moverJanela(modo, r, s))}
            onHoje={() => { setReferencia(hoje); if (indiceHoje >= 0) mostrarHoje(); }}
            zoom={zoom}
            zooms={ZOOMS}
            onZoom={mudarZoom}
            agrupar={agrupar}
            opcoesAgrupar={AGRUPAR}
            onAgrupar={id => setAgrupar(id as Agrupar)}
            ocultarConcluidas={!prefs.mostrarConcluidas}
            onOcultarConcluidas={v => { mudarPrefs({ mostrarConcluidas: !v }); if (v) setFiltroStatus(f => f.filter(s => s !== 'done')); }}
            status={filtroStatus}
            onStatus={setFiltroStatus}
            prioridades={prefs.filtros.prioridades}
            onPrioridades={prioridades => mudarPrefs({ filtros: { ...prefs.filtros, prioridades } })}
            pessoas={pessoas}
            responsavel={responsavel}
            responsavelPadrao={responsavelPadrao}
            onResponsavel={setResponsavel}
            social={setSocialMediaFilter ? { ativo: !!socialMediaFilter, onMudar: setSocialMediaFilter } : undefined}
            atrasadas={{ ativo: soAtrasadas, onMudar: v => onSoAtrasadas?.(v) }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 view-pad-x pb-4">
        {/* O quadro é quem rola: cabeçalho, coluna esquerda e legenda ficam presos nele. */}
        <div ref={raiz} className="h-full max-w-[1800px] mx-auto overflow-auto scrollbar-minimal bg-[#121214] border cron-linha rounded-2xl">
        <div ref={tabela} role="table" aria-label={`Cronograma, ${periodo}`} className="relative min-h-full flex flex-col select-none" style={{ minWidth: larguraEsq + trilhoMin }}>
          <div role="row" className="sticky top-0 z-20 shrink-0 grid bg-[#121214] border-b cron-linha" style={grade}>
            <div className="sticky left-0 z-10 grid content-between pt-1.5 pb-1.5 bg-[#121214] border-r cron-linha text-caption text-zinc-400" style={gradeEsq}>
              <h2 aria-live="polite" title={periodo} className="col-span-full pl-3 pr-2 truncate text-heading font-semibold text-zinc-100 tabular-nums">{periodo}</h2>
              <span role="columnheader" className="pl-3">Título</span>
              {col.prazo > 0 && <span role="columnheader" className="pr-3 text-right">Prazo</span>}
              <span role="columnheader" className={rotuloStatus ? '' : 'sr-only'}>Status</span>
            </div>
            <div className="min-w-0 flex py-2">{eixo}</div>
          </div>

          <div className="relative flex-1">
            {/* Fins de semana e a linha de hoje, até o pé do quadro. */}
            <div aria-hidden className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: larguraEsq }}>
              {dias.map((d, i) => [0, 6].includes(deIso(d).getDay()) && <span key={d} className="absolute inset-y-0 bg-[var(--cron-fds)]" style={{ left: pct(i), width: pct(1) }} />)}
              {indiceHoje >= 0 && <span data-hoje className="absolute inset-y-0 w-px bg-[var(--cron-hoje)]" style={{ left: `round(down, ${pct(indiceHoje + 0.5)}, 1px)` }} />}
            </div>
            <div aria-hidden className="absolute inset-y-0 left-0 border-r cron-linha" style={{ width: larguraEsq }} />
            {grupos.map((g, i) => renderGrupo(g, i === 0))}
            {grupos.length === 0 && (
              <div className="sticky left-0 max-w-[100vw] p-12 short:p-6 flex flex-col items-center text-center">
                <Inbox size={22} className="mb-2 text-zinc-500" aria-hidden />
                <p className="text-body font-medium text-zinc-200">Nenhuma tarefa {modo === 'semana' ? 'nesta semana' : 'neste mês'}</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-[15] shrink-0 bg-[#121214] border-t cron-linha">
          <ul aria-label="Legenda" style={{ maxWidth: medida.tela }} className="sticky left-0 w-fit flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
            {LEGENDA.map(l => (
              <li key={l.rotulo} className="inline-flex items-center gap-1.5 text-caption text-zinc-400">
                <span aria-hidden data-situacao={l.situacao} style={{ '--feito': l.feito } as React.CSSProperties} className="cron-barra w-6 h-2.5 rounded-[3px]" />{l.rotulo}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5 text-caption text-zinc-400"><span aria-hidden className="w-[3px] h-3 bg-[var(--cron-atraso)]" />Atraso</li>
          </ul>
          </div>
        </div>
        </div>
      </div>

      {(pendente || aviso) && (
        <div role="status" aria-live="polite" className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-32px)] flex items-center gap-3 h-10 px-4 rounded-xl bg-[#18181b] border border-zinc-700 text-body text-zinc-100 whitespace-nowrap">
          <span className="min-w-0 truncate">{pendente?.mensagem ?? aviso!.texto}</span>
          {pendente
            ? <button type="button" onClick={desfazer} className={`font-semibold text-blue-400 hover:text-blue-300 rounded px-1 ${FOCO}`}>Desfazer</button>
            : aviso!.abrir && <button type="button" onClick={() => { onSelectTask(recebidas.find(t => t.id === aviso!.abrir!.id) ?? aviso!.abrir!); setAviso(null); }} className={`font-semibold text-blue-400 hover:text-blue-300 rounded px-1 ${FOCO}`}>Abrir</button>}
        </div>
      )}

      {menu && (
        <MenuTarefa
          ponto={menu.ponto}
          tarefa={menu.task}
          podeEditar={podeEditar}
          onFechar={() => setMenu(null)}
          onConcluir={() => concluirOuReabrir(menu.task)}
          onAbrir={() => onSelectTask(menu.task)}
          onStatus={s => mudarStatus(menu.task, s)}
          onDuplicar={() => duplicar(menu.task)}
          onCopiarLink={() => copiarLink(menu.task)}
          onReagendar={() => prazoAdmin ? setReagendando(menu) : pedirPrazo(menu.task)}
          onExcluir={() => setExcluindo(menu.task)}
        />
      )}
      {criacao && (
        <NovaTarefa key={`${criacao.data}${criacao.ponto.x}${criacao.ponto.y}`} ponto={criacao.ponto} data={criacao.data} contexto={nomeDoDestino(criacao)} limite={limiteDaCriacao(criacao)} onFechar={() => setCriacao(null)} onCriar={criar} />
      )}
      {reagendando && (
        <Reagendar
          ponto={reagendando.ponto}
          titulo={reagendando.task.title || 'Sem título'}
          inicio={inicioDaTarefa(reagendando.task)}
          prazo={reagendando.task.dueDate!.slice(0, 10)}
          comInicio={dataInicio.ativa}
          limite={limiteDe(reagendando.task)}
          onFechar={() => setReagendando(null)}
          onSalvar={(startDate, dueDate) => {
            // Início estimado que não foi mexido continua estimado.
            const mexeu = startDate !== inicioDaTarefa(reagendando.task);
            gravar(reagendando.task, { startDate: mexeu ? startDate : undefined, dueDate });
            setReagendando(null);
          }}
        />
      )}
      {excluindo && createPortal(
        <div className="tela-cronograma">
          <ConfirmModal
            isOpen
            title="Excluir tarefa?"
            message={`"${excluindo.title || 'Sem título'}" e todo o conteúdo dela (subtarefas, briefings e aprovações) serão excluídos. Você terá alguns segundos para desfazer.`}
            confirmText="Excluir"
            onConfirm={() => { agendar({ id: excluindo.id, mensagem: 'Tarefa excluída' }); setExcluindo(null); }}
            onCancel={() => setExcluindo(null)}
          />
        </div>, document.body)}
    </div>
  );
}

/** Anel do avanço. Concluída: cheio com o visto. */
function AnelProgresso({ valor, situacao }: { valor: number; situacao: SituacaoCronograma }) {
  const R = 6, C = 2 * Math.PI * R;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" data-situacao={situacao} className="cron-anel shrink-0" aria-hidden>
      {situacao === 'concluida' ? (
        <>
          <circle cx="8" cy="8" r="7.25" style={{ fill: 'var(--cor)' }} />
          <path d="M5 8.2 7.2 10.3 11 6" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="stroke-zinc-100" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" style={{ stroke: 'var(--cor)', opacity: 0.4 }} />
          {valor > 0 && <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" strokeDasharray={`${C * valor} ${C}`} transform="rotate(-90 8 8)" style={{ stroke: 'var(--cor)' }} />}
        </>
      )}
    </svg>
  );
}

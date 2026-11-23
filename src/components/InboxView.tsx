import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Bell, CheckCircle2, CircleCheck, Check, X, Calendar, AlertTriangle, AtSign, UserPlus, RotateCw, Clock, Star, Archive, Undo2, ChevronRight, ChevronDown, MoreHorizontal, Trash2, Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Task, Project, AppNotification, SiengeTitle, SiengeAlcadaConfig } from '../types';
import ConfirmModal from './ConfirmModal';
import PreferencesModal from './PreferencesModal';
import {
  montarItens, montarLinhas, montarLinhasPendentes, CHAVE_ATENCAO, desfechoDe, passaDesfecho, casaBusca, ehAtrasoCritico,
  formatarDuracao, tempoDeResolucao, chaveDia, FILTROS_TIPO,
  type ItemInbox, type Linha, type FiltroTipo, type Desfecho, type CategoriaIcone, type ContextoInbox,
} from '../lib/inbox';
import {
  casaEscopo, casaPeriodo, chaveNome, desserializarFiltros, ehUrlDaInbox, empreendimentoDe, filtrosPadrao, gravarFiltros,
  lerFiltros, periodoPadrao, rotuloPeriodo, serializarFiltros, temEscopo, temFiltros, DESFECHOS,
  type Aba, type FiltrosInbox, type VinculosInbox,
} from '../lib/inboxFiltros';
import type { MarketingProjeto } from '../lib/marketingProjetos';
import BarraFiltros from './inbox/BarraFiltros';
import CabecalhoLista from './inbox/CabecalhoLista';
import { aprovarTitulo, reprovarTitulo, notificacaoAlcada, alcadaResponsibleId } from '../lib/siengeHelpers';

// ─── Constantes visuais ──────────────────────────────────────────────

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
const CARD = 'bg-[#121214] border border-zinc-800 rounded-xl';
const PAGINA = 50;
const DESFAZER_MS = 5000;

/** Referência estável: um `= []` no parâmetro refaria os cálculos a cada render. */
const VAZIO: never[] = [];
const SEM_VINCULO: Record<string, string> = {};

// Ícone por categoria (P5.3). ⚠ só em prazo atrasado.
const ICONE: Record<CategoriaIcone, { Icone: typeof Bell; cor: string }> = {
  aprovacao_pendente: { Icone: CircleCheck, cor: 'text-zinc-400' },
  aprovado: { Icone: Check, cor: 'text-emerald-400' },
  reprovado: { Icone: X, cor: 'text-red-400' },
  prazo: { Icone: Calendar, cor: 'text-amber-400' },
  prazo_atrasado: { Icone: AlertTriangle, cor: 'text-danger-400' },
  lembrete: { Icone: Bell, cor: 'text-zinc-400' },
  mencao: { Icone: AtSign, cor: 'text-zinc-400' },
  atribuicao: { Icone: UserPlus, cor: 'text-zinc-400' },
  status: { Icone: RotateCw, cor: 'text-zinc-400' },
};

const ROTULO_DESFECHO: Record<Desfecho, string> = {
  pendente: 'Arquivado · ainda aguardando',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  resolvido: 'Resolvido',
  expirado: 'Expirado',
};

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHoraCompleta = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });

const isAdiada = (n: AppNotification) => n.status === 'postponed' && (!n.postponedUntil || new Date() < new Date(n.postponedUntil));

// ─── Props ───────────────────────────────────────────────────────────

interface InboxViewProps {
  tasks: Task[];
  projects: Project[];
  onSelectTask: (task: Task) => void;
  siengeTitles?: SiengeTitle[];
  alcadaConfig?: SiengeAlcadaConfig;
  /** Salva o título Sienge (mesmo handler da tela do Sienge). Resolve true se gravou. */
  onSaveSiengeTitle?: (title: SiengeTitle) => Promise<boolean>;
  /** Abre um título na tela do Sienge (ausente se o usuário não tem acesso). */
  onOpenSiengeTitle?: (id: string) => void;
  /** Projetos do Marketing e a ligação task_id → projeto. */
  projetosMarketing?: MarketingProjeto[];
  projetoDaTarefa?: Record<string, string>;
}

interface Toast { id: number; mensagem: string; desfazer?: () => void; erro?: boolean }

export default function InboxView({
  tasks, projects, onSelectTask, siengeTitles = VAZIO, alcadaConfig = {}, onSaveSiengeTitle, onOpenSiengeTitle,
  projetosMarketing = VAZIO, projetoDaTarefa = SEM_VINCULO,
}: InboxViewProps) {
  const { currentUser } = useAuth();
  const { notifications, carregando, addNotification, markAsRead, markManyAsViewed, unarchiveMany, postpone, markAsImportant, clearArchived } = useNotifications();

  // ── Filtros ──
  // Cada aba tem a sua combinação. A URL (link, recarregar, voltar) vale mais que a última salva.
  const userId = currentUser?.id ?? '';
  const [inicial] = useState(() => {
    const url = desserializarFiltros(window.location.search);
    const porAba: Record<Aba, FiltrosInbox> = { pendentes: lerFiltros(userId, 'pendentes'), historico: lerFiltros(userId, 'historico') };
    if (url) porAba[url.aba] = url.filtros;
    return { porAba, aba: url?.aba ?? 'pendentes' as Aba };
  });
  const [filtrosPorAba, setFiltrosPorAba] = useState(inicial.porAba);
  const [aba, setAba] = useState<Aba>(inicial.aba);
  const [limite, setLimite] = useState(PAGINA);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ocultos, setOcultos] = useState<Set<string>>(new Set()); // saem da lista durante a janela de "Desfazer"
  const [reprovando, setReprovando] = useState<ItemInbox[] | null>(null);
  const [confirmacao, setConfirmacao] = useState<null | 'arquivar_pendentes' | 'excluir_historico'>(null);
  const [preferenciasAbertas, setPreferenciasAbertas] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);

  // ── Contexto de lookup ──
  const tarefaPorId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const tituloPorId = useMemo(() => new Map(siengeTitles.map(t => [t.id, t])), [siengeTitles]);
  const ctx: ContextoInbox = useMemo(() => ({
    tarefas: new Map(tasks.map(t => [t.id, { title: t.title, projectId: t.projectId }])),
    titulos: new Map(siengeTitles.map(t => [t.id, { titulo: t.titulo, status: t.status }])),
  }), [tasks, siengeTitles]);

  const vinculos: VinculosInbox = useMemo(() => ({
    empreendimentoDaTarefa: new Map(tasks.map(t => [t.id, t.projectId])),
    empreendimentoDoTitulo: new Map(siengeTitles.map(t => [t.id, t.empreendimento])),
    empreendimentoPorNome: new Map(projects.map(p => [chaveNome(p.name), p.id])),
    projetoDaTarefa,
  }), [tasks, siengeTitles, projects, projetoDaTarefa]);
  const nomeEmpreendimento = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);

  // ── Itens ──
  const minhas = useMemo(() => notifications.filter(n => n.userId === currentUser?.id), [notifications, currentUser?.id]);
  const ativasBrutas = useMemo(() => minhas.filter(n => n.status !== 'viewed'), [minhas]);
  const arquivadasBrutas = useMemo(() => minhas.filter(n => n.status === 'viewed'), [minhas]);

  const itensAtivos = useMemo(() => montarItens(ativasBrutas.filter(n => !isAdiada(n)), ctx), [ativasBrutas, ctx]);
  const itensAdiados = useMemo(() => montarItens(ativasBrutas.filter(isAdiada), ctx), [ativasBrutas, ctx]);
  const itensArquivados = useMemo(() => {
    // Ordena o histórico pela data da notificação, como antes.
    return montarItens(arquivadasBrutas, ctx);
  }, [arquivadasBrutas, ctx]);

  const totalPendentes = itensAtivos.length + itensAdiados.length - [...itensAtivos, ...itensAdiados].filter(i => ocultos.has(i.id)).length;
  const temPendencias = totalPendentes > 0;
  // Pendentes escolhido, mas sem nenhuma: aviso compacto no lugar da lista vazia.
  const semPendencias = aba === 'pendentes' && !temPendencias && !carregando;

  const filtros = filtrosPorAba[aba];
  const filtrosAtivos = temFiltros(filtros, aba);
  const mudarFiltros = (mudanca: Partial<FiltrosInbox>) => setFiltrosPorAba(prev => ({ ...prev, [aba]: { ...prev[aba], ...mudanca } }));
  const limparFiltros = () => setFiltrosPorAba(prev => ({ ...prev, [aba]: filtrosPadrao(aba) }));

  // URL e última combinação por usuário/aba. O guard evita escrever durante a
  // animação de saída, quando a URL já é da outra tela.
  useEffect(() => {
    if (carregando || !userId) return;
    gravarFiltros(userId, aba, filtros);
    if (!ehUrlDaInbox(window.location.search)) return;
    const url = serializarFiltros(aba, filtros);
    if (url !== window.location.search) window.history.replaceState(window.history.state, '', `${window.location.pathname}${url}`);
  }, [aba, filtros, carregando, userId]);

  const passaFiltros = useCallback((it: ItemInbox, arquivado: boolean, ignorarTipo = false) => {
    if (ocultos.has(it.id)) return false;
    if (!ignorarTipo && filtros.tipos.length > 0 && !filtros.tipos.includes(it.filtroTipo)) return false;
    if (!casaEscopo(it.n, filtros, vinculos)) return false;
    if (!casaPeriodo(it.n.createdAt, filtros.periodo, new Date())) return false;
    if (arquivado && !passaDesfecho(desfechoDe(it, true, ctx), filtros.desfecho)) return false;
    const tarefa = it.n.taskId ? tarefaPorId.get(it.n.taskId)?.title : undefined;
    const emp = empreendimentoDe(it.n, vinculos);
    return casaBusca(it, filtros.busca, tarefa, emp ? nomeEmpreendimento.get(emp) : undefined);
  }, [ocultos, filtros, vinculos, tarefaPorId, nomeEmpreendimento, ctx]);

  // Contagem por chip: respeita todos os outros filtros, menos o próprio Tipo.
  const { contagemTipo, temAtrasoCritico } = useMemo(() => {
    const base = aba === 'historico' ? itensArquivados : [...itensAtivos, ...itensAdiados];
    const c = new Map<FiltroTipo, number>();
    let critico = false;
    base.forEach(it => {
      if (!passaFiltros(it, aba === 'historico', true)) return;
      c.set(it.filtroTipo, (c.get(it.filtroTipo) || 0) + 1);
      if (aba === 'pendentes' && ehAtrasoCritico(it.n)) critico = true;
    });
    return { contagemTipo: c, temAtrasoCritico: critico };
  }, [aba, itensArquivados, itensAtivos, itensAdiados, passaFiltros]);

  const agora = new Date();
  const linhas: Linha[] = useMemo(() => {
    if (aba === 'historico') {
      return montarLinhas(itensArquivados.filter(i => passaFiltros(i, true)), agora);
    }
    const regulares = montarLinhasPendentes(itensAtivos.filter(i => passaFiltros(i, false)), agora);
    const adiados = itensAdiados.filter(i => passaFiltros(i, false));
    if (adiados.length === 0) return regulares;
    return [...regulares, { tipo: 'cabecalho', chave: 'h:adiadas', rotulo: 'Adiadas' } as Linha, ...adiados.map(item => ({ tipo: 'item', chave: item.id, item } as Linha))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, itensArquivados, itensAtivos, itensAdiados, passaFiltros]);

  // Paginação: conta linhas de conteúdo (cabeçalhos não contam).
  const { visiveis, haMais } = useMemo(() => {
    let n = 0;
    const out: Linha[] = [];
    for (const l of linhas) {
      if (l.tipo !== 'cabecalho') {
        if (n >= limite) return { visiveis: out, haMais: true };
        n++;
      }
      out.push(l);
    }
    return { visiveis: out, haMais: false };
  }, [linhas, limite]);

  // Mudou o recorte: volta à primeira página e limpa a seleção (uma ação em lote
  // não pode atingir itens que o filtro escondeu).
  useEffect(() => { setLimite(PAGINA); setSelecionados(new Set()); }, [aba, filtros]);

  // Infinite scroll com sentinela (o botão "Carregar mais" continua como alternativa).
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !haMais) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setLimite(l => l + PAGINA);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [haMais, visiveis.length]);

  // ── Aprovação inline (alçada Sienge) ──
  const tituloAprovavel = useCallback((it: ItemInbox): SiengeTitle | null => {
    if (aba !== 'pendentes' || !it.nivelAlcada || !it.n.siengeTitleId || !onSaveSiengeTitle) return null;
    const t = tituloPorId.get(it.n.siengeTitleId);
    if (!t || t.status !== `aprovacao_${it.nivelAlcada}`) return null;
    if (alcadaResponsibleId(alcadaConfig, it.nivelAlcada) !== currentUser?.id) return null;
    return t;
  }, [aba, tituloPorId, alcadaConfig, currentUser?.id, onSaveSiengeTitle]);

  // Ações com janela de desfazer: a gravação só acontece depois dos 5 s.
  const pendentesRef = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; executar: () => void }>());
  useEffect(() => () => {
    // Saiu da tela: grava o que estava aguardando a janela de desfazer.
    pendentesRef.current.forEach(p => { clearTimeout(p.timer); p.executar(); });
    pendentesRef.current.clear();
  }, []);

  const mostrarToast = (t: Omit<Toast, 'id'>) => setToast({ ...t, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.desfazer ? DESFAZER_MS : 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const comDesfazer = (itens: ItemInbox[], mensagem: string, executar: () => void) => {
    const ids = itens.map(i => i.id);
    setOcultos(prev => new Set([...prev, ...ids]));
    setSelecionados(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    const chave = Date.now() + Math.random();
    const timer = setTimeout(() => { pendentesRef.current.delete(chave); executar(); }, DESFAZER_MS);
    pendentesRef.current.set(chave, { timer, executar });
    mostrarToast({
      mensagem,
      desfazer: () => {
        const p = pendentesRef.current.get(chave);
        if (!p) return;
        clearTimeout(p.timer);
        pendentesRef.current.delete(chave);
        setOcultos(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
        setToast(null);
      },
    });
  };

  const reexibir = (itens: ItemInbox[]) => setOcultos(prev => { const s = new Set(prev); itens.forEach(i => s.delete(i.id)); return s; });

  const decidir = (itens: ItemInbox[], decisao: 'aprovar' | 'reprovar', motivo = '') => {
    const alvos = itens.filter(i => tituloAprovavel(i));
    if (alvos.length === 0) return;
    const verbo = decisao === 'aprovar' ? 'aprovado' : 'reprovado';
    const mensagem = alvos.length === 1
      ? `Título ${alvos[0].identificador ?? ''} ${verbo}`.replace(/\s+/g, ' ')
      : `${alvos.length} títulos ${verbo}s`;
    comDesfazer(alvos, mensagem, async () => {
      const falhas: ItemInbox[] = [];
      for (const it of alvos) {
        // Relê o título no momento da gravação: se já saiu da alçada, só arquiva.
        const atual = tituloPorIdRef.current.get(it.n.siengeTitleId!);
        if (!atual || atual.status !== `aprovacao_${it.nivelAlcada}`) { markManyAsViewed(it.ids); continue; }
        const novo = decisao === 'aprovar' ? aprovarTitulo(atual) : reprovarTitulo(atual, motivo);
        if (!novo) continue;
        const ok = await onSaveSiengeTitle!(novo);
        if (!ok) { falhas.push(it); continue; }
        const proxima = notificacaoAlcada(novo, atual.status, alcadaConfigRef.current, currentUser?.id || 'system');
        if (proxima) addNotification(proxima);
        markManyAsViewed(it.ids);
      }
      // Já gravados e arquivados: deixam de ser "ocultos" para aparecer no Histórico.
      reexibir(alvos);
      if (falhas.length) {
        mostrarToast({ mensagem: `Não foi possível salvar ${falhas.length === 1 ? 'o título' : `${falhas.length} títulos`}. Tente novamente.`, erro: true });
      }
    });
  };
  // Refs para a gravação atrasada ler o estado mais recente.
  const tituloPorIdRef = useRef(tituloPorId);
  tituloPorIdRef.current = tituloPorId;
  const alcadaConfigRef = useRef(alcadaConfig);
  alcadaConfigRef.current = alcadaConfig;

  const arquivar = (itens: ItemInbox[]) => {
    const ids = itens.flatMap(i => i.ids);
    markManyAsViewed(ids);
    setSelecionados(prev => { const s = new Set(prev); itens.forEach(i => s.delete(i.id)); return s; });
    mostrarToast({
      mensagem: itens.length === 1 ? 'Notificação arquivada' : `${itens.length} notificações arquivadas`,
      desfazer: () => { unarchiveMany(ids); setToast(null); },
    });
  };

  const restaurar = (it: ItemInbox) => {
    unarchiveMany(it.ids);
    mostrarToast({ mensagem: 'Notificação devolvida para Pendentes' });
  };

  // ── Abrir entidade ──
  const abrir = (it: ItemInbox) => {
    const n = it.n;
    if (aba === 'pendentes' && n.status === 'unread') markAsRead(n.id);
    if (n.siengeTitleId && !n.taskId) { onOpenSiengeTitle?.(n.siengeTitleId); return; }
    const task = n.taskId ? tarefaPorId.get(n.taskId) : undefined;
    if (!task) return;
    onSelectTask(task);
    let detalhe: { section: string; targetId?: string } | null = null;
    if (['rejected', 'review_requested', 'approval_pending', 'approved'].includes(n.type)) {
      let section = 'attachments';
      if (n.targetId?.startsWith('copy-')) section = 'copyProps';
      else if (n.targetId?.startsWith('budget-')) section = 'budgetProps';
      else if (n.targetId?.startsWith('design-')) section = 'designProps';
      detalhe = { section, targetId: n.targetId };
    } else if (n.type === 'task_assigned') {
      detalhe = { section: 'checklist', targetId: n.targetId };
    } else if (n.type === 'reminder') {
      const sub = (n.targetId && n.targetId !== 'reminder' && n.targetId !== n.taskId) || n.message === 'Lembrete Acionado';
      detalhe = { section: sub ? 'checklist' : 'reminder', targetId: n.targetId };
    } else if (n.type.startsWith('deadline')) {
      detalhe = { section: 'deadline', targetId: 'deadline' };
    }
    if (detalhe) setTimeout(() => window.dispatchEvent(new CustomEvent('openTaskSection', { detail: detalhe })), 100);
  };

  const podeAbrir = (it: ItemInbox) =>
    !!(it.n.taskId && tarefaPorId.get(it.n.taskId)) || !!(it.n.siengeTitleId && !it.n.taskId && onOpenSiengeTitle);

  // ── Seleção ──
  const alternarSelecao = (ids: string[]) => setSelecionados(prev => {
    const s = new Set(prev);
    const todos = ids.every(id => s.has(id));
    ids.forEach(id => todos ? s.delete(id) : s.add(id));
    return s;
  });
  const itensPorId = useMemo(() => {
    const m = new Map<string, ItemInbox>();
    [...itensAtivos, ...itensAdiados, ...itensArquivados].forEach(i => m.set(i.id, i));
    return m;
  }, [itensAtivos, itensAdiados, itensArquivados]);
  const itensSelecionados = [...selecionados].map(id => itensPorId.get(id)).filter(Boolean) as ItemInbox[];
  const aprovaveisSelecionados = itensSelecionados.filter(i => tituloAprovavel(i));
  const modoSelecao = selecionados.size > 0;

  // ── Teclado: ↑/↓, Enter, A, R, X ──
  const listaRef = useRef<HTMLUListElement | null>(null);
  const onKeyLista = (e: React.KeyboardEvent) => {
    const alvo = e.target as HTMLElement;
    if (!alvo.dataset.nav) return;
    const nav = Array.from(listaRef.current?.querySelectorAll<HTMLElement>('[data-nav]') || []);
    const idx = nav.indexOf(alvo);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      nav[Math.min(Math.max(idx + (e.key === 'ArrowDown' ? 1 : -1), 0), nav.length - 1)]?.focus();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const itemId = alvo.dataset.item;
    const grupoChave = alvo.dataset.grupo;
    const it = itemId ? itensPorId.get(itemId) : undefined;
    const grupo = grupoChave ? linhas.find(l => l.tipo === 'grupo' && l.chave === grupoChave) : undefined;
    const tecla = e.key.toLowerCase();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (it) abrir(it);
      else if (grupoChave) alternarExpandido(grupoChave);
    } else if (tecla === 'x') {
      e.preventDefault();
      if (it) alternarSelecao([it.id]);
      else if (grupo?.tipo === 'grupo') alternarSelecao(grupo.itens.map(i => i.id));
    } else if (tecla === 'a' && it && tituloAprovavel(it)) {
      e.preventDefault();
      nav[idx + 1]?.focus();
      decidir([it], 'aprovar');
    } else if (tecla === 'r' && it && tituloAprovavel(it)) {
      e.preventDefault();
      setReprovando([it]);
    }
  };

  const alternarExpandido = (chave: string) => setExpandidos(prev => {
    const s = new Set(prev);
    s.has(chave) ? s.delete(chave) : s.add(chave);
    return s;
  });

  // ── Métricas ── (respeitam Empreendimento e Projeto; nunca o Período)
  const metricasFiltradas = temEscopo(filtros);
  const { arquivadasEscopo, pendentesEscopo, criticosEscopo, resolvidasEscopo } = useMemo(() => {
    const noEscopo = (n: AppNotification) => casaEscopo(n, filtros, vinculos);
    const pendentes = [...itensAtivos, ...itensAdiados].filter(i => !ocultos.has(i.id) && noEscopo(i.n));
    return {
      arquivadasEscopo: arquivadasBrutas.filter(noEscopo),
      pendentesEscopo: pendentes.length,
      criticosEscopo: pendentes.filter(i => ehAtrasoCritico(i.n)).length,
      resolvidasEscopo: itensArquivados.filter(i => noEscopo(i.n)).length,
    };
    // Só o escopo importa: digitar na busca não refaz as métricas.
  }, [arquivadasBrutas, itensAtivos, itensAdiados, itensArquivados, ocultos, vinculos, filtros.empreendimentos, filtros.projetos]);
  const metricas = useMemo(() => {
    const dia = 86_400_000;
    const agoraMs = Date.now();
    let soma = 0, qtd = 0, soma7 = 0, qtd7 = 0, soma30 = 0, qtd30 = 0;
    const serie = new Map<string, { chave: string; rotulo: string; data: Date; valor: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(agoraMs - i * dia);
      serie.set(chaveDia(d), { chave: chaveDia(d), data: d, rotulo: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), valor: 0 });
    }
    arquivadasEscopo.forEach(n => {
      const dur = tempoDeResolucao(n);
      if (dur !== null) {
        soma += dur; qtd++;
        const atras = (agoraMs - new Date(n.viewedAt!).getTime()) / dia;
        if (atras <= 7) { soma7 += dur; qtd7++; }
        if (atras <= 30) { soma30 += dur; qtd30++; }
      }
      if (n.viewedAt) {
        const s = serie.get(chaveDia(new Date(n.viewedAt)));
        if (s) s.valor++;
      }
    });
    const dados = [...serie.values()];
    return {
      media7: formatarDuracao(qtd7 ? soma7 / qtd7 : 0),
      media30: formatarDuracao(qtd30 ? soma30 / qtd30 : 0),
      mediaGeral: formatarDuracao(qtd ? soma / qtd : 0),
      serie: dados,
      max: Math.max(...dados.map(d => d.valor)),
    };
  }, [arquivadasEscopo]);

  const totalResolvidas = itensArquivados.length;

  const nomes = (ids: string[], lista: { id: string; nome: string }[]) => ids.map(id => lista.find(x => x.id === id)?.nome ?? 'removido').join(', ');
  const opcoesEmpreendimento = useMemo(() => projects.map(p => ({ id: p.id, nome: p.name })), [projects]);
  const resumoEscopo = [
    filtros.empreendimentos.length > 0 && `Empreendimento: ${nomes(filtros.empreendimentos, opcoesEmpreendimento)}`,
    filtros.projetos.length > 0 && `Projeto: ${nomes(filtros.projetos, projetosMarketing)}`,
  ].filter(Boolean) as string[];
  const resumoFiltros = [
    filtros.busca.trim() && `Busca: "${filtros.busca.trim()}"`,
    (!periodoPadrao(filtros, aba) || aba === 'historico') && `Período: ${rotuloPeriodo(filtros.periodo)}`,
    ...resumoEscopo,
    filtros.tipos.length > 0 && `Tipo: ${FILTROS_TIPO.filter(t => filtros.tipos.includes(t.valor)).map(t => t.rotulo).join(', ')}`,
    aba === 'historico' && filtros.desfecho !== 'todos' && `Desfecho: ${DESFECHOS.find(d => d.valor === filtros.desfecho)!.rotulo}`,
  ].filter(Boolean) as string[];
  // "Nenhuma notificação com estes filtros" vale também para o período padrão do Histórico.
  const recorteAtivo = filtrosAtivos || (aba === 'historico' && itensArquivados.length > 0);

  // A aba de destino herda o escopo do painel, senão o número clicado não bate com a lista.
  const verPendentes = () => {
    const { empreendimentos, projetos } = filtros;
    setFiltrosPorAba(prev => ({ ...prev, pendentes: { ...filtrosPadrao('pendentes'), empreendimentos, projetos } }));
    setAba('pendentes');
  };

  const itemPreferencias = { rotulo: 'Preferências da caixa de entrada', icone: Settings, onClick: () => setPreferenciasAbertas(true) };

  const menuLista = (
    <MenuCabecalho
      aberto={menuAberto}
      setAberto={setMenuAberto}
      itens={[
        itemPreferencias,
        ...(aba === 'historico'
          ? [{ rotulo: `Excluir histórico (${totalResolvidas})`, icone: Trash2, perigo: true, onClick: () => setConfirmacao('excluir_historico' as const), desabilitado: totalResolvidas === 0 }]
          : temPendencias
            ? [{ rotulo: `Arquivar todas as pendentes (${totalPendentes})`, icone: Archive, onClick: () => setConfirmacao('arquivar_pendentes' as const) }]
            : []),
      ]}
    />
  );

  // ─── Render: linha de item ─────────────────────────────────────────

  const renderItem = (it: ItemInbox, recuado = false) => {
    const arquivado = aba === 'historico';
    const n = it.n;
    const naoLida = !arquivado && n.status === 'unread';
    const importante = n.status === 'important';
    const adiada = isAdiada(n);
    const aprovavel = !!tituloAprovavel(it);
    const selecionado = selecionados.has(it.id);
    const desfecho = arquivado ? desfechoDe(it, true, ctx) : null;
    const cat: CategoriaIcone = desfecho === 'aprovado' ? 'aprovado' : desfecho === 'reprovado' ? 'reprovado' : it.categoria;
    const { Icone, cor } = ICONE[cat];
    const resolucao = arquivado ? tempoDeResolucao(n) : null;
    const task = n.taskId ? tarefaPorId.get(n.taskId) : undefined;
    const projeto = task?.projectId ? projects.find(p => p.id === task.projectId)?.name : undefined;
    const clicavel = podeAbrir(it);

    return (
      <motion.li
        key={it.id}
        layout={false}
        initial={false}
        exit={{ opacity: 0, x: 24, height: 0, transition: { duration: 0.18 } }}
        data-nav="1"
        data-item={it.id}
        tabIndex={0}
        aria-label={`${it.titulo}${naoLida ? ', não lida' : ''}`}
        aria-selected={selecionado || undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, input, a')) return;
          if (window.getSelection()?.toString()) return;
          if (modoSelecao) { alternarSelecao([it.id]); return; }
          abrir(it);
        }}
        className={`group relative flex items-start gap-3 pr-3 py-3 border-b border-zinc-800/70 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 ${
          recuado ? 'pl-10' : 'pl-3'
        } ${selecionado ? 'bg-blue-500/10' : importante ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-[#161619] focus-within:bg-[#161619]'} ${
          clicavel || modoSelecao ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Seleção */}
        <input
          type="checkbox"
          aria-label={`Selecionar ${it.titulo}`}
          checked={selecionado}
          onChange={() => alternarSelecao([it.id])}
          tabIndex={-1}
          className={`mt-0.5 size-4 shrink-0 accent-blue-500 cursor-pointer transition-opacity ${modoSelecao || selecionado ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
        />

        <span className={`mt-0.5 shrink-0 ${cor}`} aria-hidden>
          <Icone size={16} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-body font-medium truncate ${naoLida || importante ? 'text-zinc-100' : 'text-zinc-300'}`}>{it.titulo}</span>
            {it.repeticoes > 1 && (
              <span className="shrink-0 text-caption font-medium tabular-nums text-zinc-300 bg-[#1f1f23] border border-zinc-700 rounded px-1.5" title={`${it.repeticoes} notificações iguais em sequência`}>
                ×{it.repeticoes}
              </span>
            )}
            {naoLida && <span className="size-2 rounded-full bg-blue-500 shrink-0" aria-hidden />}
            {importante && <Star size={12} className="shrink-0 text-amber-400 fill-amber-400" aria-label="Importante" />}
          </div>

          {it.descricao && <p className="text-body text-zinc-400 line-clamp-1 mt-0.5">{it.descricao}</p>}

          <div className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-caption text-zinc-400">
            {desfecho ? (
              <span className={`inline-flex items-center gap-1 font-medium ${desfecho === 'aprovado' ? 'text-emerald-400' : desfecho === 'reprovado' ? 'text-red-400' : 'text-zinc-300'}`}>
                {ROTULO_DESFECHO[desfecho]}{n.viewedAt ? ` · ${dataCurta(n.viewedAt)}` : ''}
              </span>
            ) : adiada ? (
              <span className="inline-flex items-center gap-1 text-blue-400"><Clock size={12} aria-hidden /> Adiada até {dataCurta(n.postponedUntil || n.createdAt)}</span>
            ) : (
              <time dateTime={n.createdAt} title={dataHoraCompleta(n.createdAt)} className="tabular-nums">{dataCurta(n.createdAt)} · {horaCurta(n.createdAt)}</time>
            )}
            {resolucao !== null && (
              <span
                className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-[#1f1f23] px-1.5 text-zinc-300 tabular-nums"
                title={`Recebida em ${dataHoraCompleta(n.createdAt)}\nArquivada em ${dataHoraCompleta(n.viewedAt!)}`}
              >
                <Clock size={12} aria-hidden /> Resolvido em {formatarDuracao(resolucao)}
              </span>
            )}
            {it.tarefaVinculo && task && (
              <button type="button" onClick={() => abrir(it)} className={`text-zinc-300 hover:underline underline-offset-2 truncate max-w-[24ch] rounded ${FOCO}`} tabIndex={-1}>
                {it.tarefaVinculo}
              </button>
            )}
            {projeto && <span className="truncate max-w-[20ch]">{projeto}</span>}
          </div>
        </div>

        {/* Ações (hover/foco) */}
        <div className={`flex items-center gap-1 shrink-0 self-center transition-opacity ${aprovavel ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
          {aprovavel && (
            <>
              <button type="button" tabIndex={-1} onClick={() => decidir([it], 'aprovar')}
                className={`h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-body font-medium ${FOCO}`}>
                Aprovar
              </button>
              <button type="button" tabIndex={-1} onClick={() => setReprovando([it])}
                className={`h-8 px-3 rounded-lg border border-zinc-550 text-zinc-200 hover:bg-[#1f1f23] text-body font-medium ${FOCO}`}>
                Reprovar
              </button>
            </>
          )}
          {!arquivado ? (
            <>
              <BotaoIcone rotulo="Arquivar" onClick={() => arquivar([it])}><Archive size={16} /></BotaoIcone>
              {!aprovavel && (
                <>
                  <BotaoIcone rotulo={adiada ? 'Adiada' : 'Adiar 1 dia'} ativo={adiada} onClick={() => postpone(n.id)}><Clock size={16} /></BotaoIcone>
                  <BotaoIcone rotulo={importante ? 'Remover destaque' : 'Destacar'} ativo={importante} onClick={() => markAsImportant(n.id)}>
                    <Star size={16} className={importante ? 'fill-amber-400 text-amber-400' : ''} />
                  </BotaoIcone>
                </>
              )}
            </>
          ) : (
            <BotaoIcone rotulo="Devolver para Pendentes" onClick={() => restaurar(it)}><Undo2 size={16} /></BotaoIcone>
          )}
        </div>
        {clicavel && <ChevronRight size={16} className="shrink-0 self-center text-zinc-500 group-hover:text-zinc-300" aria-hidden />}
      </motion.li>
    );
  };

  const renderGrupo = (l: Extract<Linha, { tipo: 'grupo' }>) => {
    const aberto = expandidos.has(l.chave);
    const ids = l.itens.map(i => i.id);
    const todosSel = ids.every(id => selecionados.has(id));
    const algunsSel = !todosSel && ids.some(id => selecionados.has(id));
    const { Icone, cor } = ICONE[l.itens[0].categoria];
    const idsPreview = l.itens.map(i => i.identificador).filter(Boolean).slice(0, 4).join(', ');
    return (
      <li key={l.chave} className="border-b border-zinc-800/70">
        <div
          data-nav="1"
          data-grupo={l.chave}
          tabIndex={0}
          role="button"
          aria-expanded={aberto}
          aria-controls={`grupo-${l.chave}`}
          onClick={(e) => { if ((e.target as HTMLElement).closest('input')) return; alternarExpandido(l.chave); }}
          className="group flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-[#161619] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60"
        >
          <input
            type="checkbox"
            aria-label={`Selecionar todos deste grupo (${l.itens.length})`}
            title="Selecionar todos deste grupo"
            checked={todosSel}
            ref={el => { if (el) el.indeterminate = algunsSel; }}
            onChange={() => alternarSelecao(ids)}
            tabIndex={-1}
            className={`size-4 shrink-0 accent-blue-500 cursor-pointer transition-opacity ${modoSelecao ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
          />
          {l.itens[0].categoria === 'prazo_atrasado'
            ? <span className="icon-tile icon-tile-danger size-8" aria-hidden><Icone size={16} /></span>
            : <span className={`shrink-0 ${cor}`} aria-hidden><Icone size={16} /></span>}
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-zinc-100 truncate">{l.rotulo}</p>
            {idsPreview && <p className="text-caption text-zinc-400 truncate">{idsPreview}{l.itens.length > 4 ? '…' : ''}</p>}
          </div>
          <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden />
        </div>
        {aberto && (
          <ul id={`grupo-${l.chave}`} className="bg-[#0c0c0e]">
            {l.itens.filter(i => !ocultos.has(i.id)).map(i => renderItem(i, true))}
          </ul>
        )}
      </li>
    );
  };

  // ─── Render principal ──────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#08080a] text-zinc-100">
      {/* Header (P3.3) */}
      <header className="view-pad-x pt-6 pb-5 shrink-0">
        <h1 className="text-title font-semibold text-zinc-100">Caixa de entrada</h1>
        <p className="text-body text-zinc-400">Aprovações, prazos e avisos que dependem de você.</p>
      </header>

      <div className="flex-1 min-h-0 view-pad-x pb-6 overflow-y-auto lg:overflow-hidden flex flex-col gap-4">
        {/* Mesma divisão de colunas do conteúdo: a barra termina onde termina o card da lista. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:gap-4 shrink-0">
        <BarraFiltros
          aba={aba}
          onModo={setAba}
          pendentes={totalPendentes}
          filtros={filtros}
          onMudar={mudarFiltros}
          onLimpar={limparFiltros}
          temFiltros={filtrosAtivos}
          empreendimentos={opcoesEmpreendimento}
          projetos={projetosMarketing}
        />
        </div>

        {/* Uma linha, duas colunas: o card da lista e o hero começam no mesmo topo. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:grid-rows-[minmax(0,1fr)] items-start gap-4 lg:flex-1 lg:min-h-0">
          <section className={`${CARD} flex flex-col w-full min-w-0 overflow-hidden relative ${semPendencias ? '' : 'min-h-[420px] lg:min-h-0 lg:h-full'}`} aria-label="Notificações">
            {semPendencias ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-heading font-semibold text-zinc-100">Nenhuma pendência</p>
                  <p className="text-body text-zinc-400">Você resolveu {totalResolvidas.toLocaleString('pt-BR')} {totalResolvidas === 1 ? 'item' : 'itens'}.</p>
                </div>
                {totalResolvidas > 0 && (
                  <button type="button" onClick={() => setAba('historico')} className={`h-8 px-3 rounded-lg border border-zinc-800 text-body text-zinc-200 hover:bg-[#1f1f23] shrink-0 ${FOCO}`}>Ver histórico</button>
                )}
                {menuLista}
              </div>
            ) : (
              <CabecalhoLista
                aba={aba}
                filtros={filtros}
                onMudar={mudarFiltros}
                contagem={contagemTipo}
                temAtrasoCritico={temAtrasoCritico}
                idPainel="inbox-lista"
                menu={menuLista}
              />
            )}

            {!semPendencias && (
            <div id="inbox-lista" className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal" role="tabpanel">
              {visiveis.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-6 py-16">
                  <Inbox size={20} className="text-zinc-400" aria-hidden />
                  <p className="mt-2 text-body font-medium text-zinc-200">
                    {carregando ? 'Carregando…' : recorteAtivo ? 'Nenhuma notificação com estes filtros' : aba === 'pendentes' ? 'Nada pendente' : 'Nenhum histórico ainda'}
                  </p>
                  {!carregando && recorteAtivo && (
                    <>
                      <p className="mt-1 max-w-[60ch] text-body text-zinc-400">{resumoFiltros.join(' · ')}</p>
                      {filtros.projetos.length > 0 && (
                        <p className="mt-2 max-w-[60ch] text-body text-zinc-400">
                          Notificações financeiras (títulos) não pertencem a projetos e ficam ocultas com este filtro.
                        </p>
                      )}
                      {filtrosAtivos ? (
                        <button type="button" onClick={limparFiltros} className={`mt-3 h-8 px-3 rounded-lg border border-zinc-550 text-body text-zinc-200 hover:bg-[#1f1f23] ${FOCO}`}>Limpar filtros</button>
                      ) : (
                        <button type="button" onClick={() => mudarFiltros({ periodo: { preset: 'todo' } })} className={`mt-3 h-8 px-3 rounded-lg border border-zinc-550 text-body text-zinc-200 hover:bg-[#1f1f23] ${FOCO}`}>Ver todo o período</button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <ul ref={listaRef} onKeyDown={onKeyLista} aria-label={aba === 'pendentes' ? 'Pendentes' : 'Histórico'}>
                  <AnimatePresence initial={false}>
                    {visiveis.map(l => {
                      if (l.tipo === 'cabecalho') {
                        return (
                          <li key={l.chave} role="presentation" className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-[#121214] border-b border-zinc-800 text-caption font-semibold text-zinc-300">
                            {l.chave === CHAVE_ATENCAO && <span className="dot-danger" aria-hidden />}
                            {l.rotulo}
                          </li>
                        );
                      }
                      if (l.tipo === 'grupo') return renderGrupo(l);
                      return renderItem(l.item);
                    })}
                  </AnimatePresence>
                </ul>
              )}
              {haMais && (
                <div ref={sentinela} className="flex justify-center py-3">
                  <button type="button" onClick={() => setLimite(l => l + PAGINA)} className={`h-8 px-3 rounded-lg border border-zinc-550 text-body text-zinc-300 hover:bg-[#161619] ${FOCO}`}>
                    Carregar mais
                  </button>
                </div>
              )}
            </div>

            )}

            {/* Barra de ações em lote (P2.2) */}
            {modoSelecao && (
              <div className="shrink-0 flex items-center gap-2 flex-wrap px-3 py-2 border-t border-zinc-700 bg-[#18181b]" role="toolbar" aria-label="Ações em lote">
                <span className="text-body font-medium text-zinc-100 tabular-nums mr-auto">{selecionados.size} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}</span>
                {aba === 'pendentes' && aprovaveisSelecionados.length > 0 && (
                  <>
                    <button type="button" onClick={() => decidir(aprovaveisSelecionados, 'aprovar')} className={`h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-body font-medium ${FOCO}`}>
                      Aprovar{aprovaveisSelecionados.length !== selecionados.size ? ` (${aprovaveisSelecionados.length})` : ''}
                    </button>
                    <button type="button" onClick={() => setReprovando(aprovaveisSelecionados)} className={`h-8 px-3 rounded-lg border border-zinc-550 text-zinc-200 hover:bg-[#1f1f23] text-body font-medium ${FOCO}`}>
                      Reprovar{aprovaveisSelecionados.length !== selecionados.size ? ` (${aprovaveisSelecionados.length})` : ''}
                    </button>
                  </>
                )}
                {aba === 'pendentes' && (
                  <button type="button" onClick={() => arquivar(itensSelecionados)} className={`h-8 px-3 rounded-lg border border-zinc-550 text-zinc-200 hover:bg-[#1f1f23] text-body font-medium ${FOCO}`}>
                    Arquivar
                  </button>
                )}
                {aba === 'historico' && (
                  <button type="button" onClick={() => { unarchiveMany(itensSelecionados.flatMap(i => i.ids)); setSelecionados(new Set()); }} className={`h-8 px-3 rounded-lg border border-zinc-550 text-zinc-200 hover:bg-[#1f1f23] text-body font-medium ${FOCO}`}>
                    Devolver para Pendentes
                  </button>
                )}
                <button type="button" onClick={() => setSelecionados(new Set())} className={`h-8 px-3 rounded-lg text-zinc-300 hover:text-zinc-100 text-body ${FOCO}`}>
                  Cancelar
                </button>
              </div>
            )}
          </section>

          {/* Painel de métricas (P4) */}
          {/* Margem/recuo iguais: o anel de foco não é cortado pela rolagem. */}
          <aside className="flex flex-col gap-4 w-full min-w-0 lg:w-auto lg:-m-1 lg:p-1 lg:max-h-[calc(100%+0.5rem)] lg:overflow-y-auto scrollbar-minimal" aria-label="Métricas">
            <button
              type="button"
              onClick={verPendentes}
              className={`card-hero w-full p-4 flex flex-col gap-3 text-left shrink-0 ${FOCO}`}
              aria-label={[
                `Aguardando ação: ${pendentesEscopo}`,
                `${resolvidasEscopo} resolvidas`,
                criticosEscopo > 0 && `${criticosEscopo} com atraso crítico`,
                metricasFiltradas && `Métricas filtradas. ${resumoEscopo.join('. ')}`,
                'Mostrar pendentes',
              ].filter(Boolean).join('. ')}
            >
              <span className="flex items-center gap-2.5 h-9 w-full">
                <span className="icon-tile size-9" aria-hidden><Inbox size={18} /></span>
                <span className="text-body font-medium text-zinc-100 truncate">Aguardando ação</span>
                {metricasFiltradas && <span className="badge-brand ml-auto" title={resumoEscopo.join('\n')}>Filtrado</span>}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-metric font-semibold tabular-nums text-zinc-100">{pendentesEscopo}</span>
                <span className="text-body text-zinc-400 tabular-nums">{resolvidasEscopo.toLocaleString('pt-BR')} resolvidas</span>
              </span>
              {criticosEscopo > 0 && <span className="badge-danger-soft self-start !h-7 !px-3 !text-caption !leading-4 mt-0.5">{criticosEscopo} com atraso crítico</span>}
            </button>

            <GraficoResolucoes serie={metricas.serie} max={metricas.max} />

            <div className={`${CARD} p-4`}>
              <h2 className="flex items-center gap-2.5 text-body font-semibold text-zinc-300 mb-2">
                <span className="icon-tile size-7" aria-hidden><Clock size={14} /></span>
                Tempo médio de resolução
              </h2>
              <dl className="text-body">
                {([['Últimos 7 dias', metricas.media7], ['Últimos 30 dias', metricas.media30], ['Geral', metricas.mediaGeral]] as const).map(([r, v], i) => (
                  <div key={r} className={`flex items-center justify-between py-2 ${i < 2 ? 'border-b border-zinc-800' : ''}`}>
                    <dt className="text-zinc-400">{r}</dt>
                    <dd className="tabular-nums text-right text-zinc-100 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-caption text-zinc-400">Da chegada da notificação até ser arquivada.</p>
            </div>
          </aside>
        </div>
      </div>

      {/* Reprovar: motivo obrigatório (mesma regra do Kanban do Sienge) */}
      {reprovando && (
        <DialogoReprovar
          itens={reprovando}
          onCancelar={() => setReprovando(null)}
          onConfirmar={(motivo) => { decidir(reprovando, 'reprovar', motivo); setReprovando(null); }}
        />
      )}

      <ConfirmModal
        isOpen={confirmacao === 'arquivar_pendentes'}
        title={`Arquivar ${totalPendentes} ${totalPendentes === 1 ? 'notificação' : 'notificações'}?`}
        message="Todas as pendentes vão para o Histórico. Nenhuma aprovação é feita; você pode devolvê-las depois."
        confirmText="Arquivar todas"
        onCancel={() => setConfirmacao(null)}
        onConfirm={() => {
          const todos = [...itensAtivos, ...itensAdiados].filter(i => !ocultos.has(i.id));
          setConfirmacao(null);
          arquivar(todos);
        }}
      />
      <ConfirmModal
        isOpen={confirmacao === 'excluir_historico'}
        title={`Excluir ${totalResolvidas} ${totalResolvidas === 1 ? 'notificação' : 'notificações'} do histórico?`}
        message="Elas serão apagadas definitivamente e as métricas de tempo médio recomeçam do zero. Esta ação não pode ser desfeita."
        confirmText="Excluir histórico"
        onCancel={() => setConfirmacao(null)}
        onConfirm={() => { setConfirmacao(null); clearArchived(); }}
      />

      {preferenciasAbertas && (
        <PreferencesModal
          onClose={() => setPreferenciasAbertas(false)}
          onSaved={() => mostrarToast({ mensagem: 'Preferências de notificação salvas' })}
        />
      )}

      {/* Toast com Desfazer */}
      <div aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]">
        {toast && (
          <div key={toast.id} className={`flex items-center gap-3 bg-[#18181b] border ${toast.erro ? 'border-red-500/40 text-red-300' : 'border-zinc-700 text-zinc-100'} text-body px-4 py-2.5 rounded-xl shadow-2xl animate-slide-up`}>
            {toast.erro ? <X size={16} className="text-red-400" aria-hidden /> : <Check size={16} className="text-emerald-400" aria-hidden />}
            <span>{toast.mensagem}</span>
            {toast.desfazer && (
              <button type="button" onClick={toast.desfazer} className={`font-semibold text-blue-400 hover:text-blue-300 rounded px-1 ${FOCO}`}>
                Desfazer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────

function BotaoIcone({ rotulo, onClick, ativo, children }: { rotulo: string; onClick: () => void; ativo?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={`size-8 inline-flex items-center justify-center rounded-lg transition-colors ${ativo ? 'text-blue-400' : 'text-zinc-400 hover:text-zinc-100'} hover:bg-[#1f1f23] ${FOCO}`}
    >
      {children}
    </button>
  );
}

function MenuCabecalho({ aberto, setAberto, itens }: {
  aberto: boolean;
  setAberto: (v: boolean) => void;
  itens: { rotulo: string; icone: typeof Bell; onClick: () => void; perigo?: boolean; desabilitado?: boolean }[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto, setAberto]);
  return (
    <div className="relative" ref={ref}>
      <button
        ref={botao}
        type="button"
        aria-label="Mais ações"
        title="Mais ações"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
        className={`size-8 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] ${FOCO}`}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-64 p-1 bg-[#18181b] border border-zinc-700 rounded-lg shadow-xl z-30">
          {itens.map(i => (
            <button
              key={i.rotulo}
              type="button"
              role="menuitem"
              disabled={i.desabilitado}
              // Devolve o foco ao botão antes: o diálogo aberto daqui volta para ele.
              onClick={() => { setAberto(false); botao.current?.focus(); i.onClick(); }}
              className={`w-full flex items-center gap-2 h-9 px-2.5 rounded-md text-body text-left disabled:opacity-50 ${i.perigo ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-200 hover:bg-[#1f1f23]'} ${FOCO}`}
            >
              <i.icone size={16} aria-hidden /> {i.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DialogoReprovar({ itens, onCancelar, onConfirmar }: { itens: ItemInbox[]; onCancelar: () => void; onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const titulo = itens.length === 1 ? `Reprovar título ${itens[0].identificador ?? ''}` : `Reprovar ${itens.length} títulos`;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={onCancelar}
      onKeyDown={e => { if (e.key === 'Escape') onCancelar(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reprovar-titulo"
        className="bg-[#18181b] border border-zinc-700 rounded-xl p-5 flex flex-col gap-3 w-full max-w-[400px] shadow-2xl animate-slide-up"
        onMouseDown={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (motivo.trim()) onConfirmar(motivo.trim()); }}
      >
        <div>
          <h3 id="reprovar-titulo" className="text-heading font-semibold text-zinc-100 flex items-center gap-2">
            <X className="text-red-400" size={16} aria-hidden /> {titulo}
          </h3>
          <p className="text-body text-zinc-400 mt-1">Informe o motivo da recusa. Ele fica registrado {itens.length === 1 ? 'no título' : 'em cada título'}.</p>
        </div>
        <label className="sr-only" htmlFor="motivo-recusa">Motivo da recusa</label>
        <textarea
          id="motivo-recusa"
          autoFocus
          required
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (motivo.trim()) onConfirmar(motivo.trim()); } }}
          placeholder="Descreva o motivo da recusa…"
          rows={3}
          className={`w-full bg-[#121214] border border-zinc-550 rounded-lg px-3 py-2 text-body text-zinc-100 placeholder:text-zinc-500 resize-none ${FOCO}`}
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className={`h-8 px-3 rounded-lg border border-zinc-550 text-body text-zinc-200 hover:bg-[#1f1f23] ${FOCO}`}>Cancelar</button>
          <button type="submit" disabled={!motivo.trim()} className={`h-8 px-3 rounded-lg btn-danger-soft text-body font-medium disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`}>
            Reprovar
          </button>
        </div>
      </form>
    </div>
  );
}

function GraficoResolucoes({ serie, max }: { serie: { chave: string; rotulo: string; data: Date; valor: number }[]; max: number }) {
  const [foco, setFoco] = useState<string | null>(null);
  const vazio = max === 0;
  // Escala com teto "redondo" para o eixo Y (0, metade, topo).
  const topo = vazio ? 1 : max <= 4 ? max : Math.ceil(max / 2) * 2;
  const ticks = topo <= 1 ? [topo, 0] : [topo, topo / 2, 0];
  const total = serie.reduce((s, d) => s + d.valor, 0);

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-body font-semibold text-zinc-300">Volume de resoluções (7 dias)</h2>
        {!vazio && <span className="text-caption text-zinc-400 tabular-nums">{total} no total</span>}
      </div>
      {vazio ? (
        <div className="h-24 flex items-center justify-center rounded-lg border border-dashed border-zinc-700">
          <p className="text-body text-zinc-400">Nenhuma resolução nos últimos 7 dias</p>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Eixo Y */}
          <div className="flex flex-col justify-between h-32 text-caption text-zinc-400 tabular-nums text-right w-6 shrink-0" aria-hidden>
            {ticks.map(t => <span key={t} className="leading-none">{Number.isInteger(t) ? t : t.toFixed(1)}</span>)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative h-32 border-b border-zinc-550">
              {/* Grade recessiva */}
              {ticks.slice(0, -1).map(t => (
                <div key={t} className="absolute inset-x-0 border-t border-zinc-800" style={{ top: `${(1 - t / topo) * 100}%` }} aria-hidden />
              ))}
              <ul className="absolute inset-0 flex items-end justify-between gap-1.5" aria-label="Resoluções por dia">
                {serie.map(d => {
                  const altura = d.valor === 0 ? 0 : Math.max((d.valor / topo) * 100, 3);
                  const ativo = foco === d.chave;
                  const rotulo = `${d.data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}: ${d.valor} ${d.valor === 1 ? 'resolução' : 'resoluções'}`;
                  return (
                    <li
                      key={d.chave}
                      tabIndex={0}
                      aria-label={rotulo}
                      onMouseEnter={() => setFoco(d.chave)}
                      onMouseLeave={() => setFoco(null)}
                      onFocus={() => setFoco(d.chave)}
                      onBlur={() => setFoco(null)}
                      className={`relative flex-1 h-full flex items-end justify-center rounded ${FOCO}`}
                    >
                      <div
                        className={`chart-fill w-full max-w-[28px] rounded-t-[4px] transition-[filter] ${ativo ? 'brightness-125' : ''}`}
                        style={{ height: `${altura}%` }}
                      />
                      {ativo && (
                        <div role="tooltip" className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1f1f23] border border-zinc-700 text-zinc-100 text-caption px-2 py-1 rounded shadow-lg z-10 pointer-events-none">
                          <span className="capitalize">{d.data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                          {' · '}<span className="tabular-nums font-medium">{d.valor}</span> {d.valor === 1 ? 'resolução' : 'resoluções'}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex justify-between gap-1.5 mt-1.5" aria-hidden>
              {serie.map(d => <span key={d.chave} className="flex-1 text-center text-caption text-zinc-400 capitalize">{d.rotulo}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

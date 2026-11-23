// Tela Projetos: indicadores (padrão do Início), barra de filtros (padrão de
// Minhas tarefas) e a lista em um card com abas de status (padrão da Caixa de entrada).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Calendar, Folder, FolderMinus, Layers, Pencil, Plus, Search, Settings2, Target, UserRound, X,
} from 'lucide-react';
import { Task } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useMarketingProjetos, useEmpreendimentos, maiorPrazo, validarDatasProjeto, MarketingProjeto } from '../../lib/marketingProjetos';
import {
  ENTREGA_PROXIMA_DIAS, casaAba, casaFiltros, comTarefaAtrasada, entregaProxima, gravarPrefs,
  lerPrefs, montarLinhas, montarSemProjeto, ordenar, SEM_PROJETO, percentual, resumir,
  type AbaProjetos, type Foco, type LinhaProjeto, type Ordem, type PrefsProjetos,
} from '../../lib/projetosLista';
import { formatarDataCompleta, formatarDataCurta, tarefaConcluida } from '../../lib/prazo';
import { PRIORIDADE_INFO, PrioridadeBadge } from '../TarefaBadges';
import DatePicker from '../DatePicker';
import { MenuEmpreendimentos, MenuPrioridade, textoEmpreendimentos } from './ProjetoCampos';
import KpiCard, { BOTAO_KPI, LINK_KPI } from '../KpiCard';
import { BarraStatus, SegmentoStatus } from '../HomeGraficos';
import { ALTURA, FOCO, GATILHO } from '../inbox/BarraFiltros';
import { Segmentos, useFecharFora } from '../lista/ListaBarra';
import { ProjetoModal } from './ProjetoModais';
import { ChipStatus, EntregaProjeto, ProgressoLinha } from './ProjetoBadges';
import { useMembrosProjeto, AvataresMembros } from './MembrosProjeto';

const EASE = 'duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]';
const CARD = 'bg-[#121214] border border-zinc-900 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]';
const BOTAO_ACAO = `size-7 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition ${EASE} ${FOCO}`;
const BOTAO_SECUNDARIO = `inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-3 rounded-lg border border-white/10 text-body font-medium text-zinc-200 hover:bg-[#161619] active:scale-[0.98] transition ${EASE} ${FOCO}`;

// Pela largura da lista (não da janela: o menu lateral recolhe). Entram, nesta ordem:
// 640 Prioridade, Início e Entrega · 860 Empreendimento e Progresso · 1020 Em aberto ·
// 1340 Membros. O que não cabe vira texto sob o nome.
const COLUNAS =
  '@[640px]:grid-cols-[minmax(0,1fr)_92px_64px_132px_72px] ' +
  '@[860px]:grid-cols-[minmax(0,15fr)_92px_minmax(0,11fr)_minmax(0,14fr)_64px_132px_72px] ' +
  '@[1020px]:grid-cols-[minmax(0,19fr)_92px_minmax(0,12fr)_minmax(0,15fr)_92px_64px_132px_72px] ' +
  '@[1340px]:grid-cols-[minmax(0,24fr)_92px_minmax(0,14fr)_minmax(0,16fr)_92px_104px_64px_132px_72px]';

const ABAS: { id: AbaProjetos; label: string }[] = [
  { id: 'ativo', label: 'Ativos' },
  { id: 'pausado', label: 'Pausados' },
  { id: 'concluido', label: 'Concluídos' },
  { id: 'todos', label: 'Todos' },
];

const ROTULO_FOCO: Record<Foco, string> = {
  vencidas: 'Entrega vencida',
  proximas: `Entrega em até ${ENTREGA_PROXIMA_DIAS} dias`,
  com_atraso: 'Com tarefas atrasadas',
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

// ─── Linha ───────────────────────────────────────────────────────────

/** Célula editável: parece texto, mostra que é clicável no hover/foco. */
const CELULA = `-mx-2 px-2 h-8 [@media(pointer:coarse)]:h-10 max-w-[calc(100%+1rem)] min-w-0 inline-flex items-center gap-1.5 rounded-md text-body text-left transition-colors hover:bg-[#1f1f23] disabled:cursor-default ${FOCO}`;

/** Não deixa o clique na célula abrir o projeto (a linha inteira é um atalho). */
const Celula = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <div onClick={e => e.stopPropagation()} className={className}>{children}</div>
);

const Vazio = () => <span className="text-zinc-500">—</span>;

function Linha({ linha: l, mostrarStatus, ultima, podeEditar, empreendimentos, onAbrir, onEditar, onAlterar }: {
  linha: LinhaProjeto;
  mostrarStatus: boolean;
  ultima: boolean;
  podeEditar: boolean;
  empreendimentos: { id: string; name: string }[];
  onAbrir: () => void;
  onEditar: () => void;
  onAlterar: (mudanca: Partial<MarketingProjeto>) => void;
}) {
  const p = l.projeto;
  const membros = useMembrosProjeto(p.id, l.tarefas);
  const concluido = p.status === 'concluido';
  const semProjeto = p.id === SEM_PROJETO;
  const editavel = podeEditar && !semProjeto;
  const abertas = l.resumo.total - l.resumo.concluidas;
  const nomesEmp = l.empreendimentos.map(e => e.name);

  return (
    <li
      // Clique na linha abre o projeto (atalho de mouse); pelo teclado o alvo é
      // o botão do nome, sem botões aninhados.
      onClick={onAbrir}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] ${COLUNAS} items-center gap-3 px-4 min-h-14 py-2 cursor-pointer hover:bg-[#161619] focus-within:bg-[#161619] transition-colors ${EASE} ${ultima ? 'rounded-b-2xl' : ''}`}
    >
      {/* Projeto: pasta + nome + descrição */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {semProjeto
            ? <FolderMinus size={15} className="shrink-0 text-zinc-500" aria-hidden />
            : <Folder size={15} className="shrink-0" style={{ color: p.cor }} aria-hidden />}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onAbrir(); }}
            title={p.nome}
            className={`min-w-0 truncate text-left text-body font-medium rounded ${FOCO} ${concluido ? 'text-zinc-400' : semProjeto ? 'text-zinc-300' : 'text-zinc-100'}`}
          >
            {p.nome}
          </button>
          {mostrarStatus && p.status !== 'ativo' && <ChipStatus status={p.status} />}
        </div>
        {/* Colunas que não couberam (empreendimentos) + descrição. */}
        <p className="hidden @[640px]:block pl-[23px] text-caption text-zinc-400 truncate" title={p.descricao || undefined}>
          {nomesEmp.length > 0 && <span className="@[860px]:hidden">{nomesEmp.join(', ')}{p.descricao && ' · '}</span>}
          {p.descricao}
        </p>
        {/* Celular: as colunas que somem viram linhas de metadados. */}
        {(p.prioridade !== 'no_priority' || nomesEmp.length > 0 || p.dataInicio) && (
          <p className="@[640px]:hidden pl-[23px] flex items-center gap-1.5 min-w-0 text-caption text-zinc-400">
            <PrioridadeBadge prioridade={p.prioridade} compacto />
            <span className="truncate tabular-nums">
              {[nomesEmp.join(', '), p.dataInicio && `Início ${formatarDataCurta(p.dataInicio)}`].filter(Boolean).join(' · ')}
            </span>
          </p>
        )}
        <p className="@[640px]:hidden pl-[23px] text-caption text-zinc-400 truncate tabular-nums">
          {semProjeto ? `${abertas} ${plural(abertas, 'aberta', 'abertas')}`
            : l.resumo.total > 0 ? `${l.resumo.concluidas}/${l.resumo.total} concluídas` : 'Sem tarefas'}
          {l.resumo.atrasadas > 0 && !concluido && <span className="text-red-400 font-medium"> · {l.resumo.atrasadas} {plural(l.resumo.atrasadas, 'atrasada', 'atrasadas')}</span>}
        </p>
      </div>

      {/* Prioridade */}
      <Celula className="hidden @[640px]:flex min-w-0">
        {editavel ? (
          <MenuPrioridade
            valor={p.prioridade}
            onChange={v => onAlterar({ prioridade: v })}
            rotulo={`Prioridade de ${p.nome}: ${PRIORIDADE_INFO[p.prioridade].label}. Alterar`}
            classe={CELULA}
            gatilho={<PrioridadeBadge prioridade={p.prioridade} plano />}
          />
        ) : semProjeto ? <Vazio /> : <PrioridadeBadge prioridade={p.prioridade} plano />}
      </Celula>

      {/* Empreendimentos */}
      <Celula className="hidden @[860px]:flex min-w-0">
        {editavel ? (
          <MenuEmpreendimentos
            valor={p.empreendimentoIds}
            opcoes={empreendimentos}
            onChange={ids => onAlterar({ empreendimentoIds: ids })}
            rotulo={`Empreendimentos de ${p.nome}: ${nomesEmp.join(', ') || 'nenhum'}. Alterar`}
            classe={CELULA}
            gatilho={nomesEmp.length
              ? <span className="truncate text-zinc-300" title={nomesEmp.join(', ')}>{textoEmpreendimentos(nomesEmp)}</span>
              : <Vazio />}
          />
        ) : nomesEmp.length
          ? <span className="truncate text-body text-zinc-300" title={nomesEmp.join(', ')}>{textoEmpreendimentos(nomesEmp)}</span>
          : <span className="text-body"><Vazio /></span>}
      </Celula>

      <div className="hidden @[860px]:block min-w-0">
        {semProjeto ? <span className="text-body"><Vazio /></span> : l.resumo.total > 0
          ? <ProgressoLinha concluidas={l.resumo.concluidas} total={l.resumo.total} cor={p.cor} />
          : <span className="text-body text-zinc-500">Sem tarefas</span>}
      </div>

      {/* Tarefas em aberto */}
      <div className="hidden @[1020px]:flex flex-col min-w-0 text-body tabular-nums">
        {abertas > 0 ? (
          <>
            <span className="text-zinc-200 truncate">{abertas} {plural(abertas, 'aberta', 'abertas')}</span>
            {l.resumo.atrasadas > 0 && !concluido && (
              <span className="text-caption text-red-400 font-medium truncate">{l.resumo.atrasadas} {plural(l.resumo.atrasadas, 'atrasada', 'atrasadas')}</span>
            )}
          </>
        ) : <span className="text-zinc-500">Nenhuma</span>}
      </div>

      <div className="hidden @[1340px]:block"><AvataresMembros membros={membros} max={4} /></div>

      {/* Início */}
      <Celula className="hidden @[640px]:flex justify-end min-w-0">
        {editavel ? (
          <DatePicker
            value={p.dataInicio ?? ''}
            onChange={d => onAlterar({ dataInicio: d.slice(0, 10) || null })}
            maxDate={p.dataEntrega}
            align="right"
            trigger={
              <button
                type="button"
                aria-label={`Início de ${p.nome}: ${p.dataInicio ? formatarDataCompleta(p.dataInicio) : 'sem data'}. Alterar`}
                title={p.dataInicio ? `Início: ${formatarDataCompleta(p.dataInicio)}` : 'Definir início'}
                className={`${CELULA} justify-end tabular-nums whitespace-nowrap ${p.dataInicio && !concluido ? 'text-zinc-400' : 'text-zinc-500'}`}
              >
                {p.dataInicio ? formatarDataCurta(p.dataInicio) : '—'}
              </button>
            }
          />
        ) : (
          <span
            className={`text-body tabular-nums whitespace-nowrap ${p.dataInicio && !concluido ? 'text-zinc-400' : 'text-zinc-500'}`}
            title={p.dataInicio ? `Início: ${formatarDataCompleta(p.dataInicio)}` : 'Sem data de início'}
          >
            {p.dataInicio ? formatarDataCurta(p.dataInicio) : '—'}
          </span>
        )}
      </Celula>

      {/* Entrega */}
      <Celula className="flex justify-end min-w-0">
        {editavel ? (
          <DatePicker
            value={p.dataEntrega ?? ''}
            onChange={d => onAlterar({ dataEntrega: d.slice(0, 10) || null })}
            align="right"
            trigger={
              <button
                type="button"
                aria-label={`Entrega de ${p.nome}: ${l.entrega ? formatarDataCompleta(l.entrega) : 'sem data'}. Alterar`}
                className={`${CELULA} justify-end`}
              >
                <EntregaProjeto entrega={l.entrega} diasAtraso={l.diasAtraso} concluido={concluido} />
              </button>
            }
          />
        ) : (
          <EntregaProjeto entrega={l.entrega} diasAtraso={l.diasAtraso} concluido={concluido} />
        )}
      </Celula>

      {/* Ações, sempre visíveis */}
      <div onClick={e => e.stopPropagation()} className="hidden @[640px]:flex items-center justify-end gap-0.5">
        {editavel && (
          <button type="button" aria-label={`Editar projeto ${p.nome}`} title="Editar projeto" className={BOTAO_ACAO} onClick={onEditar}>
            <Pencil size={14} aria-hidden />
          </button>
        )}
        <button type="button" aria-label={semProjeto ? 'Ver tarefas sem projeto alocado' : `Abrir projeto ${p.nome}`} title={semProjeto ? 'Ver tarefas sem projeto' : 'Abrir projeto'} className={BOTAO_ACAO} onClick={onAbrir}>
          <ArrowUpRight size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

// ─── Abas de status ──────────────────────────────────────────────────

function AbasStatus({ aba, onAba, contagem, idPainel }: {
  aba: AbaProjetos; onAba: (a: AbaProjetos) => void; contagem: Record<AbaProjetos, number>; idPainel: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ABAS.findIndex(a => a.id === aba);
    const alvo = e.key === 'ArrowRight' ? (i + 1) % ABAS.length
      : e.key === 'ArrowLeft' ? (i - 1 + ABAS.length) % ABAS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? ABAS.length - 1 : -1;
    if (alvo < 0) return;
    e.preventDefault();
    onAba(ABAS[alvo].id);
    raiz.current?.querySelectorAll<HTMLElement>('[role="tab"]')[alvo]?.focus();
  };
  return (
    <div className="min-w-0 overflow-x-auto no-scrollbar">
      <div ref={raiz} role="tablist" aria-label="Status do projeto" onKeyDown={onKeyDown} className="flex w-max">
        {ABAS.map(a => {
          const ativa = a.id === aba;
          const n = contagem[a.id];
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              aria-controls={idPainel}
              aria-label={`${a.label}, ${n} ${plural(n, 'projeto', 'projetos')}`}
              tabIndex={ativa ? 0 : -1}
              onClick={() => onAba(a.id)}
              className={`relative shrink-0 h-12 px-2.5 inline-flex items-center gap-1.5 text-body font-medium transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 ${
                ativa ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {a.label}
              {n > 0 && <span className="badge-neutral">{n}</span>}
              {ativa && <span className="tab-underline absolute inset-x-2.5 bottom-0" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tela ────────────────────────────────────────────────────────────

export default function ProjetosView({ tasks, onAbrirProjeto, onAbrirTodas, podeEditar, novoProjeto, onNovoProjetoAtendido }: {
  tasks: Task[];
  onAbrirProjeto: (id: string) => void;
  onAbrirTodas: () => void;
  podeEditar: boolean;
  /** "Novo projeto" do header: abre o formulário de criação ao montar. */
  novoProjeto?: boolean;
  onNovoProjetoAtendido?: () => void;
}) {
  const { currentUser } = useAuth();
  const { projetos, projetoDaTarefa, membrosDoProjeto, carregando, recarregar, alterarProjeto } = useMarketingProjetos();
  // Aviso de edição na lista (data fora da regra, erro ao gravar).
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null);
  const avisar = (texto: string) => {
    const id = Date.now();
    setAviso({ id, texto });
    setTimeout(() => setAviso(a => a?.id === id ? null : a), 6000);
  };
  const alterar = (l: LinhaProjeto, mudanca: Partial<MarketingProjeto>) => {
    if ("dataInicio" in mudanca || "dataEntrega" in mudanca) {
      const novo = { ...l.projeto, ...mudanca };
      const problema = validarDatasProjeto({
        dataInicio: novo.dataInicio, dataEntrega: novo.dataEntrega, maiorTarefa: maiorPrazo(l.tarefas),
      });
      if (problema) { avisar(problema); return; }
    }
    alterarProjeto(l.projeto, mudanca).catch((e: any) => avisar(e?.message || "Não foi possível salvar o projeto."));
  };
  const empreendimentos = useEmpreendimentos();
  const usuarioId = currentUser?.id ?? 'anon';

  const [prefs, setPrefs] = useState<PrefsProjetos>(() => lerPrefs(usuarioId));
  const mudarPrefs = (p: Partial<PrefsProjetos>) => setPrefs(atual => ({ ...atual, ...p }));
  useEffect(() => { gravarPrefs(usuarioId, prefs); }, [usuarioId, prefs]);

  const [busca, setBusca] = useState('');
  const [foco, setFoco] = useState<Foco | null>(null);
  const [abaEscolhida, setAbaEscolhida] = useState<AbaProjetos | null>(null);
  const [editando, setEditando] = useState<MarketingProjeto | null | 'novo'>(null);
  const [exibicaoAberta, setExibicaoAberta] = useState(false);
  const exibicaoRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLElement>(null);
  useFecharFora(exibicaoRef, exibicaoAberta, () => setExibicaoAberta(false));

  useEffect(() => {
    if (!novoProjeto) return;
    if (podeEditar) setEditando('novo');
    onNovoProjetoAtendido?.();
  }, [novoProjeto, podeEditar, onNovoProjetoAtendido]);

  const linhas = useMemo(
    () => montarLinhas({ projetos, tasks, projetoDaTarefa, membrosDoProjeto, empreendimentos, usuarioId: currentUser?.id }),
    [projetos, tasks, projetoDaTarefa, membrosDoProjeto, empreendimentos, currentUser?.id],
  );
  // Sem as ligações carregadas, toda tarefa pareceria solta.
  const linhaSemProjeto = useMemo(
    () => carregando ? null : montarSemProjeto({ tasks, projetoDaTarefa, usuarioId: currentUser?.id }),
    [carregando, tasks, projetoDaTarefa, currentUser?.id],
  );

  // ── Indicadores: seguem "Só os meus", não a busca nem a aba. ──
  const escopo = linhas.filter(l => casaFiltros(l, { busca: '', soMeus: prefs.soMeus, foco: null }));
  const ativos = escopo.filter(l => l.projeto.status === 'ativo');
  const vencidas = escopo.filter(l => l.diasAtraso > 0);
  const maiorAtraso = Math.max(0, ...vencidas.map(l => l.diasAtraso));
  const proximas = ordenar(escopo.filter(l => entregaProxima(l)), 'entrega');
  const semData = escopo.filter(l => l.projeto.status !== 'concluido' && !l.entrega).length;
  const comAtraso = ativos.filter(comTarefaAtrasada);
  const tarefasAtivas = ativos.flatMap(l => l.tarefas);
  const resumoAtivos = resumir(tarefasAtivas);
  const pctAtivos = percentual(resumoAtivos);
  const abertas = tarefasAtivas.filter(t => !tarefaConcluida(t.status));
  const conta = (...s: Task['status'][]) => abertas.filter(t => s.includes(t.status)).length;
  // Escala do acento para o que anda, neutros para o que está parado (igual ao Início).
  const segmentos: SegmentoStatus[] = [
    { id: 'andamento', label: 'Em andamento', valor: conta('in_progress', 'rework', 'implementation'), cor: 'var(--color-blue-500)' },
    { id: 'aprovacao', label: 'Em aprovação', valor: conta('approval'), cor: 'var(--color-blue-300)' },
    { id: 'pausadas', label: 'Pausadas', valor: conta('paused'), cor: 'var(--color-zinc-500)' },
    { id: 'nao-iniciadas', label: 'Não iniciadas', valor: conta('todo', 'no_forecast'), cor: 'var(--color-zinc-700)' },
  ];

  // ── Lista ──
  const filtradas = linhas.filter(l => casaFiltros(l, { busca, soMeus: prefs.soMeus, foco }));
  const contagem = Object.fromEntries(ABAS.map(a => [a.id, filtradas.filter(l => casaAba(l, a.id)).length])) as Record<AbaProjetos, number>;
  // Sem escolha do usuário, abre em Ativos (ou Todos, se não houver ativo algum).
  const aba: AbaProjetos = abaEscolhida ?? (linhas.length > 0 && !linhas.some(l => l.projeto.status === 'ativo') ? 'todos' : 'ativo');
  const visiveis = ordenar(filtradas.filter(l => casaAba(l, aba)), prefs.ordem);
  // Última linha de Ativos (e Todos); não é projeto, então não entra na contagem nem nos indicadores.
  const semProjetoVisivel = linhaSemProjeto && !foco && (aba === 'ativo' || aba === 'todos')
    && casaFiltros(linhaSemProjeto, { busca, soMeus: prefs.soMeus, foco: null }) ? linhaSemProjeto : null;

  const trocarAba = (a: AbaProjetos) => { setAbaEscolhida(a); setFoco(null); };
  const focar = (f: Foco) => {
    setFoco(f);
    setBusca('');
    setAbaEscolhida('todos');
    requestAnimationFrame(() => listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  // Sem o recorte, volta para a aba padrão.
  const limparFoco = () => { setFoco(null); setAbaEscolhida(null); };
  const temFiltros = prefs.soMeus;
  const limpar = () => { mudarPrefs({ soMeus: false }); setBusca(''); if (foco) limparFoco(); };

  const abertosTotal = linhas.filter(l => l.projeto.status !== 'concluido').length;
  const vencidasTotal = linhas.filter(l => l.diasAtraso > 0).length;
  const semProjeto = linhaSemProjeto ? linhaSemProjeto.resumo.total - linhaSemProjeto.resumo.concluidas : 0;

  const nenhumProjeto = !carregando && projetos.length === 0;

  return (
    <div className="flex-1 overflow-auto bg-[#08080a] text-zinc-200 scrollbar-minimal">
      <div className="max-w-[1600px] w-full mx-auto view-pad-x pt-5 short:pt-3 pb-6 flex flex-col gap-4">

        {/* 1. Título. O CTA único ("Novo projeto") fica na barra da lista, ao lado da Exibição. */}
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-title font-semibold text-zinc-100">Projetos</h1>
            <p className="text-body text-zinc-400 tabular-nums">
              {carregando ? 'Carregando…' : `${abertosTotal} em aberto · ${vencidasTotal} com entrega vencida`}
            </p>
          </div>
          <button type="button" onClick={onAbrirTodas} title="Quadro com as tarefas de todos os projetos" className={`${GATILHO(false)} shrink-0 font-medium`}>
            <Layers size={14} className="shrink-0" aria-hidden />
            <span className="truncate">Todas as tarefas</span>
            {semProjeto > 0 && (
              <span className="text-zinc-400 font-normal tabular-nums whitespace-nowrap">· {semProjeto} sem projeto</span>
            )}
          </button>
        </header>

        {nenhumProjeto ? (
          <section className={`${CARD} flex flex-col items-center justify-center text-center px-6 py-16`}>
            <span className="size-10 inline-flex items-center justify-center rounded-xl bg-[#1f1f23] border border-white/10">
              <Folder size={18} className="text-zinc-400" aria-hidden />
            </span>
            <p className="mt-3 text-body font-medium text-zinc-200">Nenhum projeto ainda</p>
            <p className="mt-1 text-caption text-zinc-400 max-w-[40ch]">Um projeto reúne tarefas em lista, Kanban e cronograma, com data de entrega e membros.</p>
            {podeEditar && (
              <button type="button" onClick={() => setEditando('novo')} className={`mt-4 ${BOTAO_SECUNDARIO}`}>
                <Plus size={14} aria-hidden /> Criar projeto
              </button>
            )}
          </section>
        ) : (
          <>
            {/* 2. Indicadores: mesma altura e padding, o que está vencido primeiro. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 view-gap-sm">
              <KpiCard
                icone={AlertTriangle}
                titulo="Entrega vencida"
                alerta={vencidas.length > 0}
                rodape={vencidas.length > 0 ? (
                  <button type="button" onClick={() => focar('vencidas')} className={BOTAO_KPI}>
                    Revisar vencidas <ArrowRight size={14} aria-hidden />
                  </button>
                ) : <span className="text-caption text-zinc-400">Nenhuma entrega vencida</span>}
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className={`text-metric font-semibold tabular-nums ${vencidas.length > 0 ? 'text-red-400' : 'text-zinc-50'}`}>{vencidas.length}</span>
                  {vencidas.length > 0 && (
                    <span className="text-caption text-zinc-400 truncate">
                      mais antiga há <span className="tabular-nums">{maiorAtraso}</span> {plural(maiorAtraso, 'dia', 'dias')}
                    </span>
                  )}
                </div>
              </KpiCard>

              <KpiCard
                icone={Calendar}
                titulo={`Entregas em ${ENTREGA_PROXIMA_DIAS} dias`}
                rodape={proximas.length > 0 ? (
                  <button type="button" onClick={() => focar('proximas')} className={LINK_KPI}>
                    Ver próximas <ArrowRight size={12} aria-hidden />
                  </button>
                ) : <span className="text-caption text-zinc-400">Nada previsto no período</span>}
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-metric font-semibold tabular-nums text-zinc-50">{proximas.length}</span>
                  <span className="text-caption text-zinc-400 truncate tabular-nums">
                    {proximas[0]?.entrega ? `próxima em ${formatarDataCurta(proximas[0].entrega)}` : semData > 0 ? `${semData} sem data` : ''}
                  </span>
                </div>
              </KpiCard>

              <KpiCard
                icone={Layers}
                titulo="Tarefas em aberto"
                rodape={
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {segmentos.map(s => (
                      <li key={s.id} className="inline-flex items-center gap-1.5 text-caption text-zinc-400">
                        <span className="size-2 rounded-full shrink-0" style={{ background: s.cor }} aria-hidden />
                        <span>{s.label} <span className="tabular-nums font-medium text-zinc-200">{s.valor}</span></span>
                      </li>
                    ))}
                  </ul>
                }
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-metric font-semibold tabular-nums text-zinc-50">{abertas.length}</span>
                  <span className="text-caption text-zinc-400 truncate tabular-nums">
                    em {ativos.length} {plural(ativos.length, 'projeto ativo', 'projetos ativos')}
                  </span>
                </div>
                <BarraStatus segmentos={segmentos} />
              </KpiCard>

              <KpiCard
                icone={Target}
                titulo="Progresso dos ativos"
                rodape={comAtraso.length > 0 ? (
                  <button type="button" onClick={() => focar('com_atraso')} className={LINK_KPI}>
                    {comAtraso.length} {plural(comAtraso.length, 'projeto', 'projetos')} com tarefas atrasadas <ArrowRight size={12} aria-hidden />
                  </button>
                ) : <span className="text-caption text-zinc-400">Nenhuma tarefa atrasada</span>}
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-metric font-semibold tabular-nums text-zinc-50">{pctAtivos}%</span>
                  <span className="text-caption text-zinc-400 truncate tabular-nums">
                    {resumoAtivos.concluidas} de {resumoAtivos.total} {plural(resumoAtivos.total, 'tarefa', 'tarefas')}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${pctAtivos}%` }} />
                </div>
              </KpiCard>
            </div>

            {/* 3. Busca, filtros e exibição */}
            <div role="search" aria-label="Filtros de Projetos" className="relative z-30 flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" aria-hidden />
                <input
                  type="search"
                  placeholder="Buscar projetos…"
                  aria-label="Buscar projetos"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className={`${ALTURA} w-full pl-8 pr-3 bg-[#121214] border border-zinc-800 text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/60`}
                />
              </div>
              <button
                type="button"
                aria-pressed={prefs.soMeus}
                title="Projetos em que você é membro ou tem tarefa"
                onClick={() => mudarPrefs({ soMeus: !prefs.soMeus })}
                className={GATILHO(prefs.soMeus)}
              >
                <UserRound size={14} className="shrink-0" aria-hidden /> Só os meus
              </button>
              {temFiltros && (
                <button type="button" onClick={limpar} aria-label="Limpar filtros" className={`${ALTURA} shrink-0 px-2 text-zinc-400 hover:text-zinc-100 hover:underline underline-offset-2 ${FOCO}`}>
                  Limpar
                </button>
              )}

              <div className="relative ml-auto flex items-center gap-2" ref={exibicaoRef}>
                <button
                  type="button"
                  aria-label="Exibição"
                  title="Exibição"
                  aria-haspopup="dialog"
                  aria-expanded={exibicaoAberta}
                  onClick={() => setExibicaoAberta(o => !o)}
                  className={`size-9 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-lg transition-colors hover:bg-[#1f1f23] hover:text-zinc-100 ${exibicaoAberta ? 'bg-[#1f1f23] text-zinc-100' : 'text-zinc-300'} ${FOCO}`}
                >
                  <Settings2 size={15} aria-hidden />
                </button>
                {exibicaoAberta && (
                  <div role="dialog" aria-label="Opções de exibição" className="absolute right-0 top-full mt-1 w-72 max-w-[calc(100vw-32px)] z-50 p-3 flex flex-col gap-3 bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)]">
                    <Segmentos<Ordem> legenda="Ordenar por" valor={prefs.ordem} onChange={v => mudarPrefs({ ordem: v })}
                      opcoes={[{ id: 'entrega', rotulo: 'Entrega' }, { id: 'nome', rotulo: 'Nome' }, { id: 'progresso', rotulo: 'Progresso' }]} />
                  </div>
                )}
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => { setExibicaoAberta(false); setEditando('novo'); }}
                    className={`inline-flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-10 px-3 rounded-lg btn-brand active:scale-[0.98] text-body font-medium transition ${EASE} ${FOCO}`}
                  >
                    <Plus size={16} aria-hidden /> Novo projeto
                  </button>
                )}
              </div>
            </div>

            {/* 4. Lista */}
            <section ref={listaRef} aria-label="Lista de projetos" className={`${CARD} @container flex flex-col scroll-mt-4`}>
              <div className="flex items-center gap-3 px-3 border-b border-zinc-900 flex-wrap">
                <AbasStatus aba={aba} onAba={trocarAba} contagem={contagem} idPainel="projetos-lista" />
                {foco && (
                  <span className="ml-auto my-2 inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-blue-500/15 text-blue-300 text-caption font-medium">
                    {ROTULO_FOCO[foco]}
                    <button
                      type="button"
                      onClick={limparFoco}
                      aria-label={`Remover filtro ${ROTULO_FOCO[foco]}`}
                      className={`size-4 inline-flex items-center justify-center rounded-full hover:bg-blue-500/25 ${FOCO}`}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                )}
              </div>

              <div id="projetos-lista" role="tabpanel">
                {visiveis.length === 0 && !semProjetoVisivel ? (
                  <div className="flex flex-col items-center justify-center text-center px-6 py-14">
                    <span className="size-10 inline-flex items-center justify-center rounded-xl bg-[#1f1f23] border border-white/10">
                      <Folder size={18} className="text-zinc-400" aria-hidden />
                    </span>
                    {(() => {
                      const recorte = temFiltros || !!busca.trim() || !!foco;
                      const titulo = carregando ? 'Carregando…'
                        : recorte ? 'Nenhum projeto com estes filtros'
                        : aba === 'pausado' ? 'Nenhum projeto pausado'
                        : aba === 'concluido' ? 'Nenhum projeto concluído'
                        : 'Nenhum projeto ativo';
                      return (
                        <>
                          <p className="mt-3 text-body font-medium text-zinc-200">{titulo}</p>
                          {!carregando && recorte && (
                            <button type="button" onClick={limpar} className={`mt-4 ${BOTAO_SECUNDARIO}`}>Limpar filtros</button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <>
                    {/* Cabeçalho das colunas */}
                    <div aria-hidden className={`hidden @[640px]:grid ${COLUNAS} gap-3 px-4 py-2 text-caption font-medium text-zinc-500 border-b border-zinc-900`}>
                      <span>Projeto</span>
                      <span>Prioridade</span>
                      <span className="hidden @[860px]:block truncate">Empreendimentos</span>
                      <span className="hidden @[860px]:block">Progresso</span>
                      <span className="hidden @[1020px]:block">Em aberto</span>
                      <span className="hidden @[1340px]:block">Membros</span>
                      <span className="text-right">Início</span>
                      <span className="text-right">Entrega</span>
                      <span className="text-right">Ações</span>
                    </div>

                    <ul className="divide-y divide-zinc-900">
                      {visiveis.map((l, i) => (
                        <Linha
                          key={l.projeto.id}
                          linha={l}
                          mostrarStatus={aba === 'todos'}
                          ultima={!semProjetoVisivel && i === visiveis.length - 1}
                          podeEditar={podeEditar}
                          empreendimentos={empreendimentos}
                          onAbrir={() => onAbrirProjeto(l.projeto.id)}
                          onEditar={() => setEditando(l.projeto)}
                          onAlterar={m => alterar(l, m)}
                        />
                      ))}
                    </ul>

                    {semProjetoVisivel && (
                      <ul className={visiveis.length > 0 ? 'border-t border-zinc-900' : ''}>
                        <Linha
                          linha={semProjetoVisivel}
                          mostrarStatus={false}
                          ultima
                          podeEditar={false}
                          empreendimentos={empreendimentos}
                          onAbrir={() => onAbrirProjeto(SEM_PROJETO)}
                          onEditar={() => {}}
                          onAlterar={() => {}}
                        />
                      </ul>
                    )}
                  </>
                )}
              </div>
            </section>

          </>
        )}
      </div>

      {aviso && (
        <div role="alert" key={aviso.id} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] max-w-[calc(100vw-32px)] flex items-start gap-3 bg-[#18181b] border border-red-500/30 text-body text-zinc-100 pl-4 pr-2 py-2.5 rounded-xl shadow-2xl animate-slide-up">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" aria-hidden />
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className={`shrink-0 p-0.5 rounded text-zinc-400 hover:text-zinc-100 ${FOCO}`}>
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {editando && (
        <ProjetoModal
          projeto={editando === 'novo' ? null : editando}
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

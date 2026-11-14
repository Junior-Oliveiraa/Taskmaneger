import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Clock3, Flag, Lock, Pencil, Hourglass, Layers, MessageSquare, Paperclip, Plus, Repeat2, Send, Tag, ShieldAlert, ShieldCheck, ShieldX, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PropostaChat, { AvatarUsuario, SeletorResponsavel } from './PropostaChat';
import { Project, SiengeProjectDisplay, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao } from '../../types';
import NovaPropostaModal, { AutorizacaoResumo } from './NovaPropostaModal';
import {
  ComercialProposta, PROPOSTA_ETAPAS, PropostaEtapa, codigoProposta, definirResponsavelProposta, excluirProposta, podeEditarProposta,
  fetchComercialPropostas, fetchPropostaMensagens, moverProposta,
} from '../../lib/comercialApi';
import { usePermissoes } from '../../lib/permissoes';
import { moedaBr, numeroBr, percentualBr } from './PropostaCampos';
import { CrmButton } from '../crm/CrmShared';
import { BarraFiltrosPropostas, FiltroPropostas, ResumoPropostas, noPeriodo, passaFiltroFixo, useVgvDaProposta } from './PropostasResumo';
import { resolverAtalho } from './SeletorPeriodo';
import { hojeBrasilia } from '../../lib/cvComercial';

// Data pura (yyyy-mm-dd): formatada sem passar por Date, que a leria como UTC.
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;
const dataHoraBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
// "agora", "12 min", "3h 20min", "5d 4h": tempo desde a criação do card.
// Relógio da proposta: corre desde o cadastro e para quando ela chega a Venda/Perdido.
const tempoDaProposta = (p: ComercialProposta, agora: number) =>
  tempoDecorrido(p.createdAt, p.encerradaEm ? new Date(p.encerradaEm).getTime() : agora);
function tempoDecorrido(iso: string, agora: number) {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${String(min % 60).padStart(2, '0')}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// A aprovação é da proposta: o Diretor decide em "Em análise" (desconto incluído).
// Na contra proposta, o responsável aprova sozinho se não mexeu nela depois.
// Mesmas regras do trigger comercial_propostas_decisao (o banco também recusa).
function bloqueioEtapa(p: ComercialProposta, para: PropostaEtapa, gestor: boolean, usuarioId: string | undefined): string | null {
  if (gestor || p.etapa === para) return null;
  if (p.etapa === 'em_analise' && (para === 'venda' || para === 'contra_proposta' || para === 'perdido')) {
    return 'Proposta em análise: só o Diretor aprova, faz contra proposta ou recusa.';
  }
  if (para === 'venda') {
    if (p.etapa !== 'contra_proposta') return 'Só o Diretor aprova a proposta e a leva para Venda.';
    if (!usuarioId || p.responsavelId !== usuarioId) return 'Só o responsável pela proposta (ou o Diretor) aprova a contra proposta.';
    if (p.contraEditada) return 'Você alterou a proposta depois da contra proposta: envie novamente para aprovação.';
    if (p.aprovacao === 'pendente') return 'O desconto está acima do limite e não passou pelo Diretor: envie para aprovação.';
  }
  return null;
}

type Acao = { para: PropostaEtapa; rotulo: string; estilo: string; confirmar?: string; bloqueio?: string | null };
// Mesmo estilo das etiquetas da task (prioridade, prazo): fundo tingido a 10%,
// borda sutil e o texto na cor do significado.
const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md border text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const ESTILO = {
  primario: `${BTN} text-blue-400 bg-blue-500/10 border-blue-500/15 hover:bg-blue-500/20`,
  aprovar: `${BTN} text-emerald-400 bg-emerald-500/10 border-emerald-500/15 hover:bg-emerald-500/20`,
  contra: `${BTN} text-amber-400 bg-amber-500/10 border-amber-500/15 hover:bg-amber-500/20`,
  recusar: `${BTN} text-red-400 bg-red-500/10 border-red-500/15 hover:bg-red-500/20`,
};

/** Fluxo de decisão da proposta: o que fazer a seguir, conforme a etapa. */
function BarraDecisao({ p, gestor, usuarioId, onMover }: {
  p: ComercialProposta;
  gestor: boolean;
  usuarioId: string | undefined;
  onMover: (para: PropostaEtapa) => Promise<void>;
}) {
  const [enviando, setEnviando] = useState<PropostaEtapa | null>(null);
  const executar = async (a: Acao) => {
    if (a.confirmar && !window.confirm(a.confirmar)) return;
    setEnviando(a.para);
    try { await onMover(a.para); } finally { setEnviando(null); }
  };
  const recusar: Acao = { para: 'perdido', rotulo: 'Recusar', estilo: ESTILO.recusar, confirmar: 'Recusar a proposta? Ela vai para Perdido/cancelado.' };

  let tom = 'border-zinc-800/80 bg-zinc-900/40';
  let icone: React.ReactNode = <Send size={15} className="text-blue-400" />;
  let titulo = '';
  let texto = '';
  let acoes: Acao[] = [];

  switch (p.etapa) {
    case 'realizada':
      tom = 'border-blue-500/25 bg-blue-500/[0.05]';
      titulo = 'Pronta para análise?';
      texto = 'Confira a proposta e envie ao Diretor, que aprova, faz contra proposta ou recusa.'
        + (p.aprovacao === 'pendente' ? ' O desconto está acima do limite: ele avalia junto.' : '');
      acoes = [{ para: 'em_analise', rotulo: 'Enviar para aprovação', estilo: ESTILO.primario }];
      break;
    case 'em_analise':
      tom = 'border-blue-500/25 bg-blue-500/[0.05]';
      icone = <Hourglass size={15} className="text-blue-400" />;
      titulo = gestor ? 'Aguardando sua decisão' : 'Aguardando decisão do Diretor';
      texto = gestor ? 'Aprovar leva a proposta para Venda.' : 'O Diretor vai aprovar, fazer contra proposta ou recusar.';
      acoes = gestor ? [
        recusar,
        { para: 'contra_proposta', rotulo: 'Contra proposta', estilo: ESTILO.contra },
        { para: 'venda', rotulo: 'Aprovar', estilo: ESTILO.aprovar },
      ] : [];
      break;
    case 'contra_proposta':
      tom = 'border-amber-400/20 bg-amber-400/[0.03]';
      icone = <Repeat2 size={15} className="text-amber-200/80" />;
      titulo = 'Contra proposta do Diretor';
      texto = p.contraEditada
        ? 'Você alterou a proposta depois da contra proposta: envie novamente para o Diretor aprovar.'
        : 'Se o cliente aceitou, aprove. Se não, recuse ou edite a proposta e envie novamente para aprovação.';
      acoes = [
        recusar,
        { para: 'em_analise', rotulo: 'Enviar novamente para aprovação', estilo: ESTILO.primario },
        { para: 'venda', rotulo: 'Aprovar', estilo: ESTILO.aprovar, bloqueio: bloqueioEtapa(p, 'venda', gestor, usuarioId) },
      ];
      break;
    case 'venda':
      tom = 'border-emerald-400/20 bg-emerald-400/[0.03]';
      icone = <ThumbsUp size={15} className="text-emerald-300/80" />;
      titulo = 'Proposta aprovada';
      texto = 'Lance a venda no formulário de Vendas para mudar a situação da unidade.';
      break;
    case 'perdido':
      tom = 'border-rose-400/20 bg-rose-400/[0.03]';
      icone = <ThumbsDown size={15} className="text-rose-300/80" />;
      titulo = 'Proposta perdida/cancelada';
      texto = 'Para reabrir, mova a proposta de volta para outra etapa.';
      break;
    default:
      return null;
  }

  return (
    <div className={`rounded-xl border px-4 py-3.5 flex flex-col md:flex-row md:items-center gap-3 ${tom}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="mt-0.5 shrink-0">{icone}</span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-zinc-100">{titulo}</p>
          <p className="text-[12px] text-zinc-400">{texto}</p>
        </div>
      </div>
      {acoes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap md:justify-end shrink-0">
          {acoes.map(a => (
            <button key={a.para} type="button" className={a.estilo} disabled={!!enviando || !!a.bloqueio} title={a.bloqueio ?? undefined} onClick={() => executar(a)}>
              {enviando === a.para ? 'Salvando…' : a.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cor pela faixa do desconto: até 1,5% verde · até 2,5% amarelo · acima vermelho. */
function corDoDesconto(pct: number): string {
  if (pct <= 1.5) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  if (pct <= 2.5) return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
  return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
}

function SeloDesconto({ p }: { p: ComercialProposta }) {
  if (p.descontoPct === null) return null;
  return (
    <span
      className={`mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${corDoDesconto(p.descontoPct)}`}
      title="Diferença entre o valor de tabela e o valor da proposta"
    >
      <Tag size={10} /> Desconto · {percentualBr(p.descontoPct)}
    </span>
  );
}

/** Desconto acima do limite: alerta fixo (sempre amarelo) para quem analisa a proposta. */
function PainelAprovacao({ p }: { p: ComercialProposta }) {
  if (p.aprovacao === 'dispensada') return null;
  const desc = p.descontoPct !== null ? percentualBr(p.descontoPct) : '—';
  const lim = p.descontoLimitePct !== null ? percentualBr(p.descontoLimitePct) : '—';

  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert size={14} className="text-amber-300 mt-px shrink-0" />
        <div className="min-w-0 text-[12px]">
          <p className="text-amber-200 font-semibold">Atenção: proposta com desconto acima de {lim}</p>
          <p className="text-zinc-400">
            Desconto de <b className="text-zinc-200 tabular-nums">{desc}</b> sobre a tabela.
          </p>
        </div>
      </div>
    </div>
  );
}

interface Props {
  projects: Project[];
  projectDisplays: SiengeProjectDisplay[];
  unidades: SiengeTabelaVendaUnidade[];
  versoes: SiengeTabelaVendaVersao[];
  colunas: SiengeTabelaVendaColuna[];
}

export default function PropostasKanban({ projects, projectDisplays, unidades, versoes, colunas }: Props) {
  const queryClient = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  // Proposta aberta no formulário em modo edição.
  const [editando, setEditando] = useState<string | null>(null);
  const propostas = useQuery({ queryKey: ['comercialPropostas'], queryFn: fetchComercialPropostas, staleTime: 30_000 }).data ?? [];
  const [dragOver, setDragOver] = useState<PropostaEtapa | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = useMemo(() => hojeBrasilia(), []);
  const vgvDe = useVgvDaProposta(unidades);
  // Relógio dos cards: um tique por minuto basta para a precisão mostrada.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  // Esc fecha o painel da proposta, como na task.
  useEffect(() => {
    // Com o formulário de edição aberto, Esc não fecha o painel por baixo.
    if (!aberta || editando) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberta, editando]);
  // Mesmo padrão do Dashboard do Comercial: este ano, comparado ao ano anterior.
  const [filtro, setFiltro] = useState<FiltroPropostas>(() => ({
    projetos: null, imobiliaria: null, corretor: null,
    selecao: { atalho: 'este_ano', ...resolverAtalho('este_ano', hoje, hoje)!, comparar: true, tipoComparacao: 'ano_anterior' },
  }));
  const doRecorte = useMemo(() => propostas.filter(p => passaFiltroFixo(p, filtro)), [propostas, filtro]);
  const visiveis = useMemo(() => doRecorte.filter(p => noPeriodo(p, filtro)), [doRecorte, filtro]);

  const { isMaster, pode } = usePermissoes();
  const podeEditar = pode('comercial_propostas', 'editar');
  const { currentUser, allUsers } = useAuth();
  const usuarioPorId = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);
  const mensagens = useQuery({ queryKey: ['comercialPropostaMensagens'], queryFn: fetchPropostaMensagens, staleTime: 30_000 }).data ?? [];
  // Contagem por proposta (só mensagens, sem os eventos automáticos) para o card.
  const mensagensPorProposta = useMemo(() => {
    const m = new Map<string, number>();
    mensagens.forEach(x => { if (x.tipo === 'mensagem') m.set(x.propostaId, (m.get(x.propostaId) ?? 0) + 1); });
    return m;
  }, [mensagens]);
  const nomeProjeto = (id: string) => projects.find(p => p.id === id)?.name || '—';

  // Características da unidade: as colunas descritivas da Tabela de Vendas (área,
  // tipo, vagas, andar...), na ordem e com o rótulo que o empreendimento usa.
  // Valores em moeda ficam de fora: são internos (adesão, custo), não da unidade.
  const caracteristicas = (p: ComercialProposta): { rotulo: string; valor: string }[] => {
    const u = p.unidadeId ? unidades.find(x => x.id === p.unidadeId) : undefined;
    if (!u) return [];
    const itens: { rotulo: string; valor: string }[] = [];
    if (u.imovel) itens.push({ rotulo: 'Imóvel', valor: u.imovel });
    colunas
      .filter(c => c.versaoId === u.versaoId && c.tipo !== 'moeda')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach(c => {
        const bruto = u.camposExtra?.[c.key];
        if (bruto === undefined || bruto === null || String(bruto).trim() === '') return;
        const n = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(',', '.'));
        if (c.tipo === 'area' || /^m²$/i.test(c.label.trim())) {
          if (Number.isFinite(n) && n > 0) itens.push({ rotulo: 'Área', valor: `${numeroBr(n)} m²` });
        } else if (/vaga/i.test(c.label) && Number.isFinite(n)) {
          itens.push({ rotulo: 'Vagas', valor: n.toLocaleString('pt-BR') });
        } else {
          itens.push({ rotulo: c.label, valor: c.tipo === 'numero' && Number.isFinite(n) ? n.toLocaleString('pt-BR') : String(bruto) });
        }
      });
    if (u.descricao) itens.push({ rotulo: 'Descrição', valor: u.descricao });
    return itens;
  };
  const proposta = propostas.find(p => p.id === aberta) ?? null;
  const editada = editando ? propostas.find(p => p.id === editando) ?? null : null;
  const etapaAtual = proposta ? PROPOSTA_ETAPAS.find(e => e.id === proposta.etapa) : undefined;

  // Editar fica junto do fluxo de pagamento, que é o que normalmente se ajusta.
  const edicao = proposta ? podeEditarProposta(proposta, currentUser?.id, isMaster) : null;
  const botaoEditar = proposta && edicao ? (
    <button
      type="button" disabled={!edicao.pode} onClick={() => setEditando(proposta.id)}
      title={edicao.motivo ?? 'Editar fluxo de pagamento e dados da proposta'}
      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md border text-[12px] font-semibold transition-colors text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 disabled:text-zinc-500 disabled:bg-zinc-900/60 disabled:border-zinc-800 disabled:cursor-not-allowed"
    >
      {edicao.pode ? <Pencil size={13} /> : <Lock size={13} />} Editar proposta
    </button>
  ) : null;
  const aguardando = propostas.filter(p => p.etapa === 'em_analise').length;

  const mover = async (id: string, etapa: PropostaEtapa) => {
    const atual = propostas.find(p => p.id === id);
    if (!atual || atual.etapa === etapa) return;
    setErro(null);
    const bloqueio = bloqueioEtapa(atual, etapa, isMaster, currentUser?.id);
    if (bloqueio) {
      setErro(bloqueio);
      return;
    }
    // Otimista: o card muda de coluna na hora; se falhar, a consulta devolve o estado real.
    queryClient.setQueryData<ComercialProposta[]>(['comercialPropostas'], old =>
      (old ?? []).map(p => (p.id !== id ? p
        // Mesmas regras do trigger comercial_propostas_marcos, para o resumo reagir já.
        // e do comercial_propostas_encerramento (relógio para em Venda/Perdido).
        : etapa === 'visita' ? { ...p, etapa, visitaEm: hoje, propostaEm: null, encerradaEm: null }
        : { ...p, etapa, propostaEm: p.propostaEm ?? hoje, encerradaEm: etapa === 'venda' || etapa === 'perdido' ? new Date().toISOString() : null })));
    try {
      await moverProposta(id, etapa);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível mover a proposta.');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
    }
  };

  const trocarResponsavel = async (p: ComercialProposta, id: string | null) => {
    setErro(null);
    queryClient.setQueryData<ComercialProposta[]>(['comercialPropostas'], old =>
      (old ?? []).map(x => (x.id === p.id ? { ...x, responsavelId: id } : x)));
    try {
      await definirResponsavelProposta(p.id, id);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível trocar o responsável.');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
      queryClient.invalidateQueries({ queryKey: ['comercialPropostaMensagens'] });
    }
  };

  const excluir = async (p: ComercialProposta) => {
    if (!window.confirm(`Excluir a proposta ${p.numero !== null ? `${codigoProposta(p.numero)} ` : ''}de ${p.cliente}?`)) return;
    setErro(null);
    try {
      await excluirProposta(p.id);
      setAberta(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível excluir a proposta.');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
    }
  };

  return (
    <div className="h-full view-pad">
    <section className="h-full flex flex-col rounded-xl border border-zinc-900/60 bg-[#0f0f12]">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/50 shrink-0">
        <h3 className="text-xs font-semibold text-zinc-200">Propostas</h3>
        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900/60">
          {visiveis.length}
        </span>
        {aguardando > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
            title={isMaster ? 'Propostas em análise esperando sua decisão.' : 'Propostas em análise esperando a decisão do Diretor.'}
          >
            <ShieldAlert size={11} /> {aguardando} aguardando aprovação
          </span>
        )}
        <span className="text-[10px] text-zinc-500 ml-auto hidden sm:inline">Arraste os cards entre as etapas.</span>
        <button
          type="button"
          onClick={() => setNovaAberta(true)}
          className="ml-auto sm:ml-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/30 ring-1 ring-blue-400/50 transition-colors shrink-0"
        >
          <Plus size={16} strokeWidth={3} /> Nova proposta
        </button>
      </header>

      <div className="px-3 pt-3 pb-5 space-y-3 border-b border-zinc-800/50 shrink-0">
        <BarraFiltrosPropostas
          propostas={propostas} projects={projects} projectDisplays={projectDisplays}
          filtro={filtro} onChange={setFiltro} hoje={hoje}
        />
        <ResumoPropostas propostas={doRecorte} unidades={unidades} filtro={filtro} />
      </div>

      {erro && (
        <p className="mx-3 mt-2 shrink-0 text-[11px] text-rose-300 bg-rose-500/[0.06] border border-rose-500/20 rounded-md px-2.5 py-1.5">{erro}</p>
      )}

      <div className="flex-1 min-h-0 flex gap-2 overflow-x-auto scrollbar-minimal px-2 pb-2 pt-4">
        {PROPOSTA_ETAPAS.map(coluna => {
          const cards = visiveis.filter(p => p.etapa === coluna.id);
          const alvo = dragOver === coluna.id;
          return (
            <div
              key={coluna.id}
              className={`flex-1 min-w-[210px] min-h-0 rounded-xl border transition-colors flex flex-col ${
                alvo ? `${coluna.accentBg} ${coluna.accentBorder}` : 'border-transparent'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(coluna.id); }}
              onDragLeave={() => setDragOver(d => (d === coluna.id ? null : d))}
              onDrop={e => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) mover(id, coluna.id);
              }}
            >
              <div className="flex items-center gap-2 px-2 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${coluna.dot}`} />
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">{coluna.label}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 rounded border border-zinc-900/60 shrink-0">
                  {cards.length}
                </span>
              </div>

              <div className="flex-1 min-h-0 px-1.5 pb-2 space-y-2 overflow-y-auto no-scrollbar">
                {cards.length === 0 ? (
                  <div className="h-20 border border-dashed border-zinc-900 rounded-xl flex flex-col items-center justify-center text-xs text-zinc-600 italic">
                    <Layers size={13} className="mb-1" />
                    <span>Sem propostas</span>
                  </div>
                ) : (
                  cards.map(p => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', p.id); setArrastando(p.id); }}
                      onDragEnd={() => { setArrastando(null); setDragOver(null); }}
                      onClick={() => setAberta(p.id)}
                      className={`bg-[#141417] hover:bg-[#18181c] border border-zinc-800/70 hover:border-zinc-700 border-l-2 ${coluna.borda} rounded-lg p-2.5 pl-3 cursor-pointer transition-all ${
                        arrastando === p.id ? 'opacity-40' : ''
                      }`}
                    >
                      {(p.numero !== null || p.unidade) && (
                        <div className="flex items-baseline justify-between gap-2 mb-0.5 text-[10px] leading-4">
                          {p.numero !== null
                            ? <span className="font-mono font-medium tracking-wide text-zinc-500">{codigoProposta(p.numero)}</span>
                            : <span />}
                          {p.unidade && <span className="shrink-0 font-medium text-zinc-300 tabular-nums">Un. {p.unidade}</span>}
                        </div>
                      )}
                      <p className="text-[15px] font-semibold text-blue-400 leading-tight tracking-tight break-words">{nomeProjeto(p.projectId)}</p>
                      <p
                        className={`mt-1 text-[14px] font-bold tabular-nums ${vgvDe(p) > 0 ? 'text-zinc-50' : 'text-[12px] font-medium text-zinc-600'}`}
                        title={p.autorizacao ? 'VGV: valor contratado na ficha' : 'VGV: valor da unidade na Tabela de Vendas'}
                      >
                        {vgvDe(p) > 0 ? moedaBr(vgvDe(p)) : 'VGV não informado'}
                      </p>
                      <p className="text-[11px] mt-0.5 truncate">
                        <span className="text-zinc-200 font-medium">{primeiroNome(p.corretor)}</span>
                        {p.imobiliaria && <span className="text-zinc-500"> · {p.imobiliaria}</span>}
                      </p>
                      <SeloDesconto p={p} />
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800/60 text-[10px] text-zinc-400">
                        <span
                          className="inline-flex items-center gap-1 tabular-nums"
                          title={p.encerradaEm
                            ? `Negociação encerrada em ${dataHoraBr(p.encerradaEm)}, ${tempoDecorrido(p.createdAt, new Date(p.encerradaEm).getTime())} após o cadastro`
                            : `Cadastrada em ${dataHoraBr(p.createdAt)} · enviada em ${dataBr(p.enviadaEm)}`}
                        >
                          {p.encerradaEm ? <Flag size={10} className={coluna.texto} /> : <Clock3 size={10} className={coluna.texto} />}
                          {tempoDaProposta(p, agora)}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          {p.anexos.length > 0 && (
                            <span className="inline-flex items-center gap-0.5" title={`${p.anexos.length} anexo(s)`}>
                              <Paperclip size={10} /> {p.anexos.length}
                            </span>
                          )}
                          {(mensagensPorProposta.get(p.id) ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5" title={`${mensagensPorProposta.get(p.id)} mensagem(ns)`}>
                              <MessageSquare size={10} /> {mensagensPorProposta.get(p.id)}
                            </span>
                          )}
                          {(() => {
                            const r = p.responsavelId ? usuarioPorId.get(p.responsavelId) : undefined;
                            return r
                              ? <span title={`Responsável: ${r.name}`}><AvatarUsuario id={r.id} nome={r.name} url={r.avatarUrl} tamanho={18} /></span>
                              : <span className="w-[18px] h-[18px] rounded-full border border-dashed border-zinc-700" title="Sem responsável" />;
                          })()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {proposta && (() => {
        const anexos = proposta.anexos.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5">Anexos · {proposta.anexos.length}</h4>
            <div className="grid grid-cols-2 gap-2">
              {proposta.anexos.map(a => {
                const ehImagem = /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name);
                return (
                  <a
                    key={a.url} href={a.url} target="_blank" rel="noreferrer"
                    className="block rounded-lg border border-zinc-800 bg-[#121214] hover:border-zinc-600 overflow-hidden transition-colors"
                    title={a.name}
                  >
                    {ehImagem && <img src={a.url} alt={a.name} className="w-full h-20 object-cover" loading="lazy" />}
                    <span className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-zinc-300 truncate">
                      <Paperclip size={10} className="shrink-0" /> <span className="truncate">{a.name}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        );
        const corretor = `${proposta.corretor}${proposta.imobiliaria ? ` · ${proposta.imobiliaria}` : ''}`;
        return (
          <>
            {/* Painel lateral, como a task: entra da direita e deixa o kanban visível à esquerda. */}
            <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-xs animate-fade-in" onMouseDown={() => setAberta(null)} />
            <aside
              role="dialog" aria-modal="true" aria-label={`Proposta ${codigoProposta(proposta.numero) ?? ''}`}
              className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-[#0c0c0e] border-l border-zinc-800/80 shadow-2xl animate-slide-in text-zinc-200 w-full ${proposta.autorizacao ? 'md:w-[94vw] xl:w-[86vw] max-w-[1600px]' : 'md:w-[94vw] lg:w-[960px]'}`}
            >
              {/* Topo: só a identificação da proposta e as ações de janela. */}
              <header className="flex items-center justify-between gap-4 px-6 h-12 border-b border-zinc-800/60 shrink-0">
                <div className="flex items-center gap-2 min-w-0 text-[12px]">
                  <span className="text-zinc-500">Proposta</span>
                  {proposta.numero !== null && (
                    <span className="font-mono font-medium tracking-wide text-zinc-400">{codigoProposta(proposta.numero)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button" onClick={() => excluir(proposta)} title="Excluir proposta"
                    className="p-2 rounded-md text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button onClick={() => setAberta(null)} className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60" title="Fechar (Esc)">
                    <X size={16} />
                  </button>
                </div>
              </header>

              {/* Conteúdo + conversa: lado a lado em telas largas; no celular a conversa vem depois. */}
              <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
              <div className="min-w-0 lg:flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-minimal px-6 py-5 space-y-6 text-xs">
                {erro && (
                  <p className="text-[12px] text-rose-300 bg-rose-500/[0.06] border border-rose-500/20 rounded-lg px-3 py-2">{erro}</p>
                )}

                {/* Propriedades, como na task: todas as etapas à vista e os campos de controle. */}
                <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 space-y-5">
                  {/* Empreendimento: a primeira coisa que se precisa saber da proposta. */}
                  {/* Ficha da unidade: identificação à esquerda, características à direita. */}
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-3xl font-semibold tracking-tight text-blue-400 leading-none break-words">{nomeProjeto(proposta.projectId)}</h2>
                      {proposta.unidade && (
                        <p className="mt-2 text-[14px] text-zinc-400">
                          Unidade <span className="font-semibold text-zinc-100 tabular-nums">{proposta.unidade}</span>
                        </p>
                      )}
                    </div>
                    {(() => {
                      const itens = caracteristicas(proposta);
                      if (itens.length === 0) return null;
                      return (
                        <dl className="flex flex-wrap items-stretch gap-y-3 md:justify-end">
                          {itens.map((i, idx) => (
                            <div
                              key={i.rotulo}
                              className={`min-w-0 px-5 first:pl-0 md:first:pl-5 ${idx > 0 ? 'border-l border-zinc-800/80' : ''} md:border-l md:border-zinc-800/80`}
                            >
                              <dt className="text-[11px] text-zinc-500">{i.rotulo}</dt>
                              <dd className="mt-0.5 text-[16px] font-semibold text-zinc-100 tabular-nums truncate max-w-[240px]" title={i.valor}>{i.valor}</dd>
                            </div>
                          ))}
                        </dl>
                      );
                    })()}
                  </div>

                  <div className="space-y-2">
                    <span className="block text-[11px] font-medium text-zinc-500">Etapa</span>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Etapa da proposta">
                      {PROPOSTA_ETAPAS.map(et => {
                        const ativa = proposta.etapa === et.id;
                        const motivo = ativa ? null : bloqueioEtapa(proposta, et.id, isMaster, currentUser?.id);
                        return (
                          <button
                            key={et.id} type="button" role="radio" aria-checked={ativa}
                            disabled={!!motivo || !podeEditar}
                            title={motivo ?? (podeEditar ? undefined : 'Sem permissão para mover')}
                            onClick={() => !ativa && mover(proposta.id, et.id)}
                            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] font-medium transition-colors ${
                              ativa
                                ? `bg-zinc-800/80 ${et.accentBorder} ${et.texto}`
                                : 'bg-zinc-950/60 border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 disabled:opacity-35 disabled:hover:bg-zinc-950/60 disabled:hover:text-zinc-500 disabled:cursor-not-allowed'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${ativa ? et.dot : 'bg-zinc-700'}`} />
                            {et.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pt-3 border-t border-zinc-800/60">
                    <div className="flex flex-col gap-1.5">
                      <span className={`flex items-center gap-1.5 text-[11px] font-medium ${proposta.responsavelId ? 'text-zinc-500' : 'text-amber-200/80'}`}>
                        <UserRound size={12} className="opacity-70" /> Responsável
                      </span>
                      <SeletorResponsavel
                        usuarios={allUsers} valor={proposta.responsavelId} desabilitado={!podeEditar}
                        onChange={id => trocarResponsavel(proposta, id)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"><CalendarDays size={12} className="opacity-70" /> Enviada em</span>
                      <span className="h-8 flex items-center text-[13px] text-zinc-200 tabular-nums">{dataBr(proposta.enviadaEm)}</span>
                    </div>
                    {proposta.encerradaEm ? (
                      <div className="flex flex-col gap-1.5" title={`Cadastrada em ${dataHoraBr(proposta.createdAt)} · encerrada em ${dataHoraBr(proposta.encerradaEm)}`}>
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"><Flag size={12} className="opacity-70" /> Negociação levou</span>
                        <span className="h-8 flex items-center text-[13px] text-zinc-200 tabular-nums">{tempoDaProposta(proposta, agora)}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5" title={`Cadastrada em ${dataHoraBr(proposta.createdAt)}`}>
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"><Clock3 size={12} className="opacity-70" /> Cadastrada há</span>
                        <span className="h-8 flex items-center text-[13px] text-zinc-200 tabular-nums">{tempoDaProposta(proposta, agora)}</span>
                      </div>
                    )}
                  </div>
                </section>

                <BarraDecisao key={`${proposta.id}-${proposta.etapa}`} p={proposta} gestor={isMaster} usuarioId={currentUser?.id} onMover={para => mover(proposta.id, para)} />

                <PainelAprovacao key={proposta.id} p={proposta} />

                {proposta.autorizacao ? (
                  <AutorizacaoResumo autorizacao={proposta.autorizacao} cliente={proposta.cliente} corretor={corretor} lateral={anexos} acaoFluxo={botaoEditar} />
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-zinc-800/70 p-3.5 min-w-0">
                        <span className="block text-[11px] text-zinc-500">Cliente</span>
                        <p className="mt-0.5 text-[14px] font-medium text-zinc-100 truncate">{proposta.cliente}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-800/70 p-3.5 min-w-0">
                        <span className="block text-[11px] text-zinc-500">Corretor / imobiliária</span>
                        <p className="mt-0.5 text-[14px] font-medium text-zinc-100 truncate">{corretor}</p>
                      </div>
                    </div>
                    <section>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fluxo de pagamento</h4>
                        {botaoEditar}
                      </div>
                      <p className="text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">{proposta.fluxoPagamento || '—'}</p>
                    </section>
                    {anexos}
                  </>
                )}
              </div>
              <PropostaChat
                propostaId={proposta.id}
                mensagens={mensagens.filter(m => m.propostaId === proposta.id)}
                usuarios={allUsers}
                meuId={currentUser?.id ?? null}
                className="h-[560px] lg:h-auto lg:w-[360px] xl:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-800/60"
              />
              </div>
            </aside>
          </>
        );
      })()}

      {(novaAberta || editada) && (
        <NovaPropostaModal
          key={editada?.id ?? 'nova'}
          projects={projects}
          projectDisplays={projectDisplays}
          unidades={unidades}
          versoes={versoes}
          colunas={colunas}
          propostas={propostas}
          proposta={editada}
          onClose={() => { setNovaAberta(false); setEditando(null); }}
        />
      )}
    </section>
    </div>
  );
}

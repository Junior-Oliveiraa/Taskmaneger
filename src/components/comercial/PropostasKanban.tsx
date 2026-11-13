import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, Layers, Paperclip, Plus, ShieldAlert, ShieldCheck, ShieldX, Trash2, X } from 'lucide-react';
import { Project, SiengeProjectDisplay, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao } from '../../types';
import NovaPropostaModal, { AutorizacaoResumo } from './NovaPropostaModal';
import {
  ComercialProposta, PROPOSTA_ETAPAS, PropostaEtapa, codigoProposta, decidirAprovacaoProposta, excluirProposta, fetchComercialPropostas, moverProposta,
} from '../../lib/comercialApi';
import { usePermissoes } from '../../lib/permissoes';
import { moedaBr, percentualBr } from './PropostaCampos';
import { CrmButton, selectCls } from '../crm/CrmShared';
import { BarraFiltrosPropostas, FiltroPropostas, ResumoPropostas, noPeriodo, passaFiltroFixo, useVgvDaProposta } from './PropostasResumo';
import { resolverAtalho } from './SeletorPeriodo';
import { hojeBrasilia } from '../../lib/cvComercial';

// Data pura (yyyy-mm-dd): formatada sem passar por Date, que a leria como UTC.
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;
const dataHoraBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
// "agora", "12 min", "3h 20min", "5d 4h": tempo desde a criação do card.
function tempoDecorrido(iso: string, agora: number) {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${String(min % 60).padStart(2, '0')}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Sem aprovação, a proposta não sai destas etapas (o banco também recusa).
const ETAPAS_SEM_APROVACAO: PropostaEtapa[] = ['visita', 'realizada'];
const travada = (p: ComercialProposta) => p.aprovacao === 'pendente' || p.aprovacao === 'recusada';

function SeloAprovacao({ p }: { p: ComercialProposta }) {
  if (p.aprovacao === 'dispensada') return null;
  const desc = p.descontoPct !== null ? percentualBr(p.descontoPct) : '';
  const estilo = {
    pendente: ['bg-amber-500/10 text-amber-300 border-amber-500/25', <ShieldAlert size={10} />, `Aprovação · ${desc}`],
    aprovada: ['bg-emerald-500/10 text-emerald-300 border-emerald-500/20', <ShieldCheck size={10} />, `Desconto aprovado · ${desc}`],
    recusada: ['bg-rose-500/10 text-rose-300 border-rose-500/25', <ShieldX size={10} />, `Desconto recusado · ${desc}`],
  }[p.aprovacao] as [string, React.ReactNode, string];
  return (
    <span className={`mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${estilo[0]}`}>
      {estilo[1]} {estilo[2]}
    </span>
  );
}

function PainelAprovacao({ p, gestor, onDecidir }: {
  p: ComercialProposta;
  gestor: boolean;
  onDecidir: (decisao: 'aprovada' | 'recusada', obs: string) => Promise<void>;
}) {
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState<'aprovada' | 'recusada' | null>(null);
  if (p.aprovacao === 'dispensada') return null;
  const desc = p.descontoPct !== null ? percentualBr(p.descontoPct) : '—';
  const lim = p.descontoLimitePct !== null ? percentualBr(p.descontoLimitePct) : '—';
  const decidir = async (d: 'aprovada' | 'recusada') => {
    setEnviando(d);
    try { await onDecidir(d, obs); setObs(''); } finally { setEnviando(null); }
  };
  const tom = p.aprovacao === 'pendente' ? 'border-amber-500/25 bg-amber-500/[0.05]'
    : p.aprovacao === 'aprovada' ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
    : 'border-rose-500/25 bg-rose-500/[0.05]';

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${tom}`}>
      <div className="flex items-start gap-2">
        {p.aprovacao === 'pendente' ? <ShieldAlert size={14} className="text-amber-300 mt-px shrink-0" />
          : p.aprovacao === 'aprovada' ? <ShieldCheck size={14} className="text-emerald-300 mt-px shrink-0" />
          : <ShieldX size={14} className="text-rose-300 mt-px shrink-0" />}
        <div className="min-w-0 text-[12px]">
          <p className="text-zinc-100 font-medium">
            {p.aprovacao === 'pendente' ? 'Aguardando aprovação do gestor'
              : p.aprovacao === 'aprovada' ? 'Desconto aprovado' : 'Desconto recusado'}
          </p>
          <p className="text-zinc-400">
            Desconto de <b className="text-zinc-200 tabular-nums">{desc}</b> sobre a tabela; o limite do empreendimento é <span className="tabular-nums">{lim}</span>.
            {p.aprovacao === 'pendente' && ' A proposta não avança de etapa até a decisão.'}
            {p.aprovacao === 'recusada' && ' A proposta fica parada em "Propostas realizadas".'}
          </p>
          {p.aprovacao !== 'pendente' && p.aprovacaoEm && (
            <p className="text-zinc-500 mt-0.5">
              {p.aprovacaoPorNome ? `${p.aprovacaoPorNome} · ` : ''}{dataHoraBr(p.aprovacaoEm)}
              {p.aprovacaoObs && <span className="block text-zinc-400 whitespace-pre-wrap break-words">“{p.aprovacaoObs}”</span>}
            </p>
          )}
        </div>
      </div>

      {gestor && p.aprovacao !== 'aprovada' && (
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <input
            className="flex-1 h-8 px-2.5 text-[12px] rounded-md bg-zinc-950/70 border border-zinc-800 text-zinc-100 outline-none focus:border-blue-500/60"
            placeholder="Observação (opcional)"
            value={obs} onChange={e => setObs(e.target.value)}
          />
          <div className="flex gap-2 shrink-0">
            {p.aprovacao === 'pendente' && (
              <CrmButton variant="danger" disabled={!!enviando} onClick={() => decidir('recusada')}>
                <X size={12} /> {enviando === 'recusada' ? 'Recusando…' : 'Recusar'}
              </CrmButton>
            )}
            <CrmButton variant="primary" disabled={!!enviando} onClick={() => decidir('aprovada')}>
              <Check size={12} /> {enviando === 'aprovada' ? 'Aprovando…' : 'Aprovar desconto'}
            </CrmButton>
          </div>
        </div>
      )}
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
  // Mesmo padrão do Dashboard do Comercial: este ano, comparado ao ano anterior.
  const [filtro, setFiltro] = useState<FiltroPropostas>(() => ({
    projetos: null, imobiliaria: null, corretor: null,
    selecao: { atalho: 'este_ano', ...resolverAtalho('este_ano', hoje, hoje)!, comparar: true, tipoComparacao: 'ano_anterior' },
  }));
  const doRecorte = useMemo(() => propostas.filter(p => passaFiltroFixo(p, filtro)), [propostas, filtro]);
  const visiveis = useMemo(() => doRecorte.filter(p => noPeriodo(p, filtro)), [doRecorte, filtro]);

  const { isMaster } = usePermissoes();
  const nomeProjeto = (id: string) => projects.find(p => p.id === id)?.name || '—';
  const proposta = propostas.find(p => p.id === aberta) ?? null;
  const etapaAtual = proposta ? PROPOSTA_ETAPAS.find(e => e.id === proposta.etapa) : undefined;
  const aguardando = propostas.filter(p => p.aprovacao === 'pendente').length;

  const mover = async (id: string, etapa: PropostaEtapa) => {
    const atual = propostas.find(p => p.id === id);
    if (!atual || atual.etapa === etapa) return;
    setErro(null);
    if (travada(atual) && !ETAPAS_SEM_APROVACAO.includes(etapa)) {
      setErro(atual.aprovacao === 'pendente'
        ? `A proposta de ${atual.cliente} tem desconto acima do limite e aguarda a aprovação do gestor.`
        : `O desconto da proposta de ${atual.cliente} foi recusado: ela não avança de etapa.`);
      return;
    }
    // Otimista: o card muda de coluna na hora; se falhar, a consulta devolve o estado real.
    queryClient.setQueryData<ComercialProposta[]>(['comercialPropostas'], old =>
      (old ?? []).map(p => (p.id !== id ? p
        // Mesmas regras do trigger comercial_propostas_marcos, para o resumo reagir já.
        : etapa === 'visita' ? { ...p, etapa, visitaEm: hoje, propostaEm: null }
        : { ...p, etapa, propostaEm: p.propostaEm ?? hoje })));
    try {
      await moverProposta(id, etapa);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível mover a proposta.');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
    }
  };

  const decidir = async (p: ComercialProposta, decisao: 'aprovada' | 'recusada', obs: string) => {
    setErro(null);
    try {
      await decidirAprovacaoProposta(p.id, decisao, obs);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível registrar a decisão.');
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
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
            title={isMaster ? 'Abra o card para aprovar ou recusar o desconto.' : 'Desconto acima do limite: depende do gestor.'}
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
                      className={`bg-[#121214] hover:bg-[#161619] border border-zinc-900/60 hover:border-zinc-800 rounded-lg p-2.5 cursor-pointer transition-all ${
                        arrastando === p.id ? 'opacity-40' : ''
                      }`}
                    >
                      {(p.numero !== null || p.unidade) && (
                        <div className="flex items-baseline justify-between gap-2 mb-0.5 text-[10px] leading-4">
                          {p.numero !== null
                            ? <span className="font-mono font-semibold text-zinc-400 tracking-wide">{codigoProposta(p.numero)}</span>
                            : <span />}
                          {p.unidade && <span className="shrink-0 text-zinc-500 tabular-nums">Un. {p.unidade}</span>}
                        </div>
                      )}
                      <p className="text-xs font-medium text-zinc-100 leading-snug break-words">{nomeProjeto(p.projectId)}</p>
                      <p
                        className={`mt-1 text-[13px] font-semibold tabular-nums ${vgvDe(p) > 0 ? 'text-zinc-50' : 'text-zinc-600'}`}
                        title={p.autorizacao ? 'VGV: valor contratado na ficha' : 'VGV: valor da unidade na Tabela de Vendas'}
                      >
                        {vgvDe(p) > 0 ? moedaBr(vgvDe(p)) : 'VGV não informado'}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{primeiroNome(p.corretor)}{p.imobiliaria ? ` · ${p.imobiliaria}` : ''}</p>
                      <SeloAprovacao p={p} />
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800/60 text-[10px] text-zinc-500">
                        <span
                          className="inline-flex items-center gap-1 tabular-nums"
                          title={`Criada em ${dataHoraBr(p.createdAt)} · enviada em ${dataBr(p.enviadaEm)}`}
                        >
                          <Clock3 size={10} /> {tempoDecorrido(p.createdAt, agora)}
                        </span>
                        {p.anexos.length > 0 && (
                          <span className="inline-flex items-center gap-0.5" title={`${p.anexos.length} anexo(s)`}>
                            <Paperclip size={10} /> {p.anexos.length}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {proposta && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setAberta(null)}
        >
          <div
            className={`w-full ${proposta.autorizacao ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] flex flex-col rounded-2xl border border-zinc-800 bg-[#0f0f12] shadow-2xl overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3.5 border-b border-zinc-800/60 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {proposta.numero !== null && (
                    <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-300 tracking-wide">{codigoProposta(proposta.numero)}</span>
                  )}
                  <h3 className="text-base font-semibold text-zinc-50 truncate">{nomeProjeto(proposta.projectId)}</h3>
                  {proposta.unidade && (
                    <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 tabular-nums">Unid. {proposta.unidade}</span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${etapaAtual?.dot ?? 'bg-zinc-500'}`} />
                  <span className="text-zinc-300">{etapaAtual?.label}</span>
                  <span>· enviada em {dataBr(proposta.enviadaEm)}</span>
                </p>
              </div>
              <button onClick={() => setAberta(null)} className="-mr-1 p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60" title="Fechar">
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal px-5 py-4 space-y-5 text-xs">
              <PainelAprovacao key={proposta.id} p={proposta} gestor={isMaster} onDecidir={(d, obs) => decidir(proposta, d, obs)} />

              {proposta.autorizacao ? (
                <AutorizacaoResumo
                  autorizacao={proposta.autorizacao}
                  cliente={proposta.cliente}
                  corretor={`${proposta.corretor}${proposta.imobiliaria ? ` · ${proposta.imobiliaria}` : ''}`}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-zinc-800/70 p-3 min-w-0">
                      <span className="block text-[11px] text-zinc-500">Cliente</span>
                      <p className="mt-0.5 text-[13px] font-medium text-zinc-100 truncate">{proposta.cliente}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800/70 p-3 min-w-0">
                      <span className="block text-[11px] text-zinc-500">Corretor / imobiliária</span>
                      <p className="mt-0.5 text-[13px] font-medium text-zinc-100 truncate">{proposta.corretor}{proposta.imobiliaria ? ` · ${proposta.imobiliaria}` : ''}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Fluxo de pagamento</h4>
                    <p className="text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">{proposta.fluxoPagamento || '—'}</p>
                  </div>
                </>
              )}

              {proposta.anexos.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5">Anexos</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {proposta.anexos.map(a => {
                      const ehImagem = /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name);
                      return (
                        <a
                          key={a.url} href={a.url} target="_blank" rel="noreferrer"
                          className="block rounded-md border border-zinc-800 bg-[#121214] hover:border-zinc-600 overflow-hidden transition-colors"
                          title={a.name}
                        >
                          {ehImagem && <img src={a.url} alt={a.name} className="w-full h-24 object-cover" loading="lazy" />}
                          <span className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-300 truncate">
                            <Paperclip size={10} className="shrink-0" /> <span className="truncate">{a.name}</span>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-800/60 bg-zinc-950/40 shrink-0">
              <button
                type="button" onClick={() => excluir(proposta)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 size={13} /> Excluir
              </button>
              <label className="flex items-center gap-2">
                <span className="hidden sm:inline text-[12px] text-zinc-500">Mover para</span>
                <span className="block w-[200px]">
                  <select
                    className={selectCls} value={proposta.etapa}
                    onChange={e => mover(proposta.id, e.target.value as PropostaEtapa)}
                  >
                    {PROPOSTA_ETAPAS.map(et => (
                      <option key={et.id} value={et.id} disabled={travada(proposta) && !ETAPAS_SEM_APROVACAO.includes(et.id)}>{et.label}</option>
                    ))}
                  </select>
                </span>
              </label>
            </footer>
          </div>
        </div>
      )}

      {novaAberta && (
        <NovaPropostaModal
          projects={projects}
          projectDisplays={projectDisplays}
          unidades={unidades}
          versoes={versoes}
          colunas={colunas}
          propostas={propostas}
          onClose={() => setNovaAberta(false)}
        />
      )}
    </section>
    </div>
  );
}

import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase, Building2, Clock, Minus, UserRound } from 'lucide-react';
import { Project, SiengeProjectDisplay, SiengeTabelaVendaUnidade } from '../../types';
import { ComercialProposta, PropostaMensagem, calcularAutorizacao } from '../../lib/comercialApi';
import { Periodo, nomeCurto } from '../../lib/cvComercial';
import FiltroLista from './FiltroLista';
import SeletorPeriodo, { SelecaoPeriodo, periodoDeComparacao, rotuloComparacao } from './SeletorPeriodo';
import { BOTAO_FILTRO, BOTAO_FILTRO_NEUTRO, ICONE_FILTRO } from './filtroEstilo';

// Filtros e mini dashboard da aba Propostas: os mesmos controles do Dashboard
// do Comercial, aplicados às propostas do Orbit. Canal e financiamento ficam de
// fora porque a proposta não guarda esses dados.

export interface FiltroPropostas {
  /** null = todos os empreendimentos. */
  projetos: string[] | null;
  selecao: SelecaoPeriodo;
  imobiliaria: string | null;
  corretor: string | null;
}

const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const fmtMoeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
function fmtCompacto(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2 })} mi`;
  if (a >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

const dentro = (d: string | null, p: Periodo) => !!d && d >= p.de && d <= p.ate;
const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

/** Empreendimento, imobiliária e corretor: o que vale para cards e números. */
export function passaFiltroFixo(p: ComercialProposta, f: FiltroPropostas) {
  return (!f.projetos || f.projetos.includes(p.projectId))
    && (!f.imobiliaria || p.imobiliaria === f.imobiliaria)
    && (!f.corretor || p.corretor === f.corretor);
}

/** No kanban: o card aparece se virou visita ou proposta dentro do período. */
export function noPeriodo(p: ComercialProposta, f: FiltroPropostas) {
  const per = { de: f.selecao.de, ate: f.selecao.ate };
  return dentro(p.visitaEm, per) || dentro(p.propostaEm, per);
}

// ── Números ─────────────────────────────────────────────────────────────────

interface Grupo { qtd: number; vgv: number }
interface Metricas {
  visitas: Grupo; visitasConvertidas: Grupo;
  propostas: Grupo; enviadas: Grupo; vendas: Grupo; perdidas: Grupo;
}

// Eventos que o banco grava na conversa a cada mudança de etapa
// (comercial_propostas_eventos). Os botões geram textos próprios; arrastar no
// kanban gera "moveu de X para Y".
type TipoEvento = 'envio' | 'aprovacao' | 'contra' | 'recusa';
function tipoDoEvento(texto: string): TipoEvento | null {
  if (/para aprovação$|para propostas em análise$/i.test(texto)) return 'envio';
  if (/^aprovou a (contra )?proposta$|para venda$/i.test(texto)) return 'aprovacao';
  if (/^fez uma contra proposta$|para contra proposta$/i.test(texto)) return 'contra';
  if (/^recusou a proposta$|para perdido/i.test(texto)) return 'recusa';
  return null;
}

interface Evento { tipo: TipoEvento; em: number; dia: string }
const diaBrasilia = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Eventos de etapa por proposta, em ordem cronológica. */
function eventosPorProposta(mensagens: PropostaMensagem[]) {
  const mapa = new Map<string, Evento[]>();
  for (const m of mensagens) {
    if (m.tipo !== 'evento') continue;
    const tipo = tipoDoEvento(m.texto.trim());
    if (!tipo) continue;
    const lista = mapa.get(m.propostaId) ?? [];
    lista.push({ tipo, em: Date.parse(m.createdAt), dia: diaBrasilia(m.createdAt) });
    mapa.set(m.propostaId, lista);
  }
  mapa.forEach(l => l.sort((a, b) => a.em - b.em));
  return mapa;
}

/** Chegou a ser enviada ao Diretor (está ou passou por "Em análise"). */
function foiEnviada(p: ComercialProposta, eventos: Evento[] | undefined) {
  return p.etapa === 'em_analise' || p.etapa === 'contra_proposta' || p.etapa === 'venda'
    || !!eventos?.some(e => e.tipo === 'envio');
}

function calcular(
  propostas: ComercialProposta[], periodo: Periodo,
  vgvDe: (p: ComercialProposta) => number, eventos: Map<string, Evento[]>,
): Metricas {
  const g = (): Grupo => ({ qtd: 0, vgv: 0 });
  const m: Metricas = { visitas: g(), visitasConvertidas: g(), propostas: g(), enviadas: g(), vendas: g(), perdidas: g() };
  const somar = (x: Grupo, v: number) => { x.qtd += 1; x.vgv += v; };
  for (const p of propostas) {
    const v = vgvDe(p);
    // Safra: a conversão olha para onde foram as visitas/propostas do período.
    if (dentro(p.visitaEm, periodo)) {
      somar(m.visitas, v);
      if (p.propostaEm) somar(m.visitasConvertidas, v);
    }
    if (dentro(p.propostaEm, periodo)) {
      somar(m.propostas, v);
      if (foiEnviada(p, eventos.get(p.id))) somar(m.enviadas, v);
      if (p.etapa === 'venda') somar(m.vendas, v);
      if (p.etapa === 'perdido') somar(m.perdidas, v);
    }
  }
  return m;
}

// ── Tempos ──────────────────────────────────────────────────────────────────

interface Tempos {
  /** Do 1º envio ao Diretor até a aprovação (ms), propostas aprovadas no período. */
  ateAprovacao: number[];
  /** Cada envio ao Diretor até a decisão dele (aprovar, contra, recusar), decididos no período. */
  respostaDiretor: number[];
  /** Da proposta feita até a venda (dias), vendas aprovadas no período. */
  cicloVenda: number[];
}

function calcularTempos(propostas: ComercialProposta[], periodo: Periodo, eventos: Map<string, Evento[]>): Tempos {
  const t: Tempos = { ateAprovacao: [], respostaDiretor: [], cicloVenda: [] };
  for (const p of propostas) {
    const evs = eventos.get(p.id);
    if (!evs) continue;
    let primeiroEnvio: number | null = null;
    let envioAberto: number | null = null;
    for (const e of evs) {
      if (e.tipo === 'envio') {
        primeiroEnvio ??= e.em;
        envioAberto = e.em;
        continue;
      }
      const noPer = dentro(e.dia, periodo);
      if (envioAberto !== null && noPer) t.respostaDiretor.push(e.em - envioAberto);
      envioAberto = null;
      if (e.tipo === 'aprovacao' && noPer) {
        if (primeiroEnvio !== null) t.ateAprovacao.push(e.em - primeiroEnvio);
        if (p.propostaEm) t.cicloVenda.push((Date.parse(`${e.dia}T00:00:00Z`) - Date.parse(`${p.propostaEm}T00:00:00Z`)) / 86400000);
      }
    }
  }
  return t;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function fmtDuracao(ms: number) {
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  if (h < 48) return `${h.toLocaleString('pt-BR', { maximumFractionDigits: h < 10 ? 1 : 0 })} h`;
  const d = h / 24;
  return `${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}
const fmtDias = (d: number) => (d < 1 ? 'mesmo dia' : `${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${d < 2 ? 'dia' : 'dias'}`);

// ── Peças ───────────────────────────────────────────────────────────────────

function Variacao({ atual, anterior, rotulo, menorMelhor = false, fmtAnterior = fmtInt }: {
  atual: number;
  anterior?: number | null;
  rotulo: string;
  /** Tempos e perdas: cair é bom. */
  menorMelhor?: boolean;
  fmtAnterior?: (n: number) => string;
}) {
  if (anterior === undefined) return null;
  if (!anterior) return <span className="text-[11px] text-zinc-600" title={rotulo}>sem base</span>;
  const d = (atual - anterior) / anterior;
  if (Math.abs(d) < 0.0005) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500" title={rotulo}><Minus size={11} /> estável</span>;
  }
  const Icone = d > 0 ? ArrowUpRight : ArrowDownRight;
  const bom = menorMelhor ? d < 0 : d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${bom ? 'text-emerald-400' : 'text-red-400'}`} title={`${rotulo}: ${fmtAnterior(anterior)}`}>
      <Icone size={12} /> {fmtPct(Math.abs(d))}
    </span>
  );
}

function Cartao({ rotulo, dica, grupo, anterior, rotuloComp, dot, base, rotuloBase, extra, menorMelhor }: {
  rotulo: string;
  dica: string;
  grupo: Grupo;
  anterior?: Grupo;
  rotuloComp: string;
  dot: string;
  /** Cartões de conversão: o grupo de origem, para a taxa. */
  base?: Grupo;
  rotuloBase?: string;
  /** Linha complementar ao lado da taxa (ex.: conversão total). */
  extra?: string;
  menorMelhor?: boolean;
}) {
  const taxa = base && base.qtd > 0 ? grupo.qtd / base.qtd : null;
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3.5 py-3" title={dica}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 truncate">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} /> {rotulo}
        </p>
        <Variacao atual={grupo.qtd} anterior={anterior?.qtd} rotulo={rotuloComp} menorMelhor={menorMelhor} />
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-zinc-50 tabular-nums leading-none">{fmtInt(grupo.qtd)}</span>
        <span className="text-[12px] text-zinc-300 tabular-nums truncate" title={`VGV: ${fmtMoeda(grupo.vgv)}`}>{fmtCompacto(grupo.vgv)}</span>
      </div>
      {base ? (
        <div className="mt-2.5">
          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full rounded-full ${dot}`} style={{ width: `${Math.min(100, (taxa ?? 0) * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 tabular-nums truncate">
            {taxa === null ? `Sem ${rotuloBase} no período` : (
              <><span className="font-semibold text-zinc-300">{fmtPct(taxa)}</span> das {rotuloBase}{extra && <span className="text-zinc-600"> · {extra}</span>}</>
            )}
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-[11px] text-zinc-500">VGV {fmtMoeda(grupo.vgv)}</p>
      )}
    </div>
  );
}

function CartaoTempo({ rotulo, dica, valor, detalhe, anterior, atualNum, rotuloComp, fmt, destaque }: {
  rotulo: string;
  dica: string;
  /** Já formatado; null = sem dados no período. */
  valor: string | null;
  detalhe: string;
  atualNum?: number | null;
  anterior?: number | null;
  rotuloComp: string;
  fmt?: (n: number) => string;
  destaque?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800/80 bg-zinc-900/25 px-3.5 py-2" title={dica}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 truncate">
          <Clock size={11} className="shrink-0 text-zinc-500" /> {rotulo}
        </p>
        {atualNum != null && anterior !== undefined && (
          <Variacao atual={atualNum} anterior={anterior} rotulo={rotuloComp} menorMelhor fmtAnterior={fmt} />
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2 min-w-0">
        <span className={`text-lg font-bold tabular-nums leading-none ${valor === null ? 'text-zinc-600' : destaque ? 'text-amber-200' : 'text-zinc-50'}`}>
          {valor ?? '—'}
        </span>
        <span className="text-[11px] text-zinc-500 tabular-nums truncate">{detalhe}</span>
      </div>
    </div>
  );
}

const Seta = () => (
  <span className="hidden xl:flex items-center justify-center text-zinc-700 -mx-1" aria-hidden><ArrowRight size={14} /></span>
);

// ── Barra de filtros ────────────────────────────────────────────────────────

export function BarraFiltrosPropostas({ propostas, projects, projectDisplays, filtro, onChange, hoje }: {
  propostas: ComercialProposta[];
  projects: Project[];
  projectDisplays: SiengeProjectDisplay[];
  filtro: FiltroPropostas;
  onChange: (f: FiltroPropostas) => void;
  hoje: string;
}) {
  // Só os empreendimentos que têm proposta, na ordem da Tabela de Vendas.
  const listaProjetos = useMemo(() => {
    const ids = new Set(propostas.map(p => p.projectId));
    const ordem = new Map(projectDisplays.map(d => [d.projectId, d.sortOrder]));
    return projects
      .filter(p => ids.has(p.id))
      .sort((a, b) => (ordem.get(a.id) ?? 999) - (ordem.get(b.id) ?? 999) || porNome(a.name, b.name))
      .map(p => ({ id: p.id, nome: p.name }));
  }, [propostas, projects, projectDisplays]);

  const doRecorte = useMemo(
    () => propostas.filter(p => !filtro.projetos || filtro.projetos.includes(p.projectId)),
    [propostas, filtro.projetos],
  );
  const opcoesImobiliaria = useMemo(
    () => [...new Set(doRecorte.map(p => p.imobiliaria).filter((x): x is string => !!x))].sort(porNome),
    [doRecorte],
  );
  const opcoesCorretor = useMemo(() => [...new Set(doRecorte
    .filter(p => !filtro.imobiliaria || p.imobiliaria === filtro.imobiliaria)
    .map(p => p.corretor).filter(Boolean))].sort(porNome),
  [doRecorte, filtro.imobiliaria]);

  const primeiraData = useMemo(
    () => propostas.reduce((m, p) => {
      const d = [p.visitaEm, p.propostaEm, p.enviadaEm].filter((x): x is string => !!x).sort()[0];
      return d && d < m ? d : m;
    }, hoje),
    [propostas, hoje],
  );

  // Cada nível depende do anterior: trocar um zera os de baixo.
  const toggleProjeto = (id: string) => {
    const prev = filtro.projetos;
    const next = prev === null ? [id] : prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    onChange({ ...filtro, projetos: next.length === 0 || next.length === listaProjetos.length ? null : next, imobiliaria: null, corretor: null });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div role="group" aria-label="Empreendimentos" className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button" aria-pressed={filtro.projetos === null}
          onClick={() => onChange({ ...filtro, projetos: null, imobiliaria: null, corretor: null })}
          className={filtro.projetos === null ? BOTAO_FILTRO : BOTAO_FILTRO_NEUTRO}
        >
          <Building2 size={13} className={ICONE_FILTRO} /> Todos
        </button>
        {listaProjetos.map(p => {
          const ativo = !!filtro.projetos?.includes(p.id);
          return (
            <button
              key={p.id} type="button" aria-pressed={ativo}
              onClick={() => toggleProjeto(p.id)}
              className={ativo ? BOTAO_FILTRO : BOTAO_FILTRO_NEUTRO}
            >
              {p.nome}
            </button>
          );
        })}
      </div>
      <span className="hidden sm:block w-px h-5 bg-zinc-800 mx-1" aria-hidden />
      <SeletorPeriodo valor={filtro.selecao} onChange={selecao => onChange({ ...filtro, selecao })} hoje={hoje} primeiraData={primeiraData} />
      {opcoesImobiliaria.length > 0 && (
        <FiltroLista
          icone={<Briefcase size={13} />}
          rotuloGrupo="Imobiliária"
          todos="Todas as imobiliárias"
          resumo={filtro.imobiliaria ? nomeCurto(filtro.imobiliaria) : 'Todas as imobiliárias'}
          resumoTitulo={filtro.imobiliaria ?? undefined}
          opcoes={opcoesImobiliaria.map(i => ({ id: i, label: nomeCurto(i), titulo: i }))}
          selecionados={filtro.imobiliaria ? [filtro.imobiliaria] : null}
          onTodos={() => onChange({ ...filtro, imobiliaria: null, corretor: null })}
          onAlternar={i => onChange({ ...filtro, imobiliaria: i, corretor: null })}
          largura="w-64"
        />
      )}
      {opcoesCorretor.length > 0 && (
        <FiltroLista
          icone={<UserRound size={13} />}
          rotuloGrupo="Corretor"
          todos="Todos os corretores"
          resumo={filtro.corretor ? nomeCurto(filtro.corretor) : 'Todos os corretores'}
          resumoTitulo={filtro.corretor ?? undefined}
          opcoes={opcoesCorretor.map(c => ({ id: c, label: nomeCurto(c), titulo: c }))}
          selecionados={filtro.corretor ? [filtro.corretor] : null}
          onTodos={() => onChange({ ...filtro, corretor: null })}
          onAlternar={c => onChange({ ...filtro, corretor: c })}
          largura="w-64"
        />
      )}
    </div>
  );
}

// ── Mini dashboard ──────────────────────────────────────────────────────────

/** VGV da proposta: o contratado da ficha; sem ficha (visitas, propostas antigas), o valor da unidade na tabela. */
export function useVgvDaProposta(unidades: SiengeTabelaVendaUnidade[]) {
  return useMemo(() => {
    const tabela = new Map(unidades.map(u => [u.id, u.valorTabela]));
    return (p: ComercialProposta) => (p.autorizacao
      ? calcularAutorizacao(p.autorizacao).contratado
      : (p.unidadeId ? tabela.get(p.unidadeId) ?? 0 : 0));
  }, [unidades]);
}

export function ResumoPropostas({ propostas, mensagens, unidades, filtro, agora }: {
  /** Já filtradas por empreendimento, imobiliária e corretor (o período é aplicado aqui). */
  propostas: ComercialProposta[];
  /** Conversa de todas as propostas: os eventos de etapa dão os tempos. */
  mensagens: PropostaMensagem[];
  unidades: SiengeTabelaVendaUnidade[];
  filtro: FiltroPropostas;
  /** Date.now() do render, para o "aguardando há". */
  agora: number;
}) {
  const vgvDe = useVgvDaProposta(unidades);
  const eventos = useMemo(() => eventosPorProposta(mensagens), [mensagens]);

  const periodo = { de: filtro.selecao.de, ate: filtro.selecao.ate };
  const comparacao = periodoDeComparacao(filtro.selecao);
  const atual = useMemo(() => calcular(propostas, periodo, vgvDe, eventos), [propostas, periodo.de, periodo.ate, vgvDe, eventos]);
  const anterior = useMemo(
    () => (comparacao ? calcular(propostas, comparacao, vgvDe, eventos) : null),
    [propostas, comparacao?.de, comparacao?.ate, vgvDe, eventos],
  );
  const tempos = useMemo(() => calcularTempos(propostas, periodo, eventos), [propostas, periodo.de, periodo.ate, eventos]);
  const temposAnt = useMemo(
    () => (comparacao ? calcularTempos(propostas, comparacao, eventos) : null),
    [propostas, comparacao?.de, comparacao?.ate, eventos],
  );
  const rc = rotuloComparacao(filtro.selecao.tipoComparacao);

  // Fila do Diretor agora (não depende do período): desde o último envio.
  const fila = useMemo(() => {
    const esperas = propostas
      .filter(p => p.etapa === 'em_analise')
      .map(p => {
        const envio = [...(eventos.get(p.id) ?? [])].reverse().find(e => e.tipo === 'envio');
        return envio ? agora - envio.em : null;
      });
    const conhecidas = esperas.filter((x): x is number => x !== null);
    return { qtd: esperas.length, maisAntiga: conhecidas.length ? Math.max(...conhecidas) : null };
  }, [propostas, eventos, agora]);

  const mAprov = media(tempos.ateAprovacao);
  const mResp = media(tempos.respostaDiretor);
  const mCiclo = media(tempos.cicloVenda);
  const qtd = (n: number, um: string, varios: string) => `${fmtInt(n)} ${n === 1 ? um : varios}`;
  const taxaTotal = atual.propostas.qtd > 0 ? `${fmtPct(atual.vendas.qtd / atual.propostas.qtd)} das propostas` : undefined;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[1fr_auto_1fr_1fr_auto_1fr_auto_1fr_1fr] gap-2 xl:gap-3 items-stretch">
        <Cartao
          rotulo="Visitas" dot="bg-slate-400" grupo={atual.visitas} anterior={anterior?.visitas} rotuloComp={rc}
          dica="Cards que entraram em Visitas no período. VGV pelo valor da unidade na tabela."
        />
        <Seta />
        <Cartao
          rotulo="Visitas → propostas" dot="bg-indigo-400" grupo={atual.visitasConvertidas} anterior={anterior?.visitasConvertidas} rotuloComp={rc}
          base={atual.visitas} rotuloBase="visitas"
          dica="Das visitas do período, quantas já viraram proposta."
        />
        <Cartao
          rotulo="Propostas" dot="bg-indigo-400" grupo={atual.propostas} anterior={anterior?.propostas} rotuloComp={rc}
          dica="Propostas feitas no período (lançadas ou vindas de visita). VGV pelo valor contratado da ficha."
        />
        <Seta />
        <Cartao
          rotulo="Enviadas p/ aprovação" dot="bg-blue-400" grupo={atual.enviadas} anterior={anterior?.enviadas} rotuloComp={rc}
          base={atual.propostas} rotuloBase="propostas"
          dica="Das propostas do período, quantas já foram enviadas ao Diretor (estão ou passaram por Em análise)."
        />
        <Seta />
        <Cartao
          rotulo="Aprovadas → venda" dot="bg-emerald-400/80" grupo={atual.vendas} anterior={anterior?.vendas} rotuloComp={rc}
          base={atual.enviadas} rotuloBase="enviadas" extra={taxaTotal}
          dica="Das propostas do período enviadas ao Diretor, quantas foram aprovadas e estão em Venda. Ao lado, a conversão total sobre as propostas."
        />
        <Cartao
          rotulo="Perdidas" dot="bg-rose-400/70" grupo={atual.perdidas} anterior={anterior?.perdidas} rotuloComp={rc}
          base={atual.propostas} rotuloBase="propostas" menorMelhor
          dica="Das propostas do período, quantas foram recusadas ou canceladas."
        />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 xl:gap-3">
        <CartaoTempo
          rotulo="Tempo médio até aprovação" rotuloComp={rc}
          valor={mAprov === null ? null : fmtDuracao(mAprov)}
          detalhe={mAprov === null ? 'nenhuma aprovação no período' : qtd(tempos.ateAprovacao.length, 'aprovação', 'aprovações')}
          atualNum={mAprov} anterior={temposAnt ? media(temposAnt.ateAprovacao) : undefined} fmt={fmtDuracao}
          dica="Do primeiro envio ao Diretor até a aprovação (inclui idas e vindas de contra proposta). Propostas aprovadas no período."
        />
        <CartaoTempo
          rotulo="Resposta do Diretor" rotuloComp={rc}
          valor={mResp === null ? null : fmtDuracao(mResp)}
          detalhe={mResp === null ? 'nenhuma decisão no período' : qtd(tempos.respostaDiretor.length, 'decisão', 'decisões')}
          atualNum={mResp} anterior={temposAnt ? media(temposAnt.respostaDiretor) : undefined} fmt={fmtDuracao}
          dica="Tempo médio entre cada envio para aprovação e a decisão (aprovar, contra proposta ou recusar). Decisões tomadas no período."
        />
        <CartaoTempo
          rotulo="Ciclo proposta → venda" rotuloComp={rc}
          valor={mCiclo === null ? null : fmtDias(mCiclo)}
          detalhe={mCiclo === null ? 'nenhuma venda no período' : qtd(tempos.cicloVenda.length, 'venda', 'vendas')}
          atualNum={mCiclo} anterior={temposAnt ? media(temposAnt.cicloVenda) : undefined} fmt={fmtDias}
          dica="Dias entre a proposta feita e a aprovação da venda. Vendas aprovadas no período."
        />
        <CartaoTempo
          rotulo="Aguardando aprovação" rotuloComp={rc}
          valor={fmtInt(fila.qtd)}
          destaque={fila.qtd > 0}
          detalhe={fila.qtd === 0 ? 'fila vazia' : fila.maisAntiga !== null ? `mais antiga há ${fmtDuracao(fila.maisAntiga)}` : qtd(fila.qtd, 'proposta', 'propostas')}
          dica="Propostas em análise agora, esperando o Diretor. Não depende do período."
        />
      </div>
    </div>
  );
}

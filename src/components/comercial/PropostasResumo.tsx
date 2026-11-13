import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase, Building2, Minus, UserRound } from 'lucide-react';
import { Project, SiengeProjectDisplay, SiengeTabelaVendaUnidade } from '../../types';
import { ComercialProposta, calcularAutorizacao } from '../../lib/comercialApi';
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
interface Metricas { visitas: Grupo; visitasConvertidas: Grupo; propostas: Grupo; vendas: Grupo }

function calcular(propostas: ComercialProposta[], periodo: Periodo, vgvDe: (p: ComercialProposta) => number): Metricas {
  const m: Metricas = {
    visitas: { qtd: 0, vgv: 0 }, visitasConvertidas: { qtd: 0, vgv: 0 },
    propostas: { qtd: 0, vgv: 0 }, vendas: { qtd: 0, vgv: 0 },
  };
  const somar = (g: Grupo, v: number) => { g.qtd += 1; g.vgv += v; };
  for (const p of propostas) {
    const v = vgvDe(p);
    // Safra: a conversão olha para onde foram as visitas/propostas do período.
    if (dentro(p.visitaEm, periodo)) {
      somar(m.visitas, v);
      if (p.etapa !== 'visita') somar(m.visitasConvertidas, v);
    }
    if (dentro(p.propostaEm, periodo)) {
      somar(m.propostas, v);
      if (p.etapa === 'venda') somar(m.vendas, v);
    }
  }
  return m;
}

// ── Peças ───────────────────────────────────────────────────────────────────

function Variacao({ atual, anterior, rotulo }: { atual: number; anterior?: number; rotulo: string }) {
  if (anterior === undefined) return null;
  if (anterior === 0) return <span className="text-[11px] text-zinc-600" title={rotulo}>sem base</span>;
  const d = (atual - anterior) / anterior;
  if (Math.abs(d) < 0.0005) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500" title={rotulo}><Minus size={11} /> estável</span>;
  }
  const Icone = d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${d > 0 ? 'text-emerald-400' : 'text-red-400'}`} title={`${rotulo}: ${fmtInt(anterior)}`}>
      <Icone size={12} /> {fmtPct(Math.abs(d))}
    </span>
  );
}

function Cartao({ rotulo, dica, grupo, anterior, rotuloComp, dot, base, rotuloBase }: {
  rotulo: string;
  dica: string;
  grupo: Grupo;
  anterior?: Grupo;
  rotuloComp: string;
  dot: string;
  /** Cartões de conversão: o grupo de origem, para a taxa. */
  base?: Grupo;
  rotuloBase?: string;
}) {
  const taxa = base && base.qtd > 0 ? grupo.qtd / base.qtd : null;
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3.5 py-3" title={dica}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 truncate">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} /> {rotulo}
        </p>
        <Variacao atual={grupo.qtd} anterior={anterior?.qtd} rotulo={rotuloComp} />
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
          <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">
            {taxa === null ? `Sem ${rotuloBase} no período` : `${fmtPct(taxa)} das ${rotuloBase}`}
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-[11px] text-zinc-500">VGV {fmtMoeda(grupo.vgv)}</p>
      )}
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

export function ResumoPropostas({ propostas, unidades, filtro }: {
  /** Já filtradas por empreendimento, imobiliária e corretor (o período é aplicado aqui). */
  propostas: ComercialProposta[];
  unidades: SiengeTabelaVendaUnidade[];
  filtro: FiltroPropostas;
}) {
  const vgvDe = useVgvDaProposta(unidades);

  const periodo = { de: filtro.selecao.de, ate: filtro.selecao.ate };
  const comparacao = periodoDeComparacao(filtro.selecao);
  const atual = useMemo(() => calcular(propostas, periodo, vgvDe), [propostas, periodo.de, periodo.ate, vgvDe]);
  const anterior = useMemo(
    () => (comparacao ? calcular(propostas, comparacao, vgvDe) : null),
    [propostas, comparacao?.de, comparacao?.ate, vgvDe],
  );
  const rc = rotuloComparacao(filtro.selecao.tipoComparacao);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-[1fr_auto_1fr_1fr_auto_1fr] gap-2 xl:gap-3 items-stretch">
      <Cartao
        rotulo="Visitas" dot="bg-sky-400" grupo={atual.visitas} anterior={anterior?.visitas} rotuloComp={rc}
        dica="Cards que entraram em Visitas no período. VGV pelo valor da unidade na tabela."
      />
      <Seta />
      <Cartao
        rotulo="Visitas → propostas" dot="bg-violet-400" grupo={atual.visitasConvertidas} anterior={anterior?.visitasConvertidas} rotuloComp={rc}
        base={atual.visitas} rotuloBase="visitas"
        dica="Das visitas do período, quantas já avançaram para proposta."
      />
      <Cartao
        rotulo="Propostas" dot="bg-blue-400" grupo={atual.propostas} anterior={anterior?.propostas} rotuloComp={rc}
        dica="Propostas feitas no período (lançadas ou vindas de visita). VGV pelo valor contratado da ficha."
      />
      <Seta />
      <Cartao
        rotulo="Propostas → vendas" dot="bg-emerald-400" grupo={atual.vendas} anterior={anterior?.vendas} rotuloComp={rc}
        base={atual.propostas} rotuloBase="propostas"
        dica="Das propostas do período, quantas estão na etapa Venda."
      />
    </div>
  );
}

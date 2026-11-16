import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Building2, X, ArrowDown, ArrowUp, Mail, EyeOff, Eye, TrendingUp, TrendingDown, CalendarRange } from 'lucide-react';
import { Project, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao, SiengeVendaSituacao } from '../types';
import { formatMoeda } from '../lib/lpCorretor';
import RelatorioVendasEmailPanel from './RelatorioVendasEmailPanel';
import { usePermissoes } from '../lib/permissoes';
import { fetchRelatorioVendasConfig, saveRelatorioVendasProjetosExcluidos, fetchRelatorioVendasBaseline } from '../lib/api';

// ── Comparação com a semana anterior ────────────────────────────────────────
// Espelha a Edge Function relatorio-vendas: a base é a foto diária do
// fechamento de 7 dias antes de hoje (fuso de Brasília), e a "semana" vai do
// dia seguinte a essa foto até hoje.

const hojeBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function addDias(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "19 a 25 de setembro de 2026" / "28 de setembro a 4 de outubro de 2026". */
function periodoExtenso(inicio: string, fim: string) {
  const [yi, mi, di] = inicio.split('-').map(Number);
  const [yf, mf, df] = fim.split('-').map(Number);
  if (inicio === fim) return `${df} de ${MESES[mf - 1]} de ${yf}`;
  if (yi !== yf) return `${di} de ${MESES[mi - 1]} de ${yi} a ${df} de ${MESES[mf - 1]} de ${yf}`;
  if (mi !== mf) return `${di} de ${MESES[mi - 1]} a ${df} de ${MESES[mf - 1]} de ${yf}`;
  return `${di} a ${df} de ${MESES[mf - 1]} de ${yf}`;
}

const dataCurta = (ymd: string) => ymd.split('-').reverse().join('/');

/** Variação em dinheiro na escala que se lê de relance: "+R$ 1,25 mi", "−R$ 380 mil". */
function moedaDelta(n: number) {
  const a = Math.abs(n);
  const sinal = n < 0 ? '−' : '+';
  if (a >= 1e6) return `${sinal}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${sinal}R$ ${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${sinal}${formatMoeda(a)}`;
}

const ZERO = 0.005;

/** Linha de variação do cartão: "▼ 2,3% · −R$ 1,2 mi · −1 un." */
function VariacaoCartao({ atual, anterior }: { atual: Bucket; anterior?: Bucket }) {
  if (!anterior) return null;
  const dv = atual.vgv - anterior.vgv;
  const du = atual.unidades - anterior.unidades;
  if (Math.abs(dv) < ZERO && du === 0) {
    return <p className="text-[11px] text-zinc-600 mt-1.5">= sem variação na semana</p>;
  }
  const sobe = dv > ZERO || (Math.abs(dv) < ZERO && du > 0);
  const Seta = sobe ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-[11px] font-semibold tabular-nums mt-1.5 ${sobe ? 'text-emerald-400' : 'text-red-400'}`}>
      <Seta size={12} className="shrink-0" />
      <span className="truncate">
        {anterior.vgv > 0 && `${fmtPct(Math.abs(dv / anterior.vgv) * 100)} · `}
        {moedaDelta(dv)}
        {du !== 0 && ` · ${du > 0 ? '+' : '−'}${fmtInt(Math.abs(du))} un.`}
      </span>
    </p>
  );
}

/** Variação da semana embaixo do valor na tabela ("−R$ 1,2 mi · −1 un."); nada quando não mudou. */
function VariacaoCelula({ atual, anterior }: { atual: Bucket; anterior?: Bucket }) {
  if (!anterior) return null;
  const dv = atual.vgv - anterior.vgv;
  const du = atual.unidades - anterior.unidades;
  if (Math.abs(dv) < ZERO && du === 0) return null;
  const sobe = dv > ZERO || (Math.abs(dv) < ZERO && du > 0);
  const partes = [
    Math.abs(dv) >= ZERO ? moedaDelta(dv) : null,
    du !== 0 ? `${du > 0 ? '+' : '−'}${fmtInt(Math.abs(du))} un.` : null,
  ].filter(Boolean);
  return (
    <div className={`text-[10px] font-semibold mt-0.5 ${sobe ? 'text-emerald-400/90' : 'text-red-400/90'}`}>
      {partes.join(' · ')}
    </div>
  );
}

// Ordem de leitura: o que não está à venda, depois o funil disponível → reservada → vendida.
const SITUACOES: SiengeVendaSituacao[] = ['bloqueada', 'permuta', 'disponivel', 'reservado', 'vendida'];

const SITUACAO_LABEL: Record<SiengeVendaSituacao, string> = {
  bloqueada: 'Bloqueadas',
  permuta: 'Permutadas',
  reservado: 'Reservadas',
  disponivel: 'Disponíveis',
  vendida: 'Vendidas',
};

// Paleta reduzida: cinzas para o que está fora da venda e uma única família de
// azul, que fica mais intensa conforme a unidade avança no funil. A cor fica só
// nos marcadores e barras; os números seguem em tons neutros.
const SITUACAO_COR: Record<SiengeVendaSituacao, string> = {
  bloqueada: 'bg-zinc-600',
  permuta: 'bg-zinc-400',
  disponivel: 'bg-sky-300',
  reservado: 'bg-blue-400',
  vendida: 'bg-indigo-500',
};

const CTL_H = 'h-9';
const PRESS = 'transition-all duration-150 active:scale-[0.97]';
const SEG_BTN = `px-2.5 py-1 text-[11px] font-semibold rounded-md border border-transparent ${PRESS}`;
const SEG_ON = 'bg-zinc-800 text-zinc-100 border-zinc-700';
const SEG_OFF = 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60';

/** Marcador da situação (bolinha). */
const Dot = ({ s, apagado }: { s: SiengeVendaSituacao; apagado?: boolean }) => (
  <span className={`w-2 h-2 rounded-full shrink-0 transition-opacity ${SITUACAO_COR[s]} ${apagado ? 'opacity-30' : ''}`} />
);

/** Barra empilhada com a composição do VGV por situação. */
function BarraComposicao({ porSituacao, total, alta }: { porSituacao: Record<SiengeVendaSituacao, Bucket>; total: number; alta?: boolean }) {
  if (total <= 0) return null;
  return (
    <div className={`flex w-full rounded-full overflow-hidden bg-zinc-900 gap-px ${alta ? 'h-2.5' : 'h-1'}`}>
      {SITUACOES.map(s => {
        const pct = (porSituacao[s].vgv / total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={s}
            className={`${SITUACAO_COR[s]} h-full`}
            style={{ width: `${pct}%` }}
            title={`${SITUACAO_LABEL[s]}: ${formatMoeda(porSituacao[s].vgv)} (${fmtPct(pct)})`}
          />
        );
      })}
    </div>
  );
}

interface Bucket {
  unidades: number;
  vgv: number;
}

interface LinhaResumo {
  project: Project;
  total: Bucket;
  porSituacao: Record<SiengeVendaSituacao, Bucket>;
}

type SortKey = 'ordem' | 'nome' | 'total' | SiengeVendaSituacao;

const emptyBuckets = (): Record<SiengeVendaSituacao, Bucket> =>
  Object.fromEntries(SITUACOES.map(s => [s, { unidades: 0, vgv: 0 }])) as Record<SiengeVendaSituacao, Bucket>;

const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

interface SiengeVendasDashboardProps {
  /** Já filtrados e ordenados pela regra de visibilidade de "Ajustar Metas". */
  projects: Project[];
  unidades: SiengeTabelaVendaUnidade[];
  versoes: SiengeTabelaVendaVersao[];
}

export default function SiengeVendasDashboard({ projects: todosProjects, unidades, versoes }: SiengeVendasDashboardProps) {
  const queryClient = useQueryClient();
  const { data: relatorioConfig } = useQuery({ queryKey: ['relatorioVendasConfig'], queryFn: fetchRelatorioVendasConfig });
  const excluidos = useMemo(() => relatorioConfig?.projetosExcluidos ?? [], [relatorioConfig]);

  // Exclusão própria do Dashboard (também vale para o e-mail semanal), separada
  // do "oculto" de Ajustar Metas, que tiraria o empreendimento da Tabela de Vendas.
  const projects = useMemo(() => todosProjects.filter(p => !excluidos.includes(p.id)), [todosProjects, excluidos]);
  const projectsForaDoDashboard = todosProjects.filter(p => excluidos.includes(p.id));

  const setExcluido = async (projectId: string, excluir: boolean) => {
    const next = excluir ? [...excluidos, projectId] : excluidos.filter(id => id !== projectId);
    queryClient.setQueryData(['relatorioVendasConfig'], (prev: any) => (prev ? { ...prev, projetosExcluidos: next } : prev));
    if (excluir) setSelectedProjectIds(prev => (prev ? prev.filter(id => id !== projectId) : prev));
    try {
      await saveRelatorioVendasProjetosExcluidos(next);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['relatorioVendasConfig'] });
    }
  };

  // null = todos os empreendimentos.
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[] | null>(null);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [situacoesVisiveis, setSituacoesVisiveis] = useState<SiengeVendaSituacao[]>(SITUACOES);
  const [ocultarVazios, setOcultarVazios] = useState(true);
  const [isEmailPanelOpen, setIsEmailPanelOpen] = useState(false);
  // Configurar o e-mail automático é exclusivo do administrador.
  const { isAdmin } = usePermissoes();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'ordem', dir: 'asc' });

  // Cada versão tem os próprios valores; só a principal alimenta VGV — as
  // demais são cenários comerciais e contariam a mesma unidade duas vezes.
  const linhas = useMemo<LinhaResumo[]>(() => {
    const principalPorProjeto = new Map<string, string>();
    versoes.forEach(v => { if (v.principal) principalPorProjeto.set(v.projectId, v.id); });

    const porProjeto = new Map<string, LinhaResumo>();
    projects.forEach(p => porProjeto.set(p.id, { project: p, total: { unidades: 0, vgv: 0 }, porSituacao: emptyBuckets() }));

    unidades.forEach(u => {
      const linha = porProjeto.get(u.projectId);
      if (!linha) return;
      const principal = principalPorProjeto.get(u.projectId);
      if (principal && u.versaoId !== principal) return;
      const valor = Number(u.valorTabela) || 0;
      linha.total.unidades += 1;
      linha.total.vgv += valor;
      const b = linha.porSituacao[u.situacao];
      if (b) { b.unidades += 1; b.vgv += valor; }
    });

    return projects.map(p => porProjeto.get(p.id)!);
  }, [projects, unidades, versoes]);

  const linhasFiltradas = useMemo(() => {
    let out = linhas;
    if (selectedProjectIds) out = out.filter(l => selectedProjectIds.includes(l.project.id));
    if (ocultarVazios) out = out.filter(l => l.total.unidades > 0);
    if (sort.key !== 'ordem') {
      const val = (l: LinhaResumo): number | string =>
        sort.key === 'nome' ? l.project.name.toLowerCase()
          : sort.key === 'total' ? l.total.vgv
          : l.porSituacao[sort.key as SiengeVendaSituacao].vgv;
      out = [...out].sort((a, b) => {
        const va = val(a), vb = val(b);
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number);
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [linhas, selectedProjectIds, ocultarVazios, sort]);

  const consolidado = useMemo(() => {
    const total: Bucket = { unidades: 0, vgv: 0 };
    const porSituacao = emptyBuckets();
    linhasFiltradas.forEach(l => {
      total.unidades += l.total.unidades;
      total.vgv += l.total.vgv;
      SITUACOES.forEach(s => {
        porSituacao[s].unidades += l.porSituacao[s].unidades;
        porSituacao[s].vgv += l.porSituacao[s].vgv;
      });
    });
    return { total, porSituacao };
  }, [linhasFiltradas]);

  // Base da comparação semanal. A data de hoje entra na chave para a tela, se
  // ficar aberta virando a meia-noite, passar a comparar com a foto certa.
  const hoje = hojeBrasilia();
  const { data: baseline } = useQuery({
    queryKey: ['relatorioVendasBaseline', hoje],
    queryFn: () => fetchRelatorioVendasBaseline(hoje, addDias(hoje, -7)),
    staleTime: 10 * 60 * 1000,
  });
  const referencia = baseline?.referencia ?? null;

  const anteriorPorProjeto = useMemo(() => {
    const map = new Map<string, { total: Bucket; porSituacao: Record<SiengeVendaSituacao, Bucket> }>();
    if (!baseline?.referencia) return map;
    projects.forEach(p => map.set(p.id, { total: { unidades: 0, vgv: 0 }, porSituacao: emptyBuckets() }));
    baseline.rows.forEach(r => {
      const a = map.get(r.projectId);
      if (!a) return;
      a.total.unidades += r.unidades;
      a.total.vgv += r.vgv;
      const b = a.porSituacao[r.situacao];
      if (b) { b.unidades += r.unidades; b.vgv += r.vgv; }
    });
    return map;
  }, [baseline, projects]);

  const consolidadoAnterior = useMemo(() => {
    if (!referencia) return null;
    const total: Bucket = { unidades: 0, vgv: 0 };
    const porSituacao = emptyBuckets();
    linhasFiltradas.forEach(l => {
      const a = anteriorPorProjeto.get(l.project.id);
      if (!a) return;
      total.unidades += a.total.unidades;
      total.vgv += a.total.vgv;
      SITUACOES.forEach(s => {
        porSituacao[s].unidades += a.porSituacao[s].unidades;
        porSituacao[s].vgv += a.porSituacao[s].vgv;
      });
    });
    return { total, porSituacao };
  }, [referencia, linhasFiltradas, anteriorPorProjeto]);

  const periodo = periodoExtenso(referencia ? addDias(referencia, 1) : addDias(hoje, -6), hoje);

  const situacoesOrdenadas = SITUACOES.filter(s => situacoesVisiveis.includes(s));

  const toggleSituacao = (s: SiengeVendaSituacao) => {
    setSituacoesVisiveis(prev => {
      if (prev.includes(s)) return prev.length > 1 ? prev.filter(x => x !== s) : prev;
      return SITUACOES.filter(x => x === s || prev.includes(x));
    });
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds(prev => {
      const base = prev ?? projects.map(p => p.id);
      const next = base.includes(id) ? base.filter(x => x !== id) : [...base, id];
      if (next.length === 0) return prev;
      return next.length === projects.length ? null : next;
    });
  };

  const onSort = (key: SortKey) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'nome' ? 'asc' : 'desc' });
  };

  const filtrosAtivos = selectedProjectIds !== null || situacoesVisiveis.length !== SITUACOES.length || sort.key !== 'ordem';
  const limparFiltros = () => {
    setSelectedProjectIds(null);
    setSituacoesVisiveis(SITUACOES);
    setSort({ key: 'ordem', dir: 'asc' });
  };

  // Com "Ocultar sem unidades" ligado, pílula de empreendimento vazio não teria efeito.
  const linhasPilula = ocultarVazios ? linhas.filter(l => l.total.unidades > 0) : linhas;

  const pctVgv = (v: number) => (consolidado.total.vgv > 0 ? (v / consolidado.total.vgv) * 100 : 0);

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? null : sort.dir === 'asc' ? <ArrowUp size={10} className="inline" /> : <ArrowDown size={10} className="inline" />;

  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      {/* Header */}
      <div className="flex items-center justify-between view-pad-x py-4 short:py-2.5 border-b border-zinc-900/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <LayoutDashboard size={16} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Dashboard de Vendas</h2>
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <CalendarRange size={12} className="shrink-0 text-zinc-600" />
              <span>Semana de {periodo}</span>
              {referencia && <span className="text-zinc-600">· comparado a {dataCurta(referencia)}</span>}
            </p>
          </div>
        </div>
        {isAdmin && (
        <button
          type="button"
          onClick={() => setIsEmailPanelOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
            isEmailPanelOpen
              ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
              : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900/60 hover:bg-zinc-800 border-zinc-800'
          }`}
        >
          <Mail size={13} /> Relatório por e-mail
        </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto view-pad-x view-pad-y flex flex-col view-gap-sm">
        {isAdmin && isEmailPanelOpen && <RelatorioVendasEmailPanel />}

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Empreendimentos — mesmo segmentado das situações: cada pílula liga/desliga. */}
          <div className={`flex items-center gap-0.5 flex-wrap min-h-9 py-1 px-1 bg-zinc-900/60 border border-zinc-800 rounded-lg`}>
            <Building2 size={13} className="text-zinc-500 shrink-0 mx-1.5" />
            <button
              type="button"
              onClick={() => setSelectedProjectIds(null)}
              className={`${SEG_BTN} ${selectedProjectIds === null ? SEG_ON : SEG_OFF}`}
            >
              Todos
            </button>
            {linhasPilula.map(l => {
              const on = selectedProjectIds === null || selectedProjectIds.includes(l.project.id);
              return (
                <button
                  key={l.project.id}
                  type="button"
                  onClick={() => toggleProject(l.project.id)}
                  className={`${SEG_BTN} flex items-center gap-1.5 ${on && selectedProjectIds !== null ? SEG_ON : on ? 'text-zinc-200 hover:bg-zinc-800/60' : SEG_OFF}`}
                >
                  {l.project.name}
                  <span className="text-[10px] font-bold tabular-nums opacity-60">{fmtInt(l.total.unidades)}</span>
                </button>
              );
            })}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProjectDropdownOpen(o => !o)}
                title="Empreendimentos fora do Dashboard"
                className={`${SEG_BTN} flex items-center gap-1 ${isProjectDropdownOpen ? SEG_ON : SEG_OFF}`}
              >
                <EyeOff size={12} />
                {projectsForaDoDashboard.length > 0 && <span className="text-[10px] font-bold tabular-nums">{projectsForaDoDashboard.length}</span>}
              </button>
              {isProjectDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProjectDropdownOpen(false)} />
                  <div className="absolute top-full right-0 mt-1.5 z-50 w-64 bg-[#141417] border border-zinc-800/80 rounded-xl shadow-xl shadow-black/60 overflow-hidden animate-dropdown-in origin-top py-1">
                    <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Aparecem no Dashboard e no e-mail</p>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {todosProjects.map(p => {
                        const fora = excluidos.includes(p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
                            <span className={`truncate ${fora ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>{p.name}</span>
                            <button
                              type="button"
                              onClick={() => setExcluido(p.id, !fora)}
                              className={`flex items-center gap-1 text-[11px] font-semibold shrink-0 ${fora ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-500 hover:text-red-400'}`}
                            >
                              {fora ? <><Eye size={12} /> Mostrar</> : <><EyeOff size={12} /> Ocultar</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-0.5 ${CTL_H} px-1 bg-zinc-900/60 border border-zinc-800 rounded-lg`}>
            {SITUACOES.map(s => {
              const on = situacoesVisiveis.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSituacao(s)}
                  title={on ? 'Ocultar coluna' : 'Mostrar coluna'}
                  className={`${SEG_BTN} flex items-center gap-1.5 ${on ? SEG_ON : SEG_OFF}`}
                >
                  <Dot s={s} apagado={!on} />
                  {SITUACAO_LABEL[s]}
                </button>
              );
            })}
          </div>

          <div className={`flex items-center gap-0.5 ${CTL_H} px-1 bg-zinc-900/60 border border-zinc-800 rounded-lg`}>
            <button type="button" onClick={() => setOcultarVazios(v => !v)} className={`${SEG_BTN} ${ocultarVazios ? SEG_ON : SEG_OFF}`}>
              Ocultar sem unidades
            </button>
          </div>

          {filtrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className={`flex items-center gap-1 ${CTL_H} px-3 text-[11px] font-semibold text-zinc-400 hover:text-zinc-100 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg ${PRESS}`}
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>

        {/* Consolidado — total em destaque e a composição logo abaixo */}
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 card-pad flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">VGV total</p>
              <p className="text-2xl font-bold text-zinc-50 tabular-nums leading-tight mt-0.5">{formatMoeda(consolidado.total.vgv)}</p>
              <p className="text-[11px] text-zinc-500 tabular-nums">{fmtInt(consolidado.total.unidades)} unidades</p>
            </div>
            <div className="min-w-0"><VariacaoCartao atual={consolidado.total} anterior={consolidadoAnterior?.total} /></div>
          </div>

          <BarraComposicao porSituacao={consolidado.porSituacao} total={consolidado.total.vgv} alta />

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3">
            {situacoesOrdenadas.map(s => {
              const b = consolidado.porSituacao[s];
              const pctUn = consolidado.total.unidades > 0 ? (b.unidades / consolidado.total.unidades) * 100 : 0;
              return (
                <div key={s} className="min-w-0 pl-3 border-l border-zinc-800">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
                    <Dot s={s} /> {SITUACAO_LABEL[s]}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-base font-bold text-zinc-100 tabular-nums">{formatMoeda(b.vgv)}</p>
                    <p className="text-[11px] font-semibold text-zinc-400 tabular-nums">{fmtPct(pctVgv(b.vgv))}</p>
                  </div>
                  <p className="text-[11px] text-zinc-500 tabular-nums">
                    {fmtInt(b.unidades)} un. · {fmtPct(pctUn)} das unidades
                  </p>
                  <VariacaoCartao atual={b} anterior={consolidadoAnterior?.porSituacao[s]} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Detalhe por empreendimento */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-xs font-bold text-zinc-200">Por empreendimento</h3>
            <p className="text-[11px] text-zinc-600">
              % = participação no VGV do empreendimento · na coluna Total, no VGV geral
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-900/80 text-zinc-400">
                  <th className="text-left font-semibold px-3 py-2.5 border-b border-zinc-800 sticky left-0 bg-[#111113] min-w-[200px]">
                    <button type="button" onClick={() => onSort('nome')} className="hover:text-zinc-100">
                      Empreendimento <SortIcon k="nome" />
                    </button>
                  </th>
                  <th className="text-right font-semibold px-3 py-2.5 border-b border-l border-zinc-800 text-zinc-200">
                    <button type="button" onClick={() => onSort('total')} className="hover:text-zinc-50">
                      Total <SortIcon k="total" />
                    </button>
                  </th>
                  {situacoesOrdenadas.map(s => (
                    <th key={s} className="text-right font-semibold px-3 py-2.5 border-b border-l border-zinc-800">
                      <button type="button" onClick={() => onSort(s)} className="inline-flex items-center gap-1.5 hover:text-zinc-100">
                        <Dot s={s} /> {SITUACAO_LABEL[s]} <SortIcon k={s} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={2 + situacoesOrdenadas.length} className="px-3 py-8 text-center text-zinc-600">
                      Nenhum empreendimento com unidades na Tabela de Vendas para os filtros atuais.
                    </td>
                  </tr>
                ) : linhasFiltradas.map(l => {
                  const ant = anteriorPorProjeto.get(l.project.id);
                  return (
                    <tr key={l.project.id} className="border-b border-zinc-900 hover:bg-zinc-900/40 transition-colors align-top">
                      <td className="px-3 py-2.5 sticky left-0 bg-[#08080a]">
                        <p className="font-semibold text-zinc-200 whitespace-nowrap">{l.project.name}</p>
                        <div className="mt-1.5 max-w-[180px]">
                          <BarraComposicao porSituacao={l.porSituacao} total={l.total.vgv} />
                        </div>
                      </td>
                      <CelulaValor b={l.total} a={ant?.total} base={consolidado.total.vgv} forte />
                      {situacoesOrdenadas.map(s => (
                        <CelulaValor key={s} b={l.porSituacao[s]} a={ant?.porSituacao[s]} base={l.total.vgv} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              {linhasFiltradas.length > 0 && (
                <tfoot>
                  <tr className="bg-zinc-900/80 align-top">
                    <td className="px-3 py-2.5 font-bold text-zinc-100 sticky left-0 bg-[#111113]">Total geral</td>
                    <CelulaValor b={consolidado.total} a={consolidadoAnterior?.total} base={consolidado.total.vgv} forte />
                    {situacoesOrdenadas.map(s => (
                      <CelulaValor key={s} b={consolidado.porSituacao[s]} a={consolidadoAnterior?.porSituacao[s]} base={consolidado.total.vgv} forte />
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Célula da tabela: VGV em cima; unidades e % do total de referência embaixo. */
function CelulaValor({ b, a, base, forte }: { b: Bucket; a?: Bucket; base: number; forte?: boolean }) {
  const vazio = b.unidades === 0 && b.vgv === 0;
  const pct = base > 0 ? (b.vgv / base) * 100 : null;
  return (
    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap border-l border-zinc-900">
      {vazio ? (
        <span className="text-zinc-700">–</span>
      ) : (
        <>
          <div className={forte ? 'font-bold text-zinc-100' : 'font-medium text-zinc-200'}>{formatMoeda(b.vgv)}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            {fmtInt(b.unidades)} un.{pct !== null && <> · <span className="text-zinc-400 font-semibold">{fmtPct(pct)}</span></>}
          </div>
        </>
      )}
      <VariacaoCelula atual={b} anterior={a} />
    </td>
  );
}

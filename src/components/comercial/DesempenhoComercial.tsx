import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Briefcase, Building2, ChevronRight, Clock3, Landmark, Minus, RefreshCw, Store, UserRound } from 'lucide-react';
import {
  CANAIS, FINANCIAMENTOS, financiamentoDe, CvDados, CvReserva, ValorTabela, VendaOrbit, valoresDeTabela, Desfecho, FiltrosPainel, Kpis, Painel, Periodo, SituacaoEstoque, SITUACOES_ESTOQUE,
  PrecoOrbit, calcularPainel, fetchCvComercial, hojeBrasilia, nomeCurto, nomeCurtoEmpreendimento, precosDasUnidades,
} from '../../lib/cvComercial';
import FiltroLista from './FiltroLista';
import { fetchProjects, fetchSiengeTabelaVendaVersoes, fetchSiengeTabelaVendas, fetchSiengeVendas } from '../../lib/api';
import { BOTAO_FILTRO, BOTAO_FILTRO_NEUTRO, ICONE_FILTRO } from './filtroEstilo';
import SeletorPeriodo, { SelecaoPeriodo, periodoDeComparacao, resolverAtalho, rotuloComparacao, rotuloSelecao } from './SeletorPeriodo';
import { BarraSegmentada, CardGrafico, COR, GraficoColunas, GraficoColunasMeta, Legenda, ListaBarras, Rosca, TipTitulo } from './cvCharts';

// As metas vêm da aba Metas (comercial_metas), por empreendimento e por mês.
import { MetasComercial, ROTULO_FAIXA, faixaAtingimento, fetchMetasComercial, metaMensalDoRecorte } from '../../lib/comercialMetas';

// ── Formatação ───────────────────────────────────────────────────────────────

const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (n: number, casas = 1) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const fmtMoeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function fmtCompacto(n: number, prefixo = true) {
  const p = prefixo ? 'R$ ' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${p}${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2 })} mi`;
  if (a >= 1e3) return `${p}${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `${p}${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** Sempre em milhões: "R$ 12,4 mi", "R$ 0,8 mi". */
const fmtMilhoes = (n: number) =>
  `R$ ${(n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;

/** Nome de pessoa ou imobiliária: duas palavras na tela, inteiro no balão. */
function Nome({ nome }: { nome: string | null }) {
  if (!nome) return <>–</>;
  const curto = nomeCurto(nome);
  return <span title={curto !== nome ? nome : undefined}>{curto}</span>;
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// ── Identidade visual fixa: a cor segue a categoria, nunca a posição ────────

const COR_CANAL: Record<string, string> = {
  'Imobiliárias': COR.azul,
  'Autônomos': COR.laranja,
  'House': COR.verde,
  'Não classificado': COR.cinza,
};

const COR_ESTOQUE: Record<SituacaoEstoque, string> = {
  vendida: COR.verde,
  reservada: COR.amarelo,
  'disponível': COR.azul,
  bloqueada: COR.cinza,
};

const ROTULO_ESTOQUE: Record<SituacaoEstoque, string> = {
  vendida: 'Vendidas',
  reservada: 'Reservadas',
  'disponível': 'Disponíveis',
  bloqueada: 'Bloqueadas',
};

const COR_DESFECHO: Record<Desfecho, string> = {
  'Vendida': COR.verde,
  'Pré-venda': COR.azul,
  'Em andamento': COR.amarelo,
  'Distrato': COR.laranja,
  'Cancelada': COR.cinza,
  'Vencida': COR.cinzaClaro,
};

const COR_PESSOA: Record<string, string> = {
  'Pessoa física': COR.azul,
  'Pessoa jurídica': COR.laranja,
};

const COR_SEXO: Record<string, string> = {
  'Feminino': COR.laranja,
  'Masculino': COR.azul,
};

// ── Peças ────────────────────────────────────────────────────────────────────



function Variacao({ atual, anterior, invertida = false, rotulo }: { atual: number; anterior?: number; invertida?: boolean; rotulo: string }) {
  if (anterior === undefined) return null;
  if (anterior === 0 && atual === 0) return <span className="text-[11px] text-zinc-500">sem base de comparação</span>;
  if (anterior === 0) return <span className="text-[11px] text-zinc-500">sem base de comparação</span>;
  const d = (atual - anterior) / anterior;
  if (Math.abs(d) < 0.0005) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><Minus size={12} /> estável</span>;
  }
  const sobe = d > 0;
  const bom = invertida ? !sobe : sobe;
  const Icone = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${bom ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icone size={13} /> {fmtPct(Math.abs(d))}
      <span className="font-normal text-zinc-500">{rotulo}</span>
    </span>
  );
}

function Tile({ rotulo, valor, detalhe, variacao, className = '', estilo }: {
  rotulo: string; valor: string; detalhe?: string; variacao?: React.ReactNode; className?: string; estilo?: React.CSSProperties;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 short:p-3 ${className}`} style={estilo}>
      <p className="text-[11px] font-medium text-zinc-500">{rotulo}</p>
      <p className="text-xl font-bold text-zinc-100 mt-1.5 truncate">{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{detalhe}</p>}
      {variacao && <div className="mt-1.5">{variacao}</div>}
    </div>
  );
}

// Cor da barra de progresso da meta:
// falta mais da metade → vermelho; falta menos de 20% → amarelo; bateu → verde;
// entre 50% e 80% atingido → azul (neutro, ainda sem alerta).
type FaixaMeta = 'critica' | 'andamento' | 'perto' | 'batida';
function faixaDaMeta(atingido: number): FaixaMeta {
  if (atingido >= 1) return 'batida';
  if (atingido >= 0.8) return 'perto';
  if (atingido < 0.5) return 'critica';
  return 'andamento';
}
const CLASSE_FAIXA: Record<FaixaMeta, string> = {
  critica: 'bg-red-500',
  andamento: 'bg-blue-500',
  perto: 'bg-amber-400',
  batida: 'bg-emerald-500',
};
const TEXTO_FAIXA: Record<FaixaMeta, string> = {
  critica: 'text-red-400',
  andamento: 'text-zinc-200',
  perto: 'text-amber-400',
  batida: 'text-emerald-400',
};

function TituloSecao({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap pt-3 first:pt-0">
      <h3 className="text-sm font-bold text-zinc-200">{titulo}</h3>
      {descricao && <p className="text-[11px] text-zinc-500">{descricao}</p>}
    </div>
  );
}


// ── Vendas de um empreendimento ──────────────────────────────────────────────

const fmtData = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '–');

function Diferenca({ contrato, tabela }: { contrato: number; tabela: number }) {
  const d = contrato - tabela;
  const pct = tabela ? d / tabela : 0;
  if (Math.abs(pct) < 0.0005) return <span className="text-zinc-500">igual à tabela</span>;
  const cor = d < 0 ? 'text-red-400' : 'text-emerald-400';
  const sinal = d > 0 ? '+' : '−';
  return (
    <span className={`tabular-nums whitespace-nowrap ${cor}`}>
      {sinal}{fmtMoeda(Math.abs(d))} <span className="opacity-80">({sinal}{fmtPct(Math.abs(pct))})</span>
    </span>
  );
}

const COR_FINANCIAMENTO: Record<string, string> = {
  'Caixa': 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  'Banco privado': 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  'Caixa e banco privado': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
};

function SeloFinanciamento({ valor }: { valor: string | null | undefined }) {
  if (!valor) return <span className="text-zinc-600" title="O CV não tem condição de pagamento ativa para esta reserva">–</span>;
  const cor = COR_FINANCIAMENTO[valor];
  if (!cor) return <span className="text-zinc-500">{valor}</span>;
  return <span className={`inline-block rounded border px-1.5 py-px text-[10px] font-semibold whitespace-nowrap ${cor}`}>{valor}</span>;
}

function VendasDoEmpreendimento({ vendas, tabelaPor }: { vendas: CvReserva[]; tabelaPor: Map<number, ValorTabela> }) {
  const comTabela = vendas.filter(v => tabelaPor.has(v.idreserva));
  const somaContrato = vendas.reduce((t, v) => t + v.valor_contrato, 0);
  const somaContratoComp = comTabela.reduce((t, v) => t + v.valor_contrato, 0);
  const somaTabela = comTabela.reduce((t, v) => t + (tabelaPor.get(v.idreserva)?.valor ?? 0), 0);
  const blocoVisivel = (b: string | null) => !!b && !/[uú]nic|vagas/i.test(b);
  const th = 'font-semibold px-3 py-2 border-b border-zinc-800/70';
  const td = 'px-3 py-2 border-b border-zinc-800/40';

  return (
    <div className="px-4 py-3 pl-10">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-[11px] min-w-[880px]">
          <thead>
            <tr className="text-zinc-500">
              <th className={`${th} text-left`}>Unidade</th>
              <th className={`${th} text-left`}>Data</th>
              <th className={`${th} text-left`}>Corretor</th>
              <th className={`${th} text-left`}>Imobiliária</th>
              <th className={`${th} text-left`} title="Pelas séries da condição de pagamento vigente no CV CRM">Financiamento</th>
              <th className={`${th} text-right`}>Valor de contrato</th>
              <th className={`${th} text-right`} title="Valor da unidade na tabela de vendas no momento da venda">Valor de tabela</th>
              <th className={`${th} text-right`}>Diferença</th>
            </tr>
          </thead>
          <tbody>
            {vendas.map(v => {
              const t = tabelaPor.get(v.idreserva);
              return (
                <tr key={v.idreserva} className="text-zinc-300">
                  <td className={`${td} font-semibold text-zinc-100 whitespace-nowrap`}>
                    {v.unidade ?? '–'}
                    {blocoVisivel(v.bloco) && <span className="ml-1.5 font-normal text-zinc-500">{v.bloco}</span>}
                  </td>
                  <td className={`${td} tabular-nums whitespace-nowrap`}>{fmtData(v.data_venda)}</td>
                  <td className={`${td} max-w-[200px] truncate`}><Nome nome={v.corretor} /></td>
                  <td className={`${td} max-w-[200px] truncate`}><Nome nome={v.imobiliaria} /></td>
                  <td className={td}><SeloFinanciamento valor={v.financiamento} /></td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{fmtMoeda(v.valor_contrato)}</td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    {t ? (
                      <>
                        {fmtMoeda(t.valor)}
                        {t.fonte === 'CV' && <span className="ml-1 text-[9px] font-semibold text-zinc-500" title="Valor de tabela guardado pelo CV CRM; o Orbit não tem esta venda">CV</span>}
                      </>
                    ) : <span className="text-zinc-600" title="Nem o Orbit nem o CV têm o valor de tabela desta venda">sem tabela</span>}
                  </td>
                  <td className={`${td} text-right`}>{t ? <Diferenca contrato={v.valor_contrato} tabela={t.valor} /> : <span className="text-zinc-600">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-zinc-200 font-semibold">
              <td className="px-3 pt-2" colSpan={5}>
                {fmtInt(vendas.length)} {vendas.length === 1 ? 'venda' : 'vendas'}
                {comTabela.length < vendas.length && (
                  <span className="ml-2 font-normal text-zinc-500">diferença calculada em {fmtInt(comTabela.length)} com valor de tabela</span>
                )}
              </td>
              <td className="px-3 pt-2 text-right tabular-nums whitespace-nowrap">{fmtMoeda(somaContrato)}</td>
              <td className="px-3 pt-2 text-right tabular-nums whitespace-nowrap">{comTabela.length ? fmtMoeda(somaTabela) : '–'}</td>
              <td className="px-3 pt-2 text-right">{comTabela.length ? <Diferenca contrato={somaContratoComp} tabela={somaTabela} /> : '–'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Painel ───────────────────────────────────────────────────────────────────

const SEM_ORBIT: VendaOrbit[] = [];
const SEM_PRECOS: PrecoOrbit[] = [];

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

export function PainelDesempenho({ dados, hoje = hojeBrasilia(), metas = null, vendasOrbit = SEM_ORBIT, precosOrbit = SEM_PRECOS }: {
  dados: CvDados; hoje?: string; metas?: MetasComercial | null; vendasOrbit?: VendaOrbit[]; precosOrbit?: PrecoOrbit[];
}) {
  const [empreendimentos, setEmpreendimentos] = useState<number[] | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const tabelaPor = useMemo(() => valoresDeTabela(dados.reservas, vendasOrbit), [dados.reservas, vendasOrbit]);
  const precos = useMemo(() => precosDasUnidades(dados.unidades, precosOrbit), [dados.unidades, precosOrbit]);
  const [canal, setCanalBruto] = useState<string | null>(null);
  const [imobiliaria, setImobiliariaBruta] = useState<string | null>(null);
  const [corretor, setCorretor] = useState<string | null>(null);
  const [financiamento, setFinanciamento] = useState<string | null>(null);
  // Só os tipos que existem nos dados, na ordem de FINANCIAMENTOS.
  const opcoesFinanciamento = useMemo(() => {
    const presentes = new Set(dados.reservas.map(financiamentoDe));
    return FINANCIAMENTOS.filter(f => presentes.has(f));
  }, [dados.reservas]);
  // Cada nível do filtro depende do anterior: trocar um zera os de baixo.
  const setCanal = (c: string | null) => { setCanalBruto(c); setImobiliariaBruta(null); setCorretor(null); };
  const setImobiliaria = (i: string | null) => { setImobiliariaBruta(i); setCorretor(null); };

  // Opções do segundo e do terceiro filtro: quem tem reserva no canal, nos empreendimentos escolhidos.
  const reservasDoCanal = useMemo(() => !canal ? [] : dados.reservas.filter(r =>
    r.canal === canal && (!empreendimentos || empreendimentos.includes(Number(r.idempreendimento)))),
  [dados.reservas, canal, empreendimentos]);
  const opcoesImobiliaria = useMemo(
    () => [...new Set(reservasDoCanal.map(r => r.imobiliaria).filter((x): x is string => !!x))].sort(porNome),
    [reservasDoCanal],
  );
  // Canal de uma imobiliária só (Autônomos, House) vai direto para o corretor.
  const imobiliariaUnica = opcoesImobiliaria.length === 1;
  const imobiliariaEfetiva = imobiliaria ?? (imobiliariaUnica ? opcoesImobiliaria[0] : null);
  const opcoesCorretor = useMemo(() => !imobiliariaEfetiva ? [] : [...new Set(reservasDoCanal
    .filter(r => r.imobiliaria === imobiliariaEfetiva)
    .map(r => r.corretor).filter((x): x is string => !!x))].sort(porNome),
  [reservasDoCanal, imobiliariaEfetiva]);

  const primeiraData = useMemo(
    () => dados.reservas.reduce((m, r) => (r.data_venda && r.data_venda < m ? r.data_venda : m), hoje),
    [dados.reservas, hoje],
  );
  const [selecao, setSelecao] = useState<SelecaoPeriodo>(() => ({
    atalho: "este_ano", ...resolverAtalho("este_ano", hoje, hoje)!, comparar: true, tipoComparacao: "ano_anterior",
  }));

  const listaEmpreendimentos = useMemo(() => {
    const m = new Map<number, { nome: string; ordem: number }>();
    dados.unidades.forEach(u => m.set(Number(u.idempreendimento), nomeCurtoEmpreendimento(u.empreendimento)));
    return [...m.entries()].map(([id, n]) => ({ id, ...n })).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [dados.unidades]);

  const periodo: Periodo = useMemo(() => ({ de: selecao.de, ate: selecao.ate }), [selecao]);
  const comparacao = useMemo(() => periodoDeComparacao(selecao), [selecao]);
  const rotuloComp = rotuloComparacao(selecao.tipoComparacao);

  // "Este mês": a meta é a do mês inteiro, então o gráfico vai até o último dia do mês.
  const fimDoMes = useMemo(() => {
    if (selecao.atalho !== 'este_mes') return null;
    const [y, m] = selecao.ate.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }, [selecao]);
  const filtros: FiltrosPainel = useMemo(
    () => ({ empreendimentos, periodo, comparacao, canal, imobiliaria, corretor, financiamento, fimSerie: fimDoMes }),
    [empreendimentos, periodo, comparacao, canal, imobiliaria, corretor, financiamento, fimDoMes],
  );
  const painel: Painel = useMemo(() => calcularPainel(dados, filtros, precos), [dados, filtros, precos]);

  const toggleEmpreendimento = (id: number) => {
    setEmpreendimentos(prev => {
      // Partindo de "Todos", o clique escolhe; depois disso, soma ou retira.
      if (prev === null) return [id];
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      return next.length === 0 || next.length === listaEmpreendimentos.length ? null : next;
    });
  };


  const k = painel.kpis;
  const a: Kpis | undefined = painel.anterior ?? undefined;
  const rotuloPeriodo = selecao.atalho === "personalizado" ? rotuloSelecao(selecao) : rotuloSelecao(selecao).toLowerCase();
  const disponiveis = painel.estoqueTotal['disponível'];
  const estoqueAberto = disponiveis + painel.estoqueTotal.reservada;
  const totalCanais = painel.canais.reduce((s, c) => s + c.valor, 0);
  const totalVendasPerfil = painel.perfil.base;

  // Meta do recorte: soma das metas dos empreendimentos filtrados ("Todos" = todas).
  const cvEmpreendimentos = useMemo(() => {
    const m = new Map<number, string>();
    dados.unidades.forEach(u => m.set(Number(u.idempreendimento), u.empreendimento));
    return [...m.entries()].map(([id, nome]) => ({ id, nome }));
  }, [dados.unidades]);
  const metaMensal = useMemo(
    () => (metas ? metaMensalDoRecorte(metas, cvEmpreendimentos, empreendimentos) : null),
    [metas, cvEmpreendimentos, empreendimentos],
  );
  // Meta de cada mês rateada pelos dias que o período cobre dele em cada ponto.
  const metaBruta = (p: { meses: Record<string, number> }) => (metaMensal === null ? 0
    : Object.entries(p.meses).reduce((t, [mes, frac]) => t + metaMensal(mes) * frac, 0));
  const somaMetas = painel.serie.reduce((t, p) => t + metaBruta(p), 0);
  // Sem nenhuma meta cadastrada no recorte, o cartão mostra "Não definida".
  const temMeta = somaMetas > 0;
  const metaDe = (p: { meses: Record<string, number> }) => (temMeta ? metaBruta(p) : null);
  const metaTotal = temMeta ? somaMetas : null;
  const atingido = metaTotal ? k.vgv / metaTotal : 0;
  const faixaMeta = faixaDaMeta(atingido);
  const fatorSuper = metas?.fatorSuper ?? 1.5;
  const superMeta = metaTotal === null ? null : metaTotal * fatorSuper;
  const faixaPlanilha = faixaAtingimento(atingido, fatorSuper);
  // Pontos depois do fim do período (os dias que ainda virão em "Este mês") só têm meta.
  const ehFuturo = (p: { chave: string }) => fimDoMes !== null && p.chave > selecao.ate;
  // Ritmo: quanto da meta do mês já deveria estar vendido até hoje.
  const metaAteHoje = fimDoMes !== null && temMeta
    ? painel.serie.filter(p => !ehFuturo(p)).reduce((t, p) => t + metaBruta(p), 0)
    : null;
  const ritmo = metaAteHoje ? k.vgv / metaAteHoje : null;

  // Curva de vendas: cada ponto carrega o acumulado desde o início do período.
  let acumulado = 0;
  let metaAcumulada = 0;
  const curva = painel.serie.map(p => {
    acumulado += p.valor;
    const m = metaDe(p);
    metaAcumulada += m ?? 0;
    const futuro = ehFuturo(p);
    return { ...p, futuro, valorPonto: p.valor, metaPonto: m, realizado: futuro ? null : acumulado, meta: m === null ? null : metaAcumulada };
  });
  const rotuloSerie = painel.granularidade === 'dia' ? 'Dia' : painel.granularidade === 'mês' ? 'Mês' : 'Trimestre';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      {/* Filtros: uma faixa só, fixa, porque valem para a página inteira. */}
      <div className="sticky top-0 z-20 view-pad-x py-2.5 bg-[#08080a]/95 backdrop-blur border-b border-zinc-900/80 flex items-center gap-2 flex-wrap">
        {/* Empreendimentos: botões liga/desliga soltos, sem moldura em volta. */}
        <div role="group" aria-label="Empreendimentos" className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            aria-pressed={empreendimentos === null}
            onClick={() => setEmpreendimentos(null)}
            className={empreendimentos === null ? BOTAO_FILTRO : BOTAO_FILTRO_NEUTRO}
          >
            <Building2 size={13} className={ICONE_FILTRO} /> Todos
          </button>
          {listaEmpreendimentos.map(e => {
            const ativo = !!empreendimentos?.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => toggleEmpreendimento(e.id)}
                className={ativo ? BOTAO_FILTRO : BOTAO_FILTRO_NEUTRO}
              >
                {e.nome}
              </button>
            );
          })}
        </div>
        <span className="hidden sm:block w-px h-5 bg-zinc-800 mx-1" aria-hidden />
        <SeletorPeriodo valor={selecao} onChange={setSelecao} hoje={hoje} primeiraData={primeiraData} />
        <FiltroLista
          icone={<Store size={13} />}
          rotuloGrupo="Canal"
          todos="Todos os canais"
          resumo={canal ?? "Todos os canais"}
          opcoes={CANAIS.map(c => ({ id: c, label: c }))}
          selecionados={canal ? [canal] : null}
          onTodos={() => setCanal(null)}
          onAlternar={c => setCanal(c)}
          largura="w-52"
        />
        <FiltroLista
          icone={<Landmark size={13} />}
          rotuloGrupo="Financiamento"
          todos="Todos os financiamentos"
          resumo={financiamento ?? "Todos os financiamentos"}
          opcoes={opcoesFinanciamento.map(f => ({ id: f, label: f }))}
          selecionados={financiamento ? [financiamento] : null}
          onTodos={() => setFinanciamento(null)}
          onAlternar={f => setFinanciamento(f)}
          largura="w-60"
        />
        {canal && !imobiliariaUnica && opcoesImobiliaria.length > 0 && (
          <FiltroLista
            icone={<Briefcase size={13} />}
            rotuloGrupo="Imobiliária"
            todos="Todas as imobiliárias"
            resumo={imobiliaria ? nomeCurto(imobiliaria) : 'Todas as imobiliárias'}
            resumoTitulo={imobiliaria ?? undefined}
            opcoes={opcoesImobiliaria.map(i => ({ id: i, label: nomeCurto(i), titulo: i }))}
            selecionados={imobiliaria ? [imobiliaria] : null}
            onTodos={() => setImobiliaria(null)}
            onAlternar={i => setImobiliaria(i)}
            largura="w-64"
          />
        )}
        {imobiliariaEfetiva && opcoesCorretor.length > 0 && (
          <FiltroLista
            icone={<UserRound size={13} />}
            rotuloGrupo="Corretor"
            todos="Todos os corretores"
            resumo={corretor ? nomeCurto(corretor) : 'Todos os corretores'}
            resumoTitulo={corretor ?? undefined}
            opcoes={opcoesCorretor.map(c => ({ id: c, label: nomeCurto(c), titulo: c }))}
            selecionados={corretor ? [corretor] : null}
            onTodos={() => setCorretor(null)}
            onAlternar={c => setCorretor(c)}
            largura="w-64"
          />
        )}
      </div>

      <div className="view-pad-x view-pad-y flex flex-col gap-3">
        {/* ── Resultado ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          {/* Os dois cartões empilhados dividem a altura da curva ao lado. */}
          <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-2 gap-3">
            <div className="min-w-0 flex flex-col justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 short:p-3">
              <p className="text-[11px] font-medium text-zinc-500" title="Tudo o que foi vendido no período, inclusive vendas que depois viraram distrato">VGV bruto vendido · {rotuloPeriodo}</p>
              <p className="text-[32px] short:text-[28px] leading-none font-bold text-zinc-100 tracking-tight">{fmtCompacto(k.vgvBruto)}</p>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-zinc-400">{fmtInt(k.unidades)} {k.unidades === 1 ? 'unidade vendida' : 'unidades vendidas'}</span>
                <Variacao rotulo={rotuloComp} atual={k.vgvBruto} anterior={a?.vgvBruto} />
              </div>
              <div className="pt-2 border-t border-zinc-800/70 flex items-end justify-between gap-2 flex-wrap">
                <div className="min-w-0" title={`${fmtMoeda(k.vgvBruto)} bruto − ${fmtMoeda(k.distratosValor)} em distratos do período`}>
                  <p className="text-[11px] font-medium text-zinc-500">VGV líquido</p>
                  <p className="text-lg font-bold text-zinc-100 leading-tight">{fmtCompacto(k.vgvLiquido)}</p>
                  <p className="text-[11px] text-zinc-500">
                    {k.distratosValor > 0 ? `− ${fmtCompacto(k.distratosValor)} em distratos` : 'Sem distratos no período'}
                  </p>
                </div>
                <Variacao rotulo={rotuloComp} atual={k.vgvLiquido} anterior={a?.vgvLiquido} />
              </div>
            </div>

            <div className="min-w-0 flex flex-col justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 short:p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-zinc-500">VGV meta</p>
                {metaTotal !== null && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-md border ${
                    faixaPlanilha === 'super' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                      : faixaPlanilha === 'meta' ? 'text-blue-300 bg-blue-500/10 border-blue-500/25'
                      : 'text-zinc-400 bg-zinc-800/60 border-zinc-700/60'
                  }`}>{ROTULO_FAIXA[faixaPlanilha]}</span>
                )}
              </div>
              {metaTotal !== null ? (
                <>
                  <p className="text-[32px] short:text-[28px] leading-none font-bold text-zinc-100 tracking-tight">{fmtCompacto(metaTotal)}</p>
                  <div>
                    <div
                      role="meter"
                      aria-label="Meta atingida"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(Math.round(atingido * 100), 100)}
                      className="h-2 rounded-full bg-zinc-800 overflow-hidden"
                    >
                      <div className={`h-full rounded-full transition-colors ${CLASSE_FAIXA[faixaMeta]}`} style={{ width: `${Math.min(atingido * 100, 100)}%` }} />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1.5">
                      <span className={`font-semibold ${TEXTO_FAIXA[faixaMeta]}`}>{fmtPct(atingido)}</span> da meta ·{' '}
                      {k.vgv >= metaTotal ? `${fmtCompacto(k.vgv - metaTotal)} acima` : `faltam ${fmtCompacto(metaTotal - k.vgv)}`}
                    </p>
                    {metaAteHoje !== null && ritmo !== null && (
                      <p className="text-[11px] text-zinc-500 mt-0.5" title="Meta do mês rateada pelos dias que já passaram, comparada com o realizado">
                        Esperado até hoje {fmtCompacto(metaAteHoje)} ·{' '}
                        <span className={`font-semibold ${ritmo >= 1 ? 'text-emerald-400' : ritmo >= 0.8 ? 'text-amber-400' : 'text-red-400'}`}>
                          {ritmo >= 1 ? 'no ritmo' : 'abaixo do ritmo'} ({fmtPct(ritmo, 0)})
                        </span>
                      </p>
                    )}
                    {superMeta !== null && (
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Super Meta {fmtCompacto(superMeta)} ·{' '}
                        {k.vgv >= superMeta ? <span className="text-emerald-400 font-semibold">batida</span> : `faltam ${fmtCompacto(superMeta - k.vgv)}`}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-zinc-400">Não definida</p>
                  <p className="text-[11px] text-zinc-500">Sem meta cadastrada para este recorte.</p>
                </>
              )}
            </div>
          </div>

          <CardGrafico
            className="xl:col-span-8"
            titulo="Meta x realizado"
            subtitulo={`VGV vendido por ${painel.granularidade}`}
            acao={<Legenda itens={temMeta
              ? [
                  { label: `Realizado ${fmtCompacto(k.vgv)}`, cor: COR.azul },
                  { label: 'Acima da meta', cor: COR.verde },
                  { label: `Meta ${fmtCompacto(metaTotal ?? 0)}`, cor: COR.cinza, tracejado: true },
                ]
              : [{ label: `Realizado ${fmtCompacto(k.vgv)}`, cor: COR.azul }]} />}
            tabela={{
              colunas: [rotuloSerie, 'Realizado', 'Meta', '% da meta', 'Realizado acumulado', 'Meta acumulada'],
              linhas: curva.map(p => [
                p.label, p.futuro ? '–' : fmtMoeda(p.valorPonto),
                p.metaPonto === null ? '–' : fmtMoeda(p.metaPonto),
                p.metaPonto && !p.futuro ? fmtPct(p.valorPonto / p.metaPonto) : '–',
                p.realizado === null ? '–' : fmtMoeda(p.realizado),
                p.meta === null ? '–' : fmtMoeda(p.meta),
              ]),
            }}
          >
            <GraficoColunasMeta
              formatarEixo={n => fmtCompacto(n, false)}
              formatarRotulo={n => fmtCompacto(n, false)}
              colunas={curva.map(p => ({
                chave: p.chave,
                label: p.label,
                valor: p.valorPonto,
                meta: p.metaPonto,
                aria: p.futuro
                  ? `${p.labelLongo}: ainda não chegou${p.metaPonto === null ? '' : `, meta ${fmtMoeda(p.metaPonto)}`}`
                  : `${p.labelLongo}: vendido ${fmtMoeda(p.valorPonto)}${p.metaPonto === null ? '' : `, meta ${fmtMoeda(p.metaPonto)}`}`,
                tip: p.futuro ? (
                  <>
                    <TipTitulo>{p.labelLongo}</TipTitulo>
                    <p className="text-zinc-500">Ainda não chegou</p>
                    {p.metaPonto !== null && <p className="tabular-nums">Meta: {fmtMoeda(p.metaPonto)}</p>}
                    {p.meta !== null && <p className="tabular-nums text-zinc-500">Meta acumulada: {fmtMoeda(p.meta)}</p>}
                  </>
                ) : (
                  <>
                    <TipTitulo>{p.labelLongo}</TipTitulo>
                    <p className="tabular-nums">Realizado: {fmtMoeda(p.valorPonto)} · {fmtInt(p.unidades)} un.</p>
                    {p.metaPonto !== null && <p className="tabular-nums">Meta: {fmtMoeda(p.metaPonto)} · {fmtPct(p.metaPonto ? p.valorPonto / p.metaPonto : 0)}</p>}
                    {p.metaPonto !== null && p.metaPonto > 0 && p.valorPonto >= p.metaPonto && (
                      <p className="font-semibold" style={{ color: COR.verde }}>Meta superada em {fmtMoeda(p.valorPonto - p.metaPonto)}</p>
                    )}
                    <p className="tabular-nums text-zinc-500">
                      Acumulado: {fmtMoeda(p.realizado ?? 0)}{p.meta !== null && ` de ${fmtMoeda(p.meta)}`}
                    </p>
                  </>
                ),
              }))}
            />
          </CardGrafico>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile rotulo="Ticket médio" valor={fmtCompacto(k.ticket)} variacao={<Variacao rotulo={rotuloComp} atual={k.ticket} anterior={a?.ticket} />} />
          <Tile rotulo="Preço por m²" valor={fmtMoeda(k.precoM2)} variacao={<Variacao rotulo={rotuloComp} atual={k.precoM2} anterior={a?.precoM2} />} />
          <Tile
            rotulo="VSO"
            valor={fmtPct(k.vso)}
            detalhe={`${fmtInt(k.unidades)} de ${fmtInt(k.unidades + estoqueAberto)} un. ofertadas`}
          />
          <Tile
            rotulo="Distrato"
            valor={fmtInt(k.distratos)}
            detalhe={k.distratos > 0 ? `${fmtCompacto(k.distratosValor)} · ${fmtPct(k.taxaDistrato)} das vendas` : 'Nenhum no período'}
            variacao={<Variacao rotulo={rotuloComp} atual={k.distratos} anterior={a?.distratos} invertida />}
          />
          <Tile
            rotulo="Estoque"
            valor={fmtInt(estoqueAberto)}
            detalhe={`${fmtInt(disponiveis)} disponíveis + ${fmtInt(painel.estoqueTotal.reservada)} reservadas`}
          />
          <Tile
            rotulo="Disponível"
            valor={fmtInt(disponiveis)}
            detalhe={estoqueAberto > 0 ? `${fmtPct(disponiveis / estoqueAberto, 0)} do estoque` : 'Sem estoque'}
          />
        </div>

        {/* ── Empreendimentos ── */}
        <TituloSecao titulo="Empreendimentos" descricao="Vendas no período selecionado; estoque na posição atual" />
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800/70">
            <Legenda itens={SITUACOES_ESTOQUE.map(s => ({ label: ROTULO_ESTOQUE[s], cor: COR_ESTOQUE[s] }))} />
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs min-w-[960px]">
              <thead>
                <tr className="text-zinc-500">
                  <th className="text-left font-semibold px-4 py-2 border-b border-zinc-800">Empreendimento</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800">Vendas</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800">VGV</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800">Ticket</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800">R$/m²</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800">VSO</th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-zinc-800 w-[30%]">Posição do estoque</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800">Disponíveis</th>
                  <th className="text-right font-semibold px-3 py-2 border-b border-zinc-800 whitespace-nowrap" title="Disponíveis + reservadas pelo valor atual da tabela de vendas (versão principal)">Valor do estoque</th>
                  <th className="text-right font-semibold px-4 py-2 border-b border-zinc-800" title="Vendidas ÷ (vendidas + reservadas + disponíveis). Bloqueadas ficam fora.">% vendido</th>
                </tr>
              </thead>
              <tbody>
                {painel.empreendimentos.map(e => {
                  const temVendas = e.vendas.length > 0;
                  const estaAberto = aberto === e.id && temVendas;
                  return (
                  <React.Fragment key={e.id}>
                  <tr
                    className={`text-zinc-300 ${temVendas ? 'cursor-pointer hover:bg-zinc-800/30' : ''} ${estaAberto ? 'bg-zinc-800/25' : ''}`}
                    onClick={temVendas ? () => setAberto(estaAberto ? null : e.id) : undefined}
                  >
                    <td className="px-4 py-2.5 border-b border-zinc-800/50 font-medium text-zinc-100 whitespace-nowrap">
                      {temVendas ? (
                        <button
                          type="button"
                          aria-expanded={estaAberto}
                          aria-label={`${estaAberto ? 'Ocultar' : 'Ver'} as vendas de ${e.nome}`}
                          onClick={ev => { ev.stopPropagation(); setAberto(estaAberto ? null : e.id); }}
                          className="inline-flex items-center gap-1.5 -ml-1 px-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <ChevronRight size={13} className={`shrink-0 text-zinc-500 transition-transform ${estaAberto ? 'rotate-90' : ''}`} />
                          {e.nome}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 pl-[18px]">{e.nome}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums">{fmtInt(e.vendidasPeriodo)}</td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums whitespace-nowrap">{e.vgvPeriodo > 0 ? fmtCompacto(e.vgvPeriodo) : '–'}</td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums whitespace-nowrap">{e.ticket > 0 ? fmtCompacto(e.ticket) : '–'}</td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums whitespace-nowrap">{e.precoM2 > 0 ? fmtMoeda(e.precoM2) : '–'}</td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums">{fmtPct(e.vso)}</td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50">
                      <BarraSegmentada
                        nome={e.nome}
                        segmentos={SITUACOES_ESTOQUE.map(s => ({
                          label: ROTULO_ESTOQUE[s],
                          valor: e.estoque[s],
                          cor: COR_ESTOQUE[s],
                          tip: <><TipTitulo>{e.nome}</TipTitulo><p className="tabular-nums">{ROTULO_ESTOQUE[s]}: {fmtInt(e.estoque[s])} de {fmtInt(e.total)}</p></>,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums">{fmtInt(e.estoque['disponível'])}</td>
                    <td
                      className="px-3 py-2.5 border-b border-zinc-800/50 text-right tabular-nums whitespace-nowrap"
                      title={e.estoqueSemPreco > 0
                        ? `${fmtInt(e.estoqueSemPreco)} ${e.estoqueSemPreco === 1 ? 'unidade do estoque está' : 'unidades do estoque estão'} sem preço na tabela de vendas e ${e.estoqueSemPreco === 1 ? 'ficou' : 'ficaram'} fora da soma`
                        : e.valorEstoque !== null ? fmtMoeda(e.valorEstoque) : undefined}
                    >
                      {e.valorEstoque !== null ? fmtMilhoes(e.valorEstoque) : <span className="text-zinc-600">{e.estoque['disponível'] + e.estoque.reservada > 0 ? 'sem tabela' : '–'}</span>}
                      {e.valorEstoque !== null && e.estoqueSemPreco > 0 && <span className="ml-1 text-amber-400">*</span>}
                    </td>
                    <td className="px-4 py-2.5 border-b border-zinc-800/50 text-right tabular-nums font-semibold text-zinc-100">{fmtPct(e.pctVendido, 0)}</td>
                  </tr>
                  {estaAberto && (
                    <tr>
                      <td colSpan={10} className="p-0 border-b border-zinc-800/50 bg-zinc-950/40">
                        <VendasDoEmpreendimento vendas={e.vendas} tabelaPor={tabelaPor} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Origem ── */}
        <TituloSecao titulo="Origem das vendas" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {([
            { rotulo: 'VGV geral', canal: null },
            { rotulo: 'VGV imobiliárias', canal: 'Imobiliárias' },
            { rotulo: 'VGV autônomo', canal: 'Autônomos' },
            { rotulo: 'VGV house', canal: 'House' },
          ] as const).map(t => {
            const fatia = t.canal ? painel.canais.find(c => c.label === t.canal) : null;
            const valor = t.canal ? fatia?.valor ?? 0 : k.vgv;
            const un = t.canal ? fatia?.unidades ?? 0 : k.unidades;
            const ant = !a ? undefined : t.canal ? painel.canaisAnterior?.find(c => c.label === t.canal)?.valor ?? 0 : a.vgv;
            return (
              <Tile
                key={t.rotulo}
                rotulo={t.rotulo}
                valor={fmtCompacto(valor)}
                detalhe={`${fmtInt(un)} ${un === 1 ? 'unidade' : 'unidades'}${t.canal && k.vgv > 0 ? ` · ${fmtPct(valor / k.vgv, 0)} do VGV` : ''}`}
                variacao={<Variacao rotulo={rotuloComp} atual={valor} anterior={ant} />}
                className={t.canal ? 'border-l-2' : ''}
                estilo={t.canal ? { borderLeftColor: COR_CANAL[t.canal] } : undefined}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          <CardGrafico
            titulo="Vendas por canal"
            subtitulo="Participação no VGV do período"
            tabela={{
              colunas: ['Canal', 'Unidades', 'VGV', '%'],
              linhas: painel.canais.map(c => [c.label, fmtInt(c.unidades), fmtMoeda(c.valor), fmtPct(totalCanais ? c.valor / totalCanais : 0)]),
            }}
            rodape={painel.canais.some(c => c.label === 'Não classificado')
              ? '"Não classificado" são as vendas lançadas na "Imobiliária Demonstração" do CV CRM.'
              : undefined}
          >
            <Rosca
              centro={fmtCompacto(totalCanais)}
              centroLabel="VGV"
              fatias={painel.canais.map(c => ({
                label: c.label,
                valor: c.valor,
                cor: COR_CANAL[c.label] ?? COR.cinza,
                rotulo: fmtPct(totalCanais ? c.valor / totalCanais : 0, 0),
                tip: <><TipTitulo>{c.label}</TipTitulo><p className="tabular-nums">{fmtMoeda(c.valor)} · {fmtInt(c.unidades)} un.</p></>,
              }))}
            />
          </CardGrafico>
          <CardGrafico
            titulo="Imobiliárias"
            subtitulo="Maiores VGVs do período"
            tabela={{ colunas: ['Imobiliária', 'Unidades', 'VGV'], linhas: painel.imobiliarias.map(i => [i.label, fmtInt(i.unidades), fmtMoeda(i.valor)]) }}
          >
            <ListaBarras barras={painel.imobiliarias.map(i => ({
              label: nomeCurto(i.label),
              titulo: i.label,
              valor: i.valor,
              rotulo: fmtCompacto(i.valor),
              tip: <><TipTitulo>{i.label}</TipTitulo><p className="tabular-nums">{fmtMoeda(i.valor)} · {fmtInt(i.unidades)} un.</p></>,
            }))} />
          </CardGrafico>
          <CardGrafico
            titulo="Mídia"
            subtitulo="Como o cliente chegou"
            tabela={{ colunas: ['Mídia', 'Unidades', 'VGV'], linhas: painel.midias.map(i => [i.label, fmtInt(i.unidades), fmtMoeda(i.valor)]) }}
            rodape={painel.midiasSemInfo > 0 ? `${fmtInt(painel.midiasSemInfo)} de ${fmtInt(k.unidades)} vendas estão sem mídia no CV CRM e ficaram fora do gráfico.` : undefined}
          >
            <ListaBarras barras={painel.midias.map(i => ({
              label: i.label,
              valor: i.valor,
              rotulo: fmtCompacto(i.valor),
              tip: <><TipTitulo>{i.label}</TipTitulo><p className="tabular-nums">{fmtMoeda(i.valor)} · {fmtInt(i.unidades)} un.</p></>,
            }))} />
          </CardGrafico>
        </div>

        {/* ── Reservas ── */}
        <TituloSecao titulo="Reservas" descricao="Cadastradas no período, conforme a situação atual de cada uma" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <CardGrafico
            titulo="O que aconteceu com as reservas"
            subtitulo={`${fmtPct(painel.conversao)} viraram venda`}
            tabela={{ colunas: ['Situação', 'Reservas'], linhas: painel.desfechos.map(d => [d.label, fmtInt(d.n)]) }}
          >
            <Rosca
              centro={fmtInt(painel.reservasNoPeriodo)}
              centroLabel="reservas"
              fatias={painel.desfechos.map(d => ({
                label: d.label,
                valor: d.n,
                cor: COR_DESFECHO[d.label as Desfecho],
                rotulo: fmtInt(d.n),
                tip: <><TipTitulo>{d.label}</TipTitulo><p className="tabular-nums">{fmtInt(d.n)} · {fmtPct(painel.reservasNoPeriodo ? d.n / painel.reservasNoPeriodo : 0)}</p></>,
              }))}
            />
          </CardGrafico>
          <CardGrafico
            titulo="Motivos de cancelamento"
            subtitulo="Pela data do cancelamento"
            tabela={{ colunas: ['Motivo', 'Reservas'], linhas: painel.motivosCancelamento.map(m => [m.label, fmtInt(m.n)]) }}
            rodape={painel.motivosCancelamentoSemInfo > 0 ? `${fmtInt(painel.motivosCancelamentoSemInfo)} sem motivo informado.` : undefined}
          >
            <ListaBarras cor={COR.cinza} barras={painel.motivosCancelamento.map(m => ({
              label: m.label, valor: m.n, rotulo: fmtInt(m.n),
              tip: <><TipTitulo>{m.label}</TipTitulo><p className="tabular-nums">{fmtInt(m.n)} reservas</p></>,
            }))} />
          </CardGrafico>
          <CardGrafico
            titulo="Distratos"
            subtitulo={k.distratos > 0 ? `${fmtInt(k.distratos)} no período · ${fmtCompacto(k.distratosValor)} · ${fmtPct(k.taxaDistrato)} das vendas` : 'Nenhum distrato no período'}
            tabela={{ colunas: ['Motivo', 'Distratos'], linhas: painel.motivosDistrato.map(m => [m.label, fmtInt(m.n)]) }}
          >
            <ListaBarras cor={COR.laranja} barras={painel.motivosDistrato.map(m => ({
              label: m.label, valor: m.n, rotulo: fmtInt(m.n),
              tip: <><TipTitulo>{m.label}</TipTitulo><p className="tabular-nums">{fmtInt(m.n)} distratos</p></>,
            }))} />
          </CardGrafico>
        </div>

        {/* ── Clientes ── */}
        <TituloSecao titulo="Perfil de quem comprou" descricao={`${fmtInt(totalVendasPerfil)} vendas do período, sempre em grupo, sem identificar clientes`} />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <CardGrafico
            titulo="Faixa etária"
            subtitulo="Pessoa física, em anos"
            tabela={{ colunas: ['Faixa', 'Vendas'], linhas: painel.perfil.faixaEtaria.map(f => [f.label, fmtInt(f.n)]) }}
            rodape={painel.perfil.semInfo.faixaEtaria > 0 ? `${fmtInt(painel.perfil.semInfo.faixaEtaria)} sem idade informada.` : undefined}
          >
            <GraficoColunas
              rotularTodas
              colunas={painel.perfil.faixaEtaria.map(f => ({
                chave: f.label, label: f.label, valor: f.n,
                aria: `${f.label} anos: ${fmtInt(f.n)} vendas`,
                tip: <><TipTitulo>{f.label} anos</TipTitulo><p className="tabular-nums">{fmtInt(f.n)} vendas</p></>,
              }))}
              formatarEixo={fmtInt}
              formatarRotulo={fmtInt}
            />
          </CardGrafico>
          <CardGrafico
            titulo="Tipo de cliente"
            tabela={{ colunas: ['Tipo', 'Vendas'], linhas: painel.perfil.tipoPessoa.map(t => [t.label, fmtInt(t.n)]) }}
            rodape={painel.perfil.sexo.length > 0 ? (
              <>Pessoa física: {painel.perfil.sexo.map(s => `${s.label.toLowerCase()} ${fmtInt(s.n)}`).join(' · ')}{painel.perfil.semInfo.sexo > 0 ? ` · ${fmtInt(painel.perfil.semInfo.sexo)} sem informação` : ''}.</>
            ) : undefined}
          >
            <Rosca
              centro={fmtInt(painel.perfil.tipoPessoa.reduce((s, t) => s + t.n, 0))}
              centroLabel="vendas"
              fatias={painel.perfil.tipoPessoa.map(t => ({
                label: t.label,
                valor: t.n,
                cor: COR_PESSOA[t.label] ?? COR_SEXO[t.label] ?? COR.cinza,
                rotulo: fmtInt(t.n),
                tip: <><TipTitulo>{t.label}</TipTitulo><p className="tabular-nums">{fmtInt(t.n)} vendas</p></>,
              }))}
            />
          </CardGrafico>
          <CardGrafico
            titulo="Estado civil"
            subtitulo="Pessoa física"
            tabela={{ colunas: ['Estado civil', 'Vendas'], linhas: painel.perfil.estadoCivil.map(t => [t.label, fmtInt(t.n)]) }}
            rodape={painel.perfil.semInfo.estadoCivil > 0 ? `${fmtInt(painel.perfil.semInfo.estadoCivil)} sem informação.` : undefined}
          >
            <ListaBarras barras={painel.perfil.estadoCivil.map(t => ({
              label: t.label, valor: t.n, rotulo: fmtInt(t.n),
              tip: <><TipTitulo>{t.label}</TipTitulo><p className="tabular-nums">{fmtInt(t.n)} vendas</p></>,
            }))} />
          </CardGrafico>
          <CardGrafico
            titulo="Cidade do cliente"
            subtitulo="Onde o comprador mora"
            tabela={{ colunas: ['Cidade', 'Vendas'], linhas: painel.perfil.cidades.map(t => [t.label, fmtInt(t.n)]) }}
            rodape={painel.perfil.semInfo.cidade > 0 ? `${fmtInt(painel.perfil.semInfo.cidade)} sem cidade informada.` : undefined}
          >
            <ListaBarras barras={painel.perfil.cidades.map(t => ({
              label: t.label, valor: t.n, rotulo: fmtInt(t.n),
              tip: <><TipTitulo>{t.label}</TipTitulo><p className="tabular-nums">{fmtInt(t.n)} vendas</p></>,
            }))} />
          </CardGrafico>
        </div>
      </div>
    </div>
  );
}

// ── Carregamento ─────────────────────────────────────────────────────────────

const LIMITE_ATRASO_MS = 3 * 60 * 60 * 1000;

function AvisoSync({ dados }: { dados: CvDados }) {
  const { sync } = dados;
  const concluido = sync?.concluido_em ?? null;
  const atrasado = !concluido || Date.now() - new Date(concluido).getTime() > LIMITE_ATRASO_MS;
  const comErro = sync?.status === 'erro';
  if (comErro || atrasado) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
        <AlertTriangle size={12} />
        {concluido ? `Dados de ${dataHora(concluido)}` : 'Sem sincronização concluída'}
        {comErro ? ' · a última sincronização falhou' : ' · sincronização atrasada'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
      <Clock3 size={12} /> CV CRM · atualizado em {dataHora(concluido as string)}
    </span>
  );
}

function Estado({ icone, titulo, texto, acao }: { icone: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
      <span className="text-zinc-500">{icone}</span>
      <p className="text-sm font-semibold text-zinc-200">{titulo}</p>
      <p className="text-xs text-zinc-500 max-w-sm">{texto}</p>
      {acao}
    </div>
  );
}

export default function DesempenhoComercial() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['cvComercial'],
    queryFn: fetchCvComercial,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  // Valor de tabela congelado pelo Orbit na venda; mesmas chaves do App, então vem do cache.
  const { data: siengeVendas } = useQuery({ queryKey: ['siengeVendas'], queryFn: fetchSiengeVendas });
  // Sem a tabela de metas (ou com erro), o painel segue e o cartão mostra "Não definida".
  const { data: metas } = useQuery({ queryKey: ['comercialMetas'], queryFn: fetchMetasComercial, staleTime: 60 * 1000, retry: 1 });
  const { data: projetos } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const vendasOrbit = useMemo<VendaOrbit[]>(() => {
    const nomePor = new Map((projetos ?? []).map(p => [p.id, p.name]));
    return (siengeVendas ?? []).flatMap(v => {
      const projeto = nomePor.get(v.projectId);
      return projeto ? [{ projeto, unidade: v.unidade, valor: v.valorCongelado, dataVenda: v.dataVenda }] : [];
    });
  }, [siengeVendas, projetos]);
  // Preço atual das unidades: só a versão principal da tabela, como no "Estoque e VGV".
  const { data: tabelaVendas } = useQuery({ queryKey: ['siengeTabelaVendas'], queryFn: fetchSiengeTabelaVendas });
  const { data: versoes } = useQuery({ queryKey: ['siengeTabelaVendaVersoes'], queryFn: fetchSiengeTabelaVendaVersoes });
  const precosOrbit = useMemo<PrecoOrbit[]>(() => {
    const nomePor = new Map((projetos ?? []).map(p => [p.id, p.name]));
    const principal = new Map((versoes ?? []).filter(v => v.principal).map(v => [v.projectId, v.id]));
    return (tabelaVendas ?? []).flatMap(u => {
      const projeto = nomePor.get(u.projectId);
      const p = principal.get(u.projectId);
      if (!projeto || (p && u.versaoId !== p)) return [];
      return [{ projeto, unidade: u.unidade, valor: Number(u.valorTabela) || 0 }];
    });
  }, [tabelaVendas, versoes, projetos]);

  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <Estado icone={<RefreshCw size={20} className="animate-spin" />} titulo="Carregando dados do CV CRM" texto="Isso leva só alguns segundos." />
        ) : isError ? (
          <Estado
            icone={<AlertTriangle size={20} />}
            titulo="Não foi possível carregar os dados"
            texto="A conexão falhou ou a sincronização com o CV CRM ainda não foi ativada neste ambiente."
            acao={
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="mt-1 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg disabled:opacity-50"
              >
                Tentar de novo
              </button>
            }
          />
        ) : !data || data.unidades.length === 0 ? (
          <Estado
            icone={<Clock3 size={20} />}
            titulo="Aguardando a primeira sincronização"
            texto="Assim que o CV CRM enviar os dados, o painel aparece aqui. A sincronização roda de hora em hora."
          />
        ) : (
          <div className="flex flex-col h-full">
            <div className="view-pad-x pt-2.5 shrink-0"><AvisoSync dados={data} /></div>
            <div className="flex-1 min-h-0"><PainelDesempenho dados={data} metas={metas ?? null} vendasOrbit={vendasOrbit} precosOrbit={precosOrbit} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

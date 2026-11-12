import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine, Check, Copy, CornerDownRight, MoreHorizontal, Plus, RotateCcw, Scissors, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import type { PropostaParcela } from '../../lib/comercialApi';
import {
  ParcelaFluxo, PERIODICIDADES, centavos, dividirEmAtoEParcelado, redistribuir, reduzirComParcelaFinal, somarMeses,
  ultimoVencimento, vencimentoPadrao,
} from '../../lib/propostaFluxo';
import { SelectLista, useCliqueFora, usePosicao } from './CampoLista';
import { ValorInput, campoCls, mesCurto, moedaBr, percentualBr } from './PropostaCampos';
import SeletorData from './SeletorData';

// ── Modelo de linha ─────────────────────────────────────────────────────────

export interface LinhaFluxo {
  id: string;
  descricao: string;
  quantidade: number | null;
  valorUnitario: number | null;
  /** Meses entre parcelas; 0 = única. */
  periodicidade: number;
  primeiroVencimento: string;
  atualizacao: PropostaParcela['atualizacao'];
}

// Sempre com id novo, mesmo recebendo uma linha existente (duplicar).
export const novaLinha = (p: Partial<LinhaFluxo> = {}): LinhaFluxo => ({
  descricao: '',
  quantidade: 1,
  valorUnitario: null,
  periodicidade: 0,
  primeiroVencimento: '',
  atualizacao: 'INCC',
  ...p,
  id: crypto.randomUUID(),
});

/** Modelo para quando a unidade não tem fluxo configurado na Tabela de Vendas. */
export const linhasGenericas = (dataContrato: string) => [
  novaLinha({ descricao: 'Sinal', atualizacao: 'FIXA', primeiroVencimento: vencimentoPadrao(dataContrato, 0) }),
  novaLinha({ descricao: 'Mensais', quantidade: null, periodicidade: 1, primeiroVencimento: vencimentoPadrao(dataContrato, 1) }),
  novaLinha({ descricao: 'Semestrais', quantidade: null, periodicidade: 6, primeiroVencimento: vencimentoPadrao(dataContrato, 6) }),
  novaLinha({ descricao: 'Financiamento bancário' }),
];

// Linha sem valor é modelo não usado (nem toda proposta tem semestral) e fica de fora.
export const linhaUsada = (l: LinhaFluxo) => !!l.valorUnitario;

export const CORES_FLUXO = ['bg-blue-500', 'bg-violet-500', 'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-fuchsia-500', 'bg-lime-500'];

const totalLinha = (l: LinhaFluxo) => centavos((l.quantidade ?? 0) * (l.valorUnitario ?? 0));
const paraParcela = (l: LinhaFluxo): ParcelaFluxo => ({
  descricao: l.descricao,
  quantidade: l.quantidade ?? 0,
  valorUnitario: l.valorUnitario ?? 0,
  periodicidade: l.periodicidade,
  atualizacao: l.atualizacao,
  primeiroVencimento: l.primeiroVencimento,
});
const pluralPeriodo = (meses: number) => PERIODICIDADES.find(p => p.meses === meses)?.plural ?? `a cada ${meses} meses`;
const dataBr = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

// Descrição, Qtd., Parcela, %, Periodicidade, 1º venc., Total, ações.
const GRADE = 'grid grid-cols-[minmax(140px,1fr)_60px_116px_84px_52px_128px_112px_28px] gap-2 items-center';

// ── Menu de ações da linha ──────────────────────────────────────────────────

interface AcaoMenu { id: string; label: string; descricao?: string; icone: React.ReactNode; perigo?: boolean; desabilitada?: boolean }

function MenuLinha({ acoes, onEscolher }: { acoes: AcaoMenu[]; onEscolher: (id: string) => void }) {
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const estilo = usePosicao(botaoRef, aberto, 272, 240);
  const refs = useMemo(() => [botaoRef, menuRef] as React.RefObject<HTMLElement>[], []);
  useCliqueFora(refs, aberto, () => setAberto(false));

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        title="Remodelar parcela"
        onClick={() => setAberto(a => !a)}
        className={`w-7 h-7 grid place-items-center rounded-md transition-colors ${
          aberto ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'
        }`}
      >
        <MoreHorizontal size={15} />
      </button>
      {aberto && createPortal(
        <div
          ref={menuRef}
          // Alinhado pela direita do botão.
          style={{ ...estilo, left: undefined, right: Math.max(8, window.innerWidth - (botaoRef.current?.getBoundingClientRect().right ?? 0)) }}
          className="z-[60] rounded-xl border border-zinc-800 bg-[#141418] p-1 shadow-2xl shadow-black/60 ring-1 ring-black/40"
          onKeyDown={e => { if (e.key === 'Escape') setAberto(false); }}
        >
          {acoes.map(a => (
            <button
              key={a.id}
              type="button"
              disabled={a.desabilitada}
              onClick={() => { setAberto(false); onEscolher(a.id); }}
              className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                a.perigo ? 'text-rose-300 hover:bg-rose-500/10' : 'text-zinc-200 hover:bg-zinc-800/80'
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${a.perigo ? 'text-rose-400' : 'text-zinc-400'}`}>{a.icone}</span>
              <span className="min-w-0">
                <span className="block text-[13px]">{a.label}</span>
                {a.descricao && <span className="block text-[11px] text-zinc-500 leading-4">{a.descricao}</span>}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Assistentes de remodelagem ──────────────────────────────────────────────

type TipoAssistente = 'ato' | 'final' | 'quantidade';

function PainelAssistente({ titulo, children, previa, valido, onAplicar, onCancelar }: {
  titulo: string;
  children: React.ReactNode;
  previa: React.ReactNode;
  valido: boolean;
  onAplicar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div
      className="mx-3 mb-3 rounded-lg border border-blue-500/25 bg-blue-500/[0.04] p-3 space-y-3"
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); if (valido) onAplicar(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-semibold text-blue-200">
          <CornerDownRight size={13} /> {titulo}
        </span>
        <button type="button" onClick={onCancelar} title="Cancelar" className="w-6 h-6 grid place-items-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800">
          <X size={13} />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-[12px] text-zinc-400 min-w-0">{previa}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onCancelar} className="h-8 px-3 rounded-lg text-[12px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">Cancelar</button>
          <button
            type="button" onClick={onAplicar} disabled={!valido}
            className="h-8 px-3 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoMini({ label, children, largura = 'w-40' }: { label: string; children: React.ReactNode; largura?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${largura}`}>
      <span className="text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Chip({ children, onClick, ativo }: { children: React.ReactNode; onClick: () => void; ativo?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`h-7 px-2.5 rounded-md text-[11px] font-medium tabular-nums border transition-colors ${
        ativo ? 'border-blue-500/50 bg-blue-500/10 text-blue-200' : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}

// Na célula só a inicial (U, M, B, T, S, A); o nome inteiro fica na lista e no balão.
const OPCOES_PERIODICIDADE = PERIODICIDADES.map(p => ({ value: String(p.meses), label: p.label, curto: p.label[0] }));

const opcoesPeriodicidade = PERIODICIDADES.filter(p => p.meses > 0).map(p => ({ value: String(p.meses), label: p.label }));

function AssistenteAto({ linha, dataContrato, onAplicar, onCancelar }: {
  linha: LinhaFluxo; dataContrato: string; onAplicar: (ls: LinhaFluxo[]) => void; onCancelar: () => void;
}) {
  const total = totalLinha(linha);
  const [ato, setAto] = useState<number | null>(null);
  const [parcelas, setParcelas] = useState(6);
  const [periodo, setPeriodo] = useState(1);
  const valido = !!ato && ato > 0 && ato < total && parcelas >= 1;
  const [a, p] = valido ? dividirEmAtoEParcelado(paraParcela(linha), ato!, parcelas, periodo, dataContrato) : [null, null];

  return (
    <PainelAssistente
      titulo={`Ato fixo + restante parcelado · ${linha.descricao || 'parcela'} de ${moedaBr(total)}`}
      valido={valido}
      onCancelar={onCancelar}
      onAplicar={() => a && p && onAplicar([novaLinha(a), novaLinha(p)])}
      previa={a && p ? (
        <>Ato de <b className="text-zinc-100">{moedaBr(a.valorUnitario)}</b>{a.primeiroVencimento && ` em ${dataBr(a.primeiroVencimento)}`} + <b className="text-zinc-100">{p.quantidade}× {moedaBr(p.valorUnitario)}</b> {pluralPeriodo(p.periodicidade)}{p.primeiroVencimento && ` de ${mesCurto(p.primeiroVencimento)} a ${mesCurto(ultimoVencimento(p))}`}.</>
      ) : 'Informe um ato menor que o total da parcela.'}
    >
      <CampoMini label="Valor do ato">
        <ValorInput value={ato} onChange={setAto} prefixo="R$" autoFocus />
      </CampoMini>
      <div className="flex gap-1 pb-1">
        {[10, 20, 30, 50].map(pct => (
          <Chip key={pct} onClick={() => setAto(centavos(total * pct / 100))} ativo={ato === centavos(total * pct / 100)}>{pct}%</Chip>
        ))}
      </div>
      <CampoMini label="Restante em" largura="w-24">
        <input
          type="number" min={1} className={`${campoCls} text-right tabular-nums`} value={parcelas}
          onChange={e => setParcelas(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        />
      </CampoMini>
      <CampoMini label="Periodicidade" largura="w-36">
        <SelectLista value={String(periodo)} onChange={v => setPeriodo(Number(v))} opcoes={opcoesPeriodicidade} />
      </CampoMini>
    </PainelAssistente>
  );
}

function AssistenteFinal({ linha, onAplicar, onCancelar }: {
  linha: LinhaFluxo; onAplicar: (ls: LinhaFluxo[]) => void; onCancelar: () => void;
}) {
  const atual = linha.valorUnitario ?? 0;
  const q = linha.quantidade ?? 0;
  const [novo, setNovo] = useState<number | null>(null);
  const valido = !!novo && novo > 0 && novo < atual && q >= 1;
  const [r, f] = valido ? reduzirComParcelaFinal(paraParcela(linha), novo!) : [null, null];

  return (
    <PainelAssistente
      titulo={`Parcelas menores + parcela final · ${q}× ${moedaBr(atual)}`}
      valido={valido}
      onCancelar={onCancelar}
      onAplicar={() => r && f && onAplicar([{ ...linha, valorUnitario: r.valorUnitario }, novaLinha(f)])}
      previa={r && f ? (
        <><b className="text-zinc-100">{q}× {moedaBr(r.valorUnitario)}</b> + parcela final de <b className="text-zinc-100">{moedaBr(f.valorUnitario)}</b>{f.primeiroVencimento && ` em ${mesCurto(f.primeiroVencimento)}`}. O total continua {moedaBr(totalLinha(linha))}.</>
      ) : 'Informe um valor de parcela menor que o atual.'}
    >
      <CampoMini label="Novo valor da parcela">
        <ValorInput value={novo} onChange={setNovo} prefixo="R$" autoFocus />
      </CampoMini>
      <div className="flex gap-1 pb-1">
        {[10, 20, 30, 50].map(pct => {
          const v = centavos(atual * (1 - pct / 100));
          return <Chip key={pct} onClick={() => setNovo(v)} ativo={novo === v}>−{pct}%</Chip>;
        })}
      </div>
    </PainelAssistente>
  );
}

function AssistenteQuantidade({ linha, onAplicar, onCancelar }: {
  linha: LinhaFluxo; onAplicar: (ls: LinhaFluxo[]) => void; onCancelar: () => void;
}) {
  const atualQ = linha.quantidade ?? 1;
  const total = totalLinha(linha);
  const [q, setQ] = useState(atualQ);
  const [manter, setManter] = useState<'total' | 'parcela'>('total');
  const unit = manter === 'total' ? redistribuir(total, q) : (linha.valorUnitario ?? 0);
  const novoTotal = centavos(unit * q);
  const valido = q >= 1 && q !== atualQ;
  const fim = ultimoVencimento({ primeiroVencimento: linha.primeiroVencimento, quantidade: q, periodicidade: linha.periodicidade });

  return (
    <PainelAssistente
      titulo={`Alterar nº de parcelas · hoje ${atualQ}× ${moedaBr(linha.valorUnitario ?? 0)}`}
      valido={valido}
      onCancelar={onCancelar}
      onAplicar={() => onAplicar([{ ...linha, quantidade: q, valorUnitario: unit }])}
      previa={valido ? (
        <><b className="text-zinc-100">{q}× {moedaBr(unit)}</b>{fim && ` até ${mesCurto(fim)}`} · total {moedaBr(novoTotal)}
          {Math.abs(novoTotal - total) >= 0.01 && <span className={novoTotal > total ? ' text-emerald-300' : ' text-rose-300'}> ({novoTotal > total ? '+' : '−'}{moedaBr(Math.abs(novoTotal - total))} no saldo)</span>}
        </>
      ) : 'Escolha a nova quantidade.'}
    >
      <CampoMini label="Nova quantidade" largura="w-28">
        <input
          type="number" min={1} autoFocus className={`${campoCls} text-right tabular-nums`} value={q}
          onChange={e => setQ(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        />
      </CampoMini>
      <div className="flex gap-1 pb-1">
        {[6, 12, 24].map(n => <Chip key={n} onClick={() => setQ(atualQ + n)} ativo={q === atualQ + n}>+{n}</Chip>)}
      </div>
      <div role="radiogroup" className="flex p-0.5 h-9 rounded-lg border border-zinc-800 bg-zinc-950/70 mb-0">
        {([['total', 'Manter total'], ['parcela', 'Manter parcela']] as const).map(([v, l]) => (
          <button
            key={v} type="button" role="radio" aria-checked={manter === v} onClick={() => setManter(v)}
            className={`px-3 rounded-md text-[12px] transition-colors ${manter === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </PainelAssistente>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

interface Props {
  linhas: LinhaFluxo[];
  onChange: (ls: LinhaFluxo[]) => void;
  contratado: number;
  /** Valor que o fluxo deve somar. */
  alvo: number;
  alvoManual: boolean;
  /** null volta a seguir o valor de tabela. */
  onAlvo: (v: number | null) => void;
  valorTabela: number | null;
  dataContrato: string;
  /** Ex.: "Rivage · unidade 1203". Null quando não há modelo da tabela. */
  origem: string | null;
  modificado: boolean;
  onRestaurar: () => void;
}

export default function FluxoPagamentoEditor({
  linhas, onChange, contratado, alvo, alvoManual, onAlvo, valorTabela, dataContrato, origem, modificado, onRestaurar,
}: Props) {
  const [assistente, setAssistente] = useState<{ id: string; tipo: TipoAssistente } | null>(null);
  // Total da linha no momento em que a quantidade começou a ser digitada: assim
  // "6" → "60" redistribui sempre o mesmo total, sem acumular arredondamento.
  const totalNoFoco = useRef<Record<string, number>>({});

  // Layout pela largura real do editor (não da janela): o resumo lateral e o
  // tamanho do modal mudam o espaço disponível.
  const caixaRef = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<'largo' | 'medio' | 'estreito'>('largo');
  useLayoutEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      setModo(w >= 800 ? 'largo' : w >= 500 ? 'medio' : 'estreito');
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Série que absorve as diferenças: mexer em qualquer outra mantém o total
  // fechado no valor da unidade. null = ajuste manual pelo saldo.
  const [compensarId, setCompensarId] = useState<string | null>(null);
  const compensacao = linhas.find(l => l.id === compensarId) ?? null;

  const compensar = (ls: LinhaFluxo[], id: string | null, origem?: string): LinhaFluxo[] => {
    const alvoL = id ? ls.find(l => l.id === id) : null;
    if (!alvoL || alvo <= 0) return ls;
    const outras = ls.filter(l => l.id !== id);
    const restante = centavos(alvo - outras.reduce((t, l) => t + totalLinha(l), 0));
    const q = alvoL.quantidade || 1;
    // Parcela para baixo; os centavos que não dividem vão para um pagamento único.
    const unit = Math.max(0, Math.floor((restante / q) * 100 + 1e-6) / 100);
    const sobra = centavos(restante - unit * q);
    const unica = sobra >= 0.01 && unit > 0 ? outras.find(l => linhaUsada(l) && l.quantidade === 1 && l.id !== origem) : undefined;
    return ls.map(l => {
      if (l.id === id) return { ...l, quantidade: q, valorUnitario: unit || null };
      if (unica && l.id === unica.id) return { ...l, valorUnitario: centavos((l.valorUnitario ?? 0) + sobra) };
      return l;
    });
  };

  // origem: linha editada diretamente. Editar a própria série de compensação não a recalcula.
  const emitir = (ls: LinhaFluxo[], origem?: string) => {
    const id = compensarId && ls.some(l => l.id === compensarId) ? compensarId : null;
    if (compensarId && !id) setCompensarId(null);
    onChange(id && origem !== id ? compensar(ls, id, origem) : ls);
  };

  // Valor da unidade mudou: a compensação reequilibra sozinha.
  useEffect(() => {
    if (!compensacao) return;
    const novas = compensar(linhas, compensacao.id);
    if (novas.some((l, i) => l.valorUnitario !== linhas[i].valorUnitario)) onChange(novas);
  }, [alvo]); // eslint-disable-line react-hooks/exhaustive-deps

  const alterar = (id: string, campos: Partial<LinhaFluxo>) => emitir(linhas.map(l => (l.id === id ? { ...l, ...campos } : l)), id);
  const substituir = (id: string, novas: LinhaFluxo[]) => {
    const i = linhas.findIndex(l => l.id === id);
    emitir([...linhas.slice(0, i), ...novas, ...linhas.slice(i + 1)]);
    setAssistente(null);
  };

  const saldo = centavos(alvo - contratado);
  const temSaldo = Math.abs(saldo) >= 0.01;
  const usadas = linhas.filter(linhaUsada);
  const unica = usadas.find(l => l.quantidade === 1 && l.periodicidade === 0);
  const periodica = [...usadas].filter(l => (l.quantidade ?? 0) > 1).sort((a, b) => (b.quantidade ?? 0) - (a.quantidade ?? 0))[0];
  const ultimoDoFluxo = usadas.map(l => ultimoVencimento(paraParcela(l))).filter(Boolean).sort().pop() ?? '';
  const difTabela = valorTabela ? (alvo / valorTabela - 1) * 100 : null;

  // ── Ações sobre o saldo ──
  const ajustarNaUnica = () => unica && alterar(unica.id, { valorUnitario: centavos((unica.valorUnitario ?? 0) + saldo) });
  const diluir = () => {
    if (!periodica) return;
    const q = periodica.quantidade ?? 1;
    const porParcela = Math.trunc((saldo / q) * 100) / 100;
    const sobra = centavos(saldo - porParcela * q);
    emitir(linhas.map(l => {
      if (l.id === periodica.id) return { ...l, valorUnitario: centavos((l.valorUnitario ?? 0) + porParcela) };
      // Os centavos que não dividem por igual vão para o pagamento único.
      if (unica && l.id === unica.id && Math.abs(sobra) >= 0.01) return { ...l, valorUnitario: centavos((l.valorUnitario ?? 0) + sobra) };
      return l;
    }));
  };
  const parcelaFinalDoSaldo = () => emitir([...linhas, novaLinha({
    descricao: 'Parcela final',
    valorUnitario: saldo,
    primeiroVencimento: ultimoDoFluxo ? somarMeses(ultimoDoFluxo, 1) : '',
  })]);

  const acoesDaLinha = (l: LinhaFluxo): AcaoMenu[] => {
    const q = l.quantidade ?? 0;
    const temValor = totalLinha(l) > 0;
    return [
      { id: 'quantidade', label: 'Alterar nº de parcelas', descricao: 'Mais ou menos parcelas, mantendo o total ou o valor da parcela.', icone: <SlidersHorizontal size={14} />, desabilitada: !temValor },
      { id: 'ato', label: 'Ato fixo + restante parcelado', descricao: 'Separa um valor à vista e parcela o resto.', icone: <Scissors size={14} />, desabilitada: !temValor },
      { id: 'final', label: 'Parcelas menores + parcela final', descricao: 'Reduz a parcela e joga a diferença numa parcela final.', icone: <ArrowDownToLine size={14} />, desabilitada: !temValor || q < 1 },
      { id: 'duplicar', label: 'Duplicar linha', icone: <Copy size={14} /> },
      { id: 'remover', label: 'Remover linha', icone: <Trash2 size={14} />, perigo: true },
    ];
  };

  const executar = (l: LinhaFluxo, acao: string) => {
    if (acao === 'duplicar') {
      const i = linhas.findIndex(x => x.id === l.id);
      emitir([...linhas.slice(0, i + 1), novaLinha({ ...l }), ...linhas.slice(i + 1)]);
    } else if (acao === 'remover') {
      emitir(linhas.filter(x => x.id !== l.id));
      if (assistente?.id === l.id) setAssistente(null);
    } else {
      setAssistente({ id: l.id, tipo: acao as TipoAssistente });
    }
  };

  return (
    <div className="space-y-3">
      {/* Valor da proposta × distribuído */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="flex flex-col gap-1 w-48">
            <span className="text-[11px] text-zinc-500">Valor da unidade</span>
            <ValorInput value={alvo || null} onChange={v => onAlvo(v ?? 0)} prefixo="R$" />
          </label>
          <div className="pb-2 text-[12px] text-zinc-500">
            {difTabela === null ? 'Sem valor de tabela'
              : Math.abs(difTabela) < 0.005 ? 'Igual ao valor de tabela'
              : <span className={difTabela < 0 ? 'text-rose-300' : 'text-emerald-300'}>{difTabela > 0 ? '+' : ''}{percentualBr(difTabela)} sobre a tabela</span>}
            {alvoManual && valorTabela ? (
              <button type="button" onClick={() => onAlvo(null)} className="ml-2 text-blue-400 hover:text-blue-300">usar valor de tabela</button>
            ) : null}
          </div>
          <label className="flex flex-col gap-1 w-56">
            <span className="text-[11px] text-zinc-500">Compensar diferenças em</span>
            <SelectLista
              value={compensarId ?? ''}
              onChange={v => {
                const id = v || null;
                setCompensarId(id);
                if (id) onChange(compensar(linhas, id));
              }}
              opcoes={[
                { value: '', label: 'Ajuste manual' },
                ...usadas.map(l => ({ value: l.id, label: l.descricao || 'Sem descrição', detalhe: `${l.quantidade}×` })),
              ]}
            />
          </label>
          <div className="ml-auto flex items-end gap-6 pb-1.5">
            <div className="text-right">
              <p className="text-[11px] text-zinc-500">Distribuído no fluxo</p>
              <p className="text-[13px] font-medium tabular-nums text-zinc-200">{moedaBr(contratado)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-zinc-500">Saldo</p>
              <p className={`text-[13px] font-semibold tabular-nums ${!temSaldo ? 'text-emerald-300' : saldo > 0 ? 'text-amber-300' : 'text-rose-300'}`}>
                {temSaldo ? `${saldo > 0 ? '' : '−'}${moedaBr(Math.abs(saldo))}` : 'Fechado ✓'}
              </p>
            </div>
          </div>
        </div>

        {temSaldo && (
          <div className="mt-3 pt-3 border-t border-zinc-800/70 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-zinc-400 mr-1">
              {saldo > 0 ? `Faltam ${moedaBr(saldo)} para fechar 100%.` : `O fluxo passou ${moedaBr(-saldo)} do valor da unidade.`}
            </span>
            {saldo > 0 && (
              <AcaoSaldo onClick={parcelaFinalDoSaldo}>Criar parcela final{ultimoDoFluxo && ` (${mesCurto(somarMeses(ultimoDoFluxo, 1))})`}</AcaoSaldo>
            )}
            {periodica && (
              <AcaoSaldo onClick={diluir}>Diluir nas {periodica.quantidade}× {periodica.descricao || 'parcelas'}</AcaoSaldo>
            )}
            {unica && (unica.valorUnitario ?? 0) + saldo > 0 && (
              <AcaoSaldo onClick={ajustarNaUnica}>{saldo > 0 ? 'Somar' : 'Descontar'} em {unica.descricao || 'pagamento único'}</AcaoSaldo>
            )}
            {contratado > 0 && (
              <AcaoSaldo onClick={() => onAlvo(contratado)} discreta>Usar {moedaBr(contratado)} como valor da unidade</AcaoSaldo>
            )}
          </div>
        )}
      </div>

      {/* Barra de origem */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="text-zinc-500">
          {origem
            ? <>Fluxo padrão da tabela · <span className="text-zinc-300">{origem}</span>{modificado && <span className="ml-1.5 rounded-md bg-amber-500/10 text-amber-300 px-1.5 py-0.5 text-[10px] font-medium">personalizado</span>}</>
            : 'Escolha a unidade para carregar o fluxo da Tabela de Vendas.'}
        </span>
        <div className="flex items-center gap-1">
          {origem && modificado && (
            <button type="button" onClick={onRestaurar} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
              <RotateCcw size={12} /> Restaurar fluxo da tabela
            </button>
          )}
          <button
            type="button"
            onClick={() => emitir([...linhas, novaLinha({ periodicidade: 1, quantidade: null, primeiroVencimento: vencimentoPadrao(dataContrato, 1) })])}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-zinc-300 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
          >
            <Plus size={12} /> Adicionar parcela
          </button>
        </div>
      </div>

      {/* Parcelas: o layout segue a largura disponível, nunca rola na horizontal. */}
      <div ref={caixaRef} className="rounded-xl border border-zinc-800/80 overflow-hidden">
        {modo === 'largo' && (
          <div className={`${GRADE} px-3 h-9 bg-zinc-900/50 border-b border-zinc-800/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500`}>
            <span className="pl-3">Descrição</span>
            <span className="text-right">Qtd.</span>
            <span className="text-right">Parcela</span>
            <span className="text-right">% unidade</span>
            <span title="Periodicidade: Única, Mensal, Bimestral, Trimestral, Semestral, Anual">Per.</span>
            <span>1º vencimento</span>
            <span className="text-right">Total</span>
            <span />
          </div>
        )}

        <div className="divide-y divide-zinc-800/50">
          {linhas.map((l, i) => {
            const usada = linhaUsada(l);
            const q = l.quantidade ?? 0;
            const fim = q > 1 ? ultimoVencimento(paraParcela(l)) : '';
            const ativo = assistente?.id === l.id;
            const resumo = [fim && `${q}× ${pluralPeriodo(l.periodicidade)} · até ${mesCurto(fim)}`].filter(Boolean).join(' · ');

            const barra = <span className={`w-1 self-stretch min-h-[24px] shrink-0 rounded-full ${usada ? CORES_FLUXO[i % CORES_FLUXO.length] : 'bg-zinc-800'}`} />;
            const descricao = <input className={campoCls} value={l.descricao} onChange={e => alterar(l.id, { descricao: e.target.value })} placeholder="Descrição" />;
            const quantidade = (
              <input
                type="number" min={1} step={1} className={`${campoCls} text-right tabular-nums px-2`} value={l.quantidade ?? ''} placeholder="—"
                title="Alterar a quantidade mantém o total da linha"
                onFocus={() => { totalNoFoco.current[l.id] = totalLinha(l); }}
                onChange={e => {
                  const nq = e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : null;
                  const base = totalNoFoco.current[l.id] ?? totalLinha(l);
                  alterar(l.id, {
                    quantidade: nq,
                    // Mesma soma em outra quantidade de parcelas.
                    ...(nq && base > 0 ? { valorUnitario: redistribuir(base, nq) } : {}),
                    ...(nq && nq > 1 && l.periodicidade === 0 ? { periodicidade: 1 } : {}),
                  });
                }}
              />
            );
            const parcela = <ValorInput compacto value={l.valorUnitario} onChange={v => alterar(l.id, { valorUnitario: v })} />;
            const percentual = (
              <PercentualInput
                value={usada && alvo > 0 ? (totalLinha(l) / alvo) * 100 : null}
                desabilitado={alvo <= 0}
                onChange={pct => alterar(l.id, {
                  // % da unidade → total da série → parcela, mantendo a quantidade.
                  valorUnitario: pct ? redistribuir(centavos((alvo * pct) / 100), l.quantidade || 1) : null,
                  quantidade: l.quantidade || 1,
                })}
              />
            );
            const ehCompensacao = l.id === compensarId;
            const periodo = (
              <SelectLista
                compacto
                semSeta
                value={String(l.periodicidade)}
                onChange={v => alterar(l.id, { periodicidade: Number(v) })}
                opcoes={OPCOES_PERIODICIDADE}
              />
            );
            const vencimento = <SeletorData compacto value={l.primeiroVencimento} onChange={v => alterar(l.id, { primeiroVencimento: v })} />;
            const total = (
              <span className={`text-[13px] tabular-nums ${usada ? 'text-zinc-100 font-semibold' : 'text-zinc-600'}`}>
                {usada ? moedaBr(totalLinha(l)) : '—'}
              </span>
            );
            const menu = <MenuLinha acoes={acoesDaLinha(l)} onEscolher={a => executar(l, a)} />;
            const apagada = usada || ativo ? '' : 'opacity-60 focus-within:opacity-100 hover:opacity-100';
            const selo = ehCompensacao && <span className="ml-1 rounded bg-blue-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-blue-300">compensa</span>;

            return (
              <div key={l.id} className={ativo ? 'bg-blue-500/[0.03]' : ''}>
                {modo === 'largo' ? (
                  <div className={`${GRADE} px-3 py-2 transition-opacity ${apagada}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {barra}
                      <div className="min-w-0 flex-1">
                        {descricao}
                        {(resumo || selo) && <p className="mt-1 text-[10px] text-zinc-500 truncate">{resumo}{selo}</p>}
                      </div>
                    </div>
                    {quantidade}{parcela}{percentual}{periodo}{vencimento}
                    <div className="text-right">{total}</div>
                    {menu}
                  </div>
                ) : (
                  <div className={`px-3 py-3 space-y-2.5 transition-opacity ${apagada}`}>
                    <div className="flex items-center gap-2">
                      {barra}
                      <div className="min-w-0 flex-1">{descricao}</div>
                      <div className="shrink-0 text-right leading-tight pl-1">
                        {total}
                        {(resumo || selo) && <p className="text-[10px] text-zinc-500">{resumo}{selo}</p>}
                      </div>
                      {menu}
                    </div>
                    <div className={`grid gap-2 pl-3 ${modo === 'medio' ? 'grid-cols-[64px_minmax(0,1fr)_88px_52px_minmax(0,1fr)]' : 'grid-cols-2'}`}>
                      <Rotulo texto="Qtd.">{quantidade}</Rotulo>
                      <Rotulo texto="Parcela">{parcela}</Rotulo>
                      <Rotulo texto="% unidade">{percentual}</Rotulo>
                      <Rotulo texto="Per.">{periodo}</Rotulo>
                      <Rotulo texto="1º vencimento">{vencimento}</Rotulo>
                    </div>
                  </div>
                )}

                {ativo && assistente.tipo === 'ato' && (
                  <AssistenteAto linha={l} dataContrato={dataContrato} onAplicar={ls => substituir(l.id, ls)} onCancelar={() => setAssistente(null)} />
                )}
                {ativo && assistente.tipo === 'final' && (
                  <AssistenteFinal linha={l} onAplicar={ls => substituir(l.id, ls)} onCancelar={() => setAssistente(null)} />
                )}
                {ativo && assistente.tipo === 'quantidade' && (
                  <AssistenteQuantidade linha={l} onAplicar={ls => substituir(l.id, ls)} onCancelar={() => setAssistente(null)} />
                )}
              </div>
            );
          })}
          {linhas.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-zinc-500">Nenhuma parcela. Use “Adicionar parcela”.</p>
          )}
        </div>

        <Provas
          somaSeries={contratado}
          alvo={alvo}
          completas={usadas.length > 0 && usadas.every(l => l.descricao.trim() && l.quantidade && l.primeiroVencimento)}
          semNegativas={linhas.every(l => (l.valorUnitario ?? 0) >= 0)}
          series={usadas.length}
          ultimo={ultimoDoFluxo}
        />
      </div>
    </div>
  );
}

// % com duas casas, digitado como os valores (da direita para a esquerda). Enquanto
// o campo tem foco vale o que foi digitado; fora dele, o % real que a parcela
// arredondada produz — assim o número nunca "pula" no meio da digitação.
function PercentualInput({ value, onChange, desabilitado }: {
  value: number | null;
  onChange: (pct: number | null) => void;
  desabilitado?: boolean;
}) {
  const [rascunho, setRascunho] = useState<number | null | undefined>(undefined);
  const mostrado = rascunho !== undefined ? rascunho : value === null ? null : Math.round(value * 100) / 100;
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        disabled={desabilitado}
        title={desabilitado ? 'Informe o valor da unidade' : 'Fatia do valor da unidade'}
        className={`${campoCls} text-right tabular-nums pl-2 pr-6`}
        placeholder="0,00"
        value={mostrado === null ? '' : mostrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        onBlur={() => setRascunho(undefined)}
        onChange={e => {
          const digitos = e.target.value.replace(/\D/g, '');
          const pct = digitos ? Math.min(100, Number(digitos) / 100) : null;
          setRascunho(pct);
          onChange(pct);
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-500">%</span>
    </div>
  );
}

// Provas do fluxo: o que precisa ser verdade para a proposta poder ser salva.
function Provas({ somaSeries, alvo, completas, semNegativas, series, ultimo }: {
  somaSeries: number;
  alvo: number;
  completas: boolean;
  semNegativas: boolean;
  series: number;
  ultimo: string;
}) {
  const somaPct = alvo > 0 ? (somaSeries / alvo) * 100 : 0;
  const fechaValor = alvo > 0 && Math.abs(centavos(alvo - somaSeries)) < 0.01;
  const provas: { ok: boolean; rotulo: string; detalhe: string }[] = [
    { ok: fechaValor, rotulo: 'Soma das séries = valor da unidade', detalhe: `${moedaBr(somaSeries)} de ${moedaBr(alvo)}` },
    { ok: fechaValor, rotulo: 'Soma dos % = 100%', detalhe: percentualBr(somaPct) },
    { ok: completas, rotulo: 'Séries com quantidade, valor e 1º vencimento', detalhe: `${series} ${series === 1 ? 'série' : 'séries'}${ultimo ? ` · até ${mesCurto(ultimo)}` : ''}` },
    { ok: semNegativas, rotulo: 'Nenhuma série negativa', detalhe: semNegativas ? 'ok' : 'revise' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 px-3 py-3 bg-zinc-900/40 border-t border-zinc-800/80">
      {provas.map(p => (
        <div key={p.rotulo} className="flex items-center gap-2 min-w-0 text-[12px]">
          <span className={`w-4 h-4 shrink-0 rounded-full grid place-items-center ${p.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
            {p.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
          </span>
          <span className={`truncate ${p.ok ? 'text-zinc-400' : 'text-zinc-200'}`}>{p.rotulo}</span>
          <span className={`ml-auto shrink-0 tabular-nums ${p.ok ? 'text-zinc-500' : 'text-rose-300 font-medium'}`}>{p.detalhe}</span>
        </div>
      ))}
    </div>
  );
}

function Rotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{texto}</span>
      {children}
    </div>
  );
}

function AcaoSaldo({ children, onClick, discreta }: { children: React.ReactNode; onClick: () => void; discreta?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`h-7 px-2.5 rounded-md text-[12px] transition-colors ${
        discreta ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800' : 'border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600'
      }`}
    >
      {children}
    </button>
  );
}

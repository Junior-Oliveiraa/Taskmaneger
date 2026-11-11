import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine, Copy, CornerDownRight, MoreHorizontal, Plus, RotateCcw, Scissors, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import type { PropostaParcela } from '../../lib/comercialApi';
import {
  ParcelaFluxo, PERIODICIDADES, centavos, dividirEmAtoEParcelado, redistribuir, reduzirComParcelaFinal, somarMeses,
  ultimoVencimento, vencimentoPadrao,
} from '../../lib/propostaFluxo';
import { SelectLista, useCliqueFora, usePosicao } from './CampoLista';
import { AtualizacaoToggle, ValorInput, campoCls, mesCurto, moedaBr, numeroBr, percentualBr } from './PropostaCampos';
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

// Descrição, Qtd., Periodicidade, Parcela, Total, 1º venc., Atualização, %, ações.
const GRADE = 'grid grid-cols-[minmax(130px,1fr)_56px_112px_116px_116px_128px_84px_48px_28px] gap-2 items-center';

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
  /** % e % acumulado de cada linha, na mesma ordem (de calcularAutorizacao). */
  percentuais: { percentual: number; acumulado: number }[];
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
  linhas, onChange, percentuais, contratado, alvo, alvoManual, onAlvo, valorTabela, dataContrato, origem, modificado, onRestaurar,
}: Props) {
  const [assistente, setAssistente] = useState<{ id: string; tipo: TipoAssistente } | null>(null);
  // Total da linha no momento em que a quantidade começou a ser digitada: assim
  // "6" → "60" redistribui sempre o mesmo total, sem acumular arredondamento.
  const totalNoFoco = useRef<Record<string, number>>({});

  const alterar = (id: string, campos: Partial<LinhaFluxo>) => onChange(linhas.map(l => (l.id === id ? { ...l, ...campos } : l)));
  const substituir = (id: string, novas: LinhaFluxo[]) => {
    const i = linhas.findIndex(l => l.id === id);
    onChange([...linhas.slice(0, i), ...novas, ...linhas.slice(i + 1)]);
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
    onChange(linhas.map(l => {
      if (l.id === periodica.id) return { ...l, valorUnitario: centavos((l.valorUnitario ?? 0) + porParcela) };
      // Os centavos que não dividem por igual vão para o pagamento único.
      if (unica && l.id === unica.id && Math.abs(sobra) >= 0.01) return { ...l, valorUnitario: centavos((l.valorUnitario ?? 0) + sobra) };
      return l;
    }));
  };
  const parcelaFinalDoSaldo = () => onChange([...linhas, novaLinha({
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
      onChange([...linhas.slice(0, i + 1), novaLinha({ ...l }), ...linhas.slice(i + 1)]);
    } else if (acao === 'remover') {
      onChange(linhas.filter(x => x.id !== l.id));
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
            <span className="text-[11px] text-zinc-500">Valor da proposta</span>
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
              {saldo > 0 ? `Faltam ${moedaBr(saldo)} para fechar a proposta.` : `O fluxo passou ${moedaBr(-saldo)} do valor da proposta.`}
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
              <AcaoSaldo onClick={() => onAlvo(contratado)} discreta>Aceitar {moedaBr(contratado)} como valor da proposta</AcaoSaldo>
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
            onClick={() => onChange([...linhas, novaLinha({ periodicidade: 1, quantidade: null, primeiroVencimento: vencimentoPadrao(dataContrato, 1) })])}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-zinc-300 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
          >
            <Plus size={12} /> Adicionar parcela
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto scrollbar-minimal -mx-1 px-1">
        <div className="min-w-[880px] rounded-xl border border-zinc-800/80 overflow-hidden">
          <div className={`${GRADE} px-3 h-9 bg-zinc-900/50 border-b border-zinc-800/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500`}>
            <span>Descrição</span>
            <span className="text-right">Qtd.</span>
            <span>Periodicidade</span>
            <span className="text-right">Parcela</span>
            <span className="text-right">Total</span>
            <span>1º vencimento</span>
            <span>Correção</span>
            <span className="text-right">%</span>
            <span />
          </div>

          <div className="divide-y divide-zinc-800/50">
            {linhas.map((l, i) => {
              const usada = linhaUsada(l);
              const q = l.quantidade ?? 0;
              const fim = q > 1 ? ultimoVencimento(paraParcela(l)) : '';
              const ativo = assistente?.id === l.id;
              return (
                <div key={l.id} className={ativo ? 'bg-blue-500/[0.03]' : ''}>
                  <div className={`${GRADE} px-3 py-2 transition-opacity ${usada || ativo ? '' : 'opacity-60 focus-within:opacity-100 hover:opacity-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1 self-stretch min-h-[24px] shrink-0 rounded-full ${usada ? CORES_FLUXO[i % CORES_FLUXO.length] : 'bg-zinc-800'}`} />
                      <div className="min-w-0 flex-1">
                        <input className={campoCls} value={l.descricao} onChange={e => alterar(l.id, { descricao: e.target.value })} placeholder="Descrição" />
                        {fim && (
                          <p className="mt-1 text-[10px] text-zinc-500 truncate">
                            {q}× {pluralPeriodo(l.periodicidade)} · até {mesCurto(fim)}
                          </p>
                        )}
                      </div>
                    </div>
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
                    <SelectLista
                      value={String(l.periodicidade)}
                      onChange={v => alterar(l.id, { periodicidade: Number(v) })}
                      opcoes={PERIODICIDADES.map(p => ({ value: String(p.meses), label: p.label }))}
                    />
                    <ValorInput compacto value={l.valorUnitario} onChange={v => alterar(l.id, { valorUnitario: v })} />
                    <ValorInput
                      compacto
                      value={usada ? totalLinha(l) : null}
                      onChange={v => alterar(l.id, { valorUnitario: v ? redistribuir(v, l.quantidade || 1) : null, quantidade: l.quantidade || 1 })}
                    />
                    <SeletorData compacto value={l.primeiroVencimento} onChange={v => alterar(l.id, { primeiroVencimento: v })} />
                    <AtualizacaoToggle value={l.atualizacao} onChange={v => alterar(l.id, { atualizacao: v })} />
                    <div className="text-right tabular-nums leading-tight" title={`Acumulado: ${percentualBr(percentuais[i]?.acumulado ?? 0)}`}>
                      <div className={`text-[12px] ${usada ? 'text-zinc-300' : 'text-zinc-600'}`}>{numeroBr(percentuais[i]?.percentual ?? 0)}</div>
                      <div className="text-[10px] text-zinc-600">Σ {numeroBr(percentuais[i]?.acumulado ?? 0)}</div>
                    </div>
                    <MenuLinha acoes={acoesDaLinha(l)} onEscolher={a => executar(l, a)} />
                  </div>

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

          <div className={`${GRADE} px-3 h-11 bg-zinc-900/40 border-t border-zinc-800/80`}>
            <span className="text-[12px] font-semibold text-zinc-300">
              Total
              <span className="ml-2 font-normal text-zinc-500">
                {usadas.length} {usadas.length === 1 ? 'linha' : 'linhas'}
                {ultimoDoFluxo && ` · último vencimento ${mesCurto(ultimoDoFluxo)}`}
              </span>
            </span>
            <span /><span /><span />
            <span className="text-right text-[13px] font-semibold tabular-nums text-amber-200">{numeroBr(contratado)}</span>
            <span /><span />
            <span className="text-right text-[12px] tabular-nums text-zinc-400">{contratado > 0 ? '100,00' : '—'}</span>
            <span />
          </div>
        </div>
      </div>
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

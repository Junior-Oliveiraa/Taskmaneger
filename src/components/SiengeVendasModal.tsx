import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Table2, Building2, ChevronDown, ChevronUp, TrendingUp, TrendingDown, History, Minus, Plus, X, Check, Search, Calculator, Columns3, Upload, Download, Trash2, ShieldCheck, AlertTriangle, ReceiptText, Equal, ListChecks, Settings, Smartphone, Undo2, Tags, Lock, LockOpen, Snowflake, Star, Link2, Unlink2, Layers } from 'lucide-react';
import { Project, SiengeTabelaVendaVersao, SiengeTabelaVendaConfig, SiengeTabelaVendaUnidade, SiengeTabelaVendaRevisao, SiengeVendaSituacao, SiengeTabelaVendaColuna, SiengeCalculoRegra, SiengeCalculoOperacao, SiengeColunaTipo, SiengeVenda, SiengeValidacao, SiengeValidacaoTermo } from '../types';

import SiengeVendasTable from './SiengeVendasTable';
import LpCorretorConfigPanel from './LpCorretorConfigPanel';
import { usePermissoes } from '../lib/permissoes';
import { ColunaOuRegra, calcValidacaoParcelas, calcValidacaoValorUnidade, colunaBaseLabel, baseReajustavel, exportSiengeVendasCsv, formatCurrencyInput, getColunaBaseValue, getMargem, isDiferencaOk, MARGEM_VALOR_TABELA_KEY, margemEfetiva, mergeColunasRegras, parseCurrencyInput, parseSiengeVendasCsv, parseSiengeVendasXlsx, REGRA_KEY_PREFIX, REGRA_VINCULO_PREFIX, unidadeValidacaoPendente } from '../lib/siengeVendasTabela';

const SITUACAO_FILTER_LABELS: Record<SiengeVendaSituacao, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendida: 'Vendida',
  permuta: 'Permuta',
  bloqueada: 'Bloqueada',
};

// Venda e permuta congelam o valor no orçamento real, então exigem comprador.
const SITUACOES_COM_COMPRADOR: SiengeVendaSituacao[] = ['vendida', 'permuta'];

// Pílula da situação escolhida em "Alterar Situação": assume a cor da própria
// situação, a mesma que tinge a linha na tabela. Assim a escolha já mostra o
// resultado antes de confirmar, em vez de um azul genérico de "selecionado".
const SITUACAO_PILL: Record<SiengeVendaSituacao, string> = {
  disponivel: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  reservado: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  vendida: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  permuta: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  bloqueada: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

const SITUACAO_DOT: Record<SiengeVendaSituacao, string> = {
  disponivel: 'bg-blue-400',
  reservado: 'bg-amber-400',
  vendida: 'bg-emerald-400',
  permuta: 'bg-violet-400',
  bloqueada: 'bg-zinc-500',
};

// Painéis expansíveis da tela — no máximo um aberto por vez.
type PainelId = 'colunas' | 'calculo' | 'reajuste' | 'margem' | 'validarConfig' | 'historico' | 'historicoVendas' | 'situacao' | 'lpCorretor' | null;

// ── Vocabulário visual da barra de ferramentas ──────────────────────────────
// Altura única para todo controle da faixa de contexto (dropdown, busca,
// segmentado, ações): sem isso cada um herdava a altura do próprio conteúdo e
// a linha ficava com as bases desalinhadas.
const CTL_H = 'h-9';

// Todo controle clicável responde ao clique com um recuo mínimo — é o retorno
// que confirma que o toque foi registrado, antes mesmo de a tela reagir.
const PRESS = 'transition-all duration-150 active:scale-[0.97]';

// Segmentado do filtro de situação — pílulas dentro de um trilho só.
// border-transparent no estado inativo para a pílula ativa (que tem borda
// colorida) não empurrar as vizinhas ao ser selecionada.
const SEG_BTN = `px-2.5 py-1 text-[11px] font-semibold rounded-md border border-transparent ${PRESS}`;
const SEG_ON = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
const SEG_OFF = 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60';
// Contador dentro da pílula: herda a cor do estado, então não precisa de
// variante própria por situação.
const SEG_COUNT = 'text-[10px] font-bold tabular-nums opacity-60';

// Faixa de ferramentas — botões fantasma dentro de um contêiner compartilhado.
const TOOL_BTN = `flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md whitespace-nowrap ${PRESS}`;
const TOOL_ON = 'bg-blue-500/15 text-blue-400';
const TOOL_OFF = 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70';
const TOOL_SEP = 'w-px h-5 bg-zinc-800 mx-1 shrink-0';
const TOOL_BADGE = 'bg-zinc-800 text-zinc-400 text-[10px] leading-none px-1.5 py-0.5 rounded-full font-bold tabular-nums';

const TIPO_LABELS: Record<SiengeColunaTipo, string> = {
  numero: 'Número',
  moeda: 'Moeda (R$)',
  texto: 'Texto',
  area: 'Área (m²)',
};

interface SiengeVendasModalProps {
  projects: Project[];
  versoes: SiengeTabelaVendaVersao[];
  versaoConfigs: SiengeTabelaVendaConfig[];
  onSaveVersao: (versao: SiengeTabelaVendaVersao) => Promise<void> | void;
  onDuplicarVersao: (versaoId: string, nome?: string) => Promise<void> | void;
  onDefinirVersaoPrincipal: (versaoId: string) => Promise<void> | void;
  onDeleteVersao: (versaoId: string) => Promise<void> | void;
  onSaveVersaoConfig: (config: SiengeTabelaVendaConfig) => Promise<void> | void;
  unidades: SiengeTabelaVendaUnidade[];
  revisoes: SiengeTabelaVendaRevisao[];
  vendas: SiengeVenda[];
  colunas: SiengeTabelaVendaColuna[];
  regras: SiengeCalculoRegra[];
  onSaveUnidade: (item: SiengeTabelaVendaUnidade) => void;
  onDeleteUnidade: (id: string) => void;
  onClearUnidades: (projectId: string) => Promise<void> | void;
  onApplyReajuste: (params: { projectId: string; versaoId: string; unidadeIds: string[] | null; percentual: number; descricao: string | null; motivo: string; colunas: string[] }) => Promise<void> | void;
  onSetMargem: (params: { projectId: string; versaoId: string; unidadeIds: string[] | null; coluna: string; valor: number }) => Promise<void> | void;
  onReverterRevisao: (revisaoId: string) => Promise<void> | void;
  onAlterarSituacao: (params: {
    projectId: string;
    unidadeIds: string[];
    situacao: SiengeVendaSituacao;
    motivo: string;
    comprador: string | null;
    data: string | null;
  }) => Promise<void> | void;
  onSaveColuna: (coluna: SiengeTabelaVendaColuna) => void;
  onDeleteColuna: (id: string) => void;
  onSaveRegra: (regra: SiengeCalculoRegra) => void;
  onDeleteRegra: (id: string) => void;
  validacoes: SiengeValidacao[];
  onSaveValidacao: (validacao: SiengeValidacao) => void;
  onDeleteValidacao: (id: string) => void;
  onClose?: () => void;
}

function slugifyKeyLocal(label: string): string {
  return label.trim().toLowerCase().normalize('NFD').replace(/[^\w\s]/g, '').replace(/\s+/g, '_') || 'coluna';
}

// Linha editável de definição de coluna — rascunho local + commit no blur,
// mesmo padrão usado no resto do módulo Sienge.
// Reordena trocando o sortOrder entre a entrada e a vizinha — funciona tanto
// entre colunas quanto entre colunas e regras, já que o merge intercala as
// duas listas numa única sequência visual (ver mergeColunasRegras).
function moveEntry(
  merged: ColunaOuRegra[],
  index: number,
  direction: -1 | 1,
  onSaveColuna: (c: SiengeTabelaVendaColuna) => void,
  onSaveRegra: (r: SiengeCalculoRegra) => void
) {
  const target = index + direction;
  if (target < 0 || target >= merged.length) return;
  const a = merged[index];
  const b = merged[target];
  const now = new Date().toISOString();
  const soA = a.item.sortOrder;
  const soB = b.item.sortOrder;
  if (a.kind === 'coluna') onSaveColuna({ ...a.item, sortOrder: soB, updatedAt: now });
  else onSaveRegra({ ...a.item, sortOrder: soB, updatedAt: now });
  if (b.kind === 'coluna') onSaveColuna({ ...b.item, sortOrder: soA, updatedAt: now });
  else onSaveRegra({ ...b.item, sortOrder: soA, updatedAt: now });
}

// Renomear a versão aberta: rascunho local, grava no blur/Enter. Ligar o input
// direto ao onSave gravaria uma vez por tecla digitada — uma escrita no banco
// (e um broadcast de realtime para todo mundo) por caractere.
function VersaoNomeInput({ versao, onCommit }: {
  versao: SiengeTabelaVendaVersao;
  onCommit: (v: SiengeTabelaVendaVersao) => Promise<void> | void;
}) {
  const [nome, setNome] = useState(versao.nome);
  useEffect(() => setNome(versao.nome), [versao.id, versao.nome]);

  const commit = () => {
    const limpo = nome.trim();
    // Nome vazio deixaria a aba sem rótulo e sem como ser clicada de volta.
    if (!limpo) { setNome(versao.nome); return; }
    if (limpo !== versao.nome) onCommit({ ...versao, nome: limpo });
  };

  return (
    <input
      type="text"
      value={nome}
      onChange={e => setNome(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      title="Renomear esta versão"
      className="w-40 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-blue-500/50 transition-colors"
    />
  );
}

// Vínculo entre versões: com o elo fechado, o valor dessa coluna é o mesmo em
// todas as versões e editar em qualquer uma replica nas demais. É a única
// diferença entre "duas versões da mesma tabela" e "duas tabelas soltas", então
// o estado precisa ser legível de relance — cor e ícone mudam juntos.
function VinculoToggle({ ativo, onToggle, rotulo }: { ativo: boolean; onToggle: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={ativo}
      title={ativo
        ? `"${rotulo}" está vinculada: o valor é o mesmo em todas as versões e editar em qualquer uma replica nas outras. Clique para desvincular.`
        : `"${rotulo}" é independente por versão. Clique para vincular e manter o mesmo valor em todas.`}
      className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-lg border transition-colors ${
        ativo
          ? 'text-blue-300 bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/25'
          : 'text-zinc-600 bg-zinc-900/60 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
      }`}
    >
      {ativo ? <Link2 size={13} /> : <Unlink2 size={13} />}
    </button>
  );
}

function ColunaRow({ coluna, vinculada, onToggleVinculo, onCommit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  coluna: SiengeTabelaVendaColuna;
  vinculada: boolean;
  onToggleVinculo: () => void;
  onCommit: (c: SiengeTabelaVendaColuna) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [label, setLabel] = useState(coluna.label);
  useEffect(() => setLabel(coluna.label), [coluna.label]);

  const inputClass = 'flex-1 min-w-0 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-blue-500/50 transition-colors';

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Mover para cima"
          className="p-0.5 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Mover para baixo"
          className="p-0.5 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={e => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label.trim() !== coluna.label) onCommit({ ...coluna, label: label.trim() }); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={inputClass}
      />
      <VinculoToggle
        ativo={vinculada}
        onToggle={onToggleVinculo}
        rotulo={coluna.label}
      />
      <select
        value={coluna.tipo}
        onChange={e => onCommit({ ...coluna, tipo: e.target.value as SiengeColunaTipo })}
        className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 outline-none cursor-pointer"
      >
        {(Object.keys(TIPO_LABELS) as SiengeColunaTipo[]).map(t => (
          <option key={t} value={t} className="bg-zinc-900">{TIPO_LABELS[t]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onDelete(coluna.id)}
        title="Remover coluna"
        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Coluna calculada (regra) dentro da mesma lista de "Colunas da Tabela" —
// só título e reordenação aqui; fórmula (operação, quantidade, % e referência)
// se edita no painel "Regras de Cálculo".
function RegraColunaRow({ regra, colunas, vinculada, onToggleVinculo, onCommit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  regra: SiengeCalculoRegra;
  colunas: SiengeTabelaVendaColuna[];
  vinculada: boolean;
  onToggleVinculo: () => void;
  onCommit: (r: SiengeCalculoRegra) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [titulo, setTitulo] = useState(regra.titulo);
  useEffect(() => setTitulo(regra.titulo), [regra.titulo]);

  const operacao: SiengeCalculoOperacao = regra.operacao === 'multiplicar' ? 'multiplicar' : 'dividir';
  const quantidadeLabel = regra.quantidadeColunaKey
    ? colunaBaseLabel(regra.quantidadeColunaKey, colunas)
    : regra.quantidade;
  const resumo = `${regra.percentual}% de ${colunaBaseLabel(regra.colunaBaseKey, colunas)} ${operacao === 'multiplicar' ? '×' : '÷'} ${quantidadeLabel}`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Mover para cima"
          className="p-0.5 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Mover para baixo"
          className="p-0.5 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      <input
        type="text"
        value={titulo}
        onChange={e => setTitulo(e.target.value)}
        onBlur={() => { if (titulo.trim() && titulo.trim() !== regra.titulo) onCommit({ ...regra, titulo: titulo.trim() }); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-0 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-blue-500/50 transition-colors"
      />
      {/* Vincula a FÓRMULA (percentual, quantidade, operação, coluna base),
          não um valor gravado — a regra não tem valor próprio, é sempre
          recalculada. Editar a fórmula de qualquer versão vinculada replica
          nas outras; título e posição continuam livres por versão. */}
      <VinculoToggle
        ativo={vinculada}
        onToggle={onToggleVinculo}
        rotulo={regra.titulo}
      />
      <span title={resumo} className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg shrink-0 max-w-[220px] truncate">
        <Calculator size={11} className="shrink-0" /> {resumo}
      </span>
      <button
        type="button"
        onClick={() => onDelete(regra.id)}
        title="Remover regra"
        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function NovaColunaForm({ projectId, versaoId, nextSortOrder, onAdd }: { projectId: string; versaoId: string; nextSortOrder: number; onAdd: (c: SiengeTabelaVendaColuna) => void }) {
  const [label, setLabel] = useState('');
  const [tipo, setTipo] = useState<SiengeColunaTipo>('moeda');

  const add = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({
      id: crypto.randomUUID(),
      projectId,
      versaoId,
      key: slugifyKeyLocal(trimmed),
      label: trimmed,
      tipo,
      sortOrder: nextSortOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setLabel('');
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add(); }}
        placeholder="Nome da nova coluna"
        className="flex-1 min-w-0 bg-zinc-900/60 border border-dashed border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/50 transition-colors"
      />
      <select
        value={tipo}
        onChange={e => setTipo(e.target.value as SiengeColunaTipo)}
        className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 outline-none cursor-pointer"
      >
        {(Object.keys(TIPO_LABELS) as SiengeColunaTipo[]).map(t => (
          <option key={t} value={t} className="bg-zinc-900">{TIPO_LABELS[t]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={!label.trim()}
        className="flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-colors shrink-0"
      >
        <Plus size={12} strokeWidth={3} /> Adicionar
      </button>
    </div>
  );
}

// Linha editável de regra de cálculo — título (era "descrição"), quantidade de
// parcelas, percentual e a coluna sobre a qual o percentual incide.
function RegraRow({ regra, colunas, onCommit, onDelete }: {
  regra: SiengeCalculoRegra;
  colunas: SiengeTabelaVendaColuna[];
  onCommit: (r: SiengeCalculoRegra) => void;
  onDelete: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState(regra.titulo);
  const [quantidadeText, setQuantidadeText] = useState(String(regra.quantidade));
  const [percentualText, setPercentualText] = useState(String(regra.percentual));

  useEffect(() => {
    setTitulo(regra.titulo);
    setQuantidadeText(String(regra.quantidade));
    setPercentualText(String(regra.percentual));
  }, [regra.titulo, regra.quantidade, regra.percentual]);

  const inputClass = 'w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-blue-500/50 transition-colors';
  const baseOptions = [{ key: 'valor_tabela', label: 'Valor da Unidade' }, ...colunas.filter(c => c.tipo !== 'texto').map(c => ({ key: c.key, label: c.label }))];

  const operacao: SiengeCalculoOperacao = regra.operacao === 'multiplicar' ? 'multiplicar' : 'dividir';
  const usaColuna = !!regra.quantidadeColunaKey;

  return (
    <div className="grid grid-cols-[1.1fr_0.6fr_0.9fr_0.9fr_1.1fr_auto] gap-2 items-end">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Título da Coluna</label>
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          onBlur={() => { if (titulo.trim()) onCommit({ ...regra, titulo: titulo.trim() }); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Operação</label>
        <select
          value={operacao}
          onChange={e => onCommit({ ...regra, operacao: e.target.value as SiengeCalculoOperacao })}
          className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none cursor-pointer"
        >
          <option value="dividir" className="bg-zinc-900">Dividir (÷)</option>
          <option value="multiplicar" className="bg-zinc-900">Multiplicar (×)</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider truncate">{operacao === 'multiplicar' ? 'Multiplicador' : 'Quantidade'}</label>
          <button
            type="button"
            onClick={() => onCommit({ ...regra, quantidadeColunaKey: usaColuna ? null : (baseOptions[0]?.key || null) })}
            className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            {usaColuna ? 'Digitar' : 'Coluna'}
          </button>
        </div>
        {usaColuna ? (
          <select
            value={regra.quantidadeColunaKey || ''}
            onChange={e => onCommit({ ...regra, quantidadeColunaKey: e.target.value })}
            className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none cursor-pointer"
          >
            {baseOptions.map(o => (
              <option key={o.key} value={o.key} className="bg-zinc-900">{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            value={quantidadeText}
            onChange={e => setQuantidadeText(e.target.value.replace(/\D/g, ''))}
            onBlur={() => { const n = parseInt(quantidadeText, 10) || 0; onCommit({ ...regra, quantidade: n }); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className={inputClass}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Percentual</label>
        <div className="flex items-center bg-zinc-900/60 border border-zinc-800 rounded-lg focus-within:border-blue-500/50 transition-colors">
          <input
            type="text"
            inputMode="decimal"
            value={percentualText}
            onChange={e => setPercentualText(e.target.value.replace(/[^\d,]/g, ''))}
            onBlur={() => { const n = parseFloat(percentualText.replace(',', '.')) || 0; onCommit({ ...regra, percentual: n }); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none"
          />
          <span className="pr-3 text-[10px] text-zinc-500 select-none">%</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Referência do %</label>
        <select
          value={regra.colunaBaseKey}
          onChange={e => onCommit({ ...regra, colunaBaseKey: e.target.value })}
          className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none cursor-pointer"
        >
          {baseOptions.map(o => (
            <option key={o.key} value={o.key} className="bg-zinc-900">{o.label}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => onDelete(regra.id)}
        title="Remover regra"
        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Percentual de reajuste aceita até 5 casas decimais — índices como INCC e IGPM
// são divulgados com essa precisão, e arredondar antes de aplicar propaga o erro
// para o valor de todas as unidades.
// Palavra exigida na segunda etapa da confirmação de reversão.
const PALAVRA_REVERTER = 'reverter';
const PALAVRA_LIMPAR = 'limpar';

const PERCENT_DECIMAIS = 5;
const PERCENT_FATOR = 10 ** PERCENT_DECIMAIS;

function roundPercent(v: number): number {
  return Math.round(v * PERCENT_FATOR) / PERCENT_FATOR;
}

function PercentStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const format = (v: number) => (v ? v.toLocaleString('pt-BR', { maximumFractionDigits: PERCENT_DECIMAIS }) : '');
  const [text, setText] = useState(format(value));

  useEffect(() => { setText(format(value)); }, [value]);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw.replace(',', '.'));
    onChange(isNaN(parsed) ? 0 : roundPercent(parsed));
  };

  const step = (delta: number) => onChange(roundPercent(value + delta));

  return (
    <div className="flex items-center bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
      <button type="button" onClick={() => step(-0.1)} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors">
        <Minus size={11} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="0,0"
        className="w-24 bg-transparent text-center text-xs text-zinc-100 placeholder-zinc-600 outline-none py-1.5"
      />
      <button type="button" onClick={() => step(0.1)} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors">
        <Plus size={11} />
      </button>
      <span className="pr-2.5 pl-0.5 text-[10px] text-zinc-500 select-none">%</span>
    </div>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Resultado da validação como bloco de equação: Soma | = | Referência,
// com o status (badge colorido) em destaque — mesma leitura visual pras
// duas famílias de validação (parcelas e valor da unidade).
function ResultadoEquacao({ somaLabel, soma, referenciaLabel, referencia, diferenca }: {
  somaLabel: string;
  soma: number;
  referenciaLabel: string;
  referencia: number;
  diferenca: number;
}) {
  const ok = isDiferencaOk(diferenca);
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide shrink-0">{somaLabel}</span>
        <span className="text-xs font-semibold text-zinc-100 truncate">{formatCurrency(soma)}</span>
      </div>
      <Equal size={12} className="text-zinc-600 shrink-0" />
      <div className="flex items-baseline gap-1 min-w-0">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide shrink-0">{referenciaLabel}</span>
        <span className="text-xs font-semibold text-zinc-100 truncate">{formatCurrency(referencia)}</span>
      </div>
      <DiferencaBadge diferenca={diferenca} />
    </div>
  );
}

function DiferencaBadge({ diferenca }: { diferenca: number }) {
  const ok = isDiferencaOk(diferenca);
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 ml-auto py-1 px-2 rounded-md text-xs font-bold shrink-0 ${ok ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
      {ok ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
      {diferenca >= 0 ? '+' : ''}{formatCurrency(diferenca)}
    </span>
  );
}

function novoTermoParcela(colunaKey: string): SiengeValidacaoTermo {
  return { colunaKey, quantidade: 1 };
}

function novoTermoValor(colunaKey: string): SiengeValidacaoTermo {
  return { colunaKey, sinal: '+' };
}

function ValidacaoParcelasCard({ validacao, opcoes, regras, item, onCommit, onDelete }: {
  validacao: SiengeValidacao;
  opcoes: { key: string; label: string }[];
  regras: SiengeCalculoRegra[];
  item?: SiengeTabelaVendaUnidade;
  onCommit: (v: SiengeValidacao) => void;
  onDelete: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState(validacao.titulo);
  useEffect(() => setTitulo(validacao.titulo), [validacao.titulo]);

  const selectClass = 'bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 outline-none cursor-pointer min-w-0';
  const resultado = item ? calcValidacaoParcelas(item, validacao, regras) : null;

  const updateTermo = (idx: number, termo: SiengeValidacaoTermo) => onCommit({ ...validacao, termos: validacao.termos.map((t, i) => i === idx ? termo : t) });
  const addTermo = () => onCommit({ ...validacao, termos: [...validacao.termos, novoTermoParcela(opcoes[0]?.key || 'valor_tabela')] });
  const removeTermo = (idx: number) => onCommit({ ...validacao, termos: validacao.termos.filter((_, i) => i !== idx) });

  return (
    <div className="flex flex-col gap-3 p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          onBlur={() => { if (titulo.trim() !== validacao.titulo) onCommit({ ...validacao, titulo: titulo.trim() }); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="Nome da validação"
          className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-zinc-200 placeholder-zinc-600 outline-none"
        />
        <button type="button" onClick={() => onDelete(validacao.id)} title="Remover validação" className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {validacao.termos.map((t, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-zinc-600 text-xs shrink-0">+</span>}
            <input
              type="text"
              inputMode="numeric"
              value={t.quantidade ?? ''}
              onChange={e => updateTermo(idx, { ...t, quantidade: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })}
              placeholder="Qtd"
              className="w-12 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-100 text-center outline-none shrink-0"
            />
            <span className="text-zinc-600 text-xs shrink-0">×</span>
            <select value={t.colunaKey} onChange={e => updateTermo(idx, { ...t, colunaKey: e.target.value })} className={selectClass}>
              {opcoes.map(o => <option key={o.key} value={o.key} className="bg-zinc-900">{o.label}</option>)}
            </select>
            {validacao.termos.length > 1 && (
              <button type="button" onClick={() => removeTermo(idx)} title="Remover termo" className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0">
                <X size={12} />
              </button>
            )}
          </React.Fragment>
        ))}
        <button type="button" onClick={addTermo} title="Adicionar termo" className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors shrink-0">
          <Plus size={13} strokeWidth={3} />
        </button>
        <Equal size={12} className="text-zinc-600 shrink-0 ml-1" />
        <select value={validacao.referenciaKey || ''} onChange={e => onCommit({ ...validacao, referenciaKey: e.target.value })} className={selectClass}>
          {opcoes.map(o => <option key={o.key} value={o.key} className="bg-zinc-900">{o.label}</option>)}
        </select>
      </div>

      {resultado && (
        <ResultadoEquacao
          somaLabel="Soma"
          soma={resultado.soma}
          referenciaLabel="Referência"
          referencia={resultado.referencia}
          diferenca={resultado.diferenca}
        />
      )}
    </div>
  );
}

function ValidacaoValorUnidadeCard({ validacao, opcoes, regras, item, onCommit, onDelete }: {
  validacao: SiengeValidacao;
  opcoes: { key: string; label: string }[];
  regras: SiengeCalculoRegra[];
  item?: SiengeTabelaVendaUnidade;
  onCommit: (v: SiengeValidacao) => void;
  onDelete: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState(validacao.titulo);
  useEffect(() => setTitulo(validacao.titulo), [validacao.titulo]);

  const selectClass = 'bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 outline-none cursor-pointer min-w-0';
  const resultado = item ? calcValidacaoValorUnidade(item, validacao, regras) : null;

  const updateTermo = (idx: number, termo: SiengeValidacaoTermo) => onCommit({ ...validacao, termos: validacao.termos.map((t, i) => i === idx ? termo : t) });
  const addTermo = () => onCommit({ ...validacao, termos: [...validacao.termos, novoTermoValor(opcoes[0]?.key || 'valor_tabela')] });
  const removeTermo = (idx: number) => onCommit({ ...validacao, termos: validacao.termos.filter((_, i) => i !== idx) });

  return (
    <div className="flex flex-col gap-3 p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          onBlur={() => { if (titulo.trim() !== validacao.titulo) onCommit({ ...validacao, titulo: titulo.trim() }); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="Nome da validação"
          className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-zinc-200 placeholder-zinc-600 outline-none"
        />
        <button type="button" onClick={() => onDelete(validacao.id)} title="Remover validação" className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {validacao.termos.map((t, idx) => (
          <React.Fragment key={idx}>
            <select value={t.sinal || '+'} onChange={e => updateTermo(idx, { ...t, sinal: e.target.value as '+' | '-' })} className={`${selectClass} w-12 text-center shrink-0`}>
              <option value="+" className="bg-zinc-900">+</option>
              <option value="-" className="bg-zinc-900">−</option>
            </select>
            <select value={t.colunaKey} onChange={e => updateTermo(idx, { ...t, colunaKey: e.target.value })} className={selectClass}>
              {opcoes.map(o => <option key={o.key} value={o.key} className="bg-zinc-900">{o.label}</option>)}
            </select>
            {validacao.termos.length > 1 && (
              <button type="button" onClick={() => removeTermo(idx)} title="Remover termo" className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0">
                <X size={12} />
              </button>
            )}
          </React.Fragment>
        ))}
        <button type="button" onClick={addTermo} title="Adicionar termo" className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors shrink-0">
          <Plus size={13} strokeWidth={3} />
        </button>
        <Equal size={12} className="text-zinc-600 shrink-0 ml-1" />
        <span className="text-xs text-zinc-400 font-medium shrink-0">Valor da Unidade</span>
      </div>

      {resultado && (
        <ResultadoEquacao
          somaLabel="Soma"
          soma={resultado.soma}
          referenciaLabel="Valor da Unidade"
          referencia={resultado.valorUnidade}
          diferenca={resultado.diferenca}
        />
      )}
    </div>
  );
}

// Painel de validação: escolhe uma unidade e monta duas famílias de fórmulas
// persistidas por empreendimento — Validar Parcelas (soma quantidade×coluna vs.
// uma coluna de referência) e Validar Valor da Unidade (soma ±coluna vs. o Valor
// da Unidade) — ambas esperam diferença = 0,00.
function ValidarPanel({ projectId, versaoId, unidades, colunas, regras, validacoes, onSaveValidacao, onDeleteValidacao, onClose }: {
  projectId: string;
  versaoId: string;
  unidades: SiengeTabelaVendaUnidade[];
  colunas: SiengeTabelaVendaColuna[];
  regras: SiengeCalculoRegra[];
  validacoes: SiengeValidacao[];
  onSaveValidacao: (v: SiengeValidacao) => void;
  onDeleteValidacao: (id: string) => void;
  onClose: () => void;
}) {
  const sorted = useMemo(() => [...unidades].sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true })), [unidades]);
  const [unidadeId, setUnidadeId] = useState(sorted[0]?.id || '');
  useEffect(() => { if (!sorted.find(u => u.id === unidadeId)) setUnidadeId(sorted[0]?.id || ''); }, [sorted, unidadeId]);

  const item = sorted.find(u => u.id === unidadeId);

  const opcoesColunas = useMemo(
    () => [
      { key: 'valor_tabela', label: 'Valor da Unidade' },
      ...colunas.filter(c => c.tipo !== 'texto').map(c => ({ key: c.key, label: c.label })),
      ...regras.map(r => ({ key: `${REGRA_KEY_PREFIX}${r.id}`, label: r.titulo })),
    ],
    [colunas, regras]
  );

  const validacoesParcelas = validacoes.filter(v => v.tipo === 'parcelas');
  const validacoesValorUnidade = validacoes.filter(v => v.tipo === 'valor_unidade');
  const nextSortOrder = validacoes.length > 0 ? Math.max(...validacoes.map(v => v.sortOrder)) + 1 : 1;

  const addValidacaoParcelas = () => {
    const colunaKey = opcoesColunas[0]?.key || 'valor_tabela';
    onSaveValidacao({
      id: crypto.randomUUID(),
      projectId,
      versaoId,
      tipo: 'parcelas',
      titulo: '',
      termos: [novoTermoParcela(colunaKey)],
      referenciaKey: colunaKey,
      sortOrder: nextSortOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const addValidacaoValorUnidade = () => {
    const colunaKey = opcoesColunas[0]?.key || 'valor_tabela';
    onSaveValidacao({
      id: crypto.randomUUID(),
      projectId,
      versaoId,
      tipo: 'valor_unidade',
      titulo: '',
      termos: [novoTermoValor(colunaKey)],
      referenciaKey: null,
      sortOrder: nextSortOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 shrink-0">
            <Calculator size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Validar Tabela</h3>
            <p className="text-[11px] text-zinc-500">Monte fórmulas de validação por empreendimento — o resultado esperado é sempre 0,00.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors shrink-0">
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Unidade em análise</label>
        <select
          value={unidadeId}
          onChange={e => setUnidadeId(e.target.value)}
          className="w-fit bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none cursor-pointer"
        >
          {sorted.map(u => (
            <option key={u.id} value={u.id} className="bg-zinc-900">Unidade {u.unidade}</option>
          ))}
        </select>
      </div>

      {!item ? (
        <p className="text-xs text-zinc-600">Nenhuma unidade cadastrada para validar.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 p-3 bg-zinc-950/30 border border-zinc-800/60 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-violet-500/10 border border-violet-500/20 rounded-md text-violet-400 shrink-0">
                  <ListChecks size={13} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Validar Parcelas</h4>
                  <p className="text-[10px] text-zinc-600">Soma de quantidade × coluna vs. uma coluna de referência.</p>
                </div>
              </div>
              <button type="button" onClick={addValidacaoParcelas} className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0">
                <Plus size={12} strokeWidth={3} /> Nova validação
              </button>
            </div>
            {validacoesParcelas.length === 0 ? (
              <p className="text-xs text-zinc-600">Ex.: (48 × Mensal) + (7 × Semestral) deve ser igual a Custo de Construção.</p>
            ) : (
              validacoesParcelas.map(v => (
                <ValidacaoParcelasCard
                  key={v.id}
                  validacao={v}
                  opcoes={opcoesColunas}
                  regras={regras}
                  item={item}
                  onCommit={onSaveValidacao}
                  onDelete={onDeleteValidacao}
                />
              ))
            )}
          </div>

          <div className="flex flex-col gap-3 p-3 bg-zinc-950/30 border border-zinc-800/60 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-400 shrink-0">
                  <Columns3 size={13} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Validar Valor da Unidade</h4>
                  <p className="text-[10px] text-zinc-600">Soma de ± coluna vs. o Valor da Unidade.</p>
                </div>
              </div>
              <button type="button" onClick={addValidacaoValorUnidade} className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0">
                <Plus size={12} strokeWidth={3} /> Nova validação
              </button>
            </div>
            {validacoesValorUnidade.length === 0 ? (
              <p className="text-xs text-zinc-600">Ex.: Custo de Construção + Adesão Total deve ser igual ao Valor da Unidade.</p>
            ) : (
              validacoesValorUnidade.map(v => (
                <ValidacaoValorUnidadeCard
                  key={v.id}
                  validacao={v}
                  opcoes={opcoesColunas}
                  regras={regras}
                  item={item}
                  onCommit={onSaveValidacao}
                  onDelete={onDeleteValidacao}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Card de uma revisão no Histórico. Hierarquia pensada pra leitura em
// varredura (como um extrato bancário): o ícone de tendência já diz "subiu ou
// desceu" antes de ler qualquer texto; motivo (por quê) e percentual (quanto)
// dividem a linha de destaque, porque são as duas perguntas que a pessoa vem
// fazer aqui. Tudo o resto — tipo, colunas, data, unidades — é contexto de
// apoio e fica junto, pequeno, numa única linha em vez de badges espalhadas.
// Revisão revertida não compete visualmente com as ativas: o card inteiro
// esmaece e o percentual ganha risco, porque ela já não vale mais.
function RevisaoRow({ revisao: r, projectColunas, onReverter }: {
  revisao: SiengeTabelaVendaRevisao;
  projectColunas: SiengeTabelaVendaColuna[];
  /** Ausente para quem não é administrador: reverter é ação exclusiva dele. */
  onReverter?: (revisao: SiengeTabelaVendaRevisao) => void;
}) {
  const [showUnidades, setShowUnidades] = useState(false);
  const positivo = r.percentual >= 0;
  const revertida = !!r.revertidaEm;
  // Revisões anteriores a 02/08/2026 não têm motivo; a descrição livre
  // daquela época faz esse papel.
  const motivo = r.motivo || r.descricao || `Revisão #${r.numero}`;

  const colunasLabel = r.colunas && r.colunas.length > 0
    ? r.colunas.map(key => key === 'valor_tabela' ? 'Valor de Tabela' : (projectColunas.find(c => c.key === key)?.label || key)).join(', ')
    : null;

  const meta = [
    r.tipo === 'geral' ? 'Todas as unidades' : `${r.unidadesAfetadas} unidade${r.unidadesAfetadas === 1 ? '' : 's'} selecionada${r.unidadesAfetadas === 1 ? '' : 's'}`,
    colunasLabel,
    formatDateTime(r.createdAt),
  ].filter(Boolean).join('  ·  ');

  return (
    <div className={`flex gap-3 px-3 py-3 border rounded-lg transition-opacity ${revertida ? 'bg-zinc-900/20 border-zinc-800/40 opacity-60' : 'bg-zinc-900/40 border-zinc-800/50'}`}>
      {/* Ícone de tendência: primeira coisa que o olho pega, resume a direção
          do reajuste sem precisar ler número nenhum. */}
      <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${positivo ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
        {positivo ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
      </div>

      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[13px] font-semibold text-zinc-100 leading-snug">{motivo}</span>
          <span className={`text-base font-bold whitespace-nowrap shrink-0 ${revertida ? 'text-zinc-500 line-through decoration-2' : positivo ? 'text-emerald-400' : 'text-red-400'}`}>
            {positivo ? '+' : ''}{r.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 5 })}%
          </span>
        </div>

        <span className="text-[11px] text-zinc-500">{meta}</span>

        <div className="flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-zinc-800/60">
          {r.unidades && r.unidades.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowUnidades(v => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
            >
              {showUnidades ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showUnidades ? 'Ocultar unidades' : 'Exibir unidades'}
            </button>
          ) : <span />}

          {revertida ? (
            <span className="text-[10px] font-medium text-amber-400/80 whitespace-nowrap shrink-0">
              Revertida em {formatDateTime(r.revertidaEm!)}
            </span>
          ) : r.temBackup && onReverter ? (
            <button
              type="button"
              onClick={() => onReverter(r)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Undo2 size={10} /> Reverter
            </button>
          ) : (
            <span className="text-[10px] text-zinc-700 whitespace-nowrap shrink-0">Sem backup</span>
          )}
        </div>

        {showUnidades && r.unidades && r.unidades.length > 0 && (
          <span className="text-[10px] text-zinc-600 break-words animate-fade-in">{r.unidades.join(', ')}</span>
        )}
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type PeriodoPreset = 'tudo' | 'mes' | '30d' | 'ano' | 'personalizado';

const PERIODO_PRESETS: { key: PeriodoPreset; label: string }[] = [
  { key: 'tudo', label: 'Tudo' },
  { key: 'mes', label: 'Este mês' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'ano', label: 'Este ano' },
];

// Intervalo [de, ate] em YYYY-MM-DD para cada atalho; 'tudo' e 'personalizado'
// não impõem limites próprios (o personalizado usa o que o usuário digitou).
function rangeFromPreset(preset: PeriodoPreset): { de: string; ate: string } {
  const hoje = new Date();
  if (preset === 'mes') return { de: toDateInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: toDateInput(hoje) };
  if (preset === '30d') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 29);
    return { de: toDateInput(inicio), ate: toDateInput(hoje) };
  }
  if (preset === 'ano') return { de: toDateInput(new Date(hoje.getFullYear(), 0, 1)), ate: toDateInput(hoje) };
  return { de: '', ate: '' };
}

// Tabela de Histórico de Vendas: só unidades vendidas, com os valores
// congelados no instante da venda (não os valores atuais da tabela viva) e a
// data em que cada uma virou vendida. O filtro de período recorta pela data da
// venda, para responder "quantas vendas houve no período".
function HistoricoVendasTable({ vendas, colunas }: { vendas: SiengeVenda[]; colunas: SiengeTabelaVendaColuna[] }) {
  const sortedColunas = [...colunas].sort((a, b) => a.sortOrder - b.sortOrder);
  const [preset, setPreset] = useState<PeriodoPreset>('tudo');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const aplicarPreset = (p: PeriodoPreset) => {
    setPreset(p);
    const r = rangeFromPreset(p);
    setDe(r.de);
    setAte(r.ate);
  };

  const filtradas = useMemo(() => {
    const deTs = de ? new Date(`${de}T00:00:00`).getTime() : null;
    const ateTs = ate ? new Date(`${ate}T23:59:59.999`).getTime() : null;
    return vendas
      .filter(v => {
        const ts = new Date(v.dataVenda).getTime();
        if (deTs !== null && ts < deTs) return false;
        if (ateTs !== null && ts > ateTs) return false;
        return true;
      })
      .sort((a, b) => new Date(b.dataVenda).getTime() - new Date(a.dataVenda).getTime());
  }, [vendas, de, ate]);

  const ativas = filtradas.filter(v => !v.dataDistrato).length;
  const distratadas = filtradas.length - ativas;
  const vgvPeriodo = filtradas.reduce((s, v) => s + v.valorCongelado, 0);

  const filtroBar = (
    <div className="flex flex-col gap-2 mb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODO_PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => aplicarPreset(p.key)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
              preset === p.key ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 bg-zinc-900/60 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-1">
          <input
            type="date"
            value={de}
            onChange={e => { setDe(e.target.value); setPreset('personalizado'); }}
            className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
          />
          <span className="text-[11px] text-zinc-600">até</span>
          <input
            type="date"
            value={ate}
            onChange={e => { setAte(e.target.value); setPreset('personalizado'); }}
            className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
          />
          {(de || ate) && (
            <button
              type="button"
              onClick={() => aplicarPreset('tudo')}
              title="Limpar período"
              className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span><span className="font-semibold text-zinc-100">{filtradas.length}</span> {filtradas.length === 1 ? 'venda' : 'vendas'} no período</span>
        <span><span className="font-semibold text-emerald-400">{ativas}</span> ativas</span>
        <span><span className="font-semibold text-zinc-300">{distratadas}</span> distratadas</span>
        <span>VGV congelado: <span className="font-semibold text-zinc-100">{formatCurrency(vgvPeriodo)}</span></span>
      </div>
    </div>
  );

  if (vendas.length === 0) {
    return <p className="text-xs text-zinc-600 text-center py-6">Nenhuma unidade vendida ainda neste empreendimento.</p>;
  }

  if (filtradas.length === 0) {
    return (
      <div>
        {filtroBar}
        <p className="text-xs text-zinc-600 text-center py-6">Nenhuma venda registrada no período selecionado.</p>
      </div>
    );
  }

  return (
    <div>
      {filtroBar}
      <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full border-separate border-spacing-y-1">
        <thead>
          <tr>
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Unidade</th>
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Origem</th>
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Comprador</th>
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Data</th>
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Valor Congelado</th>
            {sortedColunas.map(c => (
              <th key={c.key} className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{c.label}</th>
            ))}
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Observações</th>
            <th className="text-left px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtradas.map(v => (
            <tr key={v.id} className="[&>td]:bg-zinc-900/40 [&>td]:border-y [&>td]:border-zinc-800/50 [&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg [&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg">
              <td className="px-3 py-2 text-xs font-medium text-zinc-100">{v.unidade}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {/* Congelamentos anteriores a 02/08/2026 não registravam a
                    origem; todos eles vinham de venda. */}
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  v.situacaoOrigem === 'permuta' ? 'bg-violet-500/10 text-violet-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {v.situacaoOrigem === 'permuta' ? 'Permuta' : 'Venda'}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-zinc-300">{v.comprador || '—'}</td>
              <td className="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap">{formatDateTime(v.dataVenda)}</td>
              <td className="px-3 py-2 text-xs font-semibold text-zinc-100 whitespace-nowrap">{formatCurrency(v.valorCongelado)}</td>
              {sortedColunas.map(c => {
                const raw = v.camposExtraCongelados[c.key];
                if (c.tipo === 'texto') return <td key={c.key} className="px-3 py-2 text-xs text-zinc-300">{raw != null ? String(raw) : '—'}</td>;
                const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0').replace(',', '.')) || 0;
                return (
                  <td key={c.key} className="px-3 py-2 text-xs text-zinc-300 whitespace-nowrap">
                    {n > 0 ? (
                      c.tipo === 'moeda'
                        ? formatCurrency(n)
                        : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${c.tipo === 'area' ? ' m²' : ''}`
                    ) : '—'}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-xs text-zinc-400 min-w-[180px]">{v.motivo || '—'}</td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">
                {v.dataDistrato ? (
                  <span className="text-zinc-500" title={v.motivoDistrato || undefined}>
                    Distratada em {formatDateTime(v.dataDistrato)}
                    {v.motivoDistrato && <span className="block text-[10px] text-zinc-600 max-w-[200px] truncate">{v.motivoDistrato}</span>}
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold">Ativa</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Busca por unidade: prioriza correspondência exata, depois prefixo, depois
// substring — assim "20" traz "20" antes de "201", "2001" etc.
function searchUnidades(list: SiengeTabelaVendaUnidade[], term: string): SiengeTabelaVendaUnidade[] {
  const query = term.trim().toLowerCase();
  if (!query) return list;
  const scored = list
    .map(u => {
      const name = u.unidade.toLowerCase();
      let score = -1;
      if (name === query) score = 0;
      else if (name.startsWith(query)) score = 1;
      else if (name.includes(query)) score = 2;
      return { u, score };
    })
    .filter(x => x.score >= 0);
  scored.sort((a, b) => a.score - b.score || a.u.unidade.localeCompare(b.u.unidade, 'pt-BR', { numeric: true }));
  return scored.map(x => x.u);
}

// Campo de margem de uma unidade: rascunho local + commit no blur/Enter, mesmo
// padrão das células da tabela. O commit vai pela MESMA RPC da edição em lote —
// gravar margem move o valor da coluna pelo delta, e essa conta precisa existir
// num lugar só (o banco). Repetir o delta aqui criaria uma segunda
// implementação para divergir da primeira, com dinheiro no meio.
function MargemUnidadeInput({ item, colunaKey, onCommit }: {
  item: SiengeTabelaVendaUnidade;
  colunaKey: string;
  onCommit: (valor: number) => Promise<void> | void;
}) {
  const salvo = getMargem(item, colunaKey);
  const salvoText = salvo ? salvo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  const [text, setText] = useState(salvoText);
  useEffect(() => { setText(salvoText); }, [salvoText]);

  const commit = () => {
    const valor = parseCurrencyInput(text);
    if (valor === salvo) return;
    onCommit(valor);
  };

  return (
    <div className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-medium text-zinc-500 shrink-0">R$</span>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={e => setText(formatCurrencyInput(e.target.value))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="0,00"
        className="w-24 bg-zinc-900/60 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-100 text-right tabular-nums placeholder-zinc-700 outline-none focus:border-blue-500/50 transition-colors"
      />
    </div>
  );
}

// Painel "Margem" — a parcela de cada valor que NÃO acompanha o reajuste.
// A margem é por unidade E por coluna: o seletor de cima escolhe de qual coluna
// se está falando, e a lista embaixo edita unidade a unidade. O campo de cima
// preenche em lote (todas ou só as selecionadas) porque o caso comum é "essas
// N unidades passam a ter margem X", não digitar 124 valores diferentes.
function MargemPanel({ projectId, versaoId, unidades, colunas, onSetMargem, onClose }: {
  projectId: string;
  versaoId: string;
  unidades: SiengeTabelaVendaUnidade[];
  colunas: SiengeTabelaVendaColuna[];
  onSetMargem: (params: { projectId: string; versaoId: string; unidadeIds: string[] | null; coluna: string; valor: number }) => Promise<void> | void;
  onClose: () => void;
}) {
  const opcoes = useMemo(
    () => [
      { key: MARGEM_VALOR_TABELA_KEY, label: 'Valor de Tabela' },
      ...colunas.map(c => ({ key: c.key, label: c.label })),
    ],
    [colunas]
  );

  const [colunaKey, setColunaKey] = useState(MARGEM_VALOR_TABELA_KEY);
  // Apagar a coluna extra que estava selecionada não pode deixar o painel
  // editando uma key que não existe mais.
  useEffect(() => {
    if (!opcoes.some(o => o.key === colunaKey)) setColunaKey(MARGEM_VALOR_TABELA_KEY);
  }, [opcoes, colunaKey]);

  const [busca, setBusca] = useState('');
  const [loteText, setLoteText] = useState('');
  const [escopo, setEscopo] = useState<'todas' | 'selecionadas'>('todas');
  const [unitIds, setUnitIds] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);

  const sorted = useMemo(
    () => [...unidades].sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true })),
    [unidades]
  );
  const visiveis = useMemo(() => searchUnidades(sorted, busca), [sorted, busca]);

  const comMargem = useMemo(() => unidades.filter(u => getMargem(u, colunaKey) > 0), [unidades, colunaKey]);
  const totalMargem = comMargem.reduce((s, u) => s + getMargem(u, colunaKey), 0);

  const toggleUnit = (id: string) => {
    setUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const alvo = escopo === 'todas' ? null : Array.from(unitIds);
  const podeAplicarLote = escopo === 'todas' || unitIds.size > 0;

  const aplicarLote = async () => {
    if (!podeAplicarLote || aplicando) return;
    setAplicando(true);
    try {
      await onSetMargem({ projectId, versaoId, unidadeIds: alvo, coluna: colunaKey, valor: parseCurrencyInput(loteText) });
      setLoteText('');
    } finally {
      setAplicando(false);
    }
  };

  const colunaLabel = opcoes.find(o => o.key === colunaKey)?.label || colunaKey;

  return (
    <div className="flex flex-col gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">Margem</h3>
          <p className="text-[11px] text-zinc-500">
            Parcela fixa que se soma à coluna e nunca é reajustada: o percentual incide só sobre a base e a margem volta
            somada por cima — 90 de base com margem 10 valem 100, e a +10% viram 90 × 1,10 + 10 = 109.
          </p>
          {/* O aviso mais importante do painel: aqui não se configura, se move
              dinheiro. Sem isso alguém digita uma margem "para testar" e altera
              o valor de 798 unidades sem perceber. */}
          <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-amber-400/90">
            <AlertTriangle size={12} className="shrink-0 mt-px" />
            <span>
              Gravar a margem altera o valor da coluna: definir <strong>soma</strong> ao valor, retirar{' '}
              <strong>subtrai</strong>. Diferente do reajuste, isto não gera revisão — não há backup para reverter.
            </span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* A margem pertence a uma coluna: escolher a coluna é o primeiro passo,
          senão não se sabe de qual valor os números da lista falam. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Coluna</span>
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map(o => {
            const ativa = o.key === colunaKey;
            const quantas = unidades.filter(u => getMargem(u, o.key) > 0).length;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setColunaKey(o.key)}
                className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  ativa ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {o.label}
                {quantas > 0 && <span className={SEG_COUNT}>{quantas}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Margem em lote</label>
          <div className="inline-flex items-center gap-1.5 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500/50 transition-colors">
            <span className="text-[10px] font-medium text-zinc-500">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={loteText}
              onChange={e => setLoteText(formatCurrencyInput(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter') aplicarLote(); }}
              placeholder="0,00"
              className="w-28 bg-transparent text-xs text-zinc-100 text-right tabular-nums placeholder-zinc-600 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-900/60 border border-zinc-800 rounded-lg">
          <button
            type="button"
            onClick={() => setEscopo('todas')}
            className={`${SEG_BTN} ${escopo === 'todas' ? SEG_ON : SEG_OFF}`}
          >
            Todas ({unidades.length})
          </button>
          <button
            type="button"
            onClick={() => setEscopo('selecionadas')}
            className={`${SEG_BTN} ${escopo === 'selecionadas' ? SEG_ON : SEG_OFF}`}
          >
            Selecionadas ({unitIds.size})
          </button>
        </div>

        <button
          type="button"
          onClick={aplicarLote}
          disabled={!podeAplicarLote || aplicando}
          title={podeAplicarLote ? undefined : 'Selecione ao menos uma unidade na lista abaixo'}
          className={`flex items-center gap-1.5 ${CTL_H} px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg shrink-0 ${PRESS}`}
        >
          {aplicando ? 'Aplicando...' : 'Aplicar'}
        </button>

        {/* Zerar em lote é o caminho de volta: sem isso, tirar a margem de 124
            unidades exigiria apagar campo por campo. */}
        <button
          type="button"
          onClick={async () => {
            if (!podeAplicarLote || aplicando) return;
            setAplicando(true);
            try {
              await onSetMargem({ projectId, versaoId, unidadeIds: alvo, coluna: colunaKey, valor: 0 });
            } finally {
              setAplicando(false);
            }
          }}
          disabled={!podeAplicarLote || aplicando}
          className={`flex items-center gap-1.5 ${CTL_H} px-3 text-xs font-semibold rounded-lg border text-zinc-400 bg-zinc-900/60 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed ${PRESS}`}
        >
          Zerar margem
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 ${CTL_H} bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 focus-within:border-blue-500/50 transition-colors`}>
          <Search size={13} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar unidade..."
            className="w-32 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 outline-none"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        <span className="text-[11px] text-zinc-500">
          {comMargem.length > 0
            ? `${comMargem.length} unidade(s) com margem em ${colunaLabel} — ${formatCurrency(totalMargem)} congelado(s) no total.`
            : `Nenhuma margem em ${colunaLabel}: o reajuste incide sobre o valor cheio.`}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto custom-scrollbar border border-zinc-800/50 rounded-lg">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:bg-[#0d0d10] [&>th]:z-10 [&>th]:px-3 [&>th]:py-2 [&>th]:text-[10px] [&>th]:font-semibold [&>th]:text-zinc-500 [&>th]:uppercase [&>th]:tracking-wider [&>th]:border-b [&>th]:border-zinc-800">
              <th className="text-left">Unidade</th>
              <th className="text-right">{colunaLabel}</th>
              <th className="text-right">Margem</th>
              {/* O que de fato recebe o percentual — o número que explica o
                  resultado do reajuste sem precisar refazer a conta de cabeça. */}
              <th className="text-right">Base reajustável</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(u => {
              const valor = getColunaBaseValue(u, colunaKey);
              const margem = getMargem(u, colunaKey);
              const base = baseReajustavel(valor, margem);
              const selecionada = unitIds.has(u.id);
              return (
                <tr key={u.id} className="[&>td]:px-3 [&>td]:py-1.5 [&>td]:border-b [&>td]:border-zinc-800/40 hover:[&>td]:bg-zinc-800/30 transition-colors">
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleUnit(u.id)}
                      title="Selecionar para a aplicação em lote"
                      className={`flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-semibold rounded-md border transition-colors ${
                        selecionada ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-300 border-transparent hover:border-zinc-700'
                      }`}
                    >
                      {selecionada && <Check size={10} strokeWidth={3} />}
                      {u.unidade}
                    </button>
                  </td>
                  <td className="text-right text-xs text-zinc-400 tabular-nums whitespace-nowrap">{formatCurrency(valor)}</td>
                  <td className="text-right whitespace-nowrap">
                    <MargemUnidadeInput
                      item={u}
                      colunaKey={colunaKey}
                      onCommit={valor => onSetMargem({ projectId, versaoId, unidadeIds: [u.id], coluna: colunaKey, valor })}
                    />
                  </td>
                  <td className={`text-right text-xs tabular-nums whitespace-nowrap ${margem > 0 ? 'text-blue-300' : 'text-zinc-600'}`}>
                    {formatCurrency(base)}
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-zinc-600">
                  {unidades.length === 0 ? 'Nenhuma unidade cadastrada.' : 'Nenhuma unidade corresponde à busca.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-zinc-600">
        A margem é gravada por unidade e por coluna, e vale para todo reajuste futuro daquela coluna — um reajuste que
        marca várias colunas desconta a margem de cada uma separadamente. A operação é simétrica: definir margem 10 e
        depois retirá-la devolve o valor exatamente de onde partiu. Regravar a mesma margem não mexe em nada. O que já
        foi reajustado no passado não é recalculado — a margem vale do próximo reajuste em diante.
      </p>
    </div>
  );
}

export default function SiengeVendasModal({
  projects, versoes, versaoConfigs, onSaveVersao, onDuplicarVersao, onDefinirVersaoPrincipal, onDeleteVersao, onSaveVersaoConfig,
  unidades, revisoes, vendas, colunas, regras,
  onSaveUnidade, onDeleteUnidade, onClearUnidades, onApplyReajuste, onSetMargem, onReverterRevisao, onAlterarSituacao, onSaveColuna, onDeleteColuna, onSaveRegra, onDeleteRegra,
  validacoes, onSaveValidacao, onDeleteValidacao, onClose,
}: SiengeVendasModalProps) {
  // Excluir versão/unidades, limpar e reverter são exclusivos do administrador
  // (o banco também recusa — ver migração perfis_de_acesso).
  const { isAdmin } = usePermissoes();
  // "Limpar Tabela" some com todas as unidades do empreendimento sem gerar
  // revisão/backup — mais destrutivo que um reajuste (que sempre pode ser
  // revertido). Por isso exige digitar a palavra, igual ao fluxo de reverter.
  const [showLimparModal, setShowLimparModal] = useState(false);
  const [limparTexto, setLimparTexto] = useState('');
  const [limpando, setLimpando] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [situacaoFilter, setSituacaoFilter] = useState<SiengeVendaSituacao | 'todas'>('todas');
  const [searchText, setSearchText] = useState('');
  // Só faz sentido com "Validar" ligado — a comparação depende das colunas de
  // validação estarem sendo calculadas. Sem isso, o toggle ficaria "ativo" na
  // memória enquanto invisível, e reaparecer ligado ao religar Validar
  // surpreenderia o usuário com uma lista já filtrada que ele não pediu agora.
  const [somentePendentes, setSomentePendentes] = useState(false);
  // Painéis são mutuamente exclusivos: um estado só, em vez de oito booleanos
  // que cada botão precisava lembrar de desligar — o que já deixava "Alterar
  // Situação" empilhado junto com qualquer outro painel aberto depois dele.
  const [painel, setPainel] = useState<PainelId>(null);
  const togglePainel = (id: Exclude<PainelId, null>) => setPainel(p => (p === id ? null : id));
  const showReajuste = painel === 'reajuste';
  const showMargem = painel === 'margem';
  const showHistorico = painel === 'historico';
  const showCalculo = painel === 'calculo';
  const showColunas = painel === 'colunas';
  const showValidarConfig = painel === 'validarConfig';
  const showHistoricoVendas = painel === 'historicoVendas';
  const showLpCorretor = painel === 'lpCorretor';
  const showSituacao = painel === 'situacao';
  // "Validar" não é painel: liga as duas colunas de validação na tabela e
  // continua valendo com qualquer painel aberto.
  const [showValidar, setShowValidar] = useState(false);
  // Edição livre desligada por padrão: a tabela alimenta o orçamento real e a
  // LP publicada, então digitar numa célula por engano tem custo.
  const [edicaoLivre, setEdicaoLivre] = useState(false);
  const [situacaoAlvo, setSituacaoAlvo] = useState<SiengeVendaSituacao>('reservado');
  const [situacaoMotivo, setSituacaoMotivo] = useState('');
  const [situacaoComprador, setSituacaoComprador] = useState('');
  const [situacaoData, setSituacaoData] = useState('');
  const [situacaoUnitIds, setSituacaoUnitIds] = useState<Set<string>>(new Set());
  // Filtro e busca do seletor de unidades do painel. Com 124 unidades, listar
  // todas de uma vez torna o painel inutilizável — na prática se altera a
  // situação de um recorte ("as disponíveis", "as reservadas"), não da lista toda.
  const [situacaoOrigemFiltro, setSituacaoOrigemFiltro] = useState<SiengeVendaSituacao | 'todas'>('todas');
  const [situacaoBusca, setSituacaoBusca] = useState('');
  const [situacaoDropdownOpen, setSituacaoDropdownOpen] = useState(false);
  const [alterandoSituacao, setAlterandoSituacao] = useState(false);
  const [erroSituacao, setErroSituacao] = useState<string | null>(null);
  const [reajusteTipo, setReajusteTipo] = useState<'geral' | 'seletiva'>('geral');
  const [reajustePercentual, setReajustePercentual] = useState(0);
  const [reajusteDescricao, setReajusteDescricao] = useState('');
  const [reajusteMotivo, setReajusteMotivo] = useState('');
  // Colunas que recebem o percentual — valor de tabela sempre entra por padrão;
  // colunas extras em moeda/número podem ser somadas ou trocadas por ele.
  const [reajusteColunas, setReajusteColunas] = useState<Set<string>>(new Set(['valor_tabela']));
  const [erroReajuste, setErroReajuste] = useState<string | null>(null);
  // Reverter reescreve os valores de todas as unidades e é irreversível na
  // prática — daí a confirmação em duas etapas, a segunda exigindo digitar a
  // palavra. Não há como sair no piloto automático clicando "ok, ok".
  const [revisaoParaReverter, setRevisaoParaReverter] = useState<SiengeTabelaVendaRevisao | null>(null);
  const [revertEtapa, setRevertEtapa] = useState<1 | 2>(1);
  const [revertTexto, setRevertTexto] = useState('');
  const [revertendo, setRevertendo] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Versões do empreendimento. Enquanto a barra de abas (Fase 3) não existe, a
  // tela inteira opera sobre a principal — que é exatamente o conteúdo que a
  // tabela tinha antes de existirem versões.
  const projectVersoes = useMemo(
    () => versoes.filter(v => v.projectId === selectedProjectId).sort((a, b) => a.sortOrder - b.sortOrder),
    [versoes, selectedProjectId]
  );
  // Aba selecionada. Sem escolha explícita (ou depois de trocar de
  // empreendimento / apagar a versão aberta), cai na principal — que é a
  // tabela oficial e o palpite certo em qualquer dúvida.
  const [versaoSelecionadaId, setVersaoSelecionadaId] = useState<string | null>(null);
  const versaoAtiva = projectVersoes.find(v => v.id === versaoSelecionadaId)
    || projectVersoes.find(v => v.principal)
    || projectVersoes[0];
  const versaoAtivaId = versaoAtiva?.id || '';

  const colunasVinculadas = useMemo(
    () => versaoConfigs.find(c => c.projectId === selectedProjectId)?.colunasVinculadas || [],
    [versaoConfigs, selectedProjectId]
  );

  // Vincular/desvincular é do projeto, não da versão: a mesma key vale para
  // todas as abas.
  const toggleColunaVinculada = (key: string) => {
    const proximas = colunasVinculadas.includes(key)
      ? colunasVinculadas.filter(k => k !== key)
      : [...colunasVinculadas, key];
    onSaveVersaoConfig({ projectId: selectedProjectId, colunasVinculadas: proximas });
  };

  const [criandoVersao, setCriandoVersao] = useState(false);
  const [novaVersaoAberta, setNovaVersaoAberta] = useState(false);
  const [novaVersaoNome, setNovaVersaoNome] = useState('');
  // Mesmo padrão do banco (duplicar_sienge_tabela_vendas_versao), para o
  // placeholder mostrar o nome que sairia se o campo ficasse vazio.
  const nomeVersaoSugerido = `Versão ${projectVersoes.length + 1}`;

  const fecharNovaVersao = () => { setNovaVersaoAberta(false); setNovaVersaoNome(''); };

  const abrirNovaVersao = () => {
    if (!versaoAtivaId) return;
    setNovaVersaoNome(nomeVersaoSugerido);
    setNovaVersaoAberta(true);
  };

  const criarVersao = async () => {
    if (!versaoAtivaId || criandoVersao) return;
    setCriandoVersao(true);
    try {
      await onDuplicarVersao(versaoAtivaId, novaVersaoNome.trim() || undefined);
      fecharNovaVersao();
    } finally {
      setCriandoVersao(false);
    }
  };

  const projectUnidades = useMemo(
    () => unidades.filter(u => u.projectId === selectedProjectId && u.versaoId === versaoAtivaId),
    [unidades, selectedProjectId, versaoAtivaId]
  );

  const projectColunas = useMemo(
    () => colunas.filter(c => c.projectId === selectedProjectId && c.versaoId === versaoAtivaId).sort((a, b) => a.sortOrder - b.sortOrder),
    [colunas, selectedProjectId, versaoAtivaId]
  );

  const projectRegras = useMemo(
    () => regras.filter(r => r.projectId === selectedProjectId && r.versaoId === versaoAtivaId).sort((a, b) => a.sortOrder - b.sortOrder),
    [regras, selectedProjectId, versaoAtivaId]
  );

  const projectMerged = useMemo(
    () => mergeColunasRegras(projectColunas, projectRegras),
    [projectColunas, projectRegras]
  );
  const nextEntrySortOrder = projectMerged.length > 0 ? Math.max(...projectMerged.map(m => m.item.sortOrder)) + 1 : 1;

  const projectValidacoes = useMemo(
    () => validacoes.filter(v => v.projectId === selectedProjectId && v.versaoId === versaoAtivaId).sort((a, b) => a.sortOrder - b.sortOrder),
    [validacoes, selectedProjectId, versaoAtivaId]
  );

  // Quantas unidades do empreendimento estão com alguma validação fora da
  // tolerância — vira o contador do botão "Pendentes" e existe fora de
  // filteredUnidades porque o contador precisa contar sobre a base completa,
  // não sobre o que sobrou depois do filtro de situação/busca.
  const pendentesCount = useMemo(() => {
    if (!showValidar || projectValidacoes.length === 0) return 0;
    return projectUnidades.filter(u => unidadeValidacaoPendente(u, projectValidacoes, projectRegras)).length;
  }, [projectUnidades, projectValidacoes, projectRegras, showValidar]);

  // Se a última pendência foi corrigida com o filtro ativo, a lista some
  // silenciosamente sem explicar por quê — desliga o filtro e volta a mostrar
  // a tabela normal, já que "0 pendentes" deixou de ser um recorte útil.
  useEffect(() => {
    if (somentePendentes && pendentesCount === 0) setSomentePendentes(false);
  }, [somentePendentes, pendentesCount]);

  const filteredUnidades = useMemo(() => {
    const bySituacao = situacaoFilter === 'todas' ? projectUnidades : projectUnidades.filter(u => u.situacao === situacaoFilter);
    const buscadas = searchUnidades(bySituacao, searchText);
    if (!showValidar || !somentePendentes) return buscadas;
    return buscadas.filter(u => unidadeValidacaoPendente(u, projectValidacoes, projectRegras));
  }, [projectUnidades, situacaoFilter, searchText, showValidar, somentePendentes, projectValidacoes, projectRegras]);

  // O reajuste afeta a tabela inteira — inclusive vendidas e em permuta, para
  // o cliente ver quanto a unidade valorizou desde a compra. O que fica
  // congelado é só a CÓPIA em sienge_vendas (Histórico de Vendas), não o valor
  // vivo aqui na tabela.
  const reajustaveisUnidades = projectUnidades;

  // Só colunas extras numéricas fazem sentido receber um percentual — texto e
  // área não são valores monetários/quantidades que acompanham reajuste.
  const reajustaveisColunas = useMemo(
    () => projectColunas.filter(c => c.tipo === 'moeda' || c.tipo === 'numero'),
    [projectColunas]
  );

  // Quantas unidades têm alguma margem definida (em qualquer coluna) — vira o
  // contador do botão, que é o único aviso de que os próximos reajustes não
  // incidem sobre o valor cheio.
  const margemCount = useMemo(
    () => projectUnidades.filter(u => Object.values(u.margens || {}).some(v => v > 0)).length,
    [projectUnidades]
  );

  // Total congelado nas colunas marcadas para o reajuste — o resumo que explica
  // por que o resultado não bate com "percentual × valor da tabela".
  const margemDoReajuste = useMemo(() => {
    let total = 0;
    projectUnidades.forEach(u => {
      reajusteColunas.forEach(key => {
        total += margemEfetiva(getColunaBaseValue(u, key), getMargem(u, key));
      });
    });
    return total;
  }, [projectUnidades, reajusteColunas]);

  const projectRevisoes = useMemo(
    () => revisoes.filter(r => r.projectId === selectedProjectId && r.versaoId === versaoAtivaId).sort((a, b) => b.numero - a.numero),
    [revisoes, selectedProjectId, versaoAtivaId]
  );

  const projectVendas = useMemo(
    () => vendas.filter(v => v.projectId === selectedProjectId).sort((a, b) => new Date(b.dataVenda).getTime() - new Date(a.dataVenda).getTime()),
    [vendas, selectedProjectId]
  );

  const toggleUnit = (id: string) => {
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleReajusteColuna = (key: string) => {
    setReajusteColunas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const resetReajuste = () => {
    setPainel(null);
    setReajusteTipo('geral');
    setReajustePercentual(0);
    setReajusteDescricao('');
    setReajusteMotivo('');
    setSelectedUnitIds(new Set());
    setReajusteColunas(new Set(['valor_tabela']));
    setErroReajuste(null);
  };

  // O motivo é obrigatório: fica registrado na revisão e é o que explica o
  // reajuste meses depois, quando ninguém lembra por que a tabela mudou.
  const canApply = reajustePercentual !== 0
    && reajusteMotivo.trim().length > 0
    && reajusteColunas.size > 0
    && (reajusteTipo === 'geral' || selectedUnitIds.size > 0);

  const handleApply = async () => {
    if (!selectedProjectId || !versaoAtivaId || !canApply || applying) return;
    setApplying(true);
    setErroReajuste(null);
    try {
      await onApplyReajuste({
        projectId: selectedProjectId,
        versaoId: versaoAtivaId,
        unidadeIds: reajusteTipo === 'geral' ? null : Array.from(selectedUnitIds),
        percentual: reajustePercentual,
        descricao: reajusteDescricao.trim() || null,
        motivo: reajusteMotivo.trim(),
        colunas: Array.from(reajusteColunas),
      });
      resetReajuste();
    } catch (e: any) {
      // Sem este catch a rejeição morria no onClick e o painel ficava exatamente
      // como estava — indistinguível de um reajuste que deu certo mas não mudou
      // nada. O erro do banco é a única pista de por que a tabela não mexeu.
      setErroReajuste(e?.message || 'Não foi possível aplicar o reajuste.');
    } finally {
      setApplying(false);
    }
  };

  const exigeComprador = SITUACOES_COM_COMPRADOR.includes(situacaoAlvo);

  const resetSituacao = () => {
    setPainel(null);
    setSituacaoAlvo('reservado');
    setSituacaoMotivo('');
    setSituacaoComprador('');
    setSituacaoData('');
    setSituacaoUnitIds(new Set());
    setErroSituacao(null);
    setSituacaoOrigemFiltro('todas');
    setSituacaoBusca('');
    setSituacaoDropdownOpen(false);
  };

  // Quantas unidades há em cada situação — vira o contador de cada aba do
  // filtro, para escolher o recorte sem precisar abri-lo para descobrir.
  const situacaoContagem = useMemo(() => {
    const acc = { disponivel: 0, reservado: 0, vendida: 0, permuta: 0, bloqueada: 0 } as Record<SiengeVendaSituacao, number>;
    projectUnidades.forEach(u => { acc[u.situacao] += 1; });
    return acc;
  }, [projectUnidades]);

  const situacaoUnidadesVisiveis = useMemo(() => {
    const base = situacaoOrigemFiltro === 'todas'
      ? projectUnidades
      : projectUnidades.filter(u => u.situacao === situacaoOrigemFiltro);
    return [...searchUnidades(base, situacaoBusca)]
      .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true }));
  }, [projectUnidades, situacaoOrigemFiltro, situacaoBusca]);

  // Selecionadas que o filtro atual esconde. Sem expor isso, aplicar a mudança
  // atingiria unidades que não estão na tela — a pior surpresa possível numa
  // ação que congela valor e alimenta o orçamento.
  const situacaoSelecionadasOcultas = useMemo(() => {
    const visiveis = new Set(situacaoUnidadesVisiveis.map(u => u.id));
    return Array.from(situacaoUnitIds).filter(id => !visiveis.has(id)).length;
  }, [situacaoUnitIds, situacaoUnidadesVisiveis]);

  const todasVisiveisSelecionadas = situacaoUnidadesVisiveis.length > 0
    && situacaoUnidadesVisiveis.every(u => situacaoUnitIds.has(u.id));

  // Alterna o bloco visível inteiro: com o filtro em "Disponível", vira
  // "selecionar todas as disponíveis" num clique.
  const toggleVisiveis = () => {
    setSituacaoUnitIds(prev => {
      const next = new Set(prev);
      if (todasVisiveisSelecionadas) situacaoUnidadesVisiveis.forEach(u => next.delete(u.id));
      else situacaoUnidadesVisiveis.forEach(u => next.add(u.id));
      return next;
    });
  };

  const toggleSituacaoUnit = (id: string) => {
    setSituacaoUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canAlterarSituacao = situacaoUnitIds.size > 0
    && situacaoMotivo.trim().length > 0
    && (!exigeComprador || situacaoComprador.trim().length > 0);

  const handleAlterarSituacao = async () => {
    if (!selectedProjectId || !canAlterarSituacao || alterandoSituacao) return;
    setAlterandoSituacao(true);
    setErroSituacao(null);
    try {
      await onAlterarSituacao({
        projectId: selectedProjectId,
        unidadeIds: Array.from(situacaoUnitIds),
        situacao: situacaoAlvo,
        motivo: situacaoMotivo.trim(),
        comprador: exigeComprador ? situacaoComprador.trim() : null,
        // Data local escolhida vira meio-dia para preservar a ordem de vários
        // registros no mesmo dia sem escorregar de fuso.
        data: situacaoData ? new Date(`${situacaoData}T12:00:00`).toISOString() : null,
      });
      resetSituacao();
    } catch (e: any) {
      setErroSituacao(e?.message || 'Erro ao alterar a situação.');
    } finally {
      setAlterandoSituacao(false);
    }
  };

  const abrirReverter = (revisao: SiengeTabelaVendaRevisao) => {
    setRevisaoParaReverter(revisao);
    setRevertEtapa(1);
    setRevertTexto('');
  };

  const fecharReverter = () => {
    setRevisaoParaReverter(null);
    setRevertEtapa(1);
    setRevertTexto('');
  };

  const revertConfirmado = revertTexto.trim().toLowerCase() === PALAVRA_REVERTER;

  const handleReverter = async () => {
    if (!revisaoParaReverter || revertendo || !revertConfirmado) return;
    setRevertendo(true);
    try {
      await onReverterRevisao(revisaoParaReverter.id);
      fecharReverter();
    } finally {
      setRevertendo(false);
    }
  };

  const fecharLimpar = () => {
    setShowLimparModal(false);
    setLimparTexto('');
  };

  const limparConfirmado = limparTexto.trim().toLowerCase() === PALAVRA_LIMPAR;

  const handleLimparTabela = async () => {
    if (!selectedProjectId || limpando || !limparConfirmado) return;
    setLimpando(true);
    try {
      await onClearUnidades(selectedProjectId);
      fecharLimpar();
    } finally {
      setLimpando(false);
    }
  };

  const handleExportCsv = () => {
    if (!selectedProjectId) return;
    const csv = exportSiengeVendasCsv(projectUnidades, projectColunas, projectRegras);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(selectedProject?.name || 'tabela-vendas').replace(/\s+/g, '-').toLowerCase()}-tabela-vendas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const isExcel = /\.xlsx?$/i.test(file.name);
    const regraTitulos = projectRegras.map(r => r.titulo);

    if (isExcel) {
      const { unidades: parsed, novasColunas } = await parseSiengeVendasXlsx(
        file, selectedProjectId, versaoAtivaId, projectUnidades, projectColunas, regraTitulos
      );
      novasColunas.forEach(onSaveColuna);
      parsed.forEach(onSaveUnidade);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const { unidades: parsed, novasColunas } = parseSiengeVendasCsv(
        text, selectedProjectId, versaoAtivaId, projectUnidades, projectColunas, regraTitulos
      );
      novasColunas.forEach(onSaveColuna);
      parsed.forEach(onSaveUnidade);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      {/* Header */}
      <div className="flex items-center justify-between view-pad-x py-4 short:py-2.5 border-b border-zinc-900/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <Table2 size={16} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Tabela de Vendas</h2>
            <p className="text-[11px] text-zinc-600">Valor de tabela, colunas e situação das unidades por empreendimento</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-zinc-100 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={13} /> Voltar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto view-pad-x view-pad-y flex flex-col view-gap-sm">
        {/* Faixa 1 — contexto e filtros (o que estou vendo) + ações de rotina.
            Faixa 2 (abaixo) — ferramentas de configuração, agrupadas por assunto.
            A separação existe porque 11 botões de mesmo peso na mesma linha não
            deixavam claro o que é uso diário e o que é ajuste estrutural. */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProjectDropdownOpen(p => !p)}
              className={`flex items-center gap-1.5 min-w-[200px] ${CTL_H} bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-xs outline-none transition-all hover:bg-zinc-800/60`}
            >
              <Building2 size={13} className="text-zinc-500 shrink-0" />
              <span className={`truncate flex-1 text-left font-semibold ${selectedProject ? 'text-zinc-100' : 'text-zinc-500'}`}>
                {selectedProject?.name || 'Selecione um empreendimento'}
              </span>
              <ChevronDown size={13} className={`text-zinc-500 shrink-0 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isProjectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsProjectDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-[#141417] border border-zinc-800/80 rounded-xl shadow-xl shadow-black/60 overflow-hidden animate-dropdown-in origin-top py-1">
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedProjectId(p.id); setIsProjectDropdownOpen(false); setSituacaoFilter('todas'); setSearchText(''); resetReajuste(); }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                          p.id === selectedProjectId ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {/* Cor sozinha não é indicador de seleção suficiente. */}
                        {p.id === selectedProjectId && <Check size={13} strokeWidth={3} className="shrink-0 animate-scale-in" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {selectedProjectId && (
            <>
              {/* Busca por unidade */}
              <div className={`flex items-center gap-1.5 ${CTL_H} bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 focus-within:border-blue-500/50 transition-colors`}>
                <Search size={13} className="text-zinc-500 shrink-0" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Buscar unidade..."
                  className="w-28 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 outline-none"
                />
                {searchText && (
                  <button type="button" onClick={() => setSearchText('')} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filtro por situação */}
              <div className={`flex items-center gap-0.5 ${CTL_H} px-1 bg-zinc-900/60 border border-zinc-800 rounded-lg`}>
                <button
                  type="button"
                  onClick={() => setSituacaoFilter('todas')}
                  className={`${SEG_BTN} ${situacaoFilter === 'todas' ? SEG_ON : SEG_OFF}`}
                >
                  Todas
                </button>
                {(Object.keys(SITUACAO_FILTER_LABELS) as SiengeVendaSituacao[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSituacaoFilter(s)}
                    className={`${SEG_BTN} flex items-center gap-1.5 ${situacaoFilter === s ? SITUACAO_PILL[s] : SEG_OFF}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${SITUACAO_DOT[s]} ${situacaoFilter === s ? 'opacity-100' : 'opacity-40'}`} />
                    {SITUACAO_FILTER_LABELS[s]}
                  </button>
                ))}
              </div>

              {/* Só existe com "Validar" ligado — filtrar por pendência sem as
                  colunas de validação visíveis não teria como o usuário conferir
                  o motivo de cada uma estar na lista. */}
              {showValidar && (
                <button
                  type="button"
                  onClick={() => setSomentePendentes(v => !v)}
                  title="Mostrar só as unidades com validação fora da tolerância"
                  aria-pressed={somentePendentes}
                  disabled={pendentesCount === 0}
                  className={`flex items-center gap-1.5 ${CTL_H} px-3 text-[11px] font-semibold rounded-lg border ${PRESS} animate-scale-in disabled:opacity-40 disabled:cursor-not-allowed ${
                    somentePendentes ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'text-zinc-400 bg-zinc-900/60 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800'
                  }`}
                >
                  <AlertTriangle size={13} /> Pendentes
                  {pendentesCount > 0 && <span className={TOOL_BADGE}>{pendentesCount}</span>}
                </button>
              )}

              {/* Ações de rotina — alinhadas à direita, com a primária em destaque */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setEdicaoLivre(v => !v)}
                  title={edicaoLivre
                    ? 'Edição livre ativa: qualquer campo da tabela pode ser alterado'
                    : 'Tabela protegida: ative para editar os campos livremente'}
                  aria-pressed={edicaoLivre}
                  className={`flex items-center gap-2 ${CTL_H} px-3 text-xs font-semibold rounded-lg border ${PRESS} ${
                    edicaoLivre ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'text-zinc-400 bg-zinc-900/60 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800'
                  }`}
                >
                  {/* key faz o cadeado remontar na troca, então o ícone novo
                      entra com escala em vez de trocar de forma seca. */}
                  <span key={edicaoLivre ? 'aberto' : 'fechado'} className="animate-scale-in">
                    {edicaoLivre ? <LockOpen size={13} /> : <Lock size={13} />}
                  </span>
                  Edição livre
                  <span className={`relative w-7 h-3.5 rounded-full transition-colors duration-200 ${edicaoLivre ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${edicaoLivre ? 'left-[16px]' : 'left-0.5'}`} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => togglePainel('lpCorretor')}
                  title="Página pública com a tabela de preços, para os corretores"
                  className={`flex items-center gap-1.5 ${CTL_H} px-3 text-xs font-semibold rounded-lg border ${PRESS} ${
                    showLpCorretor ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 bg-zinc-900/60 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800'
                  }`}
                >
                  <Smartphone size={13} /> Tabela Corretor
                </button>
                <button
                  type="button"
                  onClick={() => togglePainel('situacao')}
                  title="Vender, reservar, bloquear ou liberar unidades"
                  className={`flex items-center gap-1.5 ${CTL_H} px-3 text-xs font-semibold rounded-lg border ${PRESS} ${
                    showSituacao
                      ? 'bg-blue-500 text-white border-blue-400 shadow-sm shadow-blue-500/25'
                      : 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25 hover:text-blue-200'
                  }`}
                >
                  <Tags size={13} /> Alterar Situação
                </button>
              </div>
            </>
          )}
        </div>

        {/* Barra de versões — cada aba é uma condição comercial do mesmo
            empreendimento (à vista, financiado, prazos diferentes), com colunas,
            regras e valores próprios. Fica acima das ferramentas porque a versão
            escolhida define o que todas elas enxergam.

            Com uma versão só a barra inteira some: aba única, botão de trocar a
            principal e lixeira bloqueada não informam nada — só ocupam a faixa e
            sugerem uma escolha que não existe. A exceção é enquanto se digita o
            nome da segunda versão, quando a barra reaparece para hospedar o
            campo. */}
        {selectedProjectId && (projectVersoes.length > 1 || novaVersaoAberta) && (
          <div className="flex items-center gap-1 flex-wrap animate-scale-in">
            {projectVersoes.length > 1 && projectVersoes.map(v => {
              const ativa = v.id === versaoAtivaId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVersaoSelecionadaId(v.id)}
                  title={v.principal ? 'Versão principal: alimenta VGV, saldo e orçamento' : 'Cenário comercial — não entra nos números financeiros'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border ${PRESS} ${
                    ativa
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : 'text-zinc-500 bg-zinc-900/40 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {/* A estrela é o único sinal de qual versão é a oficial —
                      sem ela, duas abas pareceriam intercambiáveis. */}
                  {v.principal && <Star size={11} className="fill-current shrink-0" />}
                  {v.nome}
                </button>
              );
            })}

            {/* Campo de nome da versão nova, aberto pelo botão "Adicionar
                versão" da barra de ferramentas. Nasce preenchido com o próximo
                nome padrão, então dar Enter direto continua sendo o caminho
                rápido — nomear é opção, não obrigação. */}
            {novaVersaoAberta && (
              <div className="flex items-center gap-1 animate-scale-in">
                <input
                  type="text"
                  autoFocus
                  value={novaVersaoNome}
                  onChange={e => setNovaVersaoNome(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') criarVersao();
                    if (e.key === 'Escape') fecharNovaVersao();
                  }}
                  placeholder={nomeVersaoSugerido}
                  className="w-44 bg-zinc-900/60 border border-blue-500/40 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/70 transition-colors"
                />
                <button
                  type="button"
                  onClick={criarVersao}
                  disabled={criandoVersao}
                  title="Criar a versão"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 ${PRESS}`}
                >
                  {criandoVersao ? 'Criando...' : <Check size={12} strokeWidth={3} />}
                </button>
                <button
                  type="button"
                  onClick={fecharNovaVersao}
                  title="Cancelar"
                  className="p-1.5 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {versaoAtiva && projectVersoes.length > 1 && (
              <div className="flex items-center gap-1 ml-auto">
                <VersaoNomeInput versao={versaoAtiva} onCommit={onSaveVersao} />
                {!versaoAtiva.principal && (
                  <button
                    type="button"
                    onClick={() => onDefinirVersaoPrincipal(versaoAtiva.id)}
                    title="Tornar esta a versão oficial: passa a alimentar VGV Meta, Saldo, Teto do Produto e Alocação, e a congelar venda"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border ${PRESS} text-amber-300/80 bg-amber-500/10 border-amber-500/30 hover:text-amber-200`}
                  >
                    <Star size={11} /> Tornar principal
                  </button>
                )}
                {/* Apagar a principal fica bloqueado: sem principal, os números
                    financeiros ficariam sem fonte e a venda sem onde congelar. */}
                {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    if (versaoAtiva.principal || projectVersoes.length < 2) return;
                    if (!window.confirm(`Remover a versão "${versaoAtiva.nome}"? As unidades, colunas, regras e revisões dela serão apagadas. As outras versões não são afetadas.`)) return;
                    setVersaoSelecionadaId(null);
                    onDeleteVersao(versaoAtiva.id);
                  }}
                  disabled={versaoAtiva.principal || projectVersoes.length < 2}
                  title={versaoAtiva.principal ? 'A versão principal não pode ser removida — torne outra principal antes' : 'Remover esta versão'}
                  className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Trash2 size={13} />
                </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Faixa 2 — ferramentas, agrupadas por assunto dentro de um único
            contêiner: Dados · Estrutura da tabela · Histórico. Botões fantasma
            (sem borda própria) para não competirem com a faixa de cima. */}
        {selectedProjectId && (
          <div className="flex items-center gap-1 flex-wrap p-1 bg-zinc-900/40 border border-zinc-800/70 rounded-xl">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className={`${TOOL_BTN} ${TOOL_OFF}`}>
              <Upload size={13} /> Importar
            </button>
            <button type="button" onClick={handleExportCsv} className={`${TOOL_BTN} ${TOOL_OFF}`}>
              <Download size={13} /> Exportar
            </button>

            <span className={TOOL_SEP} />

            {/* Junto de Colunas e Regras de Cálculo: as três mexem na
                estrutura da tabela, não nos dados. */}
            <button
              type="button"
              onClick={abrirNovaVersao}
              disabled={!versaoAtivaId || novaVersaoAberta}
              title="Cria uma cópia desta versão (mesmas unidades e situação) para editar as condições que mudam"
              className={`${TOOL_BTN} ${novaVersaoAberta ? TOOL_ON : TOOL_OFF} disabled:opacity-40 disabled:pointer-events-none`}
            >
              <Layers size={13} /> Adicionar versão
            </button>
            <button
              type="button"
              onClick={() => togglePainel('colunas')}
              className={`${TOOL_BTN} ${showColunas ? TOOL_ON : TOOL_OFF}`}
            >
              <Columns3 size={13} /> Colunas
            </button>
            <button
              type="button"
              onClick={() => togglePainel('calculo')}
              className={`${TOOL_BTN} ${showCalculo ? TOOL_ON : TOOL_OFF}`}
            >
              <Calculator size={13} /> Regras de Cálculo
            </button>
            <button
              type="button"
              onClick={() => togglePainel('reajuste')}
              className={`${TOOL_BTN} ${showReajuste ? TOOL_ON : TOOL_OFF}`}
            >
              <TrendingUp size={13} /> Atualizar Valor
            </button>
            <button
              type="button"
              onClick={() => togglePainel('margem')}
              title="Parte do valor que fica congelada e não recebe o percentual do reajuste"
              className={`${TOOL_BTN} ${showMargem ? TOOL_ON : TOOL_OFF}`}
            >
              <Snowflake size={13} /> Margem
              {margemCount > 0 && <span className={TOOL_BADGE}>{margemCount}</span>}
            </button>

            {/* Validar + engrenagem viram um par visual: a config é modificador
                do toggle, não uma ação independente. */}
            <span className={`flex items-center rounded-md ${showValidar ? 'bg-blue-500/15' : ''}`}>
              <button
                type="button"
                onClick={() => setShowValidar(v => {
                  const next = !v;
                  if (!next) { setPainel(cur => (cur === 'validarConfig' ? null : cur)); setSomentePendentes(false); }
                  return next;
                })}
                title="Mostra as colunas Validar Parcelas e Validar Valor da Unidade, calculadas para todas as unidades"
                className={`${TOOL_BTN} ${showValidar ? 'text-blue-400' : TOOL_OFF}`}
              >
                <ShieldCheck size={13} /> Validar
              </button>
              {showValidar && (
                <button
                  type="button"
                  onClick={() => togglePainel('validarConfig')}
                  title="Editar fórmulas de validação"
                  className={`flex items-center justify-center px-2 py-1.5 rounded-md animate-scale-in ${PRESS} ${
                    showValidarConfig ? 'text-blue-300 bg-blue-500/20' : 'text-blue-400/70 hover:text-blue-300'
                  }`}
                >
                  <Settings size={13} className={`transition-transform duration-300 ${showValidarConfig ? 'rotate-90' : ''}`} />
                </button>
              )}
            </span>

            <span className={TOOL_SEP} />

            <button
              type="button"
              onClick={() => togglePainel('historico')}
              className={`${TOOL_BTN} ${showHistorico ? TOOL_ON : TOOL_OFF}`}
            >
              <History size={13} /> Revisões
              {projectRevisoes.length > 0 && <span className={TOOL_BADGE}>{projectRevisoes.length}</span>}
            </button>
            <button
              type="button"
              onClick={() => togglePainel('historicoVendas')}
              className={`${TOOL_BTN} ${showHistoricoVendas ? TOOL_ON : TOOL_OFF}`}
            >
              <ReceiptText size={13} /> Histórico de Vendas
              {projectVendas.length > 0 && <span className={TOOL_BADGE}>{projectVendas.length}</span>}
            </button>

            {isAdmin && <span className={TOOL_SEP} />}

            {isAdmin && (
            <button
              type="button"
              onClick={() => setShowLimparModal(true)}
              disabled={projectUnidades.length === 0}
              title="Remove todas as unidades desta tabela de vendas — colunas, regras e revisões continuam"
              className={`${TOOL_BTN} text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none`}
            >
              <Trash2 size={13} /> Limpar Tabela
            </button>
            )}
          </div>
        )}

        {!selectedProjectId ? (
          <p className="text-xs text-zinc-600 text-center py-10">Nenhum empreendimento cadastrado.</p>
        ) : (
          <>
            {showSituacao && (
              <div className="flex flex-col gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-200">Alterar Situação</h3>
                    <p className="text-[11px] text-zinc-500">
                      Caminho único para mudar situação. Venda e permuta congelam o valor e as colunas da unidade no
                      Histórico de Vendas — é esse congelamento que alimenta o orçamento real.
                    </p>
                  </div>
                  <button type="button" onClick={resetSituacao} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {/* Recorte da lista: filtro por situação atual + busca. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`flex items-center gap-0.5 ${CTL_H} px-1 bg-zinc-900/60 border border-zinc-800 rounded-lg`}>
                      <button
                        type="button"
                        onClick={() => setSituacaoOrigemFiltro('todas')}
                        className={`${SEG_BTN} flex items-center gap-1.5 ${situacaoOrigemFiltro === 'todas' ? SEG_ON : SEG_OFF}`}
                      >
                        Todas
                        <span className={SEG_COUNT}>{projectUnidades.length}</span>
                      </button>
                      {(Object.keys(SITUACAO_FILTER_LABELS) as SiengeVendaSituacao[]).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSituacaoOrigemFiltro(s)}
                          disabled={situacaoContagem[s] === 0}
                          className={`${SEG_BTN} flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed ${
                            situacaoOrigemFiltro === s ? SITUACAO_PILL[s] : SEG_OFF
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${SITUACAO_DOT[s]} ${situacaoOrigemFiltro === s ? 'opacity-100' : 'opacity-40'}`} />
                          {SITUACAO_FILTER_LABELS[s]}
                          <span className={SEG_COUNT}>{situacaoContagem[s]}</span>
                        </button>
                      ))}
                    </div>

                    <div className={`flex items-center gap-1.5 ${CTL_H} bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 focus-within:border-blue-500/50 transition-colors`}>
                      <Search size={13} className="text-zinc-500 shrink-0" />
                      <input
                        type="text"
                        value={situacaoBusca}
                        onChange={e => setSituacaoBusca(e.target.value)}
                        placeholder="Buscar unidade..."
                        className="w-28 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 outline-none"
                      />
                      {situacaoBusca && (
                        <button type="button" onClick={() => setSituacaoBusca('')} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={toggleVisiveis}
                      disabled={situacaoUnidadesVisiveis.length === 0}
                      className={`flex items-center gap-1.5 ${CTL_H} px-3 text-[11px] font-semibold rounded-lg border ${PRESS} text-zinc-400 bg-zinc-900/60 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {todasVisiveisSelecionadas ? 'Limpar visíveis' : `Selecionar ${situacaoUnidadesVisiveis.length}`}
                    </button>

                    {situacaoUnitIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSituacaoUnitIds(new Set())}
                        className={`flex items-center gap-1.5 ${CTL_H} px-3 text-[11px] font-semibold rounded-lg ${PRESS} text-zinc-500 hover:text-zinc-200 animate-fade-in`}
                      >
                        <X size={12} /> Limpar seleção
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className={situacaoUnitIds.size > 0 ? 'text-zinc-300 font-semibold' : 'text-zinc-500'}>
                      {situacaoUnitIds.size} de {projectUnidades.length} unidade(s) selecionada(s)
                    </span>
                    {/* Aviso de seleção fora do recorte: a ação vale para todas
                        as selecionadas, inclusive as que o filtro escondeu. */}
                    {situacaoSelecionadasOcultas > 0 && (
                      <span className="flex items-center gap-1 text-amber-400/90 animate-fade-in">
                        <AlertTriangle size={11} />
                        {situacaoSelecionadasOcultas} fora do filtro atual — continua(m) incluída(s)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar p-2 bg-zinc-900/40 border border-zinc-800/50 rounded-lg">
                    {situacaoUnidadesVisiveis.length === 0 && (
                      <span className="text-[11px] text-zinc-600 py-1">Nenhuma unidade neste recorte.</span>
                    )}
                    {situacaoUnidadesVisiveis.map(u => {
                      const checked = situacaoUnitIds.has(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleSituacaoUnit(u.id)}
                          title={`Situação atual: ${SITUACAO_FILTER_LABELS[u.situacao]}`}
                          aria-pressed={checked}
                          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium tabular-nums rounded-md border ${PRESS} ${
                            checked ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          {/* Espaço do check sempre reservado: aparecendo e
                              sumindo ele mudava a largura do chip e a grade
                              inteira se reorganizava a cada clique. */}
                          <Check
                            size={10}
                            strokeWidth={3}
                            className={`shrink-0 transition-opacity duration-150 ${checked ? 'opacity-100' : 'opacity-0'}`}
                          />
                          {u.unidade}
                          <span className={`w-1.5 h-1.5 rounded-full ${SITUACAO_DOT[u.situacao]}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-end gap-3 flex-wrap">
                  {/* Nova situação como dropdown: são 5 opções mutuamente
                      exclusivas e a escolhida é a que importa — o segmentado
                      gastava uma faixa inteira para mostrar as 4 descartadas. */}
                  <div className="flex flex-col gap-1.5 w-[190px] shrink-0">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Nova situação</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setSituacaoDropdownOpen(o => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={situacaoDropdownOpen}
                        className={`w-full flex items-center gap-2 ${CTL_H} px-3 text-xs font-semibold rounded-lg border ${PRESS} ${SITUACAO_PILL[situacaoAlvo]}`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${SITUACAO_DOT[situacaoAlvo]}`} />
                        <span className="flex-1 text-left">{SITUACAO_FILTER_LABELS[situacaoAlvo]}</span>
                        <ChevronDown size={13} className={`shrink-0 transition-transform ${situacaoDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {situacaoDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setSituacaoDropdownOpen(false)} />
                          <div
                            role="listbox"
                            className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-[#141417] border border-zinc-800/80 rounded-xl shadow-xl shadow-black/60 overflow-hidden animate-dropdown-in origin-top py-1"
                          >
                            {(Object.keys(SITUACAO_FILTER_LABELS) as SiengeVendaSituacao[]).map(s => (
                              <button
                                key={s}
                                type="button"
                                role="option"
                                aria-selected={situacaoAlvo === s}
                                onClick={() => { setSituacaoAlvo(s); setSituacaoDropdownOpen(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                                  situacaoAlvo === s ? 'bg-zinc-800/60 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100'
                                }`}
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${SITUACAO_DOT[s]}`} />
                                <span className="flex-1 text-left">{SITUACAO_FILTER_LABELS[s]}</span>
                                {situacaoAlvo === s && <Check size={13} strokeWidth={3} className="shrink-0 animate-scale-in" />}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Motivo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={situacaoMotivo}
                      onChange={e => setSituacaoMotivo(e.target.value)}
                      placeholder="Ex.: Proposta assinada em 02/08/2026"
                      className={`w-full ${CTL_H} bg-zinc-900/60 border rounded-lg px-3 text-xs text-zinc-100 placeholder-zinc-600 outline-none transition-colors ${
                        situacaoMotivo.trim() ? 'border-zinc-800 focus:border-blue-500/50' : 'border-red-500/40 focus:border-red-500/60'
                      }`}
                    />
                  </div>
                  {exigeComprador && (
                    <>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                          Comprador <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={situacaoComprador}
                          onChange={e => setSituacaoComprador(e.target.value)}
                          placeholder="Nome do comprador"
                          className={`w-full ${CTL_H} bg-zinc-900/60 border rounded-lg px-3 text-xs text-zinc-100 placeholder-zinc-600 outline-none transition-colors ${
                            situacaoComprador.trim() ? 'border-zinc-800 focus:border-blue-500/50' : 'border-red-500/40 focus:border-red-500/60'
                          }`}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Data</label>
                        <input
                          type="date"
                          value={situacaoData}
                          onChange={e => setSituacaoData(e.target.value)}
                          className={`${CTL_H} bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-xs text-zinc-100 outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]`}
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleAlterarSituacao}
                    disabled={!canAlterarSituacao || alterandoSituacao}
                    className={`flex items-center gap-1.5 ${CTL_H} px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg shrink-0 ${PRESS}`}
                  >
                    {alterandoSituacao ? 'Aplicando...' : 'Aplicar situação'}
                  </button>
                </div>

                {erroSituacao && <p className="text-[11px] text-red-400">{erroSituacao}</p>}
                <p className="text-[10px] text-zinc-600">
                  Unidades que já estão na situação escolhida são ignoradas. Sair de vendida ou permuta encerra o
                  registro ativo no Histórico de Vendas (distrato) — o valor de tabela continua o mesmo, já que nunca
                  parou de ser reajustado. A LP do Corretor exibe Bloqueada e Permuta como "Vendida".
                </p>
              </div>
            )}

            {showLpCorretor && (
              <LpCorretorConfigPanel
                key={selectedProjectId}
                projectId={selectedProjectId}
                projectName={selectedProject?.name || ''}
                terceiros={!!selectedProject?.terceiros}
                versoes={projectVersoes}
                onSaveVersao={onSaveVersao}
                // Todas as versões, não só a aberta: a LP escolhe quais libera
                // e precisa enxergar as colunas e regras de cada uma.
                colunas={colunas.filter(c => c.projectId === selectedProjectId)}
                regras={regras.filter(r => r.projectId === selectedProjectId)}
                unidades={unidades.filter(u => u.projectId === selectedProjectId)}
                onClose={() => setPainel(null)}
              />
            )}

            {showColunas && (
              <div className="flex flex-col gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Colunas da Tabela</h3>
                    <p className="text-[11px] text-zinc-500">Adicione, remova, renomeie ou reordene as colunas deste empreendimento — inclui as colunas calculadas (regras). Unidade, Valor da Unidade e Situação são fixas. A fórmula de uma coluna calculada se edita em "Regras de Cálculo".</p>
                  </div>
                  <button type="button" onClick={() => setPainel(null)} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {/* Valor da Unidade não é coluna dinâmica (não sai de
                      sienge_tabela_vendas_colunas), mas é a candidata mais óbvia
                      a vínculo — normalmente o preço é o mesmo e o que muda
                      entre versões é a forma de pagamento. Por isso ganha uma
                      linha própria aqui, em vez de ficar sem lugar. */}
                  {projectVersoes.length > 1 && (
                    <div className="flex items-center gap-2 pb-2 mb-1 border-b border-zinc-800/60">
                      <span className="flex-1 min-w-0 px-3 py-2 text-xs text-zinc-400">Valor da Unidade <span className="text-zinc-600">(coluna fixa)</span></span>
                      <VinculoToggle
                        ativo={colunasVinculadas.includes(MARGEM_VALOR_TABELA_KEY)}
                        onToggle={() => toggleColunaVinculada(MARGEM_VALOR_TABELA_KEY)}
                        rotulo="Valor da Unidade"
                      />
                    </div>
                  )}
                  {projectMerged.map((m, idx) => m.kind === 'coluna' ? (
                    <ColunaRow
                      key={`c-${m.item.id}`}
                      coluna={m.item}
                      vinculada={colunasVinculadas.includes(m.item.key)}
                      onToggleVinculo={() => toggleColunaVinculada(m.item.key)}
                      onCommit={onSaveColuna}
                      onDelete={onDeleteColuna}
                      onMoveUp={() => moveEntry(projectMerged, idx, -1, onSaveColuna, onSaveRegra)}
                      onMoveDown={() => moveEntry(projectMerged, idx, 1, onSaveColuna, onSaveRegra)}
                      isFirst={idx === 0}
                      isLast={idx === projectMerged.length - 1}
                    />
                  ) : (
                    <RegraColunaRow
                      key={`r-${m.item.id}`}
                      regra={m.item}
                      colunas={projectColunas}
                      vinculada={colunasVinculadas.includes(REGRA_VINCULO_PREFIX + m.item.vinculoKey)}
                      onToggleVinculo={() => toggleColunaVinculada(REGRA_VINCULO_PREFIX + m.item.vinculoKey)}
                      onCommit={onSaveRegra}
                      onDelete={onDeleteRegra}
                      onMoveUp={() => moveEntry(projectMerged, idx, -1, onSaveColuna, onSaveRegra)}
                      onMoveDown={() => moveEntry(projectMerged, idx, 1, onSaveColuna, onSaveRegra)}
                      isFirst={idx === 0}
                      isLast={idx === projectMerged.length - 1}
                    />
                  ))}
                  <NovaColunaForm
                    projectId={selectedProjectId}
                    versaoId={versaoAtivaId}
                    nextSortOrder={nextEntrySortOrder}
                    onAdd={onSaveColuna}
                  />
                </div>
              </div>
            )}

            {showReajuste && (
              <div className="flex flex-col gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-200">Reajuste de Valor da Tabela</h3>
                  <button type="button" onClick={resetReajuste} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-1 p-1 bg-zinc-900/60 border border-zinc-800 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setReajusteTipo('geral')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      reajusteTipo === 'geral' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'text-zinc-500 border border-transparent hover:text-zinc-300'
                    }`}
                  >
                    Todas as unidades ({reajustaveisUnidades.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReajusteTipo('seletiva')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      reajusteTipo === 'seletiva' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'text-zinc-500 border border-transparent hover:text-zinc-300'
                    }`}
                  >
                    Selecionar unidades
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Colunas a reajustar</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleReajusteColuna('valor_tabela')}
                      className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                        reajusteColunas.has('valor_tabela') ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {reajusteColunas.has('valor_tabela') && <Check size={10} strokeWidth={3} />}
                      Valor de Tabela
                    </button>
                    {reajustaveisColunas.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleReajusteColuna(c.key)}
                        className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                          reajusteColunas.has(c.key) ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {reajusteColunas.has(c.key) && <Check size={10} strokeWidth={3} />}
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {reajusteColunas.size === 0 && (
                    <span className="text-[10px] text-red-400">Selecione ao menos uma coluna.</span>
                  )}
                  {/* Margem cadastrada muda o resultado do reajuste; sem esse
                      aviso, quem aplica o percentual encontraria um número que
                      não bate com a conta que fez de cabeça. */}
                  {margemDoReajuste > 0 && (
                    <button
                      type="button"
                      onClick={() => setPainel('margem')}
                      className="flex items-center gap-1.5 w-fit text-[10px] text-blue-300/90 hover:text-blue-200 transition-colors"
                    >
                      <Snowflake size={11} className="shrink-0" />
                      {formatCurrency(margemDoReajuste)} de margem congelada nas colunas marcadas — o percentual incide
                      só sobre o restante. Ver margens
                    </button>
                  )}
                </div>

                {reajusteTipo === 'seletiva' && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-zinc-500">{selectedUnitIds.size} de {reajustaveisUnidades.length} unidade(s) selecionada(s)</span>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-zinc-900/40 border border-zinc-800/50 rounded-lg">
                      {reajustaveisUnidades.length === 0 ? (
                        <span className="text-xs text-zinc-600 py-1">Nenhuma unidade cadastrada.</span>
                      ) : (
                        [...reajustaveisUnidades].sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true })).map(u => {
                          const checked = selectedUnitIds.has(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggleUnit(u.id)}
                              className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                checked ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'text-zinc-400 border-zinc-800 hover:border-zinc-700'
                              }`}
                            >
                              {checked && <Check size={10} strokeWidth={3} />}
                              {u.unidade}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Percentual</label>
                    <PercentStepper value={reajustePercentual} onChange={setReajustePercentual} />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Motivo da alteração <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={reajusteMotivo}
                      onChange={e => setReajusteMotivo(e.target.value)}
                      placeholder="Ex.: Reajuste INCC de julho/2026 aprovado em diretoria"
                      className={`w-full bg-zinc-900/60 border rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 outline-none transition-colors ${
                        reajusteMotivo.trim() ? 'border-zinc-800 focus:border-blue-500/50' : 'border-red-500/40 focus:border-red-500/60'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!canApply || applying}
                    title={!reajusteMotivo.trim() ? 'Informe o motivo da alteração' : undefined}
                    className={`flex items-center gap-1.5 ${CTL_H} px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg shrink-0 ${PRESS}`}
                  >
                    {applying ? 'Aplicando...' : 'Aplicar'}
                  </button>
                </div>
                {erroReajuste && (
                  <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {erroReajuste}
                  </p>
                )}
                <p className="text-[10px] text-zinc-600">
                  {reajusteTipo === 'geral'
                    ? `O percentual será aplicado às ${reajustaveisUnidades.length} unidade(s) desta versão da tabela, inclusive Vendidas e em Permuta — é bom para o cliente ver quanto a unidade valorizou desde a compra.`
                    : 'O percentual será aplicado apenas às unidades selecionadas acima.'}
                  {' '}Apenas as colunas marcadas acima recebem o percentual; as demais permanecem como estão.
                  {' '}Isso não altera o valor já registrado no Histórico de Vendas: aquela cópia é feita no instante da
                  venda/permuta e é ela — não o valor vivo aqui na tabela — que alimenta o VGV e o orçamento real.
                  {' '}Um backup da tabela é gravado antes da alteração e fica disponível no Histórico de Revisões.
                  A LP do Corretor só passa a exibir os novos valores depois de aprovada em "Tabela Corretor".
                </p>
              </div>
            )}

            {showMargem && (
              <MargemPanel
                projectId={selectedProjectId}
                versaoId={versaoAtivaId}
                unidades={projectUnidades}
                colunas={reajustaveisColunas}
                onSetMargem={onSetMargem}
                onClose={() => setPainel(null)}
              />
            )}

            {showCalculo && (
              <div className="flex flex-col gap-4 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Regras de Cálculo</h3>
                    <p className="text-[11px] text-zinc-500">Cada regra vira uma coluna calculada: percentual da coluna de referência, dividido ou multiplicado por um valor.</p>
                  </div>
                  <button type="button" onClick={() => setPainel(null)} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  {projectRegras.map(r => (
                    <RegraRow key={r.id} regra={r} colunas={projectColunas} onCommit={onSaveRegra} onDelete={onDeleteRegra} />
                  ))}
                  {projectRegras.length === 0 && (
                    <p className="text-xs text-zinc-600">Nenhuma regra cadastrada ainda.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => onSaveRegra({
                      id: crypto.randomUUID(),
                      projectId: selectedProjectId,
                      versaoId: versaoAtivaId,
                      // Placeholder só para o tipo — o banco ignora este valor
                      // no insert (não está no payload de saveSiengeCalculoRegra)
                      // e gera o vinculo_key definitivo sozinho.
                      vinculoKey: crypto.randomUUID(),
                      titulo: 'Nova Regra',
                      quantidade: 1,
                      quantidadeColunaKey: null,
                      operacao: 'dividir',
                      percentual: 0,
                      colunaBaseKey: 'valor_tabela',
                      sortOrder: nextEntrySortOrder,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    })}
                    className="flex items-center gap-1.5 w-fit px-3 py-2 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus size={12} strokeWidth={3} /> Adicionar regra
                  </button>
                </div>
              </div>
            )}

            {showHistorico && (
              <div className="flex flex-col gap-2 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
                <h3 className="text-xs font-semibold text-zinc-200">Histórico de Revisões</h3>
                {projectRevisoes.length === 0 ? (
                  <p className="text-xs text-zinc-600 py-2">Nenhuma revisão registrada ainda para este empreendimento.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                    {projectRevisoes.map(r => (
                      <RevisaoRow key={r.id} revisao={r} projectColunas={projectColunas} onReverter={isAdmin ? abrirReverter : undefined} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {showValidarConfig && (
              <ValidarPanel
                projectId={selectedProjectId}
                versaoId={versaoAtivaId}
                unidades={projectUnidades}
                colunas={projectColunas}
                regras={projectRegras}
                validacoes={projectValidacoes}
                onSaveValidacao={onSaveValidacao}
                onDeleteValidacao={onDeleteValidacao}
                onClose={() => setPainel(null)}
              />
            )}

            {showHistoricoVendas && (
              <div className="flex flex-col gap-2 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-panel-in origin-top">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Histórico de Vendas</h3>
                    <p className="text-[11px] text-zinc-500">Valores congelados no instante de cada venda — não mudam com reajustes ou edições posteriores na tabela principal.</p>
                  </div>
                  <button type="button" onClick={() => setPainel(null)} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <HistoricoVendasTable vendas={projectVendas} colunas={projectColunas} />
              </div>
            )}

            <SiengeVendasTable
              projectId={selectedProjectId}
              versaoId={versaoAtivaId}
              unidades={filteredUnidades}
              allUnidadeNames={projectUnidades.map(u => u.unidade)}
              colunas={projectColunas}
              regras={projectRegras}
              validacoes={projectValidacoes}
              mostrarValidacao={showValidar}
              terceiros={!!selectedProject?.terceiros}
              editavel={edicaoLivre}
              onSave={onSaveUnidade}
              onDelete={onDeleteUnidade}
              podeExcluir={isAdmin}
              onSaveColuna={onSaveColuna}
              onSaveRegra={onSaveRegra}
            />
          </>
        )}
      </div>

      {revisaoParaReverter && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#141417] border border-zinc-800 rounded-xl shadow-xl shadow-black/60 p-5 flex flex-col gap-3 animate-scale-in">
            <div className="flex items-center gap-2">
              <Undo2 size={15} className="text-amber-400" />
              <h3 className="text-sm font-bold text-zinc-100">Reverter a Revisão #{revisaoParaReverter.numero}?</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Os valores de todas as unidades voltam ao backup gravado em {formatDateTime(revisaoParaReverter.createdAt)},
              imediatamente antes deste reajuste de {revisaoParaReverter.percentual >= 0 ? '+' : ''}
              {revisaoParaReverter.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 5 })}%.
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Isso restaura apenas valores — valor da unidade e colunas dinâmicas. Situação, comprador e data de venda
              não são alterados, e reajustes feitos depois deste serão desfeitos junto.
              A LP do Corretor só reflete a reversão depois de aprovada em "Tabela Corretor".
            </p>

            {revertEtapa === 2 && (
              <div className="flex flex-col gap-1.5 p-3 bg-amber-500/5 border border-amber-500/30 rounded-lg animate-fade-in">
                <label className="text-[11px] text-zinc-300">
                  Digite <span className="font-bold text-amber-300">{PALAVRA_REVERTER}</span> para confirmar:
                </label>
                <input
                  type="text"
                  value={revertTexto}
                  onChange={e => setRevertTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && revertConfirmado) handleReverter();
                    if (e.key === 'Escape') fecharReverter();
                  }}
                  autoFocus
                  autoComplete="off"
                  placeholder={PALAVRA_REVERTER}
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-700 outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={fecharReverter}
                disabled={revertendo}
                className="px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              {revertEtapa === 1 ? (
                <button
                  type="button"
                  onClick={() => setRevertEtapa(2)}
                  className="px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors"
                >
                  Sim, tenho certeza
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReverter}
                  disabled={revertendo || !revertConfirmado}
                  title={revertConfirmado ? undefined : `Digite "${PALAVRA_REVERTER}" para liberar`}
                  className="px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-colors"
                >
                  {revertendo ? 'Revertendo...' : 'Reverter tabela'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showLimparModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#141417] border border-zinc-800 rounded-xl shadow-xl shadow-black/60 p-5 flex flex-col gap-3 animate-scale-in">
            <div className="flex items-center gap-2">
              <Trash2 size={15} className="text-red-400" />
              <h3 className="text-sm font-bold text-zinc-100">Limpar Tabela de Vendas?</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Todas as {projectUnidades.length} unidade{projectUnidades.length === 1 ? '' : 's'} desta tabela ({selectedProject?.name}) serão
              excluídas permanentemente — valores, situação e colunas dinâmicas de cada unidade. Não é gerada revisão
              nem backup, então isso não pode ser desfeito.
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              As colunas, regras de cálculo e validações configuradas continuam — só as unidades (linhas) são removidas.
              Histórico de Vendas e revisões de reajuste já registrados também continuam intactos.
            </p>

            <div className="flex flex-col gap-1.5 p-3 bg-red-500/5 border border-red-500/30 rounded-lg">
              <label className="text-[11px] text-zinc-300">
                Digite <span className="font-bold text-red-300">{PALAVRA_LIMPAR}</span> para confirmar:
              </label>
              <input
                type="text"
                value={limparTexto}
                onChange={e => setLimparTexto(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && limparConfirmado) handleLimparTabela();
                  if (e.key === 'Escape') fecharLimpar();
                }}
                autoFocus
                autoComplete="off"
                placeholder={PALAVRA_LIMPAR}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-700 outline-none focus:border-red-500/50 transition-colors"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={fecharLimpar}
                disabled={limpando}
                className="px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLimparTabela}
                disabled={limpando || !limparConfirmado}
                title={limparConfirmado ? undefined : `Digite "${PALAVRA_LIMPAR}" para liberar`}
                className="px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-colors"
              >
                {limpando ? 'Limpando...' : 'Limpar tabela'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

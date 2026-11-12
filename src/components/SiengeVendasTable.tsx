import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlertTriangle, Check, ShieldCheck, GripVertical, Trash2, Plus, X, Microscope, History } from 'lucide-react';
import UnidadeHistoricoModal from './comercial/UnidadeHistoricoModal';
import { SiengeCalculoRegra, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeValidacao, SiengeVendaSituacao } from '../types';
import { ColunaOuRegra, SITUACAO_LABELS, calcRegraValor, calcValidacaoParcelas, calcValidacaoValorUnidade, formatBrNumber, formatCurrencyInput, isDiferencaOk, mergeColunasRegras, parseBrNumber, parseCurrencyInput } from '../lib/siengeVendasTabela';

interface SiengeVendasTableProps {
  projectId: string;
  versaoId: string;
  unidades: SiengeTabelaVendaUnidade[];
  allUnidadeNames: string[];
  colunas: SiengeTabelaVendaColuna[];
  regras: SiengeCalculoRegra[];
  validacoes: SiengeValidacao[];
  mostrarValidacao: boolean;
  /**
   * Empreendimento de terceiros: a tabela reúne unidades de imóveis
   * diferentes, então ganha a coluna Imóvel — a primeira de todas, porque é ela
   * que separa os blocos; ler "unidade 503" sem saber de que imóvel não diz
   * nada. Em empreendimento próprio a coluna não existe.
   */
  terceiros: boolean;
  /**
   * Edição livre: com o toggle desligado a tabela vira somente leitura. Só a
   * situação nunca é editável aqui — ela passa obrigatoriamente pelo painel
   * "Alterar Situação", que exige motivo e registra o congelamento da venda.
   */
  editavel: boolean;
  onSave: (item: SiengeTabelaVendaUnidade) => void;
  onDelete: (id: string) => void;
  /** Excluir unidade é exclusivo do administrador. */
  podeExcluir?: boolean;
  onSaveColuna: (coluna: SiengeTabelaVendaColuna) => void;
  onSaveRegra: (regra: SiengeCalculoRegra) => void;
}

// Reordena a lista mesclada (colunas + regras) movendo o item de `from` pra
// `to` e recompacta o sortOrder em sequência — mesmo espaço de numeração das
// duas entidades (ver mergeColunasRegras), então dá pra intercalar livremente
// arrastando uma coluna calculada entre colunas reais e vice-versa.
function reorderMerged(merged: ColunaOuRegra[], from: number, to: number, onSaveColuna: (c: SiengeTabelaVendaColuna) => void, onSaveRegra: (r: SiengeCalculoRegra) => void) {
  if (from === to) return;
  const copy = [...merged];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  const now = new Date().toISOString();
  copy.forEach((m, idx) => {
    const newSortOrder = idx + 1;
    if (m.item.sortOrder === newSortOrder) return;
    if (m.kind === 'coluna') onSaveColuna({ ...m.item, sortOrder: newSortOrder, updatedAt: now });
    else onSaveRegra({ ...m.item, sortOrder: newSortOrder, updatedAt: now });
  });
}

export const SITUACAO_STYLES: Record<SiengeVendaSituacao, string> = {
  disponivel: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  reservado: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  vendida: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  permuta: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  bloqueada: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

function formatDecimalInput(value: string): string {
  const cleaned = value.replace(/[^\d,]/g, '');
  const [intPart, ...rest] = cleaned.split(',');
  return rest.length ? `${intPart},${rest.join('')}` : intPart;
}

function parseDecimalInput(value: string): number {
  return parseFloat(value.replace(',', '.')) || 0;
}

// Precisão exibida nas colunas calculadas (regras), soma e badges de validação.
// O valor internamente nunca é arredondado — só a apresentação muda: 2 casas
// no modo normal (moeda), 8 no modo "científico", para conferir o resultado
// exato de divisões que não fecham redondo (ex.: valor / 48 parcelas).
const CasasDecimaisContext = createContext(2);
const useCasasDecimais = () => useContext(CasasDecimaisContext);

function formatCurrency(value: number, casas = 2): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// ── Escala tipográfica da tabela ────────────────────────────────────────────
// Um único lugar decide tamanho/tom de cada papel de célula. Antes cada coluna
// escolhia o seu (zinc-100/300/500, com e sem prefixo "R$"), o que fazia colunas
// de mesmo tipo parecerem informações de níveis diferentes.
const CELL_PAD = 'px-3 py-2.5';
// Cada <td>/<th> marcado com isto reivindica só a largura do próprio conteúdo
// (o hack padrão de table-layout:auto: width:1px + nowrap). Sem essa marca o
// navegador reparte a sobra de largura da tabela IGUALMENTE entre todas as
// colunas — inclusive "Vagas" com um "1" dentro, que ficava tão larga quanto
// "Descrição". Só a Descrição (w-full) deve herdar essa sobra; todo o resto
// aqui é CELL_TIGHT.
const CELL_TIGHT = 'w-px whitespace-nowrap';
// Os imóveis já digitados viram sugestão nos campos da coluna Imóvel. O vínculo
// com o cadastro da Tabela Corretor é POR NOME, então um 'Allure ' com espaço
// sobrando quebraria a ligação em silêncio — a lista existe para que a segunda
// unidade do mesmo imóvel seja escolhida, não redigitada.
const IMOVEIS_DATALIST_ID = 'sienge-imoveis-cadastrados';
const TXT_PRIMARY = 'text-xs font-semibold text-zinc-100 tabular-nums';   // unidade, valor de tabela
const TXT_VALUE = 'text-xs text-zinc-300 tabular-nums';                   // demais números (digitados ou calculados)
const TXT_MUTED = 'text-xs text-zinc-500';                                // texto livre, descrição
const TXT_EMPTY = 'text-xs text-zinc-700';                                // placeholder "—"
const TXT_UNIT = 'text-[10px] font-medium text-zinc-500 shrink-0';        // sufixos/prefixos R$, m²
const TXT_HEAD = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider';

// Largura dos <input> acompanha o conteúdo, em `ch` (a fonte é tabular-nums,
// então 1ch = exatamente a largura de um dígito e a conta bate). Antes eram
// classes fixas (w-24/w-16) dimensionadas pro pior caso: uma coluna de "3" ou
// "1" reservava espaço de um valor em reais, abrindo lacunas enormes entre
// colunas estreitas. O `min` evita que uma coluna vazia colapse a ponto de não
// dar pra clicar, e o placeholder entra na conta pra não ficar cortado.
function chWidth(text: string, placeholder: string, min: number): React.CSSProperties {
  return { width: `${Math.max(text.length, placeholder.length, min)}ch` };
}

// Valor monetário somente leitura (colunas calculadas) com o mesmo prefixo "R$"
// discreto usado nos campos editáveis — antes vinha do formatCurrency, que
// imprimia "R$" no mesmo tamanho do número e destoava das colunas vizinhas.
function MoneyText({ value }: { value: number }) {
  const casas = useCasasDecimais();
  if (!(value > 0)) return <span className={TXT_EMPTY}>—</span>;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={TXT_UNIT}>R$</span>
      <span className={TXT_VALUE}>{value.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}</span>
    </span>
  );
}

// Coluna espelho das validações configuradas em "Validar Tabela": aplica a
// mesma fórmula (calc) para a unidade da linha, para cada validação do tipo,
// e resume num badge — OK só se todas baterem, senão mostra quantas falharam
// (tooltip lista a diferença de cada uma, já que pode haver mais de uma).
function ValidacaoStatusCell<V extends { diferenca: number }>({
  item, validacoesList, calc, regras,
}: {
  item: SiengeTabelaVendaUnidade;
  validacoesList: SiengeValidacao[];
  calc: (item: SiengeTabelaVendaUnidade, v: SiengeValidacao, regras: SiengeCalculoRegra[]) => V;
  regras: SiengeCalculoRegra[];
}) {
  const casas = useCasasDecimais();
  if (validacoesList.length === 0) {
    return <td className={`${CELL_PAD} ${TXT_EMPTY} ${CELL_TIGHT}`}>—</td>;
  }
  const resultados = validacoesList.map(v => ({ v, r: calc(item, v, regras) }));
  const pendentes = resultados.filter(({ r }) => !isDiferencaOk(r.diferenca));
  const ok = pendentes.length === 0;
  const title = resultados
    .map(({ v, r }) => `${v.titulo || 'Validação'}: ${r.diferenca >= 0 ? '+' : ''}${formatCurrency(r.diferenca, casas)}`)
    .join('\n');
  // A diferença em si diz quanto falta ajustar; "1 pendente" só dizia que
  // havia algo errado, sem dar a pista do valor. Com mais de uma validação
  // pendente, mostra a de maior desvio (a que mais precisa de atenção) e o
  // "+N" avisa que há outras — o detalhe completo de cada uma fica no tooltip.
  const pior = pendentes.reduce<typeof pendentes[number] | null>(
    (worst, p) => (!worst || Math.abs(p.r.diferenca) > Math.abs(worst.r.diferenca) ? p : worst),
    null
  );
  return (
    <td className={`${CELL_PAD} ${CELL_TIGHT}`} title={title}>
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap tabular-nums ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
        {ok ? <ShieldCheck size={13} /> : <AlertTriangle size={13} className="shrink-0" />}
        {ok ? 'OK' : (
          <>
            {pior!.r.diferenca >= 0 ? '+' : ''}{formatCurrency(pior!.r.diferenca, casas)}
            {pendentes.length > 1 && <span className="text-red-400/70">+{pendentes.length - 1}</span>}
          </>
        )}
      </span>
    </td>
  );
}

// Texto editável (dirty state comparado ao valor salvo) para uma coluna
// dinâmica — moeda usa máscara de centavos, número usa decimal livre, texto é livre.
// `casas` só se aplica fora de edição (ver VendaRow) — a máscara de centavos do
// campo moeda assume 2 casas em qualquer dígito novo, então mostrar 8 casas
// enquanto editável faria o próximo caractere digitado corromper o valor.
function campoToText(coluna: SiengeTabelaVendaColuna, value: number | string | undefined, casas = 2): string {
  if (coluna.tipo === 'texto') return value != null ? String(value) : '';
  const n = typeof value === 'number' ? value : parseBrNumber(String(value ?? '0'));
  if (!n) return '';
  return coluna.tipo === 'moeda'
    ? n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function campoFromText(coluna: SiengeTabelaVendaColuna, text: string): number | string {
  if (coluna.tipo === 'texto') return text;
  return coluna.tipo === 'moeda' ? parseCurrencyInput(text) : parseDecimalInput(text);
}

// Badge de situação: mesma caixa para todos os estados (min-w + centralizado),
// para a coluna não ficar serrilhada conforme o tamanho da palavra.
const BADGE_CLASS = 'inline-flex items-center justify-center min-w-[76px] text-[10px] font-semibold uppercase tracking-wide rounded-md border px-2 py-1';

// Estrutura da linha (cantos, bordas, transição). A cor vem do mapa abaixo.
// A borda esquerda é 2px porque é ela que carrega o acento de situação — é o
// sinal que se lê varrendo a coluna, sem precisar ler o badge de cada linha.
const ROW_CLASS = '[&>td]:border-y [&>td]:transition-colors [&>td]:duration-150 [&>td:first-child]:border-l-2 [&>td:first-child]:rounded-l-lg [&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg';

// Tingimento por situação — deliberadamente no limite do perceptível (~5% de
// opacidade). "Vendida" fica neutra de propósito: costuma ser a maioria das
// linhas, e tingir a maioria anularia o contraste justamente das poucas que
// pedem atenção; ela é identificada só pelo acento à esquerda. "Bloqueada" vai
// no sentido oposto — mais escura que o fundo padrão — para recuar.
const ROW_SITUACAO_CLASS: Record<SiengeVendaSituacao, string> = {
  disponivel: '[&>td]:bg-blue-500/[0.055] [&>td]:border-blue-500/15 [&>td:first-child]:border-l-blue-500/60 hover:[&>td]:bg-blue-500/[0.09]',
  reservado: '[&>td]:bg-amber-500/[0.055] [&>td]:border-amber-500/15 [&>td:first-child]:border-l-amber-500/60 hover:[&>td]:bg-amber-500/[0.09]',
  vendida: '[&>td]:bg-zinc-900/40 [&>td]:border-zinc-800/50 [&>td:first-child]:border-l-emerald-500/40 hover:[&>td]:bg-zinc-900/70',
  permuta: '[&>td]:bg-violet-500/[0.055] [&>td]:border-violet-500/15 [&>td:first-child]:border-l-violet-500/60 hover:[&>td]:bg-violet-500/[0.09]',
  bloqueada: '[&>td]:bg-zinc-950/70 [&>td]:border-zinc-800/40 [&>td:first-child]:border-l-zinc-600 hover:[&>td]:bg-zinc-900/60',
};
const NEW_ROW_CLASS = '[&>td]:bg-zinc-900/30 [&>td]:border-y [&>td]:border-dashed [&>td]:border-zinc-800/60 [&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg [&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg';

// readOnly em vez de disabled: com o toggle desligado o valor continua
// selecionável para copiar, só não aceita digitação.
const RO = (editavel: boolean) => (editavel ? '' : 'cursor-default select-text');

function DynamicCell({ coluna, text, editavel, casas, onChange, onCommit }: { coluna: SiengeTabelaVendaColuna; text: string; editavel: boolean; casas: number; onChange: (v: string) => void; onCommit: () => void }) {
  if (coluna.tipo === 'texto') {
    return (
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <input
          type="text"
          value={text}
          readOnly={!editavel}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCommit(); }}
          placeholder="—"
          style={chWidth(text, '—', 4)}
          className={`shrink-0 bg-transparent ${TXT_MUTED} placeholder-zinc-700 outline-none ${RO(editavel)}`}
        />
      </td>
    );
  }
  if (coluna.tipo === 'moeda') {
    return (
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <div className="inline-flex items-baseline gap-1">
          <span className={TXT_UNIT}>R$</span>
          <input
            type="text"
            inputMode="numeric"
            value={text}
            readOnly={!editavel}
            onChange={e => onChange(formatCurrencyInput(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') onCommit(); }}
            placeholder="0,00"
            style={chWidth(text, '0,00', casas > 2 ? 12 : 8)}
            className={`shrink-0 bg-transparent ${TXT_VALUE} placeholder-zinc-700 outline-none ${RO(editavel)}`}
          />
        </div>
      </td>
    );
  }
  if (coluna.tipo === 'area') {
    return (
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <div className="inline-flex items-baseline gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={text}
            readOnly={!editavel}
            onChange={e => onChange(formatDecimalInput(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') onCommit(); }}
            placeholder="0"
            style={chWidth(text, '0', 4)}
            className={`shrink-0 bg-transparent ${TXT_VALUE} placeholder-zinc-700 outline-none ${RO(editavel)}`}
          />
          <span className={TXT_UNIT}>m²</span>
        </div>
      </td>
    );
  }
  return (
    <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={!editavel}
        onChange={e => onChange(formatDecimalInput(e.target.value))}
        onKeyDown={e => { if (e.key === 'Enter') onCommit(); }}
        placeholder="0"
        style={chWidth(text, '0', 3)}
        className={`bg-transparent ${TXT_VALUE} placeholder-zinc-700 outline-none ${RO(editavel)}`}
      />
    </td>
  );
}


function VendaRow({ item, index, colunas, merged, regras, validacoesParcelas, validacoesValorUnidade, mostrarValidacao, terceiros, editavel, podeExcluir, onSave, onDelete, onHistorico }: {
  item: SiengeTabelaVendaUnidade;
  index: number;
  colunas: SiengeTabelaVendaColuna[];
  merged: ColunaOuRegra[];
  regras: SiengeCalculoRegra[];
  validacoesParcelas: SiengeValidacao[];
  validacoesValorUnidade: SiengeValidacao[];
  mostrarValidacao: boolean;
  terceiros: boolean;
  editavel: boolean;
  onSave: (item: SiengeTabelaVendaUnidade) => void;
  onDelete: (id: string) => void;
  podeExcluir?: boolean;
  onHistorico: (item: SiengeTabelaVendaUnidade) => void;
}) {
  // Com edição livre ligada o campo é sempre um input ativo (máscara de
  // centavos ao digitar) — 2 casas ali, sempre. Só em modo leitura (edição
  // desligada) o valor exibido acompanha o toggle científico, já que nesse
  // caso o campo nunca vai receber uma tecla que reinterprete o texto.
  const casas = useCasasDecimais();
  const displayCasas = editavel ? 2 : casas;
  const savedValorText = item.valorTabela ? item.valorTabela.toLocaleString('pt-BR', { minimumFractionDigits: displayCasas, maximumFractionDigits: displayCasas }) : '';
  const savedCampos = Object.fromEntries(colunas.map(c => [c.key, campoToText(c, item.camposExtra[c.key], displayCasas)]));

  const [unidadeText, setUnidadeText] = useState(item.unidade);
  const [imovelText, setImovelText] = useState(item.imovel || '');
  const [valorText, setValorText] = useState(savedValorText);
  const [camposText, setCamposText] = useState<Record<string, string>>(savedCampos);
  const [descricaoText, setDescricaoText] = useState(item.descricao || '');

  useEffect(() => {
    setUnidadeText(item.unidade);
    setImovelText(item.imovel || '');
    setValorText(savedValorText);
    setCamposText(savedCampos);
    setDescricaoText(item.descricao || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.unidade, item.imovel, item.valorTabela, item.camposExtra, item.descricao, colunas, displayCasas]);

  const dirty = unidadeText !== item.unidade || valorText !== savedValorText
    || imovelText !== (item.imovel || '')
    || descricaoText !== (item.descricao || '')
    || colunas.some(c => camposText[c.key] !== savedCampos[c.key]);

  const valorTabela = parseCurrencyInput(valorText);
  const camposExtra: Record<string, number | string> = {};
  colunas.forEach(c => { camposExtra[c.key] = campoFromText(c, camposText[c.key] || ''); });
  const draftItem: SiengeTabelaVendaUnidade = { ...item, valorTabela, camposExtra };

  // A situação não é mais editada aqui: ela sai do painel "Alterar Situação",
  // que exige motivo e — em venda/permuta — comprador. Editar a célula
  // direto burlaria o registro que alimenta o histórico e o orçamento real.
  const commit = () => {
    if (!unidadeText.trim()) return;
    onSave({ ...draftItem, unidade: unidadeText.trim(), imovel: imovelText.trim() || null, descricao: descricaoText.trim() || null, updatedAt: new Date().toISOString() });
  };

  return (
    <tr
      className={`group animate-row-in ${ROW_CLASS} ${ROW_SITUACAO_CLASS[item.situacao]}`}
      // Escalonamento curto e com teto: as primeiras linhas entram em cascata,
      // o resto aparece junto — uma tabela de 200 unidades não pode levar
      // segundos para terminar de se montar.
      style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
    >
      {terceiros && (
        <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
          <input
            type="text"
            list={IMOVEIS_DATALIST_ID}
            value={imovelText}
            readOnly={!editavel}
            onChange={e => setImovelText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); }}
            placeholder="Imóvel"
            style={chWidth(imovelText, 'Imóvel', 8)}
            className={`bg-transparent ${TXT_VALUE} placeholder-zinc-700 outline-none ${RO(editavel)}`}
          />
        </td>
      )}
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <input
          type="text"
          value={unidadeText}
          readOnly={!editavel}
          onChange={e => setUnidadeText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          style={chWidth(unidadeText, '', 4)}
          className={`bg-transparent ${TXT_PRIMARY} placeholder-zinc-700 outline-none ${RO(editavel)}`}
        />
      </td>
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <div className="inline-flex items-baseline gap-1">
          <span className={TXT_UNIT}>R$</span>
          <input
            type="text"
            inputMode="numeric"
            value={valorText}
            readOnly={!editavel}
            onChange={e => setValorText(formatCurrencyInput(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') commit(); }}
            placeholder="0,00"
            style={chWidth(valorText, '0,00', displayCasas > 2 ? 12 : 8)}
            className={`shrink-0 bg-transparent ${TXT_PRIMARY} placeholder-zinc-700 outline-none ${RO(editavel)}`}
          />
        </div>
      </td>
      {merged.map(m => m.kind === 'coluna' ? (
        <DynamicCell
          key={`c-${m.item.id}`}
          coluna={m.item}
          text={camposText[m.item.key] || ''}
          editavel={editavel}
          casas={displayCasas}
          onChange={v => setCamposText(prev => ({ ...prev, [m.item.key]: v }))}
          onCommit={commit}
        />
      ) : (
        <td key={`r-${m.item.id}`} className={`${CELL_PAD} ${CELL_TIGHT}`}>
          <MoneyText value={calcRegraValor(draftItem, m.item)} />
        </td>
      ))}
      {mostrarValidacao && (
        <>
          <ValidacaoStatusCell item={draftItem} validacoesList={validacoesParcelas} calc={calcValidacaoParcelas} regras={regras} />
          <ValidacaoStatusCell item={draftItem} validacoesList={validacoesValorUnidade} calc={calcValidacaoValorUnidade} regras={regras} />
        </>
      )}
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <span
          title={item.situacaoMotivo || 'Alterada pelo painel "Alterar Situação"'}
          className={`${BADGE_CLASS} ${SITUACAO_STYLES[item.situacao]}`}
        >
          {SITUACAO_LABELS[item.situacao]}
        </span>
      </td>
      <td className={`${CELL_PAD} w-full min-w-[180px]`}>
        <input
          type="text"
          value={descricaoText}
          readOnly={!editavel}
          onChange={e => setDescricaoText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder="—"
          className={`w-full min-w-0 bg-transparent ${TXT_MUTED} placeholder-zinc-700 outline-none ${RO(editavel)}`}
        />
      </td>
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onHistorico(item)}
            title="Histórico de situação da unidade"
            className="p-1 text-zinc-500 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
          >
            <History size={12} />
          </button>
          {editavel && dirty && (
            <button
              type="button"
              onClick={commit}
              title="Salvar"
              className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 text-white shadow-md shadow-black/40 hover:bg-blue-400 active:scale-95 transition-all animate-fade-in"
            >
              <Check size={11} strokeWidth={3} />
            </button>
          )}
          {editavel && podeExcluir && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              title="Remover unidade"
              className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function NewUnidadeRow({ projectId, versaoId, colunas, merged, mostrarValidacao, terceiros, existingUnidades, onSave, onCancel }: {
  projectId: string;
  versaoId: string;
  colunas: SiengeTabelaVendaColuna[];
  merged: ColunaOuRegra[];
  mostrarValidacao: boolean;
  terceiros: boolean;
  existingUnidades: string[];
  onSave: (item: SiengeTabelaVendaUnidade) => void;
  onCancel: () => void;
}) {
  const [unidadeText, setUnidadeText] = useState('');
  const [imovelText, setImovelText] = useState('');
  const [valorText, setValorText] = useState('');
  const [camposText, setCamposText] = useState<Record<string, string>>({});
  const [descricaoText, setDescricaoText] = useState('');
  // Unidade nova entra sempre como disponível; qualquer outra situação passa
  // pelo painel "Alterar Situação", que exige motivo.
  const situacao: SiengeVendaSituacao = 'disponivel';

  const trimmed = unidadeText.trim();
  const duplicate = trimmed.length > 0 && existingUnidades.includes(trimmed);
  const canAdd = trimmed.length > 0 && !duplicate;

  const add = () => {
    if (!canAdd) return;
    const camposExtra: Record<string, number | string> = {};
    colunas.forEach(c => { camposExtra[c.key] = campoFromText(c, camposText[c.key] || ''); });
    onSave({
      id: crypto.randomUUID(),
      projectId,
      versaoId,
      unidade: trimmed,
      imovel: imovelText.trim() || null,
      valorTabela: parseCurrencyInput(valorText),
      camposExtra,
      // Sem margem por padrão: unidade nova reajusta o valor cheio até alguém
      // definir a margem no painel "Margem".
      margens: {},
      situacao,
      descricao: descricaoText.trim() || null,
      compradorAtual: null,
      situacaoMotivo: null,
      frozenSince: null,
      vendaConfirmadaEm: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    onCancel();
  };

  return (
    <tr className={NEW_ROW_CLASS}>
      {terceiros && (
        <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
          <input
            type="text"
            list={IMOVEIS_DATALIST_ID}
            value={imovelText}
            onChange={e => setImovelText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="Imóvel"
            className={`w-28 bg-transparent ${TXT_VALUE} placeholder-zinc-700 outline-none`}
          />
        </td>
      )}
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <input
          type="text"
          value={unidadeText}
          onChange={e => setUnidadeText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Nova unidade"
          className={`w-20 bg-transparent ${TXT_PRIMARY} placeholder-zinc-700 outline-none`}
        />
      </td>
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <div className="inline-flex items-baseline gap-1">
          <span className={TXT_UNIT}>R$</span>
          <input
            type="text"
            inputMode="numeric"
            value={valorText}
            onChange={e => setValorText(formatCurrencyInput(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="0,00"
            style={chWidth(valorText, '0,00', 8)}
            className={`shrink-0 bg-transparent ${TXT_PRIMARY} placeholder-zinc-700 outline-none`}
          />
        </div>
      </td>
      {merged.map(m => m.kind === 'coluna' ? (
        <DynamicCell
          key={`c-${m.item.id}`}
          coluna={m.item}
          text={camposText[m.item.key] || ''}
          casas={2}
          editavel
          onChange={v => setCamposText(prev => ({ ...prev, [m.item.key]: v }))}
          onCommit={add}
        />
      ) : (
        <td key={`r-${m.item.id}`} className={`${CELL_PAD} ${TXT_EMPTY} ${CELL_TIGHT}`}>—</td>
      ))}
      {mostrarValidacao && (
        <>
          <td className={`${CELL_PAD} ${TXT_EMPTY} ${CELL_TIGHT}`}>—</td>
          <td className={`${CELL_PAD} ${TXT_EMPTY} ${CELL_TIGHT}`}>—</td>
        </>
      )}
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <span className={`${BADGE_CLASS} ${SITUACAO_STYLES[situacao]}`}>
          {SITUACAO_LABELS[situacao]}
        </span>
      </td>
      <td className={`${CELL_PAD} w-full min-w-[180px]`}>
        <input
          type="text"
          value={descricaoText}
          onChange={e => setDescricaoText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="—"
          className={`w-full min-w-0 bg-transparent ${TXT_MUTED} placeholder-zinc-700 outline-none`}
        />
      </td>
      <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            title={duplicate ? 'Já existe uma unidade com esse nome' : 'Adicionar unidade'}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-md transition-colors"
          >
            <Plus size={11} strokeWidth={3} /> Adicionar
          </button>
          <button
            type="button"
            onClick={onCancel}
            title="Cancelar"
            className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

export default function SiengeVendasTable({ projectId, versaoId, unidades, allUnidadeNames, colunas, regras, validacoes, mostrarValidacao, terceiros, editavel, podeExcluir, onSave, onDelete, onSaveColuna, onSaveRegra }: SiengeVendasTableProps) {
  const [addingNew, setAddingNew] = useState(false);
  const [historicoDe, setHistoricoDe] = useState<SiengeTabelaVendaUnidade | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overSide, setOverSide] = useState<'before' | 'after'>('before');
  // Modo científico: nada internamente é arredondado a 2 casas (a Tabela de
  // Vendas guarda e calcula com a precisão total do float), esse toggle só
  // troca quantas casas a apresentação mostra — 2 por padrão (moeda), 8 pra
  // conferir o resultado exato de uma divisão que não fecha redondo.
  const [modoCientifico, setModoCientifico] = useState(false);
  const casasDecimais = modoCientifico ? 8 : 2;
  const merged = mergeColunasRegras(colunas, regras);
  // Em terceiros a tabela agrupa por imóvel antes de ordenar pela unidade: as
  // linhas de um mesmo imóvel são um bloco, e alfabetar só por unidade
  // intercalaria imóveis diferentes. Sem imóvel a linha vai para o fim, onde
  // se vê que falta preencher.
  const sorted = [...unidades].sort((a, b) => {
    if (terceiros) {
      const ia = a.imovel?.trim() || '￿';
      const ib = b.imovel?.trim() || '￿';
      const porImovel = ia.localeCompare(ib, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (porImovel !== 0) return porImovel;
    }
    return a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true });
  });

  // Nomes já usados, para a datalist dos campos de imóvel.
  const imoveisConhecidos = terceiros
    ? [...new Set(unidades.map(u => u.imovel?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    : [];
  const validacoesParcelas = validacoes.filter(v => v.tipo === 'parcelas');
  const validacoesValorUnidade = validacoes.filter(v => v.tipo === 'valor_unidade');
  const validacaoCols = mostrarValidacao ? 2 : 0;

  const totalCols = 3 + merged.length + validacaoCols + 2 + (terceiros ? 1 : 0); // unidade + valor + actions... usado no colSpan da linha "adicionar"
  const sumValor = sum(sorted.map(u => u.valorTabela));

  const resetDrag = () => { setDragIndex(null); setOverIndex(null); };

  // Reordenar coluna reescreve o sortOrder de todas — é edição estrutural e
  // segue a mesma trava do resto da tabela.
  const handleDrop = () => {
    if (!editavel || dragIndex === null || overIndex === null) { resetDrag(); return; }
    let dropIndex = overSide === 'after' ? overIndex + 1 : overIndex;
    if (dragIndex < dropIndex) dropIndex -= 1;
    reorderMerged(merged, dragIndex, dropIndex, onSaveColuna, onSaveRegra);
    resetDrag();
  };

  // sticky vai no <th>, não no <thead> — Safari nunca suportou sticky em
  // thead/tr de forma confiável, só em th/td diretamente. overflow-y-visible
  // no wrapper é essencial: só overflow-x-auto já faz o navegador computar
  // overflow-y como "auto" por baixo dos panos, o que transformaria esta div
  // num contêiner de scroll próprio — e o sticky gruda no contêiner mais
  // próximo que rola, não no mais distante (o painel do modal). Sem essa
  // linha o cabeçalho nunca congelaria.
  const TH_STICKY = 'sticky top-0 z-10 bg-[#08080a] shadow-[0_1px_0_0] shadow-zinc-800';
  return (
    <CasasDecimaisContext.Provider value={casasDecimais}>
    <div className="overflow-x-auto overflow-y-visible custom-scrollbar">
      <div className="flex justify-end px-1 pb-2">
        <button
          type="button"
          onClick={() => setModoCientifico(v => !v)}
          title={modoCientifico ? 'Voltar para 2 casas decimais' : 'Ver 8 casas decimais (modo científico)'}
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
            modoCientifico
              ? 'text-blue-300 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'
              : 'text-zinc-500 bg-zinc-900/60 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
          }`}
        >
          <Microscope size={12} />
          {modoCientifico ? '0,00000000' : '0,00 ›'}
        </button>
      </div>
      {imoveisConhecidos.length > 0 && (
        <datalist id={IMOVEIS_DATALIST_ID}>
          {imoveisConhecidos.map(nome => <option key={nome} value={nome} />)}
        </datalist>
      )}
      <table className="w-full border-separate border-spacing-y-1">
        <thead>
          <tr>
            {terceiros && <th className={`text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT}`}>Imóvel</th>}
            <th className={`text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT}`}>Unidade</th>
            <th className={`text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT}`}>Valor da Unidade</th>
            {merged.map((m, idx) => (
              <th
                key={`${m.kind}-${m.item.id}`}
                draggable={editavel}
                onDragStart={e => { if (!editavel) return; setDragIndex(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); }}
                onDragOver={e => {
                  e.preventDefault();
                  if (!editavel || dragIndex === null) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const side = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after';
                  setOverIndex(idx);
                  setOverSide(side);
                }}
                onDrop={e => { e.preventDefault(); handleDrop(); }}
                onDragEnd={resetDrag}
                title={editavel ? 'Arraste para reordenar a coluna' : 'Ative a edição livre para reordenar'}
                className={`group relative text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT} select-none transition-opacity ${editavel ? 'cursor-grab active:cursor-grabbing' : ''} ${dragIndex === idx ? 'opacity-30' : ''}`}
              >
                {dragIndex !== null && overIndex === idx && dragIndex !== idx && (
                  <span
                    className={`absolute top-0 bottom-0 w-0.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)] transition-all duration-150 ${overSide === 'before' ? 'left-0' : 'right-0'}`}
                  />
                )}
                <span className="inline-flex items-center gap-1">
                  {editavel && <GripVertical size={12} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />}
                  {m.kind === 'coluna' ? m.item.label : m.item.titulo}
                </span>
              </th>
            ))}
            {mostrarValidacao && (
              <>
                <th className={`text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT}`}>Validar Parcelas</th>
                <th className={`text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT}`}>Validar Valor da Unidade</th>
              </>
            )}
            <th className={`text-left px-3 py-1.5 ${TXT_HEAD} ${TH_STICKY} ${CELL_TIGHT}`}>Situação</th>
            {/* w-full: a Descrição absorve toda a sobra de largura da tabela —
                é a única coluna sem CELL_TIGHT, então é ela quem recebe o que
                as demais deixam de reivindicar. */}
            <th className={`text-left px-3 py-1.5 w-full ${TXT_HEAD} ${TH_STICKY}`}>Descrição</th>
            <th className={`px-3 py-1 ${TH_STICKY} ${CELL_TIGHT}`} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => (
            <VendaRow
              key={item.id}
              item={item}
              index={idx}
              colunas={colunas}
              merged={merged}
              regras={regras}
              validacoesParcelas={validacoesParcelas}
              validacoesValorUnidade={validacoesValorUnidade}
              mostrarValidacao={mostrarValidacao}
              terceiros={terceiros}
              editavel={editavel}
              onSave={onSave}
              onDelete={onDelete}
              podeExcluir={podeExcluir}
              onHistorico={setHistoricoDe}
            />
          ))}
          {editavel && (addingNew ? (
            <NewUnidadeRow
              projectId={projectId}
              versaoId={versaoId}
              colunas={colunas}
              merged={merged}
              mostrarValidacao={mostrarValidacao}
              terceiros={terceiros}
              existingUnidades={allUnidadeNames}
              onSave={onSave}
              onCancel={() => setAddingNew(false)}
            />
          ) : (
            <tr>
              <td colSpan={totalCols} className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Plus size={12} strokeWidth={3} /> Adicionar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr className="[&>td]:bg-zinc-900/70 [&>td]:border-y [&>td]:border-zinc-800 [&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg [&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg">
              {/* Sob filtro a soma é das linhas visíveis, não do empreendimento.
                  Sem dizer isso, um total financeiro menor passaria por total real. */}
              {terceiros && <td className={`${CELL_PAD}`} />}
              <td className={`${CELL_PAD} ${TXT_HEAD} ${CELL_TIGHT}`}>
                {sorted.length < allUnidadeNames.length ? `Soma (${sorted.length} de ${allUnidadeNames.length})` : 'Soma'}
              </td>
              <td className={`${CELL_PAD} ${CELL_TIGHT}`}>
                {sumValor > 0 ? (
                  <span className="inline-flex items-baseline gap-1">
                    <span className={TXT_UNIT}>R$</span>
                    <span className={TXT_PRIMARY}>{sumValor.toLocaleString('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais })}</span>
                  </span>
                ) : <span className={TXT_EMPTY}>—</span>}
              </td>
              <td className={`${CELL_PAD} ${TXT_EMPTY}`} colSpan={merged.length + validacaoCols + 3} />
            </tr>
          </tfoot>
        )}
      </table>
      {sorted.length === 0 && (
        // allUnidadeNames traz o empreendimento inteiro, sem filtro: se ele tem
        // unidades e a lista veio vazia, quem esvaziou foi a busca/filtro — dizer
        // "nada cadastrado" aqui mandaria o usuário procurar um problema que não
        // existe.
        <p className={`${TXT_MUTED} text-center py-8 animate-fade-in`}>
          {allUnidadeNames.length > 0
            ? 'Nenhuma unidade corresponde à busca ou ao filtro de situação.'
            : 'Nenhuma unidade cadastrada para este empreendimento ainda.'}
        </p>
      )}
      {historicoDe && (
        <UnidadeHistoricoModal
          projectId={historicoDe.projectId}
          unidade={historicoDe.unidade}
          onClose={() => setHistoricoDe(null)}
        />
      )}
    </div>
    </CasasDecimaisContext.Provider>
  );
}

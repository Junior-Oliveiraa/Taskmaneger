import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';
import {
  Project, SiengeProjectDisplay, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao, SiengeVendaSituacao,
} from '../../types';
import { SITUACAO_LABELS } from '../../lib/siengeVendasTabela';
import { fetchCrmLeads } from '../../lib/crmApi';
import {
  ComercialProposta, PropostaAutorizacao, PropostaParcela, calcularAutorizacao, criarProposta, fetchComercialMovimentos,
} from '../../lib/comercialApi';
import { Campo, CrmButton, inputCls, selectCls } from '../crm/CrmShared';

const SITUACOES_PROPOSTA: SiengeVendaSituacao[] = ['disponivel', 'reservado'];

const numeroBr = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moedaBr = (v: number) => `R$ ${numeroBr(v)}`;
const percentualBr = (v: number) => `${numeroBr(v)}%`;
// Datas puras: formatadas sem passar por Date, que as leria como UTC.
const dataBr = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (iso: string) => {
  const [ano, mes] = iso.split('-');
  return ano && mes ? `${MESES[Number(mes) - 1]}/${ano.slice(2)}` : '—';
};

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Digita-se da direita para a esquerda, em centavos: "5572501" vira 55.725,01.
function ValorInput({ value, onChange, placeholder = '0,00' }: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="numeric"
      className={`${inputCls} text-right tabular-nums`}
      placeholder={placeholder}
      value={value === null ? '' : numeroBr(value)}
      onChange={e => {
        const digitos = e.target.value.replace(/\D/g, '');
        onChange(digitos ? Number(digitos) / 100 : null);
      }}
    />
  );
}

function Calculado({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={`px-2.5 py-1.5 rounded-md border text-xs text-right tabular-nums ${
        destaque ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-200 font-semibold' : 'border-zinc-900 bg-zinc-950/60 text-zinc-300'
      }`}>
        {valor}
      </span>
    </div>
  );
}

interface LinhaForm {
  id: string;
  descricao: string;
  quantidade: number | null;
  valorUnitario: number | null;
  primeiroVencimento: string;
  atualizacao: PropostaParcela['atualizacao'];
}

const novaLinha = (descricao: string, quantidade: number | null, atualizacao: PropostaParcela['atualizacao']): LinhaForm => ({
  id: crypto.randomUUID(), descricao, quantidade, valorUnitario: null, primeiroVencimento: '', atualizacao,
});

const linhasIniciais = () => [
  novaLinha('Sinal', 1, 'FIXA'),
  novaLinha('Mensal', null, 'INCC'),
  novaLinha('Semestral', null, 'INCC'),
  novaLinha('Antecipação', 1, 'INCC'),
  novaLinha('Financiamento Bancário', 1, 'INCC'),
];

// Linha sem valor é modelo não usado (nem toda proposta tem semestral) e fica de fora.
const linhaUsada = (l: LinhaForm) => !!l.valorUnitario;

interface Props {
  projects: Project[];
  projectDisplays: SiengeProjectDisplay[];
  unidades: SiengeTabelaVendaUnidade[];
  versoes: SiengeTabelaVendaVersao[];
  colunas: SiengeTabelaVendaColuna[];
  propostas: ComercialProposta[];
  onClose: () => void;
}

export default function NovaPropostaModal({ projects, projectDisplays, unidades, versoes, colunas, propostas, onClose }: Props) {
  const queryClient = useQueryClient();
  const movimentos = useQuery({ queryKey: ['comercialMovimentos'], queryFn: fetchComercialMovimentos, staleTime: 30_000 }).data ?? [];
  const leads = useQuery({ queryKey: ['crmLeads'], queryFn: fetchCrmLeads, staleTime: 30_000 }).data ?? [];

  const [projectId, setProjectId] = useState('');
  const [torre, setTorre] = useState('Única');
  const [unidadeId, setUnidadeId] = useState('');
  const [dataContrato, setDataContrato] = useState(hoje().slice(0, 7));
  const [cliente, setCliente] = useState('');
  const [corretor, setCorretor] = useState('');
  const [imobiliaria, setImobiliaria] = useState('');
  const [emails, setEmails] = useState('');
  const [vigenciaTabela, setVigenciaTabela] = useState('');
  const [areaPrivativa, setAreaPrivativa] = useState<number | null>(null);
  const [valorTabela, setValorTabela] = useState<number | null>(null);
  const [formaSinal, setFormaSinal] = useState('');
  const [linhas, setLinhas] = useState<LinhaForm[]>(linhasIniciais);
  const [observacoes, setObservacoes] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Mesmo recorte do formulário do Início: versão principal, sem empreendimentos ocultos.
  const unidadesPrincipais = useMemo(() => {
    const principais = new Set(versoes.filter(v => v.principal).map(v => v.id));
    const ocultos = new Set(projectDisplays.filter(d => d.hidden).map(d => d.projectId));
    return unidades.filter(u => principais.has(u.versaoId) && !ocultos.has(u.projectId));
  }, [unidades, versoes, projectDisplays]);

  const projetosComTabela = useMemo(() => {
    const ids = new Set(unidadesPrincipais.map(u => u.projectId));
    return projects.filter(p => ids.has(p.id));
  }, [projects, unidadesPrincipais]);

  const unidadesElegiveis = useMemo(
    () => unidadesPrincipais
      .filter(u => u.projectId === projectId && SITUACOES_PROPOSTA.includes(u.situacao))
      .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true })),
    [unidadesPrincipais, projectId]
  );

  const corretores = useMemo(
    () => Array.from(new Set([...movimentos, ...propostas].map(m => m.corretor))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [movimentos, propostas]
  );
  const imobiliarias = useMemo(
    () => Array.from(new Set([...movimentos, ...propostas].map(m => m.imobiliaria).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [movimentos, propostas]
  );
  const clientes = useMemo(() => Array.from(new Set(leads.map(l => l.nome))).slice(0, 200), [leads]);

  const escolherUnidade = (id: string) => {
    setUnidadeId(id);
    const u = unidadesElegiveis.find(x => x.id === id);
    if (!u) return;
    // Vem preenchido da Tabela de Vendas, mas continua editável.
    setValorTabela(Math.round(u.valorTabela * 100) / 100);
    const colunaArea = colunas.find(c => c.versaoId === u.versaoId && c.tipo === 'area');
    const area = colunaArea ? Number(u.camposExtra[colunaArea.key]) : NaN;
    setAreaPrivativa(Number.isFinite(area) && area > 0 ? area : null);
  };

  const alterarLinha = (id: string, campos: Partial<LinhaForm>) =>
    setLinhas(ls => ls.map(l => (l.id === id ? { ...l, ...campos } : l)));

  // Todas as linhas entram no cálculo (as vazias valem zero) para o índice bater com a tabela.
  const calculo = calcularAutorizacao({
    areaPrivativa,
    valorTabela: valorTabela ?? 0,
    parcelas: linhas.map(l => ({
      descricao: l.descricao,
      quantidade: l.quantidade ?? 0,
      valorUnitario: l.valorUnitario ?? 0,
      primeiroVencimento: l.primeiroVencimento,
      atualizacao: l.atualizacao,
    })),
  });

  const usadas = linhas.filter(linhaUsada);
  const pendencia = !projectId ? 'Escolha o empreendimento.'
    : !unidadeId ? 'Escolha a unidade.'
    : !cliente.trim() ? 'Informe o cliente.'
    : !corretor.trim() ? 'Informe o corretor.'
    : !valorTabela ? 'Informe o valor de tabela.'
    : usadas.length === 0 ? 'Preencha ao menos uma parcela.'
    : usadas.some(l => !l.descricao.trim() || !l.quantidade || !l.primeiroVencimento)
      ? 'Complete descrição, quantidade e 1º vencimento das parcelas com valor.'
    : null;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendencia || salvando) return;
    const autorizacao: PropostaAutorizacao = {
      torre: torre.trim(),
      dataContrato,
      emails: emails.trim(),
      vigenciaTabela,
      areaPrivativa,
      valorTabela: valorTabela!,
      formaPagamentoSinal: formaSinal.trim(),
      observacoes: observacoes.trim(),
      parcelas: usadas.map(l => ({
        descricao: l.descricao.trim(),
        quantidade: l.quantidade!,
        valorUnitario: l.valorUnitario!,
        primeiroVencimento: l.primeiroVencimento,
        atualizacao: l.atualizacao,
      })),
    };
    setSalvando(true);
    setErro(null);
    try {
      await criarProposta({
        projectId,
        unidadeId,
        unidade: unidadesElegiveis.find(u => u.id === unidadeId)?.unidade ?? null,
        cliente: cliente.trim(),
        corretor: corretor.trim(),
        imobiliaria: imobiliaria.trim() || null,
        fluxoPagamento: '',
        enviadaEm: hoje(),
        arquivos,
        autorizacao,
      });
      queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível salvar a proposta.');
      setSalvando(false);
    }
  };

  return (
    // Sem fechar ao clicar fora: um clique perdido apagaria a ficha inteira.
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-4">
      <form
        onSubmit={salvar}
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl border border-zinc-800 bg-[#0f0f12] shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/60 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">Nova proposta</h2>
            <p className="text-[11px] text-zinc-500">Autorização de proposta de compra e venda · Diretoria Comercial</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200" title="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal p-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Campo label="Empreendimento">
              <select className={selectCls} value={projectId} onChange={e => { setProjectId(e.target.value); setUnidadeId(''); }}>
                <option value="">Selecione…</option>
                {projetosComTabela.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Campo>
            <Campo label="Torre">
              <input className={inputCls} value={torre} onChange={e => setTorre(e.target.value)} />
            </Campo>
            <Campo
              label="Unidade"
              hint={projectId && unidadesElegiveis.length === 0 ? 'Nenhuma unidade disponível ou reservada neste empreendimento.' : undefined}
            >
              <select className={selectCls} value={unidadeId} disabled={!projectId} onChange={e => escolherUnidade(e.target.value)}>
                <option value="">{projectId ? 'Selecione…' : 'Escolha o empreendimento'}</option>
                {unidadesElegiveis.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.imovel ? `${u.imovel} · ` : ''}{u.unidade} — {SITUACAO_LABELS[u.situacao]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Data do contrato">
              <input type="month" className={inputCls} value={dataContrato} onChange={e => setDataContrato(e.target.value)} />
            </Campo>
            <Campo label="Cliente">
              <input className={inputCls} value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" list="proposta-clientes" />
              <datalist id="proposta-clientes">{clientes.map(n => <option key={n} value={n} />)}</datalist>
            </Campo>
            <Campo label="E-mails">
              <input className={inputCls} value={emails} onChange={e => setEmails(e.target.value)} placeholder="email@exemplo.com" />
            </Campo>
            <Campo label="Corretor">
              <input className={inputCls} value={corretor} onChange={e => setCorretor(e.target.value)} placeholder="Nome do corretor" list="proposta-corretores" />
              <datalist id="proposta-corretores">{corretores.map(n => <option key={n} value={n} />)}</datalist>
            </Campo>
            <Campo label="Imobiliária (opcional)">
              <input className={inputCls} value={imobiliaria} onChange={e => setImobiliaria(e.target.value)} placeholder="Nome da imobiliária" list="proposta-imobiliarias" />
              <datalist id="proposta-imobiliarias">{imobiliarias.map(n => <option key={n} value={n} />)}</datalist>
            </Campo>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-zinc-800/50">
            <Campo label="Vigência da tabela">
              <input type="month" className={inputCls} value={vigenciaTabela} onChange={e => setVigenciaTabela(e.target.value)} />
            </Campo>
            <Campo label="Área privativa (m²)">
              <ValorInput value={areaPrivativa} onChange={setAreaPrivativa} />
            </Campo>
            <Campo label="Valor de tabela (R$)">
              <ValorInput value={valorTabela} onChange={setValorTabela} />
            </Campo>
            <Calculado label="Valor contratado" valor={moedaBr(calculo.contratado)} destaque />
            <Calculado label="Valor m² tabela" valor={calculo.m2Tabela === null ? '—' : moedaBr(calculo.m2Tabela)} />
            <Calculado label="Valor m² contratado" valor={calculo.m2Contratado === null ? '—' : moedaBr(calculo.m2Contratado)} />
            <Calculado label="Diferença (R$)" valor={valorTabela ? moedaBr(calculo.difValor) : '—'} />
            <Calculado label="Diferença (%)" valor={calculo.difPercentual === null ? '—' : percentualBr(calculo.difPercentual)} />
            <Campo label="Forma de pagamento do sinal">
              <input className={inputCls} value={formaSinal} onChange={e => setFormaSinal(e.target.value)} placeholder="TED, PIX, boleto…" />
            </Campo>
          </div>

          <div className="pt-4 border-t border-zinc-800/50">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold text-zinc-200">Fluxo de pagamento</h3>
              <CrmButton size="xs" onClick={() => setLinhas(ls => [...ls, novaLinha('', 1, 'INCC')])}>
                <Plus size={11} /> Adicionar linha
              </CrmButton>
            </div>
            <div className="overflow-x-auto scrollbar-minimal">
              <table className="w-full min-w-[860px] text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 text-left">
                    <th className="pb-1.5 pr-2 font-semibold">Descrição</th>
                    <th className="pb-1.5 pr-2 font-semibold w-16">Quant.</th>
                    <th className="pb-1.5 pr-2 font-semibold w-28">Vl. unit. (R$)</th>
                    <th className="pb-1.5 pr-2 font-semibold w-28 text-right">Vl. total</th>
                    <th className="pb-1.5 pr-2 font-semibold w-32">1º venc.</th>
                    <th className="pb-1.5 pr-2 font-semibold w-20">Atualiz.</th>
                    <th className="pb-1.5 pr-2 font-semibold w-16 text-right">% item</th>
                    <th className="pb-1.5 pr-2 font-semibold w-16 text-right">% acum.</th>
                    <th className="pb-1.5 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={l.id}>
                      <td className="py-0.5 pr-2">
                        <input className={inputCls} value={l.descricao} onChange={e => alterarLinha(l.id, { descricao: e.target.value })} placeholder="Descrição" />
                      </td>
                      <td className="py-0.5 pr-2">
                        <input
                          type="number" min={1} step={1} className={`${inputCls} text-right`} value={l.quantidade ?? ''}
                          onChange={e => alterarLinha(l.id, { quantidade: e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : null })}
                        />
                      </td>
                      <td className="py-0.5 pr-2">
                        <ValorInput value={l.valorUnitario} onChange={v => alterarLinha(l.id, { valorUnitario: v })} />
                      </td>
                      <td className="py-0.5 pr-2 text-right tabular-nums text-zinc-200">{numeroBr(calculo.linhas[i].total)}</td>
                      <td className="py-0.5 pr-2">
                        <input type="date" className={inputCls} value={l.primeiroVencimento} onChange={e => alterarLinha(l.id, { primeiroVencimento: e.target.value })} />
                      </td>
                      <td className="py-0.5 pr-2">
                        <select className={selectCls} value={l.atualizacao} onChange={e => alterarLinha(l.id, { atualizacao: e.target.value as PropostaParcela['atualizacao'] })}>
                          <option value="FIXA">FIXA</option>
                          <option value="INCC">INCC</option>
                        </select>
                      </td>
                      <td className="py-0.5 pr-2 text-right tabular-nums text-zinc-400">{percentualBr(calculo.linhas[i].percentual)}</td>
                      <td className="py-0.5 pr-2 text-right tabular-nums text-zinc-400">{percentualBr(calculo.linhas[i].acumulado)}</td>
                      <td className="py-0.5 text-right">
                        <button type="button" onClick={() => setLinhas(ls => ls.filter(x => x.id !== l.id))} className="text-zinc-600 hover:text-rose-400" title="Remover linha">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-800 font-semibold text-zinc-100">
                    <td colSpan={3} className="pt-2 pr-2">Total</td>
                    <td className="pt-2 pr-2 text-right tabular-nums text-amber-200">{numeroBr(calculo.contratado)}</td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-zinc-800/50">
            <Campo label="Observações">
              <textarea className={`${inputCls} min-h-[72px] resize-y`} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
            </Campo>
            {/* Não usa <Campo>: o <label> faria o clique no rótulo abrir o seletor de arquivos. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Print ou anexo</span>
              <label className="inline-flex items-center gap-1.5 self-start text-[11px] px-2 py-1.5 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors">
                <Paperclip size={11} /> Anexar arquivo
                <input
                  type="file" multiple accept="image/*,application/pdf" className="hidden"
                  onChange={e => {
                    const novos = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    setArquivos(a => [...a, ...novos]);
                  }}
                />
              </label>
              {arquivos.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-zinc-300 bg-[#121214] border border-zinc-900/60 rounded-md px-2 py-1">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setArquivos(a => a.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-zinc-200" title="Remover">
                    <X size={11} />
                  </button>
                </div>
              ))}
              <span className="text-[10px] text-zinc-600">Imagens ou PDF, até 15 MB cada.</span>
            </div>
          </div>

          {erro && <p className="text-[11px] text-rose-300 bg-rose-500/[0.06] border border-rose-500/20 rounded-md px-2.5 py-1.5">{erro}</p>}
        </div>

        <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t border-zinc-800/60 shrink-0">
          <span className="text-[11px] text-zinc-500 min-w-0">{pendencia ?? 'A proposta entra em "Propostas realizadas".'}</span>
          <div className="flex items-center gap-2 shrink-0">
            <CrmButton onClick={onClose}>Cancelar</CrmButton>
            <CrmButton type="submit" variant="primary" disabled={!!pendencia || salvando}>
              <Plus size={12} /> {salvando ? 'Salvando…' : 'Salvar proposta'}
            </CrmButton>
          </div>
        </footer>
      </form>
    </div>
  );
}

// A ficha já salva, no detalhe do card.
export function AutorizacaoResumo({ autorizacao: a }: { autorizacao: PropostaAutorizacao }) {
  const c = calcularAutorizacao(a);
  const dados: [string, string][] = [
    ['Torre', a.torre || '—'],
    ['Data do contrato', mesBr(a.dataContrato)],
    ['Vigência da tabela', mesBr(a.vigenciaTabela)],
    ['E-mails', a.emails || '—'],
    ['Área privativa', a.areaPrivativa ? `${numeroBr(a.areaPrivativa)} m²` : '—'],
    ['Valor de tabela', moedaBr(a.valorTabela)],
    ['Valor contratado', moedaBr(c.contratado)],
    ['Valor m² tabela', c.m2Tabela === null ? '—' : moedaBr(c.m2Tabela)],
    ['Valor m² contratado', c.m2Contratado === null ? '—' : moedaBr(c.m2Contratado)],
    ['Diferença', `${moedaBr(c.difValor)}${c.difPercentual === null ? '' : ` (${percentualBr(c.difPercentual)})`}`],
    ['Forma de pagamento do sinal', a.formaPagamentoSinal || '—'],
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {dados.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{rotulo}</span>
            <p className="text-zinc-200 mt-0.5 break-words tabular-nums">{valor}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto scrollbar-minimal">
        <table className="w-full min-w-[640px] text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              <th className="py-1.5 pr-2 text-left font-semibold">Descrição</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Quant.</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Vl. unit.</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Vl. total</th>
              <th className="py-1.5 pr-2 text-right font-semibold">1º venc.</th>
              <th className="py-1.5 pr-2 text-left font-semibold">Atualiz.</th>
              <th className="py-1.5 pr-2 text-right font-semibold">% item</th>
              <th className="py-1.5 text-right font-semibold">% acum.</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-zinc-300">
            {a.parcelas.map((p, i) => (
              <tr key={i} className="border-b border-zinc-900">
                <td className="py-1.5 pr-2">{p.descricao}</td>
                <td className="py-1.5 pr-2 text-right">{p.quantidade}</td>
                <td className="py-1.5 pr-2 text-right">{numeroBr(p.valorUnitario)}</td>
                <td className="py-1.5 pr-2 text-right">{numeroBr(c.linhas[i].total)}</td>
                <td className="py-1.5 pr-2 text-right">{dataBr(p.primeiroVencimento)}</td>
                <td className="py-1.5 pr-2">{p.atualizacao}</td>
                <td className="py-1.5 pr-2 text-right">{percentualBr(c.linhas[i].percentual)}</td>
                <td className="py-1.5 text-right">{percentualBr(c.linhas[i].acumulado)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-zinc-100">
              <td colSpan={3} className="py-1.5 pr-2">Total</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{numeroBr(c.contratado)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {a.observacoes && (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Observações</span>
          <p className="text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">{a.observacoes}</p>
        </div>
      )}
    </div>
  );
}

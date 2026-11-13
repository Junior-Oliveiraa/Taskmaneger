import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Check, FileText, Mail, Paperclip, Phone, UploadCloud, X,
} from 'lucide-react';
import {
  Project, SiengeProjectDisplay, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao, SiengeVendaSituacao,
} from '../../types';
import { SITUACAO_LABELS } from '../../lib/siengeVendasTabela';
import { fetchCrmLeads } from '../../lib/crmApi';
import { fetchCvComercial, nomeProprio } from '../../lib/cvComercial';
import {
  ComercialProposta, PropostaAutorizacao, calcularAutorizacao, criarProposta, fetchComercialMovimentos,
} from '../../lib/comercialApi';
import { CrmButton } from '../crm/CrmShared';
import { AutoCompletar, SelectLista } from './CampoLista';
import SeletorData from './SeletorData';
import { Campo, ValorInput, campoCls, mesCurto, moedaBr, numeroBr, percentualBr } from './PropostaCampos';
import FluxoPagamentoEditor, { CORES_FLUXO, LinhaFluxo, linhaUsada, linhasGenericas, novaLinha } from './FluxoPagamentoEditor';
import { PERIODICIDADES, escalarFluxo, fluxoDaTabela, ultimoVencimento } from '../../lib/propostaFluxo';
import { fetchSiengeCalculoRegras } from '../../lib/api';
import { acimaDoLimite, descontoPct, fetchLimitesDesconto, limiteDoProjeto } from '../../lib/comercialDescontos';
import { usePermissoes } from '../../lib/permissoes';

const SITUACOES_PROPOSTA: SiengeVendaSituacao[] = ['disponivel', 'reservado'];

// Datas puras: formatadas sem passar por Date, que as leria como UTC.
const dataBr = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');
const FORMAS_SINAL = ['PIX', 'TED', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Cheque', 'Dinheiro'];

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// (00) 0000-0000 ou (00) 00000-0000, conforme a quantidade de dígitos.
const mascaraTelefone = (bruto: string) => {
  const d = bruto.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  const meio = d.length > 10 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, meio)}${d.length > meio ? `-${d.slice(meio)}` : ''}`;
};
// Propostas antigas guardavam só o mês (AAAA-MM); as novas, a data completa.
const dataOuMesBr = (iso: string) => (iso.length === 10 ? dataBr(iso) : mesCurto(iso));

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Secao({ numero, titulo, descricao, acao, children }: {
  numero: number;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 w-5 h-5 shrink-0 rounded-md bg-zinc-800/80 text-[11px] font-semibold text-zinc-300 grid place-items-center tabular-nums">
            {numero}
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-zinc-100 leading-5">{titulo}</h3>
            {descricao && <p className="text-[11px] text-zinc-500 leading-4">{descricao}</p>}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

// ── Painel de resumo ────────────────────────────────────────────────────────

function LinhaResumo({ rotulo, valor, fraco }: { rotulo: string; valor: string; fraco?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-zinc-500">{rotulo}</span>
      <span className={`tabular-nums text-right ${fraco ? 'text-zinc-600' : 'text-zinc-200'}`}>{valor}</span>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

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
  // Mesma consulta do painel Desempenho: compartilha o cache.
  const cv = useQuery({ queryKey: ['cvComercial'], queryFn: fetchCvComercial, staleTime: 5 * 60 * 1000, retry: 1 }).data;
  // Regras de cálculo: colunas calculadas da Tabela de Vendas, que também podem ser séries do fluxo.
  const regras = useQuery({ queryKey: ['siengeCalculoRegras'], queryFn: fetchSiengeCalculoRegras }).data ?? [];
  // Limite de desconto sem aprovação (aba Metas). Sem resposta, vale o padrão de 1,5%.
  const limites = useQuery({ queryKey: ['comercialDescontos'], queryFn: fetchLimitesDesconto, staleTime: 60_000 }).data;
  const { isMaster } = usePermissoes();

  const [projectId, setProjectId] = useState('');
  const [torre, setTorre] = useState('Única');
  const [unidadeId, setUnidadeId] = useState('');
  const [dataContrato, setDataContrato] = useState(hoje);
  const [cliente, setCliente] = useState('');
  const [corretor, setCorretor] = useState('');
  const [imobiliaria, setImobiliaria] = useState('');
  const [emails, setEmails] = useState('');
  const [telefone, setTelefone] = useState('');
  const [vigenciaTabela, setVigenciaTabela] = useState('');
  const [areaPrivativa, setAreaPrivativa] = useState<number | null>(null);
  const [valorTabela, setValorTabela] = useState<number | null>(null);
  const [formaSinal, setFormaSinal] = useState('');
  const [linhas, setLinhas] = useState<LinhaFluxo[]>(() => linhasGenericas(hoje()));
  // Depois que o fluxo é mexido, trocar unidade ou data não o sobrescreve mais.
  const [fluxoEditado, setFluxoEditado] = useState(false);
  // Valor que o fluxo precisa somar; null = segue o valor de tabela.
  const [alvoManual, setAlvoManual] = useState<number | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Recorte: versão principal, sem empreendimentos ocultos.
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

  const unidadeSel = unidadesElegiveis.find(u => u.id === unidadeId);

  // Valor que o fluxo precisa somar: o de tabela ou o definido no fluxo (desconto/ágio).
  const alvo = alvoManual ?? valorTabela ?? 0;

  // Fluxo padrão da unidade na Tabela de Vendas; vencimentos a partir da data do
  // contrato. Com desconto, as séries são recalculadas sobre o novo valor da
  // unidade mantendo o % de cada uma na tabela.
  const modelo = useMemo(() => {
    if (!unidadeSel) return null;
    const base = fluxoDaTabela(unidadeSel, regras, colunas, dataContrato);
    return escalarFluxo(base, unidadeSel.valorTabela, alvo);
  }, [unidadeSel, regras, colunas, dataContrato, alvo]);
  const chaveModelo = JSON.stringify(modelo);
  const aplicarModelo = () => {
    setLinhas(modelo?.length ? modelo.map(p => novaLinha(p)) : linhasGenericas(dataContrato));
    setFluxoEditado(false);
  };
  // Enquanto o fluxo não foi personalizado, ele acompanha a unidade e a data do contrato.
  useEffect(() => {
    if (!fluxoEditado) aplicarModelo();
  }, [chaveModelo]); // eslint-disable-line react-hooks/exhaustive-deps

  const editarFluxo = (ls: LinhaFluxo[]) => { setLinhas(ls); setFluxoEditado(true); };

  // Imobiliárias e corretores: os do painel (CV CRM) mais os já usados em movimentos
  // e propostas, para quem foi adicionado aqui reaparecer na próxima ficha.
  const { imobiliarias, corretoresPorImobiliaria, todosCorretores } = useMemo(() => {
    const pares: { imobiliaria: string | null; corretor: string | null }[] = [
      ...(cv?.reservas ?? []),
      ...movimentos,
      ...propostas,
    ];
    const imobs = new Map<string, string>();
    const corrs = new Map<string, string>();
    const vinculos = new Map<string, Set<string>>();
    for (const p of pares) {
      const i = nomeProprio(p.imobiliaria);
      const c = nomeProprio(p.corretor);
      if (i) imobs.set(chave(i), imobs.get(chave(i)) ?? i);
      if (c) corrs.set(chave(c), corrs.get(chave(c)) ?? c);
      if (i && c) {
        const s = vinculos.get(chave(i)) ?? new Set<string>();
        s.add(corrs.get(chave(c))!);
        vinculos.set(chave(i), s);
      }
    }
    const ordenar = (xs: Iterable<string>) => [...xs].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      imobiliarias: ordenar(imobs.values()),
      corretoresPorImobiliaria: new Map([...vinculos].map(([k, s]) => [k, ordenar(s)])),
      todosCorretores: ordenar(corrs.values()),
    };
  }, [cv, movimentos, propostas]);

  // Com imobiliária escolhida, só os corretores dela (como no filtro do painel).
  const vinculadosImob = imobiliaria ? corretoresPorImobiliaria.get(chave(imobiliaria)) : undefined;
  const corretores = vinculadosImob?.length ? vinculadosImob : todosCorretores;

  const escolherImobiliaria = (v: string) => {
    setImobiliaria(v);
    const vinc = v ? corretoresPorImobiliaria.get(chave(v)) : undefined;
    if (corretor && vinc?.length && !vinc.includes(corretor)) setCorretor('');
  };

  // Formas padrão primeiro; depois as que já foram digitadas em outras fichas.
  const formasSinal = useMemo(() => {
    const vistas = new Set(FORMAS_SINAL.map(chave));
    const extras: string[] = [];
    for (const p of propostas) {
      const f = p.autorizacao?.formaPagamentoSinal?.trim();
      if (f && !vistas.has(chave(f))) { vistas.add(chave(f)); extras.push(f); }
    }
    return [...FORMAS_SINAL, ...extras.sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [propostas]);

  const clientes = useMemo(() => Array.from(new Set(leads.map(l => l.nome))).slice(0, 200), [leads]);

  // Escolher um lead do CRM traz o contato dele, sem sobrescrever o que já foi digitado.
  const alterarCliente = (nome: string) => {
    setCliente(nome);
    const lead = leads.find(l => l.nome === nome);
    if (!lead) return;
    if (lead.telefone && !telefone) setTelefone(mascaraTelefone(lead.telefone));
    if (lead.email && !emails) setEmails(lead.email);
  };

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

  const anexar = (lista: FileList | null) => {
    const novos = Array.from(lista ?? []).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (novos.length) setArquivos(a => [...a, ...novos]);
  };

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
  const parcelasCompletas = usadas.length > 0 && !usadas.some(l => !l.descricao.trim() || !l.quantidade || !l.primeiroVencimento);
  const telefoneValido = telefone.replace(/\D/g, '').length >= 10;
  const saldo = Math.round((alvo - calculo.contratado) * 100) / 100;
  const temSaldo = Math.abs(saldo) >= 0.01;
  // Desconto medido como o banco mede: contratado sobre o valor da unidade na Tabela de Vendas.
  const referenciaDesconto = unidadeSel?.valorTabela ? Math.round(unidadeSel.valorTabela * 100) / 100 : valorTabela;
  const limiteDesconto = limiteDoProjeto(limites, projectId);
  const desconto = descontoPct(calculo.contratado, referenciaDesconto);
  const precisaAprovacao = calculo.contratado > 0 && acimaDoLimite(desconto, limiteDesconto);
  const pendencia = !projectId ? 'Escolha o empreendimento.'
    : !unidadeId ? 'Escolha a unidade.'
    : !cliente.trim() ? 'Informe o nome do cliente.'
    : !telefoneValido ? 'Informe o telefone do cliente.'
    : !corretor.trim() ? 'Informe o corretor.'
    : !valorTabela ? 'Informe o valor de tabela.'
    : usadas.length === 0 ? 'Preencha ao menos uma parcela.'
    : !parcelasCompletas ? 'Complete descrição, quantidade e 1º vencimento das parcelas com valor.'
    : linhas.some(l => (l.valorUnitario ?? 0) < 0) ? 'Há série com valor negativo no fluxo.'
    : temSaldo ? (saldo > 0 ? `Faltam ${moedaBr(saldo)} para o fluxo somar 100% do valor da unidade.` : `O fluxo passou ${moedaBr(-saldo)} do valor da unidade.`)
    : null;

  const checklist: [string, boolean][] = [
    ['Empreendimento e unidade', !!projectId && !!unidadeId],
    ['Cliente e telefone', !!cliente.trim() && telefoneValido],
    ['Corretor', !!corretor.trim()],
    ['Valor de tabela', !!valorTabela],
    ['Fluxo soma 100% da unidade', parcelasCompletas && !temSaldo],
  ];
  const concluidos = checklist.filter(([, ok]) => ok).length;

  const projetoNome = projects.find(p => p.id === projectId)?.name;
  const dif = calculo.difPercentual;
  const temComparacao = !!valorTabela && calculo.contratado > 0;
  // Proporção contratado/tabela na barra; 100% da tabela fica fixo a 80% da largura.
  const proporcao = temComparacao ? Math.min(calculo.contratado / valorTabela!, 1.25) : 0;
  const tomDif = !temComparacao || dif === null || Math.abs(dif) < 0.005 ? 'neutro' : dif < 0 ? 'desconto' : 'agio';

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendencia || salvando) return;
    const autorizacao: PropostaAutorizacao = {
      torre: torre.trim(),
      dataContrato,
      emails: emails.trim(),
      telefone: telefone.trim(),
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
        periodicidade: l.periodicidade,
      })),
    };
    setSalvando(true);
    setErro(null);
    try {
      await criarProposta({
        projectId,
        unidadeId,
        unidade: unidadeSel?.unidade ?? null,
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <form
        onSubmit={salvar}
        className="w-full max-w-[1440px] h-[96vh] sm:h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0e0e11] shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-zinc-800/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-blue-500/10 border border-blue-500/20 grid place-items-center text-blue-300">
              <FileText size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-zinc-50 leading-5">Nova proposta</h2>
              <p className="text-[12px] text-zinc-500 truncate">Autorização de proposta de compra e venda · Diretoria Comercial</p>
            </div>
          </div>
          <button
            type="button" onClick={onClose} title="Fechar"
            className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden flex flex-col xl:flex-row scrollbar-minimal">
          {/* ── Formulário ── */}
          <div className="flex-1 min-w-0 xl:overflow-y-auto scrollbar-minimal px-5 sm:px-6 py-6 space-y-8">
            <Secao numero={1} titulo="Imóvel">
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-4">
                <Campo label="Empreendimento" obrigatorio className="sm:col-span-3">
                  <SelectLista
                    value={projectId}
                    onChange={v => { if (v !== projectId) { setProjectId(v); setUnidadeId(''); } }}
                    opcoes={projetosComTabela.map(p => ({ value: p.id, label: p.name }))}
                    textoVazio="Nenhum empreendimento com tabela de vendas."
                  />
                </Campo>
                <Campo
                  label="Unidade" obrigatorio className="sm:col-span-3"
                  hint={projectId && unidadesElegiveis.length === 0
                    ? 'Nenhuma unidade disponível ou reservada neste empreendimento.'
                    : undefined}
                >
                  <SelectLista
                    value={unidadeId}
                    disabled={!projectId}
                    placeholder={projectId ? 'Selecione…' : 'Escolha o empreendimento primeiro'}
                    onChange={escolherUnidade}
                    opcoes={unidadesElegiveis.map(u => ({
                      value: u.id,
                      label: `${u.imovel ? `${u.imovel} · ` : ''}${u.unidade}`,
                      detalhe: SITUACAO_LABELS[u.situacao],
                      tomDetalhe: u.situacao === 'disponivel' ? 'verde' : 'ambar',
                    }))}
                    textoVazio="Nenhuma unidade disponível ou reservada."
                  />
                </Campo>
                <Campo label="Torre" className="sm:col-span-2">
                  <input className={campoCls} value={torre} onChange={e => setTorre(e.target.value)} />
                </Campo>
                <Campo label="Data do contrato" className="sm:col-span-2">
                  <SeletorData value={dataContrato} onChange={setDataContrato} />
                </Campo>
                <Campo label="Vigência da tabela" className="sm:col-span-2">
                  <SeletorData value={vigenciaTabela} onChange={setVigenciaTabela} />
                </Campo>
              </div>
            </Secao>

            <div className="h-px bg-zinc-800/60" />

            <Secao numero={2} titulo="Cliente e intermediação">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                <Campo label="Nome" obrigatorio className="sm:col-span-2">
                  <AutoCompletar value={cliente} onChange={alterarCliente} sugestoes={clientes} placeholder="Nome completo do cliente" />
                </Campo>
                <Campo label="Telefone" obrigatorio>
                  <input
                    type="tel" inputMode="tel" className={`${campoCls} tabular-nums`} placeholder="(00) 00000-0000"
                    value={telefone} onChange={e => setTelefone(mascaraTelefone(e.target.value))}
                  />
                </Campo>
                <Campo label="E-mail">
                  <input type="email" className={campoCls} value={emails} onChange={e => setEmails(e.target.value)} placeholder="cliente@exemplo.com" />
                </Campo>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 pt-1">
                <Campo label="Imobiliária">
                  <SelectLista
                    value={imobiliaria}
                    onChange={escolherImobiliaria}
                    opcoes={imobiliarias.map(i => ({ value: i, label: i }))}
                    placeholder="Selecione a imobiliária"
                    criar="Adicionar imobiliária"
                    textoVazio="Nenhuma imobiliária cadastrada."
                  />
                </Campo>
                <Campo
                  label="Corretor" obrigatorio
                  hint={vinculadosImob?.length ? `${vinculadosImob.length} ${vinculadosImob.length === 1 ? 'corretor' : 'corretores'} desta imobiliária.` : undefined}
                >
                  <SelectLista
                    value={corretor}
                    onChange={setCorretor}
                    opcoes={corretores.map(c => ({ value: c, label: c }))}
                    placeholder="Selecione o corretor"
                    criar="Adicionar corretor"
                    textoVazio="Nenhum corretor cadastrado."
                  />
                </Campo>
              </div>
            </Secao>

            <div className="h-px bg-zinc-800/60" />

            <Secao numero={3} titulo="Valores de referência">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                <Campo label="Área privativa">
                  <ValorInput value={areaPrivativa} onChange={setAreaPrivativa} sufixo="m²" />
                </Campo>
                <Campo label="Valor de tabela" obrigatorio>
                  <ValorInput value={valorTabela} onChange={setValorTabela} prefixo="R$" />
                </Campo>
                <Campo label="Pagamento do sinal">
                  <SelectLista
                    value={formaSinal}
                    onChange={setFormaSinal}
                    opcoes={formasSinal.map(f => ({ value: f, label: f }))}
                    placeholder="Selecione a forma"
                    criar="Usar"
                  />
                </Campo>
              </div>
            </Secao>

            <div className="h-px bg-zinc-800/60" />

            <Secao
              numero={4}
              titulo="Fluxo de pagamento"
            >
              <FluxoPagamentoEditor
                linhas={linhas}
                onChange={editarFluxo}
                contratado={calculo.contratado}
                alvo={alvo}
                alvoManual={alvoManual !== null}
                onAlvo={setAlvoManual}
                valorTabela={valorTabela}
                dataContrato={dataContrato}
                origem={modelo?.length && unidadeSel
                  ? `${projetoNome ?? ''} · unidade ${unidadeSel.unidade}${
                    alvo > 0 && Math.abs(alvo - unidadeSel.valorTabela) >= 0.01 ? ` · recalculado sobre ${moedaBr(alvo)}` : ''}`
                  : null}
                modificado={fluxoEditado}
                onRestaurar={aplicarModelo}
                referenciaDesconto={unidadeSel ? referenciaDesconto : null}
                limiteDesconto={limiteDesconto}
              />
            </Secao>

            <div className="h-px bg-zinc-800/60" />

            <Secao numero={5} titulo="Observações e anexos">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Observações">
                  <textarea
                    className={`${campoCls} h-auto min-h-[112px] py-2.5 resize-y leading-relaxed`}
                    value={observacoes} onChange={e => setObservacoes(e.target.value)}
                    placeholder="Condições especiais, combinados com o cliente…"
                  />
                </Campo>
                {/* Não usa <Campo>: o <label> faria o clique no rótulo abrir o seletor de arquivos. */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[11px] font-medium text-zinc-400">Print ou anexo</span>
                  <label
                    onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                    onDragLeave={() => setArrastando(false)}
                    onDrop={e => { e.preventDefault(); setArrastando(false); anexar(e.dataTransfer.files); }}
                    className={`flex flex-col items-center justify-center gap-1.5 min-h-[112px] rounded-lg border border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
                      arrastando ? 'border-blue-500/60 bg-blue-500/[0.06]' : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/40'
                    }`}
                  >
                    <UploadCloud size={18} className={arrastando ? 'text-blue-300' : 'text-zinc-500'} />
                    <span className="text-[12px] text-zinc-300">
                      Arraste arquivos ou <span className="text-blue-400">clique para escolher</span>
                    </span>
                    <span className="text-[11px] text-zinc-600">Imagens ou PDF, até 15 MB cada.</span>
                    <input
                      type="file" multiple accept="image/*,application/pdf" className="hidden"
                      onChange={e => { anexar(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                  {arquivos.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {arquivos.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-[12px] text-zinc-300 bg-zinc-900/60 border border-zinc-800/80 rounded-lg pl-2.5 pr-1 h-8">
                          <Paperclip size={12} className="shrink-0 text-zinc-500" />
                          <span className="truncate flex-1">{f.name}</span>
                          <span className="shrink-0 text-[11px] text-zinc-600 tabular-nums">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                          <button
                            type="button" onClick={() => setArquivos(a => a.filter((_, j) => j !== i))} title="Remover"
                            className="w-6 h-6 grid place-items-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800"
                          >
                            <X size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Secao>

            {erro && (
              <p className="flex items-start gap-2 text-[12px] text-rose-200 bg-rose-500/[0.07] border border-rose-500/25 rounded-lg px-3 py-2.5">
                <AlertCircle size={14} className="shrink-0 mt-px text-rose-400" /> {erro}
              </p>
            )}
          </div>

          {/* ── Resumo ── */}
          <aside className="xl:w-[300px] shrink-0 border-t xl:border-t-0 xl:border-l border-zinc-800/70 bg-[#0b0b0d] xl:overflow-y-auto scrollbar-minimal px-5 sm:px-6 py-6 space-y-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Resumo</p>
              <p className="mt-2 text-[13px] font-medium text-zinc-100 truncate">
                {projetoNome ?? <span className="text-zinc-600 font-normal">Empreendimento não definido</span>}
              </p>
              <p className="text-[12px] text-zinc-500 truncate">
                {unidadeSel ? `${torre ? `Torre ${torre} · ` : ''}Unidade ${unidadeSel.unidade}` : 'Unidade não definida'}
                {cliente.trim() && ` · ${cliente.trim()}`}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 space-y-4">
              <div>
                <p className="text-[11px] text-zinc-500">Valor contratado</p>
                <p className="mt-1 text-[24px] leading-7 font-semibold tracking-tight tabular-nums text-zinc-50">{moedaBr(calculo.contratado)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                    tomDif === 'desconto' ? 'bg-rose-500/10 text-rose-300'
                      : tomDif === 'agio' ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {temComparacao && dif !== null ? `${dif > 0 ? '+' : ''}${percentualBr(dif)}` : '—'}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {tomDif === 'desconto' ? 'abaixo da tabela' : tomDif === 'agio' ? 'acima da tabela' : temComparacao ? 'igual à tabela' : 'sem comparação'}
                  </span>
                </div>
              </div>

              {/* Barra contratado vs. tabela: o traço marca 100% da tabela. */}
              <div className="relative h-1.5 rounded-full bg-zinc-800">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${
                    tomDif === 'desconto' ? 'bg-rose-400/80' : tomDif === 'agio' ? 'bg-emerald-400/80' : 'bg-zinc-500'
                  }`}
                  style={{ width: `${(proporcao / 1.25) * 100}%` }}
                />
                <div className="absolute -top-1 -bottom-1 w-px bg-zinc-400" style={{ left: '80%' }} title="Valor de tabela" />
              </div>

              <div className="space-y-2 pt-1">
                <LinhaResumo rotulo="Valor de tabela" valor={valorTabela ? moedaBr(valorTabela) : '—'} fraco={!valorTabela} />
                <LinhaResumo rotulo="Diferença" valor={valorTabela ? moedaBr(calculo.difValor) : '—'} fraco={!valorTabela} />
                <div className="h-px bg-zinc-800/70 my-1" />
                <LinhaResumo rotulo="m² tabela" valor={calculo.m2Tabela === null ? '—' : moedaBr(calculo.m2Tabela)} fraco={calculo.m2Tabela === null} />
                <LinhaResumo rotulo="m² contratado" valor={calculo.m2Contratado === null ? '—' : moedaBr(calculo.m2Contratado)} fraco={calculo.m2Contratado === null} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">Composição</p>
              {calculo.contratado > 0 ? (
                <>
                  <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 gap-px">
                    {linhas.map((l, i) => linhaUsada(l) && (
                      <div key={l.id} className={CORES_FLUXO[i % CORES_FLUXO.length]} style={{ width: `${calculo.linhas[i].percentual}%` }} />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {linhas.map((l, i) => linhaUsada(l) && (
                      <li key={l.id} className="flex items-center gap-2 text-[12px]">
                        <span className={`w-2 h-2 rounded-sm shrink-0 ${CORES_FLUXO[i % CORES_FLUXO.length]}`} />
                        <span className="text-zinc-400 truncate flex-1">{l.descricao || 'Sem descrição'}</span>
                        <span className="text-zinc-300 tabular-nums">{percentualBr(calculo.linhas[i].percentual)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[12px] text-zinc-600">Preencha o fluxo para ver a distribuição.</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Para salvar</p>
                <span className="text-[11px] tabular-nums text-zinc-500">{concluidos}/{checklist.length}</span>
              </div>
              <ul className="space-y-2">
                {checklist.map(([rotulo, ok]) => (
                  <li key={rotulo} className="flex items-center gap-2.5 text-[12px]">
                    <span className={`w-4 h-4 shrink-0 rounded-full grid place-items-center transition-colors ${
                      ok ? 'bg-emerald-500/15 text-emerald-300' : 'border border-zinc-700'
                    }`}>
                      {ok && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className={ok ? 'text-zinc-400 line-through decoration-zinc-700' : 'text-zinc-300'}>{rotulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-zinc-800/70 bg-[#0e0e11] shrink-0">
          <span className={`flex items-center gap-1.5 text-[12px] min-w-0 ${pendencia ? 'text-zinc-400' : precisaAprovacao && !isMaster ? 'text-amber-200' : 'text-emerald-300/90'}`}>
            {pendencia || (precisaAprovacao && !isMaster) ? <AlertCircle size={13} className="shrink-0 text-amber-400/80" /> : <Check size={13} className="shrink-0" />}
            <span className="truncate">
              {pendencia
                ?? (precisaAprovacao && !isMaster
                  ? `Desconto de ${percentualBr(desconto)} passa do limite de ${percentualBr(limiteDesconto)}: a proposta vai para aprovação do gestor.`
                  : precisaAprovacao
                    ? `Desconto de ${percentualBr(desconto)} acima do limite: como gestor, a proposta já entra aprovada.`
                    : 'Pronta. A proposta entra em "Propostas realizadas".')}
            </span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {/* Sem o resumo lateral (telas menores), o valor fica sempre à vista aqui. */}
            <span className="xl:hidden hidden sm:block mr-2 text-right leading-tight">
              <span className="block text-[10px] text-zinc-500">Contratado</span>
              <span className="text-[13px] font-semibold tabular-nums text-zinc-100">{moedaBr(calculo.contratado)}</span>
            </span>
            <CrmButton onClick={onClose}>Cancelar</CrmButton>
            <CrmButton type="submit" variant="primary" disabled={!!pendencia || salvando}>
              <Check size={12} /> {salvando ? 'Salvando…' : precisaAprovacao && !isMaster ? 'Enviar para aprovação' : 'Salvar proposta'}
            </CrmButton>
          </div>
        </footer>
      </form>
    </div>
  );
}

// ── Detalhe da proposta salva ───────────────────────────────────────────────

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] text-zinc-500 leading-4">{children}</span>;
}

function TituloBloco({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</h4>
      {extra}
    </div>
  );
}

// Selo da diferença contra a tabela: desconto, preço cheio ou acima da tabela.
function SeloDiferenca({ difValor, difPercentual }: { difValor: number; difPercentual: number | null }) {
  const pct = difPercentual === null ? '' : percentualBr(Math.abs(difPercentual));
  if (Math.abs(difValor) < 0.01) {
    return <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-300">Preço de tabela</span>;
  }
  const desconto = difValor < 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${desconto ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}
      title={`${desconto ? '−' : '+'}${moedaBr(Math.abs(difValor))} em relação à tabela`}
    >
      {desconto ? `Desconto de ${pct}` : `${pct} acima da tabela`}
    </span>
  );
}

function Contato({ icone, children, href }: { icone: React.ReactNode; children: React.ReactNode; href: string }) {
  return (
    <a href={href} className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-100 transition-colors min-w-0">
      <span className="text-zinc-500 shrink-0">{icone}</span>
      <span className="truncate">{children}</span>
    </a>
  );
}

// Mesma grade do FluxoPagamentoEditor (sem a coluna de ações), para a ficha salva ler igual à de criação.
const GRADE_LEITURA = 'grid grid-cols-[minmax(140px,1fr)_44px_104px_80px_40px_104px_120px] gap-2 items-center';
const CELULA = 'text-right text-zinc-200';

const descreverParcela = (p: PropostaAutorizacao['parcelas'][number]) => {
  if (p.quantidade > 1) {
    const per = PERIODICIDADES.find(x => x.meses === p.periodicidade)?.plural;
    return `${p.quantidade}× ${per ? `${per} ` : ''}de ${moedaBr(p.valorUnitario)} · a partir de ${dataBr(p.primeiroVencimento)}`;
  }
  return `Parcela única · ${dataBr(p.primeiroVencimento)}`;
};

// A ficha já salva, no painel lateral do card. Duas colunas em telas largas:
// valores e fluxo (a leitura principal) à esquerda; pessoas, contrato e o que
// vier em `lateral` (anexos) numa coluna de apoio à direita.
export function AutorizacaoResumo({ autorizacao: a, cliente, corretor, lateral }: {
  autorizacao: PropostaAutorizacao;
  cliente: string;
  corretor: string;
  lateral?: React.ReactNode;
}) {
  const c = calcularAutorizacao(a);
  const emails = a.emails.split(/[;,\s]+/).filter(Boolean);
  const detalhes: [string, string][] = [
    ['Torre', a.torre || '—'],
    ['Área privativa', a.areaPrivativa ? `${numeroBr(a.areaPrivativa)} m²` : '—'],
    ['Pagamento do sinal', a.formaPagamentoSinal || '—'],
    ['Data do contrato', dataOuMesBr(a.dataContrato)],
    ['Vigência da tabela', dataOuMesBr(a.vigenciaTabela)],
  ];
  const referencias: [string, string][] = [
    ['Valor de tabela', moedaBr(a.valorTabela)],
    ['m² contratado', c.m2Contratado === null ? '—' : moedaBr(c.m2Contratado)],
    ['m² tabela', c.m2Tabela === null ? '—' : moedaBr(c.m2Tabela)],
  ];

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-6">
        {/* Valores: o contratado em destaque, as referências ao lado. */}
        <section className="rounded-xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/20 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="min-w-0">
              <Rotulo>Valor contratado</Rotulo>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">{moedaBr(c.contratado)}</p>
              <div className="mt-2.5"><SeloDiferenca difValor={c.difValor} difPercentual={c.difPercentual} /></div>
            </div>
            <dl className="grid grid-cols-3 gap-2 md:w-[400px] shrink-0">
              {referencias.map(([r, v]) => (
                <div key={r} className="rounded-lg bg-zinc-950/50 border border-zinc-800/60 px-3 py-2 min-w-0">
                  <dt className="text-[11px] text-zinc-500 truncate">{r}</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-zinc-200 tabular-nums truncate" title={v}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Fluxo: a mesma grade do editor (Nova proposta), só leitura. Em coluna estreita vira lista. */}
        <section className="@container">
          <TituloBloco extra={<span className="text-[12px] text-zinc-500 tabular-nums">{a.parcelas.length} {a.parcelas.length === 1 ? 'série' : 'séries'}</span>}>
            Fluxo de pagamento
          </TituloBloco>
          {c.contratado > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 gap-px mb-3">
              {a.parcelas.map((p, i) => (
                <div
                  key={i} className={CORES_FLUXO[i % CORES_FLUXO.length]}
                  style={{ width: `${c.linhas[i].percentual}%` }}
                  title={`${p.descricao} · ${percentualBr(c.linhas[i].percentual)}`}
                />
              ))}
            </div>
          )}

          <div className="rounded-xl border border-zinc-800/80 overflow-hidden">
            {/* Grade larga */}
            <div className="hidden @2xl:block">
              <div className={`${GRADE_LEITURA} px-3 h-9 bg-zinc-900/50 border-b border-zinc-800/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500`}>
                <span className="pl-3">Descrição</span>
                <span className="text-right">Qtd.</span>
                <span className="text-right">Parcela</span>
                <span className="text-right">% unidade</span>
                <span className="text-center" title="Periodicidade: Única, Mensal, Bimestral, Trimestral, Semestral, Anual">Per.</span>
                <span>1º vencimento</span>
                <span className="text-right">Total</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {a.parcelas.map((p, i) => {
                  const per = PERIODICIDADES.find(x => x.meses === p.periodicidade);
                  const fim = p.quantidade > 1 && p.periodicidade !== undefined ? ultimoVencimento({ ...p, periodicidade: p.periodicidade }) : '';
                  return (
                    <div key={i} className={`${GRADE_LEITURA} px-3 py-2.5 text-[13px] tabular-nums`}>
                      <div className="flex items-stretch gap-2 min-w-0">
                        <span className={`w-1 self-stretch min-h-[24px] shrink-0 rounded-full ${CORES_FLUXO[i % CORES_FLUXO.length]}`} />
                        <div className="min-w-0 flex flex-col justify-center">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-zinc-100 truncate">{p.descricao || 'Sem descrição'}</span>
                            {p.atualizacao === 'INCC' && (
                              <span className="rounded px-1 py-px text-[9px] font-semibold tracking-wider text-zinc-400 bg-zinc-800/80 shrink-0" title="Corrigida pelo INCC">INCC</span>
                            )}
                          </span>
                          {fim && <span className="text-[11px] text-zinc-500 truncate">{p.quantidade}× {per?.plural ?? 'parcelas'} · até {mesCurto(fim)}</span>}
                        </div>
                      </div>
                      <span className={CELULA}>{p.quantidade}</span>
                      <span className={CELULA}>{numeroBr(p.valorUnitario)}</span>
                      <span className={CELULA} title={`Acumulado: ${percentualBr(c.linhas[i].acumulado)}`}>{numeroBr(c.linhas[i].percentual)}<span className="text-zinc-500">%</span></span>
                      <span className={`${CELULA} text-center`} title={per?.label}>{per?.label[0] ?? '—'}</span>
                      <span className={`${CELULA} text-left`}>{dataBr(p.primeiroVencimento)}</span>
                      <span className="text-right font-semibold text-zinc-50">{moedaBr(c.linhas[i].total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lista estreita */}
            <ul className="@2xl:hidden divide-y divide-zinc-800/70">
              {a.parcelas.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-1 self-stretch rounded-full shrink-0 ${CORES_FLUXO[i % CORES_FLUXO.length]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-zinc-100 truncate">{p.descricao || 'Sem descrição'}</span>
                      {p.atualizacao === 'INCC' && (
                        <span className="rounded px-1 py-px text-[9px] font-semibold tracking-wider text-zinc-400 bg-zinc-800/80" title="Corrigida pelo INCC">INCC</span>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-500 tabular-nums truncate">{descreverParcela(p)}</p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <p className="text-[14px] font-medium text-zinc-100">{moedaBr(c.linhas[i].total)}</p>
                    <p className="text-[11px] text-zinc-500" title={`Acumulado: ${percentualBr(c.linhas[i].acumulado)}`}>{percentualBr(c.linhas[i].percentual)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/50 border-t border-zinc-800/80">
              <span className="text-[12px] font-medium text-zinc-400">Total</span>
              <span className="text-[14px] font-semibold text-zinc-50 tabular-nums">{moedaBr(c.contratado)}</span>
            </div>
          </div>
        </section>

        {a.observacoes && (
          <section>
            <TituloBloco>Observações</TituloBloco>
            <p className="text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words rounded-xl bg-zinc-900/40 border border-zinc-800/70 p-4">{a.observacoes}</p>
          </section>
        )}
      </div>

      {/* Coluna de apoio */}
      <aside className="min-w-0 space-y-6 2xl:border-l 2xl:border-zinc-800/60 2xl:pl-6">
        <section className="space-y-3">
          <TituloBloco>Pessoas</TituloBloco>
          <div className="rounded-xl border border-zinc-800/70 p-3.5 min-w-0">
            <Rotulo>Cliente</Rotulo>
            <p className="mt-0.5 text-[14px] font-medium text-zinc-100 truncate">{cliente}</p>
            <div className="mt-2 space-y-1.5">
              {a.telefone && (
                <Contato icone={<Phone size={12} />} href={`tel:${a.telefone.replace(/\D/g, '')}`}>{a.telefone}</Contato>
              )}
              {emails.map(e => <Contato key={e} icone={<Mail size={12} />} href={`mailto:${e}`}>{e}</Contato>)}
              {!a.telefone && emails.length === 0 && <span className="text-[12px] text-zinc-600">Sem contato</span>}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 p-3.5 min-w-0">
            <Rotulo>Corretor / imobiliária</Rotulo>
            <p className="mt-0.5 text-[14px] font-medium text-zinc-100 truncate" title={corretor}>{corretor}</p>
          </div>
        </section>

        <section>
          <TituloBloco>Contrato</TituloBloco>
          <dl className="divide-y divide-zinc-800/60">
            {detalhes.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
                <dt className="text-[12px] text-zinc-500 shrink-0">{rotulo}</dt>
                <dd className="text-[13px] text-zinc-200 tabular-nums text-right break-words min-w-0">{valor}</dd>
              </div>
            ))}
          </dl>
        </section>

        {lateral}
      </aside>
    </div>
  );
}

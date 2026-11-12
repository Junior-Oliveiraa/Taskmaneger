import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, FileText, Bookmark, BadgeCheck, Undo2, Plus, Paperclip, X } from 'lucide-react';
import { Project, SiengeProjectDisplay, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao, SiengeVenda, SiengeVendaSituacao } from '../../types';
import { SITUACAO_LABELS } from '../../lib/siengeVendasTabela';
import { fetchCrmLeads } from '../../lib/crmApi';
import {
  COMERCIAL_TRANSICOES, ComercialMovimento, ComercialMovimentoTipo,
  criarProposta, fetchComercialMovimentos, fetchComercialPropostas, registrarMovimentoComercial,
} from '../../lib/comercialApi';
import { Campo, CrmButton, inputCls, selectCls } from '../crm/CrmShared';

// A barra de abas mora em ComercialTabs.tsx (carregada junto com o app).
export type { ComercialTab } from './ComercialTabs';
export { ComercialTabBar } from './ComercialTabs';

type FormTipo = ComercialMovimentoTipo | 'proposta';

const TIPOS: { id: FormTipo; label: string; feito: string; ativo: string; chip: string }[] = [
  { id: 'venda',    label: 'Venda',    feito: 'Venda lançada',    ativo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', chip: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  { id: 'distrato', label: 'Distrato', feito: 'Distrato lançado', ativo: 'bg-rose-500/15 text-rose-300 border-rose-500/40',          chip: 'text-rose-400 bg-rose-500/10 border-rose-500/25' },
  { id: 'reserva',  label: 'Reserva',  feito: 'Reserva lançada',  ativo: 'bg-amber-500/15 text-amber-300 border-amber-500/40',       chip: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  { id: 'proposta', label: 'Proposta', feito: 'Proposta adicionada', ativo: 'bg-violet-500/15 text-violet-300 border-violet-500/40', chip: 'text-violet-400 bg-violet-500/10 border-violet-500/25' },
];

// Proposta não muda a situação da unidade; só limita quais unidades aparecem.
const SITUACOES_PROPOSTA: SiengeVendaSituacao[] = ['disponivel', 'reservado'];

const RESERVA_STATUS_LABELS: Record<string, string> = {
  convertida: 'virou venda',
  expirada: 'caiu por prazo',
  cancelada: 'cancelada',
};

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Datas puras (yyyy-mm-dd) são formatadas sem passar por Date: new Date() as
// leria como UTC e mostraria o dia anterior em Brasília.
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const noMesAtual = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const agora = new Date();
  return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
};

function detalheMovimento(m: ComercialMovimento): string {
  if (m.tipo === 'venda') return m.dataAssinatura ? `assinatura em ${dataBr(m.dataAssinatura)}` : '';
  if (m.tipo === 'distrato') return m.dataDistrato ? `distrato em ${dataBr(m.dataDistrato)}` : '';
  if (m.reservaStatus === 'ativa' && m.reservaExpiraEm) {
    return `cai em ${new Date(m.reservaExpiraEm).toLocaleDateString('pt-BR')}`;
  }
  return RESERVA_STATUS_LABELS[m.reservaStatus || ''] || '';
}

interface Props {
  projects: Project[];
  projectDisplays: SiengeProjectDisplay[];
  unidades: SiengeTabelaVendaUnidade[];
  versoes: SiengeTabelaVendaVersao[];
  vendas: SiengeVenda[];
}

export default function ComercialInicio({ projects, projectDisplays, unidades, versoes, vendas }: Props) {
  const queryClient = useQueryClient();
  const movimentos = useQuery({ queryKey: ['comercialMovimentos'], queryFn: fetchComercialMovimentos, staleTime: 30_000 }).data ?? [];
  const leads = useQuery({ queryKey: ['crmLeads'], queryFn: fetchCrmLeads, staleTime: 30_000 }).data ?? [];
  const propostas = useQuery({ queryKey: ['comercialPropostas'], queryFn: fetchComercialPropostas, staleTime: 30_000 }).data ?? [];

  const [tipo, setTipo] = useState<FormTipo>('venda');
  const [cliente, setCliente] = useState('');
  const [corretor, setCorretor] = useState('');
  const [imobiliaria, setImobiliaria] = useState('');
  const [projectId, setProjectId] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [data, setData] = useState(hojeIso());
  const [diasParaCair, setDiasParaCair] = useState(7);
  const [fluxoPagamento, setFluxoPagamento] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Só a versão principal: é ela que congela venda, e a situação é a mesma em
  // todas as versões. Empreendimentos ocultados em "Ajustar Metas" ficam de fora,
  // como na Tabela de Vendas.
  const unidadesPrincipais = useMemo(() => {
    const principais = new Set(versoes.filter(v => v.principal).map(v => v.id));
    const ocultos = new Set(projectDisplays.filter(d => d.hidden).map(d => d.projectId));
    return unidades.filter(u => principais.has(u.versaoId) && !ocultos.has(u.projectId));
  }, [unidades, versoes, projectDisplays]);

  const projetosComTabela = useMemo(() => {
    const ids = new Set(unidadesPrincipais.map(u => u.projectId));
    return projects.filter(p => ids.has(p.id));
  }, [projects, unidadesPrincipais]);

  const ehProposta = tipo === 'proposta';
  const transicao = ehProposta ? null : COMERCIAL_TRANSICOES[tipo];
  const situacoesElegiveis = ehProposta ? SITUACOES_PROPOSTA : transicao!.de;
  const unidadesElegiveis = useMemo(
    () => unidadesPrincipais
      .filter(u => u.projectId === projectId && situacoesElegiveis.includes(u.situacao))
      .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true })),
    [unidadesPrincipais, projectId, situacoesElegiveis]
  );

  const corretoresConhecidos = useMemo(
    () => Array.from(new Set(movimentos.map(m => m.corretor))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [movimentos]
  );
  const imobiliariasConhecidas = useMemo(
    () => Array.from(new Set([...movimentos, ...propostas].map(m => m.imobiliaria).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [movimentos, propostas]
  );
  const clientesSugeridos = useMemo(() => Array.from(new Set(leads.map(l => l.nome))).slice(0, 200), [leads]);

  const metricas = useMemo(() => {
    const projetosVisiveis = new Set(projetosComTabela.map(p => p.id));
    const vendasVisiveis = vendas.filter(v => projetosVisiveis.has(v.projectId));
    const reservasAtivas = movimentos.filter(m => m.tipo === 'reserva' && m.reservaStatus === 'ativa' && m.reservaExpiraEm);
    const limite = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const caindo = reservasAtivas.filter(m => new Date(m.reservaExpiraEm!).getTime() <= limite).length;
    const vendasMes = vendasVisiveis.filter(v => v.situacaoOrigem !== 'permuta' && noMesAtual(v.dataVenda)).length;
    const distratos = vendasVisiveis.filter(v => v.dataDistrato);

    return [
      { chave: 'leads', titulo: 'Leads', icone: <Users size={13} />, cor: 'text-blue-400',
        total: String(leads.length), sub: `${leads.filter(l => noMesAtual(l.entradaEm)).length} neste mês` },
      { chave: 'propostas', titulo: 'Propostas', icone: <FileText size={13} />, cor: 'text-violet-400',
        total: String(propostas.filter(p => p.etapa !== 'venda' && p.etapa !== 'visita').length),
        sub: `${propostas.filter(p => p.etapa === 'venda').length} chegaram à venda` },
      { chave: 'reservas', titulo: 'Reservas', icone: <Bookmark size={13} />, cor: 'text-amber-400',
        total: String(unidadesPrincipais.filter(u => u.situacao === 'reservado').length),
        sub: caindo > 0 ? `${caindo} ${caindo === 1 ? 'cai' : 'caem'} em até 3 dias` : 'unidades reservadas agora' },
      { chave: 'vendas', titulo: 'Vendas', icone: <BadgeCheck size={13} />, cor: 'text-emerald-400',
        total: String(unidadesPrincipais.filter(u => u.situacao === 'vendida').length), sub: `${vendasMes} neste mês` },
      { chave: 'distratos', titulo: 'Distratos', icone: <Undo2 size={13} />, cor: 'text-rose-400',
        total: String(distratos.length), sub: `${distratos.filter(v => noMesAtual(v.dataDistrato)).length} neste mês` },
    ];
  }, [leads, movimentos, propostas, vendas, unidadesPrincipais, projetosComTabela]);

  const trocarTipo = (novo: FormTipo) => {
    setTipo(novo);
    // A lista de unidades elegíveis muda com o tipo; a escolhida pode não servir mais.
    setUnidadeId('');
    setErro(null);
    setSucesso(null);
  };

  const escolherUnidade = (id: string) => {
    setUnidadeId(id);
    // No distrato o cliente é quem comprou: adianta o preenchimento.
    const comprador = unidadesElegiveis.find(u => u.id === id)?.compradorAtual;
    if (tipo === 'distrato' && comprador && !cliente.trim()) setCliente(comprador);
  };

  const podeSalvar = ehProposta
    ? !!cliente.trim() && !!corretor.trim() && !!projectId && !!data && !!fluxoPagamento.trim() && !salvando
    : !!cliente.trim() && !!corretor.trim() && !!unidadeId && (tipo === 'reserva' || !!data) && !salvando;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSalvar) return;
    const unidade = unidadesElegiveis.find(u => u.id === unidadeId);
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (ehProposta) {
        await criarProposta({
          projectId,
          unidadeId: unidade?.id ?? null,
          unidade: unidade?.unidade ?? null,
          cliente: cliente.trim(),
          corretor: corretor.trim(),
          imobiliaria: imobiliaria.trim() || null,
          fluxoPagamento: fluxoPagamento.trim(),
          enviadaEm: data,
          arquivos,
        });
        queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
        setSucesso('Proposta adicionada: acompanhe na aba Propostas, em "Propostas realizadas".');
        setCliente('');
        setUnidadeId('');
        setFluxoPagamento('');
        setArquivos([]);
        return;
      }
      await registrarMovimentoComercial({
        tipo: tipo as ComercialMovimentoTipo,
        unidadeId,
        cliente: cliente.trim(),
        corretor: corretor.trim(),
        imobiliaria: imobiliaria.trim() || null,
        data: tipo === 'reserva' ? null : data,
        diasParaCair: tipo === 'reserva' ? diasParaCair : null,
      });
      ['comercialMovimentos', 'siengeTabelaVendas', 'siengeVendas', 'siengeUnidadeHistorico']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      setSucesso(`${TIPOS.find(t => t.id === tipo)!.feito}: unidade ${unidade?.unidade ?? ''} agora está como ${SITUACAO_LABELS[transicao!.para]}.`);
      setCliente('');
      setUnidadeId('');
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível concluir o lançamento.');
    } finally {
      setSalvando(false);
    }
  };

  const nomeProjeto = (id: string) => projects.find(p => p.id === id)?.name || '—';

  return (
    <div className="h-full overflow-y-auto scrollbar-minimal view-pad">
      {/* Painel de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 view-gap-sm mb-4 short:mb-3">
        {metricas.map((m, i) => (
          <motion.div
            key={m.chave}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.03 }}
            className="bg-[#0f0f12] border border-zinc-900/60 rounded-xl px-3 py-2.5"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={m.cor}>{m.icone}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{m.titulo}</span>
            </div>
            <span className="text-xl font-semibold text-zinc-100 tabular-nums">{m.total}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{m.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 view-gap-sm items-start">
        {/* Formulário de lançamento */}
        <form onSubmit={salvar} className="rounded-xl border border-zinc-900/60 bg-[#0f0f12]">
          <header className="px-3 py-2.5 border-b border-zinc-800/50">
            <h3 className="text-xs font-semibold text-zinc-200">Novo lançamento</h3>
            <p className="text-[10px] text-zinc-500">A situação da unidade na Tabela de Vendas é atualizada junto.</p>
          </header>

          <div className="card-pad space-y-3">
            {/* Não usa <Campo>: ele é um <label>, e um clique no rótulo acionaria o primeiro botão. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Adicionar</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {TIPOS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => trocarTipo(t.id)}
                    className={`h-8 rounded-md border text-xs font-semibold transition-colors ${
                      tipo === t.id ? t.ativo : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo label="Cliente">
                <input
                  className={inputCls} value={cliente} onChange={e => setCliente(e.target.value)}
                  placeholder="Nome do cliente" list="comercial-clientes"
                />
                <datalist id="comercial-clientes">
                  {clientesSugeridos.map(n => <option key={n} value={n} />)}
                </datalist>
              </Campo>

              <Campo label="Corretor">
                <input
                  className={inputCls} value={corretor} onChange={e => setCorretor(e.target.value)}
                  placeholder="Nome do corretor" list="comercial-corretores"
                />
                <datalist id="comercial-corretores">
                  {corretoresConhecidos.map(n => <option key={n} value={n} />)}
                </datalist>
              </Campo>

              <Campo label="Imobiliária (opcional)">
                <input
                  className={inputCls} value={imobiliaria} onChange={e => setImobiliaria(e.target.value)}
                  placeholder="Nome da imobiliária" list="comercial-imobiliarias"
                />
                <datalist id="comercial-imobiliarias">
                  {imobiliariasConhecidas.map(n => <option key={n} value={n} />)}
                </datalist>
              </Campo>

              <Campo label="Empreendimento">
                <select
                  className={selectCls} value={projectId}
                  onChange={e => { setProjectId(e.target.value); setUnidadeId(''); }}
                >
                  <option value="">Selecione…</option>
                  {projetosComTabela.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Campo>

              <Campo
                label={ehProposta ? 'Unidade (opcional)' : 'Unidade'}
                hint={projectId && unidadesElegiveis.length === 0
                  ? `Nenhuma unidade ${situacoesElegiveis.map(s => SITUACAO_LABELS[s].toLowerCase()).join(' ou ')} neste empreendimento.`
                  : undefined}
              >
                <select
                  className={selectCls} value={unidadeId} disabled={!projectId}
                  onChange={e => escolherUnidade(e.target.value)}
                >
                  <option value="">{projectId ? 'Selecione…' : 'Escolha o empreendimento'}</option>
                  {unidadesElegiveis.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.imovel ? `${u.imovel} · ` : ''}{u.unidade} — {SITUACAO_LABELS[u.situacao]}
                    </option>
                  ))}
                </select>
              </Campo>

              {tipo === 'venda' && (
                <Campo label="Data da assinatura do contrato">
                  <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
                </Campo>
              )}
              {ehProposta && (
                <Campo label="Data de envio">
                  <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
                </Campo>
              )}
              {tipo === 'distrato' && (
                <Campo label="Data do distrato">
                  <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
                </Campo>
              )}
              {tipo === 'reserva' && (
                <Campo label="Dias para cair">
                  <select className={selectCls} value={diasParaCair} onChange={e => setDiasParaCair(Number(e.target.value))}>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d} {d === 1 ? 'dia' : 'dias'}</option>
                    ))}
                  </select>
                </Campo>
              )}
            </div>

            {ehProposta && (
              <div className="space-y-3">
                <Campo label="Fluxo de pagamento" hint="Descreva como o cliente propõe pagar: entrada, parcelas, intermediárias, financiamento…">
                  <textarea
                    className={`${inputCls} min-h-[96px] resize-y`} value={fluxoPagamento}
                    onChange={e => setFluxoPagamento(e.target.value)}
                    placeholder="Ex.: entrada de R$ 50.000 no ato, 36 parcelas de R$ 3.200, intermediárias anuais de R$ 20.000 e saldo no financiamento."
                  />
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
            )}

            {erro && <p className="text-[11px] text-rose-300 bg-rose-500/[0.06] border border-rose-500/20 rounded-md px-2.5 py-1.5">{erro}</p>}
            {sucesso && <p className="text-[11px] text-emerald-300 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-md px-2.5 py-1.5">{sucesso}</p>}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[10px] text-zinc-500">
                {transicao
                  ? <>{transicao.de.map(s => SITUACAO_LABELS[s]).join(' / ')} → <span className="text-zinc-300">{SITUACAO_LABELS[transicao.para]}</span></>
                  : 'Não altera a situação da unidade.'}
              </span>
              <CrmButton type="submit" variant="primary" disabled={!podeSalvar}>
                <Plus size={12} /> {salvando ? 'Salvando…' : 'Adicionar'}
              </CrmButton>
            </div>
          </div>
        </form>

        {/* Últimos lançamentos */}
        <section className="rounded-xl border border-zinc-900/60 bg-[#0f0f12]">
          <header className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/50">
            <h3 className="text-xs font-semibold text-zinc-200">Últimos lançamentos</h3>
            <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900/60">
              {movimentos.length}
            </span>
          </header>
          <div className="p-2 space-y-1 max-h-[420px] overflow-y-auto scrollbar-minimal">
            {movimentos.length === 0 ? (
              <p className="text-[11px] text-zinc-600 italic px-2 py-6 text-center">Nenhum lançamento ainda.</p>
            ) : (
              movimentos.slice(0, 30).map(m => {
                const t = TIPOS.find(x => x.id === m.tipo)!;
                return (
                  <div key={m.id} className="bg-[#121214] border border-zinc-900/60 rounded-lg px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {m.unidade} <span className="text-zinc-500 font-normal">· {nomeProjeto(m.projectId)}</span>
                      </span>
                      <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border shrink-0 ${t.chip}`}>{t.label}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 truncate">
                      {m.cliente} · corretor {m.corretor}{m.imobiliaria ? ` (${m.imobiliaria})` : ''}
                      {detalheMovimento(m) && <> · {detalheMovimento(m)}</>}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, Check, Footprints, Layers, MapPin, X } from 'lucide-react';
import { Project, SiengeProjectDisplay, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao } from '../../types';
import {
  ComercialProposta, ESTADOS_CIVIS, LOCAIS_VISITA, PropostaVisita, atualizarVisita, criarVisita,
} from '../../lib/comercialApi';
import { fetchCvComercial, hojeBrasilia, nomeProprio } from '../../lib/cvComercial';
import { CrmButton } from '../crm/CrmShared';
import { SelectLista } from './CampoLista';
import SeletorData from './SeletorData';
import { Campo, campoCls } from './PropostaCampos';

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const agoraHora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Botões lado a lado, um escolhido: para listas curtas e fixas. */
function Escolha<T extends string>({ valor, opcoes, onChange }: {
  valor: T | '';
  opcoes: { value: T; label: string; icone?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {opcoes.map(o => {
        const ativo = valor === o.value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={ativo} onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors ${
              ativo
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {o.icone}{o.label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  projects: Project[];
  projectDisplays: SiengeProjectDisplay[];
  unidades: SiengeTabelaVendaUnidade[];
  versoes: SiengeTabelaVendaVersao[];
  propostas: ComercialProposta[];
  onClose: () => void;
  /** Com visita: modo edição. */
  visita?: ComercialProposta | null;
}

export default function VisitaModal({ projects, projectDisplays, unidades, versoes, propostas, onClose, visita = null }: Props) {
  const queryClient = useQueryClient();
  const ini = visita?.visita ?? null;
  // Mesma consulta do painel Desempenho: compartilha o cache (lista de corretores).
  const cv = useQuery({ queryKey: ['cvComercial'], queryFn: fetchCvComercial, staleTime: 5 * 60 * 1000, retry: 1 }).data;

  const [data, setData] = useState(visita?.enviadaEm ?? hojeBrasilia());
  const [hora, setHora] = useState(ini?.hora ?? agoraHora());
  const [local, setLocal] = useState(ini?.local ?? '');
  const [cliente, setCliente] = useState(visita?.cliente ?? '');
  const [interesse, setInteresse] = useState<PropostaVisita['interesse'] | ''>(
    ini?.interesse ?? (visita ? (visita.projectId ? 'especifico' : 'geral') : ''),
  );
  const [projectId, setProjectId] = useState(visita?.projectId ?? '');
  const [corretor, setCorretor] = useState(visita?.corretor ?? '');
  const [profissao, setProfissao] = useState(ini?.profissao ?? '');
  const [ondeMora, setOndeMora] = useState(ini?.ondeMora ?? '');
  const [idade, setIdade] = useState(ini?.idade != null ? String(ini.idade) : '');
  const [estadoCivil, setEstadoCivil] = useState(ini?.estadoCivil ?? '');
  const [observacao, setObservacao] = useState(ini?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, salvando]);

  // Empreendimentos da Tabela de Vendas (versão principal, sem os ocultos), na ordem dela.
  const projetos = useMemo(() => {
    const principais = new Set(versoes.filter(v => v.principal).map(v => v.id));
    const ocultos = new Set(projectDisplays.filter(d => d.hidden).map(d => d.projectId));
    const ids = new Set(unidades.filter(u => principais.has(u.versaoId) && !ocultos.has(u.projectId)).map(u => u.projectId));
    if (visita?.projectId) ids.add(visita.projectId);
    const ordem = new Map(projectDisplays.map(d => [d.projectId, d.sortOrder]));
    return projects
      .filter(p => ids.has(p.id))
      .sort((a, b) => (ordem.get(a.id) ?? 999) - (ordem.get(b.id) ?? 999) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [projects, projectDisplays, unidades, versoes, visita?.projectId]);

  // Corretores: os do painel (CV CRM) mais os já usados em propostas.
  const corretores = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of [...(cv?.reservas ?? []), ...propostas]) {
      const c = nomeProprio(p.corretor);
      if (c && !m.has(chave(c))) m.set(chave(c), c);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [cv, propostas]);

  const idadeNum = idade.trim() ? Number(idade) : null;
  const pendencia =
    !data ? 'Informe o dia da visita.'
    : !/^\d{2}:\d{2}$/.test(hora) ? 'Informe a hora da visita.'
    : !local ? 'Escolha onde foi a visita.'
    : !cliente.trim() ? 'Informe o nome do cliente.'
    : !interesse ? 'Informe o interesse: um empreendimento ou todos.'
    : interesse === 'especifico' && !projectId ? 'Escolha o empreendimento de interesse.'
    : idadeNum !== null && (!Number.isInteger(idadeNum) || idadeNum < 0 || idadeNum > 120) ? 'Idade inválida.'
    : null;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendencia || salvando) return;
    setSalvando(true);
    setErro(null);
    const dados = {
      projectId: interesse === 'especifico' ? projectId : null,
      cliente: cliente.trim(),
      corretor: corretor.trim(),
      imobiliaria: visita?.imobiliaria ?? null,
      data,
      visita: {
        local,
        hora,
        interesse: interesse as PropostaVisita['interesse'],
        profissao: profissao.trim(),
        ondeMora: ondeMora.trim(),
        idade: idadeNum,
        estadoCivil,
        observacao: observacao.trim(),
      },
    };
    try {
      if (visita) await atualizarVisita(visita.id, dados);
      else await criarVisita(dados);
      queryClient.invalidateQueries({ queryKey: ['comercialPropostas'] });
      queryClient.invalidateQueries({ queryKey: ['comercialPropostaMensagens'] });
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível salvar a visita.');
      setSalvando(false);
    }
  };

  // Mudar o interesse para "todos" de uma visita que já virou proposta não é permitido.
  const travaGeral = !!visita && visita.etapa !== 'visita';

  return (
    // Sem fechar ao clicar fora: um clique perdido apagaria o cadastro.
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <form
        onSubmit={salvar}
        className="w-full max-w-[760px] max-h-[96vh] flex flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0e0e11] shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-zinc-800/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-slate-500/10 border border-slate-500/25 grid place-items-center text-slate-300">
              <Footprints size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-zinc-50 leading-5">{visita ? 'Editar visita' : 'Nova visita'}</h2>
              <p className="text-[12px] text-zinc-500 truncate">Cliente que visitou um dos nossos pontos de atendimento</p>
            </div>
          </div>
          <button
            type="button" onClick={onClose} title="Fechar (Esc)"
            className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal px-5 sm:px-6 py-6 space-y-7">
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold text-zinc-100">A visita</h3>
            <Campo label="Local" obrigatorio>
              <Escolha
                valor={local}
                opcoes={LOCAIS_VISITA.map(l => ({ value: l, label: l, icone: <MapPin size={13} className="opacity-70" /> }))}
                onChange={setLocal}
              />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
              <Campo label="Dia" obrigatorio>
                <SeletorData value={data} onChange={setData} />
              </Campo>
              <Campo label="Hora" obrigatorio>
                <input type="time" className={`${campoCls} tabular-nums`} value={hora} onChange={e => setHora(e.target.value)} />
              </Campo>
              <Campo label="Atendido por">
                <SelectLista
                  value={corretor} onChange={setCorretor}
                  opcoes={corretores.map(c => ({ value: c, label: c }))}
                  placeholder="Corretor (opcional)" criar="Adicionar corretor" textoVazio="Nenhum corretor cadastrado."
                />
              </Campo>
            </div>
          </section>

          <div className="h-px bg-zinc-800/60" />

          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold text-zinc-100">Cliente e interesse</h3>
            <Campo label="Nome" obrigatorio>
              <input className={campoCls} value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" autoFocus={!visita} />
            </Campo>
            <Campo label="Interesse" obrigatorio hint={travaGeral ? 'Já virou proposta: o empreendimento precisa continuar definido.' : undefined}>
              <Escolha<PropostaVisita['interesse']>
                valor={interesse}
                opcoes={[
                  { value: 'especifico' as const, label: 'Um empreendimento', icone: <Building2 size={13} className="opacity-70" /> },
                  ...(travaGeral ? [] : [{ value: 'geral' as const, label: 'Todos (veio conhecer)', icone: <Layers size={13} className="opacity-70" /> }]),
                ]}
                onChange={setInteresse}
              />
            </Campo>
            {interesse === 'especifico' && (
              <Campo label="Empreendimento" obrigatorio>
                <SelectLista
                  value={projectId} onChange={setProjectId}
                  opcoes={projetos.map(p => ({ value: p.id, label: p.name }))}
                  textoVazio="Nenhum empreendimento com tabela de vendas."
                />
              </Campo>
            )}
          </section>

          <div className="h-px bg-zinc-800/60" />

          <section className="space-y-4">
            <div>
              <h3 className="text-[13px] font-semibold text-zinc-100">Perfil do cliente</h3>
              <p className="text-[11px] text-zinc-500">Opcional.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              <Campo label="Profissão">
                <input className={campoCls} value={profissao} onChange={e => setProfissao(e.target.value)} />
              </Campo>
              <Campo label="Onde mora">
                <input className={campoCls} value={ondeMora} onChange={e => setOndeMora(e.target.value)} placeholder="Bairro / cidade" />
              </Campo>
              <Campo label="Idade">
                <input
                  inputMode="numeric" className={`${campoCls} tabular-nums`} value={idade}
                  onChange={e => setIdade(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
              </Campo>
              <Campo label="Estado civil">
                <SelectLista
                  value={estadoCivil} onChange={setEstadoCivil}
                  opcoes={[...ESTADOS_CIVIS, ...(estadoCivil && !ESTADOS_CIVIS.includes(estadoCivil) ? [estadoCivil] : [])].map(e => ({ value: e, label: e }))}
                  placeholder="Selecione…"
                />
              </Campo>
            </div>
            <Campo label="Observações / resumo da visita">
              <textarea
                rows={4} value={observacao} onChange={e => setObservacao(e.target.value)}
                placeholder="Como foi a visita, o que o cliente procura, próximos passos…"
                className={`${campoCls} h-auto py-2 leading-relaxed resize-y`}
              />
            </Campo>
          </section>

          {erro && (
            <p className="text-[12px] text-rose-300 bg-rose-500/[0.06] border border-rose-500/20 rounded-lg px-3 py-2">{erro}</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-zinc-800/70 shrink-0">
          <span className={`flex items-center gap-1.5 text-[12px] min-w-0 ${pendencia ? 'text-zinc-400' : 'text-emerald-300/90'}`}>
            {pendencia ? <AlertCircle size={13} className="shrink-0 text-amber-400/80" /> : <Check size={13} className="shrink-0" />}
            <span className="truncate">{pendencia ?? (visita ? 'Pronto para salvar.' : 'Pronta. A visita entra na coluna "Visitas".')}</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <CrmButton onClick={onClose}>Cancelar</CrmButton>
            <CrmButton type="submit" variant="primary" disabled={!!pendencia || salvando}>
              <Check size={12} /> {salvando ? 'Salvando…' : visita ? 'Salvar alterações' : 'Salvar visita'}
            </CrmButton>
          </div>
        </footer>
      </form>
    </div>
  );
}

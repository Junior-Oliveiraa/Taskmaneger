import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Project } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  CrmConfig, CrmEtapa, CrmEventType, CrmLead, CrmLeadFilters, CrmRole,
  CRM_CONFIG_PADRAO, CRM_FILTROS_VAZIOS,
} from '../../lib/crmTypes';
import { indexarAcoesPendentes } from '../../lib/crmDerive';
import * as crm from '../../lib/crmApi';
import CrmDashboard from './CrmDashboard';
import CrmLeadsKanban from './CrmLeadsKanban';
import CrmLeadSheet from './CrmLeadSheet';
import CrmCadencias from './CrmCadencias';
import CrmSettings from './CrmSettings';

type CrmTab = 'dashboard' | 'leads' | 'cadencias' | 'config';

interface Props {
  projects: Project[];
  /** "+ Novo → Lead" do header: abre a folha de lead novo ao montar. */
  novoLead?: boolean;
  onNovoLeadAtendido?: () => void;
}

/** Lead ainda não gravado — a folha abre com estes valores. */
function novoLeadVazio(etapa: CrmEtapa): CrmLead {
  const agora = new Date().toISOString();
  return {
    id: '',
    nome: '',
    etapa,
    temperatura: 'morno',
    entradaEm: agora,
    createdAt: agora,
    updatedAt: agora,
  };
}

export default function CrmView({ projects, novoLead, onNovoLeadAtendido }: Props) {
  const queryClient = useQueryClient();
  const { currentUser, allUsers, refreshUsers } = useAuth();

  const [tab, setTab] = useState<CrmTab>('dashboard');
  const [filtros, setFiltros] = useState<CrmLeadFilters>({ ...CRM_FILTROS_VAZIOS });
  const [leadAbertoId, setLeadAbertoId] = useState<string | null>(null);
  const [leadNovo, setLeadNovo] = useState<CrmLead | null>(null);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);

  // O papel vem das preferências do próprio perfil — mesmo caminho que a RLS lê.
  const role: CrmRole = useMemo(() => {
    const r = currentUser?.preferences?.crmRole as CrmRole | undefined;
    if (r) return r;
    return currentUser?.permissionLevel === 1 ? 'administrador' : 'sdr';
  }, [currentUser?.preferences?.crmRole, currentUser?.permissionLevel]);

  const podeEditar = role === 'administrador' || role === 'sdr';
  const isAdmin = role === 'administrador';

  useEffect(() => {
    if (!novoLead) return;
    if (podeEditar) {
      setTab('leads');
      setLeadAbertoId(null);
      setLeadNovo(novoLeadVazio('novo'));
    }
    onNovoLeadAtendido?.();
  }, [novoLead, podeEditar, onNovoLeadAtendido]);

  // Uma query por domínio. Todas com o mesmo staleTime: o realtime abaixo é quem
  // realmente mantém a tela em dia, o refetch é só a rede de segurança.
  const opts = { staleTime: 30_000 };
  const leads      = useQuery({ queryKey: ['crmLeads'], queryFn: crm.fetchCrmLeads, ...opts }).data ?? [];
  const acoes      = useQuery({ queryKey: ['crmActions'], queryFn: crm.fetchCrmActions, ...opts }).data ?? [];
  const eventos    = useQuery({ queryKey: ['crmEvents'], queryFn: crm.fetchCrmEvents, ...opts }).data ?? [];
  const eventTypes = useQuery({ queryKey: ['crmEventTypes'], queryFn: crm.fetchCrmEventTypes, ...opts }).data ?? [];
  const origens    = useQuery({ queryKey: ['crmOrigens'], queryFn: crm.fetchCrmOrigens, ...opts }).data ?? [];
  const faixas     = useQuery({ queryKey: ['crmFaixas'], queryFn: crm.fetchCrmFaixas, ...opts }).data ?? [];
  const cadencias  = useQuery({ queryKey: ['crmCadencias'], queryFn: crm.fetchCrmCadencias, ...opts }).data ?? [];
  const cadEtapas  = useQuery({ queryKey: ['crmCadenciaEtapas'], queryFn: crm.fetchCrmCadenciaEtapas, ...opts }).data ?? [];
  const config     = useQuery({ queryKey: ['crmConfig'], queryFn: crm.fetchCrmConfig, ...opts }).data ?? CRM_CONFIG_PADRAO;

  const invalidar = (...chaves: string[]) =>
    chaves.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));

  /** Envolve as escritas para que um erro de RLS vire recado na tela, e não silêncio. */
  const executar = async (fn: () => Promise<any>, ...chaves: string[]) => {
    try {
      await fn();
      invalidar(...chaves);
      setErroGlobal(null);
    } catch (e: any) {
      setErroGlobal(e?.message || 'Não foi possível concluir a operação.');
      throw e;
    }
  };

  const leadAberto = leadNovo ?? leads.find(l => l.id === leadAbertoId) ?? null;
  const eventosDoLead = useMemo(
    () => (leadAberto?.id ? eventos.filter(e => e.leadId === leadAberto.id) : []),
    [eventos, leadAberto?.id]
  );
  const acaoDoLead = useMemo(
    () => (leadAberto?.id ? indexarAcoesPendentes(acoes).get(leadAberto.id) ?? null : null),
    [acoes, leadAberto?.id]
  );

  const cadenciaDaAcao = useMemo(() => {
    const etapa = cadEtapas.find(e => e.id === acaoDoLead?.cadenciaEtapaId);
    if (!etapa) return null;
    const irmas = cadEtapas
      .filter(e => e.cadenciaId === etapa.cadenciaId)
      .sort((a, b) => a.dia - b.dia || a.ordem - b.ordem);
    const nome = cadencias.find(c => c.id === etapa.cadenciaId)?.nome ?? '';
    return `${nome} · etapa ${irmas.indexOf(etapa) + 1}/${irmas.length}`;
  }, [acaoDoLead?.cadenciaEtapaId, cadEtapas, cadencias]);

  // Realtime: a migration publica todas as tabelas do CRM no tópico 'crm-changes'.
  useEffect(() => {
    if (!currentUser) return;
    let cancelado = false;
    let canal: any = null;
    const mapa: Record<string, string> = {
      crm_leads: 'crmLeads',
      crm_lead_events: 'crmEvents',
      crm_next_actions: 'crmActions',
      crm_event_types: 'crmEventTypes',
      crm_origens: 'crmOrigens',
      crm_faixas_investimento: 'crmFaixas',
      crm_cadencias: 'crmCadencias',
      crm_cadencia_etapas: 'crmCadenciaEtapas',
      crm_config: 'crmConfig',
    };

    (async () => {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      if (cancelado) return;

      const handler = (msg: any) => {
        const p = msg?.payload?.table !== undefined ? msg.payload : (msg?.payload?.payload ?? msg?.payload ?? {});
        const chave = mapa[p.table];
        if (chave) queryClient.invalidateQueries({ queryKey: [chave] });
      };
      canal = supabase
        .channel('crm-changes', { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, handler)
        .on('broadcast', { event: 'UPDATE' }, handler)
        .on('broadcast', { event: 'DELETE' }, handler)
        .subscribe();
    })();

    return () => {
      cancelado = true;
      if (canal) import('../../lib/supabase').then(({ supabase }) => supabase.removeChannel(canal));
    };
  }, [currentUser?.id, queryClient]);

  // ── handlers ────────────────────────────────────────────────────────────────
  const abrirLead = (lead: CrmLead) => { setLeadNovo(null); setLeadAbertoId(lead.id); };
  const fecharLead = () => { setLeadNovo(null); setLeadAbertoId(null); };

  const salvarLead = async (dados: Parameters<typeof crm.saveCrmLead>[0]) => {
    const salvo = await crm.saveCrmLead(dados);
    invalidar('crmLeads', 'crmEvents');
    setLeadNovo(null);
    setLeadAbertoId(salvo.id);
  };

  const registrarEventoNoLead = async (lead: CrmLead, tipo: CrmEventType, detalhe?: string | null) => {
    await executar(
      () => crm.registrarCrmEvento({ leadId: lead.id, tipo, detalhe }),
      'crmEvents', 'crmLeads'
    );
  };

  /** Recorte vindo do Dashboard: leva ao kanban já filtrado. */
  const verNoKanban = (recorte: Parameters<React.ComponentProps<typeof CrmDashboard>['onVerNoKanban']>[0]) => {
    const base = { ...CRM_FILTROS_VAZIOS };
    if (recorte === 'atrasadas')    Object.assign(base, { proximaAcao: 'atrasadas' });
    if (recorte === 'agora')        Object.assign(base, { proximaAcao: 'agora' });
    if (recorte === 'hoje')         Object.assign(base, { proximaAcao: 'hoje' });
    if (recorte === 'novos')        Object.assign(base, { etapas: ['novo'] });
    if (recorte === 'aguardando')   Object.assign(base, { etapas: ['sem_resposta', 'parou_de_responder'] });
    if (recorte === 'enviados')     Object.assign(base, { enviadosCv: 'somente' });
    // "qualificados" não tem coluna própria — o kanban mostra tudo e o usuário lê os cards.
    setFiltros(base as CrmLeadFilters);
    setTab('leads');
  };

  const abas: { id: CrmTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'leads',     label: 'Leads' },
    { id: 'cadencias', label: 'Cadências' },
    { id: 'config',    label: 'Configurações' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#08080a]">
      <div className="flex items-center gap-4 xl:gap-6 view-pad-x pt-4 short:pt-2.5 border-b border-zinc-800/60 shrink-0 overflow-x-auto no-scrollbar">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => setTab(a.id)}
            className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              tab === a.id ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {a.label}
          </button>
        ))}
        <span className="ml-auto pb-3 short:pb-2 text-[10px] uppercase tracking-wider text-zinc-600 shrink-0">
          {role === 'administrador' ? 'Administrador' : role === 'sdr' ? 'SDR' : 'Gestão'}
        </span>
      </div>

      {erroGlobal && (
        <div className="view-pad-x py-1.5 bg-rose-500/[0.06] border-b border-rose-500/20 text-[11px] text-rose-300 flex items-center gap-2 shrink-0">
          {erroGlobal}
          <button onClick={() => setErroGlobal(null)} className="ml-auto text-rose-400/70 hover:text-rose-300">fechar</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        {tab === 'dashboard' && (
          <CrmDashboard
            leads={leads} acoes={acoes} projects={projects} users={allUsers} config={config}
            onOpenLead={abrirLead} onVerNoKanban={verNoKanban}
          />
        )}

        {tab === 'leads' && (
          <CrmLeadsKanban
            leads={leads} acoes={acoes} eventTypes={eventTypes} origens={origens} faixas={faixas}
            projects={projects} users={allUsers} config={config}
            filtros={filtros} onFiltrosChange={setFiltros}
            podeEditar={podeEditar}
            onOpenLead={abrirLead}
            onNovoLead={etapa => { setLeadAbertoId(null); setLeadNovo(novoLeadVazio(etapa)); }}
            onMoverLead={(id, etapa) => executar(() => crm.moveCrmLead(id, etapa), 'crmLeads', 'crmEvents')}
            onRegistrarEvento={(lead, tipo) => registrarEventoNoLead(lead, tipo)}
          />
        )}

        {tab === 'cadencias' && (
          <CrmCadencias
            cadencias={cadencias} etapas={cadEtapas} podeEditar={isAdmin}
            onSalvarCadencia={c => executar(() => crm.saveCrmCadencia(c), 'crmCadencias')}
            onExcluirCadencia={id => executar(() => crm.deleteCrmCadencia(id), 'crmCadencias', 'crmCadenciaEtapas')}
            onSalvarEtapa={e => executar(() => crm.saveCrmCadenciaEtapa(e), 'crmCadenciaEtapas')}
            onExcluirEtapa={id => executar(() => crm.deleteCrmCadenciaEtapa(id), 'crmCadenciaEtapas')}
          />
        )}

        {tab === 'config' && (
          <CrmSettings
            origens={origens} faixas={faixas} eventTypes={eventTypes} config={config}
            projects={projects} users={allUsers} isAdmin={isAdmin}
            onSalvarOrigem={o => executar(() => crm.saveCrmOrigem(o), 'crmOrigens')}
            onExcluirOrigem={id => executar(() => crm.deleteCrmOrigem(id), 'crmOrigens')}
            onSalvarFaixa={f => executar(() => crm.saveCrmFaixa(f), 'crmFaixas')}
            onExcluirFaixa={id => executar(() => crm.deleteCrmFaixa(id), 'crmFaixas')}
            onSalvarEventType={t => executar(() => crm.saveCrmEventType(t), 'crmEventTypes')}
            onExcluirEventType={id => executar(() => crm.deleteCrmEventType(id), 'crmEventTypes')}
            onSalvarConfig={c => executar(() => crm.saveCrmConfig(c), 'crmConfig')}
            onSalvarRole={async (user, novoPapel) => {
              await executar(() => crm.salvarCrmRole(user.id, novoPapel, user.preferences));
              await refreshUsers();
            }}
          />
        )}
      </div>

      <AnimatePresence>
        {leadAberto && (
          <CrmLeadSheet
            key={leadAberto.id || 'novo'}
            lead={leadAberto}
            isNovo={!leadAberto.id}
            eventos={eventosDoLead}
            acao={acaoDoLead}
            cadenciaDaAcao={cadenciaDaAcao}
            eventTypes={eventTypes}
            origens={origens}
            faixas={faixas}
            projects={projects}
            users={allUsers}
            config={config}
            podeEditar={podeEditar}
            onClose={fecharLead}
            onSalvar={salvarLead}
            onExcluir={id => executar(() => crm.deleteCrmLead(id), 'crmLeads', 'crmEvents', 'crmActions')}
            onRegistrarEvento={(tipo, detalhe) => registrarEventoNoLead(leadAberto, tipo, detalhe)}
            onExcluirEvento={id => executar(() => crm.deleteCrmEvento(id), 'crmEvents')}
            onSalvarAcao={dados => executar(
              () => crm.salvarProximaAcao({ ...dados, leadId: leadAberto.id }), 'crmActions')}
            onConcluirAcao={id => executar(() => crm.concluirProximaAcao(id), 'crmActions')}
            onCancelarAcao={id => executar(() => crm.cancelarProximaAcao(id), 'crmActions')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

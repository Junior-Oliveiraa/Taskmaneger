import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Project, Task } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePermissoes } from '../../lib/permissoes';
import {
  CANAIS, copyDoPost, ehPost, etapaDoPost, fetchFontesPrevia, idsDasFontes, imagemDoPost,
  inicioSemana, isoDia, nomeMes, numeroSemana, rotuloIntervalo, somaDias,
} from '../../lib/redeSocial';
import { AcoesPost, Pessoa, PostView } from './shared';
import ProducaoTab from './ProducaoTab';
import SemanasTab from './SemanasTab';
import CalendarioTab, { ModoCalendario } from './CalendarioTab';

type Aba = 'producao' | 'semanas' | 'calendario';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'producao', label: 'Produção' },
  { id: 'semanas', label: 'Semanas' },
  { id: 'calendario', label: 'Calendário' },
];

const CHAVE_ABA = 'orbit.redeSocial.aba';
const CHAVE_MODO = 'orbit.redeSocial.modoCalendario';

const lerLocal = <T extends string>(chave: string, validos: readonly T[], padrao: T): T => {
  try {
    const v = localStorage.getItem(chave) as T | null;
    return v && validos.includes(v) ? v : padrao;
  } catch {
    return padrao;
  }
};
const gravarLocal = (chave: string, v: string) => {
  try { localStorage.setItem(chave, v); } catch { /* sem storage: só não lembra */ }
};

interface Props {
  tasks: Task[];
  projects: Project[];
  onSelectTask: (task: Task) => void;
  onUpdateTask: (updates: Partial<Task> & { id: string }) => void;
  onNewPost: (dueDate?: string) => void;
}

export default function RedeSocialView({ tasks, projects, onSelectTask, onUpdateTask, onNewPost }: Props) {
  const { currentUser, allUsers } = useAuth();
  const { addNotification } = useNotifications();
  const { pode } = usePermissoes();
  const podeEditar = pode('tarefas', 'editar');
  const meuId = currentUser?.id;

  const [aba, setAbaState] = useState<Aba>(() => lerLocal(CHAVE_ABA, ['producao', 'semanas', 'calendario'] as const, 'producao'));
  const [modo, setModoState] = useState<ModoCalendario>(() => lerLocal(CHAVE_MODO, ['semana', 'mes'] as const, 'semana'));
  const [semana, setSemana] = useState<Date>(() => inicioSemana(new Date()));
  const [mes, setMes] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [filtroProjeto, setFiltroProjeto] = useState('');
  const [filtroCanal, setFiltroCanal] = useState('');

  const setAba = (a: Aba) => { setAbaState(a); gravarLocal(CHAVE_ABA, a); };
  const setModo = (m: ModoCalendario) => {
    setModoState(m);
    gravarLocal(CHAVE_MODO, m);
    if (m === 'mes') {
      const meio = somaDias(semana, 3);
      setMes(new Date(meio.getFullYear(), meio.getMonth(), 1));
    }
  };

  const hoje = isoDia(new Date());
  const semanaAtual = inicioSemana(new Date());
  const semIni = isoDia(semana);
  const semFim = isoDia(somaDias(semana, 6));
  const ehSemanaAtual = semIni === isoDia(semanaAtual);
  const naVisaoMes = aba === 'calendario' && modo === 'mes';

  // ── Posts ──────────────────────────────────────────────────────────────
  const porId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const todosPosts = useMemo(() => tasks.filter(t => ehPost(t, porId)), [tasks, porId]);
  const filtrados = useMemo(() => todosPosts.filter(t =>
    (!filtroProjeto || t.projectId === filtroProjeto) &&
    (!filtroCanal || (t.socialMediaApproval?.canal || '') === filtroCanal)
  ), [todosPosts, filtroProjeto, filtroCanal]);

  // Intervalo que aparece com prévia: só ele busca as peças no banco.
  const [rIni, rFim] = useMemo(() => {
    if (naVisaoMes) {
      const ini = inicioSemana(mes);
      const fim = somaDias(inicioSemana(new Date(mes.getFullYear(), mes.getMonth() + 1, 0)), 6);
      return [isoDia(ini), isoDia(fim)];
    }
    return [semIni, semFim];
  }, [naVisaoMes, mes, semIni, semFim]);

  const naTela = useMemo(() => filtrados.filter(t => {
    if (aba === 'semanas') return false;
    if (t.dueDate && t.dueDate >= rIni && t.dueDate <= rFim) return true;
    // A produção da semana atual também carrega o que ficou para trás.
    return aba === 'producao' && ehSemanaAtual && etapaDoPost(t) !== 'concluido' && (!t.dueDate || t.dueDate < semIni);
  }), [filtrados, aba, rIni, rFim, ehSemanaAtual, semIni]);

  const idsFontes = useMemo(() => idsDasFontes(naTela), [naTela]);
  const { data: fontes } = useQuery({
    queryKey: ['redeSocialPrevias', idsFontes.join(',')],
    queryFn: () => fetchFontesPrevia(idsFontes),
    enabled: idsFontes.length > 0,
    staleTime: 60_000,
    placeholderData: prev => prev,
  });

  const projetoPorId = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const montar = useCallback((t: Task): PostView => {
    const etapa = etapaDoPost(t);
    const a = t.socialMediaApproval;
    return {
      task: t,
      etapa,
      data: t.dueDate || undefined,
      imagem: imagemDoPost(t, fontes),
      copy: copyDoPost(t, fontes),
      canal: a?.canal,
      formato: a?.formato,
      horario: a?.horario,
      projeto: projetoPorId.get(t.projectId),
      atrasado: !!t.dueDate && t.dueDate < hoje && etapa !== 'concluido',
      souAprovador: etapa === 'aprovacao' && a?.status === 'review_requested' && !!meuId && a?.approverId === meuId,
    };
  }, [fontes, projetoPorId, hoje, meuId]);

  const postsNaTela = useMemo(() => naTela.map(montar), [naTela, montar]);

  const semanas = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const inicio = somaDias(semanaAtual, (i - 1) * 7);
    const a = isoDia(inicio), b = isoDia(somaDias(inicio, 6));
    return { inicio, posts: filtrados.filter(t => t.dueDate && t.dueDate >= a && t.dueDate <= b).map(montar) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtrados, montar, isoDia(semanaAtual)]);

  const postsDaSemana = useMemo(
    () => filtrados.filter(t => t.dueDate && t.dueDate >= semIni && t.dueDate <= semFim).map(montar),
    [filtrados, semIni, semFim, montar]
  );
  const aguardandoMinha = useMemo(
    () => todosPosts.map(montar).filter(p => p.souAprovador).sort((a, b) => (a.data || '9').localeCompare(b.data || '9')),
    [todosPosts, montar]
  );

  // ── Ações ──────────────────────────────────────────────────────────────
  const abrirSecaoSocial = () => setTimeout(() => {
    window.dispatchEvent(new CustomEvent('openTaskSection', { detail: { section: 'socialMediaProps', targetId: 'socialMediaProps' } }));
  }, 400);

  const acoes: AcoesPost = {
    podeEditar,
    abrir: (task) => {
      onSelectTask(task);
      if (ehPost(task, porId)) abrirSecaoSocial();
    },
    novoPost: (data) => onNewPost(data),
    aprovar: (post) => {
      const a = post.task.socialMediaApproval || {};
      onUpdateTask({ id: post.task.id, status: 'done', socialMediaApproval: { ...a, status: 'approved' } });
      if (a.requesterId) {
        addNotification({
          userId: a.requesterId,
          taskId: post.task.id,
          targetId: 'socialMediaProps',
          type: 'approved',
          actorId: meuId || '',
          message: 'Publicação Aprovada',
          details: `Sua publicação de "${post.task.title}" foi aprovada e a tarefa foi concluída.`,
        });
      }
    },
    pedirRefacao: (post) => {
      const a = post.task.socialMediaApproval || {};
      onUpdateTask({ id: post.task.id, socialMediaApproval: { ...a, status: 'rejected' } });
      if (a.requesterId) {
        addNotification({
          userId: a.requesterId,
          taskId: post.task.id,
          targetId: 'socialMediaProps',
          type: 'rejected',
          actorId: meuId || '',
          message: 'Publicação Reprovada',
          details: `Sua publicação de "${post.task.title}" foi reprovada e precisa de ajustes.`,
        });
      }
      // Abre o post no painel para quem pediu a refação deixar o motivo no chat.
      onSelectTask({ ...post.task, socialMediaApproval: { ...a, status: 'rejected' } });
      abrirSecaoSocial();
    },
  };

  const alternarSubtarefa = (task: Task, subtaskId: string) => {
    const agora = new Date().toISOString();
    onUpdateTask({
      id: task.id,
      subtasks: task.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed, completedAt: !s.completed ? agora : undefined } : s),
    });
  };

  const pessoa = useCallback((id?: string): Pessoa | undefined => {
    if (!id) return undefined;
    const u = allUsers.find(x => x.id === id);
    return u ? { id: u.id, name: u.name, initials: u.initials, avatarUrl: u.avatarUrl } : undefined;
  }, [allUsers]);

  const filhos = useCallback((postId: string) => tasks.filter(t => t.parentTaskId === postId), [tasks]);

  // ── Navegação de período ───────────────────────────────────────────────
  const mover = (dir: -1 | 1) => {
    if (naVisaoMes) setMes(m => new Date(m.getFullYear(), m.getMonth() + dir, 1));
    else setSemana(s => somaDias(s, dir * 7));
  };
  const irParaHoje = () => {
    setSemana(inicioSemana(new Date()));
    setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };

  // Atalhos ← → para trocar de período, fora de campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') mover(-1);
      if (e.key === 'ArrowRight') mover(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const titulo = aba === 'producao' ? 'Produção da semana' : aba === 'semanas' ? 'Semanas' : 'Calendário de postagens';
  const subtitulo = naVisaoMes
    ? `${nomeMes(mes.getMonth()).replace(/^./, c => c.toUpperCase())} de ${mes.getFullYear()}`
    : `Semana ${numeroSemana(semana)} · ${rotuloIntervalo(semana)}`;
  const naHoje = naVisaoMes
    ? mes.getMonth() === new Date().getMonth() && mes.getFullYear() === new Date().getFullYear()
    : ehSemanaAtual;

  const campo = 'h-8 rounded-md border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 text-xs text-zinc-200 px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-colors';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Abas */}
      <div role="tablist" aria-label="Rede Social" className="flex items-center gap-4 xl:gap-6 view-pad-x pt-4 short:pt-2.5 border-b border-zinc-800/60 shrink-0 overflow-x-auto no-scrollbar bg-[#08080a]">
        {ABAS.map(a => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`pb-3 short:pb-2 text-sm short:text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              aba === a.id ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Cabeçalho e filtros */}
      <div className="view-pad-x pt-4 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">{titulo}</h1>
          <div className="text-xs text-zinc-500">{aba === 'semanas' ? 'O mês em semanas e o que falta fazer na semana escolhida' : subtitulo}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aba === 'calendario' && (
            <div className="flex p-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60" role="group" aria-label="Visão do calendário">
              {(['semana', 'mes'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={modo === m}
                  onClick={() => setModo(m)}
                  className={`h-7 px-3 rounded text-[11px] font-semibold transition-colors ${modo === m ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {m === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          )}

          {aba !== 'semanas' && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => mover(-1)} aria-label={naVisaoMes ? 'Mês anterior' : 'Semana anterior'} title="Anterior (←)" className={`${campo} w-8 px-0 flex items-center justify-center`}>
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button type="button" onClick={irParaHoje} disabled={naHoje} className={`${campo} font-medium disabled:opacity-40 disabled:hover:border-zinc-800`}>
                Hoje
              </button>
              <button type="button" onClick={() => mover(1)} aria-label={naVisaoMes ? 'Próximo mês' : 'Próxima semana'} title="Próximo (→)" className={`${campo} w-8 px-0 flex items-center justify-center`}>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          <label className="sr-only" htmlFor="rs-projeto">Empreendimento</label>
          <select id="rs-projeto" value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)} className={`${campo} max-w-[200px]`}>
            <option value="">Todos os empreendimentos</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className="sr-only" htmlFor="rs-canal">Canal</label>
          <select id="rs-canal" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} className={campo}>
            <option value="">Todos os canais</option>
            {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {podeEditar && (
            <button
              type="button"
              onClick={() => onNewPost()}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold transition-colors"
            >
              <Plus size={13} aria-hidden="true" /> Novo post
            </button>
          )}
        </div>
      </div>

      {aba === 'producao' && <ProducaoTab posts={postsNaTela} pessoa={pessoa} acoes={acoes} />}

      {aba === 'semanas' && (
        <SemanasTab
          semanas={semanas}
          semanaSelecionada={semana}
          onSelecionarSemana={setSemana}
          onAbrirProducao={(s) => { setSemana(s); setAba('producao'); }}
          postsDaSemana={postsDaSemana}
          aguardandoMinha={aguardandoMinha}
          filhos={filhos}
          pessoa={pessoa}
          meuId={meuId}
          acoes={acoes}
          onAlternarSubtarefa={alternarSubtarefa}
        />
      )}

      {aba === 'calendario' && (
        <CalendarioTab
          modo={modo}
          inicio={semana}
          mes={mes}
          posts={postsNaTela}
          acoes={acoes}
          onIrParaSemana={(s) => { setSemana(s); setModo('semana'); }}
        />
      )}
    </div>
  );
}

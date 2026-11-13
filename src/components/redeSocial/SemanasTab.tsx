import React, { useMemo } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { Task } from '../../types';
import { ETAPAS, isoDia, numeroSemana, rotuloDia, rotuloDiaCurto, rotuloIntervalo } from '../../lib/redeSocial';
import { AcoesPost, Avatar, Pessoa, PostView, Vazio } from './shared';

interface Semana {
  inicio: Date;
  posts: PostView[];
}

interface Props {
  semanas: Semana[];
  semanaSelecionada: Date;
  onSelecionarSemana: (inicio: Date) => void;
  onAbrirProducao: (inicio: Date) => void;
  postsDaSemana: PostView[];
  aguardandoMinha: PostView[];
  filhos: (postId: string) => Task[];
  pessoa: (id?: string) => Pessoa | undefined;
  meuId?: string;
  acoes: AcoesPost;
  onAlternarSubtarefa: (task: Task, subtaskId: string) => void;
}

interface Pendencia {
  key: string;
  texto: string;
  contexto: string;
  pessoaId?: string;
  /** Item de checklist: marca direto daqui. */
  subtarefa?: { task: Task; id: string };
  abrir: Task;
  destaque?: boolean;
}

function pendenciasDoPost(p: PostView, filhos: Task[], meuId?: string): Pendencia[] {
  const contexto = [p.task.title || 'Post sem título', p.canal].filter(Boolean).join(' · ');
  const itens: Pendencia[] = [];
  const a = p.task.socialMediaApproval;

  if (p.etapa === 'aprovacao') {
    itens.push(p.souAprovador
      ? { key: `${p.task.id}-apr`, texto: 'Aprovar a publicação', contexto, pessoaId: meuId, abrir: p.task, destaque: true }
      : { key: `${p.task.id}-apr`, texto: 'Aguardando aprovação', contexto, pessoaId: a?.approverId, abrir: p.task });
  } else if (p.etapa === 'refacao') {
    itens.push({ key: `${p.task.id}-ref`, texto: 'Ajustar e reenviar para aprovação', contexto, pessoaId: p.task.assigneeId, abrir: p.task });
  } else {
    const abertos = filhos.filter(f => f.status !== 'done');
    for (const f of abertos) {
      const tipo = f.labels.find(l => l.name === 'Design' || l.name === 'Copy')?.name;
      itens.push({ key: f.id, texto: tipo ? `${tipo}: ${f.title}` : f.title, contexto, pessoaId: f.assigneeId, abrir: f });
    }
    if (abertos.length === 0) {
      itens.push({ key: `${p.task.id}-env`, texto: p.imagem ? 'Enviar para aprovação' : 'Montar a peça e enviar para aprovação', contexto, pessoaId: p.task.assigneeId, abrir: p.task });
    }
  }

  for (const s of p.task.subtasks) {
    if (s.completed || s.canceled) continue;
    itens.push({ key: s.id, texto: s.title, contexto, pessoaId: s.assigneeId || p.task.assigneeId, subtarefa: { task: p.task, id: s.id }, abrir: p.task });
  }
  return itens;
}

export default function SemanasTab(props: Props) {
  const { semanas, semanaSelecionada, postsDaSemana, aguardandoMinha, filhos, pessoa, meuId, acoes } = props;
  const hoje = isoDia(new Date());
  const selIso = isoDia(semanaSelecionada);

  const grupos = useMemo(() => {
    const abertos = postsDaSemana
      .filter(p => p.etapa !== 'concluido')
      .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.horario || '').localeCompare(b.horario || ''));
    const mapa = new Map<string, Pendencia[]>();
    for (const p of abertos) {
      const chave = p.data || 'sem-data';
      const lista = mapa.get(chave) || [];
      lista.push(...pendenciasDoPost(p, filhos(p.task.id), meuId));
      mapa.set(chave, lista);
    }
    return [...mapa.entries()];
  }, [postsDaSemana, filhos, meuId]);

  const totalPendencias = grupos.reduce((n, [, l]) => n + l.length, 0);
  const concluidos = postsDaSemana.filter(p => p.etapa === 'concluido');
  const conta = (e: string) => postsDaSemana.filter(p => p.etapa === e).length;
  const porCanal = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of postsDaSemana) m.set(p.canal || 'Sem canal', (m.get(p.canal || 'Sem canal') || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [postsDaSemana]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal view-pad flex flex-col gap-6">
      {/* Linha das semanas */}
      <section aria-label="Semanas" className="overflow-x-auto scrollbar-minimal -mx-1 px-1">
        <div className="grid grid-cols-5 gap-3 min-w-[860px]">
          {semanas.map(s => {
            const iso = isoDia(s.inicio);
            const ativa = iso === selIso;
            const atual = hoje >= iso && hoje <= isoDia(new Date(s.inicio.getFullYear(), s.inicio.getMonth(), s.inicio.getDate() + 6));
            const n = s.posts.length;
            const feitos = s.posts.filter(p => p.etapa === 'concluido').length;
            const passada = !atual && iso < hoje;
            const tag = atual ? 'Atual' : passada ? 'Passada' : n === 0 ? 'Vazia' : s.posts.every(p => p.etapa === 'a_fazer') ? 'Planejando' : 'Em produção';
            return (
              <button
                key={iso}
                type="button"
                onClick={() => props.onSelecionarSemana(s.inicio)}
                onDoubleClick={() => props.onAbrirProducao(s.inicio)}
                aria-pressed={ativa}
                className={`text-left flex flex-col gap-2.5 p-3.5 rounded-xl border transition-colors ${
                  ativa ? 'bg-zinc-900/70 border-zinc-500' : n === 0 ? 'border-dashed border-zinc-800 hover:border-zinc-700' : 'bg-zinc-950/40 border-zinc-800/70 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-zinc-100">Semana {numeroSemana(s.inicio)}</span>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${atual ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800/80 text-zinc-300'}`}>{tag}</span>
                </div>
                <span className="text-[11px] text-zinc-500">{rotuloIntervalo(s.inicio)}</span>
                <div className="h-2 rounded-full bg-zinc-900 flex overflow-hidden" aria-hidden="true">
                  {ETAPAS.map(e => {
                    const k = s.posts.filter(p => p.etapa === e.id).length;
                    return k > 0 ? <div key={e.id} style={{ flexGrow: k, background: e.cor }} /> : null;
                  })}
                </div>
                <span className="text-[11px] text-zinc-400">
                  {n === 0 ? 'Nenhum post planejado' : `${n} ${n === 1 ? 'post' : 'posts'} · ${feitos} ${feitos === 1 ? 'concluído' : 'concluídos'}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-zinc-500">
          {ETAPAS.map(e => (
            <span key={e.id} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: e.cor }} aria-hidden="true" />{e.label}
            </span>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-5 items-start">
        {/* O que fazer */}
        <section className="flex-[999_1_460px] min-w-0 flex flex-col gap-3 p-4 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">O que fazer · Semana {numeroSemana(semanaSelecionada)}</h2>
            <span className="text-[11px] text-zinc-500">{totalPendencias} {totalPendencias === 1 ? 'pendência' : 'pendências'}</span>
          </header>

          {grupos.length === 0 && concluidos.length === 0 && (
            <Vazio titulo="Semana livre" texto="Nenhum post com data nesta semana." />
          )}

          {grupos.map(([dia, itens]) => (
            <div key={dia} className="flex flex-col gap-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 pt-1.5">
                {dia === 'sem-data' ? 'Sem data' : rotuloDia(dia)}{dia === hoje ? ' · hoje' : dia < hoje ? ' · atrasado' : ''}
              </div>
              {itens.map(it => (
                <div
                  key={it.key}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${it.destaque ? 'border-amber-500/25 bg-amber-500/5' : 'border-zinc-900 hover:border-zinc-800'}`}
                >
                  {it.subtarefa ? (
                    <button
                      type="button"
                      disabled={!acoes.podeEditar}
                      onClick={() => props.onAlternarSubtarefa(it.subtarefa!.task, it.subtarefa!.id)}
                      aria-label={`Concluir: ${it.texto}`}
                      className="w-5 h-5 shrink-0 rounded-md border-2 border-zinc-600 hover:border-emerald-400 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <Check size={11} className="text-emerald-400 opacity-0 group-hover:opacity-60" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className={`w-1.5 h-1.5 mx-[7px] shrink-0 rounded-full ${it.destaque ? 'bg-amber-400' : 'bg-zinc-600'}`} aria-hidden="true" />
                  )}
                  <button type="button" onClick={() => acoes.abrir(it.abrir)} className="flex-1 min-w-0 text-left flex flex-col gap-0.5">
                    <span className={`text-[13px] font-medium truncate ${it.destaque ? 'text-amber-200' : 'text-zinc-200'}`}>{it.texto}</span>
                    <span className="text-[11px] text-zinc-500 truncate">{it.contexto}</span>
                  </button>
                  <Avatar pessoa={pessoa(it.pessoaId)} size={22} />
                </div>
              ))}
            </div>
          ))}

          {concluidos.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 pt-1.5">Concluído esta semana</div>
              {concluidos.map(p => (
                <button
                  key={p.task.id}
                  type="button"
                  onClick={() => acoes.abrir(p.task)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-900 hover:border-zinc-800 text-left transition-colors"
                >
                  <span className="w-5 h-5 shrink-0 rounded-md bg-emerald-500/80 flex items-center justify-center" aria-hidden="true">
                    <Check size={12} className="text-zinc-950" />
                  </span>
                  <span className="flex-1 min-w-0 text-[13px] text-zinc-500 line-through truncate">{p.task.title}</span>
                  {p.data && <span className="text-[11px] text-zinc-500 shrink-0">{rotuloDiaCurto(p.data)}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Lateral */}
        <aside className="flex-[1_1_280px] min-w-0 flex flex-col gap-5">
          <section className="flex flex-col gap-2.5 p-4 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
            <h2 className="text-sm font-semibold text-zinc-100">Aguardando sua aprovação</h2>
            {aguardandoMinha.length === 0 ? (
              <p className="text-xs text-zinc-500">Nada pendente com você.</p>
            ) : aguardandoMinha.map(p => (
              <button
                key={p.task.id}
                type="button"
                onClick={() => acoes.abrir(p.task)}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 text-left transition-colors"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-amber-100 truncate">{p.task.title}</span>
                  <span className="text-[11px] text-amber-300/80 truncate">
                    {[p.canal, p.data ? `publica ${rotuloDiaCurto(p.data)}` : 'sem data'].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <ChevronRight size={14} className="text-amber-300/70 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </section>

          <section className="flex flex-col gap-3 p-4 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
            <h2 className="text-sm font-semibold text-zinc-100">Resumo da semana</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                [postsDaSemana.length, 'posts planejados'],
                [conta('concluido'), 'concluídos'],
                [conta('aprovacao'), 'em aprovação'],
                [conta('refacao'), 'em refação'],
              ].map(([n, l]) => (
                <div key={l as string} className="flex flex-col">
                  <span className="text-2xl font-bold text-zinc-100 tabular-nums">{n}</span>
                  <span className="text-[11px] text-zinc-500">{l}</span>
                </div>
              ))}
            </div>
            {porCanal.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-900">
                {porCanal.map(([canal, n]) => (
                  <div key={canal} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{canal}</span>
                    <span className="text-zinc-200 font-semibold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            )}
            {postsDaSemana.length > 0 && (
              <button
                type="button"
                onClick={() => props.onAbrirProducao(semanaSelecionada)}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 text-left"
              >
                Abrir no quadro de produção
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export type { Semana };

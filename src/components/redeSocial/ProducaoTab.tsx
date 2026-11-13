import React from 'react';
import { Plus } from 'lucide-react';
import { ETAPAS, Etapa, rotuloDiaCurto } from '../../lib/redeSocial';
import { AcoesPost, Avatar, BotoesAprovacao, Miniatura, Pessoa, PostView, Vazio } from './shared';

interface Props {
  posts: PostView[];
  pessoa: (id?: string) => Pessoa | undefined;
  acoes: AcoesPost;
}

export function rotuloAgenda(p: PostView): { texto: string; cor: string } {
  if (!p.data) return { texto: 'Sem data', cor: 'text-zinc-500' };
  const quando = rotuloDiaCurto(p.data) + (p.horario ? ` · ${p.horario}` : '');
  if (p.atrasado) return { texto: `Atrasado · ${quando}`, cor: 'text-red-400' };
  return { texto: quando, cor: 'text-zinc-400' };
}

function CardProducao({ post, pessoa, acoes }: { post: PostView; pessoa: Props['pessoa']; acoes: AcoesPost }) {
  const agenda = rotuloAgenda(post);
  const meta = [post.canal, post.projeto?.name].filter(Boolean).join(' · ');
  return (
    <article
      onClick={() => acoes.abrir(post.task)}
      className="group flex flex-col gap-2.5 p-2.5 bg-[#121214] hover:bg-[#161619] border border-zinc-900/80 hover:border-zinc-800 rounded-lg cursor-pointer transition-colors"
    >
      <Miniatura post={post} altura={112} />
      <div className="flex flex-col gap-1 min-w-0">
        <h3 className="text-[13px] font-semibold text-zinc-100 leading-snug line-clamp-2">{post.task.title || 'Post sem título'}</h3>
        {meta && <div className="text-[11px] text-zinc-500 truncate">{meta}</div>}
      </div>
      {post.etapa === 'refacao' && (
        <div className="text-[11px] leading-snug text-red-300 bg-red-500/10 border border-red-500/15 rounded-md px-2 py-1.5">
          Ajustes pedidos. Veja os comentários no post.
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-medium ${agenda.cor}`}>{agenda.texto}</span>
        <Avatar pessoa={pessoa(post.task.assigneeId)} size={22} />
      </div>
      <BotoesAprovacao post={post} acoes={acoes} />
    </article>
  );
}

export default function ProducaoTab({ posts, pessoa, acoes }: Props) {
  const porEtapa = (e: Etapa) => posts.filter(p => p.etapa === e);
  const total = posts.length;
  const concluidos = porEtapa('concluido').length;
  const meus = posts.filter(p => p.souAprovador).length;

  if (total === 0) {
    return (
      <div className="view-pad">
        <Vazio
          titulo="Nenhum post nesta semana"
          texto="Os posts são tarefas com a etiqueta Social Media. A data de publicação é o prazo da tarefa."
          acao={acoes.podeEditar && (
            <button type="button" onClick={() => acoes.novoPost()} className="mt-2 h-9 px-4 rounded-md bg-zinc-100 text-zinc-900 text-xs font-semibold hover:bg-white transition-colors">
              Novo post
            </button>
          )}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Progresso da semana */}
      <div className="view-pad-x pt-4 shrink-0">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
          <div className="text-[13px] font-semibold text-zinc-100">
            {concluidos} de {total} {total === 1 ? 'post concluído' : 'posts concluídos'}
          </div>
          <div className="flex-1 min-w-[160px] h-2 rounded-full bg-zinc-900 flex overflow-hidden" role="img" aria-label="Distribuição dos posts por etapa">
            {ETAPAS.map(e => {
              const n = porEtapa(e.id).length;
              return n > 0 ? <div key={e.id} style={{ flexGrow: n, background: e.cor }} title={`${e.label}: ${n}`} /> : null;
            })}
          </div>
          {meus > 0 ? (
            <div className="text-xs font-medium text-amber-300">
              {meus} {meus === 1 ? 'aguarda' : 'aguardam'} a sua aprovação
            </div>
          ) : (
            <div className="text-xs text-zinc-500">Nada aguardando a sua aprovação</div>
          )}
        </div>
      </div>

      {/* Colunas */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal view-pad">
        <div className="grid grid-cols-5 gap-3 min-w-[1040px] items-start">
          {ETAPAS.map(e => {
            const lista = porEtapa(e.id);
            return (
              <section key={e.id} className="flex flex-col gap-2.5 p-2 rounded-xl bg-zinc-950/50 border border-zinc-900/80">
                <header className="flex items-center gap-2 px-1.5 pt-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: e.cor }} aria-hidden="true" />
                  <h2 className="text-xs font-semibold text-zinc-200">{e.label}</h2>
                  <span className="ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-800/50 border border-zinc-700/40 rounded px-1.5 py-0.5">{lista.length}</span>
                </header>
                {lista.map(p => <CardProducao key={p.task.id} post={p} pessoa={pessoa} acoes={acoes} />)}
                {lista.length === 0 && (
                  <div className="h-20 rounded-lg border border-dashed border-zinc-900 flex items-center justify-center text-[11px] text-zinc-600">Vazio</div>
                )}
                {e.id === 'a_fazer' && acoes.podeEditar && (
                  <button
                    type="button"
                    onClick={() => acoes.novoPost()}
                    className="h-9 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
                  >
                    <Plus size={12} aria-hidden="true" /> Novo post
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

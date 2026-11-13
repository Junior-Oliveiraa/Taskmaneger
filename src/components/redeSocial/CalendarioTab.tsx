import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { DIAS_CURTOS, ETAPAS, etapaInfo, inicioSemana, isoDia, somaDias } from '../../lib/redeSocial';
import { AcoesPost, BotoesAprovacao, EtapaChip, Miniatura, PostView } from './shared';

export type ModoCalendario = 'semana' | 'mes';

interface Props {
  modo: ModoCalendario;
  inicio: Date;
  /** Primeiro dia do mês exibido na visão Mês. */
  mes: Date;
  posts: PostView[];
  acoes: AcoesPost;
  onIrParaSemana: (inicio: Date) => void;
}

const ordenar = (a: PostView, b: PostView) => (a.horario || '99').localeCompare(b.horario || '99');

function CardDia({ post, acoes }: { post: PostView; acoes: AcoesPost }) {
  return (
    <article
      onClick={() => acoes.abrir(post.task)}
      className="flex flex-col gap-2 p-2 bg-[#121214] hover:bg-[#161619] border border-zinc-900/80 hover:border-zinc-800 rounded-lg cursor-pointer transition-colors"
      style={{ borderTop: `3px solid ${etapaInfo(post.etapa).cor}` }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-bold text-zinc-200 tabular-nums">{post.horario || '--:--'}</span>
        {post.canal && <span className="text-[10px] font-semibold text-zinc-300 bg-zinc-800/80 rounded px-1.5 py-0.5 truncate">{post.canal}</span>}
      </div>
      <Miniatura post={post} proporcional />
      <h3 className="text-[12px] font-semibold text-zinc-100 leading-snug line-clamp-2">{post.task.title || 'Post sem título'}</h3>
      {post.copy ? (
        <p className="text-[11px] leading-relaxed text-zinc-400 line-clamp-4">{post.copy}</p>
      ) : (
        <p className="text-[11px] italic text-zinc-600">Sem legenda ainda</p>
      )}
      <EtapaChip etapa={post.etapa} className="self-start" />
      <BotoesAprovacao post={post} acoes={acoes} />
    </article>
  );
}

function Semana({ inicio, posts, acoes }: { inicio: Date; posts: PostView[]; acoes: AcoesPost }) {
  const hoje = isoDia(new Date());
  const dias = Array.from({ length: 7 }, (_, i) => isoDia(somaDias(inicio, i)));
  return (
    <div className="grid grid-cols-7 gap-2 min-w-[1050px] items-start">
      {dias.map((dia, i) => {
        const doDia = posts.filter(p => p.data === dia).sort(ordenar);
        const ehHoje = dia === hoje;
        return (
          <section
            key={dia}
            aria-label={`${DIAS_CURTOS[i]} ${Number(dia.slice(8))}`}
            className={`group/dia flex flex-col gap-2 p-1.5 rounded-xl border ${ehHoje ? 'bg-zinc-900/40 border-zinc-600' : 'bg-zinc-950/40 border-zinc-900/80'}`}
          >
            <header className="flex items-center justify-between px-1.5 pt-1 pb-1">
              <span className="text-[10px] font-bold tracking-wider text-zinc-500">{DIAS_CURTOS[i]}</span>
              <span className={`text-sm font-bold tabular-nums rounded-full px-2 ${ehHoje ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-200'}`}>{Number(dia.slice(8))}</span>
            </header>
            {doDia.map(p => <CardDia key={p.task.id} post={p} acoes={acoes} />)}
            {acoes.podeEditar && (
              <button
                type="button"
                onClick={() => acoes.novoPost(dia)}
                aria-label={`Adicionar post em ${DIAS_CURTOS[i]} ${Number(dia.slice(8))}`}
                className={`h-9 flex items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-800 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-all ${
                  doDia.length > 0 ? 'opacity-0 group-hover/dia:opacity-100 focus:opacity-100' : ''
                }`}
              >
                <Plus size={12} aria-hidden="true" /> {doDia.length === 0 ? 'Adicionar post' : 'Adicionar'}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Mes({ mes, posts, onIrParaSemana }: { mes: Date; posts: PostView[]; onIrParaSemana: (d: Date) => void }) {
  const hoje = isoDia(new Date());
  const semanas = useMemo(() => {
    const primeiro = inicioSemana(mes);
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const lista: Date[] = [];
    for (let s = primeiro; s <= ultimo; s = somaDias(s, 7)) lista.push(s);
    return lista;
  }, [mes]);

  return (
    <div className="min-w-[860px] flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS_CURTOS.map(d => <div key={d} className="text-[10px] font-bold tracking-wider text-zinc-500 px-2">{d}</div>)}
      </div>
      {semanas.map(s => (
        <button
          key={isoDia(s)}
          type="button"
          onClick={() => onIrParaSemana(s)}
          title="Abrir esta semana"
          className="grid grid-cols-7 gap-1.5 text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 hover:bg-zinc-900/30 transition-colors"
        >
          {Array.from({ length: 7 }, (_, i) => {
            const d = somaDias(s, i);
            const dia = isoDia(d);
            const foraDoMes = d.getMonth() !== mes.getMonth();
            const doDia = posts.filter(p => p.data === dia).sort(ordenar);
            return (
              <div
                key={dia}
                className={`min-h-[104px] flex flex-col gap-1.5 p-2 rounded-lg border ${dia === hoje ? 'border-zinc-600 bg-zinc-900/40' : 'border-zinc-900/80 bg-zinc-950/40'} ${foraDoMes ? 'opacity-40' : ''}`}
              >
                <span className={`self-end text-xs font-bold tabular-nums rounded-full px-1.5 ${dia === hoje ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300'}`}>{d.getDate()}</span>
                <div className="flex flex-wrap gap-1">
                  {doDia.slice(0, 4).map(p => (
                    <span
                      key={p.task.id}
                      title={`${p.horario ? p.horario + ' · ' : ''}${p.task.title} · ${etapaInfo(p.etapa).label}`}
                      className="relative w-9 h-9 rounded-md overflow-hidden bg-zinc-900 border border-zinc-800"
                    >
                      {p.imagem && <img src={p.imagem} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      <span className="absolute right-0.5 bottom-0.5 w-2 h-2 rounded-full ring-2 ring-zinc-950" style={{ background: etapaInfo(p.etapa).cor }} />
                    </span>
                  ))}
                  {doDia.length > 4 && (
                    <span className="w-9 h-9 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-400">+{doDia.length - 4}</span>
                  )}
                </div>
              </div>
            );
          })}
        </button>
      ))}
    </div>
  );
}

export default function CalendarioTab({ modo, inicio, mes, posts, acoes, onIrParaSemana }: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="view-pad-x pt-4 shrink-0 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        {ETAPAS.map(e => (
          <span key={e.id} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: e.cor }} aria-hidden="true" />{e.label}
          </span>
        ))}
        <span className="ml-auto hidden md:inline">
          {modo === 'semana' ? 'Clique em um post para abrir, ler a legenda completa e aprovar.' : 'Clique em uma semana para ver os posts em detalhe.'}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal view-pad">
        {modo === 'semana'
          ? <Semana inicio={inicio} posts={posts} acoes={acoes} />
          : <Mes mes={mes} posts={posts} onIrParaSemana={onIrParaSemana} />}
      </div>
    </div>
  );
}

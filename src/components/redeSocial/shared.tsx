import React from 'react';
import { ImageOff } from 'lucide-react';
import type { Project, Task } from '../../types';
import { Etapa, etapaInfo, formatoVertical } from '../../lib/redeSocial';

/** Um post já resolvido para as telas: etapa, prévia e agenda. */
export interface PostView {
  task: Task;
  etapa: Etapa;
  /** Data de publicação (prazo da tarefa), 'YYYY-MM-DD'. */
  data?: string;
  imagem?: string;
  copy: string;
  canal?: string;
  formato?: string;
  horario?: string;
  projeto?: Project;
  /** Passou da data sem ser concluído. */
  atrasado: boolean;
  /** Está em aprovação e o aprovador é o usuário logado. */
  souAprovador: boolean;
}

export interface Pessoa {
  id: string;
  name: string;
  initials?: string;
  avatarUrl?: string;
}

export interface AcoesPost {
  abrir: (task: Task) => void;
  aprovar: (post: PostView) => void;
  pedirRefacao: (post: PostView) => void;
  novoPost: (data?: string) => void;
  podeEditar: boolean;
}

export function EtapaChip({ etapa, className = '' }: { etapa: Etapa; className?: string }) {
  const e = etapaInfo(etapa);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2 py-0.5 ${e.fundo} ${e.texto} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.cor }} aria-hidden="true" />
      {e.label}
    </span>
  );
}

export function Avatar({ pessoa, size = 22 }: { pessoa?: Pessoa; size?: number }) {
  if (!pessoa) {
    return (
      <span
        title="Sem responsável"
        className="rounded-full border border-dashed border-zinc-700 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  if (pessoa.avatarUrl) {
    return (
      <img
        src={pessoa.avatarUrl}
        alt={pessoa.name}
        title={pessoa.name}
        className="rounded-full object-cover shrink-0 border border-zinc-800"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={pessoa.name}
      className="rounded-full bg-zinc-800 text-zinc-200 font-bold flex items-center justify-center shrink-0 border border-zinc-700/60"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}
    >
      {pessoa.initials || pessoa.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * Miniatura da peça. Respeita a proporção do formato (vertical para Reels,
 * Stories e Vídeo) quando `proporcional`; senão ocupa a altura fixa dada.
 */
export function Miniatura({ post, proporcional, altura = 112 }: { post: PostView; proporcional?: boolean; altura?: number }) {
  const vertical = formatoVertical(post.formato);
  const estilo: React.CSSProperties = proporcional
    ? { aspectRatio: vertical ? '9 / 16' : '4 / 5', maxHeight: vertical ? 260 : 220 }
    : { height: altura };
  return (
    <div className="relative w-full rounded-md overflow-hidden bg-zinc-900/70 border border-zinc-800/60" style={estilo}>
      {post.imagem ? (
        <img src={post.imagem} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-600">
          <ImageOff size={16} aria-hidden="true" />
          <span className="text-[10px] font-medium">Sem peça ainda</span>
        </div>
      )}
      {post.formato && (
        <span className="absolute left-1.5 bottom-1.5 text-[9px] font-semibold text-zinc-100 bg-black/65 rounded px-1.5 py-0.5 backdrop-blur-sm">
          {post.formato}
        </span>
      )}
    </div>
  );
}

/** Botões de decisão para o aprovador, direto no card. */
export function BotoesAprovacao({ post, acoes }: { post: PostView; acoes: AcoesPost }) {
  if (!post.souAprovador || !acoes.podeEditar) return null;
  return (
    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => acoes.pedirRefacao(post)}
        className="flex-1 h-8 rounded-md text-[11px] font-semibold text-zinc-300 border border-zinc-700 hover:border-red-500/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
      >
        Pedir refação
      </button>
      <button
        type="button"
        onClick={() => acoes.aprovar(post)}
        className="flex-1 h-8 rounded-md text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
      >
        Aprovar
      </button>
    </div>
  );
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-6 border border-dashed border-zinc-800/80 rounded-xl">
      <div className="text-sm font-semibold text-zinc-300">{titulo}</div>
      {texto && <div className="text-xs text-zinc-500 max-w-sm leading-relaxed">{texto}</div>}
      {acao}
    </div>
  );
}

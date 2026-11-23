// Abas com nome editável (textos e criativos) e os editores dos textos.
import React from 'react';
import { Pencil } from 'lucide-react';
import type { CopyEditorItem } from '../../types';
import RichTextEditor from '../RichTextEditor';
import { pilula } from './Propriedade';
import type { useBriefing } from './useBriefing';

/** A aba ativa é um campo: clicar no nome renomeia. */
export function Abas({ rotulo, itens, ativoId, disabled, travado, icone, onAtivar, onRenomear }: {
  /** Nome do grupo e, no singular, de cada item. */
  rotulo: { grupo: string; item: string };
  itens: { id: string; name: string }[];
  ativoId?: string;
  disabled?: boolean;
  travado?: (id: string) => boolean;
  icone?: (id: string) => React.ReactNode;
  onAtivar: (id: string) => void;
  onRenomear: (id: string, nome: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={rotulo.grupo}>
      {itens.map(t => {
        if (t.id !== ativoId) return (
          <button key={t.id} type="button" onClick={() => onAtivar(t.id)} className={pilula('aba')}>
            {icone?.(t.id)}
            <span className="truncate max-w-56">{t.name || 'Sem nome'}</span>
          </button>
        );
        const fixo = disabled || travado?.(t.id);
        return (
          <label
            key={t.id + t.name}
            aria-current="true"
            className={`group ${pilula()} border border-white/10 font-medium !text-zinc-100 ${fixo ? '' : 'cursor-text focus-within:ring-2 focus-within:ring-blue-500/60'}`}
          >
          {icone?.(t.id)}
          <input
            defaultValue={t.name}
            readOnly={fixo}
            aria-label={`Nome do ${rotulo.item}`}
            title={fixo ? undefined : 'Clique para renomear'}
            placeholder={`Nome do ${rotulo.item}`}
            maxLength={60}
            onBlur={e => {
              const nome = e.target.value.trim();
              if (!nome) e.target.value = t.name;
              else if (nome !== t.name) onRenomear(t.id, nome);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); e.currentTarget.value = t.name; e.currentTarget.blur(); }
            }}
            className={`field-sizing-content min-w-12 max-w-64 bg-transparent outline-none placeholder-zinc-500 ${fixo ? 'cursor-default' : ''}`}
          />
          {!fixo && <Pencil size={13} className="shrink-0 text-zinc-500 group-hover:text-zinc-200 transition-colors" aria-hidden />}
          </label>
        );
      })}
    </div>
  );
}

/** Todos montados: trocar de texto não pode perder o que está sendo digitado. */
export function EditoresTexto({ taskId, briefing, ativoId, disabled, travado, conteudo }: {
  taskId: string;
  briefing: Pick<ReturnType<typeof useBriefing>, 'textos' | 'versaoDoTexto' | 'escrever'>;
  ativoId?: string;
  disabled?: boolean;
  travado?: (id: string) => boolean;
  /** Conteúdo mostrado, quando não é o do próprio texto (ex.: a versão enviada). */
  conteudo?: (texto: CopyEditorItem) => string;
}) {
  return (
    <>
      {briefing.textos.map(t => {
        const bloqueado = !!travado?.(t.id);
        return (
          <div key={`${taskId}-${t.id}-${bloqueado || briefing.versaoDoTexto(t.id, t.content)}`} className={t.id === ativoId ? '' : 'hidden'}>
            <RichTextEditor
              taskId={t.id}
              content={conteudo ? conteudo(t) : t.content}
              wrapperClassName="max-h-[520px]"
              readOnly={disabled || bloqueado}
              placeholder="Escreva o texto…"
              onChange={html => { if (!disabled && !bloqueado) briefing.escrever(t.id, html); }}
            />
          </div>
        );
      })}
    </>
  );
}

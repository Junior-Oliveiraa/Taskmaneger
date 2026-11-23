// Peças do painel da tarefa: pílula de propriedade, menu suspenso e título de seção.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

/**
 * Propriedade da tarefa: pílula com ícone e valor. O fundo em repouso diz que é
 * clicável; vazia, mostra o nome do campo em cinza. 'aba' é a aba não selecionada.
 */
export const pilula = (estado: 'cheia' | 'vazia' | 'erro' | 'aba' = 'cheia') =>
  `max-w-full min-w-0 h-8 [@media(pointer:coarse)]:h-10 inline-flex items-center gap-2 px-3 rounded-lg text-left text-body whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
    estado === 'cheia' ? 'bg-[#161619] text-zinc-200 hover:bg-[#1f1f23]'
    : estado === 'erro' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/15'
    : estado === 'aba' ? 'border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f23]'
    : 'bg-[#161619] text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f23]'
  } ${FOCO}`;

/** Botão discreto (ações de seção, cabeçalho). */
export const BOTAO_GHOST = `inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg text-body font-medium whitespace-nowrap text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`;

/** Botão só com ícone. */
export const BOTAO_ICONE = `size-8 [@media(pointer:coarse)]:size-10 shrink-0 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`;

/** Botão secundário, com borda. */
export const BOTAO_BORDA = `inline-flex items-center justify-center gap-1.5 h-9 [@media(pointer:coarse)]:h-10 px-3 rounded-lg border border-white/10 text-body font-medium text-zinc-200 hover:bg-[#1f1f23] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`;

/** Superfície de campo: tudo que recebe texto ou escolha se parece, antes do mouse chegar. */
export const CAIXA = 'w-full min-w-0 px-3 rounded-lg bg-[#161619] border border-white/10 text-body text-zinc-200 hover:enabled:border-zinc-600 transition-colors';

/** Campo de texto. */
export const CAMPO = `${CAIXA} placeholder-zinc-500 outline-none focus:!border-blue-500/60`;

/** Desloca o painel suspenso para o lado quando passaria da borda visível. */
export function encaixar(el: HTMLElement | null) {
  if (!el) return;
  el.style.translate = '';
  const r = el.getBoundingClientRect();
  const limite = el.parentElement?.closest('.overflow-y-auto')?.getBoundingClientRect();
  const esq = Math.max(8, (limite?.left ?? 0) + 8);
  const dir = Math.min(window.innerWidth, limite?.right ?? Infinity) - 16;
  const dx = r.right > dir ? Math.max(dir - r.right, esq - r.left) : r.left < esq ? esq - r.left : 0;
  if (dx) el.style.translate = `${dx}px 0`;
}

/** Item da faixa de propriedades (`flex-wrap`). O rótulo aparece na dica; avisos descem para a linha de baixo. */
export function Propriedade({ rotulo, id, nota, children }: {
  rotulo: string;
  id?: string;
  /** Texto auxiliar ou aviso, abaixo da faixa. */
  nota?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div id={id} title={rotulo} className="relative min-w-0 max-w-full inline-flex">{children}</div>
      <div className="order-last basis-full empty:hidden">{nota}</div>
    </>
  );
}

/**
 * Menu suspenso. Fecha ao clicar fora ou com Esc (sem deixar o Esc chegar ao
 * painel, que também fecha com a tecla) e devolve o foco ao botão.
 */
export function Menu({ rotulo, gatilho, classe, disabled, abrirAoMontar = false, alinhar = 'left', largura = 'w-56', titulo, descritoPor, bloco, role = 'menu', children }: {
  rotulo: string;
  gatilho: React.ReactNode;
  classe: string;
  disabled?: boolean;
  abrirAoMontar?: boolean;
  alinhar?: 'left' | 'right';
  largura?: string;
  titulo?: string;
  /** Id do texto que explica o botão (ex.: por que está bloqueado). */
  descritoPor?: string;
  /** Ocupa a largura disponível, como um campo. */
  bloco?: boolean;
  role?: 'menu' | 'dialog';
  children: (fechar: () => void) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(abrirAoMontar);
  const [acima, setAcima] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => { if (aberto) encaixar(painel.current); }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const r = botao.current?.getBoundingClientRect();
    if (r) {
      const abaixo = window.innerHeight - r.bottom;
      setAcima(abaixo < 320 && r.top > abaixo);
    }
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAberto(false);
        botao.current?.focus();
        return;
      }
      if (role !== 'menu' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const itens = [...(painel.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
      if (itens.length === 0) return;
      e.preventDefault();
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      itens[i < 0 ? (passo > 0 ? 0 : itens.length - 1) : (i + passo + itens.length) % itens.length].focus();
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [aberto, role]);

  return (
    <div ref={raiz} className={`relative min-w-0 max-w-full ${bloco ? 'flex w-full' : 'inline-flex'}`}>
      <button
        ref={botao}
        type="button"
        disabled={disabled}
        aria-haspopup={role}
        aria-expanded={aberto}
        aria-label={rotulo}
        aria-describedby={descritoPor}
        title={titulo}
        onClick={() => setAberto(v => !v)}
        className={classe}
      >
        {gatilho}
      </button>
      {aberto && (
        <div
          ref={painel}
          role={role}
          aria-label={rotulo}
          className={`absolute z-50 ${acima ? 'bottom-full mb-1' : 'top-full mt-1'} ${alinhar === 'right' ? 'right-0' : 'left-0'} ${largura} max-w-[calc(100vw-32px)] max-h-80 overflow-y-auto scrollbar-thin p-1 bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)] flex flex-col`}
        >
          {children(() => { setAberto(false); botao.current?.focus(); })}
        </div>
      )}
    </div>
  );
}

export function ItemMenu({ onClick, marcado, perigo, disabled, children }: {
  onClick: () => void;
  /** Definido = item de escolha, com check quando ativo. */
  marcado?: boolean;
  perigo?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={marcado === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={marcado}
      disabled={disabled}
      onClick={onClick}
      className={`w-full shrink-0 flex items-center gap-2.5 min-h-8 [@media(pointer:coarse)]:min-h-10 px-2 py-1 rounded-lg text-body text-left transition-colors disabled:opacity-40 ${
        perigo ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-200 hover:bg-[#1F1F22]'
      } ${FOCO}`}
    >
      {children}
      {marcado && <Check size={14} className="shrink-0 ml-auto text-blue-400" aria-hidden />}
    </button>
  );
}

/** Título de seção: na cor da classe, sem ícone nem caixa. */
export function TituloSecao({ aberta, onAlternar, extra, erro, acoes, cor = 'text-zinc-400', children }: {
  aberta?: boolean;
  /** Sem `onAlternar` a seção não recolhe. */
  onAlternar?: () => void;
  extra?: React.ReactNode;
  erro?: boolean;
  acoes?: React.ReactNode;
  /** Cor da classe da seção (`text-…`). O erro prevalece. */
  cor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-8">
      <h3 className={`text-heading font-medium ${erro ? 'text-red-400' : cor}`}>
        {onAlternar ? (
          <button type="button" onClick={onAlternar} aria-expanded={aberta} className={`inline-flex items-center gap-1.5 rounded ${FOCO}`}>
            {children}
            <ChevronDown size={14} className={`opacity-60 transition-transform ${aberta ? '' : '-rotate-90'}`} aria-hidden />
          </button>
        ) : children}
      </h3>
      {extra}
      {acoes && <div className="ml-auto flex items-center gap-1">{acoes}</div>}
    </div>
  );
}

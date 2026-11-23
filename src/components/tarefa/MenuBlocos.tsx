// Menus do editor ("/", tamanho e cor). Em portal porque a moldura do editor corta
// o que passa da borda.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { FOCO } from './Propriedade';

export interface ItemBloco {
  id: string;
  rotulo: string;
  icone: React.ReactNode;
  grupo?: string;
  /** Detalhe à direita (ex.: "24 px"). */
  detalhe?: string;
  ativo?: boolean;
  acao: () => void;
}

export default function MenuBlocos({ x, y, rotulo = 'Inserir bloco', largura = 'w-60', ancora, itens = [], rodape, onFechar, onDigitarBarra }: {
  /** Canto superior esquerdo, em coordenadas da janela. */
  x: number;
  y: number;
  rotulo?: string;
  largura?: string;
  /** Botão que abriu: clicar nele de novo alterna, quem decide é o próprio botão. */
  ancora?: HTMLElement | null;
  itens?: ItemBloco[];
  rodape?: React.ReactNode;
  /** `focarEditor`: fechou sem escolher, o cursor volta para o texto. */
  onFechar: (focarEditor: boolean) => void;
  /** "/" de novo com o menu aberto escreve a barra. */
  onDigitarBarra?: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const cb = useRef({ onFechar, onDigitarBarra, ancora });
  cb.current = { onFechar, onDigitarBarra, ancora };

  useLayoutEffect(() => {
    const r = painel.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
    const itens = painel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [];
    ([...itens].find(b => b.dataset.ativo) ?? itens[0])?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !cb.current.ancora?.contains(alvo)) cb.current.onFechar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cb.current.onFechar(true);
      } else if (e.key === '/' && cb.current.onDigitarBarra) {
        e.preventDefault();
        e.stopPropagation();
        cb.current.onDigitarBarra();
      } else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const bts = [...(painel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
        const i = bts.indexOf(document.activeElement as HTMLButtonElement);
        bts[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + bts.length) % bts.length]?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla, true);
    };
  }, []);

  return createPortal(
    <div
      ref={painel}
      role="menu"
      aria-label={rotulo}
      // Não tira a seleção do editor ao clicar.
      onMouseDown={e => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className={`fixed z-[170] ${largura} max-h-[min(420px,calc(100dvh-16px))] overflow-y-auto scrollbar-thin p-1 bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)]`}
    >
      {itens.map((it, i) => (
        <React.Fragment key={it.id}>
          {it.grupo && itens[i - 1]?.grupo !== it.grupo && (
            <p className="px-2 pt-2 pb-1 text-caption font-medium text-zinc-400">{it.grupo}</p>
          )}
          <button
            type="button"
            role="menuitem"
            data-ativo={it.ativo || undefined}
            onClick={() => { onFechar(false); it.acao(); }}
            className={`w-full flex items-center gap-2.5 min-h-8 px-2 rounded-lg text-body text-left text-zinc-200 hover:bg-[#1F1F22] ${FOCO}`}
          >
            <span className="size-4 shrink-0 inline-flex items-center justify-center text-zinc-400" aria-hidden>{it.icone}</span>
            {it.rotulo}
            <span className="ml-auto inline-flex items-center gap-2 text-caption text-zinc-500 tabular-nums">
              {it.detalhe}
              {it.ativo && <Check size={14} className="text-blue-400" aria-hidden />}
            </span>
          </button>
        </React.Fragment>
      ))}
      {rodape}
    </div>,
    document.body,
  );
}

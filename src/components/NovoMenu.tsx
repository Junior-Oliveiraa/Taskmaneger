import React, { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown, LucideIcon } from 'lucide-react';

export interface OpcaoNovo {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Tecla de atalho exibida no menu (o atalho em si é registrado no App). */
  atalho?: string;
  onSelect: () => void;
}

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

/**
 * Único botão primário do app: "+ Novo" com menu de criação.
 * Teclado: Enter/Espaço/↓ abre e foca o primeiro item; ↑/↓ navegam; Esc fecha
 * e devolve o foco ao botão.
 */
export default function NovoMenu({ opcoes, direto }: {
  opcoes: OpcaoNovo[];
  /** Sem menu: o clique cria direto (ex.: "Nova tarefa" em Minhas tarefas). */
  direto?: OpcaoNovo;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);
  const itens = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    requestAnimationFrame(() => itens.current[0]?.focus());
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  if (direto) {
    return (
      <button
        type="button"
        onClick={direto.onSelect}
        title={`${direto.label}${direto.atalho ? ` (${direto.atalho})` : ''}`}
        aria-label={direto.label}
        className={`inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg btn-brand active:scale-[0.98] text-body font-medium transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${FOCO}`}
      >
        <Plus size={16} aria-hidden />
        <span className="hidden sm:inline">{direto.label}</span>
      </button>
    );
  }

  if (opcoes.length === 0) return null;

  const fechar = () => { setAberto(false); botao.current?.focus(); };

  const onKeyMenu = (e: React.KeyboardEvent) => {
    const atual = itens.current.findIndex(el => el === document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); itens.current[(atual + 1) % opcoes.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); itens.current[(atual - 1 + opcoes.length) % opcoes.length]?.focus(); }
    if (e.key === 'Tab') setAberto(false);
  };

  return (
    <div className="relative" ref={raiz}>
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto(v => !v)}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); } }}
        className={`inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 pl-2.5 pr-2 rounded-lg btn-brand active:scale-[0.98] text-body font-medium transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${FOCO}`}
      >
        <Plus size={16} aria-hidden />
        <span className="hidden sm:inline">Novo</span>
        <ChevronDown size={14} aria-hidden className={`opacity-80 transition-transform duration-150 ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Criar"
          onKeyDown={onKeyMenu}
          className="absolute right-0 mt-1.5 w-52 p-1 bg-[#18181b] border border-white/10 rounded-xl shadow-[0_12px_32px_rgb(0_0_0/0.28)] z-40 animate-dropdown-in origin-top-right"
        >
          {opcoes.map((o, i) => {
            const Icone = o.icon;
            return (
              <button
                key={o.id}
                ref={el => { itens.current[i] = el; }}
                type="button"
                role="menuitem"
                onClick={() => { setAberto(false); o.onSelect(); }}
                className={`w-full flex items-center gap-2.5 h-9 [@media(pointer:coarse)]:h-11 px-2.5 rounded-lg text-body text-zinc-200 hover:bg-[#1f1f23] focus:bg-[#1f1f23] hover:text-zinc-100 outline-none transition-colors`}
              >
                <Icone size={15} className="text-zinc-400" aria-hidden />
                {o.label}
                {o.atalho && (
                  <kbd className="ml-auto min-w-5 h-5 px-1 inline-flex items-center justify-center rounded border border-white/10 text-caption text-zinc-400 font-sans">
                    {o.atalho}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

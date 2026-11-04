import React, { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { BOTAO_FILTRO, BOTAO_FILTRO_NEUTRO, ICONE_FILTRO, ITEM_MENU, ITEM_OFF, ITEM_ON, MENU_FILTRO } from './filtroEstilo';

export interface OpcaoLista<T> { id: T; label: string }

/**
 * Botão de filtro que abre uma lista. Com `multipla`, cada item liga e desliga e o
 * menu fica aberto; sem ela, escolher fecha. O primeiro item ("Todos") é sempre
 * exclusivo e corresponde a `null`.
 */
export default function FiltroLista<T extends string | number>({
  icone, rotuloGrupo, resumo, todos, opcoes, selecionados, onTodos, onAlternar, multipla = false, largura = 'w-56',
}: {
  icone: React.ReactNode;
  rotuloGrupo: string;
  /** O que o botão mostra: "Todos os canais", "Gênova", "3 empreendimentos"... */
  resumo: string;
  todos: string;
  opcoes: OpcaoLista<T>[];
  /** null = "Todos". */
  selecionados: T[] | null;
  onTodos: () => void;
  onAlternar: (id: T) => void;
  multipla?: boolean;
  largura?: string;
}) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto]);

  const marca = (on: boolean) => multipla
    ? (
      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-500 border-blue-500' : 'border-zinc-600'}`}>
        {on && <Check size={11} className="text-white" strokeWidth={3} />}
      </span>
    )
    : <span className="w-4 shrink-0 flex justify-center">{on && <Check size={13} className="text-blue-400" />}</span>;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`${rotuloGrupo}: ${resumo}`}
        onClick={() => setAberto(a => !a)}
        className={selecionados === null ? BOTAO_FILTRO_NEUTRO : BOTAO_FILTRO}
      >
        <span className={ICONE_FILTRO}>{icone}</span>
        {resumo}
        <ChevronDown size={12} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <ul role="listbox" aria-label={rotuloGrupo} aria-multiselectable={multipla || undefined} className={`${MENU_FILTRO} ${largura}`}>
            <li role="option" aria-selected={selecionados === null}>
              <button type="button" onClick={() => { onTodos(); setAberto(false); }} className={`${ITEM_MENU} ${selecionados === null ? ITEM_ON : ITEM_OFF}`}>
                {marca(selecionados === null)}
                {todos}
              </button>
            </li>
            <li role="separator" className="my-1 h-px bg-zinc-800" />
            {opcoes.map(o => {
              const on = !!selecionados && selecionados.includes(o.id);
              return (
                <li key={String(o.id)} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => { onAlternar(o.id); if (!multipla) setAberto(false); }}
                    className={`${ITEM_MENU} ${on ? ITEM_ON : ITEM_OFF}`}
                  >
                    {marca(on)}
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

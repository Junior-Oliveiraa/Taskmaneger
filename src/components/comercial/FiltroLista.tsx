import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { BOTAO_FILTRO, BOTAO_FILTRO_NEUTRO, ICONE_FILTRO, ITEM_MENU, ITEM_OFF, ITEM_ON, MENU_FILTRO } from './filtroEstilo';

export interface OpcaoLista<T> {
  id: T;
  label: string;
  /** Nome completo para o balão quando o label é abreviado. */
  titulo?: string;
}

/** A partir de quantas opções o menu ganha campo de busca. */
const MIN_BUSCA = 8;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Botão de filtro que abre uma lista. Com `multipla`, cada item liga e desliga e o
 * menu fica aberto; sem ela, escolher fecha. O primeiro item ("Todos") é sempre
 * exclusivo e corresponde a `null`.
 */
export default function FiltroLista<T extends string | number>({
  icone, rotuloGrupo, resumo, resumoTitulo, todos, opcoes, selecionados, onTodos, onAlternar, multipla = false, largura = 'w-56',
}: {
  icone: React.ReactNode;
  rotuloGrupo: string;
  /** O que o botão mostra: "Todos os canais", "Gênova", "3 empreendimentos"... */
  resumo: string;
  /** Balão do botão, quando o resumo é abreviado. */
  resumoTitulo?: string;
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
  const [busca, setBusca] = useState('');
  useEffect(() => {
    if (!aberto) { setBusca(''); return; }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto]);

  const comBusca = opcoes.length >= MIN_BUSCA;
  const termo = semAcento(busca.trim());
  const visiveis = termo ? opcoes.filter(o => semAcento(o.titulo ?? o.label).includes(termo)) : opcoes;

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
        aria-label={`${rotuloGrupo}: ${resumoTitulo ?? resumo}`}
        title={resumoTitulo}
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
          <div className={`${MENU_FILTRO} ${largura}`}>
            {comBusca && (
              <div className="px-2 pt-1 pb-1.5">
                <label className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus-within:border-blue-500/60">
                  <Search size={12} className="text-zinc-500 shrink-0" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar"
                    aria-label={`Buscar ${rotuloGrupo.toLowerCase()}`}
                    className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 outline-none"
                  />
                </label>
              </div>
            )}
            <ul role="listbox" aria-label={rotuloGrupo} aria-multiselectable={multipla || undefined} className="max-h-72 overflow-y-auto custom-scrollbar">
              {!termo && (
                <>
                  <li role="option" aria-selected={selecionados === null}>
                    <button type="button" onClick={() => { onTodos(); setAberto(false); }} className={`${ITEM_MENU} ${selecionados === null ? ITEM_ON : ITEM_OFF}`}>
                      {marca(selecionados === null)}
                      {todos}
                    </button>
                  </li>
                  <li role="separator" className="my-1 h-px bg-zinc-800" />
                </>
              )}
              {visiveis.map(o => {
                const on = !!selecionados && selecionados.includes(o.id);
                return (
                  <li key={String(o.id)} role="option" aria-selected={on}>
                    <button
                      type="button"
                      title={o.titulo}
                      onClick={() => { onAlternar(o.id); if (!multipla) setAberto(false); }}
                      className={`${ITEM_MENU} ${on ? ITEM_ON : ITEM_OFF}`}
                    >
                      {marca(on)}
                      <span className="truncate">{o.label}</span>
                    </button>
                  </li>
                );
              })}
              {termo && visiveis.length === 0 && <li className="px-3 py-2 text-xs text-zinc-500">Nada encontrado</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

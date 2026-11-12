import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

// Listas suspensas próprias: o <select> e o <datalist> nativos abrem um menu
// desenhado pelo sistema operacional, que não segue o tema da aplicação.

export interface OpcaoLista {
  value: string;
  label: string;
  /** Texto curto à direita (ex.: situação da unidade). */
  detalhe?: string;
  tomDetalhe?: 'verde' | 'ambar' | 'neutro';
  /** Uso interno: item "Adicionar …" do SelectLista. */
  criar?: boolean;
  /** Mostrado no campo fechado no lugar do label (ex.: "M" para Mensal). */
  curto?: string;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const gatilhoCls =
  'w-full h-9 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 text-[13px] text-zinc-100 outline-none ' +
  'placeholder:text-zinc-600 hover:border-zinc-700 focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-[border-color,box-shadow]';

const TONS = {
  verde: 'bg-emerald-500/10 text-emerald-300',
  ambar: 'bg-amber-500/10 text-amber-300',
  neutro: 'bg-zinc-800 text-zinc-400',
};

// O menu vai para o <body> com posição fixa: dentro do modal ele seria cortado
// pelo contêiner com rolagem. Abre para cima quando falta espaço embaixo.
export function usePosicao(ancora: React.RefObject<HTMLElement>, aberto: boolean, largura?: number, alturaMin = 220) {
  const [estilo, setEstilo] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!aberto) return;
    const atualizar = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const abaixo = window.innerHeight - r.bottom - 12;
      const acima = r.top - 12;
      const paraCima = abaixo < alturaMin && acima > abaixo;
      const w = largura ?? Math.max(r.width, 220);
      setEstilo({
        position: 'fixed',
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
        width: w,
        maxHeight: largura ? undefined : Math.min(320, paraCima ? acima : abaixo),
        ...(paraCima ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      });
    };
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    return () => {
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, true);
    };
  }, [aberto, ancora, largura, alturaMin]);
  return estilo;
}

export function useCliqueFora(refs: React.RefObject<HTMLElement>[], aberto: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (refs.some(r => r.current?.contains(e.target as Node))) return;
      fechar();
    };
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto, fechar, refs]);
}

function Menu({ estilo, menuRef, listaId, children, topo }: {
  estilo: React.CSSProperties;
  menuRef: React.RefObject<HTMLDivElement>;
  listaId: string;
  children: React.ReactNode;
  topo?: React.ReactNode;
}) {
  return createPortal(
    <div
      ref={menuRef}
      style={estilo}
      className="z-[60] flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#141418] shadow-2xl shadow-black/60 ring-1 ring-black/40"
    >
      {topo}
      <ul id={listaId} role="listbox" className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal p-1">
        {children}
      </ul>
    </div>,
    document.body
  );
}

function ItemMenu({ opcao, ativo, selecionado, onEscolher, onHover, id }: {
  opcao: OpcaoLista;
  ativo: boolean;
  selecionado: boolean;
  onEscolher: () => void;
  onHover: () => void;
  id: string;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (ativo) ref.current?.scrollIntoView({ block: 'nearest' }); }, [ativo]);
  return (
    <li
      ref={ref}
      id={id}
      role="option"
      aria-selected={selecionado}
      // mousedown evita que o campo perca o foco antes do clique contar.
      onMouseDown={e => { e.preventDefault(); onEscolher(); }}
      onMouseMove={onHover}
      className={`flex items-center gap-2 h-8 px-2.5 rounded-lg text-[13px] cursor-pointer select-none ${
        ativo ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-300'
      }`}
    >
      <span className="w-3.5 shrink-0 text-blue-400">{selecionado && <Check size={13} strokeWidth={2.5} />}</span>
      <span className="truncate flex-1">{opcao.label}</span>
      {opcao.detalhe && (
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TONS[opcao.tomDetalhe ?? 'neutro']}`}>
          {opcao.detalhe}
        </span>
      )}
    </li>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-4 text-center text-[12px] text-zinc-500">{children}</li>;
}

/**
 * Escolha entre opções. Ganha busca quando a lista é longa. Com `criar`, o que
 * foi digitado na busca e não existe na lista pode ser adicionado como novo.
 */
export function SelectLista({ value, onChange, opcoes, placeholder = 'Selecione…', disabled, textoVazio = 'Nenhuma opção.', criar, compacto, semSeta }: {
  value: string;
  onChange: (v: string) => void;
  opcoes: OpcaoLista[];
  placeholder?: string;
  disabled?: boolean;
  textoVazio?: string;
  /** Rótulo do item de criação, ex.: "Adicionar imobiliária". */
  criar?: string;
  /** Campo estreito (células de tabela): menos respiro lateral. */
  compacto?: boolean;
  /** Sem a seta: para campos de uma letra, onde o próprio campo já indica o clique. */
  semSeta?: boolean;
}) {
  const id = useId();
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const estilo = usePosicao(gatilhoRef, aberto);
  const comBusca = !!criar || opcoes.length > 8;

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    const lista = q ? opcoes.filter(o => normalizar(`${o.label} ${o.detalhe ?? ''}`).includes(q)) : opcoes;
    const novo = busca.trim().replace(/\s+/g, ' ');
    // O item de criação só aparece se o nome ainda não existe (ignorando acentos e caixa).
    if (criar && novo && !opcoes.some(o => normalizar(o.label) === normalizar(novo))) {
      return [...lista, { value: novo, label: novo, criar: true } as OpcaoLista & { criar?: boolean }];
    }
    return lista as (OpcaoLista & { criar?: boolean })[];
  }, [opcoes, busca, criar]);

  const fechar = () => { setAberto(false); setBusca(''); };
  const refs = useMemo(() => [gatilhoRef, menuRef] as React.RefObject<HTMLElement>[], []);
  useCliqueFora(refs, aberto, fechar);

  const abrir = () => {
    if (disabled) return;
    setAtivo(Math.max(0, opcoes.findIndex(o => o.value === value)));
    setAberto(true);
  };

  useEffect(() => { if (aberto && comBusca) buscaRef.current?.focus(); }, [aberto, comBusca]);
  useEffect(() => { setAtivo(0); }, [busca]);

  const escolher = (o: OpcaoLista) => {
    onChange(o.value);
    fechar();
    gatilhoRef.current?.focus();
  };

  const teclado = (e: React.KeyboardEvent) => {
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(i => Math.min(i + 1, filtradas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtradas[ativo]) escolher(filtradas[ativo]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); gatilhoRef.current?.focus(); }
    else if (e.key === 'Tab') fechar();
  };

  // Um valor recém-criado ainda não está nas opções; mostra-se o próprio texto.
  const atual = value ? (opcoes.find(o => o.value === value) ?? { value, label: value }) : undefined;

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={teclado}
        title={atual?.curto ? atual.label : undefined}
        className={`${gatilhoCls} flex items-center text-left ${compacto ? 'gap-1 px-2' : 'gap-2'} ${aberto ? 'border-blue-500/70 ring-2 ring-blue-500/15' : ''}`}
      >
        <span className={`truncate flex-1 ${semSeta ? 'text-center' : ''} ${atual ? '' : 'text-zinc-500'}`}>{atual ? (atual.curto ?? atual.label) : placeholder}</span>
        {atual?.detalhe && (
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TONS[atual.tomDetalhe ?? 'neutro']}`}>{atual.detalhe}</span>
        )}
        {!semSeta && <ChevronDown size={14} className={`shrink-0 text-zinc-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />}
      </button>
      {aberto && (
        <Menu
          estilo={estilo}
          menuRef={menuRef}
          listaId={`${id}-lista`}
          topo={comBusca && (
            <div className="flex items-center gap-2 px-3 h-10 border-b border-zinc-800 shrink-0">
              <Search size={13} className="text-zinc-500 shrink-0" />
              <input
                ref={buscaRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={teclado}
                placeholder={criar ? 'Buscar ou digitar um novo nome…' : 'Buscar…'}
                className="flex-1 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-600 outline-none"
              />
            </div>
          )}
        >
          {filtradas.length === 0
            ? <Vazio>{busca ? 'Nada encontrado.' : textoVazio}</Vazio>
            : filtradas.map((o, i) => o.criar ? (
              <li
                key="__criar"
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={false}
                onMouseDown={e => { e.preventDefault(); escolher(o); }}
                onMouseMove={() => setAtivo(i)}
                className={`flex items-center gap-2 h-8 px-2.5 mt-1 rounded-lg text-[13px] cursor-pointer select-none border-t border-zinc-800/80 ${
                  i === ativo ? 'bg-blue-500/10 text-blue-200' : 'text-blue-300'
                }`}
              >
                <Plus size={13} className="shrink-0" />
                <span className="truncate">{criar} <span className="font-semibold">“{o.label}”</span></span>
              </li>
            ) : (
              <ItemMenu
                key={o.value}
                id={`${id}-op-${i}`}
                opcao={o}
                ativo={i === ativo}
                selecionado={o.value === value}
                onEscolher={() => escolher(o)}
                onHover={() => setAtivo(i)}
              />
            ))}
        </Menu>
      )}
    </>
  );
}

/** Texto livre com sugestões (substitui o <datalist>). */
export function AutoCompletar({ value, onChange, sugestoes, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  sugestoes: string[];
  placeholder?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const estilo = usePosicao(inputRef, aberto);

  const filtradas = useMemo(() => {
    const q = normalizar(value.trim());
    const lista = q ? sugestoes.filter(s => normalizar(s).includes(q)) : sugestoes;
    // Some quando o texto já é exatamente a única sugestão.
    return lista.length === 1 && lista[0] === value ? [] : lista.slice(0, 50);
  }, [sugestoes, value]);

  const fechar = () => { setAberto(false); setAtivo(-1); };
  const refs = useMemo(() => [inputRef, menuRef] as React.RefObject<HTMLElement>[], []);
  useCliqueFora(refs, aberto, fechar);

  const escolher = (s: string) => { onChange(s); fechar(); };

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) setAberto(true);
      setAtivo(i => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && aberto && filtradas[ativo]) { e.preventDefault(); escolher(filtradas[ativo]); }
    else if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key === 'Tab') fechar();
  };

  const mostrar = aberto && filtradas.length > 0;

  return (
    <>
      <input
        ref={inputRef}
        className={`${gatilhoCls} ${mostrar ? 'border-blue-500/70 ring-2 ring-blue-500/15' : ''}`}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={`${id}-lista`}
        aria-activedescendant={mostrar && ativo >= 0 ? `${id}-op-${ativo}` : undefined}
        onFocus={() => setAberto(true)}
        onChange={e => { onChange(e.target.value); setAberto(true); setAtivo(-1); }}
        onKeyDown={teclado}
      />
      {mostrar && (
        <Menu estilo={estilo} menuRef={menuRef} listaId={`${id}-lista`}>
          {filtradas.map((s, i) => (
            <ItemMenu
              key={s}
              id={`${id}-op-${i}`}
              opcao={{ value: s, label: s }}
              ativo={i === ativo}
              selecionado={s === value}
              onEscolher={() => escolher(s)}
              onHover={() => setAtivo(i)}
            />
          ))}
        </Menu>
      )}
    </>
  );
}

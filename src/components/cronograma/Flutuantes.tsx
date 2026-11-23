// Painéis que abrem no ponto do clique: menu da tarefa, nova tarefa e reagendar.
// Ficam no body, para nenhum contêiner com rolagem os cortar.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, CheckCircle2, ChevronDown, Copy, Link2, Pencil, RotateCcw, Trash2, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Task, TaskStatus } from '../../types';
import { PROGRESSO_STATUS, progressoDaTarefa } from '../../lib/cronograma';
import { formatarData } from '../../lib/marketingProjetos';
import { FOCO } from '../lista/ListaBarra';
import { STATUS_INFO, StatusIcone } from '../TarefaBadges';

export interface Ponto { x: number; y: number }

function Flutuante({ ponto, papel, rotulo, onFechar, className, children, onKeyDown }: {
  ponto: Ponto;
  papel: 'menu' | 'dialog';
  rotulo: string;
  onFechar: () => void;
  className: string;
  children: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(ponto);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  // Não passa das bordas da janela (nem quando o conteúdo cresce).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => setPos({
      x: Math.max(8, Math.min(ponto.x, window.innerWidth - el.offsetWidth - 8)),
      y: Math.max(8, Math.min(ponto.y, window.innerHeight - el.offsetHeight - 8)),
    });
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ponto.x, ponto.y]);

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const fora = (e: Event) => { if (!ref.current?.contains(e.target as Node)) fecharRef.current(); };
    const fechar = () => fecharRef.current();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fecharRef.current();
      antes?.focus?.();
    };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('scroll', fora, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      document.removeEventListener('scroll', fora, true);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', fechar);
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      role={papel}
      aria-label={rotulo}
      onKeyDown={onKeyDown}
      onContextMenu={e => e.preventDefault()}
      style={{ left: pos.x, top: pos.y }}
      className={`tela-cronograma fixed z-[70] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto scrollbar-thin bg-[#18181b] border border-white/10 rounded-xl text-zinc-100 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── Menu da tarefa ──────────────────────────────────────────────────

const STATUS_DO_MENU: TaskStatus[] = ['todo', 'in_progress', 'rework', 'approval', 'implementation', 'paused'];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ITEM = `w-full flex items-center gap-2.5 h-8 [@media(pointer:coarse)]:h-11 px-2.5 rounded-md text-left text-body focus-visible:outline-none`;

export function MenuTarefa({ ponto, tarefa, podeEditar, onFechar, onConcluir, onAbrir, onStatus, onDuplicar, onCopiarLink, onReagendar, onExcluir }: {
  ponto: Ponto;
  tarefa: Task;
  podeEditar: boolean;
  onFechar: () => void;
  onConcluir: () => void;
  onAbrir: () => void;
  onStatus: (s: TaskStatus) => void;
  onDuplicar: () => void;
  onCopiarLink: () => void;
  onReagendar: () => void;
  onExcluir: () => void;
}) {
  const [progressoAberto, setProgressoAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const itens = () => [...(raiz.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];
  useEffect(() => { itens()[0]?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teclas = (e: React.KeyboardEvent) => {
    const lista = itens();
    const i = lista.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (n: number) => { e.preventDefault(); lista[(n + lista.length) % lista.length]?.focus(); };
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(-1);
    else if (e.key === 'Tab') { e.preventDefault(); onFechar(); }
    else if (e.key === 'ArrowRight' && document.activeElement?.hasAttribute('data-progresso')) setProgressoAberto(true);
    else if (e.key === 'ArrowLeft') setProgressoAberto(false);
  };
  const fazer = (acao: () => void) => () => { onFechar(); acao(); };
  const item = (Icone: LucideIcon, texto: string, acao: () => void, perigo = false) => (
    <button type="button" role="menuitem" tabIndex={-1} onClick={fazer(acao)} onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })} className={`${ITEM} ${perigo ? 'text-red-400 focus:bg-red-500/10' : 'text-zinc-200 focus:bg-[#1f1f23] focus:text-zinc-100'}`}>
      <Icone size={15} className={`shrink-0 ${perigo ? '' : 'text-zinc-400'}`} aria-hidden />{texto}
    </button>
  );
  const feita = tarefa.status === 'done';
  return (
    <Flutuante ponto={ponto} papel="menu" rotulo={`Ações de ${tarefa.title || 'tarefa'}`} onFechar={onFechar} className="w-56 p-1.5" onKeyDown={teclas}>
      <div ref={raiz}>
        {podeEditar && item(feita ? RotateCcw : CheckCircle2, feita ? 'Reabrir' : 'Marcar como concluída', onConcluir)}
        {item(Pencil, podeEditar ? 'Editar' : 'Abrir', onAbrir)}
        {podeEditar && !feita && (
          <>
            <button type="button" role="menuitem" data-progresso tabIndex={-1} aria-haspopup="menu" aria-expanded={progressoAberto} onClick={() => setProgressoAberto(v => !v)} onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })} className={`${ITEM} text-zinc-200 focus:bg-[#1f1f23] focus:text-zinc-100`}>
              <TrendingUp size={15} className="shrink-0 text-zinc-400" aria-hidden />Progresso
              <span className="ml-auto text-caption tabular-nums text-zinc-400">{pct(progressoDaTarefa(tarefa))}</span>
              <ChevronDown size={14} className={`shrink-0 text-zinc-400 transition-transform ${progressoAberto ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {progressoAberto && (
              <div role="group" aria-label="Progresso" className="my-1 ml-3 pl-1.5 border-l cron-linha">
                {STATUS_DO_MENU.map(s => (
                  <button key={s} type="button" role="menuitemradio" aria-checked={tarefa.status === s} tabIndex={-1} onClick={fazer(() => onStatus(s))} onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })} className={`${ITEM} focus:bg-[#1f1f23] ${tarefa.status === s ? 'text-zinc-100 font-medium bg-[#1f1f23]' : 'text-zinc-300'}`}>
                    <StatusIcone status={s} />{STATUS_INFO[s].label}
                    <span className="ml-auto text-caption tabular-nums text-zinc-400">{s === 'paused' ? pct(progressoDaTarefa(tarefa)) : pct(PROGRESSO_STATUS[s as keyof typeof PROGRESSO_STATUS])}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {podeEditar && item(Copy, 'Duplicar', onDuplicar)}
        {item(Link2, 'Copiar link', onCopiarLink)}
        {podeEditar && !feita && item(Calendar, 'Reagendar', onReagendar)}
        {podeEditar && (
          <>
            <div role="separator" className="my-1.5 border-t cron-linha" />
            {item(Trash2, 'Excluir', onExcluir, true)}
          </>
        )}
      </div>
    </Flutuante>
  );
}

// ─── Nova tarefa e Reagendar ─────────────────────────────────────────

const CAMPO = `w-full h-9 px-2.5 rounded-md bg-[#0c0c0e] border border-zinc-800 text-body text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500/60`;
const ROTULO = 'flex flex-col gap-1 text-caption text-zinc-400';
const SECUNDARIO = `h-8 px-3 rounded-md text-body font-medium text-zinc-300 hover:text-zinc-100 hover:bg-[#1f1f23] ${FOCO}`;
const PRIMARIO = `h-8 px-3 rounded-md btn-brand text-body font-medium disabled:opacity-50 disabled:pointer-events-none ${FOCO}`;

/** Nada é gravado até confirmar: um clique solto na grade não cria tarefa vazia. */
export function NovaTarefa({ ponto, data, contexto, limite, onFechar, onCriar }: {
  ponto: Ponto;
  data: string;
  /** Projeto ou empreendimento em que ela nasce. */
  contexto?: string;
  limite?: { data: string; projeto: string } | null;
  onFechar: () => void;
  onCriar: (titulo: string, data: string) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [dia, setDia] = useState(data);
  const passa = !!limite && dia > limite.data;
  return (
    <Flutuante ponto={ponto} papel="dialog" rotulo="Nova tarefa" onFechar={onFechar} className="w-72 p-3">
      <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); if (titulo.trim() && dia && !passa) onCriar(titulo.trim(), dia); }}>
        <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título da tarefa" aria-label="Título da tarefa" className={CAMPO} />
        <label className={ROTULO}>Prazo
          <input type="date" required value={dia} max={limite?.data} onChange={e => setDia(e.target.value)} className={CAMPO} />
        </label>
        {passa && <p role="alert" className="text-caption text-red-400">A entrega do projeto "{limite!.projeto}" é {formatarData(limite!.data)}.</p>}
        <div className="flex items-center gap-1">
          {contexto && <span className="min-w-0 truncate text-caption text-zinc-400" title={contexto}>{contexto}</span>}
          <button type="button" onClick={onFechar} className={`ml-auto ${SECUNDARIO}`}>Cancelar</button>
          <button type="submit" disabled={!titulo.trim() || !dia || passa} className={PRIMARIO}>Criar</button>
        </div>
      </form>
    </Flutuante>
  );
}

export function Reagendar({ ponto, titulo, inicio, prazo, comInicio, limite, onFechar, onSalvar }: {
  ponto: Ponto;
  titulo: string;
  inicio: string;
  prazo: string;
  comInicio: boolean;
  limite?: { data: string; projeto: string } | null;
  onFechar: () => void;
  onSalvar: (inicio: string, prazo: string) => void;
}) {
  const [de, setDe] = useState(inicio);
  const [ate, setAte] = useState(prazo);
  const erro = limite && ate > limite.data ? `A entrega do projeto "${limite.projeto}" é ${formatarData(limite.data)}.`
    : comInicio && de && ate && de > ate ? 'O início não pode ser depois do prazo.' : '';
  return (
    <Flutuante ponto={ponto} papel="dialog" rotulo={`Reagendar ${titulo}`} onFechar={onFechar} className="w-72 p-3">
      <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); if (ate && !erro) onSalvar(de, ate); }}>
        <p className="text-body font-semibold text-zinc-100 truncate" title={titulo}>Reagendar: {titulo}</p>
        <div className="flex gap-2">
          {comInicio && <label className={`${ROTULO} flex-1 min-w-0`}>Início<input type="date" value={de} onChange={e => setDe(e.target.value)} className={CAMPO} /></label>}
          <label className={`${ROTULO} flex-1 min-w-0`}>Prazo<input autoFocus type="date" required value={ate} max={limite?.data} onChange={e => setAte(e.target.value)} className={CAMPO} /></label>
        </div>
        {erro && <p role="alert" className="text-caption text-red-400">{erro}</p>}
        <div className="flex justify-end gap-1">
          <button type="button" onClick={onFechar} className={SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={!ate || !!erro} className={PRIMARIO}>Salvar</button>
        </div>
      </form>
    </Flutuante>
  );
}

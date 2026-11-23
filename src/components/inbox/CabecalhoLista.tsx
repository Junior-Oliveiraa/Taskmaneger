// Cabeçalho do card da lista: abas de tipo à esquerda; busca local, Desfecho (só
// no Histórico) e o menu "⋯" à direita.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { FILTROS_TIPO, type FiltroDesfecho, type FiltroTipo } from '../../lib/inbox';
import { DESFECHOS, type Aba, type FiltrosInbox } from '../../lib/inboxFiltros';
import { ALTURA, FOCO, OPCAO, Suspenso } from './BarraFiltros';

const ABAS: { valor: FiltroTipo | null; rotulo: string }[] = [{ valor: null, rotulo: 'Todas' }, ...FILTROS_TIPO];
const PLACEHOLDER = 'Buscar nº, tarefa ou empreendimento';

interface Props {
  aba: Aba;
  filtros: FiltrosInbox;
  onMudar: (f: Partial<FiltrosInbox>) => void;
  contagem: Map<FiltroTipo, number>;
  temAtrasoCritico: boolean;
  idPainel: string;
  menu: React.ReactNode;
}

export default function CabecalhoLista({ aba, filtros, onMudar, contagem, temAtrasoCritico, idPainel, menu }: Props) {
  const [buscaAberta, setBuscaAberta] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const lupa = useRef<HTMLButtonElement>(null);
  const mostrarBusca = buscaAberta || filtros.busca.trim() !== '';

  const abrirBusca = () => {
    setBuscaAberta(true);
    requestAnimationFrame(() => campo.current?.focus());
  };
  const fecharBusca = () => { setBuscaAberta(false); lupa.current?.focus(); };

  // `/` abre e foca a busca, fora de campos editáveis e sem diálogo por cima.
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      setBuscaAberta(true);
      requestAnimationFrame(() => campo.current?.focus());
    };
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  // Abas e controles só dividem a linha se couberem inteiros: os contadores e o
  // Desfecho mudam de tamanho, então mede em vez de supor.
  const linha = useRef<HTMLDivElement>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  const controlesRef = useRef<HTMLDivElement>(null);
  const [duasLinhas, setDuasLinhas] = useState(false);
  useLayoutEffect(() => {
    const l = linha.current, a = abasRef.current, c = controlesRef.current;
    if (!l || !a || !c) return;
    const RECUO = 24, FOLGA = 12;
    const medir = () => setDuasLinhas(a.offsetWidth + c.offsetWidth + RECUO + FOLGA > l.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    [l, a, c].forEach(x => ro.observe(x));
    return () => ro.disconnect();
  }, []);

  const controles = (
    <div ref={controlesRef} className="flex items-center gap-1 shrink-0 ml-auto">
      <button
        ref={lupa}
        type="button"
        aria-label="Buscar nesta lista"
        aria-expanded={mostrarBusca}
        aria-keyshortcuts="/"
        title="Buscar nesta lista (/)"
        onClick={() => {
          if (!mostrarBusca) { abrirBusca(); return; }
          if (filtros.busca.trim()) campo.current?.focus(); else fecharBusca();
        }}
        className={`size-8 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-lg transition-colors hover:bg-[#1f1f23] hover:text-zinc-100 ${mostrarBusca ? 'text-zinc-100 bg-[#1f1f23]' : 'text-zinc-400'} ${FOCO}`}
      >
        <Search size={16} aria-hidden />
      </button>
      {aba === 'historico' && <DesfechoMenu valor={filtros.desfecho} onChange={desfecho => onMudar({ desfecho })} />}
      {menu}
    </div>
  );

  return (
    <div className="relative z-20 shrink-0 border-b border-zinc-800">
      <div ref={linha} className={`flex px-3 ${duasLinhas ? 'flex-col' : 'items-center gap-3'}`}>
        <AbasTipo raiz={abasRef} filtros={filtros} onMudar={onMudar} contagem={contagem} temAtrasoCritico={temAtrasoCritico} idPainel={idPainel} />
        <div className={duasLinhas ? 'flex py-1.5 border-t border-zinc-800 -mx-3 px-3' : 'flex shrink-0 ml-auto'}>{controles}</div>
      </div>
      {mostrarBusca && (
        <Busca key={aba} campo={campo} valor={filtros.busca} onChange={v => onMudar({ busca: v })} onFechar={fecharBusca} />
      )}
    </div>
  );
}

function AbasTipo({ raiz, filtros, onMudar, contagem, temAtrasoCritico, idPainel }: Pick<Props, 'filtros' | 'onMudar' | 'contagem' | 'temAtrasoCritico' | 'idPainel'> & {
  /** Conteúdo em largura natural, para o cabeçalho medir. */
  raiz: React.RefObject<HTMLDivElement | null>;
}) {
  const atual = filtros.tipos[0] ?? null;
  const total = [...contagem.values()].reduce((a, b) => a + b, 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ABAS.findIndex(a => a.valor === atual);
    const alvo = e.key === 'ArrowRight' ? (i + 1) % ABAS.length
      : e.key === 'ArrowLeft' ? (i - 1 + ABAS.length) % ABAS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? ABAS.length - 1 : -1;
    if (alvo < 0) return;
    e.preventDefault();
    const v = ABAS[alvo].valor;
    onMudar({ tipos: v ? [v] : [] });
    raiz.current?.querySelectorAll<HTMLElement>('[role="tab"]')[alvo]?.focus();
  };

  return (
    <div className="min-w-0 overflow-x-auto no-scrollbar">
    <div ref={raiz} role="tablist" aria-label="Tipo de notificação" onKeyDown={onKeyDown} className="flex w-max">
      {ABAS.map(a => {
        const ativa = a.valor === atual;
        const n = a.valor ? contagem.get(a.valor) ?? 0 : total;
        const critico = a.valor === 'prazos' && temAtrasoCritico && n > 0;
        return (
          <button
            key={a.rotulo}
            type="button"
            role="tab"
            aria-selected={ativa}
            aria-controls={idPainel}
            aria-label={`${a.rotulo}, ${n} ${n === 1 ? 'notificação' : 'notificações'}${critico ? ', com atraso crítico' : ''}`}
            title={critico ? 'Há prazos com atraso crítico' : undefined}
            tabIndex={ativa ? 0 : -1}
            onClick={() => onMudar({ tipos: a.valor ? [a.valor] : [] })}
            className={`relative shrink-0 h-12 px-2.5 inline-flex items-center gap-1.5 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 rounded-md ${
              ativa ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {a.rotulo}
            {n > 0 && <span className={critico ? 'badge-danger-soft' : 'badge-neutral'}>{n}</span>}
            {ativa && <span className="tab-underline absolute inset-x-2.5 bottom-0" aria-hidden />}
          </button>
        );
      })}
    </div>
    </div>
  );
}

function Busca({ valor, onChange, onFechar, campo }: {
  valor: string; onChange: (v: string) => void; onFechar: () => void; campo: React.RefObject<HTMLInputElement | null>;
}) {
  const [texto, setTexto] = useState(valor);
  const enviado = useRef(valor);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mudança vinda de fora (Limpar): descarta o que estava digitado.
  useEffect(() => {
    if (valor !== enviado.current) { enviado.current = valor; setTexto(valor); }
  }, [valor]);

  useEffect(() => {
    if (texto === enviado.current) return;
    const t = setTimeout(() => { enviado.current = texto; onChangeRef.current(texto); }, 250);
    return () => clearTimeout(t);
  }, [texto]);

  return (
    <div className="relative px-3 pb-2.5">
      <Search size={14} className="absolute left-[22px] top-[18px] -translate-y-1/2 [@media(pointer:coarse)]:top-5 text-zinc-400 pointer-events-none" aria-hidden />
      <input
        ref={campo}
        type="search"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          if (!texto) { onFechar(); return; }
          setTexto('');
          enviado.current = '';
          onChange('');
        }}
        aria-label="Buscar por número do título, tarefa ou empreendimento"
        placeholder={PLACEHOLDER}
        className={`${ALTURA} w-full pl-8 pr-2 bg-[#08080a] border border-zinc-800 hover:border-zinc-700 text-zinc-100 placeholder:text-zinc-500 ${FOCO}`}
      />
    </div>
  );
}

function DesfechoMenu({ valor, onChange }: { valor: FiltroDesfecho; onChange: (v: FiltroDesfecho) => void }) {
  const rotulo = DESFECHOS.find(d => d.valor === valor)!.rotulo;
  const ativo = valor !== 'todos';
  return (
    <Suspenso papel="dialog" largura="w-48" ativo={ativo} aria={`Filtrar por desfecho: ${rotulo}`} rotulo={ativo ? <>Desfecho: {rotulo}</> : 'Desfecho'}>
      {fechar => <OpcoesDesfecho valor={valor} onEscolher={v => { onChange(v); fechar(); }} />}
    </Suspenso>
  );
}

function OpcoesDesfecho({ valor, onEscolher }: { valor: FiltroDesfecho; onEscolher: (v: FiltroDesfecho) => void }) {
  const grupo = useRef<HTMLDivElement>(null);
  useEffect(() => { grupo.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const ops = Array.from(grupo.current?.querySelectorAll<HTMLElement>('[role="radio"]') || []);
    const i = ops.indexOf(document.activeElement as HTMLElement);
    ops[Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), ops.length - 1)]?.focus();
  };
  return (
    <div ref={grupo} role="radiogroup" aria-label="Desfecho" onKeyDown={onKeyDown} className="p-1.5">
      {DESFECHOS.map(d => (
        <button
          key={d.valor}
          type="button"
          role="radio"
          aria-checked={d.valor === valor}
          onClick={() => onEscolher(d.valor)}
          className={`${OPCAO} hover:bg-[#1f1f23] focus-visible:bg-[#1f1f23] ${d.valor === valor ? 'text-zinc-100 font-medium' : 'text-zinc-300'} ${FOCO}`}
        >
          {d.rotulo}
          {d.valor === valor && <Check size={14} className="ml-auto shrink-0 text-brand-300" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

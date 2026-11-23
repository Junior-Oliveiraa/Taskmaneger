// Briefing das classes: a seção recolhível e os campos de sugestões + texto livre.
import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, Clipboard, Plus,
} from 'lucide-react';
import { BOTAO_BORDA, CAIXA, CAMPO, FOCO, ItemMenu, Menu, TituloSecao } from './Propriedade';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Título, contagem e, com o briefing vazio, o convite para preencher. */
export function SecaoBriefing({ cor, aberta, onAlternar, preenchidos, total, resumo, disabled, children }: {
  cor?: string;
  aberta: boolean;
  onAlternar: () => void;
  preenchidos: number;
  total: number;
  /** O que se preenche aqui, no convite. */
  resumo: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <TituloSecao
        cor={cor}
        aberta={aberta}
        onAlternar={onAlternar}
        extra={preenchidos > 0 && <span className="text-caption text-zinc-500 tabular-nums">{preenchidos} de {total}</span>}
      >
        Briefing
      </TituloSecao>
      {preenchidos === 0 && !aberta && (disabled ? <p className="text-body text-zinc-500">Briefing não preenchido.</p> : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl border border-dashed border-zinc-700">
          <button type="button" onClick={onAlternar} className={BOTAO_BORDA}>
            <Clipboard size={15} aria-hidden /> Preencher briefing
          </button>
          <span className="text-body text-zinc-500">{resumo}</span>
        </div>
      ))}
      {aberta && (
        <div className="@container">
          <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-x-8 gap-y-6">{children}</div>
        </div>
      )}
    </div>
  );
}

export function GrupoBriefing({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <h4 className="text-body font-medium text-zinc-200">{titulo}</h4>
      {children}
    </div>
  );
}

/** Nome à esquerda e campo à direita; em telas estreitas, o nome em cima. */
export function LinhaBriefing({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 @md:grid-cols-[9.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
      <span className="@md:min-h-9 @md:py-1 flex items-center text-body text-zinc-400 [overflow-wrap:anywhere]">{rotulo}</span>
      {children}
    </div>
  );
}

const ALTURA = 'min-h-9 [@media(pointer:coarse)]:min-h-10';

/** Campo do briefing: várias escolhas, da lista ou escritas. */
export function EscolhasBriefing({ rotulo, opcoes, valores, disabled, mostrar = v => v, onAlternar, onAdicionar }: {
  rotulo: string;
  opcoes: string[];
  valores: string[];
  disabled?: boolean;
  /** Como o valor aparece na etiqueta. */
  mostrar?: (valor: string) => string;
  onAlternar: (opcao: string) => void;
  onAdicionar: (texto: string) => void;
}) {
  // Sem permissão para editar não há campo: só o valor.
  if (disabled) return (
    <LinhaBriefing rotulo={rotulo}>
      <span className="@md:min-h-9 py-1 flex flex-wrap items-center gap-1.5 text-body text-zinc-500">
        {valores.length === 0 ? '—' : valores.map(v => <Valor key={v}>{mostrar(v)}</Valor>)}
      </span>
    </LinhaBriefing>
  );
  return (
    <LinhaBriefing rotulo={rotulo}>
      <Menu
        rotulo={`${rotulo}: ${valores.map(mostrar).join(', ') || 'não definido'}`}
        bloco
        largura="w-full min-w-64"
        classe={`group ${CAIXA} ${ALTURA} flex items-center gap-2 text-left aria-expanded:!border-blue-500/60 ${valores.length ? '!pl-1.5 py-1' : ''} ${FOCO}`}
        gatilho={<>
          <span className="flex-1 min-w-0 flex flex-wrap gap-1.5">
            {valores.length === 0
              ? <span className="text-zinc-500">Selecionar ou escrever</span>
              : valores.map(v => <Valor key={v}>{mostrar(v)}</Valor>)}
          </span>
          <ChevronDown size={15} className="shrink-0 text-zinc-500 group-hover:text-zinc-200 transition-colors" aria-hidden />
        </>}
      >
        {() => <Opcoes rotulo={rotulo} opcoes={opcoes} valores={valores} mostrar={mostrar} onAlternar={onAlternar} onAdicionar={onAdicionar} />}
      </Menu>
    </LinhaBriefing>
  );
}

const Valor = ({ children }: { children: React.ReactNode }) =>
  <span className="max-w-full px-2 py-px rounded-md bg-[#27272a] text-zinc-100 [overflow-wrap:anywhere]">{children}</span>;

/** Sugestões, com um campo para filtrar ou escrever um valor próprio. */
function Opcoes({ rotulo, opcoes, valores, mostrar, onAlternar, onAdicionar }: {
  rotulo: string;
  opcoes: string[];
  valores: string[];
  mostrar: (valor: string) => string;
  onAlternar: (opcao: string) => void;
  onAdicionar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const todas = opcoes.concat(valores.filter(v => !opcoes.includes(v)));
  const busca = semAcento(texto);
  const visiveis = todas.filter(o => semAcento(mostrar(o)).includes(busca));
  const igual = todas.find(o => semAcento(mostrar(o)) === busca);

  const confirmar = () => {
    if (!busca) return;
    onAdicionar(igual ?? texto.trim());
    setTexto('');
    campo.current?.focus();
  };

  // Fechar com um texto próprio escrito guarda o texto; Esc descarta.
  const aoFechar = useRef(() => {});
  aoFechar.current = () => { if (busca && visiveis.length === 0) onAdicionar(texto.trim()); };
  useEffect(() => {
    // No toque o foco abriria o teclado por cima das sugestões.
    if (!window.matchMedia('(pointer: coarse)').matches) campo.current?.focus({ preventScroll: true });
    let descartar = false;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') descartar = true; };
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('keydown', esc, true);
      if (!descartar) aoFechar.current();
    };
  }, []);

  return (
    <>
      <div className="sticky -top-1 z-10 shrink-0 -mx-1 -mt-1 mb-1 p-1 bg-[#18181b] border-b border-white/10">
        <input
          ref={campo}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); confirmar(); } }}
          aria-label={`Buscar ou escrever: ${rotulo}`}
          placeholder={todas.length ? 'Buscar ou escrever…' : 'Escrever…'}
          className="w-full h-8 [@media(pointer:coarse)]:h-10 px-2 bg-transparent text-body text-zinc-100 placeholder:text-zinc-500 outline-none"
        />
      </div>
      {busca && !igual && (
        <ItemMenu onClick={confirmar}>
          <Plus size={15} className="shrink-0 text-blue-400" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">Adicionar “{texto.trim()}”</span>
        </ItemMenu>
      )}
      {visiveis.map(op => (
        <ItemMenu key={op} marcado={valores.includes(op)} onClick={() => { onAlternar(op); setTexto(''); }}>
          <span className="min-w-0 [overflow-wrap:anywhere]">{mostrar(op)}</span>
        </ItemMenu>
      ))}
    </>
  );
}

/** Campo de texto corrido, que cresce com o conteúdo. */
export function TextoBriefing({ rotulo, valor, placeholder, disabled, onMudar }: {
  rotulo: string;
  valor: string;
  placeholder: string;
  disabled?: boolean;
  onMudar: (texto: string) => void;
}) {
  if (disabled) return (
    <LinhaBriefing rotulo={rotulo}>
      <p className={`py-1.5 text-body whitespace-pre-wrap [overflow-wrap:anywhere] ${valor ? 'text-zinc-200' : 'text-zinc-500'}`}>{valor || '—'}</p>
    </LinhaBriefing>
  );
  return (
    <LinhaBriefing rotulo={rotulo}>
      <textarea
        value={valor}
        rows={1}
        onChange={e => onMudar(e.target.value)}
        aria-label={rotulo}
        placeholder={placeholder}
        className={`field-sizing-content ${CAMPO} ${ALTURA} max-h-60 py-1.5 resize-none`}
      />
    </LinhaBriefing>
  );
}

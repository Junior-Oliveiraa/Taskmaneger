// Imagens das entregas: miniaturas e visualização em tela cheia.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { FOCO } from './Propriedade';

/** Imagem que avisa quando o arquivo não existe mais. */
export function Imagem({ src, alt, className, pequena }: { src: string; alt: string; className?: string; pequena?: boolean }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  if (falhou === src) return (
    <span title="Arquivo indisponível" className={pequena ? 'h-full px-3 flex items-center text-zinc-500' : 'min-w-28 min-h-20 h-full px-3 flex flex-col items-center justify-center gap-1 text-caption text-zinc-500 text-center'}>
      <ImageOff size={18} aria-hidden /> <span className={pequena ? 'sr-only' : ''}>Arquivo indisponível</span>
    </span>
  );
  return <img src={src} alt={alt} loading="lazy" onError={() => setFalhou(src)} className={className} />;
}

/** Tela cheia, com setas. Esc fecha só a imagem. */
export function VerImagens({ imagens, inicial = 0, onFechar }: { imagens: string[]; inicial?: number; onFechar: () => void }) {
  const [i, setI] = useState(inicial);
  const passo = (n: number) => setI(v => (v + n + imagens.length) % imagens.length);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onFechar(); }
      else if (imagens.length > 1 && e.key === 'ArrowLeft') { e.stopPropagation(); passo(-1); }
      else if (imagens.length > 1 && e.key === 'ArrowRight') { e.stopPropagation(); passo(1); }
    };
    document.addEventListener('keydown', tecla, true);
    return () => document.removeEventListener('keydown', tecla, true);
  });

  const botao = `cursor-pointer absolute size-10 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors ${FOCO}`;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Imagem em tela cheia" className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 sm:p-12 animate-fade-in" onClick={onFechar}>
      <img src={imagens[i]} alt={`Imagem ${i + 1} de ${imagens.length}`} className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
      <button type="button" autoFocus onClick={onFechar} aria-label="Fechar" className={`${botao} top-4 right-4`}><X size={18} aria-hidden /></button>
      {imagens.length > 1 && <>
        <button type="button" onClick={e => { e.stopPropagation(); passo(-1); }} aria-label="Imagem anterior" className={`${botao} left-4`}><ChevronLeft size={20} aria-hidden /></button>
        <button type="button" onClick={e => { e.stopPropagation(); passo(1); }} aria-label="Próxima imagem" className={`${botao} right-4`}><ChevronRight size={20} aria-hidden /></button>
        <span className="absolute bottom-4 px-3 py-1 rounded-full bg-black/60 text-body text-white tabular-nums">{i + 1} de {imagens.length}</span>
      </>}
    </div>,
    document.body,
  );
}

export function Miniaturas({ imagens, rotulo, grande }: { imagens: string[]; rotulo: string; grande?: boolean }) {
  const [vendo, setVendo] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={rotulo}>
      {imagens.map((src, i) => (
        <button
          key={`${src}-${i}`}
          type="button"
          onClick={() => setVendo(i)}
          aria-label={`${rotulo}: abrir imagem ${i + 1}`}
          title="Abrir em tela cheia"
          className={`overflow-hidden rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors ${grande ? 'h-56 max-w-full' : 'h-20'} ${FOCO}`}
        >
          <Imagem src={src} alt="" pequena={!grande} className="h-full w-auto object-contain" />
        </button>
      ))}
      {vendo !== null && <VerImagens imagens={imagens} inicial={vendo} onFechar={() => setVendo(null)} />}
    </div>
  );
}

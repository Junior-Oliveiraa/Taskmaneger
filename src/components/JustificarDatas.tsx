// Justificativa obrigatória ao mudar um início ou prazo já definido. Montado uma vez
// no App; qualquer tela pede com `pedirJustificativa` e espera a resposta.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MudancaData, textoMudanca } from '../lib/dataInicio';
import { BOTAO_BORDA, CAMPO, FOCO } from './tarefa/Propriedade';

interface Pedido { tarefa: string; mudancas: MudancaData[]; responder: (motivo: string | null) => void }

let abrir: ((p: Pedido) => void) | null = null;

/** Motivo escrito, ou `null` se a pessoa desistiu da mudança. */
export function pedirJustificativa(tarefa: string, mudancas: MudancaData[]): Promise<string | null> {
  return new Promise(resolve => (abrir ? abrir({ tarefa, mudancas, responder: resolve }) : resolve(null)));
}

export default function JustificarDatas() {
  const [fila, setFila] = useState<Pedido[]>([]);
  const [motivo, setMotivo] = useState('');
  const pedido = fila[0];

  useEffect(() => {
    abrir = p => setFila(f => [...f, p]);
    return () => { abrir = null; };
  }, []);

  const responder = (m: string | null) => {
    pedido?.responder(m);
    setMotivo('');
    setFila(f => f.slice(1));
  };

  // Esc fecha só a janela, não o painel por baixo.
  useEffect(() => {
    if (!pedido) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); responder(null); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  });

  if (!pedido) return null;
  const pronto = motivo.trim().length > 0;
  return createPortal(
    <div className="tela-tarefa fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={e => { if (e.target === e.currentTarget) responder(null); }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="justificar-datas-titulo"
        onSubmit={e => { e.preventDefault(); if (pronto) responder(motivo.trim()); }}
        className="bg-[#18181b] border border-white/10 rounded-2xl p-5 flex flex-col gap-2 w-full max-w-[440px] shadow-2xl animate-slide-up"
      >
        <h3 id="justificar-datas-titulo" className="text-heading font-semibold text-zinc-100">Justificar a alteração</h3>
        <p className="text-body text-zinc-400 [overflow-wrap:anywhere]">{pedido.tarefa || 'Sem título'}</p>
        <ul className="flex flex-col text-body text-zinc-200 tabular-nums">
          {pedido.mudancas.map(m => <li key={m.campo}>{textoMudanca(m)}</li>)}
        </ul>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Por que a data precisa mudar?"
          aria-label="Justificativa da alteração de data"
          autoFocus
          required
          className={`${CAMPO} mt-2 py-2 min-h-24 resize-y`}
        />
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={() => responder(null)} className={BOTAO_BORDA}>Cancelar</button>
          <button type="submit" disabled={!pronto} className={`btn-brand h-9 [@media(pointer:coarse)]:h-10 px-3 rounded-lg text-body font-medium disabled:opacity-40 disabled:cursor-not-allowed ${FOCO}`}>
            Salvar alteração
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

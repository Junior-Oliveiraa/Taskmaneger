// Ação com "Desfazer": a gravação espera a janela, porque prazo, status e exclusão
// disparam histórico e avisos que não dá para voltar atrás depois de gravados.
// Uma pendência por vez: a próxima ação grava a anterior.
import { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';

const DESFAZER_MS = 6000;

export interface Pendencia {
  id: string;
  mensagem: string;
  /** Ausente = exclusão. */
  updates?: Partial<Task>;
}

export function useDesfazer(aplicar: (p: Pendencia) => void) {
  const [pendente, setPendente] = useState<Pendencia | null>(null);
  const atual = useRef<{ p: Pendencia; timer: ReturnType<typeof setTimeout> } | null>(null);
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;

  const encerrar = (gravar: boolean) => {
    if (!atual.current) return;
    const { p, timer } = atual.current;
    clearTimeout(timer);
    atual.current = null;
    if (gravar) aplicarRef.current(p);
    setPendente(null);
  };

  const agendar = (nova: Pendencia) => {
    const anterior = atual.current?.p;
    // Segunda mudança na mesma tarefa: soma, e "Desfazer" volta as duas.
    const soma = anterior && anterior.id === nova.id && anterior.updates && nova.updates;
    if (soma) clearTimeout(atual.current!.timer); else encerrar(true);
    const p = soma ? { ...nova, updates: { ...anterior.updates, ...nova.updates } } : nova;
    atual.current = { p, timer: setTimeout(() => encerrar(true), DESFAZER_MS) };
    setPendente(p);
  };

  // Saiu da tela ou fechou a aba dentro da janela: grava o que faltava.
  useEffect(() => {
    const gravar = () => encerrar(true);
    window.addEventListener('pagehide', gravar);
    return () => { window.removeEventListener('pagehide', gravar); gravar(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { pendente, agendar, desfazer: () => encerrar(false) };
}

// O app não usa roteador: a tela aberta é estado do App e a URL fica em "/".
// Este hook dá à Caixa de entrada um endereço próprio (?tela=inbox&…) para que
// o link com filtros possa ser aberto por outra pessoa e o "voltar" do
// navegador retorne a ela. As demais telas seguem sem URL.
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ViewType } from '../types';
import { PARAM_TELA, TELA_INBOX, ehUrlDaInbox } from './inboxFiltros';

interface EstadoHistorico { orbitTela?: ViewType }

const URL_INBOX = `?${PARAM_TELA}=${TELA_INBOX}`;

/** Tela inicial: a Caixa de entrada quando o link aponta para ela. */
export function telaInicial(padrao: ViewType): ViewType {
  return ehUrlDaInbox(window.location.search) ? 'inbox' : padrao;
}

export function useHistoricoInbox(tela: ViewType, setTela: (t: ViewType) => void) {
  const anterior = useRef<ViewType>(tela);
  const doNavegador = useRef(false);
  const setTelaRef = useRef(setTela);
  setTelaRef.current = setTela;

  // Layout effect: a URL precisa estar certa antes dos efeitos da própria Caixa de
  // entrada, que só escrevem os filtros quando a URL já é dela.
  useLayoutEffect(() => {
    const veioDe = anterior.current;
    anterior.current = tela;
    if (veioDe === tela) return;
    if (doNavegador.current) { doNavegador.current = false; return; }
    if (veioDe !== 'inbox' && tela !== 'inbox') return;
    // Anota de onde saiu (para o "voltar") e cria a entrada da tela nova.
    window.history.replaceState({ orbitTela: veioDe } satisfies EstadoHistorico, '');
    window.history.pushState(
      { orbitTela: tela } satisfies EstadoHistorico, '',
      tela === 'inbox' ? `${window.location.pathname}${URL_INBOX}` : window.location.pathname,
    );
  }, [tela]);

  useEffect(() => {
    const aoNavegar = (e: PopStateEvent) => {
      const alvo = ehUrlDaInbox(window.location.search) ? 'inbox' : (e.state as EstadoHistorico | null)?.orbitTela ?? 'home';
      if (alvo === anterior.current) return;
      doNavegador.current = true;
      setTelaRef.current(alvo);
    };
    window.addEventListener('popstate', aoNavegar);
    return () => window.removeEventListener('popstate', aoNavegar);
  }, []);
}

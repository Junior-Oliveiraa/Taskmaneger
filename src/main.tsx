import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import LimiteDeErro from './components/LimiteDeErro';

import { LP_CORRETOR_BASE_PATH, LP_VALIDACAO_BASE_PATH, aplicarTemaLp, temaLpSalvo } from './lib/lpCorretor';

// Carregados sob demanda para que os dois lados não paguem o bundle do outro —
// a LP é aberta no celular do corretor e não pode arrastar junto os providers,
// o editor e as planilhas do app interno.
const AppRoot = lazy(() => import('./AppRoot'));
const LpCorretorPage = lazy(() => import('./components/LpCorretorPage'));
const VisitaPublicaPage = lazy(() => import('./components/VisitaPublicaPage'));

// Rota pública da LP do Corretor (/tabela/<slug>): renderizada fora do
// AuthProvider e de todo o resto do app, então quem abre o link não carrega —
// nem alcança — nenhuma outra tela. O conteúdo vem da RPC get_lp_corretor,
// a única coisa liberada para a chave anon.
function segmentoDaRota(prefixo: string): string | null {
  const prefix = `${prefixo}/`;
  const path = decodeURIComponent(window.location.pathname);
  if (!path.startsWith(prefix)) return null;
  return path.slice(prefix.length).replace(/\/+$/, '') || null;
}

const lpSlug = segmentoDaRota(LP_CORRETOR_BASE_PATH);

// /validacao/<token>: a MESMA página da LP, servida ao vivo pela RPC de
// validação. Mora aqui, junto da rota pública, porque compartilha a condição
// que importa — renderizar fora do AuthProvider, sem arrastar o app interno.
const lpToken = segmentoDaRota(LP_VALIDACAO_BASE_PATH);

// /visita/<token>: cadastro de visitas das recepcionistas, também fora do app interno.
const visitaToken = segmentoDaRota('/visita'); // = VISITA_BASE_PATH (lib/visitaPublica)

// A LP tem visual próprio e não segue a preferência do sistema nem a do usuário
// do app interno: quem escolhe é quem abre o link, pelo botão de tema da própria
// página, e a escolha vive numa chave só dela. Aplicado aqui, antes do render,
// para a página não piscar no tema errado a cada carregamento.
if (lpSlug || lpToken) aplicarTemaLp(temaLpSalvo());
// A página de visitas é sempre escura (visual da marca, sem botão de tema).
if (visitaToken) aplicarTemaLp('escuro');

// A meta viewport NÃO é alterada aqui de propósito. Acrescentar
// `viewport-fit=cover` por JavaScript depois do carregamento fazia o Samsung
// Internet descartar a meta inteira e montar a página com o viewport padrão de
// ~980px — a página aparecia encolhida, numa coluna estreita no meio da tela.
// Chrome e Safari reprocessavam normalmente, o que escondia o problema.
// O custo de não usar viewport-fit=cover é o banner não sangrar por baixo do
// notch no iPhone; os env(safe-area-inset-*) da LP passam a valer 0 e o próprio
// navegador reserva a área do recorte.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="min-h-screen bg-[#08080a]" />}>
      {lpSlug ? <LpCorretorPage slug={lpSlug} />
        : lpToken ? <LpCorretorPage validacaoToken={lpToken} />
        : visitaToken ? <VisitaPublicaPage token={visitaToken} />
        : <LimiteDeErro><AppRoot /></LimiteDeErro>}
    </Suspense>
  </StrictMode>,
);

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface Estado { erro: Error | null }

/**
 * Sem isto, qualquer erro de renderização desmonta a árvore inteira e o usuário
 * vê uma tela vazia. Aqui ele vê o que houve e consegue recarregar.
 */
export default class LimiteDeErro extends Component<Props, Estado> {
  declare props: Readonly<Props>;
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[Orbit] Erro de renderização:', erro, info.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#08080a] text-zinc-100">
        <h1 className="text-heading font-semibold">Algo deu errado nesta tela</h1>
        <p className="text-body text-zinc-400">Recarregue a página. Se continuar, envie a mensagem abaixo para o suporte.</p>
        <pre className="max-w-full overflow-auto text-left text-caption text-red-400 bg-[#121214] border border-zinc-800 rounded-lg p-3 whitespace-pre-wrap">{erro.message}</pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-body font-medium hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Recarregar
        </button>
      </div>
    );
  }
}

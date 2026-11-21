// Itens do menu lateral. O App traduz cada item para a tela (ViewType) e a aba
// interna correspondente; o menu só conhece estes ids.

export type NavItemId =
  // Marketing
  | 'home'
  | 'inbox'
  | 'my_tasks'
  | 'projetos'
  | 'portfolios'
  | 'rede_social'
  | 'empreendimentos'
  | 'analytics'
  // Comercial
  | 'leads'
  | 'propostas'
  | 'dashboard_comercial'
  | 'tabelas_vendas'
  // Financeiro
  | 'titulos'
  | 'cartao'
  | 'dashboard_financeiro';

/** Seção do Financeiro aberta na tela de Finanças. */
export type FinanceiroSecao = 'titulos' | 'cartao' | 'dashboard';

/** Modo das telas de tarefas (Minhas tarefas, projeto, todas as tarefas). */
export type ModoTarefas = 'board' | 'list' | 'calendar';

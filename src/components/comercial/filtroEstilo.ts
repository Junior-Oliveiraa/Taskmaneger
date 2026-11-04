// Estilo único dos filtros da aba Desempenho: cada filtro é um só botão de 36px,
// com ícone, o valor atual e a seta. Nada de forma dentro de forma; as opções
// ficam no menu que o botão abre. O azul é reservado a filtro que está
// restringindo os dados; em "Todos" o botão fica neutro.
const BASE_FILTRO =
  'h-9 inline-flex items-center gap-2 px-3 text-[11px] font-semibold whitespace-nowrap rounded-lg border transition-colors ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

export const BOTAO_FILTRO = `${BASE_FILTRO} bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/20`;

export const BOTAO_FILTRO_NEUTRO = `${BASE_FILTRO} bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100`;

export const ICONE_FILTRO = 'shrink-0 opacity-80';

/** Texto de apoio dentro do botão (as datas do período, por exemplo). */
export const TEXTO_APOIO = 'font-normal text-zinc-400 tabular-nums';

export const MENU_FILTRO = 'absolute top-full left-0 mt-2 z-50 py-1 bg-[#141417] border border-zinc-800 rounded-xl shadow-xl shadow-black/60';

export const ITEM_MENU = 'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors';
export const ITEM_ON = 'text-zinc-100 bg-zinc-800/60';
export const ITEM_OFF = 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40';

// Filtros da Caixa de entrada: regra pura,
// serialização na URL e persistência por usuário/aba. Sem React.
//
// Como uma notificação chega a cada dimensão:
//   Empreendimento: notificação → tarefa → tasks.project_id → projects
//                   ou notificação → título Sienge → empreendimento (por NOME)
//   Projeto:        notificação → tarefa → marketing_projeto_tarefas → marketing_projetos
// Não existe relação Empreendimento ↔ Projeto: os dois se combinam com "E".
import type { AppNotification } from '../types';
import { isoLocal, somarDias } from './datas';
import { FILTROS_TIPO, normalizar, type FiltroDesfecho, type FiltroTipo } from './inbox';

export type Aba = 'pendentes' | 'historico';
export type PresetPeriodo = 'todo' | 'hoje' | '7d' | '30d' | 'mes' | 'mes-passado' | 'prox7' | 'prox30';
/** de/ate em YYYY-MM-DD, inclusive, no fuso local. */
export type Periodo = { preset: PresetPeriodo } | { preset: 'personalizado'; de: string; ate: string };

export const PERIODOS: { valor: PresetPeriodo; rotulo: string }[] = [
  { valor: 'todo', rotulo: 'Todo o período' },
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7d', rotulo: 'Últimos 7 dias' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes-passado', rotulo: 'Mês passado' },
];

/** Em tarefas o período é o do prazo, então também olha para a frente. */
export const PERIODOS_TAREFAS: typeof PERIODOS = [
  ...PERIODOS.slice(0, 2),
  { valor: 'prox7', rotulo: 'Próximos 7 dias' },
  { valor: 'prox30', rotulo: 'Próximos 30 dias' },
  ...PERIODOS.slice(2),
];

export const DESFECHOS: { valor: FiltroDesfecho; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'aprovados', rotulo: 'Aprovados' },
  { valor: 'reprovados', rotulo: 'Reprovados' },
  { valor: 'resolvidos', rotulo: 'Resolvidos' },
];

export interface FiltrosInbox {
  busca: string;
  periodo: Periodo;
  empreendimentos: string[];
  projetos: string[];
  /** Aba de tipo do card: vazio = "Todas"; no máximo um. */
  tipos: FiltroTipo[];
  /** Só tem efeito no Histórico. */
  desfecho: FiltroDesfecho;
}

export function filtrosPadrao(aba: Aba): FiltrosInbox {
  return {
    busca: '',
    periodo: { preset: aba === 'historico' ? '30d' : 'todo' },
    empreendimentos: [],
    projetos: [],
    tipos: [],
    desfecho: 'todos',
  };
}

export function periodoPadrao(f: FiltrosInbox, aba: Aba): boolean {
  return f.periodo.preset === filtrosPadrao(aba).periodo.preset;
}

export function temEscopo(f: FiltrosInbox): boolean {
  return f.empreendimentos.length + f.projetos.length > 0;
}

export function temFiltros(f: FiltrosInbox, aba: Aba): boolean {
  return f.busca.trim() !== '' || !periodoPadrao(f, aba) || temEscopo(f) || f.tipos.length > 0
    || (aba === 'historico' && f.desfecho !== 'todos');
}

// ─── Período ─────────────────────────────────────────────────────────

/** Limites inclusive em YYYY-MM-DD; `undefined` = sem limite daquele lado. */
export function limitesPeriodo(p: Periodo, agora: Date): { de?: string; ate?: string } {
  switch (p.preset) {
    case 'todo': return {};
    case 'hoje': return { de: isoLocal(agora) };
    case '7d': return { de: somarDias(-6, agora) };
    case '30d': return { de: somarDias(-29, agora) };
    case 'prox7': return { de: isoLocal(agora), ate: somarDias(6, agora) };
    case 'prox30': return { de: isoLocal(agora), ate: somarDias(29, agora) };
    case 'mes': return { de: isoLocal(new Date(agora.getFullYear(), agora.getMonth(), 1)) };
    case 'mes-passado': return {
      de: isoLocal(new Date(agora.getFullYear(), agora.getMonth() - 1, 1)),
      ate: isoLocal(new Date(agora.getFullYear(), agora.getMonth(), 0)),
    };
    case 'personalizado': return { de: p.de, ate: p.ate };
  }
}

/**
 * Data de chegada dentro do período. Presets que terminam "agora" não têm limite
 * superior: adiar move o created_at para o futuro, e a adiada não deve sumir.
 */
export function casaPeriodo(createdAt: string, p: Periodo, agora: Date): boolean {
  const { de, ate } = limitesPeriodo(p, agora);
  if (!de && !ate) return true;
  const dia = isoLocal(new Date(createdAt));
  return (!de || dia >= de) && (!ate || dia <= ate);
}

/**
 * Prazo da tarefa dentro do período. Diferente da chegada de uma notificação, o
 * prazo pode estar no futuro: aqui todo período tem as duas pontas. Sem prazo só
 * entra em "Todo o período".
 */
export function casaPeriodoPrazo(dueDate: string | undefined | null, p: Periodo, agora: Date): boolean {
  if (p.preset === 'todo') return true;
  const dia = dueDate?.slice(0, 10);
  if (!dia) return false;
  const { de, ate } = limitesPeriodo(p, agora);
  const fim = ate ?? (p.preset === 'mes' ? isoLocal(new Date(agora.getFullYear(), agora.getMonth() + 1, 0)) : isoLocal(agora));
  return (!de || dia >= de) && dia <= fim;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const ddmmaaaa = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;

export function rotuloPeriodo(p: Periodo): string {
  if (p.preset !== 'personalizado') return PERIODOS_TAREFAS.find(x => x.valor === p.preset)!.rotulo;
  if (p.de === p.ate) return ddmm(p.de);
  // O ano só aparece quando o intervalo atravessa anos.
  return p.de.slice(0, 4) === p.ate.slice(0, 4)
    ? `${ddmm(p.de)} – ${ddmm(p.ate)}`
    : `${ddmmaaaa(p.de)} – ${ddmmaaaa(p.ate)}`;
}

/** Intervalo com as pontas em ordem (o usuário pode escolher ao contrário). */
export function periodoPersonalizado(a: string, b: string): Periodo {
  return a <= b ? { preset: 'personalizado', de: a, ate: b } : { preset: 'personalizado', de: b, ate: a };
}

// ─── Escopo (Empreendimento, Projeto) ─────────────────────

export interface VinculosInbox {
  /** task_id → empreendimento (projects.id). */
  empreendimentoDaTarefa: Map<string, string | undefined>;
  /** sienge_title_id → nome do empreendimento. */
  empreendimentoDoTitulo: Map<string, string | undefined>;
  /** nome normalizado do empreendimento → projects.id. */
  empreendimentoPorNome: Map<string, string>;
  /** task_id → projeto. */
  projetoDaTarefa: Record<string, string>;
}

export const chaveNome = (nome: string) => normalizar(nome.trim());

export function empreendimentoDe(n: AppNotification, v: VinculosInbox): string | undefined {
  if (n.taskId) return v.empreendimentoDaTarefa.get(n.taskId);
  const nome = n.siengeTitleId ? v.empreendimentoDoTitulo.get(n.siengeTitleId) : undefined;
  return nome ? v.empreendimentoPorNome.get(chaveNome(nome)) : undefined;
}

export function casaEscopo(
  n: AppNotification,
  f: Pick<FiltrosInbox, 'empreendimentos' | 'projetos'>,
  v: VinculosInbox,
): boolean {
  if (f.empreendimentos.length > 0) {
    const e = empreendimentoDe(n, v);
    if (!e || !f.empreendimentos.includes(e)) return false;
  }
  if (f.projetos.length === 0) return true;
  const projeto = n.taskId ? v.projetoDaTarefa[n.taskId] : undefined;
  return !!projeto && f.projetos.includes(projeto);
}

// ─── URL ─────────────────────────────────────────────────────────────

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (s: string) => {
  if (!DATA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  return isoLocal(new Date(a, m - 1, d)) === s;
};

const textoPeriodo = (p: Periodo) => p.preset === 'personalizado' ? `${p.de}_${p.ate}` : p.preset;

function lerPeriodo(s: string | null, aba: Aba): Periodo {
  const preset = PERIODOS.find(p => p.valor === s);
  if (preset) return { preset: preset.valor };
  const [de, ate] = (s ?? '').split('_');
  if (de && ate && dataValida(de) && dataValida(ate)) return periodoPersonalizado(de, ate);
  return filtrosPadrao(aba).periodo;
}

export const PARAM_TELA = 'tela';
export const TELA_INBOX = 'inbox';

/**
 * Query string da Caixa de entrada. A `aba` vai sempre explícita: distingue um
 * link "sem filtros" de uma entrada que nunca gravou estado.
 */
export function serializarFiltros(aba: Aba, f: FiltrosInbox): string {
  const q = new URLSearchParams();
  q.set(PARAM_TELA, TELA_INBOX);
  q.set('aba', aba);
  if (f.busca.trim()) q.set('q', f.busca.trim());
  if (!periodoPadrao(f, aba)) q.set('periodo', textoPeriodo(f.periodo));
  if (f.empreendimentos.length) q.set('empreendimento', f.empreendimentos.join(','));
  if (f.projetos.length) q.set('projeto', f.projetos.join(','));
  if (f.tipos.length) q.set('tipo', f.tipos.join(','));
  if (aba === 'historico' && f.desfecho !== 'todos') q.set('desfecho', f.desfecho);
  // Vírgulas legíveis no link (válidas em query string).
  return `?${q.toString().replace(/%2C/g, ',')}`;
}

export function ehUrlDaInbox(search: string): boolean {
  return new URLSearchParams(search).get(PARAM_TELA) === TELA_INBOX;
}

const listaDe = (s: string | null): string[] => [...new Set((s ?? '').split(',').map(x => x.trim()).filter(Boolean))];
const tiposValidos = (xs: string[]) => FILTROS_TIPO.map(t => t.valor).filter(t => xs.includes(t));
const desfechoValido = (s: unknown): FiltroDesfecho => DESFECHOS.find(d => d.valor === s)?.valor ?? 'todos';

/** Estado descrito pela URL, ou null se ela não traz estado da Caixa de entrada. */
export function desserializarFiltros(search: string): { aba: Aba; filtros: FiltrosInbox } | null {
  const q = new URLSearchParams(search);
  if (q.get(PARAM_TELA) !== TELA_INBOX) return null;
  const temEstado = ['aba', 'q', 'periodo', 'empreendimento', 'projeto', 'tipo', 'desfecho'].some(k => q.has(k));
  if (!temEstado) return null;
  const aba: Aba = q.get('aba') === 'historico' ? 'historico' : 'pendentes';
  return {
    aba,
    filtros: {
      busca: q.get('q') ?? '',
      periodo: lerPeriodo(q.get('periodo'), aba),
      empreendimentos: listaDe(q.get('empreendimento')),
      projetos: listaDe(q.get('projeto')),
      tipos: tiposValidos(listaDe(q.get('tipo'))).slice(0, 1),
      desfecho: aba === 'historico' ? desfechoValido(q.get('desfecho')) : 'todos',
    },
  };
}

// ─── Persistência por usuário e aba ──────────────────────────────────

export const chaveFiltros = (userId: string, aba: Aba) => `orbit:inbox:${userId}:${aba}`;

/** Aceita só o que reconhece: valor antigo ou corrompido cai no padrão. */
export function normalizarFiltros(bruto: unknown, aba: Aba): FiltrosInbox {
  const padrao = filtrosPadrao(aba);
  if (!bruto || typeof bruto !== 'object') return padrao;
  const b = bruto as Record<string, unknown>;
  const textos = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    busca: '',
    periodo: lerPeriodo(typeof b.periodo === 'string' ? b.periodo : null, aba),
    empreendimentos: textos(b.empreendimentos),
    projetos: textos(b.projetos),
    tipos: tiposValidos(textos(b.tipos)).slice(0, 1),
    desfecho: aba === 'historico' ? desfechoValido(b.desfecho) : 'todos',
  };
}

export function lerFiltros(userId: string, aba: Aba): FiltrosInbox {
  try {
    const raw = localStorage.getItem(chaveFiltros(userId, aba));
    return raw ? normalizarFiltros(JSON.parse(raw), aba) : filtrosPadrao(aba);
  } catch {
    return filtrosPadrao(aba);
  }
}

/** A busca não é guardada: reabrir a tela com um texto antigo confunde. */
export function gravarFiltros(userId: string, aba: Aba, f: FiltrosInbox) {
  try {
    const { busca: _busca, periodo, ...resto } = f;
    localStorage.setItem(chaveFiltros(userId, aba), JSON.stringify({ ...resto, periodo: textoPeriodo(periodo) }));
  } catch { /* privado/bloqueado: vale só nesta sessão */ }
}

// ─── Layout da barra ─────────────────────────────────────────────────

/** Larguras naturais medidas no DOM, em px. */
export interface MedidasBarra {
  /** Toggle Pendentes/Histórico (nunca recolhe). */
  modo: number;
  periodo: number;
  /** Empreendimento, Projeto — recolhem do último para o primeiro. */
  escopo: number[];
  filtros: number;
  limpar: number;
}

export interface LayoutBarra {
  /** Quantos de Empreendimento/Projeto ficam na linha; o resto vai para "Filtros · n". */
  visiveis: number;
  /** Celular: o toggle ocupa a primeira linha e os filtros, a segunda. */
  modoEmLinhaPropria: boolean;
}

const GAP_BARRA = 8;
/** Divisor depois do toggle: 1 px com 12 px de cada lado. */
const DIVISOR_BARRA = 25;

/**
 * Arranjo pela largura disponível: recolhe Projeto, depois Empreendimento;
 * só então o toggle ganha linha própria.
 */
export function arranjoBarra(m: MedidasBarra, disponivel: number): LayoutBarra {
  const filtros = (n: number) => {
    const itens = [m.periodo, ...m.escopo.slice(0, n), m.limpar];
    if (n < m.escopo.length) itens.push(m.filtros);
    return itens.reduce((a, b) => a + b, 0) + GAP_BARRA * (itens.length - 1);
  };
  for (const prefixo of [m.modo + DIVISOR_BARRA, 0]) {
    for (let n = m.escopo.length; n >= 0; n--) {
      if (prefixo + filtros(n) <= disponivel) return { visiveis: n, modoEmLinhaPropria: prefixo === 0 };
    }
  }
  return { visiveis: 0, modoEmLinhaPropria: true };
}

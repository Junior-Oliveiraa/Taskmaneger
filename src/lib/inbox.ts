// Lógica pura da Caixa de entrada: título do item, deduplicação, agrupamento
// por período/tipo, filtros e desfecho. Sem React, para poder ser testada.
import type { AppNotification, SiengeStatus } from '../types';

export type CategoriaIcone =
  | 'aprovacao_pendente' | 'aprovado' | 'reprovado'
  | 'prazo' | 'prazo_atrasado' | 'lembrete' | 'mencao' | 'atribuicao' | 'status';

export type FiltroTipo = 'aprovacoes' | 'prazos' | 'mencoes' | 'atualizacoes';
/** Filtro de desfecho (só no Histórico). */
export type FiltroDesfecho = 'todos' | 'aprovados' | 'reprovados' | 'resolvidos';
export type Desfecho = 'pendente' | 'aprovado' | 'reprovado' | 'resolvido' | 'expirado';

export const FILTROS_TIPO: { valor: FiltroTipo; rotulo: string }[] = [
  { valor: 'aprovacoes', rotulo: 'Aprovações' },
  { valor: 'prazos', rotulo: 'Prazos' },
  { valor: 'mencoes', rotulo: 'Menções' },
  { valor: 'atualizacoes', rotulo: 'Atualizações' },
];

/**
 * ÚNICO lugar que define em qual chip cada tipo de notificação cai. O Record é
 * exaustivo: um tipo novo em AppNotification não compila sem entrar aqui.
 * Exceção tratada em filtroTipoDe: `review_requested` é aprovação ou revisão
 * conforme a mensagem.
 */
export const TIPO_PARA_CHIP: Record<AppNotification['type'], FiltroTipo> = {
  alcada_pending: 'aprovacoes',
  approval_pending: 'aprovacoes',
  review_requested: 'aprovacoes',
  approved: 'aprovacoes',
  rejected: 'aprovacoes',
  deadline: 'prazos',
  reminder: 'prazos',
  chat_mention: 'mencoes',
  status_changed: 'atualizacoes',
  properties_changed: 'atualizacoes',
  task_assigned: 'atualizacoes',
  assignee_replaced: 'atualizacoes',
  task_deleted: 'atualizacoes',
  feedback_received: 'atualizacoes',
  deadline_changed: 'atualizacoes',
  deadline_change_requested: 'atualizacoes',
  deadline_change_rejected: 'atualizacoes',
  predecessor_done: 'atualizacoes',
  predecessor_late: 'prazos',
};

export interface TarefaRef { title: string; projectId?: string }
export interface TituloRef { titulo: string; status: SiengeStatus }

export interface ContextoInbox {
  tarefas: Map<string, TarefaRef>;
  titulos: Map<string, TituloRef>;
}

export interface ItemInbox {
  /** Id da notificação mais recente (representante). */
  id: string;
  /** Todas as notificações colapsadas neste item (duplicatas incluídas). */
  ids: string[];
  n: AppNotification;
  repeticoes: number;
  titulo: string;
  descricao?: string;
  /** Identificador curto (nº do título, nome do criativo...) usado no resumo de grupo. */
  identificador?: string;
  /** Nome da tarefa para exibir como vínculo, quando não estiver já no título. */
  tarefaVinculo?: string;
  categoria: CategoriaIcone;
  filtroTipo: FiltroTipo;
  chaveGrupo: string;
  /** Nível da alçada (1..3) quando o item é um título Sienge aguardando aprovação. */
  nivelAlcada?: 1 | 2 | 3;
}

export const JANELA_DEDUP_MS = 10 * 60 * 1000;
export const MIN_ITENS_GRUPO = 3;

// ─── Texto ───────────────────────────────────────────────────────────

const EMOJI = /[\p{Extended_Pictographic}️]/gu;

function limpar(s: string): string {
  return s.replace(EMOJI, '').replace(/[!]+\s*$/, '').replace(/\s+/g, ' ').trim();
}

/** "Prazo Vencendo Hoje" → "Prazo vencendo hoje" (mantém siglas e nomes próprios curtos). */
function fraseCase(s: string): string {
  const palavras = s.split(' ');
  // Só mexe em frases "Title Case" (rótulos fixos); frases com nomes de pessoas
  // ("João Silva marcou você") têm palavras minúsculas e ficam como estão.
  const titleCase = palavras.filter(p => p.length > 2).every(p => /^[A-ZÀ-Ý(]/.test(p));
  if (!titleCase) return s;
  return palavras.map((p, i) => {
    if (i === 0) return p;
    if (/^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(p)) return p.toLowerCase();
    return p;
  }).join(' ');
}

function primeiroEntreAspas(s?: string): string | undefined {
  const m = s?.match(/"([^"]+)"/);
  return m?.[1]?.trim() || undefined;
}

function contem(texto: string | undefined, trecho: string | undefined): boolean {
  if (!texto || !trecho) return false;
  return normalizar(texto).includes(normalizar(trecho));
}

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Remove o nome da tarefa da frase base: `: T`, ` em "T"`, ` na tarefa "T"`, `"T"`. */
function semNomeTarefa(base: string, tarefa?: string): string {
  if (!tarefa) return base;
  const esc = tarefa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return base
    .replace(new RegExp(`\\s*:\\s*${esc}\\s*$`), '')
    .replace(new RegExp(`\\s+(em|de|na tarefa|da tarefa|do título)\\s+"${esc}"`), '')
    .replace(new RegExp(`"${esc}"`), '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Classificação ───────────────────────────────────────────────────

export function categoriaDe(n: AppNotification): CategoriaIcone {
  switch (n.type) {
    case 'alcada_pending':
    case 'approval_pending':
      return 'aprovacao_pendente';
    case 'review_requested':
      return 'aprovacao_pendente';
    case 'approved':
      return 'aprovado';
    case 'rejected':
    case 'feedback_received':
    case 'deadline_change_rejected':
      return 'reprovado';
    case 'deadline':
      return (n.targetId?.startsWith('-') || n.targetId === 'critico' || /atrasad|atraso/i.test(n.message)) ? 'prazo_atrasado' : 'prazo';
    case 'predecessor_late':
      return 'prazo_atrasado';
    case 'deadline_changed':
    case 'deadline_change_requested':
      return 'prazo';
    case 'reminder':
      return 'lembrete';
    case 'chat_mention':
      return 'mencao';
    case 'task_assigned':
    case 'assignee_replaced':
      return 'atribuicao';
    default:
      return 'status';
  }
}

export function filtroTipoDe(n: AppNotification): FiltroTipo {
  // "Aprovação de Copy/Criativo/Orçamento/…" pede aprovação; "Revisão Solicitada",
  // "Em Refação" e "Proposta Ajustada" são andamento da revisão.
  if (n.type === 'review_requested' && !/^aprova/i.test(n.message)) return 'atualizacoes';
  // Tipo desconhecido vindo do banco (ex.: versão mais nova do app) cai em Atualizações.
  return TIPO_PARA_CHIP[n.type] ?? 'atualizacoes';
}

/** Alerta de atraso crítico ('-15d' é o marco antigo, anterior a 'critico'). */
export function ehAtrasoCritico(n: AppNotification): boolean {
  return n.type === 'deadline' && (n.targetId === 'critico' || n.targetId === '-15d');
}

function nivelAlcadaDe(n: AppNotification): 1 | 2 | 3 | undefined {
  const t = Number(n.targetId);
  if (t === 1 || t === 2 || t === 3) return t;
  const m = n.message.match(/(\d)ª/);
  const v = m ? Number(m[1]) : NaN;
  return v === 1 || v === 2 || v === 3 ? v : undefined;
}

/** Monta título/descrição com o identificador no título (P1.1). */
export function descreverNotificacao(n: AppNotification, ctx: ContextoInbox): Omit<ItemInbox, 'id' | 'ids' | 'n' | 'repeticoes'> {
  const tarefa = n.taskId ? ctx.tarefas.get(n.taskId)?.title : undefined;
  const tituloSienge = n.siengeTitleId ? ctx.titulos.get(n.siengeTitleId) : undefined;
  const categoria = categoriaDe(n);
  const filtroTipo = filtroTipoDe(n);
  const details = n.details?.replace(/\s+/g, ' ').trim() || undefined;

  // Atraso crítico: "Tarefa com atraso crítico · [nome] · 11 dias"
  if (n.type === 'deadline' && n.targetId === 'critico') {
    const dias = details?.match(/\d+\s*dias?/)?.[0];
    return {
      titulo: ['Tarefa com atraso crítico', tarefa, dias].filter(Boolean).join(' · '),
      identificador: tarefa,
      categoria, filtroTipo,
      chaveGrupo: 'deadline:critico',
    };
  }

  // Alçada Sienge: "Título 292959 · 3ª alçada"
  if (n.type === 'alcada_pending') {
    const nivel = nivelAlcadaDe(n);
    const numero = tituloSienge?.titulo || primeiroEntreAspas(details) || '';
    const rotuloNivel = nivel ? `${nivel}ª alçada` : 'alçada';
    return {
      titulo: numero ? `Título ${numero} · ${rotuloNivel}` : `Título aguardando ${rotuloNivel}`,
      identificador: numero || undefined,
      categoria, filtroTipo,
      chaveGrupo: `alcada:${nivel ?? '?'}`,
      nivelAlcada: nivel,
    };
  }

  // Lembretes: o identificador é o item lembrado (subtarefa, título Sienge ou tarefa).
  if (n.type === 'reminder') {
    if (n.targetId === 'sienge_reminder') {
      const numero = tituloSienge?.titulo || primeiroEntreAspas(details);
      return { titulo: numero ? `Lembrete · Título ${numero}` : 'Lembrete de título', identificador: numero, categoria, filtroTipo, chaveGrupo: 'reminder:sienge' };
    }
    const sub = primeiroEntreAspas(details);
    if (sub && sub !== tarefa) {
      return { titulo: `Lembrete · ${sub}`, identificador: sub, tarefaVinculo: tarefa, categoria, filtroTipo, chaveGrupo: 'reminder' };
    }
    return { titulo: tarefa ? `Lembrete · ${tarefa}` : limpar(n.message), identificador: tarefa, categoria, filtroTipo, chaveGrupo: 'reminder' };
  }

  // Marcos de aprovação de criativo pendente: "Atrasado (1 dia): Aprovação Pendente"
  if (n.type === 'approval_pending') {
    const [marco] = n.message.split(':');
    const criativo = details?.match(/^(Criativo \d+)/)?.[1];
    const desc = [criativo, marco?.trim()].filter(Boolean).join(' · ');
    return {
      titulo: tarefa ? `Aprovação de criativo · ${tarefa}` : 'Aprovação de criativo pendente',
      descricao: desc || undefined,
      identificador: tarefa, categoria, filtroTipo,
      chaveGrupo: 'approval_pending',
    };
  }

  // Menção: "Fulano marcou você no chat da tarefa: T" → "Fulano marcou você no chat · T"
  let base = limpar(n.message);
  let identificador = tarefa;
  if (n.type === 'chat_mention' && !tarefa && n.siengeTitleId) {
    identificador = tituloSienge ? `Título ${tituloSienge.titulo}` : base.split(':').slice(1).join(':').trim() || undefined;
  }
  base = semNomeTarefa(base, tarefa);
  if (tituloSienge) base = semNomeTarefa(base, tituloSienge.titulo);
  base = base.replace(/ no chat d[ao] (tarefa|título)\s*:?.*$/i, ' no chat');

  // Sem tarefa conhecida: usa o trecho após ":" ou entre aspas como identificador.
  if (!identificador) {
    if (base.includes(':')) {
      const [a, ...resto] = base.split(':');
      base = a.trim();
      identificador = resto.join(':').trim() || undefined;
    } else {
      const aspas = primeiroEntreAspas(base) || primeiroEntreAspas(details);
      if (aspas) {
        identificador = aspas;
        base = base.replace(`"${aspas}"`, '').replace(/\s+(em|de|na tarefa|da tarefa)\s*$/, '').trim();
      }
    }
  }

  base = fraseCase(base);
  const titulo = identificador ? `${base} · ${identificador}` : base;

  // Descrição só se acrescentar algo além do título.
  const redundante =
    !details ||
    n.type === 'deadline' ||
    contem(details, tarefa) ||
    contem(details, identificador) ||
    normalizar(details) === normalizar(n.message);

  return {
    titulo,
    descricao: redundante ? undefined : details,
    identificador,
    categoria, filtroTipo,
    chaveGrupo: `${n.type}:${normalizar(base)}`,
  };
}

// ─── Deduplicação (P1.2) ─────────────────────────────────────────────

export function chaveDedup(n: AppNotification): string {
  const entidade = n.taskId || n.siengeTitleId || '';
  // Sem entidade não há como afirmar que é a mesma coisa: compara pela mensagem.
  return entidade ? `${n.type}|${entidade}` : `${n.type}|msg:${n.message}|${n.details ?? ''}`;
}

const ts = (s: string) => new Date(s).getTime();

/**
 * Colapsa notificações de mesmo tipo + entidade criadas a menos de 10 min uma da
 * outra (em cadeia). Mantém a mais recente como representante e conta repetições.
 * A entrada pode vir em qualquer ordem; a saída sai da mais recente para a mais antiga.
 */
export function deduplicar(lista: AppNotification[], janelaMs = JANELA_DEDUP_MS): { n: AppNotification; ids: string[] }[] {
  const ordenada = [...lista].sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
  const saida: { n: AppNotification; ids: string[]; ultimo: number }[] = [];
  const abertos = new Map<string, { n: AppNotification; ids: string[]; ultimo: number }>();
  for (const n of ordenada) {
    const chave = chaveDedup(n);
    const t = ts(n.createdAt);
    const aberto = abertos.get(chave);
    if (aberto && aberto.ultimo - t < janelaMs) {
      aberto.ids.push(n.id);
      aberto.ultimo = t;
      continue;
    }
    const novo = { n, ids: [n.id], ultimo: t };
    abertos.set(chave, novo);
    saida.push(novo);
  }
  return saida.map(({ n, ids }) => ({ n, ids }));
}

export function montarItens(lista: AppNotification[], ctx: ContextoInbox): ItemInbox[] {
  return deduplicar(lista).map(({ n, ids }) => ({
    id: n.id,
    ids,
    n,
    repeticoes: ids.length,
    ...descreverNotificacao(n, ctx),
  }));
}

// ─── Períodos (P1.4) ─────────────────────────────────────────────────

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Segunda-feira 00:00 da semana de `d`. */
function inicioDaSemana(d: Date): number {
  const dia = (d.getDay() + 6) % 7; // seg=0 … dom=6
  return inicioDoDia(d) - dia * 86_400_000;
}

export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function periodoDe(data: Date, agora: Date): { chave: string; rotulo: string } {
  const t = data.getTime();
  const hoje = inicioDoDia(agora);
  if (t >= hoje) return { chave: 'hoje', rotulo: 'Hoje' };
  if (t >= hoje - 86_400_000) return { chave: 'ontem', rotulo: 'Ontem' };
  const semana = inicioDaSemana(agora);
  if (t >= semana) return { chave: 'semana', rotulo: 'Esta semana' };
  if (t >= semana - 7 * 86_400_000) return { chave: 'semana_passada', rotulo: 'Semana passada' };
  return { chave: `${data.getFullYear()}-${data.getMonth()}`, rotulo: `${MESES[data.getMonth()]} ${data.getFullYear()}` };
}

// ─── Linhas: cabeçalhos + itens + grupos (P1.3) ──────────────────────

export type Linha =
  | { tipo: 'cabecalho'; chave: string; rotulo: string }
  | { tipo: 'item'; chave: string; item: ItemInbox }
  | { tipo: 'grupo'; chave: string; rotulo: string; itens: ItemInbox[] };

/** Rótulo de resumo do grupo: "12 títulos aguardando 3ª alçada". */
export function rotuloGrupo(itens: ItemInbox[]): string {
  const qtd = itens.length;
  const primeiro = itens[0];
  if (primeiro.n.type === 'alcada_pending') {
    return `${qtd} títulos aguardando ${primeiro.nivelAlcada ? `${primeiro.nivelAlcada}ª ` : ''}alçada`;
  }
  if (primeiro.n.type === 'approval_pending') return `${qtd} criativos aguardando aprovação`;
  if (primeiro.n.type === 'reminder') return `${qtd} lembretes`;
  const base = primeiro.titulo.split(' · ')[0];
  return `${qtd}× ${base}`;
}

/**
 * Itens já ordenados do mais recente para o mais antigo → linhas com cabeçalho
 * por período e grupos de ≥3 itens do mesmo tipo dentro do mesmo dia. O grupo
 * ocupa a posição do seu membro mais recente.
 */
export function montarLinhas(itens: ItemInbox[], agora: Date, agrupar = true): Linha[] {
  const porDiaTipo = new Map<string, ItemInbox[]>();
  if (agrupar) {
    for (const it of itens) {
      const k = `${chaveDia(new Date(it.n.createdAt))}|${it.chaveGrupo}`;
      const arr = porDiaTipo.get(k);
      if (arr) arr.push(it); else porDiaTipo.set(k, [it]);
    }
  }

  const linhas: Linha[] = [];
  const emitidos = new Set<string>();
  let periodoAtual = '';
  for (const it of itens) {
    const data = new Date(it.n.createdAt);
    const p = periodoDe(data, agora);
    if (p.chave !== periodoAtual) {
      periodoAtual = p.chave;
      linhas.push({ tipo: 'cabecalho', chave: `h:${p.chave}`, rotulo: p.rotulo });
    }
    const k = `${chaveDia(data)}|${it.chaveGrupo}`;
    const membros = porDiaTipo.get(k);
    if (membros && membros.length >= MIN_ITENS_GRUPO) {
      if (emitidos.has(k)) continue;
      emitidos.add(k);
      linhas.push({ tipo: 'grupo', chave: `g:${k}`, rotulo: rotuloGrupo(membros), itens: membros });
    } else {
      linhas.push({ tipo: 'item', chave: it.id, item: it });
    }
  }
  return linhas;
}

/**
 * Aba Pendentes: atraso crítico é estado contínuo, não evento do dia, então sai
 * dos grupos por data e vai para "Requer atenção", sempre no topo.
 */
export function montarLinhasPendentes(itens: ItemInbox[], agora: Date): Linha[] {
  const criticos = itens.filter(i => ehAtrasoCritico(i.n));
  if (criticos.length === 0) return montarLinhas(itens, agora);
  const secao: Linha[] = [{ tipo: 'cabecalho', chave: CHAVE_ATENCAO, rotulo: 'Requer atenção' }];
  if (criticos.length >= MIN_ITENS_GRUPO) {
    secao.push({ tipo: 'grupo', chave: 'g:atencao', rotulo: `${criticos.length}× Tarefa com atraso crítico`, itens: criticos });
  } else {
    criticos.forEach(item => secao.push({ tipo: 'item', chave: item.id, item }));
  }
  return [...secao, ...montarLinhas(itens.filter(i => !ehAtrasoCritico(i.n)), agora)];
}

export const CHAVE_ATENCAO = 'h:atencao';

// ─── Desfecho (P1.6) e filtros ───────────────────────────────────────

const ORDEM_SIENGE: SiengeStatus[] = ['a_lancar', 'aprovacao_1', 'aprovacao_2', 'aprovacao_3', 'aguardando_pagamento', 'pago'];

export function desfechoDe(item: ItemInbox, arquivado: boolean, ctx: ContextoInbox): Desfecho {
  const n = item.n;
  if (n.type === 'approved') return 'aprovado';
  if (n.type === 'rejected') return 'reprovado';
  if (n.type === 'alcada_pending' && item.nivelAlcada) {
    const t = n.siengeTitleId ? ctx.titulos.get(n.siengeTitleId) : undefined;
    if (!t) return arquivado ? 'expirado' : 'pendente';
    if (t.status === 'recusados') return 'reprovado';
    const idx = ORDEM_SIENGE.indexOf(t.status);
    if (idx > item.nivelAlcada) return 'aprovado';
    if (idx === item.nivelAlcada) return 'pendente';
    return 'reprovado'; // voltou para "A lançar" = recusado numa alçada
  }
  return arquivado ? 'resolvido' : 'pendente';
}

export function passaDesfecho(d: Desfecho, f: FiltroDesfecho): boolean {
  if (f === 'todos') return true;
  if (f === 'aprovados') return d === 'aprovado';
  if (f === 'reprovados') return d === 'reprovado';
  return d === 'resolvido';
}

export function casaBusca(item: ItemInbox, termo: string, tarefa?: string, empreendimento?: string): boolean {
  const q = normalizar(termo.trim());
  if (!q) return true;
  return [item.titulo, item.descricao, item.identificador, tarefa, empreendimento, item.n.message, item.n.details]
    .some(s => s && normalizar(s).includes(q));
}

// ─── Tempo ───────────────────────────────────────────────────────────

export function formatarDuracao(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const dias = Math.floor(hrs / 24);
  return `${dias}d ${hrs % 24}h`;
}

/** Tempo entre a notificação chegar e ser arquivada (o que a pílula de relógio mede). */
export function tempoDeResolucao(n: AppNotification): number | null {
  if (!n.viewedAt || !n.createdAt) return null;
  const d = ts(n.viewedAt) - ts(n.createdAt);
  return d >= 0 ? d : null;
}

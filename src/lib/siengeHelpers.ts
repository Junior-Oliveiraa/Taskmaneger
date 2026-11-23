import { SiengeStatus } from '../types';

export function siengeDaysOverdue(vencimento?: string): number {
  if (!vencimento) return 0;
  const start = new Date(vencimento + 'T00:00:00').getTime();
  const today = new Date(new Date().toDateString()).getTime();
  const diff = Math.floor((today - start) / 86400000);
  return diff > 0 ? diff : 0;
}

// Captures the due date the first time a title enters 'aguardando_pagamento',
// so later rejections/resolutions that push the deadline forward don't reset
// how many days the title has truly been overdue.
export function withVencimentoOriginal<T extends { status: SiengeStatus; vencimento?: string; vencimentoOriginal?: string }>(title: T): T {
  if (title.status === 'aguardando_pagamento' && !title.vencimentoOriginal && title.vencimento) {
    return { ...title, vencimentoOriginal: title.vencimento };
  }
  return title;
}

// Reject flow only lands in 'recusados' when a title has already cleared every
// alçada (i.e. it was rejected from 'aguardando_pagamento'). Rejections during
// an alçada step send the title back to 'a_lancar' instead.
export function rejectTargetStatus(currentStatus: SiengeStatus): SiengeStatus {
  return currentStatus === 'aguardando_pagamento' ? 'recusados' : 'a_lancar';
}

// Positive-action button shown per status: what it's labeled and which status it moves to next.
export function getPositiveAction(status: SiengeStatus): { label: string; nextStatus: SiengeStatus } | null {
  switch (status) {
    case 'a_lancar': return { label: 'Lançado', nextStatus: 'aprovacao_1' };
    case 'aprovacao_1': return { label: 'Aprovado', nextStatus: 'aprovacao_2' };
    case 'aprovacao_2': return { label: 'Aprovado', nextStatus: 'aprovacao_3' };
    case 'aprovacao_3': return { label: 'Aprovado', nextStatus: 'aguardando_pagamento' };
    case 'aguardando_pagamento': return { label: 'Marcar como Pago', nextStatus: 'pago' };
    default: return null;
  }
}

export function showsRejectAction(status: SiengeStatus): boolean {
  return status === 'aprovacao_1' || status === 'aprovacao_2' || status === 'aprovacao_3' || status === 'aguardando_pagamento';
}

// Maps the status a title is entering to the alçada level whose responsible
// user should be notified (the approver waiting on the title now).
export const ALCADA_LEVEL_BY_STATUS: Partial<Record<SiengeStatus, { level: 1 | 2 | 3; label: string }>> = {
  aprovacao_1: { level: 1, label: '1ª' },
  aprovacao_2: { level: 2, label: '2ª' },
  aprovacao_3: { level: 3, label: '3ª' },
};

// ─── Ações de alçada compartilhadas (card do Kanban e Caixa de entrada) ───

/** Título após a ação positiva ("Aprovado") do status atual, ou null se não houver. */
export function aprovarTitulo<T extends { status: SiengeStatus; vencimento?: string; vencimentoOriginal?: string }>(title: T): T | null {
  const acao = getPositiveAction(title.status);
  if (!acao) return null;
  return withVencimentoOriginal({ ...title, status: acao.nextStatus });
}

/** Título após recusa com motivo (mesma regra do card do Kanban). */
export function reprovarTitulo<T extends { status: SiengeStatus }>(title: T, motivo: string): T {
  return {
    ...title,
    status: rejectTargetStatus(title.status),
    motivoRecusa: motivo.trim(),
    motivoRecusaRegistradoEm: new Date().toISOString(),
    motivoRecusaResolvido: false,
    motivoRecusaResolvidoEm: undefined,
    motivoRecusaObservacao: undefined,
  };
}

/**
 * Notificação para o responsável da alçada em que o título acabou de entrar, ou
 * null se o status não mudou / não é alçada / não há responsável configurado.
 */
export function notificacaoAlcada(
  title: { id: string; status: SiengeStatus; titulo?: string; descricao?: string },
  previousStatus: SiengeStatus | undefined,
  config: { alcada1UserId?: string; alcada2UserId?: string; alcada3UserId?: string },
  actorId: string,
) {
  if (!previousStatus || previousStatus === title.status) return null;
  const entry = ALCADA_LEVEL_BY_STATUS[title.status];
  if (!entry) return null;
  const responsibleId = alcadaResponsibleId(config, entry.level);
  if (!responsibleId) return null;
  return {
    userId: responsibleId,
    actorId,
    siengeTitleId: title.id,
    targetId: String(entry.level),
    type: 'alcada_pending' as const,
    message: `Título aguardando ${entry.label} alçada`,
    details: `O título "${title.titulo || title.descricao || ''}" está aguardando sua aprovação.`,
  };
}

// Pedido para abrir um título específico na tela do Sienge (vindo da Caixa de
// entrada). Fica guardado até o Kanban montar e consumir.
let tituloParaAbrir: string | null = null;
export const EVENTO_ABRIR_TITULO = 'orbit:abrir-titulo-sienge';
export function solicitarAberturaTitulo(id: string) {
  tituloParaAbrir = id;
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_TITULO));
}
export function consumirAberturaTitulo(): string | null {
  const id = tituloParaAbrir;
  tituloParaAbrir = null;
  return id;
}

export function alcadaResponsibleId(config: { alcada1UserId?: string; alcada2UserId?: string; alcada3UserId?: string }, level: 1 | 2 | 3): string | undefined {
  if (level === 1) return config.alcada1UserId;
  if (level === 2) return config.alcada2UserId;
  return config.alcada3UserId;
}

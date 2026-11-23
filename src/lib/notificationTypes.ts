import { AppNotification } from '../types';
import { OVERDUE_CRITICAL_DAYS } from './prazo';

export type NotificationType = AppNotification['type'];

export interface NotificationTypeGroup {
  label: string;
  types: { type: NotificationType; label: string }[];
}

// The 6 milestones fired for type: 'deadline' (see App.tsx checkReminders).
// Stored as notif.targetId so each milestone can be toggled independently.
// 'critico' substituiu o antigo '-15d': dispara acima de OVERDUE_CRITICAL_DAYS
// e se repete no máximo 1×/semana (ver lib/prazo.ts).
export const DEADLINE_MILESTONES: { key: string; label: string }[] = [
  { key: '3d', label: 'Prazo em 3 dias' },
  { key: '1d', label: 'Prazo amanhã' },
  { key: '0d', label: 'Prazo vencendo hoje' },
  { key: '-3d', label: 'Atrasado (3 dias)' },
  { key: '-7d', label: 'Atrasado (7 dias)' },
  { key: 'critico', label: `Atraso crítico (+${OVERDUE_CRITICAL_DAYS} dias, semanal)` },
];

export const NOTIFICATION_GROUPS: NotificationTypeGroup[] = [
  {
    label: 'Tarefas',
    types: [
      { type: 'task_assigned', label: 'Tarefa atribuída a mim' },
      { type: 'task_deleted', label: 'Tarefa excluída' },
      { type: 'status_changed', label: 'Mudança de status' },
      { type: 'assignee_replaced', label: 'Troca de responsável' },
      { type: 'properties_changed', label: 'Alteração de propriedades' },
      { type: 'deadline_changed', label: 'Alteração de prazo' },
      { type: 'deadline_change_requested', label: 'Solicitação de alteração de prazo' },
      { type: 'deadline_change_rejected', label: 'Alteração de prazo recusada' },
      { type: 'predecessor_done', label: 'Antecessor concluído: posso seguir' },
      { type: 'predecessor_late', label: 'Antecessor atrasado' },
    ],
  },
  {
    label: 'Aprovações e Revisões',
    types: [
      { type: 'review_requested', label: 'Solicitação de revisão' },
      { type: 'approval_pending', label: 'Aprovação pendente' },
      { type: 'approved', label: 'Aprovado' },
      { type: 'rejected', label: 'Reprovado' },
      { type: 'feedback_received', label: 'Feedback recebido' },
    ],
  },
  {
    label: 'Lembretes',
    types: [
      { type: 'reminder', label: 'Lembretes' },
    ],
  },
  {
    label: 'Chat',
    types: [
      { type: 'chat_mention', label: 'Menções no chat' },
    ],
  },
  {
    label: 'Alçadas Sienge',
    types: [
      { type: 'alcada_pending', label: 'Título aguardando minha aprovação' },
    ],
  },
];

// A notification type is enabled unless the user has explicitly turned it off.
// For type 'deadline', pass the notification's targetId as `milestone` to check
// the specific milestone toggle (see DEADLINE_MILESTONES); an object is stored
// at preferences.notifications.deadline mapping milestone key -> boolean.
export function isNotificationTypeEnabled(preferences: any, type: NotificationType, milestone?: string): boolean {
  const prefs = preferences?.notifications;
  if (!prefs) return true;

  if (type === 'deadline') {
    const deadlinePrefs = prefs.deadline;
    if (deadlinePrefs === undefined) return true;
    if (typeof deadlinePrefs === 'boolean') return deadlinePrefs; // legacy flat toggle
    // Quem desligou o antigo aviso de 15 dias continua sem o que o substituiu.
    if (milestone === 'critico' && deadlinePrefs.critico === undefined) return deadlinePrefs['-15d'] ?? true;
    if (!milestone || deadlinePrefs[milestone] === undefined) return true;
    return !!deadlinePrefs[milestone];
  }

  if (prefs[type] === undefined) return true;
  return !!prefs[type];
}

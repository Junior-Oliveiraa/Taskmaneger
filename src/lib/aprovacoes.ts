// Aprovação de publicação (Social Media): usada dentro da tarefa
// (SocialMediaApproval) e no hover da Lista, para as duas fazerem exatamente
// a mesma coisa.
import type { AppNotification, Task } from '../types';

type Notificar = (n: Omit<AppNotification, 'id' | 'createdAt' | 'status'>) => unknown;
type Salvar = (updates: Partial<Task>) => void;

/** O usuário é quem deve aprovar esta publicação agora? */
export function podeAprovarPublicacao(task: Task, userId?: string): boolean {
  const a = task.socialMediaApproval;
  return !!userId && a?.status === 'review_requested' && a.approverId === userId;
}

export function aprovarPublicacao(task: Task, userId: string, salvar: Salvar, notificar: Notificar) {
  const dados = task.socialMediaApproval || {};
  salvar({ status: 'done', socialMediaApproval: { ...dados, status: 'approved' } });
  if (dados.requesterId) {
    notificar({
      userId: dados.requesterId,
      taskId: task.id,
      targetId: 'socialMediaProps',
      type: 'approved',
      actorId: userId,
      message: 'Publicação Aprovada',
      details: `Sua publicação de "${task.title}" foi aprovada e a tarefa foi concluída.`,
    });
  }
}

export function reprovarPublicacao(task: Task, userId: string, salvar: Salvar, notificar: Notificar) {
  const dados = task.socialMediaApproval || {};
  salvar({ socialMediaApproval: { ...dados, status: 'rejected' } });
  if (dados.requesterId) {
    notificar({
      userId: dados.requesterId,
      taskId: task.id,
      targetId: 'socialMediaProps',
      type: 'rejected',
      actorId: userId,
      message: 'Publicação Reprovada',
      details: `Sua publicação de "${task.title}" foi reprovada e precisa de ajustes.`,
    });
  }
}

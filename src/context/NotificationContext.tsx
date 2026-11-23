import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppNotification } from '../types';
import { useAuth } from './AuthContext';
import { fetchNotifications, saveNotification, deleteArchivedNotifications } from '../lib/api';
import { isNotificationTypeEnabled } from '../lib/notificationTypes';

interface NotificationContextType {
  notifications: AppNotification[];
  /** Primeira carga ainda em andamento (lista vazia não quer dizer "sem notificações"). */
  carregando: boolean;
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'status'>) => void;
  markAsRead: (id: string) => void;
  markAsViewed: (id: string) => void;
  markAllAsViewed: () => void;
  /** Arquiva várias de uma vez (itens colapsados/agrupados e seleção em lote). */
  markManyAsViewed: (ids: string[]) => void;
  /** Desfaz o arquivamento de várias de uma vez. */
  unarchiveMany: (ids: string[]) => void;
  unarchive: (id: string) => void;
  postpone: (id: string) => void;
  markAsImportant: (id: string) => void;
  clearAll: () => void;
  clearArchived: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

import { supabase } from '../lib/supabase';
import { patchTask } from '../lib/api';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, allUsers } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (currentUser) {
      loadNotifications(currentUser.id);
      
      const channel = supabase
        .channel('notifications-db-changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'notifications', 
          filter: `user_id=eq.${currentUser.id}` 
        }, () => {
          loadNotifications(currentUser.id);
        })
        .subscribe((status, err) => {
          // Sem isso, uma queda de WebSocket aqui deixava notificações de outros
          // usuários (menções, aprovações, prazos) presas até o próximo F5, sem
          // nenhum sinal no console de que a inscrição falhou.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`[Realtime] notifications-db-changes: ${status}`, err ?? '');
          }
        });

      // Rede de segurança: notificações usam estado próprio (sem React Query), então
      // uma falha silenciosa do canal acima não tinha nenhum fallback — o polling
      // garante que elas cheguem mesmo se o Realtime cair. Só roda com a aba visível.
      const pollInterval = setInterval(() => {
        if (!document.hidden) loadNotifications(currentUser.id);
      }, 45_000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
      };
    } else {
      setNotifications([]);
    }
  // Depend only on the user ID — not the full object — so that updateProfile()
  // (which creates a new currentUser reference) does not destroy and recreate
  // the Realtime channel on every preferences save.
  }, [currentUser?.id]);

  const loadNotifications = async (userId: string) => {
    try {
      const data = await fetchNotifications(userId);
      setNotifications(data);
    } catch (e) {
      console.error("Erro ao buscar notificações", e);
    } finally {
      setCarregando(false);
    }
  };

  const syncUpdate = async (notif: AppNotification) => {
    // Optimistic UI update
    setNotifications(prev => prev.map(n => n.id === notif.id ? notif : n));
    try {
      await saveNotification(notif);
    } catch (e) {
      console.error("Erro ao salvar notificação", e);
    }
  };

  const addNotification = async (notif: Omit<AppNotification, 'id' | 'createdAt' | 'status'>) => {
    if (!notif.userId) return;

    // Respect the recipient's notification preferences, if known locally.
    const recipient = notif.userId === currentUser?.id ? currentUser : allUsers.find(u => u.id === notif.userId);
    if (recipient && !isNotificationTypeEnabled(recipient.preferences, notif.type, notif.targetId)) return;

    // We only perform duplicate check against currently loaded notifications (if target is me)
    // If target is someone else, it's harder to check duplicates efficiently without fetching,
    // but we can just insert it. Let's insert directly.
    const isDuplicate = notifications.some(n => {
      if (n.userId !== notif.userId) return false;
      if (n.taskId !== notif.taskId || n.siengeTitleId !== notif.siengeTitleId || n.type !== notif.type) return false;
      
      if (notif.type === 'deadline') {
        return n.message === notif.message && (new Date().getTime() - new Date(n.createdAt).getTime() < 1000 * 60 * 60 * 24);
      }
      
      if (notif.type === 'reminder') {
        return n.message === notif.message && (new Date().getTime() - new Date(n.createdAt).getTime() < 1000 * 60 * 60);
      }

      return n.actorId === notif.actorId && 
             n.message === notif.message &&
             (new Date().getTime() - new Date(n.createdAt).getTime() < 5000);
    });
    
    if (isDuplicate) return;

    const newNotif: AppNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'unread',
      createdAt: new Date().toISOString()
    };
    
    if (currentUser?.id === notif.userId) {
      setNotifications(prev => [newNotif, ...prev]);
    }

    try {
      await saveNotification(newNotif);
    } catch (e) {
      console.error("Erro ao adicionar notificação", e);
    }
  };

  // Arquivar um lembrete também marca o lembrete de origem como visto.
  const marcarLembreteVisto = (notif: AppNotification) => {
    if (notif.targetId === 'sienge_reminder') {
      supabase.from('sienge_titles').update({ reminder_type: 'seen' }).eq('id', notif.siengeTitleId).then(({ error }) => {
        if (error) console.error(error);
      });
    } else if (notif.targetId === 'reminder' || notif.targetId === notif.taskId) {
      patchTask(notif.taskId!, { reminderType: 'seen' as any, updatedBy: currentUser?.id }).catch(console.error);
    } else if (notif.targetId && notif.targetId !== 'deadline') {
      // Lembrete de subtarefa
      supabase.from('subtasks').update({ reminder_type: 'seen' }).eq('id', notif.targetId).then(({ error }) => {
        if (error) console.error(error);
      });
    }
  };

  const markAsRead = (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (notif && notif.status === 'unread') {
      syncUpdate({ ...notif, status: 'read' });
    }
  };

  const markAsViewed = (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      syncUpdate({ ...notif, status: 'viewed', viewedAt: new Date().toISOString() });
      if (notif.type === 'reminder') {
        if (notif.targetId === 'sienge_reminder') {
          supabase.from('sienge_titles').update({ reminder_type: 'seen' }).eq('id', notif.siengeTitleId).then(({ error }) => {
            if (error) console.error(error);
          });
        } else if (notif.targetId === 'reminder' || notif.targetId === notif.taskId) {
          patchTask(notif.taskId!, { reminderType: 'seen' as any, updatedBy: currentUser?.id }).catch(console.error);
        } else if (notif.targetId && notif.targetId !== 'deadline') {
          // It's a subtask reminder
          supabase.from('subtasks').update({ reminder_type: 'seen' }).eq('id', notif.targetId).then(({ error }) => {
            if (error) console.error(error);
          });
        }
      }
    }
  };

  const markAllAsViewed = async () => {
    if (!currentUser) return;
    const activeNotifs = notifications.filter(n => n.status !== 'viewed');
    if (activeNotifs.length === 0) return;
    
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.status !== 'viewed' ? { ...n, status: 'viewed', viewedAt: now } : n));
    
    activeNotifs.forEach(notif => {
      if (notif.type === 'reminder') {
        if (notif.targetId === 'sienge_reminder') {
          supabase.from('sienge_titles').update({ reminder_type: 'seen' }).eq('id', notif.siengeTitleId).then(({ error }) => {
            if (error) console.error(error);
          });
        } else if (notif.targetId === 'reminder' || notif.targetId === notif.taskId) {
          patchTask(notif.taskId!, { reminderType: 'seen' as any, updatedBy: currentUser.id }).catch(console.error);
        } else if (notif.targetId && notif.targetId !== 'deadline') {
          supabase.from('subtasks').update({ reminder_type: 'seen' }).eq('id', notif.targetId).then(({ error }) => {
            if (error) console.error(error);
          });
        }
      }
    });

    try {
      await Promise.all(activeNotifs.map(n => saveNotification({ ...n, status: 'viewed', viewedAt: now })));
    } catch (e) {
      console.error("Erro ao marcar todas como vista", e);
    }
  };

  const markManyAsViewed = (ids: string[]) => {
    const alvo = new Set(ids);
    const afetadas = notifications.filter(n => alvo.has(n.id) && n.status !== 'viewed');
    if (afetadas.length === 0) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => alvo.has(n.id) && n.status !== 'viewed' ? { ...n, status: 'viewed', viewedAt: now } : n));
    afetadas.forEach(n => {
      if (n.type === 'reminder') marcarLembreteVisto(n);
      saveNotification({ ...n, status: 'viewed', viewedAt: now }).catch(e => console.error('Erro ao arquivar notificação', e));
    });
  };

  const unarchiveMany = (ids: string[]) => {
    const alvo = new Set(ids);
    const afetadas = notifications.filter(n => alvo.has(n.id) && n.status === 'viewed');
    if (afetadas.length === 0) return;
    const restauradas = new Map(afetadas.map(n => {
      const { viewedAt, ...rest } = n;
      return [n.id, { ...rest, status: 'read' as const }];
    }));
    setNotifications(prev => prev.map(n => restauradas.get(n.id) ?? n));
    restauradas.forEach(n => saveNotification(n).catch(e => console.error('Erro ao restaurar notificação', e)));
  };

  const unarchive = (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (notif && notif.status === 'viewed') {
      const { viewedAt, ...rest } = notif;
      syncUpdate({ ...rest, status: 'read' });
    }
  };

  const postpone = (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const postponedTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      syncUpdate({ ...notif, status: 'postponed', postponedUntil: postponedTime, createdAt: postponedTime });
    }
  };

  const markAsImportant = (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      syncUpdate({ ...notif, status: notif.status === 'important' ? 'unread' : 'important' });
    }
  };

  const clearAll = () => {
    // We won't implement a DB wipe for clearAll to be safe, only clearArchived
    setNotifications([]);
  };
  
  const clearArchived = async () => {
    if (!currentUser) return;
    setNotifications(prev => prev.filter(n => n.status !== 'viewed'));
    try {
      await deleteArchivedNotifications(currentUser.id);
    } catch (e) {
      console.error("Erro ao deletar arquivadas", e);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, carregando, addNotification, markAsRead, markAsViewed, markAllAsViewed, markManyAsViewed, unarchiveMany, unarchive, postpone, markAsImportant, clearAll, clearArchived }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

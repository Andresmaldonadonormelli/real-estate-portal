'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { notificationLoadError, reconcileNotifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/lib/types';

type NotificationInbox = {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationInboxContext = createContext<NotificationInbox | null>(null);

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    setLoading(true);
    try {
      do {
        refreshAgain.current = false;
        const rows = await reconcileNotifications(user.id);
        setItems(rows);
        setError('');
      } while (refreshAgain.current);
    } catch (cause) {
      console.error('Notification inbox reconciliation failed.', cause);
      setError(notificationLoadError(cause));
    } finally {
      refreshing.current = false;
      setLoading(false);
      if (refreshAgain.current) {
        refreshAgain.current = false;
        void refresh();
      }
    }
  }, [user.id]);

  useEffect(() => {
    let timer = 0;
    let active = true;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (active) void refresh(); }, 300);
    };
    schedule();
    window.addEventListener('focus', schedule);
    window.addEventListener('portal:data-changed', schedule);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('focus', schedule);
      window.removeEventListener('portal:data-changed', schedule);
    };
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    let shouldWrite = false;
    const readAt = new Date().toISOString();
    setItems(rows => rows.map(row => {
      if (row.id !== id || row.read_at) return row;
      shouldWrite = true;
      return { ...row, read_at: readAt };
    }));
    if (!shouldWrite) return;
    const result = await supabase.from('notifications').update({ read_at: readAt }).eq('id', id).eq('user_id', user.id).is('read_at', null);
    if (result.error) void refresh();
  }, [refresh, user.id]);

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    const ids: string[] = [];
    setItems(rows => rows.map(row => {
      if (row.read_at) return row;
      ids.push(row.id);
      return { ...row, read_at: readAt };
    }));
    if (!ids.length) return;
    const result = await supabase.from('notifications').update({ read_at: readAt }).in('id', ids).eq('user_id', user.id).is('read_at', null);
    if (result.error) void refresh();
  }, [refresh, user.id]);

  const unreadCount = items.filter(row => !row.read_at).length;
  const value = { items, unreadCount, loading, error, markRead, markAllRead, refresh };
  return <NotificationInboxContext.Provider value={value}>{children}</NotificationInboxContext.Provider>;
}

export function useNotificationInbox() {
  const inbox = useContext(NotificationInboxContext);
  if (!inbox) throw new Error('Notification inbox is missing.');
  return inbox;
}

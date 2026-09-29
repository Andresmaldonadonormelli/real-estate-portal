'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export const SAMPLE_NOTIFICATIONS = [
  { id: 'transfer', group: 'transaction' as const, title: 'Bank transfer received', detail: '15334 Triskett', amount: '+$2,377', tone: 'positive' as const, time: '2h ago', match: 'payout' as const },
  { id: 'review', group: 'transaction' as const, title: 'Transaction needs review', detail: '3765 W134th · Uncategorized', amount: '', tone: '' as const, time: '3h ago', match: 'review' as const },
  { id: 'expense', group: 'transaction' as const, title: 'Large expense posted', detail: 'Harbor Plumbing', amount: '-$280', tone: 'negative' as const, time: '6h ago', match: 'expense' as const },
  { id: 'rent', group: 'property' as const, title: 'Rent still outstanding', detail: 'W134', amount: '$1,200 remaining', tone: 'negative' as const, time: '1d ago', destination: 'overview' as const },
  { id: 'lease', group: 'property' as const, title: 'Lease ends in 30 days', detail: '214 Maple · Unit 1', amount: '', tone: '' as const, time: '2d ago', destination: 'units' as const },
  { id: 'vacant', group: 'property' as const, title: 'Unit vacant for 14 days', detail: '4365 W · Unit 1', amount: '', tone: '' as const, time: '4d ago', destination: 'units' as const },
  { id: 'turnover', group: 'property' as const, title: 'Upcoming turnover', detail: '3765 W134th · Unit 2', amount: '', tone: '' as const, time: '5d ago', destination: 'overview' as const },
  { id: 'maintenance', group: 'property' as const, title: 'Maintenance reminder', detail: '15334 Triskett · Unit 1', amount: '', tone: '' as const, time: '1d ago', destination: 'overview' as const },
];

export type DashboardNotification = (typeof SAMPLE_NOTIFICATIONS)[number];

type NotificationInbox = {
  items: readonly DashboardNotification[];
  unread: string[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

const NotificationInboxContext = createContext<NotificationInbox | null>(null);

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState<string[]>(() => SAMPLE_NOTIFICATIONS.map((item) => item.id));
  const value = useMemo<NotificationInbox>(() => ({
    items: SAMPLE_NOTIFICATIONS,
    unread,
    unreadCount: unread.length,
    markRead: (id) => setUnread((ids) => ids.filter((item) => item !== id)),
    markAllRead: () => setUnread([]),
  }), [unread]);

  return <NotificationInboxContext.Provider value={value}>{children}</NotificationInboxContext.Provider>;
}

export function useNotificationInbox() {
  const inbox = useContext(NotificationInboxContext);
  if (!inbox) throw new Error('Notification inbox is missing.');
  return inbox;
}

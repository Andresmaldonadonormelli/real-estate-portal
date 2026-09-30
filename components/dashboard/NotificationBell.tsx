'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';

export default function NotificationBell() {
  const { unreadCount } = useNotificationInbox();
  const label = unreadCount ? `Alerts, ${unreadCount} unread` : 'Alerts';
  return <Link href="/notifications" className="dashboard-bell" aria-label={label}>
    <Bell size={18} />
    {unreadCount > 0 && <span className="dashboard-bell-count">{unreadCount}</span>}
  </Link>;
}

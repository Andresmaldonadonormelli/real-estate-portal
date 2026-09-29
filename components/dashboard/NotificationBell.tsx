'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Bell, X } from 'lucide-react';
import { NotificationFeed } from '@/components/dashboard/NotificationFeed';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';
import type { FeedNotification } from '@/lib/notifications';

const SLIDE_MS = 280;

export default function NotificationBell({ onOpenTransaction, onOpenProperty, hold = false }: {
  onOpenTransaction?: (item: FeedNotification) => void;
  onOpenProperty?: (item: FeedNotification) => void;
  hold?: boolean;
}) {
  const { unreadCount } = useNotificationInbox();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!present || hold) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [present, hold]);

  useEffect(() => {
    if (open || !present) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setPresent(false), reduce ? 0 : SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open, present]);

  function show() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPresent(true);
    if (reduce) {
      setOpen(true);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true));
    });
  }

  function openItem(item: FeedNotification) {
    if (item.group === 'transaction') {
      onOpenTransaction?.(item);
      return;
    }
    setOpen(false);
    onOpenProperty?.(item);
  }

  const drawer = present ? (
    <div className="dashboard-drawer-root" data-open={open ? 'true' : 'false'}>
      <button type="button" className="dashboard-drawer-scrim" aria-label="Close notifications" onClick={() => setOpen(false)} />
      <aside className="dashboard-drawer" role="dialog" aria-modal="true" aria-label="Notifications">
        <header className="dashboard-drawer-head">
          <button type="button" className="dashboard-drawer-back" aria-label="Back" onClick={() => setOpen(false)}><ArrowLeft size={18} /></button>
          <h2>Notifications</h2>
          <button type="button" className="dashboard-drawer-close" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
        </header>
        <NotificationFeed onOpen={openItem} />
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="dashboard-bell" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'} aria-expanded={open} onClick={show}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="dashboard-bell-count">{unreadCount}</span>}
      </button>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { NotificationFeed } from '@/components/dashboard/NotificationFeed';
import { NotificationWorkspace } from '@/components/dashboard/NotificationWorkspace';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';
import type { FeedNotification } from '@/lib/notifications';

export default function NotificationBell() {
  const { unreadCount } = useNotificationInbox();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const label = unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications';

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = rootRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const alignedRight = Math.max(margin, window.innerWidth - rect.right);
      const available = Math.max(0, window.innerWidth - alignedRight - margin);
      const width = Math.min(380, available || window.innerWidth - margin * 2);
      const right = available >= width ? alignedRight : margin;
      const top = Math.min(rect.bottom + margin, window.innerHeight - margin - 160);
      panel.style.top = `${Math.max(margin, top)}px`;
      panel.style.right = `${right}px`;
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${Math.max(160, window.innerHeight - Math.max(margin, top) - margin)}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openItem(item: FeedNotification, openNotification: (item: FeedNotification) => void) {
    setOpen(false);
    openNotification(item);
  }

  return <NotificationWorkspace active={open}>
    {openNotification => <div className="notification-anchor" ref={rootRef}>
      <button type="button" className="dashboard-bell" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls="notification-popover" onClick={() => setOpen(value => !value)}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="dashboard-bell-count">{unreadCount}</span>}
      </button>
      {mounted && open ? createPortal(
        <div id="notification-popover" className="notification-popover" role="dialog" aria-label="Notifications" ref={panelRef}>
          <div className="notification-popover-head">
            <h2>Notifications</h2>
            <button type="button" className="notification-popover-close" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <NotificationFeed embedded onOpen={item => openItem(item, openNotification)} />
        </div>,
        document.body,
      ) : null}
    </div>}
  </NotificationWorkspace>;
}

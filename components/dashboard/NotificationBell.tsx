'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';

const SAMPLE_NOTIFICATIONS = [
  { id: 'lease', title: 'Lease ending soon', detail: '214 Maple · Unit 1', time: '2d ago' },
  { id: 'rent', title: 'Rent still outstanding', detail: '88 Harbor · $1,800', time: '1d ago' },
  { id: 'vacant', title: 'Unit is vacant', detail: '214 Maple · Unit 3', time: '5d ago' },
  { id: 'review', title: 'Bank transaction needs review', detail: '214 Maple · Uncategorized', time: '3h ago' },
  { id: 'expense', title: 'Large expense posted', detail: 'Harbor Plumbing · $280', time: '6h ago' },
];

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState<string[]>(() => SAMPLE_NOTIFICATIONS.map((item) => item.id));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const drawer = open ? (
    <div className="dashboard-drawer-root">
      <button type="button" className="dashboard-drawer-scrim" aria-label="Close notifications" onClick={() => setOpen(false)} />
      <aside className="dashboard-drawer" role="dialog" aria-modal="true" aria-label="Notifications">
        <header className="dashboard-drawer-head">
          <h2>Notifications</h2>
          <button type="button" className="dashboard-drawer-close" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
        </header>
        <button type="button" className="dashboard-drawer-mark" disabled={unread.length === 0} onClick={() => setUnread([])}>Mark all as read</button>
        <ul className="dashboard-drawer-list">
          {SAMPLE_NOTIFICATIONS.map((item) => (
            <li key={item.id} data-unread={unread.includes(item.id) ? 'true' : 'false'}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <time>{item.time}</time>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="dashboard-bell" aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'} aria-expanded={open} onClick={() => setOpen(true)}>
        <Bell size={18} />
        {unread.length > 0 && <span className="dashboard-bell-count">{unread.length}</span>}
      </button>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

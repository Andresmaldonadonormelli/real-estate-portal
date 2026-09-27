'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';

const SAMPLE_NOTIFICATIONS = [
  { id: 'transfer', title: 'Bank transfer received', detail: '15334 Triskett', amount: '+$2,377', tone: 'positive' as const, time: '2h ago' },
  { id: 'rent', title: 'Rent still outstanding', detail: 'W134', amount: '$1,200 remaining', tone: 'negative' as const, time: '1d ago' },
  { id: 'lease', title: 'Lease ends in 30 days', detail: '214 Maple · Unit 1', amount: '', tone: '' as const, time: '2d ago' },
  { id: 'review', title: 'Transaction needs review', detail: '3765 W134th · Uncategorized', amount: '', tone: '' as const, time: '3h ago' },
  { id: 'expense', title: 'Large expense posted', detail: 'Harbor Plumbing', amount: '-$280', tone: 'negative' as const, time: '6h ago' },
];

const SLIDE_MS = 280;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState<string[]>(() => SAMPLE_NOTIFICATIONS.map((item) => item.id));

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [present]);

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

  const drawer = present ? (
    <div className="dashboard-drawer-root" data-open={open ? 'true' : 'false'}>
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
              <button type="button">
                <span className="dashboard-drawer-title">
                  <strong>{item.title}</strong>
                  <time>{item.time}</time>
                  {unread.includes(item.id) ? <i className="dashboard-drawer-dot" aria-hidden="true" /> : null}
                </span>
                <span>{item.detail}{item.amount ? <> · <b className={item.tone ? `amount-${item.tone}` : ''}>{item.amount}</b></> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="dashboard-bell" aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'} aria-expanded={open} onClick={show}>
        <Bell size={18} />
        {unread.length > 0 && <span className="dashboard-bell-count">{unread.length}</span>}
      </button>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

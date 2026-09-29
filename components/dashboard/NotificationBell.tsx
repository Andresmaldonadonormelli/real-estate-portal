'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Bell, X } from 'lucide-react';

const SAMPLE_NOTIFICATIONS = [
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

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'transaction', label: 'Transactions' },
  { id: 'property', label: 'Properties' },
] as const;

type NotificationTab = (typeof TABS)[number]['id'];

const SLIDE_MS = 280;

export default function NotificationBell({ onOpenTransaction, onOpenProperty, hold = false }: {
  onOpenTransaction?: (item: DashboardNotification) => void;
  onOpenProperty?: (item: DashboardNotification) => void;
  hold?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<NotificationTab>('all');
  const [unread, setUnread] = useState<string[]>(() => SAMPLE_NOTIFICATIONS.map((item) => item.id));
  const visible = SAMPLE_NOTIFICATIONS.filter((item) => tab === 'all' || item.group === tab);

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
    setTab('all');
    setPresent(true);
    if (reduce) {
      setOpen(true);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true));
    });
  }

  function openItem(item: DashboardNotification) {
    if (item.group === 'transaction') {
      if (!('match' in item)) return;
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
        <div className="dashboard-drawer-tabs" role="tablist" aria-label="Notification groups">
          {TABS.map((choice) => (
            <button key={choice.id} type="button" role="tab" aria-selected={tab === choice.id} onClick={() => setTab(choice.id)}>{choice.label}</button>
          ))}
        </div>
        <button type="button" className="dashboard-drawer-mark" disabled={unread.length === 0} onClick={() => setUnread([])}>Mark all as read</button>
        <ul className="dashboard-drawer-list">
          {visible.map((item) => (
            <li key={item.id} data-unread={unread.includes(item.id) ? 'true' : 'false'}>
              <button type="button" onClick={() => openItem(item)}>
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

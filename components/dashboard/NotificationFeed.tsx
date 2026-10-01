'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { UnderlineTabs } from '@/components/common/ProductControls';
import { presentNotification, type FeedNotification } from '@/lib/notifications';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'transaction', label: 'Transactions' },
  { id: 'property', label: 'Properties' },
] as const;

type NotificationTab = (typeof TABS)[number]['id'];
type AlertSort = 'date' | 'amount';

export function NotificationFeed({ onOpen }: { onOpen: (item: FeedNotification) => void }) {
  const { items, unreadCount, loading, error, markRead, markAllRead } = useNotificationInbox();
  const [tab, setTab] = useState<NotificationTab>('all');
  const [sort, setSort] = useState<AlertSort>('date');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRoot = useRef<HTMLDivElement>(null);
  const visible = items
    .map(row => presentNotification(row))
    .filter(item => tab === 'all' || item.group === tab)
    .sort(compareAlerts(sort));

  useEffect(() => {
    if (!sortOpen) return;
    function close(event: PointerEvent) {
      if (!sortRoot.current?.contains(event.target as Node)) setSortOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSortOpen(false);
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortOpen]);

  function chooseSort(next: AlertSort) {
    setSort(next);
    setSortOpen(false);
  }

  function openItem(item: FeedNotification) {
    void markRead(item.id);
    onOpen(item);
  }

  return <>
    <UnderlineTabs primary className="property-menu notifications-tabs" value={tab} onChange={setTab} label="Notification groups" options={TABS.map(choice => ({ value: choice.id, label: choice.label }))} />
    <section className="dashboard-module notifications-board">
      <div className="notifications-tools">
        <button type="button" className="dashboard-drawer-mark" disabled={unreadCount === 0} onClick={() => void markAllRead()}>Mark all as read</button>
        <div className="notifications-sort" ref={sortRoot}>
          <button type="button" aria-haspopup="menu" aria-expanded={sortOpen} onClick={() => setSortOpen(open => !open)}>Sort <ChevronDown size={14} aria-hidden="true" /></button>
          {sortOpen ? <div className="notifications-sort-menu" role="menu">
            <button type="button" role="menuitemradio" aria-checked={sort === 'date'} onClick={() => chooseSort('date')}>Date</button>
            <button type="button" role="menuitemradio" aria-checked={sort === 'amount'} onClick={() => chooseSort('amount')}>Amount</button>
          </div> : null}
        </div>
      </div>
      {error && items.length === 0 ? <p className="dashboard-empty">{error}</p> : null}
      {!error && loading && items.length === 0 ? <p className="dashboard-empty">Loading notifications</p> : null}
      {!error && !loading && visible.length === 0 ? <p className="dashboard-empty">No notifications</p> : null}
      {visible.length > 0 ? (
        <ul className="dashboard-drawer-list">
          {visible.map(item => (
            <li key={item.id} data-unread={item.unread ? 'true' : 'false'}>
              <button type="button" onClick={() => openItem(item)}>
                <span className="dashboard-drawer-title">
                  <strong>{item.title}</strong>
                  <time dateTime={item.createdAt}>{item.time}</time>
                  {item.unread ? <i className="dashboard-drawer-dot" aria-hidden="true" /> : null}
                </span>
                <span>{item.body}{item.body && item.amountText ? ' · ' : ''}{item.amountText ? <b className={item.amountTone ? `amount-${item.amountTone}` : ''}>{item.amountText}</b> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  </>;
}

function compareAlerts(sort: AlertSort) {
  return (a: FeedNotification, b: FeedNotification) => {
    if (sort === 'amount') {
      if (a.amount == null && b.amount == null) return byDate(a, b);
      if (a.amount == null) return 1;
      if (b.amount == null) return -1;
      const diff = Math.abs(b.amount) - Math.abs(a.amount);
      if (diff !== 0) return diff;
    }
    return byDate(a, b);
  };
}

function byDate(a: FeedNotification, b: FeedNotification) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

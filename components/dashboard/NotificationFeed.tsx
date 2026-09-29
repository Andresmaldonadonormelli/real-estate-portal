'use client';

import { useState } from 'react';
import { presentNotification, type FeedNotification } from '@/lib/notifications';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'transaction', label: 'Transactions' },
  { id: 'property', label: 'Properties' },
] as const;

type NotificationTab = (typeof TABS)[number]['id'];

export function NotificationFeed({ onOpen }: { onOpen: (item: FeedNotification) => void }) {
  const { items, unreadCount, loading, error, markRead, markAllRead } = useNotificationInbox();
  const [tab, setTab] = useState<NotificationTab>('all');
  const visible = items.map(row => presentNotification(row)).filter(item => tab === 'all' || item.group === tab);

  function openItem(item: FeedNotification) {
    void markRead(item.id);
    onOpen(item);
  }

  return (
    <>
      <div className="dashboard-drawer-tabs" role="tablist" aria-label="Notification groups">
        {TABS.map(choice => (
          <button key={choice.id} type="button" role="tab" aria-selected={tab === choice.id} onClick={() => setTab(choice.id)}>{choice.label}</button>
        ))}
      </div>
      <button type="button" className="dashboard-drawer-mark" disabled={unreadCount === 0} onClick={() => void markAllRead()}>Mark all as read</button>
      {error && items.length === 0 ? <p className="dashboard-empty">{error}</p> : null}
      {!error && loading && items.length === 0 ? <p className="dashboard-empty">Loading notifications</p> : null}
      {!error && !loading && visible.length === 0 ? <p className="dashboard-empty">No notifications</p> : null}
      {visible.length > 0 ? (
        <ul className="dashboard-drawer-list">
          {visible.map(item => (
            <li key={item.id} data-unread={item.unread ? 'true' : 'false'}>
              <button type="button" onClick={() => openItem(item)}>
                <span className="dashboard-drawer-title">
                  <i className="dashboard-drawer-dot" data-hidden={item.unread ? undefined : 'true'} aria-hidden="true" />
                  <strong>{item.title}</strong>
                  <time dateTime={item.createdAt}>{item.time}</time>
                </span>
                <span>{item.body}{item.body && item.amountText ? ' · ' : ''}{item.amountText ? <b className={item.amountTone ? `amount-${item.amountTone}` : ''}>{item.amountText}</b> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Ellipsis } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';
import OverviewIcon from '@/components/layout/OverviewIcon';
import PropertiesIcon from '@/components/layout/PropertiesIcon';
import TransactionsIcon from '@/components/layout/TransactionsIcon';

export default function BottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotificationInbox();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const items = [
    { href: '/', label: 'Overview', kind: 'overview' as const },
    { href: '/properties', label: 'Properties', kind: 'properties' as const },
    { href: '/ledger', label: 'Transactions', kind: 'transactions' as const },
    { href: '/notifications', label: 'Alerts', kind: 'alerts' as const },
  ];
  const moreActive = pathname.startsWith('/account') || pathname.startsWith('/archive') || pathname.startsWith('/utilities');

  if (!mounted) return null;

  return createPortal(
    <nav className="bottom-nav">
      {items.map(({ href, label, kind }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === '/ledger' && pathname.startsWith('/actions'));
        return (
          <Link key={href} href={href} className={`bottom-nav-link ${active ? 'active' : ''}`} aria-label={kind === 'alerts' && unreadCount > 0 ? `Alerts, ${unreadCount} unread` : undefined}>
            {kind === 'overview' ? <OverviewIcon active={active} size={26} /> : kind === 'properties' ? <PropertiesIcon active={active} size={26} /> : kind === 'transactions' ? <TransactionsIcon active={active} size={26} /> : (
              <span className="bottom-nav-icon">
                <Bell size={26} strokeWidth={1.75} fill={active ? 'currentColor' : 'none'} />
                {unreadCount > 0 && <span className="dashboard-bell-count">{unreadCount}</span>}
              </span>
            )}
            <span>{label}</span>
          </Link>
        );
      })}
      <Link href="/account" className={`bottom-nav-link ${moreActive ? 'active' : ''}`}>
        <Ellipsis size={26} strokeWidth={1.75} fill={moreActive ? 'currentColor' : 'none'} />
        <span>More</span>
      </Link>
    </nav>,
    document.body
  );
}

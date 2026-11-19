'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ellipsis } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import OverviewIcon from '@/components/layout/OverviewIcon';
import PropertiesIcon from '@/components/layout/PropertiesIcon';
import TransactionsIcon from '@/components/layout/TransactionsIcon';
import { iconSize } from '@/lib/iconSizes';

export default function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const items = [
    { href: '/', label: 'Overview', kind: 'overview' as const },
    { href: '/properties', label: 'Properties', kind: 'properties' as const },
    { href: '/ledger', label: 'Transactions', kind: 'transactions' as const },
  ];
  const moreActive = pathname.startsWith('/account') || pathname.startsWith('/archive') || pathname.startsWith('/utilities');

  if (!mounted) return null;

  return createPortal(
    <nav className="bottom-nav">
      {items.map(({ href, label, kind }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === '/ledger' && pathname.startsWith('/actions'));
        return (
          <Link key={href} href={href} className={`bottom-nav-link ${active ? 'active' : ''}`}>
            {kind === 'overview' ? <OverviewIcon active={active} size={iconSize.navMobile} /> : kind === 'properties' ? <PropertiesIcon active={active} size={iconSize.navMobile} /> : <TransactionsIcon active={active} size={iconSize.navMobile} />}
            <span>{label}</span>
          </Link>
        );
      })}
      <Link href="/account" className={`bottom-nav-link ${moreActive ? 'active' : ''}`}>
        <Ellipsis size={iconSize.navMobile} strokeWidth={1.75} fill={moreActive ? 'currentColor' : 'none'} />
        <span>More</span>
      </Link>
    </nav>,
    document.body
  );
}

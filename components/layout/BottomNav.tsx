'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileChartColumn, Landmark } from 'lucide-react';
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
    { href: '/', label: 'Dashboard', kind: 'dashboard' as const },
    { href: '/properties', label: 'Properties', kind: 'properties' as const },
    { href: '/ledger', label: 'Transactions', kind: 'transactions' as const },
    { href: '/reports', label: 'Reports', kind: 'reports' as const },
    { href: '/taxes', label: 'Taxes', kind: 'taxes' as const },
  ];

  if (!mounted) return null;

  return createPortal(
    <nav className="bottom-nav">
      {items.map(({ href, label, kind }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === '/ledger' && pathname.startsWith('/actions'));
        return (
          <Link key={href} href={href} className={`bottom-nav-link ${active ? 'active' : ''}`}>
            {kind === 'dashboard' ? <OverviewIcon active={active} size={iconSize.nav} /> : kind === 'properties' ? <PropertiesIcon active={active} size={iconSize.nav} /> : kind === 'transactions' ? <TransactionsIcon active={active} size={iconSize.nav} /> : kind === 'reports' ? <FileChartColumn size={iconSize.nav} strokeWidth={1.75} /> : <Landmark size={iconSize.nav} strokeWidth={1.75} />}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>,
    document.body
  );
}

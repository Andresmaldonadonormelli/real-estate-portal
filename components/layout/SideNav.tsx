'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lightbulb, UserRound } from 'lucide-react';
import OverviewIcon from '@/components/layout/OverviewIcon';
import PropertiesIcon from '@/components/layout/PropertiesIcon';
import TransactionsIcon from '@/components/layout/TransactionsIcon';
import RotatingMascot from '@/components/layout/RotatingMascot';
import { iconSize } from '@/lib/iconSizes';

export default function SideNav() {
  const pathname = usePathname();
  const propertiesActive = pathname.startsWith('/properties');

  return <nav className="side-nav" aria-label="Primary">
    <div className="side-nav-brand">
      <RotatingMascot embedded />
      <strong>Portfolio</strong>
    </div>
    <div className="side-nav-scroll">
      <Link href="/" className={`nav-link ${pathname==='/'?'active':''}`}><OverviewIcon active={pathname==='/'} size={iconSize.nav}/>Overview</Link>
      <Link href="/properties" className={`nav-link ${propertiesActive?'active':''}`} aria-current={propertiesActive?'page':undefined}><PropertiesIcon active={propertiesActive} size={iconSize.nav}/><span>Properties</span></Link>
      <Link href="/ledger" className={`nav-link ${pathname.startsWith('/ledger')||pathname.startsWith('/actions')?'active':''}`}><TransactionsIcon active={pathname.startsWith('/ledger')||pathname.startsWith('/actions')} size={iconSize.nav}/><span>Transactions</span></Link>
      <Link href="/utilities" className={`nav-link ${pathname.startsWith('/utilities')?'active':''}`}><Lightbulb size={iconSize.nav} strokeWidth={1.75} fill={pathname.startsWith('/utilities')?'currentColor':'none'}/>Utilities</Link>
    </div>
    <div className="side-nav-footer">
      <Link href="/account" className={`nav-link ${pathname.startsWith('/account')||pathname.startsWith('/archive')?'active':''}`}><UserRound size={iconSize.nav} strokeWidth={1.75} fill={pathname.startsWith('/account')||pathname.startsWith('/archive')?'currentColor':'none'}/>Account</Link>
    </div>
  </nav>;
}

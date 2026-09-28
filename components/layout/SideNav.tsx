'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Lightbulb, UserRound, WalletCards } from 'lucide-react';
import OverviewIcon from '@/components/layout/OverviewIcon';
import RotatingMascot from '@/components/layout/RotatingMascot';

export default function SideNav() {
  const pathname = usePathname();
  const propertiesActive = pathname.startsWith('/properties');

  return <nav className="side-nav" aria-label="Primary">
    <div className="side-nav-brand">
      <RotatingMascot embedded />
      <strong>Portfolio</strong>
    </div>
    <div className="side-nav-scroll">
      <Link href="/" className={`nav-link ${pathname==='/'?'active':''}`}><OverviewIcon active={pathname==='/'} size={23}/>Overview</Link>
      <Link href="/properties" className={`nav-link ${propertiesActive?'active':''}`} aria-current={propertiesActive?'page':undefined}><Building2 size={23} strokeWidth={1.75} fill={propertiesActive?'currentColor':'none'}/><span>Properties</span></Link>
      <Link href="/ledger" className={`nav-link ${pathname.startsWith('/ledger')||pathname.startsWith('/actions')?'active':''}`}><WalletCards size={23} strokeWidth={1.75} fill={pathname.startsWith('/ledger')||pathname.startsWith('/actions')?'currentColor':'none'}/><span>Transactions</span></Link>
      <Link href="/utilities" className={`nav-link ${pathname.startsWith('/utilities')?'active':''}`}><Lightbulb size={23} strokeWidth={1.75} fill={pathname.startsWith('/utilities')?'currentColor':'none'}/>Utilities</Link>
    </div>
    <div className="side-nav-footer">
      <Link href="/account" className={`nav-link ${pathname.startsWith('/account')||pathname.startsWith('/archive')?'active':''}`}><UserRound size={23} strokeWidth={1.75} fill={pathname.startsWith('/account')||pathname.startsWith('/archive')?'currentColor':'none'}/>Account</Link>
    </div>
  </nav>;
}

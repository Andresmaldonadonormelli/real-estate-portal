'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Ellipsis, Gauge, WalletCards, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function BottomNav() {
  const pathname=usePathname();
  const [mounted,setMounted]=useState(false);

  useEffect(()=>setMounted(true),[]);

  const items=[
    {href:'/',label:'Dashboard',icon:Gauge},
    {href:'/properties',label:'Properties',icon:Building2},
    {href:'/ledger',label:'Transactions',icon:WalletCards},
    {href:'/utilities',label:'Utilities',icon:Zap},
  ];

  if(!mounted) return null;

  return createPortal(
    <nav className="bottom-nav">
      {items.map(({href,label,icon:Icon})=>{const active=pathname===href||pathname.startsWith(href+'/')||(href==='/ledger'&&pathname.startsWith('/actions'));return <Link key={href} href={href} className={`bottom-nav-link ${active?'active':''}`}><Icon size={20}/><span>{label}</span></Link>})}
      <Link href="/account" className={`bottom-nav-link ${pathname.startsWith('/account')||pathname.startsWith('/archive')?'active':''}`}><Ellipsis size={20}/><span>More</span></Link>
    </nav>,
    document.body
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Ellipsis, Lightbulb, WalletCards } from 'lucide-react';
import OverviewIcon from '@/components/layout/OverviewIcon';
import PropertiesIcon from '@/components/layout/PropertiesIcon';
import TransactionsIcon from '@/components/layout/TransactionsIcon';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function BottomNav() {
  const pathname=usePathname();
  const [mounted,setMounted]=useState(false);

  useEffect(()=>setMounted(true),[]);

  const items=[
    {href:'/',label:'Overview',icon:Building2},
    {href:'/properties',label:'Properties',icon:Building2},
    {href:'/ledger',label:'Transactions',icon:WalletCards},
    {href:'/utilities',label:'Utilities',icon:Lightbulb},
  ];

  if(!mounted) return null;

  return createPortal(
    <nav className="bottom-nav">
      {items.map(({href,label,icon:Icon})=>{const active=pathname===href||pathname.startsWith(href+'/')||(href==='/ledger'&&pathname.startsWith('/actions'));return <Link key={href} href={href} className={`bottom-nav-link ${active?'active':''}`}>{href==='/'?<OverviewIcon active={active} size={26}/>:href==='/properties'?<PropertiesIcon active={active} size={26}/>:href==='/ledger'?<TransactionsIcon active={active} size={26}/>:<Icon size={26} strokeWidth={1.75} fill={active?'currentColor':'none'}/>}<span>{label}</span></Link>})}
      <Link href="/account" className={`bottom-nav-link ${pathname.startsWith('/account')||pathname.startsWith('/archive')?'active':''}`}><Ellipsis size={26} strokeWidth={1.75} fill={pathname.startsWith('/account')||pathname.startsWith('/archive')?'currentColor':'none'}/><span>More</span></Link>
    </nav>,
    document.body
  );
}

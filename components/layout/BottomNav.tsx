'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Gauge, Menu, Settings, WalletCards } from 'lucide-react';

export default function BottomNav({ onMenuClick }:{onMenuClick:()=>void}) {
  const pathname=usePathname();
  const items=[
    {href:'/',label:'Dashboard',icon:Gauge},
    {href:'/properties',label:'Properties',icon:Building2},
    {href:'/ledger',label:'Ledger',icon:WalletCards},
    {href:'/utilities',label:'Utilities',icon:Settings},
  ];
  return <nav className="bottom-nav">
    {items.map(({href,label,icon:Icon})=><Link key={href} href={href} className={`bottom-nav-link ${pathname===href||pathname.startsWith(href+'/')?'active':''}`}><Icon size={20}/><span>{label}</span></Link>)}
    <button onClick={onMenuClick} className="bottom-nav-link"><Menu size={20}/><span>Menu</span></button>
  </nav>;
}

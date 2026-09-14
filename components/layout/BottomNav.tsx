'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Gauge, Menu, Settings, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

export default function BottomNav({ onMenuClick }:{onMenuClick:()=>void}) {
  const pathname=usePathname();
  const [mounted,setMounted]=useState(false);
  const [newImports,setNewImports]=useState(0);

  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{supabase.from('transactions').select('id',{count:'exact',head:true}).is('archived_at',null).eq('is_new_import',true).eq('status','posted').then(({count,error})=>{if(!error)setNewImports(count||0)})},[pathname]);

  const items=[
    {href:'/',label:'Dashboard',icon:Gauge},
    {href:'/properties',label:'Properties',icon:Building2},
    {href:'/ledger',label:'Ledger',icon:WalletCards},
    {href:'/utilities',label:'Utilities',icon:Settings},
  ];

  if(!mounted) return null;

  return createPortal(
    <nav className="bottom-nav">
      {items.map(({href,label,icon:Icon})=>{const active=pathname===href||pathname.startsWith(href+'/')||(href==='/ledger'&&pathname.startsWith('/actions'));return <Link key={href} href={href} className={`bottom-nav-link ${active?'active':''}`}><Icon size={20}/><span>{label}</span>{href==='/ledger'&&newImports>0&&<b className="bottom-nav-count">{newImports}</b>}</Link>})}
      <button onClick={onMenuClick} className="bottom-nav-link"><Menu size={20}/><span>Menu</span></button>
    </nav>,
    document.body
  );
}

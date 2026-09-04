'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Building2, FileText, Gauge, Home, Settings, WalletCards } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { supabase } from '@/lib/supabase';

type PropertyLink = { id:string; address:string };

export default function SideNav() {
  const pathname = usePathname();
  const [properties,setProperties]=useState<PropertyLink[]>([]);
  const [reviewCount,setReviewCount]=useState(0);

  useEffect(()=>{ let alive=true; (async()=>{
    const [p,t]=await Promise.all([
      supabase.from('properties').select('id,address').is('archived_at',null).order('address'),
      supabase.from('transactions').select('id',{count:'exact',head:true}).is('archived_at',null).eq('needs_review',true).neq('status','declined')
    ]);
    if(!alive)return;
    if(!p.error)setProperties((p.data||[]) as PropertyLink[]);
    if(!t.error)setReviewCount(t.count||0);
  })(); return()=>{alive=false}; },[pathname]);

  const activePropertyId=useMemo(()=>pathname.match(/^\/properties\/([^/]+)/)?.[1]||'',[pathname]);
  const items=[
    {href:'/',label:'Dashboard',icon:Gauge},
    {href:'/ledger',label:'Ledger & Docs',icon:WalletCards},
    {href:'/utilities',label:'Utilities',icon:Settings},
    {href:'/account',label:'Account',icon:Home},
  ];

  return <nav className="side-nav">
    <div className="side-nav-brand" aria-label="RE Portal"><img src="/brand-logo.png" alt="" /></div>
    <div className="side-nav-scroll">
      <Link href="/" className={`nav-link ${pathname==='/'?'active':''}`}><Gauge size={18}/>Dashboard</Link>

      <div className="side-nav-section">
        <Link href="/properties" className={`nav-link ${pathname==='/properties'?'active':''}`}><Building2 size={18}/><span>Properties</span></Link>
        <div className="property-nav-list">
          {properties.slice(0,8).map(p=><Link key={p.id} href={`/properties/${p.id}`} className={`property-nav-link ${activePropertyId===p.id?'active':''}`}>{p.address}</Link>)}
          {properties.length>8&&<Link href="/properties" className="property-nav-link muted">View all properties</Link>}
        </div>
      </div>

      <Link href="/ledger" className={`nav-link ${pathname.startsWith('/ledger')?'active':''}`}><WalletCards size={18}/><span>Ledger & Docs</span></Link>
      <Link href="/actions" className={`nav-link ${pathname.startsWith('/actions')?'active':''}`}><FileText size={18}/><span>Needs Review</span>{reviewCount>0&&<span className="nav-count nav-count-review">{reviewCount}</span>}</Link>
      <Link href="/utilities" className={`nav-link ${pathname.startsWith('/utilities')?'active':''}`}><Settings size={18}/>Utilities</Link>
      <Link href="/account" className={`nav-link ${pathname.startsWith('/account')?'active':''}`}><Home size={18}/>Account</Link>
    </div>
    <div className="side-nav-footer"><ThemeToggle/></div>
  </nav>;
}

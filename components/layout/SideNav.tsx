'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, Gauge, Settings, UserRound, WalletCards } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cachedSupabaseRequest } from '@/lib/supabaseData';
import RotatingMascot from '@/components/layout/RotatingMascot';

export default function SideNav() {
  const pathname = usePathname();
  const [reviewCount,setReviewCount]=useState(0);

  useEffect(()=>{ let alive=true; (async()=>{
    const t=await cachedSupabaseRequest('nav:new-import-count',async()=>await supabase.from('transactions').select('id',{count:'exact',head:true}).is('archived_at',null).eq('source','plaid').eq('is_new_import',true).eq('status','posted'));
    if(!alive)return;
    if(!t.error)setReviewCount(t.count||0);
  })(); return()=>{alive=false}; },[pathname]);

  return <nav className="side-nav" aria-label="Primary">
    <div className="side-nav-brand">
      <RotatingMascot embedded />
      <strong>RE Portal</strong>
    </div>
    <div className="side-nav-scroll">
      <Link href="/" className={`nav-link ${pathname==='/'?'active':''}`}><Gauge size={18} strokeWidth={1.75}/>Dashboard</Link>
      <Link href="/properties" className={`nav-link ${pathname.startsWith('/properties')?'active':''}`}><Building2 size={18} strokeWidth={1.75}/><span>Properties</span></Link>
      <Link href="/ledger" className={`nav-link ${pathname.startsWith('/ledger')||pathname.startsWith('/actions')?'active':''}`}><WalletCards size={18} strokeWidth={1.75}/><span>Transactions</span>{reviewCount>0&&<span className="nav-count nav-count-review">{reviewCount}</span>}</Link>
      <Link href="/utilities" className={`nav-link ${pathname.startsWith('/utilities')?'active':''}`}><Settings size={18} strokeWidth={1.75}/>Utilities</Link>
    </div>
    <div className="side-nav-footer">
      <Link href="/account" className={`nav-link ${pathname.startsWith('/account')||pathname.startsWith('/archive')?'active':''}`}><UserRound size={18} strokeWidth={1.75}/>Account</Link>
    </div>
  </nav>;
}

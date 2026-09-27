'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Lightbulb, UserRound, WalletCards } from 'lucide-react';
import OverviewIcon from '@/components/layout/OverviewIcon';
import { supabase } from '@/lib/supabase';
import { cachedSupabaseRequest, PROPERTY_FIELDS } from '@/lib/supabaseData';
import { shortPropertyName } from '@/lib/formatters';
import type { Property } from '@/lib/types';
import RotatingMascot from '@/components/layout/RotatingMascot';

export default function SideNav() {
  const pathname = usePathname();
  const [properties,setProperties]=useState<Property[]>([]);
  const [propertiesOpen,setPropertiesOpen]=useState(false);

  useEffect(()=>{ let alive=true; (async()=>{
    const result=await cachedSupabaseRequest('shared:properties',async()=>await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at',null).order('address'));
    if(!alive||result.error)return;
    setProperties((result.data||[]) as Property[]);
  })(); return()=>{alive=false}; },[pathname]);

  return <nav className="side-nav" aria-label="Primary">
    <div className="side-nav-brand">
      <RotatingMascot embedded />
      <strong>Portfolio</strong>
    </div>
    <div className="side-nav-scroll">
      <Link href="/" className={`nav-link ${pathname==='/'?'active':''}`}><OverviewIcon active={pathname==='/'} size={18}/>Overview</Link>
      <button type="button" className={`nav-link nav-disclosure ${pathname.startsWith('/properties')?'active':''}`} aria-expanded={propertiesOpen} onClick={()=>setPropertiesOpen(open=>!open)}><Building2 size={18} strokeWidth={1.75} fill={pathname.startsWith('/properties')?'currentColor':'none'}/><span>Properties</span><ChevronDown size={16} aria-hidden="true"/></button>
      {propertiesOpen&&<div className="property-nav-list">
        <Link href="/properties" className={`property-nav-link ${pathname==='/properties'?'active':''}`}>All properties</Link>
        {properties.map(property=><Link key={property.id} href={`/properties/${property.id}`} className={`property-nav-link ${pathname===`/properties/${property.id}`?'active':''}`}>{shortPropertyName(property.address)}</Link>)}
      </div>}
      <Link href="/ledger" className={`nav-link ${pathname.startsWith('/ledger')||pathname.startsWith('/actions')?'active':''}`}><WalletCards size={18} strokeWidth={1.75} fill={pathname.startsWith('/ledger')||pathname.startsWith('/actions')?'currentColor':'none'}/><span>Transactions</span></Link>
      <Link href="/utilities" className={`nav-link ${pathname.startsWith('/utilities')?'active':''}`}><Lightbulb size={18} strokeWidth={1.75} fill={pathname.startsWith('/utilities')?'currentColor':'none'}/>Utilities</Link>
    </div>
    <div className="side-nav-footer">
      <Link href="/account" className={`nav-link ${pathname.startsWith('/account')||pathname.startsWith('/archive')?'active':''}`}><UserRound size={18} strokeWidth={1.75} fill={pathname.startsWith('/account')||pathname.startsWith('/archive')?'currentColor':'none'}/>Account</Link>
    </div>
  </nav>;
}

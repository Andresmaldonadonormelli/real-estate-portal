'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/types';
import LedgerTab from '@/components/ledger/LedgerTab';
import StatementsTab from '@/components/ledger/StatementsTab';
import DocumentsTab from '@/components/ledger/DocumentsTab';
import PageSkeleton from '@/components/common/PageSkeleton';
import { withTimeout } from '@/lib/async';

type Tab='ledger'|'statements'|'documents';
export default function LedgerDocsPage(){
  const searchParams=useSearchParams();
  const requestedTab=searchParams.get('tab');
  const requestedProperty=searchParams.get('property') || '';
  const [tab,setTab]=useState<Tab>(requestedTab==='documents'||requestedTab==='statements'?requestedTab:'ledger');
  const [properties,setProperties]=useState<Property[]>([]);
  const [selectedPropertyId,setSelectedPropertyId]=useState(requestedProperty);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const nextTab=searchParams.get('tab');
    setTab(nextTab==='documents'||nextTab==='statements'?nextTab:'ledger');
    setSelectedPropertyId(searchParams.get('property') || '');
  },[searchParams]);

  useEffect(()=>{(async()=>{try{const {data,error}=await withTimeout(Promise.resolve(supabase.from('properties').select('*').is('archived_at',null).order('address')),8000,'Properties took too long to load.');if(!error)setProperties((data||[]) as Property[]);}finally{setLoading(false);}})();},[]);
  return <div className="ledger-page ledger-v230-page">
    <header className="ledger-v230-page-head"><h1 className="type-page-title type-semibold">Ledger & Docs</h1><p className="type-small type-secondary">Your money and property paperwork in one place.</p></header>
    <div className="ledger-v230-workspace">
      <nav className="ledger-tabs ledger-v230-tabs" aria-label="Ledger sections">{(['ledger','statements','documents'] as Tab[]).map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?'top-tab active':'top-tab'}>{t==='ledger'?'Ledger':t==='statements'?'Statements':'Documents'}</button>)}</nav>
      {loading?<PageSkeleton variant="ledger"/>:tab==='ledger'
        ?<LedgerTab selectedPropertyId={selectedPropertyId} onSelectedPropertyChange={setSelectedPropertyId}/>
        :<><label className="ledger-v230-secondary-picker"><span>Property</span><select value={selectedPropertyId} onChange={e=>setSelectedPropertyId(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></label>{tab==='statements'?<StatementsTab selectedPropertyId={selectedPropertyId}/>:<DocumentsTab selectedPropertyId={selectedPropertyId}/>}</>}
    </div>
  </div>
}

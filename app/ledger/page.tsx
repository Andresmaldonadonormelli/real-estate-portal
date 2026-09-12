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
import { cachedSupabaseRequest, PROPERTY_FIELDS } from '@/lib/supabaseData';
import { PageAction, PageHeader, ProductSelect, UnderlineTabs } from '@/components/common/ProductControls';

type Tab='ledger'|'statements'|'documents';
export default function LedgerDocsPage(){
  const searchParams=useSearchParams();
  const requestedTab=searchParams.get('tab');
  const requestedProperty=searchParams.get('property') || '';
  const [tab,setTab]=useState<Tab>(requestedTab==='documents'||requestedTab==='statements'?requestedTab:'ledger');
  const [properties,setProperties]=useState<Property[]>([]);
  const [selectedPropertyId,setSelectedPropertyId]=useState(requestedProperty);
  const [loading,setLoading]=useState(true);
  const [addRequest,setAddRequest]=useState(0);
  const [uploadRequest,setUploadRequest]=useState(0);

  useEffect(()=>{
    const nextTab=searchParams.get('tab');
    setTab(nextTab==='documents'||nextTab==='statements'?nextTab:'ledger');
    setSelectedPropertyId(searchParams.get('property') || '');
  },[searchParams]);

  useEffect(()=>{(async()=>{try{const {data,error}=await withTimeout(cachedSupabaseRequest('shared:properties',async()=>await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at',null).order('address')),8000,'Properties took too long to load.');if(!error)setProperties((data||[]) as Property[]);}finally{setLoading(false);}})();},[]);
  function changeTab(next:Tab){setTab(next);setAddRequest(0);setUploadRequest(0)}
  return <div className="ledger-page ledger-v230-page">
    <PageHeader title="Ledger & Docs" action={tab!=='statements'?<PageAction onClick={()=>tab==='ledger'?setAddRequest(value=>value+1):setUploadRequest(value=>value+1)}>{tab==='ledger'?'Add transaction':'Upload document'}</PageAction>:undefined}/>
    <div className="ledger-v230-workspace">
      <UnderlineTabs primary value={tab} onChange={changeTab} label="Ledger sections" className="ledger-v230-tabs" options={[{value:'ledger',label:'Ledger'},{value:'statements',label:'Statements'},{value:'documents',label:'Documents'}]}/>
      {!loading&&tab!=='documents'&&<ProductSelect label="Property" value={selectedPropertyId} onChange={e=>setSelectedPropertyId(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</ProductSelect>}
      {loading?<PageSkeleton variant="ledger"/>:tab==='ledger'
        ?<LedgerTab selectedPropertyId={selectedPropertyId} onSelectedPropertyChange={setSelectedPropertyId} addRequest={addRequest} onActionHandled={()=>setAddRequest(0)}/>
        :tab==='statements'?<StatementsTab selectedPropertyId={selectedPropertyId}/>:<DocumentsTab selectedPropertyId={selectedPropertyId} onSelectedPropertyChange={setSelectedPropertyId} uploadRequest={uploadRequest} onActionHandled={()=>setUploadRequest(0)}/>} 
    </div>
  </div>
}

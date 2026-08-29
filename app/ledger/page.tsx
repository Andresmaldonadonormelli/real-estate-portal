'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/types';
import LedgerTab from '@/components/ledger/LedgerTab';
import StatementsTab from '@/components/ledger/StatementsTab';
import DocumentsTab from '@/components/ledger/DocumentsTab';
import PageSkeleton from '@/components/common/PageSkeleton';
import { withTimeout } from '@/lib/async';

type Tab='ledger'|'statements'|'documents';
export default function LedgerDocsPage(){
  const [tab,setTab]=useState<Tab>('ledger');
  const [properties,setProperties]=useState<Property[]>([]);
  const [selectedPropertyId,setSelectedPropertyId]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{try{const {data,error}=await withTimeout(Promise.resolve(supabase.from('properties').select('*').order('address')),8000,'Properties took too long to load.');if(!error)setProperties((data||[]) as Property[]);}finally{setLoading(false);}})();},[]);
  return <div className="ledger-page" style={{padding:24,maxWidth:1200,margin:'0 auto'}}>
    <div style={{marginBottom:24}}><h1 style={{fontSize:30,fontWeight:600}}>Ledger & Docs</h1><p style={{fontSize:14,color:'var(--text-secondary)',marginTop:5}}>Your money and property paperwork in one place.</p></div>
    <div style={{borderTop:'1px solid var(--border-color)',paddingTop:22}}>
      <div className="ledger-page-toolbar" style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'end',flexWrap:'wrap',marginBottom:22}}>
        <div className="ledger-tabs" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{(['ledger','statements','documents'] as Tab[]).map(t=><button key={t} onClick={()=>setTab(t)} style={tab===t?activeTab:tabButton}>{t==='ledger'?'Ledger':t==='statements'?'Statements':'Documents'}</button>)}</div>
        <label className="ledger-property-picker" style={{display:'grid',gap:6,fontSize:13,minWidth:280}}>Select property<select value={selectedPropertyId} onChange={e=>setSelectedPropertyId(e.target.value)} style={inputStyle}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></label>
      </div>
      {loading?<PageSkeleton variant="ledger"/>:tab==='ledger'?<LedgerTab selectedPropertyId={selectedPropertyId}/>:tab==='statements'?<StatementsTab selectedPropertyId={selectedPropertyId}/>:<DocumentsTab selectedPropertyId={selectedPropertyId}/>} 
    </div>
  </div>
}
const tabButton:React.CSSProperties={padding:'11px 18px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-secondary)',color:'var(--text-primary)',fontWeight:600};
const activeTab:React.CSSProperties={...tabButton,background:'var(--accent)',borderColor:'var(--accent)',color:'var(--accent-contrast)'};
const inputStyle:React.CSSProperties={width:'100%',padding:'10px 12px',border:'1px solid var(--border-color)',borderRadius:9,background:'var(--bg-secondary)',color:'var(--text-primary)',fontSize:16};

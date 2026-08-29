'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StatCard from '@/components/common/StatCard';
import { supabase } from '@/lib/supabase';
import { calculatePortfolioStats, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency } from '@/lib/formatters';
import type { Property, Unit, Transaction } from '@/lib/types';

export default function Dashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewPropertyId, setReviewPropertyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [testPreview, setTestPreview] = useState(false);
  const [testResolvedUnitIds, setTestResolvedUnitIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError('You are not signed in.'); setLoading(false); return; }
    const [p,u,t] = await Promise.all([
      supabase.from('properties').select('*').order('address'),
      supabase.from('units').select('*').order('unit_number'),
      supabase.from('transactions').select('*').order('transaction_date',{ascending:false}),
    ]);
    const err=p.error||u.error||t.error; if(err){setError(err.message);setLoading(false);return;}
    const props=(p.data||[]) as Property[]; const unitRows=(u.data||[]) as Unit[]; let txRows=(t.data||[]) as Transaction[];
    const now=new Date(); const month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const first=`${month}-01`;
    const inserts: Record<string,unknown>[]=[];
    for(const unit of unitRows){
      if(!unit.occupied||unit.recurring_rent_enabled===false||Number(unit.current_rent||0)<=0) continue;
      const resolved=txRows.some(tx=>tx.unit_id===unit.id&&tx.category==='Rent'&&tx.transaction_date.startsWith(month)&&((tx.status||'posted')==='posted'||tx.status==='declined'));
      const pending=txRows.some(tx=>tx.unit_id===unit.id&&tx.category==='Rent'&&tx.transaction_date.startsWith(month)&&tx.status==='pending');
      if(resolved||pending) continue;
      inserts.push({user_id:auth.user.id,property_id:unit.property_id,unit_id:unit.id,transaction_date:first,type:'income',category:'Rent',description:`${unit.unit_number} rent`,payee_source:unit.tenant_name||null,amount:Number(unit.current_rent),notes:'Recurring rent awaiting confirmation',source:'recurring',status:'pending',import_key:`recurring-rent:${unit.id}:${month}`});
    }
    for(const property of props){
      const payment=Number(property.monthly_mortgage_payment||0); if(payment<=0) continue;
      const exists=txRows.some(tx=>tx.property_id===property.id&&tx.category==='Mortgage'&&tx.transaction_date.startsWith(month)&&(tx.status||'posted')==='posted');
      if(!exists) inserts.push({user_id:auth.user.id,property_id:property.id,unit_id:null,transaction_date:first,type:'expense',category:'Mortgage',description:'Monthly mortgage payment',amount:-Math.abs(payment),notes:'Recurring monthly mortgage',source:'recurring',status:'posted',confirmed_at:new Date().toISOString(),import_key:`recurring-mortgage:${property.id}:${month}`});
    }
    if(inserts.length){
      const ins=await supabase.from('transactions').upsert(inserts,{onConflict:'user_id,import_key',ignoreDuplicates:true});
      if(ins.error) setError(ins.error.message); else { const r=await supabase.from('transactions').select('*').order('transaction_date',{ascending:false}); if(!r.error) txRows=(r.data||[]) as Transaction[]; }
    }
    const urls:Record<string,string>={};
    await Promise.all(props.filter(x=>x.image_path).map(async prop=>{ const r=await supabase.storage.from('property-images').createSignedUrl(prop.image_path!,3600); if(r.data?.signedUrl) urls[prop.id]=r.data.signedUrl; }));
    setImageUrls(urls); setProperties(props); setUnits(unitRows); setTransactions(txRows); setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  async function generateTestRentChecks(){
    setError('');
    const eligible=units.filter(unit=>unit.occupied&&unit.recurring_rent_enabled!==false&&Number(unit.current_rent||0)>0);
    if(!eligible.length){ setError('No occupied units with recurring rent are available to test.'); return; }
    setTestResolvedUnitIds([]);
    setTestPreview(true);
    setReviewPropertyId(eligible[0].property_id);
  }

  async function confirmRent(tx:Transaction){
    setConfirming(tx.id); setError('');
    const property=properties.find(p=>p.id===tx.property_id); const feePercent=Number(property?.management_fee_percent||0);
    const up=await supabase.from('transactions').update({status:'posted',confirmed_at:new Date().toISOString(),notes:'Recurring rent confirmed received'}).eq('id',tx.id).eq('status','pending');
    if(up.error){setError(up.error.message);setConfirming(null);return;}
    if(feePercent>0){ const {data:auth}=await supabase.auth.getUser(); if(auth.user){ const fee=Math.round(Math.abs(Number(tx.amount))*feePercent)/100; const fr=await supabase.from('transactions').upsert({user_id:auth.user.id,property_id:tx.property_id,unit_id:tx.unit_id||null,transaction_date:tx.transaction_date,type:'expense',category:'Management Fee',description:`Management fee (${feePercent}%)`,payee_source:'Property manager',amount:-fee,notes:`Automatically created when rent was confirmed. Rate: ${feePercent}%`,source:'recurring',status:'posted',confirmed_at:new Date().toISOString(),import_key:`management-fee:${tx.id}`},{onConflict:'user_id,import_key',ignoreDuplicates:true}); if(fr.error)setError(fr.error.message); }}
    await load(); setConfirming(null);
  }
  async function declineRent(tx:Transaction){
    if(!confirm('Remove this rent confirmation for this month? It will not come back this month.')) return;
    const r=await supabase.from('transactions').update({status:'declined',notes:'Recurring rent suggestion declined'}).eq('id',tx.id).eq('status','pending');
    if(r.error)setError(r.error.message); else await load();
  }

  const stats=useMemo(()=>calculatePortfolioStats(properties,units,transactions),[properties,units,transactions]);
  const currentMonth=new Date().toISOString().slice(0,7);
  const monthLabel=new Date().toLocaleString('en-US',{month:'long'});
  const postedThisMonth=useMemo(()=>transactions.filter(t=>t.transaction_date.startsWith(currentMonth)&&(t.status||'posted')==='posted'),[transactions,currentMonth]);
  const monthlyTotals=useMemo(()=>calculateMonthlyTotals(postedThisMonth),[postedThisMonth]);
  const pendingRents=useMemo(()=>transactions.filter(t=>t.status==='pending'&&t.category==='Rent'),[transactions]);
  const unitMap=useMemo(()=>Object.fromEntries(units.map(u=>[u.id,u])),[units]);
  const reviewRents=pendingRents.filter(t=>t.property_id===reviewPropertyId);
  const testReviewUnits=useMemo(()=>units.filter(u=>u.property_id===reviewPropertyId&&u.occupied&&u.recurring_rent_enabled!==false&&Number(u.current_rent||0)>0&&!testResolvedUnitIds.includes(u.id)),[units,reviewPropertyId,testResolvedUnitIds]);

  return <div style={{padding:24,maxWidth:1200,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:24,flexWrap:'wrap'}}><h1 style={{fontSize:28,fontWeight:500}}>Dashboard</h1><div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><button className="primary-action" onClick={generateTestRentChecks} style={primaryButton}>Test rent check</button><Link href="/ledger" style={{fontSize:14}}>Open ledger →</Link></div></div>
    {error&&<div style={errorBox}>{error}</div>}
    {loading?<p>Loading…</p>:<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:16}}><StatCard label="Properties" value={stats.totalProperties}/><StatCard label="Occupied Units" value={`${stats.occupiedUnits}/${stats.totalUnits}`}/><StatCard label="Vacant Units" value={stats.vacantUnits}/></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:32}}><StatCard label="Income This Month" value={formatCurrency(monthlyTotals.income)} color="accent"/><StatCard label="Expenses This Month" value={formatCurrency(monthlyTotals.expense)} color="danger"/><StatCard label="Net Cash Flow" value={formatCurrency(monthlyTotals.net)} color={monthlyTotals.net>=0?'accent':'danger'}/><StatCard label="Mortgage Balance" value={formatCurrency(stats.totalMortgageBalance)}/></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><h2 style={{fontSize:19,fontWeight:600}}>Properties</h2><Link href="/properties" style={{fontSize:14}}>Manage properties →</Link></div>
      <div style={{display:'grid',gap:12,marginBottom:32}}>{properties.map(property=>{const pu=units.filter(u=>u.property_id===property.id);const pt=postedThisMonth.filter(t=>t.property_id===property.id);const totals=calculateMonthlyTotals(pt);const pending=pendingRents.filter(t=>t.property_id===property.id);return <div key={property.id} className="card" style={{padding:16}}>
        <div style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr) auto',gap:14,alignItems:'center'}}>
          {imageUrls[property.id]?<img src={imageUrls[property.id]} alt="" className="property-thumb"/>:<div className="property-thumb" style={{display:'grid',placeItems:'center',color:'var(--text-muted)',fontSize:24}}>⌂</div>}
          <div><h3 style={{fontSize:17,marginBottom:4}}>{property.address}</h3><div style={{color:'var(--text-secondary)',fontSize:13}}>{property.city}, {property.state} · {pu.filter(u=>u.occupied).length}/{pu.length} occupied</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:12,color:'var(--text-secondary)'}}>This month</div><strong style={{color:totals.net>=0?'var(--accent)':'var(--danger)'}}>{formatCurrency(totals.net)}</strong></div>
        </div>
        {pending.length>0&&<div style={{marginTop:14,padding:'12px 14px',borderRadius:9,background:'rgba(219, 184, 74, .16)',border:'1px solid rgba(219, 184, 74, .35)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong style={{fontSize:14}}>{monthLabel} rent check</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:2}}>{pending.length} occupied unit{pending.length===1?' is':'s are'} awaiting rent confirmation.</div></div><button className="primary-action" onClick={()=>{setTestPreview(false);setReviewPropertyId(property.id);}} style={primaryButton}>Review rents</button></div>}
      </div>})}</div>
      <h2 style={{fontSize:19,marginBottom:14,fontWeight:600}}>Recent Activity</h2><div className="card" style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Description</th><th style={{textAlign:'right'}}>Amount</th></tr></thead><tbody>{transactions.filter(t=>(t.status||'posted')==='posted').slice(0,8).map(tx=><tr key={tx.id}><td>{tx.transaction_date}</td><td>{tx.description}</td><td style={{textAlign:'right',color:tx.type==='income'?'var(--accent)':tx.type==='expense'?'var(--danger)':'var(--text-secondary)'}}>{tx.type==='expense'?'-':''}{formatCurrency(Math.abs(tx.amount))}</td></tr>)}</tbody></table></div>
    </>}
    {reviewPropertyId&&<div style={overlay}><div className="card" style={{width:'100%',maxWidth:620,padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><div><h2 style={{fontSize:21}}>Review {monthLabel} rents</h2>{testPreview&&<div style={{display:'inline-block',marginTop:6,padding:'3px 8px',borderRadius:999,background:'var(--accent-soft)',color:'var(--nav-active-text)',fontSize:11,fontWeight:700}}>TEST PREVIEW</div>}</div><button onClick={()=>{setReviewPropertyId(null);setTestPreview(false);}} style={secondaryButton}>✕</button></div><p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:18}}>{testPreview?'This preview lets you test the rent-review interface today. It does not write anything to your ledger.':"Confirm only the rent payments you actually received. Decline removes that unit's suggestion for this month."}</p><div style={{display:'grid',gap:10}}>
      {testPreview?testReviewUnits.map(unit=><div key={unit.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit.unit_number||'Unit'} · {formatCurrency(Number(unit.current_rent||0))}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>setTestResolvedUnitIds(ids=>[...ids,unit.id])} style={secondaryButton}>Decline</button><button className="primary-action" onClick={()=>setTestResolvedUnitIds(ids=>[...ids,unit.id])} style={primaryButton}>Confirm received</button></div></div>):reviewRents.map(tx=>{const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <div key={tx.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit?.unit_number||'Unit'} · {formatCurrency(tx.amount)}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit?.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>declineRent(tx)} style={secondaryButton}>Decline</button><button className="primary-action" disabled={confirming===tx.id} onClick={()=>confirmRent(tx)} style={primaryButton}>{confirming===tx.id?'Confirming…':'Confirm received'}</button></div></div>})}
      {testPreview&&testReviewUnits.length===0&&<div style={{padding:18,textAlign:'center',color:'var(--text-secondary)',border:'1px solid var(--border-color)',borderRadius:10}}>Test complete. All occupied units were reviewed.</div>}
    </div></div></div>}
  </div>;
}
const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:8,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:650,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:8,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:18};
const overlay:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'grid',placeItems:'center',padding:18,zIndex:1000};

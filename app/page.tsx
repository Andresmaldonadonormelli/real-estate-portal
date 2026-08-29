'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatCard from '@/components/common/StatCard';
import PageSkeleton from '@/components/common/PageSkeleton';
import { useAuth } from '@/components/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { calculatePortfolioStats, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency } from '@/lib/formatters';
import type { Property, Unit, Transaction } from '@/lib/types';
import { withTimeout } from '@/lib/async';

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewPropertyId, setReviewPropertyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [testPreview, setTestPreview] = useState(false);
  const [testModeActive, setTestModeActive] = useState(false);
  const [testResolvedUnitIds, setTestResolvedUnitIds] = useState<string[]>([]);

  const refreshTransactions = useCallback(async () => {
    try {
      const r = await withTimeout(Promise.resolve(supabase.from('transactions').select('*').order('transaction_date',{ascending:false})), 8000, 'The ledger took too long to refresh.');
      if (!r.error) setTransactions((r.data||[]) as Transaction[]);
    } catch {
      // Background refresh failure should never hide the dashboard.
    }
  }, []);

  const ensureRecurring = useCallback(async (props: Property[], unitRows: Unit[], txRows: Transaction[]) => {
    const now=new Date(); const month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const first=`${month}-01`;
    const inserts: Record<string,unknown>[]=[];
    for(const unit of unitRows){
      if(!unit.occupied||unit.recurring_rent_enabled===false||Number(unit.current_rent||0)<=0) continue;
      const resolved=txRows.some(tx=>tx.unit_id===unit.id&&tx.category==='Rent'&&tx.transaction_date.startsWith(month)&&((tx.status||'posted')==='posted'||tx.status==='declined'));
      const pending=txRows.some(tx=>tx.unit_id===unit.id&&tx.category==='Rent'&&tx.transaction_date.startsWith(month)&&tx.status==='pending');
      if(resolved||pending) continue;
      inserts.push({user_id:user.id,property_id:unit.property_id,unit_id:unit.id,transaction_date:first,type:'income',category:'Rent',description:`${unit.unit_number} rent`,payee_source:unit.tenant_name||null,amount:Number(unit.current_rent),notes:'Recurring rent awaiting confirmation',source:'recurring',status:'pending',import_key:`recurring-rent:${unit.id}:${month}`});
    }
    for(const property of props){
      const payment=Number(property.monthly_mortgage_payment||0); if(payment<=0) continue;
      const mortgageStart=(property as Property & {mortgage_start_date?:string|null}).mortgage_start_date;
      if(mortgageStart && first < mortgageStart) continue;
      const exists=txRows.some(tx=>tx.property_id===property.id&&tx.category==='Mortgage'&&tx.transaction_date.startsWith(month)&&['posted','declined'].includes(tx.status||'posted'));
      if(!exists) inserts.push({user_id:user.id,property_id:property.id,unit_id:null,transaction_date:first,type:'expense',category:'Mortgage',description:'Monthly mortgage payment',amount:-Math.abs(payment),notes:'Recurring monthly mortgage',source:'recurring',status:'posted',confirmed_at:new Date().toISOString(),import_key:`recurring-mortgage:${property.id}:${month}`});
    }
    if(!inserts.length) return;
    try {
      const ins = await withTimeout(Promise.resolve(supabase.from('transactions').upsert(inserts,{onConflict:'user_id,import_key',ignoreDuplicates:true})), 8000, 'Recurring entries took too long.');
      if(!ins.error) await refreshTransactions();
    } catch {
      // Recurring bookkeeping is intentionally non-blocking.
    }
  }, [refreshTransactions, user.id]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p,u,t] = await withTimeout(Promise.all([
        supabase.from('properties').select('*').order('address'),
        supabase.from('units').select('*').order('unit_number'),
        supabase.from('transactions').select('*').order('transaction_date',{ascending:false}),
      ]), 8000, 'Dashboard data took too long to load. Please retry.');
      const err=p.error||u.error||t.error; if(err) throw err;
      const props=(p.data||[]) as Property[]; const unitRows=(u.data||[]) as Unit[]; const txRows=(t.data||[]) as Transaction[];

      // Show the useful dashboard as soon as the core data arrives.
      setProperties(props); setUnits(unitRows); setTransactions(txRows); setLoading(false);

      // Images and recurring bookkeeping happen after render and never block it.
      void (async()=>{
        const urls:Record<string,string>={};
        await Promise.all(props.filter(x=>x.image_path).map(async prop=>{
          try { const r=await supabase.storage.from('property-images').createSignedUrl(prop.image_path!,3600); if(r.data?.signedUrl) urls[prop.id]=r.data.signedUrl; } catch {}
        }));
        setImageUrls(urls);
      })();
      void ensureRecurring(props, unitRows, txRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
      setLoading(false);
    }
  },[ensureRecurring]);

  useEffect(()=>{load();},[load]);

  async function generateTestRentChecks(){
    setError('');
    const eligible=units.filter(unit=>unit.occupied&&unit.recurring_rent_enabled!==false&&Number(unit.current_rent||0)>0);
    if(!eligible.length){ setError('No occupied units with recurring rent are available to test.'); return; }
    setTestResolvedUnitIds([]);
    setTestPreview(false);
    setReviewPropertyId(null);
    setTestModeActive(true);
  }

  function resolveTestUnit(unitId:string){
    const remainingForProperty=testReviewUnits.filter(unit=>unit.id!==unitId);
    setTestResolvedUnitIds(ids=>[...ids,unitId]);
    if(remainingForProperty.length===0){
      setReviewPropertyId(null);
      setTestPreview(false);
    }
  }

  async function confirmRent(tx:Transaction){
    setConfirming(tx.id); setError('');
    const property=properties.find(p=>p.id===tx.property_id); const feePercent=Number(property?.management_fee_percent||0);
    const up=await supabase.from('transactions').update({status:'posted',confirmed_at:new Date().toISOString(),notes:'Recurring rent confirmed received'}).eq('id',tx.id).eq('status','pending');
    if(up.error){setError(up.error.message);setConfirming(null);return;}
    if(feePercent>0){ const fee=Math.round(Math.abs(Number(tx.amount))*feePercent)/100; const fr=await supabase.from('transactions').upsert({user_id:user.id,property_id:tx.property_id,unit_id:tx.unit_id||null,transaction_date:tx.transaction_date,type:'expense',category:'Management Fee',description:`Management fee (${feePercent}%)`,payee_source:'Property manager',amount:-fee,notes:`Automatically created when rent was confirmed. Rate: ${feePercent}%`,source:'recurring',status:'posted',confirmed_at:new Date().toISOString(),import_key:`management-fee:${tx.id}`},{onConflict:'user_id,import_key',ignoreDuplicates:true}); if(fr.error)setError(fr.error.message); }
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
  const testPendingForProperty=(propertyId:string)=>testModeActive?units.filter(u=>u.property_id===propertyId&&u.occupied&&u.recurring_rent_enabled!==false&&Number(u.current_rent||0)>0&&!testResolvedUnitIds.includes(u.id)).length:0;

  return <div className="dashboard-page" style={{padding:24,maxWidth:1200,margin:'0 auto'}}>
    <div className="dashboard-header"><h1 style={{fontSize:28,fontWeight:500}}>Dashboard</h1><div className="dashboard-header-actions"><button className="primary-action test-rent-button" onClick={generateTestRentChecks} style={primaryButton}>Test rent check</button><Link href="/ledger" style={{fontSize:14}}>Open ledger →</Link></div></div>
    {error&&<div style={errorBox}>{error}</div>}
    {loading?<PageSkeleton variant="dashboard"/>:<>
      <div className="dashboard-stats dashboard-stats-top"><StatCard label="Properties" value={stats.totalProperties}/><StatCard label="Occupied Units" value={`${stats.occupiedUnits}/${stats.totalUnits}`}/><StatCard label="Vacant Units" value={stats.vacantUnits}/></div>
      <div className="dashboard-stats dashboard-stats-money"><StatCard label="Income This Month" value={formatCurrency(monthlyTotals.income)} color="accent"/><StatCard label="Expenses This Month" value={formatCurrency(monthlyTotals.expense)} color="danger"/><StatCard label="Net Cash Flow" value={formatCurrency(monthlyTotals.net)} color={monthlyTotals.net>=0?'accent':'danger'}/><StatCard label="Mortgage Balance" value={formatCurrency(stats.totalMortgageBalance)}/></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><h2 style={{fontSize:19,fontWeight:600}}>Properties</h2><Link href="/properties" style={{fontSize:14}}>Manage properties →</Link></div>
      <div style={{display:'grid',gap:12,marginBottom:32}}>{properties.map(property=>{const pu=units.filter(u=>u.property_id===property.id);const pt=postedThisMonth.filter(t=>t.property_id===property.id);const totals=calculateMonthlyTotals(pt);const pending=pendingRents.filter(t=>t.property_id===property.id);return <div key={property.id} className="card dashboard-property-card" role="button" tabIndex={0} aria-label={`Open ${property.address}`} onClick={()=>router.push('/properties')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();router.push('/properties');}}} style={{padding:16}}>
        <div style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr) auto',gap:14,alignItems:'center'}}>
          {imageUrls[property.id]?<img src={imageUrls[property.id]} alt="" className="property-thumb"/>:<div className="property-thumb" style={{display:'grid',placeItems:'center',color:'var(--text-muted)',fontSize:24}}>⌂</div>}
          <div><h3 style={{fontSize:17,marginBottom:4}}>{property.address}</h3><div style={{color:'var(--text-secondary)',fontSize:13}}>{property.city}, {property.state} · {pu.filter(u=>u.occupied).length}/{pu.length} occupied</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:12,color:'var(--text-secondary)'}}>This month</div><strong style={{color:totals.net>=0?'var(--accent)':'var(--danger)'}}>{formatCurrency(totals.net)}</strong></div>
        </div>
        {(()=>{const testPending=pending.length===0?testPendingForProperty(property.id):0;const actionCount=pending.length||testPending;if(!actionCount)return null;const isTest=testPending>0;return <div className="rent-attention-panel"><div><div className="rent-attention-kicker">{isTest?'TEST · ACTION NEEDED':'ACTION NEEDED'}</div><strong style={{fontSize:15}}>{monthLabel} rent confirmation</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{actionCount} occupied unit{actionCount===1?' is':'s are'} awaiting confirmation.</div></div><button className="primary-action" onClick={e=>{e.stopPropagation();setTestPreview(isTest);setReviewPropertyId(property.id);}} style={primaryButton}>Review rents</button></div>;})()}
      </div>})}</div>
      <div className="recent-activity-heading"><h2 style={{fontSize:19,fontWeight:600}}>Recent Activity</h2></div><div className="card recent-activity-card"><div className="recent-activity-list">{transactions.filter(t=>(t.status||'posted')==='posted').slice(0,6).map(tx=><div className="recent-activity-row" key={tx.id}><div className="recent-activity-copy"><span>{new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><strong>{tx.description}</strong></div><strong className={tx.type==='income'?'amount-positive':tx.type==='expense'?'amount-negative':''}>{tx.type==='expense'?'-':''}{formatCurrency(Math.abs(tx.amount))}</strong></div>)}</div><Link href="/ledger" className="pill-link primary-action recent-ledger-button">Open ledger</Link></div>
    </>}
    {reviewPropertyId&&<div style={overlay}><div className="card" style={{width:'100%',maxWidth:620,padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><div><h2 style={{fontSize:21}}>Review {monthLabel} rents</h2>{testPreview&&<div style={{display:'inline-block',marginTop:6,padding:'3px 8px',borderRadius:999,background:'var(--accent-soft)',color:'var(--nav-active-text)',fontSize:11,fontWeight:700}}>TEST PREVIEW</div>}</div><button onClick={()=>{setReviewPropertyId(null);setTestPreview(false);}} style={secondaryButton}>✕</button></div><p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:18}}>{testPreview?'This preview lets you test the rent-review interface today. It does not write anything to your ledger.':"Confirm only the rent payments you actually received. Decline removes that unit's suggestion for this month."}</p><div style={{display:'grid',gap:10}}>
      {testPreview?testReviewUnits.map(unit=><div key={unit.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit.unit_number||'Unit'} · {formatCurrency(Number(unit.current_rent||0))}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>resolveTestUnit(unit.id)} style={secondaryButton}>Decline</button><button className="primary-action" onClick={()=>resolveTestUnit(unit.id)} style={primaryButton}>Confirm received</button></div></div>):reviewRents.map(tx=>{const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <div key={tx.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit?.unit_number||'Unit'} · {formatCurrency(tx.amount)}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit?.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>declineRent(tx)} style={secondaryButton}>Decline</button><button className="primary-action" disabled={confirming===tx.id} onClick={()=>confirmRent(tx)} style={primaryButton}>{confirming===tx.id?'Confirming…':'Confirm received'}</button></div></div>})}
      {testPreview&&testReviewUnits.length===0&&<div style={{padding:18,textAlign:'center',color:'var(--text-secondary)',border:'1px solid var(--border-color)',borderRadius:10}}>Test complete. All occupied units were reviewed.</div>}
    </div></div></div>}
  </div>;
}
const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:999,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:650,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:18};
const overlay:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'grid',placeItems:'center',padding:18,zIndex:1000};

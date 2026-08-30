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
import type { Property, Unit, Transaction, PropertyDocument } from '@/lib/types';
import { withTimeout } from '@/lib/async';
import { Banknote, Landmark, Wrench, Zap, ShieldCheck, Receipt, FileText, Building2, Hammer, Scale, WalletCards, CircleDollarSign, ClipboardCheck, RotateCcw } from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [cashMode, setCashMode] = useState<'monthly'|'cumulative'>('monthly');
  const [cashPropertyId, setCashPropertyId] = useState('');
  const [imageUrls, setImageUrls] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewPropertyId, setReviewPropertyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [testPreview, setTestPreview] = useState(false);
  const [testModeActive, setTestModeActive] = useState(false);
  const [testResolvedUnitIds, setTestResolvedUnitIds] = useState<string[]>([]);
  const [testActionsActive, setTestActionsActive] = useState(false);

  const refreshTransactions = useCallback(async () => {
    try {
      const r = await withTimeout(Promise.resolve(supabase.from('transactions').select('*').is('archived_at',null).order('transaction_date',{ascending:false})), 8000, 'The ledger took too long to refresh.');
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
      if(property.mortgage_recurring_enabled===false) continue;
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
      const [p,u,t,d] = await withTimeout(Promise.all([
        supabase.from('properties').select('*').order('address'),
        supabase.from('units').select('*').order('unit_number'),
        supabase.from('transactions').select('*').is('archived_at',null).order('transaction_date',{ascending:false}),
        supabase.from('documents').select('*').is('archived_at',null).order('created_at',{ascending:false}),
      ]), 8000, 'Dashboard data took too long to load. Please retry.');
      const err=p.error||u.error||t.error||d.error; if(err) throw err;
      const props=(p.data||[]) as Property[]; const unitRows=(u.data||[]) as Unit[]; const txRows=(t.data||[]) as Transaction[];

      // Show the useful dashboard as soon as the core data arrives.
      setProperties(props); setUnits(unitRows); setTransactions(txRows); setDocuments((d.data||[]) as PropertyDocument[]); setLoading(false);

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

  const actionItems=useMemo(()=>{
    const items:{id:string;kind:'rent'|'document';title:string;detail:string;propertyId?:string;days?:number;test?:boolean}[]=[];
    const grouped=new Map<string,number>(); pendingRents.forEach(t=>grouped.set(t.property_id,(grouped.get(t.property_id)||0)+1));
    grouped.forEach((count,propertyId)=>{const prop=properties.find(p=>p.id===propertyId);items.push({id:`rent-${propertyId}`,kind:'rent',propertyId,title:`Confirm ${monthLabel} rent`,detail:`${prop?.address||'Property'} · ${count} unit${count===1?'':'s'} waiting`});});
    const today=new Date(); today.setHours(0,0,0,0);
    documents.filter(d=>d.expires_at).forEach(doc=>{const due=new Date(`${doc.expires_at}T12:00:00`);const days=Math.ceil((due.getTime()-today.getTime())/86400000);const remind=Number(doc.reminder_days||60);if(days<=remind){const prop=properties.find(p=>p.id===doc.property_id);items.push({id:`doc-${doc.id}`,kind:'document',title:days<0?`${doc.category} expired`:days===0?`${doc.category} due today`:`${doc.category} due in ${days} days`,detail:`${prop?.address||'Property'} · ${doc.title}`,days});}});
    if(testActionsActive){
      const sampleProperty=properties[0];
      items.unshift(
        {id:'test-rent',kind:'rent',propertyId:sampleProperty?.id,title:`Confirm ${monthLabel} rents`,detail:`${sampleProperty?.address||'Sample property'} · Review expected rent`,test:true},
        {id:'test-insurance',kind:'document',title:'Insurance renewal due in 30 days',detail:`${sampleProperty?.address||'Sample property'} · Policy renewal`,days:30,test:true},
        {id:'test-lease',kind:'document',title:'Lease expires in 60 days',detail:`${sampleProperty?.address||'Sample property'} · Unit 1 lease`,days:60,test:true}
      );
    }
    return items.sort((a,b)=>(a.days??999)-(b.days??999));
  },[documents,pendingRents,properties,monthLabel,testActionsActive]);

  const cashFlow=useMemo(()=>{
    const now=new Date(); const rows:{key:string;label:string;value:number}[]=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const value=transactions.filter(t=>(t.status||'posted')==='posted'&&t.transaction_date.startsWith(key)&&(!cashPropertyId||t.property_id===cashPropertyId)).reduce((sum,t)=>sum+Number(t.amount||0),0);rows.push({key,label:d.toLocaleString('en-US',{month:'short'}),value});}
    if(cashMode==='cumulative'){let running=0;return rows.map(r=>({...r,value:(running+=r.value)}));} return rows;
  },[transactions,cashMode,cashPropertyId]);

  return <div className="dashboard-page" style={{padding:24,maxWidth:1200,margin:'0 auto'}}>
    <div className="dashboard-header"><h1 style={{fontSize:28,fontWeight:500}}>Dashboard</h1><div className="dashboard-header-actions"><button className="test-action-button" onClick={()=>setTestActionsActive(v=>!v)} style={secondaryButton}>{testActionsActive?'Hide test actions':'Test action'}</button><Link href="/ledger" style={{fontSize:14}}>Open ledger →</Link></div></div>
    {error&&<div style={errorBox}>{error}</div>}
    {loading?<PageSkeleton variant="dashboard"/>:<>
      <div className="dashboard-stats dashboard-stats-top"><StatCard label="Properties" value={stats.totalProperties}/><StatCard label="Occupied Units" value={`${stats.occupiedUnits}/${stats.totalUnits}`}/><StatCard label="Vacant Units" value={stats.vacantUnits}/></div>
      <div className="dashboard-stats dashboard-stats-money"><StatCard label="Income This Month" value={formatCurrency(monthlyTotals.income)} color="accent"/><StatCard label="Expenses This Month" value={formatCurrency(monthlyTotals.expense)} color="danger"/><StatCard label="Net Cash Flow" value={formatCurrency(monthlyTotals.net)} color={monthlyTotals.net>=0?'accent':'danger'}/><StatCard label="Mortgage Balance" value={formatCurrency(stats.totalMortgageBalance)}/></div>
      {actionItems.length>0&&<section className="action-center card"><div className="section-heading-row"><div><div className="eyebrow">NEEDS YOU</div><h2>Action Center</h2></div><div style={{display:'flex',alignItems:'center',gap:8}}>{testActionsActive&&<span className="test-badge">TEST</span>}{actionItems.length>3&&<span className="muted-small">{actionItems.length} open</span>}</div></div><div className="action-list">{actionItems.slice(0,3).map(item=><button key={item.id} className="action-row" onClick={()=>{if(item.kind==='rent'&&item.propertyId){setReviewPropertyId(item.propertyId);setTestPreview(Boolean(item.test));if(item.test)setTestModeActive(true);}else if(!item.test)router.push('/ledger');}}><ActionIcon kind={item.kind} title={item.title}/><span><strong>{item.title}</strong><small>{item.detail}{item.test?' · Test preview':''}</small></span><span className="action-cta">{item.kind==='rent'?'Review':'Open'} <span aria-hidden="true">→</span></span></button>)}</div><div className="action-center-footer"><button className="action-center-see-all" onClick={()=>router.push(testActionsActive?'/actions?test=1':'/actions')}>See all <span aria-hidden="true">→</span></button></div></section>}
      <section className="dashboard-main-grid">
        <div className="cashflow-card card"><div className="section-heading-row cashflow-head"><div><h2>Cash Flow</h2><p>Trailing 12 months · posted ledger activity</p></div><div className="cashflow-controls"><select aria-label="Cash flow property" value={cashPropertyId} onChange={e=>setCashPropertyId(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select><div className="segmented"><button className={cashMode==='monthly'?'active':''} onClick={()=>setCashMode('monthly')}>Monthly</button><button className={cashMode==='cumulative'?'active':''} onClick={()=>setCashMode('cumulative')}>Cumulative</button></div></div></div><CashFlowChart rows={cashFlow}/></div>
        <div className="dashboard-properties-panel card"><div className="section-heading-row properties-panel-head"><h2>Properties</h2><Link href="/properties" style={{fontSize:13}}>Manage →</Link></div><div className="dashboard-properties-list">{properties.map(property=>{const pu=units.filter(u=>u.property_id===property.id);const pt=postedThisMonth.filter(t=>t.property_id===property.id);const totals=calculateMonthlyTotals(pt);const pending=pendingRents.filter(t=>t.property_id===property.id);return <div key={property.id} className="dashboard-property-compact" role="button" tabIndex={0} onClick={()=>router.push('/properties')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();router.push('/properties');}}}>
          {imageUrls[property.id]?<img src={imageUrls[property.id]} alt="" className="property-compact-thumb"/>:<div className="property-compact-thumb property-compact-fallback">⌂</div>}
          <div className="property-compact-copy"><strong>{property.address}</strong><span>{pu.filter(u=>u.occupied).length}/{pu.length} occupied</span></div><strong className={totals.net>=0?'amount-positive':'amount-negative'}>{formatCurrency(totals.net)}</strong>
        </div>})}</div></div>
      </section>
      <div className="recent-activity-heading"><h2 style={{fontSize:19,fontWeight:600}}>Recent Activity</h2></div><div className="card recent-activity-card"><div className="recent-activity-list">{transactions.filter(t=>(t.status||'posted')==='posted').slice(0,6).map(tx=>{const property=properties.find(p=>p.id===tx.property_id);const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <button type="button" className="recent-activity-row" key={tx.id} onClick={()=>router.push('/ledger')} aria-label={`Open ${tx.description} in ledger`}><DashboardCategoryIcon category={tx.category}/><div className="recent-activity-copy"><strong>{property?.address||'Portfolio activity'}</strong><span>{tx.description}{unit?.unit_number?` · Unit ${unit.unit_number}`:''} · {new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div><strong className={tx.type==='income'?'amount-positive':tx.type==='expense'?'amount-negative':''}>{tx.type==='expense'?'-':''}{formatCurrency(Math.abs(tx.amount))}</strong></button>})}</div><Link href="/ledger" className="pill-link primary-action recent-ledger-button">Open ledger</Link></div>
    </>}
    {reviewPropertyId&&<div style={overlay}><div className="card" style={{width:'100%',maxWidth:620,padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><div><h2 style={{fontSize:21}}>Review {monthLabel} rents</h2>{testPreview&&<div style={{display:'inline-block',marginTop:6,padding:'3px 8px',borderRadius:999,background:'var(--accent-soft)',color:'var(--nav-active-text)',fontSize:11,fontWeight:700}}>TEST PREVIEW</div>}</div><button onClick={()=>{setReviewPropertyId(null);setTestPreview(false);}} style={secondaryButton}>✕</button></div><p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:18}}>{testPreview?'This preview lets you test the rent-review interface today. It does not write anything to your ledger.':"Confirm only the rent payments you actually received. Decline removes that unit's suggestion for this month."}</p><div style={{display:'grid',gap:10}}>
      {testPreview?testReviewUnits.map(unit=><div key={unit.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit.unit_number||'Unit'} · {formatCurrency(Number(unit.current_rent||0))}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>resolveTestUnit(unit.id)} style={secondaryButton}>Decline</button><button className="primary-action" onClick={()=>resolveTestUnit(unit.id)} style={primaryButton}>Confirm received</button></div></div>):reviewRents.map(tx=>{const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <div key={tx.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit?.unit_number||'Unit'} · {formatCurrency(tx.amount)}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit?.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>declineRent(tx)} style={secondaryButton}>Decline</button><button className="primary-action" disabled={confirming===tx.id} onClick={()=>confirmRent(tx)} style={primaryButton}>{confirming===tx.id?'Confirming…':'Confirm received'}</button></div></div>})}
      {testPreview&&testReviewUnits.length===0&&<div style={{padding:18,textAlign:'center',color:'var(--text-secondary)',border:'1px solid var(--border-color)',borderRadius:10}}>Test complete. All occupied units were reviewed.</div>}
    </div></div></div>}
  </div>;
}
function DashboardCategoryIcon({category}:{category:string}){const props={size:19,strokeWidth:1.8};const Icon=category==='Rent'?Banknote:category==='Mortgage'?Landmark:category==='Repairs & Maintenance'?Wrench:category==='Utilities'?Zap:category==='Insurance'?ShieldCheck:category==='Management Fee'?ClipboardCheck:category==='Leasing Fee'?Receipt:category==='Property Taxes'?Building2:category==='CapEx'?Hammer:category==='Legal'?Scale:category==='Owner Distribution'?WalletCards:category==='Other Income'?CircleDollarSign:category.toLowerCase().includes('refund')?RotateCcw:FileText;return <span className="ledger-category-icon recent-category-icon" aria-hidden="true"><Icon {...props}/></span>}
function ActionIcon({kind,title}:{kind:'rent'|'document';title:string}){const props={size:19,strokeWidth:1.8};const lower=title.toLowerCase();const Icon=kind==='rent'?Banknote:lower.includes('insurance')?ShieldCheck:lower.includes('lease')?FileText:ClipboardCheck;return <span className="action-icon" aria-hidden="true"><Icon {...props}/></span>}

function CashFlowChart({rows}:{rows:{key:string;label:string;value:number}[]}){
  const w=760,h=210,pad=28; const vals=rows.map(r=>r.value); const max=Math.max(1,...vals.map(v=>Math.abs(v))); const zero=h/2; const x=(i:number)=>pad+i*((w-pad*2)/Math.max(1,rows.length-1)); const y=(v:number)=>zero-(v/max)*(h/2-pad); const points=rows.map((r,i)=>`${x(i)},${y(r.value)}`).join(' ');
  return <div className="cashflow-chart-wrap"><svg className="cashflow-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Cash flow over the last 12 months"><line x1={pad} y1={zero} x2={w-pad} y2={zero} className="chart-zero"/><polyline points={points} className="chart-line" fill="none"/>{rows.map((r,i)=><g key={r.key}><circle cx={x(i)} cy={y(r.value)} r="4" className={r.value<0?'chart-point negative':'chart-point'}/><text x={x(i)} y={h-4} textAnchor="middle" className="chart-label">{r.label}</text></g>)}</svg><div className="cashflow-total"><span>Latest</span><strong className={rows.at(-1)?.value&&rows.at(-1)!.value<0?'amount-negative':'amount-positive'}>{formatCurrency(rows.at(-1)?.value||0)}</strong></div></div>;
}
const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:999,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:650,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:18};
const overlay:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'grid',placeItems:'center',padding:18,zIndex:1000};

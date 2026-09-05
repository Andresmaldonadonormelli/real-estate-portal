'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, Building2, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, FileText, Gauge, Hammer, Home, Landmark, LockKeyhole, PencilLine, Receipt, RotateCcw, Scale, ShieldCheck, TrendingDown, TrendingUp, Upload, Users, WalletCards, Wrench, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';
import { categoryKey } from '@/lib/accounting';
import type { Property, PropertyDocument, Unit } from '@/lib/types';
import FinancialHistoryChart from '@/components/charts/FinancialHistoryChart';
import { buildMonthlyFinancialHistory, type HistoryMode, type HistoryPeriod } from '@/lib/financialHistory';

type Tab = 'overview' | 'improve' | 'units' | 'documents';
type Tx = {
  id:string; property_id:string; unit_id?:string|null; transaction_date:string; type:'income'|'expense'|'transfer'; category:string; description:string; payee_source?:string|null; amount:number; notes?:string|null; status?:string|null; archived_at?:string|null; needs_review?:boolean|null; receipt_path?:string|null;
};

const OPERATING_EXCLUSIONS = ['mortgage-interest','mortgage-principal','mortgage','capex','distribution'];
const categoryVar:Record<string,string> = {
  rent:'var(--category-rent)', management:'var(--category-management)', leasing:'var(--category-management)', maintenance:'var(--category-maintenance)', utilities:'var(--category-utilities)', insurance:'var(--category-insurance)', taxes:'var(--category-taxes)', capex:'var(--category-capex)', legal:'var(--category-legal)', 'mortgage-interest':'var(--category-mortgage)', 'mortgage-principal':'var(--category-mortgage)', mortgage:'var(--category-mortgage)', review:'var(--category-review)', neutral:'var(--category-neutral)', 'other-income':'var(--category-rent)'
};

const formatKpiCurrency=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Math.round(value));


const LEASE_DOC_PREFIX='property-documents:';
function leaseStorageRef(value?:string|null){
  const path=String(value||'');
  return path.startsWith(LEASE_DOC_PREFIX)?{bucket:'property-documents',path:path.slice(LEASE_DOC_PREFIX.length)}:{bucket:'unit-leases',path};
}
function leaseFileName(path:string){
  const raw=path.split('/').pop()||'lease.pdf';
  return raw.replace(/^\d+-/,'')||'lease.pdf';
}
async function syncLegacyUnitLeases(propertyId:string,unitRows:any[],docRows:any[]){
  const auth=await supabase.auth.getUser();
  const user=auth.data.user;
  if(!user)return {units:unitRows,documents:docRows};
  const nextUnits=[...unitRows];
  const nextDocs=[...docRows];
  for(let i=0;i<nextUnits.length;i++){
    let unit=nextUnits[i];
    if(!unit?.lease_document_path)continue;

    let ref=leaseStorageRef(unit.lease_document_path);
    let storagePath=ref.path;
    let mimeType='application/pdf';
    let fileSize:number|null=null;
    let fileName=leaseFileName(storagePath);

    // Move legacy unit-leases files into the central property-documents bucket first.
    if(ref.bucket!=='property-documents'){
      const signed=await supabase.storage.from(ref.bucket).createSignedUrl(ref.path,120);
      if(signed.error||!signed.data?.signedUrl)continue;
      const response=await fetch(signed.data.signedUrl);
      if(!response.ok)continue;
      const blob=await response.blob();
      mimeType=blob.type||mimeType; fileSize=blob.size||null;
      const safe=fileName.replace(/[^a-zA-Z0-9._-]+/g,'-');
      storagePath=`${user.id}/${propertyId}/${unit.id}/${Date.now()}-${safe}`;
      const moved=await supabase.storage.from('property-documents').upload(storagePath,blob,{upsert:false,contentType:mimeType});
      if(moved.error)continue;
      const newLeasePath=`${LEASE_DOC_PREFIX}${storagePath}`;
      const unitUpdate=await supabase.from('units').update({lease_document_path:newLeasePath}).eq('id',unit.id);
      if(unitUpdate.error)continue;
      unit={...unit,lease_document_path:newLeasePath};
      nextUnits[i]=unit;
    }

    const title=`${unit.unit_number||'Unit'} Lease${unit.tenant_name?` · ${unit.tenant_name}`:''}`;
    const row={
      user_id:user.id, property_id:propertyId, unit_id:unit.id, category:'Lease',
      title, file_name:fileName, storage_path:storagePath, mime_type:mimeType, file_size:fileSize,
      document_date:unit.lease_start_date||null, expires_at:unit.lease_end_date||null,
      reminder_days:60, notes:unit.tenant_name?`Signed lease for ${unit.tenant_name}`:null, archived_at:null,
    };

    // The actual unit lease path is the source of truth. Do not treat any random
    // Lease record for the unit as "already synced" unless it points to this file.
    const exact=nextDocs.find((d:any)=>d.storage_path===storagePath&&!d.archived_at);
    const unitLease=nextDocs.find((d:any)=>d.unit_id===unit.id&&d.category==='Lease'&&!d.archived_at);
    const target=exact||unitLease;
    if(target){
      const updated=await supabase.from('documents').update(row).eq('id',target.id).select('*').single();
      if(!updated.error&&updated.data){
        const idx=nextDocs.findIndex((d:any)=>d.id===target.id);
        if(idx>=0)nextDocs[idx]=updated.data;
      }
      continue;
    }

    const inserted=await supabase.from('documents').insert(row).select('*').single();
    if(!inserted.error&&inserted.data)nextDocs.unshift(inserted.data);
  }
  return {units:nextUnits,documents:nextDocs};
}

export default function PropertyWorkspacePage(){
  const params=useParams<{id:string}>();
  const propertyId=String(params?.id || '');
  const [tab,setTab]=useState<Tab>('overview');
  const [property,setProperty]=useState<Property|null>(null);
  const [units,setUnits]=useState<Unit[]>([]);
  const [transactions,setTransactions]=useState<Tx[]>([]);
  const [documents,setDocuments]=useState<PropertyDocument[]>([]);
  const [imageUrl,setImageUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [editingProperty,setEditingProperty]=useState(false);

  useEffect(()=>{ if(!propertyId) return; (async()=>{
    setLoading(true); setError('');
    const [p,u,t,d]=await Promise.all([
      supabase.from('properties').select('*').eq('id',propertyId).is('archived_at',null).single(),
      supabase.from('units').select('*').eq('property_id',propertyId).is('archived_at',null).order('unit_number'),
      supabase.from('transactions').select('*').eq('property_id',propertyId).is('archived_at',null).order('transaction_date',{ascending:false}),
      supabase.from('documents').select('*').eq('property_id',propertyId).is('archived_at',null).order('created_at',{ascending:false}),
    ]);
    if(p.error){ setError(p.error.message); setLoading(false); return; }
    const prop=p.data as Property;
    const synced=await syncLegacyUnitLeases(propertyId,(u.data||[]) as Unit[],(d.data||[]) as PropertyDocument[]);
    setProperty(prop); setUnits(synced.units as Unit[]); setTransactions((t.data||[]) as Tx[]); setDocuments(synced.documents as PropertyDocument[]);
    if(prop.image_path){ const signed=await supabase.storage.from('property-images').createSignedUrl(prop.image_path,3600); if(signed.data?.signedUrl) setImageUrl(signed.data.signedUrl); }
    setLoading(false);
  })(); },[propertyId]);

  const currentYear=new Date().getFullYear();
  const current=useMemo(()=>transactions.filter(t=>t.status!=='declined' && Number(t.transaction_date.slice(0,4))===currentYear),[transactions,currentYear]);
  const metrics=useMemo(()=>calculateMetrics(current),[current]);
  const occupied=units.filter(u=>u.occupied).length;
  const expectedRent=units.filter(u=>u.occupied).reduce((s,u)=>s+Number(u.current_rent||0),0);

  if(loading) return <div className="property-workspace property-workspace-skeleton" aria-busy="true" aria-label="Loading property">
    <div className="property-skeleton-back skeleton-block"/>
    <div className="property-skeleton-header">
      <div className="property-skeleton-image skeleton-block"/>
      <div className="property-skeleton-title-copy">
        <div className="property-skeleton-title skeleton-block"/>
        <div className="property-skeleton-city skeleton-block"/>
        <div className="property-skeleton-meta skeleton-block"/>
        <div className="property-skeleton-ledger skeleton-block"/>
      </div>
    </div>
    <div className="property-skeleton-tabs skeleton-block"/>
    <div className="property-skeleton-kpis">
      {[0,1,2,3].map(i=><div className="property-skeleton-kpi" key={i}><div className="skeleton-block"/><div className="skeleton-block"/><div className="skeleton-block"/></div>)}
    </div>
    <div className="property-skeleton-panels">
      <div className="property-skeleton-panel"><div className="skeleton-block"/><div className="skeleton-block"/><div className="skeleton-block"/></div>
      <div className="property-skeleton-panel"><div className="skeleton-block"/><div className="skeleton-block"/><div className="skeleton-block"/></div>
    </div>
  </div>;
  if(error || !property) return <div className="property-workspace"><Link href="/properties" className="property-back"><ArrowLeft size={16}/> Properties</Link><div className="card property-empty">{error || 'Property not found.'}</div></div>;

  return <div className="property-workspace">
    <Link href="/properties" className="property-back"><ArrowLeft size={16}/> Back to Properties</Link>

    <header className="property-workspace-header">
      <div className="property-title-block">
        {imageUrl ? <img src={imageUrl} alt="" className="property-workspace-image"/> : <div className="property-workspace-image property-image-placeholder"><Home size={28}/></div>}
        <div className="property-title-copy"><h1>{property.address}</h1><p>{property.city}, {property.state} {property.zip}</p><div className="property-meta"><span><Building2 size={14}/>{prettyPropertyType(property.property_type)}</span><span><Users size={14}/>{units.length} {units.length===1?'unit':'units'}</span>{units.length>0&&<span className={`property-occupancy-meta ${occupied===units.length?'full':occupied>0?'partial':'vacant'}`}><i/>{occupied}/{units.length} occupied</span>}{property.purchase_date&&<span><CalendarDays size={14}/>Purchased {formatDate(property.purchase_date)}</span>}</div><div className="property-header-actions"><button type="button" className="property-edit-inline" onClick={()=>setEditingProperty(true)}><PencilLine size={14}/> Edit property</button><Link href={`/ledger?property=${property.id}`} className="property-ledger-action">View ledger <ChevronRight size={14}/></Link></div></div>
      </div>
    </header>

    <nav className="property-subnav" aria-label="Property sections">{(['overview','improve','units','documents'] as Tab[]).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</nav>

    {tab==='overview' && <Overview property={property} units={units} transactions={transactions} documents={documents} expectedRent={expectedRent} metrics={metrics} onNavigate={setTab} onPropertyUpdated={patch=>setProperty(prev=>prev?({...prev,...patch} as Property):prev)}/>} 
    {tab==='improve' && <Improve property={property} units={units} transactions={transactions}/>} 
    {tab==='units' && <Units units={units} propertyId={property.id} onUnitsUpdated={next=>setUnits(next)} onLeaseSynced={async()=>{const d=await supabase.from('documents').select('*').eq('property_id',property.id).is('archived_at',null).order('created_at',{ascending:false});if(!d.error)setDocuments((d.data||[]) as PropertyDocument[]);}}/>} 
    {tab==='documents' && <Documents documents={documents} propertyId={property.id}/>} 
    {editingProperty&&<PropertyEditModal property={property} onClose={()=>setEditingProperty(false)} onSaved={patch=>{setProperty(prev=>prev?({...prev,...patch} as Property):prev);setEditingProperty(false);}}/>}
  </div>;
}

function Overview({property,units,transactions,documents,expectedRent,metrics,onNavigate,onPropertyUpdated}:{property:Property;units:Unit[];transactions:Tx[];documents:PropertyDocument[];expectedRent:number;metrics:ReturnType<typeof calculateMetrics>;onNavigate:(tab:Tab)=>void;onPropertyUpdated:(patch:Record<string,unknown>)=>void}){
  const [period,setPeriod]=useState<HistoryPeriod>('3M');
  const [mode,setMode]=useState<HistoryMode>('cashFlow');
  const history=useMemo(()=>buildMonthlyFinancialHistory(transactions,period,property.id),[transactions,period,property.id]);
  const current=history[history.length-1];
  const currentValue=mode==='cashFlow'?(current?.cashFlow||0):(current?.noi||0);
  const currentExpenses=mode==='cashFlow'?(current?.cashExpenses||0):(current?.operatingExpenses||0);
  const currentMonth=new Date().toISOString().slice(0,7);
  const collectedRent=transactions.filter(tx=>tx.transaction_date.startsWith(currentMonth)&&tx.type==='income'&&tx.category==='Rent'&&(tx.status||'posted')==='posted').reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0);
  const expenseRatio=metrics.income>0?metrics.operatingExpenses/metrics.income:0;
  const breakdown=buildBreakdown(transactions.filter(tx=>tx.status!=='declined'&&Number(tx.transaction_date.slice(0,4))===new Date().getFullYear()));
  const breakdownTotal=breakdown.reduce((sum,item)=>sum+item.amount,0);
  const pendingRent=transactions.filter(tx=>tx.status==='pending'&&tx.category==='Rent').length;
  const needsReview=transactions.filter(tx=>(tx.status||'posted')==='posted'&&(tx.needs_review||tx.category==='Needs Review')).length;
  const today=new Date();today.setHours(0,0,0,0);
  const leaseUnits=units as (Unit&{lease_end_date?:string|null})[];
  const nextLease=leaseUnits.filter(unit=>unit.lease_end_date).map(unit=>({unit,date:new Date(`${unit.lease_end_date}T12:00:00`)})).filter(item=>item.date>=today).sort((a,b)=>a.date.getTime()-b.date.getTime())[0];
  const leaseDays=nextLease?Math.ceil((nextLease.date.getTime()-today.getTime())/86400000):null;
  const actionCount=(pendingRent?1:0)+(needsReview?1:0)+(leaseDays!=null&&leaseDays<=90?1:0);

  return <div className="property-overview-pulse">
    <div className="property-overview-top">
      <section className="property-overview-chart-card">
        <div className="property-overview-chart-head"><div><span>Performance</span><h2>{mode==='cashFlow'?'Cash flow':'Net operating income'}</h2></div><div className="property-chart-modes" aria-label="Chart metric"><button className={mode==='cashFlow'?'active':''} onClick={()=>setMode('cashFlow')}>Cash flow</button><button className={mode==='noi'?'active':''} onClick={()=>setMode('noi')}>NOI</button></div></div>
        <div className="property-overview-summary"><span>{current?.periodLabel||'Current month'}</span><PerformanceAnimatedValue value={currentValue} animate/><div><b className="amount-positive">{formatCurrency(current?.income||0)} income</b><b className="amount-negative">−{formatCurrency(currentExpenses)} expenses</b></div></div>
        <FinancialHistoryChart rows={history} mode={mode} label={`Monthly ${mode==='cashFlow'?'cash flow':'net operating income'} and expenses for ${property.address}`}/>
        <div className="property-chart-periods" aria-label="Chart period">{(['3M','6M','9M','1Y'] as HistoryPeriod[]).map(value=><button key={value} className={period===value?'active':''} onClick={()=>setPeriod(value)}>{value}</button>)}</div>
      </section>
      <aside className="property-overview-actions">
        <div className="property-overview-actions-head"><div><span>Needs you</span><h2>Property Action Center</h2></div>{actionCount>0&&<em>{actionCount}</em>}</div>
        {actionCount?<div className="property-overview-action-list">
          {pendingRent>0&&<Link href={`/ledger?property=${property.id}`}><Banknote size={18}/><span><strong>Confirm rent</strong><small>{pendingRent} payment{pendingRent===1?'':'s'} waiting</small></span><ChevronRight size={16}/></Link>}
          {needsReview>0&&<Link href={`/ledger?property=${property.id}&review=1`}><ClipboardCheck size={18}/><span><strong>Review transactions</strong><small>{needsReview} need categorization</small></span><ChevronRight size={16}/></Link>}
          {leaseDays!=null&&leaseDays<=90&&<button type="button" onClick={()=>onNavigate('units')}><FileText size={18}/><span><strong>Lease ending</strong><small>{nextLease?.unit.unit_number||'Unit'} · {leaseDays} days left</small></span><ChevronRight size={16}/></button>}
        </div>:<div className="property-overview-all-clear"><strong>All clear</strong><span>No property tasks need attention.</span></div>}
      </aside>
    </div>

    <div className="property-overview-metrics" aria-label="Property metrics">
      <Kpi label="Expected rent" value={formatKpiCurrency(expectedRent)} sub="Monthly"/>
      <Kpi label="Collected rent" value={formatKpiCurrency(collectedRent)} sub="This month" tone="positive"/>
      <Kpi label="YTD NOI" value={formatKpiCurrency(metrics.noi)} sub="Before debt service" tone={metrics.noi>=0?'positive':'negative'}/>
      <Kpi label="Expense ratio" value={metrics.income?`${(expenseRatio*100).toFixed(1)}%`:'—'} sub="YTD" tone={metrics.income?(expenseRatio>=.7?'negative':expenseRatio>=.55?'warning':'positive'):undefined}/>
      <Kpi label="Mortgage balance" value={(property as any).mortgage_enabled===false?'—':formatKpiCurrency(Number(property.mortgage_balance||0))} sub={(property as any).mortgage_enabled===false?'No mortgage':'Current balance'}/>
    </div>

    <MortgageOverview property={property} onUpdated={onPropertyUpdated}/>
    <div className="property-overview-lower">
      <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">BREAKDOWN</div><h2>Operating expenses</h2></div><Link href={`/ledger?property=${property.id}`} className="property-text-action">View ledger <ChevronRight size={15}/></Link></div><div className="origin-breakdown">{breakdown.length?breakdown.map(item=><BreakdownRow key={item.category} item={item} total={breakdownTotal} propertyId={property.id}/>):<Empty text="No operating expenses recorded."/>}</div></section>
      <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">RECENT</div><h2>Transactions</h2></div><Link href={`/ledger?property=${property.id}`} className="property-text-action">View all <ChevronRight size={15}/></Link></div><div className="property-list">{transactions.slice(0,5).map(tx=><TransactionRow key={tx.id} tx={tx}/>)}{!transactions.length&&<Empty text="No transactions yet."/>}</div></section>
    </div>
    <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">DOCUMENTS</div><h2>Property paperwork</h2></div><button type="button" className="property-text-action" onClick={()=>onNavigate('documents')}>Open documents <ChevronRight size={15}/></button></div><div className="property-doc-summary"><FileText size={22}/><div><strong>{documents.length} {documents.length===1?'document':'documents'}</strong><span>Leases, insurance, registrations, invoices and property records.</span></div></div></section>
  </div>;
}

function MortgageOverview({property,onUpdated}:{property:Property;onUpdated:(patch:Record<string,unknown>)=>void}){
  const p=property as any;
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [editingProperty,setEditingProperty]=useState(false);
  const [form,setForm]=useState({hasMortgage:p.mortgage_enabled!==false,payment:String(Number(p.monthly_mortgage_payment||0)||''),balance:String(Number(p.mortgage_balance||0)||''),dueDay:String(Number(p.mortgage_due_day||1)),principal:String(Number(p.mortgage_principal_amount||0)||''),interest:String(Number(p.mortgage_interest_amount||0)||''),escrow:String(Number(p.mortgage_escrow_amount||0)||''),recurring:p.mortgage_recurring_enabled!==false});
  useEffect(()=>setForm({hasMortgage:p.mortgage_enabled!==false,payment:String(Number(p.monthly_mortgage_payment||0)||''),balance:String(Number(p.mortgage_balance||0)||''),dueDay:String(Number(p.mortgage_due_day||1)),principal:String(Number(p.mortgage_principal_amount||0)||''),interest:String(Number(p.mortgage_interest_amount||0)||''),escrow:String(Number(p.mortgage_escrow_amount||0)||''),recurring:p.mortgage_recurring_enabled!==false}),[property.id,p.mortgage_enabled,p.monthly_mortgage_payment,p.mortgage_balance,p.mortgage_principal_amount,p.mortgage_interest_amount,p.mortgage_escrow_amount,p.mortgage_recurring_enabled]);
  const payment=Math.max(0,Number(form.payment||0));
  const allocated=['principal','interest','escrow'].reduce((n,k)=>n+Math.max(0,Number((form as any)[k]||0)),0);
  const splitDifference=Math.abs(payment-allocated);
  const splitWithinRounding=payment>0&&allocated>0&&splitDifference<=0.020001;
  const complete=splitWithinRounding;
  async function save(){
    setSaving(true);setError('');
    // Lender statements can differ by a cent or two from a rounded payment entry.
    // When the entered split is within two cents, use the split total as the exact
    // recurring payment so future mortgage transactions balance perfectly.
    const normalizedPayment=splitWithinRounding?Number(allocated.toFixed(2)):Number(payment.toFixed(2));
    const patch=form.hasMortgage?{mortgage_enabled:true,monthly_mortgage_payment:normalizedPayment||0,mortgage_balance:Number(form.balance||0)||0,mortgage_due_day:Math.min(28,Math.max(1,Number(form.dueDay||1))),mortgage_recurring_enabled:form.recurring,mortgage_principal_amount:Number(form.principal||0)||null,mortgage_interest_amount:Number(form.interest||0)||null,mortgage_escrow_amount:Number(form.escrow||0)||null}:{mortgage_enabled:false,monthly_mortgage_payment:0,mortgage_balance:0,mortgage_recurring_enabled:false,mortgage_principal_amount:null,mortgage_interest_amount:null,mortgage_escrow_amount:null};
    const r=await supabase.from('properties').update(patch).eq('id',property.id);
    setSaving(false);
    if(r.error){setError(r.error.message);return;}
    if(form.hasMortgage&&splitWithinRounding&&normalizedPayment!==payment)setForm(prev=>({...prev,payment:normalizedPayment.toFixed(2)}));
    onUpdated(patch);setEditing(false);
  }
  return <section className={`card property-panel mortgage-overview-panel ${editing?'editing':'compact'}`}>
    <div className="property-panel-head"><div><div className="eyebrow">MORTGAGE</div><h2>Mortgage</h2></div>{editing&&<button type="button" className="property-secondary-action" onClick={()=>setEditing(false)}>Cancel</button>}</div>
    {!editing?<div className="mortgage-compact-status">
      <div className="mortgage-compact-copy"><strong>{!form.hasMortgage?'No mortgage':payment?`${formatKpiCurrency(payment)}/mo`:'Mortgage not set'}</strong>{form.hasMortgage&&<><span>{form.recurring?`Due day ${form.dueDay}`:'Recurring paused'}</span><span className={complete?'mortgage-status-ok':'mortgage-status-attention'}>{complete?'Split configured':'Split needs attention'}</span></>}</div>
      <button type="button" className="property-secondary-action mortgage-compact-manage" onClick={()=>setEditing(true)}>{form.hasMortgage?'Manage':'Add mortgage'}</button>
    </div>:
    <div className="mortgage-manage-form">
      <label className="mortgage-presence-toggle"><input type="checkbox" checked={form.hasMortgage} onChange={e=>setForm({...form,hasMortgage:e.target.checked})}/><span><strong>This property has a mortgage</strong><small>Turn this off for a cash-owned or paid-off property. You can add a mortgage later.</small></span></label>
      {form.hasMortgage&&<>
      <div className="mortgage-manage-grid three"><label>Monthly payment<input type="number" min="0" step="0.01" value={form.payment} onChange={e=>setForm({...form,payment:e.target.value})}/></label><label>Current mortgage balance<input type="number" min="0" step="0.01" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})}/></label><label>Due day<input type="number" min="1" max="28" step="1" value={form.dueDay} onChange={e=>setForm({...form,dueDay:e.target.value})}/></label></div>
      <div className="mortgage-split-title"><div><strong>Default payment split</strong><small>New recurring mortgage transactions inherit this breakdown.</small></div><span className={complete?'complete':''}>{formatCurrency(allocated)} / {formatCurrency(payment)}</span></div>
      <div className="mortgage-manage-grid three"><label>Principal<input type="number" min="0" step="0.01" value={form.principal} onChange={e=>setForm({...form,principal:e.target.value})}/></label><label>Interest<input type="number" min="0" step="0.01" value={form.interest} onChange={e=>setForm({...form,interest:e.target.value})}/></label><label>Escrow<input type="number" min="0" step="0.01" value={form.escrow} onChange={e=>setForm({...form,escrow:e.target.value})}/></label></div>
      <label className="mortgage-recurring-toggle"><input type="checkbox" checked={form.recurring} onChange={e=>setForm({...form,recurring:e.target.checked})}/><span><strong>Recurring monthly payment</strong><small>Create the mortgage transaction automatically each month.</small></span></label>
      </>}
      {error&&<div className="quick-add-error">{error}</div>}<div className="mortgage-manage-actions"><button type="button" className="quick-add-submit" disabled={saving} onClick={save}>{saving?'Saving…':'Save mortgage'}</button></div>
    </div>}
  </section>;
}

type PerformancePeriod='3M'|'YTD'|'1Y'|'ALL';
type PerformanceMode='cashFlow'|'incomeExpenses'|'noi';

function Performance({transactions,propertyId}:{transactions:Tx[];years:number[];propertyId:string}){
  const now=new Date();
  const [period,setPeriod]=useState<PerformancePeriod>('YTD');
  const [mode,setMode]=useState<PerformanceMode>('cashFlow');
  const [inspected,setInspected]=useState<{label:string;value:number}|null>(null);
  const range=useMemo(()=>getPerformanceRange(period,transactions,now),[period,transactions]);
  const previousRange=useMemo(()=>getPreviousEqualRange(range),[range.start.getTime(),range.end.getTime()]);
  const rows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&inRange(t.transaction_date,range.start,range.end)),[transactions,range.start.getTime(),range.end.getTime()]);
  const priorRows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&inRange(t.transaction_date,previousRange.start,previousRange.end)),[transactions,previousRange.start.getTime(),previousRange.end.getTime()]);
  const metrics=useMemo(()=>calculateMetrics(rows),[rows]);
  const priorMetrics=useMemo(()=>calculateMetrics(priorRows),[priorRows]);
  const monthly=useMemo(()=>buildPerformanceMonths(rows,range.start,range.end),[rows,range.start.getTime(),range.end.getTime()]);
  const breakdown=useMemo(()=>buildBreakdown(rows),[rows]);
  const breakdownTotal=breakdown.reduce((sum,item)=>sum+item.amount,0);
  const expenseRatio=metrics.income>0?metrics.operatingExpenses/metrics.income:0;
  const cashDelta=metrics.cashFlow-priorMetrics.cashFlow;
  const elapsed=Math.max(1,(range.end.getTime()-range.start.getTime())/86400000+1);
  const yearDays=((now.getFullYear()%4===0&&now.getFullYear()%100!==0)||now.getFullYear()%400===0)?366:365;
  const projection=period==='YTD'?metrics.cashFlow/elapsed*yearDays:null;
  const bestMonth=monthly.reduce((best,row)=>!best||row.cashFlow>best.cashFlow?row:best,monthly[0]);
  const expenseMonth=monthly.reduce((highest,row)=>!highest||row.cashExpenses>highest.cashExpenses?row:highest,monthly[0]);
  const modeValue=mode==='cashFlow'?metrics.cashFlow:mode==='noi'?metrics.noi:metrics.income;
  const priorModeValue=mode==='cashFlow'?priorMetrics.cashFlow:mode==='noi'?priorMetrics.noi:priorMetrics.income;
  const heroDelta=modeValue-priorModeValue;
  const heroPct=pctChange(modeValue,priorModeValue);
  const displayValue=inspected?.value??modeValue;
  const heroLabel=inspected?inspected.label:mode==='cashFlow'?`${period==='ALL'?'All-time':period} cash flow after mortgage`:mode==='noi'?`${period==='ALL'?'All-time':period} NOI`:`${period==='ALL'?'All-time':period} gross income`;

  useEffect(()=>setInspected(null),[period,mode]);

  return <div className="performance-pulse">
    <section className="performance-pulse-primary">
      <div className="performance-pulse-head">
        <div className="performance-pulse-hero"><span>{heroLabel}</span><PerformanceAnimatedValue value={displayValue} animate={!inspected}/>{!inspected&&(priorRows.length?<div className={`performance-pulse-change ${heroDelta>=0?'positive':'negative'}`}>{heroDelta>=0?'↑':'↓'} {formatCurrency(Math.abs(heroDelta))}{heroPct!=null?` (${Math.abs(heroPct).toFixed(1)}%)`:''} <em>vs previous period</em></div>:<div className="performance-pulse-change neutral">No prior-period data yet</div>)}{!inspected&&projection!=null&&mode==='cashFlow'&&<p>On pace for <strong>{formatKpiCurrency(projection)}</strong> this year at the current recorded pace.</p>}</div>
        <div className="performance-pulse-periods" aria-label="Performance period">{(['3M','YTD','1Y','ALL'] as PerformancePeriod[]).map(value=><button key={value} className={period===value?'active':''} onClick={()=>setPeriod(value)}>{value==='ALL'?'All':value}</button>)}</div>
      </div>
      <div className="performance-pulse-modes" aria-label="Chart view"><button className={mode==='cashFlow'?'active':''} onClick={()=>setMode('cashFlow')}>Cash flow</button><button className={mode==='incomeExpenses'?'active':''} onClick={()=>setMode('incomeExpenses')}>Income & expenses</button><button className={mode==='noi'?'active':''} onClick={()=>setMode('noi')}>NOI</button></div>
      <PerformancePulseChart rows={monthly} mode={mode} onInspect={setInspected}/>
    </section>

    <section className="performance-pulse-kpis" aria-label="Supporting performance metrics">
      <PerformanceMetric label="Gross income" value={formatKpiCurrency(metrics.income)} change={pctChange(metrics.income,priorMetrics.income)}/>
      <PerformanceMetric label="Operating expenses" value={formatKpiCurrency(metrics.operatingExpenses)} change={pctChange(metrics.operatingExpenses,priorMetrics.operatingExpenses)} inverse/>
      <PerformanceMetric label="NOI" value={formatKpiCurrency(metrics.noi)} change={pctChange(metrics.noi,priorMetrics.noi)}/>
      <PerformanceMetric label="Expense ratio" value={`${(expenseRatio*100).toFixed(1)}%`} tone={expenseRatio>=.7?'negative':expenseRatio>=.55?'warning':'positive'}/>
    </section>

    <section className="performance-pulse-highlights">
      <div><span>Best month</span><strong>{bestMonth?.fullLabel||'No data'}</strong><p>{bestMonth?`${formatCurrency(bestMonth.cashFlow)} cash flow`:'Add transactions to see a trend.'}</p></div>
      <div><span>Highest expense month</span><strong>{expenseMonth?.fullLabel||'No data'}</strong><p>{expenseMonth?`${formatCurrency(expenseMonth.cashExpenses)} cash expenses`:'No expenses recorded.'}</p></div>
      <div><span>Period trend</span><strong>{priorRows.length?(cashDelta>=0?'Cash flow improved':'Cash flow declined'):'Building a baseline'}</strong><p>{priorRows.length?`${formatCurrency(Math.abs(cashDelta))} ${cashDelta>=0?'better':'lower'} than the previous period.`:'More history is needed for a real comparison.'}</p></div>
    </section>

    <section className="performance-pulse-breakdown">
      <div className="performance-pulse-breakdown-head"><div><span>Breakdown</span><h2>Operating expenses</h2></div><Link href={`/ledger?property=${propertyId}`}>View ledger →</Link></div>
      <div className="origin-breakdown">{breakdown.length?breakdown.map(item=><BreakdownRow key={item.category} item={item} total={breakdownTotal} propertyId={propertyId}/>):<Empty text="No operating expenses recorded."/>}</div>
    </section>
  </div>;
}


function Improve({property,units,transactions}:{property:Property;units:Unit[];transactions:Tx[]}){
  const now=new Date();
  const year=now.getFullYear();
  const monthsElapsed=Math.max(1,now.getMonth()+1);
  const rows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&Number(t.transaction_date.slice(0,4))===year),[transactions,year]);
  const metrics=useMemo(()=>calculateMetrics(rows),[rows]);
  const breakdown=useMemo(()=>buildBreakdown(rows),[rows]);
  const occupiedUnits=units.filter(u=>u.occupied);
  const expectedRent=occupiedUnits.reduce((sum,u)=>sum+Number(u.current_rent||0),0);
  const currentMonthly=metrics.cashFlow/monthsElapsed;
  const currentMgmt=Math.max(0,Number(property.management_fee_percent||0));
  const maintenanceYtd=breakdown.filter(x=>x.key==='maintenance').reduce((sum,x)=>sum+x.amount,0);
  const managementYtd=breakdown.filter(x=>x.key==='management'||x.key==='leasing').reduce((sum,x)=>sum+x.amount,0);
  const utilitiesYtd=breakdown.filter(x=>x.key==='utilities').reduce((sum,x)=>sum+x.amount,0);
  const otherOperatingYtd=Math.max(0,metrics.operatingExpenses-maintenanceYtd-managementYtd-utilitiesYtd);
  const maintenanceMonthly=maintenanceYtd/monthsElapsed;
  const otherOperatingMonthly=(utilitiesYtd+otherOperatingYtd)/monthsElapsed;

  const [rentIncrease,setRentIncrease]=useState(0);
  const [managementTarget,setManagementTarget]=useState(currentMgmt);
  const [maintenanceReduction,setMaintenanceReduction]=useState(0);
  const [otherReduction,setOtherReduction]=useState(0);

  const rentGain=occupiedUnits.length*rentIncrease;
  const managementGain=expectedRent*Math.max(0,currentMgmt-managementTarget)/100;
  const maintenanceGain=maintenanceMonthly*maintenanceReduction/100;
  const otherGain=otherOperatingMonthly*otherReduction/100;
  const projected=currentMonthly+rentGain+managementGain+maintenanceGain+otherGain;
  const currentMonthlyIncome=metrics.income/monthsElapsed;
  const currentMonthlyOperatingExpenses=metrics.operatingExpenses/monthsElapsed;
  const projectedMonthlyIncome=currentMonthlyIncome+rentGain;
  const projectedMonthlyOperatingExpenses=Math.max(0,currentMonthlyOperatingExpenses-managementGain-maintenanceGain-otherGain);
  const projectedMonthlyNoi=projectedMonthlyIncome-projectedMonthlyOperatingExpenses;
  const projectedExpenseRatio=projectedMonthlyIncome>0?projectedMonthlyOperatingExpenses/projectedMonthlyIncome:0;
  const currentExpenseRatio=metrics.income>0?metrics.operatingExpenses/metrics.income:0;
  const monthlyDebtService=Math.max(0,Number(property.monthly_mortgage_payment||0));
  const projectedDscr=monthlyDebtService>0?projectedMonthlyNoi/monthlyDebtService:null;

  const suggestedRent=occupiedUnits.length?50:0;
  const suggestedMgmt=currentMgmt>6?Math.max(0,currentMgmt-1):currentMgmt;
  const suggestedMaintenance=maintenanceMonthly>0?20:0;
  const suggestedOther=otherOperatingMonthly>0?10:0;
  const suggestedGain=occupiedUnits.length*suggestedRent + expectedRent*Math.max(0,currentMgmt-suggestedMgmt)/100 + maintenanceMonthly*suggestedMaintenance/100 + otherOperatingMonthly*suggestedOther/100;
  const suggestedProjected=currentMonthly+suggestedGain;

  // Scenario bar visualizes progress from the current run rate toward the
  // best-case scenario available from the four controls. It must grow as
  // cash flow improves, rather than shrinking as the projected value rises.
  const maxScenarioGain=
    occupiedUnits.length*250 +
    expectedRent*Math.max(0,currentMgmt)/100 +
    maintenanceMonthly*.50 +
    otherOperatingMonthly*.30;
  const scenarioGain=Math.max(0,projected-currentMonthly);
  const scenarioProgress=maxScenarioGain>0
    ? Math.max(0,Math.min(1,scenarioGain/maxScenarioGain))
    : 0;
  const projectionFillPct=16 + scenarioProgress*84;

  const opportunities=[
    maintenanceMonthly>0?{key:'maintenance',title:'Reduce recurring maintenance',detail:`${formatKpiCurrency(maintenanceYtd)} recorded YTD`,potential:maintenanceMonthly*.20,status:'Available now',icon:<Wrench size={18}/>,tone:'maintenance'}:null,
    currentMgmt>0&&expectedRent>0?{key:'management',title:'Review management cost',detail:`Current rate ${currentMgmt.toFixed(currentMgmt%1?1:0)}% of collected rent`,potential:expectedRent*.01,status:'Investigate',icon:<ClipboardCheck size={18}/>,tone:'management'}:null,
    occupiedUnits.length?{key:'rent',title:'Plan the next rent review',detail:`${occupiedUnits.length} occupied ${occupiedUnits.length===1?'unit':'units'} · change only when allowed`,potential:occupiedUnits.length*50,status:'At renewal',icon:<LockKeyhole size={18}/>,tone:'rent'}:null,
    otherOperatingMonthly>0?{key:'other',title:'Trim controllable operating costs',detail:`${formatKpiCurrency(utilitiesYtd+otherOperatingYtd)} recorded YTD`,potential:otherOperatingMonthly*.10,status:'Investigate',icon:<Gauge size={18}/>,tone:'neutral'}:null,
  ].filter(Boolean).sort((a:any,b:any)=>b.potential-a.potential) as {key:string;title:string;detail:string;potential:number;status:string;icon:React.ReactNode;tone:string}[];

  return <div className="improve-page">
    <section className="improve-hero">
      <div className="improve-hero-copy"><span className="improve-eyebrow">PROPERTY PLAN</span><h2>Improve this property</h2><p>Focus on the few changes that can actually move cash flow. Rent changes are treated as renewal decisions, not something you can change today.</p></div>
      <div className="improve-hero-metrics">
        <div><span>Current monthly cash flow</span><strong className={currentMonthly>=0?'amount-positive':'amount-negative'}>{formatKpiCurrency(currentMonthly)}</strong><small>YTD monthly average</small></div>
        <div><span>Scenario cash flow</span><strong className={projected>=currentMonthly?'amount-positive':'amount-negative'}>{formatKpiCurrency(projected)}</strong><small>Based on your changes</small></div>
        <div><span>Operating expense ratio</span><strong className={projectedExpenseRatio<=currentExpenseRatio?'amount-positive':''}>{projectedMonthlyIncome>0?`${(projectedExpenseRatio*100).toFixed(1)}%`:'—'}</strong><small>{metrics.income>0?`${(currentExpenseRatio*100).toFixed(1)}% current`:'No income recorded'}</small></div>
      </div>
    </section>

    <section className="improve-planner">
      <div className="improve-section-head"><div><span className="improve-eyebrow">WHAT IF</span><h3>Build a better scenario</h3><p>Adjust only the levers you could realistically influence.</p></div></div>
      <div className="improve-levers">
        <ImproveLever label="Rent at next renewal" displayValue={rentIncrease?`+${formatKpiCurrency(rentIncrease)} / unit`:'No change'} meta={occupiedUnits.length?`${occupiedUnits.length} occupied ${occupiedUnits.length===1?'unit':'units'} · locked until renewal`:'No occupied units'} min={0} max={250} step={25} rangeValue={rentIncrease} onChange={setRentIncrease} status="At renewal"/>
        <ImproveLever label="Management fee" displayValue={`${managementTarget.toFixed(managementTarget%1?1:0)}%`} meta={currentMgmt?`Current ${currentMgmt.toFixed(currentMgmt%1?1:0)}% · scenario savings ${formatKpiCurrency(managementGain)}/mo`:'No management fee recorded'} min={0} max={Math.max(12,currentMgmt)} step={0.5} rangeValue={managementTarget} onChange={setManagementTarget} status="Investigate" disabled={!currentMgmt}/>
        <ImproveLever label="Maintenance" displayValue={maintenanceReduction?`−${maintenanceReduction}%`:'Current run rate'} meta={maintenanceMonthly?`${formatKpiCurrency(maintenanceMonthly)}/mo YTD average`:'No maintenance recorded YTD'} min={0} max={50} step={5} rangeValue={maintenanceReduction} onChange={setMaintenanceReduction} status="Available now" disabled={!maintenanceMonthly}/>
        <ImproveLever label="Other operating costs" displayValue={otherReduction?`−${otherReduction}%`:'Current run rate'} meta={otherOperatingMonthly?`${formatKpiCurrency(otherOperatingMonthly)}/mo YTD average`:'No other controllable costs recorded'} min={0} max={30} step={5} rangeValue={otherReduction} onChange={setOtherReduction} status="Investigate" disabled={!otherOperatingMonthly}/>
      </div>
      <div className="improve-projection-bar"><div><span>Current</span><strong>{formatKpiCurrency(currentMonthly)}</strong></div><i><b style={{width:`${projectionFillPct}%`,insetInlineStart:0,insetInlineEnd:'auto'}}/></i><div><span>Scenario</span><strong>{formatKpiCurrency(projected)}</strong></div></div>
      <div className="improve-impact-strip">
        <div><span>Cash flow</span><strong>{formatKpiCurrency(currentMonthly)} <small>→</small> {formatKpiCurrency(projected)}/mo</strong></div>
        <div><span>NOI</span><strong>{formatKpiCurrency(metrics.noi/monthsElapsed)} <small>→</small> {formatKpiCurrency(projectedMonthlyNoi)}/mo</strong></div>
        <div><span>OpEx ratio</span><strong>{metrics.income>0?`${(currentExpenseRatio*100).toFixed(1)}%`:'—'} <small>→</small> {projectedMonthlyIncome>0?`${(projectedExpenseRatio*100).toFixed(1)}%`:'—'}</strong></div>
        <div><span>DSCR</span><strong>{projectedDscr===null?'—':`${projectedDscr.toFixed(2)}×`}</strong><small>{projectedDscr===null?'No debt service recorded':'Scenario coverage'}</small></div>
      </div>
    </section>

    <section className="improve-opportunities-section">
      <div className="improve-section-head"><div><span className="improve-eyebrow">OPPORTUNITIES</span><h3>Best places to look first</h3></div><span className="improve-count">{Math.min(opportunities.length,3)} identified</span></div>
      <div className="improve-opportunity-list">{opportunities.slice(0,3).map((o,i)=><div className="improve-opportunity" key={o.key}>
        <div className={`improve-opportunity-icon ${o.tone}`}>{o.icon}</div>
        <div className="improve-opportunity-copy"><div className="improve-opportunity-title"><span>{String(i+1).padStart(2,'0')}</span><strong>{o.title}</strong></div><p>{o.detail}</p><span className={`improve-status ${o.status==='Available now'?'available':o.status==='At renewal'?'renewal':'investigate'}`}>{o.status}</span></div>
        <div className="improve-potential"><strong>+{formatKpiCurrency(o.potential)}</strong><span>potential / mo</span></div>
      </div>)}</div>
    </section>

    <section className="improve-path">
      <div className="improve-path-header"><div><span className="improve-eyebrow">A REALISTIC PATH</span><h3>Start here</h3></div><div><span>Projected</span><strong>{formatKpiCurrency(suggestedProjected)}/mo</strong></div></div>
      <div className="improve-path-steps">
        {suggestedMaintenance>0&&<ImprovePathStep number="1" title={`Reduce maintenance run rate ${suggestedMaintenance}%`} impact={maintenanceMonthly*suggestedMaintenance/100} note="Available now · focus on repeat repairs and vendor pricing"/>}
        {currentMgmt>suggestedMgmt&&<ImprovePathStep number="2" title={`Test a ${suggestedMgmt.toFixed(suggestedMgmt%1?1:0)}% management rate`} impact={expectedRent*(currentMgmt-suggestedMgmt)/100} note="Investigate · use when renegotiating or comparing managers"/>}
        {suggestedRent>0&&<ImprovePathStep number="3" title={`Model +${formatKpiCurrency(suggestedRent)} per occupied unit`} impact={occupiedUnits.length*suggestedRent} note="At renewal only · validate against market rent first"/>}
        {suggestedOther>0&&<ImprovePathStep number="4" title={`Reduce other controllable costs ${suggestedOther}%`} impact={otherOperatingMonthly*suggestedOther/100} note="Investigate utilities, services and recurring charges"/>}
      </div>
      <div className="improve-path-footer"><p>This path could improve monthly cash flow by about <strong>{formatKpiCurrency(suggestedGain)}/mo</strong>, based on current YTD run rates.</p><span>Scenario estimates use recorded YTD data. Validate rent, vendor and financing assumptions before acting.</span></div>
    </section>
  </div>;
}

function rangeTrack(value:number,min:number,max:number){
  const pct=max<=min?0:Math.max(0,Math.min(100,((value-min)/(max-min))*100));
  return { '--range-fill': `${pct}%` } as React.CSSProperties;
}
function ImproveLever({label,displayValue,meta,min,max,step,rangeValue,onChange,status,disabled}:{label:string;displayValue:string;meta:string;min:number;max:number;step:number;rangeValue:number;onChange:(v:number)=>void;status:string;disabled?:boolean}){
  return <div className={`improve-lever ${disabled?'disabled':''}`}><div className="improve-lever-top"><div><strong>{label}</strong><span>{meta}</span></div><div><b>{displayValue}</b><small>{status}</small></div></div><input className="improve-range" aria-label={label} type="range" min={min} max={max} step={step} value={rangeValue} style={rangeTrack(rangeValue,min,max)} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/></div>;
}
function ImprovePathStep({number,title,impact,note}:{number:string;title:string;impact:number;note:string}){return <div className="improve-path-step"><span className="improve-step-number">{number}</span><div><strong>{title}</strong><p>{note}</p></div><b>+{formatKpiCurrency(impact)}<small>/mo</small></b></div>}

function Units({units,propertyId,onUnitsUpdated,onLeaseSynced}:{units:Unit[];propertyId:string;onUnitsUpdated:(units:Unit[])=>void;onLeaseSynced:()=>void|Promise<void>}){
  const [editingUnitId,setEditingUnitId]=useState<string|null>(null);
  const editingUnit=(units.find(u=>u.id===editingUnitId)||null) as any;
  const handleSaved=(unitId:string,patch:Record<string,unknown>)=>{ onUnitsUpdated(units.map(u=>u.id===unitId?({...u,...patch} as Unit):u)); setEditingUnitId(null); };
  return <>
    <section className="property-tab-panel units-directory-panel">
      <div className="property-panel-head"><div><h2>Units & tenants</h2></div></div>
      {!units.length?<Empty text="No units yet."/>:<div className="units-directory-list">
        {units.map((rawUnit,index)=>{
          const unit=rawUnit as any;
          const lease=leaseStatus(unit.lease_start_date,unit.lease_end_date,unit.occupied);
          const hasLease=Boolean(unit.lease_document_path);
          const hasLeaseDates=Boolean(unit.lease_start_date&&unit.lease_end_date);
          return <article className="card unit-directory-item" key={unit.id}>
            <div className="unit-directory-head">
              <div className="unit-directory-identity">
                <div className="unit-directory-title-row">
                  <h3>{unit.unit_number||`Unit ${index+1}`}</h3>
                  <span className={unit.occupied?'unit-status occupied':'unit-status vacant'}>{unit.occupied?'Occupied':'Vacant'}</span>
                </div>
                <p>{unit.tenant_name||'No tenant assigned'}</p>
              </div>
              <button type="button" className="property-secondary-action unit-edit-action" onClick={()=>setEditingUnitId(unit.id)}>Edit unit</button>
            </div>

            <div className="unit-core-facts">
              <div><span className="unit-fact-label">Rent</span><strong>{formatKpiCurrency(Number(unit.current_rent||0))}/mo</strong></div>
              <div><span className="unit-fact-label">Layout</span><strong>{unit.bedroom_count||0} bd · {unit.bathroom_count||0} ba</strong></div>
              <div><span className="unit-fact-label">Size</span><strong>{Number(unit.sqft||0).toLocaleString()} sqft</strong></div>
            </div>

            <div className={`unit-lease-summary ${lease.tone}`}>
              <CalendarDays size={17}/>
              <span>Lease</span>
              <strong>{hasLeaseDates?`${longDate(unit.lease_start_date)} → ${longDate(unit.lease_end_date)}`:unit.occupied?'Dates not set':'No active lease'}</strong>
              {unit.occupied&&lease.short&&lease.short!=='Not set'&&lease.short!=='Vacant'?<small className={`lease-state-badge ${lease.tone}`}>{lease.short}</small>:null}
            </div>

            <div className={`unit-document-state ${hasLease?'uploaded':'missing'}`}>
              <div className="unit-document-state-main">
                <FileText size={17}/>
                <strong>{hasLease?'Lease uploaded':'No lease uploaded'}</strong>
              </div>
              <div className="unit-document-actions">{hasLease?<LeaseViewButton path={unit.lease_document_path}/>:<button type="button" className="property-secondary-action" onClick={()=>setEditingUnitId(unit.id)}>Upload lease</button>}</div>
            </div>
          </article>;
        })}
      </div>}
    </section>
    {editingUnit&&<UnitEditModal unit={editingUnit} propertyId={propertyId} onClose={()=>setEditingUnitId(null)} onSaved={(patch)=>handleSaved(editingUnit.id,patch)} onLeaseSynced={onLeaseSynced}/>}
  </>;
}

function PropertyEditModal({property,onClose,onSaved}:{property:Property;onClose:()=>void;onSaved:(patch:Record<string,unknown>)=>void}){
  const p=property as any;
  const [form,setForm]=useState({address:p.address||'',city:p.city||'',state:p.state||'',zip:p.zip||'',property_type:p.property_type||'duplex',purchase_price:String(p.purchase_price||''),purchase_date:p.purchase_date||''});
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');const patch={address:form.address.trim(),city:form.city.trim(),state:form.state.trim(),zip:form.zip.trim(),property_type:form.property_type,purchase_price:form.purchase_price?Number(form.purchase_price):null,purchase_date:form.purchase_date||null};const r=await supabase.from('properties').update(patch).eq('id',property.id);setSaving(false);if(r.error){setError(r.error.message);return;}onSaved(patch);};
  return <div className="workspace-modal-overlay"><div className="workspace-modal property-edit-modal"><div className="workspace-modal-head"><div><div className="eyebrow">PROPERTY</div><h2>Edit property</h2></div><button type="button" className="workspace-modal-close" onClick={onClose}>×</button></div>{error&&<div className="workspace-form-error">{error}</div>}<form onSubmit={save} className="workspace-form"><div className="workspace-form-grid two"><label>Address<input required value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><label>Property type<select value={form.property_type} onChange={e=>setForm({...form,property_type:e.target.value})}><option value="duplex">Duplex</option><option value="single_family">Single family</option><option value="triplex">Triplex</option><option value="multi_unit">Multi-unit</option></select></label></div><div className="workspace-form-grid three"><label>City<input required value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>State<input required value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/></label><label>ZIP<input required value={form.zip} onChange={e=>setForm({...form,zip:e.target.value})}/></label></div><div className="workspace-form-grid two"><label>Purchase price<input type="number" min="0" step="0.01" value={form.purchase_price} onChange={e=>setForm({...form,purchase_price:e.target.value})}/></label><label>Purchase date<input type="date" value={form.purchase_date} onChange={e=>setForm({...form,purchase_date:e.target.value})}/></label></div><div className="workspace-modal-footer"><button type="button" className="property-secondary-action" onClick={onClose}>Cancel</button><button disabled={saving} className="workspace-primary-button">{saving?'Saving…':'Save property'}</button></div></form></div></div>;
}

function UnitEditModal({unit,propertyId,onClose,onSaved,onLeaseSynced}:{unit:any;propertyId:string;onClose:()=>void;onSaved:(patch:Record<string,unknown>)=>void;onLeaseSynced:()=>void|Promise<void>}){
  const [form,setForm]=useState({unit_number:unit.unit_number||'',tenant_name:unit.tenant_name||'',current_rent:String(Number(unit.current_rent||0)||''),bedroom_count:String(unit.bedroom_count??''),bathroom_count:String(unit.bathroom_count??''),sqft:String(unit.sqft??''),occupied:Boolean(unit.occupied),lease_start_date:unit.lease_start_date||'',lease_end_date:unit.lease_end_date||''});
  const [file,setFile]=useState<File|null>(null); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const save=async(e:React.FormEvent)=>{
    e.preventDefault(); setSaving(true); setError('');
    let leasePath=unit.lease_document_path||null;
    try{
      const auth=await supabase.auth.getUser(); const user=auth.data.user;
      if(!user)throw new Error('You need to be signed in.');
      let uploadedDoc:{storagePath:string;fileName:string;mimeType:string|null;fileSize:number}|null=null;
      if(file){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
        const storagePath=`${user.id}/${propertyId}/${unit.id}/${Date.now()}-${safe}`;
        const upload=await supabase.storage.from('property-documents').upload(storagePath,file,{upsert:false,contentType:file.type||undefined});
        if(upload.error)throw upload.error;
        leasePath=`${LEASE_DOC_PREFIX}${storagePath}`;
        uploadedDoc={storagePath,fileName:file.name,mimeType:file.type||null,fileSize:file.size};
      }
      const patch={unit_number:form.unit_number.trim(),tenant_name:form.tenant_name.trim(),current_rent:form.current_rent?Number(form.current_rent):0,bedroom_count:form.bedroom_count?Number(form.bedroom_count):0,bathroom_count:form.bathroom_count?Number(form.bathroom_count):0,sqft:form.sqft?Number(form.sqft):0,occupied:form.occupied,lease_start_date:form.lease_start_date||null,lease_end_date:form.lease_end_date||null,lease_document_path:leasePath};
      const r=await supabase.from('units').update(patch).eq('id',unit.id); if(r.error)throw r.error;
      if(uploadedDoc){
        const exact=await supabase.from('documents').select('id').eq('property_id',propertyId).eq('storage_path',uploadedDoc.storagePath).is('archived_at',null).limit(1).maybeSingle();
        const byUnit=exact.data?.id?{data:null,error:null}:await supabase.from('documents').select('id').eq('property_id',propertyId).eq('unit_id',unit.id).eq('category','Lease').is('archived_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
        const existingId=exact.data?.id||byUnit.data?.id||null;
        const docPatch={user_id:user.id,property_id:propertyId,unit_id:unit.id,category:'Lease',title:`${patch.unit_number||'Unit'} Lease${patch.tenant_name?` · ${patch.tenant_name}`:''}`,file_name:uploadedDoc.fileName,storage_path:uploadedDoc.storagePath,mime_type:uploadedDoc.mimeType,file_size:uploadedDoc.fileSize,document_date:patch.lease_start_date,expires_at:patch.lease_end_date,reminder_days:60,notes:patch.tenant_name?`Signed lease for ${patch.tenant_name}`:null,archived_at:null};
        const docSave=existingId?await supabase.from('documents').update(docPatch).eq('id',existingId):await supabase.from('documents').insert(docPatch);
        if(docSave.error)throw new Error(`Unit saved, but the lease could not be added to Documents: ${docSave.error.message}`);
        await onLeaseSynced();
      }
      onSaved(patch);
    }catch(err:any){setError(err?.message||'Could not save unit.');}finally{setSaving(false);}
  };
  return <div className="workspace-modal-overlay"><div className="workspace-modal unit-edit-modal"><div className="workspace-modal-head"><div><div className="eyebrow">UNIT</div><h2>Edit {unit.unit_number||'unit'}</h2></div><button type="button" className="workspace-modal-close" onClick={onClose}>×</button></div>{error&&<div className="workspace-form-error">{error}</div>}<form onSubmit={save} className="workspace-form"><div className="workspace-form-grid two"><label>Unit name / number<input required value={form.unit_number} onChange={e=>setForm({...form,unit_number:e.target.value})}/></label><label>Monthly rent<input type="number" min="0" step="0.01" value={form.current_rent} onChange={e=>setForm({...form,current_rent:e.target.value})}/></label></div><label>Tenant<input value={form.tenant_name} onChange={e=>setForm({...form,tenant_name:e.target.value})}/></label><label className="workspace-checkbox"><input type="checkbox" checked={form.occupied} onChange={e=>setForm({...form,occupied:e.target.checked})}/><span>Occupied</span></label><div className="workspace-form-grid two"><label>Lease start<input type="date" value={form.lease_start_date} onChange={e=>setForm({...form,lease_start_date:e.target.value})}/></label><label>Lease end<input type="date" value={form.lease_end_date} onChange={e=>setForm({...form,lease_end_date:e.target.value})}/></label></div><div className="workspace-form-grid three"><label>Bedrooms<input type="number" min="0" step="1" value={form.bedroom_count} onChange={e=>setForm({...form,bedroom_count:e.target.value})}/></label><label>Bathrooms<input type="number" min="0" step="0.5" value={form.bathroom_count} onChange={e=>setForm({...form,bathroom_count:e.target.value})}/></label><label>Sqft<input type="number" min="0" step="1" value={form.sqft} onChange={e=>setForm({...form,sqft:e.target.value})}/></label></div><label className="workspace-file-field"><span>Lease document</span><input type="file" accept="application/pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?file.name:unit.lease_document_path?'Current lease will be kept unless you choose a replacement.':'Upload the signed lease or lease PDF.'}</small></label><div className="workspace-modal-footer"><button type="button" className="property-secondary-action" onClick={onClose}>Cancel</button><button disabled={saving} className="workspace-primary-button">{saving?'Saving…':'Save unit'}</button></div></form></div></div>;
}

function LeaseViewButton({path}:{path:string}){const [opening,setOpening]=useState(false);const open=async()=>{setOpening(true);const ref=leaseStorageRef(path);const r=await supabase.storage.from(ref.bucket).createSignedUrl(ref.path,120);setOpening(false);if(r.data?.signedUrl)window.open(r.data.signedUrl,'_blank','noopener,noreferrer');};return <button type="button" className="property-secondary-action" disabled={opening} onClick={open}>{opening?'Opening…':'View lease'}</button>}

function leaseStatus(start?:string|null,end?:string|null,occupied?:boolean){if(!occupied)return{label:'Vacant',short:'Vacant',tone:'neutral'};if(!end)return{label:'Lease dates not set',short:'Not set',tone:'neutral'};const today=new Date();today.setHours(0,0,0,0);const endDate=new Date(`${end.slice(0,10)}T12:00:00`);const days=Math.ceil((endDate.getTime()-today.getTime())/86400000);if(days<0)return{label:`Lease expired ${Math.abs(days)} days ago`,short:'Expired',tone:'danger'};if(days===0)return{label:'Lease ends today',short:'Ends today',tone:'warning'};if(days<=60)return{label:`Lease ends in ${days} days`,short:`${days} days left`,tone:'warning'};return{label:`${days} days remaining on lease`,short:`${days} days left`,tone:'good'};}
function shortDate(value:string){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});}
function longDate(value:string){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

function Documents({documents,propertyId}:{documents:PropertyDocument[];propertyId:string}){ return <section className="card property-panel property-tab-panel"><div className="property-panel-head"><div><div className="eyebrow">DOCUMENTS</div><h2>Property documents</h2></div><Link href={`/ledger?tab=documents&property=${propertyId}`} className="property-secondary-action">Manage documents</Link></div><div className="property-document-list">{documents.length?documents.map(d=><div className="property-document-row" key={d.id}><div className="property-document-icon"><FileText size={18}/></div><div><strong>{d.title||d.file_name}</strong><span>{d.category}{d.expires_at?` · Expires ${formatDate(d.expires_at)}`:''}</span></div></div>):<Empty text="No documents uploaded for this property."/>}</div></section>; }

function Kpi({label,value,sub,tone,change,changeLabel,inverse,status}:{label:string;value:string;sub?:string;tone?:'positive'|'negative'|'warning';change?:number|null;changeLabel?:string;inverse?:boolean;status?:string}){ const good=change!=null?(inverse?change<=0:change>=0):tone==='positive'; return <div className="metric-cell property-metric"><span>{label}</span><strong className={tone?`kpi-${tone}`:''}>{value}</strong>{status?<small className={`kpi-status kpi-status-${tone||'neutral'}`}><b>{status}</b><em>{sub||changeLabel||''}</em></small>:change!=null&&Number.isFinite(change)?<small className={good?'change-good':'change-bad'}>{change>=0?'↑':'↓'} {Math.abs(change).toFixed(1)}% <em>{changeLabel}</em></small>:<small>{sub||changeLabel||' '}</small>}</div>; }
function BreakdownRow({item,total,propertyId}:{item:ReturnType<typeof buildBreakdown>[number];total:number;propertyId:string}){ const [open,setOpen]=useState(false); const color=categoryVar[item.key]||'var(--category-neutral)'; const pct=total?Math.round(item.amount/total*100):0; return <div className={`origin-breakdown-row expandable ${open?'open':''}`}><button type="button" className="origin-breakdown-toggle" onClick={()=>setOpen(v=>!v)}><div className="origin-breakdown-label"><span className="origin-dot" style={{background:color}}/><strong>{item.category}</strong><span>{formatCurrency(item.amount)}</span><ChevronDown size={15}/></div><div className="origin-breakdown-track"><i style={{width:`${pct}%`,background:color}}/></div><div className="origin-breakdown-percent">{pct}%</div></button>{open&&<div className="origin-breakdown-details">{item.transactions.slice(0,8).map(t=>{const title=t.payee_source||t.description||item.category;const detail=t.payee_source&&t.description&&t.payee_source!==t.description?t.description:t.category;return <Link href={`/ledger?property=${propertyId}`} key={t.id}><span><strong>{title}</strong><small>{formatDate(t.transaction_date)} · {detail}</small></span><b>{formatCurrency(Math.abs(t.amount))}</b></Link>})}{item.transactions.length>8&&<Link className="origin-more-link" href={`/ledger?property=${propertyId}`}>+ {item.transactions.length-8} more transactions</Link>}</div>}</div>; }

function Insight({icon,color,title,body}:{icon:React.ReactNode;color:string;title:string;body:string}){ return <div className="insight-row"><div className="insight-icon" style={{color,background:`color-mix(in srgb, ${color} 13%, transparent)`}}>{icon}</div><div><strong>{title}</strong><span>{body}</span></div></div>; }
function TransactionRow({tx}:{tx:Tx}){ const positive=tx.type==='income'; return <div className="property-list-row property-transaction-row"><PropertyCategoryIcon category={tx.category}/><div className="property-transaction-copy"><strong>{tx.description||tx.category}</strong><span>{formatDate(tx.transaction_date)} · {tx.category}</span></div><div className={positive?'amount-positive':'amount-negative'}>{positive?'+':'−'}{formatCurrency(Math.abs(Number(tx.amount||0)))}</div></div>; }
function PropertyCategoryIcon({category}:{category:string}){const props={size:16,strokeWidth:1.8};const key=categoryKey(category);const Icon=key==='rent'?Banknote:key.startsWith('mortgage')?Landmark:key==='maintenance'?Wrench:key==='utilities'?Zap:key==='insurance'?ShieldCheck:key==='management'?ClipboardCheck:key==='leasing'?Receipt:key==='taxes'?Building2:key==='capex'?Hammer:key==='legal'?Scale:key==='distribution'?WalletCards:key==='other-income'?CircleDollarSign:key==='refund'?RotateCcw:FileText;return <span className="ledger-category-icon property-category-icon" data-category={key}><Icon {...props}/></span>}

function Empty({text}:{text:string}){return <div className="property-empty-inline">{text}</div>}

function PerformanceChart({rows}:{rows:ReturnType<typeof buildMonthlyRange>}){
  const W=760,H=286,pad={l:48,r:18,t:24,b:42}; const innerW=W-pad.l-pad.r, innerH=H-pad.t-pad.b; const max=Math.max(1,...rows.flatMap(r=>[r.income,r.operatingExpenses,r.noi])); const groupW=innerW/Math.max(1,rows.length); const barW=Math.max(8,Math.min(17,groupW*.22));
  const [selected,setSelected]=useState<number|null>(null);
  const noiPoints=rows.map((r,i)=>{const x=pad.l+groupW*i+groupW/2; const y=pad.t+innerH-(Math.max(0,r.noi)/max)*innerH; return `${x},${y}`}).join(' ');
  const selectedRow=selected==null?null:rows[selected];
  return <div className="performance-chart-shell">
    <div className="origin-chart-wrap interactive-performance-chart" onPointerLeave={()=>setSelected(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="origin-chart" role="img" aria-label="Monthly income, operating expenses and net operating income">
        {[0,.25,.5,.75,1].map(v=>{const y=pad.t+innerH-innerH*v;return <g key={v}><line x1={pad.l} x2={W-pad.r} y1={y} y2={y} className="origin-grid"/><text x={pad.l-8} y={y+4} textAnchor="end" className="origin-y-label">{v===0?'$0':`$${Math.round(max*v/1000)}K`}</text></g>})}
        {rows.map((r,i)=>{const cx=pad.l+groupW*i+groupW/2; const ih=(r.income/max)*innerH; const eh=(r.operatingExpenses/max)*innerH; return <g key={r.label}><rect x={cx-barW-2} y={pad.t+innerH-ih} width={barW} height={ih} rx="3" className="origin-income-bar"/><rect x={cx+2} y={pad.t+innerH-eh} width={barW} height={eh} rx="3" className="origin-expense-bar"/><text x={cx} y={H-12} textAnchor="middle" className={`origin-x-label ${i%2===1?'performance-label-secondary':''} ${selected===i?'selected':''}`}>{r.label}</text></g>})}
        <polyline points={noiPoints} fill="none" className="origin-noi-line"/>{rows.map((r,i)=>{const x=pad.l+groupW*i+groupW/2;const y=pad.t+innerH-(Math.max(0,r.noi)/max)*innerH;return <circle key={r.label} cx={x} cy={y} r={selected===i?5:3.2} className="origin-noi-point"/>})}
        {selected!=null&&<line x1={pad.l+groupW*selected+groupW/2} x2={pad.l+groupW*selected+groupW/2} y1={pad.t} y2={pad.t+innerH} className="performance-guide"/>}
        {rows.map((r,i)=><rect key={`hit-${r.label}-${i}`} x={pad.l+groupW*i} y={pad.t} width={groupW} height={innerH+28} fill="transparent" className="performance-month-hit" onPointerEnter={e=>{if(e.pointerType==='mouse')setSelected(i)}} onPointerDown={e=>{e.preventDefault();setSelected(i)}} onClick={()=>setSelected(i)}/>)}
      </svg>
    </div>
    <div className="performance-selected-summary">{selectedRow?<><div><span>{selectedRow.label}</span><strong>{formatCurrency(selectedRow.noi)} NOI</strong></div><div><span>Income <b className="amount-positive">{formatCurrency(selectedRow.income)}</b></span><span>Operating expenses <b className="amount-negative">{formatCurrency(selectedRow.operatingExpenses)}</b></span></div></>:<span className="performance-inspect-hint"><span className="desktop-hint">Hover or press to inspect a month.</span><span className="mobile-hint">Tap a month for details.</span></span>}</div>
  </div>;
}

function PerformanceAnimatedValue({value,animate}:{value:number;animate:boolean}){
  const [display,setDisplay]=useState(value);
  useEffect(()=>{
    if(!animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setDisplay(value);return;}
    let frame=0;const start=performance.now();const duration=650;
    const tick=(time:number)=>{const progress=Math.min(1,(time-start)/duration);setDisplay(value*(1-Math.pow(1-progress,3)));if(progress<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[value,animate]);
  return <strong className={display<0?'negative':''}>{formatCurrency(display)}</strong>;
}

function PerformanceMetric({label,value,change,inverse,tone}:{label:string;value:string;change?:number|null;inverse?:boolean;tone?:'positive'|'negative'|'warning'}){
  const good=change!=null?(inverse?change<=0:change>=0):tone==='positive';
  return <div><span>{label}</span><strong className={tone?`kpi-${tone}`:''}>{value}</strong>{change!=null&&Number.isFinite(change)?<small className={good?'positive':'negative'}>{change>=0?'↑':'↓'} {Math.abs(change).toFixed(1)}% <em>vs prior period</em></small>:<small>Current period</small>}</div>;
}

function PerformancePulseChart({rows,mode,onInspect}:{rows:ReturnType<typeof buildPerformanceMonths>;mode:PerformanceMode;onInspect:(value:{label:string;value:number}|null)=>void}){
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>{setSelected(null);onInspect(null);},[rows,mode,onInspect]);
  const W=820,H=300,pad={l:16,r:16,t:18,b:36};
  const innerW=W-pad.l-pad.r,innerH=H-pad.t-pad.b;
  let running=0;
  const plotted=rows.map(row=>{running+=row.cashFlow;return {...row,plotValue:mode==='cashFlow'?running:mode==='noi'?row.noi:row.income};});
  const values=mode==='incomeExpenses'?[0,...rows.flatMap(row=>[row.income,row.operatingExpenses])]:[0,...plotted.map(row=>row.plotValue)];
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  const chartMin=min-span*.12,chartMax=max+span*.12;
  const x=(index:number)=>pad.l+index*(innerW/Math.max(1,rows.length-1));
  const y=(value:number)=>pad.t+((chartMax-value)/(chartMax-chartMin))*innerH;
  const groupW=innerW/Math.max(1,rows.length),barW=Math.max(7,Math.min(22,groupW*.27));
  const points=plotted.map((row,index)=>`${x(index)},${y(row.plotValue)}`).join(' ');
  const tickIndexes=new Set([0,.25,.5,.75,1].map(position=>Math.round((rows.length-1)*position)));
  function choose(index:number|null){setSelected(index);if(index==null){onInspect(null);return;}const row=plotted[index];onInspect({label:row.fullLabel,value:mode==='cashFlow'?row.plotValue:mode==='noi'?row.noi:row.income});}
  function selectPointer(e:React.PointerEvent<SVGSVGElement>){if(!rows.length)return;const rect=e.currentTarget.getBoundingClientRect();const pointer=(e.clientX-rect.left)/rect.width*W;choose(Math.max(0,Math.min(rows.length-1,Math.round((pointer-pad.l)/(innerW/Math.max(1,rows.length-1))))));}
  const active=selected==null?null:plotted[selected];
  return <div className="performance-pulse-chart-wrap">
    <div className="performance-pulse-chart-summary">{active?<><span>{active.fullLabel}</span><b>{mode==='incomeExpenses'?`Income ${formatCurrency(active.income)} · Expenses ${formatCurrency(active.operatingExpenses)}`:`${mode==='noi'?'NOI':'Cash flow'} ${formatCurrency(mode==='noi'?active.noi:active.plotValue)}`}</b></>:<><span>{mode==='incomeExpenses'?'Monthly comparison':mode==='noi'?'Monthly net operating income':'Cumulative cash flow'}</span><b>Tap or drag to inspect</b></>}</div>
    <svg viewBox={`0 0 ${W} ${H}`} className="performance-pulse-chart" role="img" aria-label={`Interactive ${mode} performance chart`} onPointerDown={selectPointer} onPointerMove={e=>{if(e.pointerType==='mouse'||e.buttons===1)selectPointer(e);}} onPointerLeave={()=>choose(null)} onPointerCancel={()=>choose(null)}>
      <line x1={pad.l} x2={W-pad.r} y1={y(0)} y2={y(0)} className="performance-pulse-zero"/>
      {mode==='incomeExpenses'?rows.map((row,index)=>{const cx=pad.l+groupW*index+groupW/2;return <g key={row.key}><rect x={cx-barW-2} y={y(row.income)} width={barW} height={Math.max(0,y(0)-y(row.income))} rx="4" className="performance-pulse-income"/><rect x={cx+2} y={y(row.operatingExpenses)} width={barW} height={Math.max(0,y(0)-y(row.operatingExpenses))} rx="4" className="performance-pulse-expense"/></g>}):<><polyline points={points} className={`performance-pulse-line ${(plotted[plotted.length-1]?.plotValue||0)>=0?'positive':'negative'}`} fill="none"/>{plotted.map((row,index)=><circle key={row.key} cx={x(index)} cy={y(row.plotValue)} r={selected===index?5:3} className={`performance-pulse-point ${row.plotValue>=0?'positive':'negative'}`}/>)}</>}
      {selected!=null&&<line x1={x(selected)} x2={x(selected)} y1={pad.t} y2={H-pad.b} className="performance-pulse-guide"/>}
      {rows.map((row,index)=>tickIndexes.has(index)?<text key={row.key} x={mode==='incomeExpenses'?pad.l+groupW*index+groupW/2:x(index)} y={H-9} textAnchor={index===0?'start':index===rows.length-1?'end':'middle'}>{row.label}</text>:null)}
      <rect x="0" y="0" width={W} height={H-pad.b} fill="transparent"/>
    </svg>
    {mode==='incomeExpenses'&&<div className="performance-pulse-legend"><span><i className="income"/>Income</span><span><i className="expense"/>Operating expenses</span></div>}
  </div>;
}

function calculateMetrics(rows:Tx[]){ let income=0,operatingExpenses=0,cashExpenses=0; for(const t of rows){const amount=Math.abs(Number(t.amount||0)); if(t.type==='income') income+=amount; if(t.type==='expense'){cashExpenses+=amount; const key=categoryKey(t.category||''); if(!OPERATING_EXCLUSIONS.includes(key)) operatingExpenses+=amount;}} const noi=income-operatingExpenses; return {income,operatingExpenses,noi,cashFlow:income-cashExpenses,cashExpenses}; }
function buildMonthlyRange(rows:Tx[],start:Date,end:Date){const months:{year:number;month:number;label:string}[]=[];let d=new Date(start.getFullYear(),start.getMonth(),1);const last=new Date(end.getFullYear(),end.getMonth(),1);while(d<=last&&months.length<18){months.push({year:d.getFullYear(),month:d.getMonth()+1,label:d.toLocaleString('en-US',{month:'short'})});d=new Date(d.getFullYear(),d.getMonth()+1,1);}return months.map(m=>{const set=rows.filter(t=>Number(t.transaction_date.slice(0,4))===m.year&&Number(t.transaction_date.slice(5,7))===m.month);return {label:m.label,...calculateMetrics(set)}})}
function buildPerformanceMonths(rows:Tx[],start:Date,end:Date){const months:{year:number;month:number;key:string;label:string;fullLabel:string}[]=[];let d=new Date(start.getFullYear(),start.getMonth(),1);const last=new Date(end.getFullYear(),end.getMonth(),1);while(d<=last&&months.length<60){months.push({year:d.getFullYear(),month:d.getMonth()+1,key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleString('en-US',{month:'short'}),fullLabel:d.toLocaleString('en-US',{month:'long',year:'numeric'})});d=new Date(d.getFullYear(),d.getMonth()+1,1);}const includeYear=months.length>12;return months.map(month=>{const set=rows.filter(t=>Number(t.transaction_date.slice(0,4))===month.year&&Number(t.transaction_date.slice(5,7))===month.month);return {...month,label:includeYear?`${month.label} '${String(month.year).slice(-2)}`:month.label,...calculateMetrics(set)}})}
function getPerformanceRange(period:PerformancePeriod,transactions:Tx[],now:Date){const end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59);if(period==='YTD')return{start:new Date(now.getFullYear(),0,1),end};if(period==='3M'){const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-89);return{start,end};}if(period==='1Y'){const start=new Date(now.getFullYear()-1,now.getMonth(),now.getDate()+1);return{start,end};}const earliest=transactions.map(t=>t.transaction_date).filter(Boolean).sort()[0];return{start:earliest?new Date(`${earliest.slice(0,10)}T00:00:00`):new Date(now.getFullYear(),0,1),end};}
function getPreviousEqualRange(range:{start:Date;end:Date}){const duration=range.end.getTime()-range.start.getTime()+1;const end=new Date(range.start.getTime()-1);return{start:new Date(end.getTime()-duration+1),end};}
function buildBreakdown(rows:Tx[]){ const map=new Map<string,{category:string;key:string;amount:number;transactions:Tx[]}>(); for(const t of rows){if(t.type!=='expense')continue; const key=categoryKey(t.category||''); if(OPERATING_EXCLUSIONS.includes(key)||key==='review')continue; const name=t.category||'Other Expense'; const curr=map.get(name)||{category:name,key,amount:0,transactions:[]};curr.amount+=Math.abs(Number(t.amount||0));curr.transactions.push(t);map.set(name,curr);} const arr=[...map.values()].sort((a,b)=>b.amount-a.amount);arr.forEach(x=>x.transactions.sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))); const total=arr.reduce((sum,x)=>sum+x.amount,0); return arr.map(x=>({...x,share:total?x.amount/total:0})); }
function getPeriodRange(period:string,now:Date){if(period==='ytd')return{start:new Date(now.getFullYear(),0,1),end:new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59)};if(period==='l12m')return{start:new Date(now.getFullYear(),now.getMonth()-11,1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};const y=Number(period);return{start:new Date(y,0,1),end:new Date(y,11,31,23,59,59)}}
function getPreviousRange(range:{start:Date;end:Date}){const start=new Date(range.start);const end=new Date(range.end);start.setFullYear(start.getFullYear()-1);end.setFullYear(end.getFullYear()-1);return{start,end}}
function inRange(value:string,start:Date,end:Date){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d>=start&&d<=end}

function pctChange(current:number,prior:number){ if(!prior) return null; return (current-prior)/Math.abs(prior)*100; }
function formatDate(value:string){ if(!value)return ''; const d=new Date(`${value.slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function prettyPropertyType(v:string){ return ({duplex:'Duplex',single_family:'Single family',triplex:'Triplex',multi_unit:'Multi-unit'} as Record<string,string>)[v]||v||'Property'; }

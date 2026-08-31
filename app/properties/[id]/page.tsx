'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, ChevronRight, FileText, Home, ReceiptText, TrendingDown, TrendingUp, Users, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';
import { categoryKey } from '@/lib/accounting';
import type { Property, PropertyDocument, Unit } from '@/lib/types';
import PageSkeleton from '@/components/common/PageSkeleton';

type Tab = 'overview' | 'performance' | 'units' | 'documents';
type Tx = {
  id:string; property_id:string; unit_id?:string|null; transaction_date:string; type:'income'|'expense'|'transfer'; category:string; description:string; payee_source?:string|null; amount:number; notes?:string|null; status?:string|null; archived_at?:string|null; needs_review?:boolean|null; receipt_path?:string|null;
};

const OPERATING_EXCLUSIONS = ['mortgage-interest','mortgage-principal','mortgage','capex','distribution'];
const categoryVar:Record<string,string> = {
  rent:'var(--category-rent)', management:'var(--category-management)', leasing:'var(--category-management)', maintenance:'var(--category-maintenance)', utilities:'var(--category-utilities)', insurance:'var(--category-insurance)', taxes:'var(--category-taxes)', capex:'var(--category-capex)', legal:'var(--category-legal)', 'mortgage-interest':'var(--category-mortgage)', 'mortgage-principal':'var(--category-mortgage)', mortgage:'var(--category-mortgage)', review:'var(--category-review)', neutral:'var(--category-neutral)', 'other-income':'var(--category-rent)'
};

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
  const [year,setYear]=useState(new Date().getFullYear());

  useEffect(()=>{ if(!propertyId) return; (async()=>{
    setLoading(true); setError('');
    const [p,u,t,d]=await Promise.all([
      supabase.from('properties').select('*').eq('id',propertyId).is('archived_at',null).single(),
      supabase.from('units').select('*').eq('property_id',propertyId).is('archived_at',null).order('unit_number'),
      supabase.from('transactions').select('*').eq('property_id',propertyId).is('archived_at',null).order('transaction_date',{ascending:false}),
      supabase.from('documents').select('*').eq('property_id',propertyId).is('archived_at',null).order('created_at',{ascending:false}),
    ]);
    if(p.error){ setError(p.error.message); setLoading(false); return; }
    const prop=p.data as Property; setProperty(prop); setUnits((u.data||[]) as Unit[]); setTransactions((t.data||[]) as Tx[]); setDocuments((d.data||[]) as PropertyDocument[]);
    if(prop.image_path){ const signed=await supabase.storage.from('property-images').createSignedUrl(prop.image_path,3600); if(signed.data?.signedUrl) setImageUrl(signed.data.signedUrl); }
    const years=(t.data||[]).map((x:any)=>Number(String(x.transaction_date).slice(0,4))).filter(Boolean); if(years.length && !years.includes(new Date().getFullYear())) setYear(Math.max(...years));
    setLoading(false);
  })(); },[propertyId]);

  const years=useMemo(()=>Array.from(new Set(transactions.map(t=>Number(t.transaction_date.slice(0,4))).filter(Boolean))).sort((a,b)=>b-a),[transactions]);
  const current=useMemo(()=>transactions.filter(t=>t.status!=='declined' && Number(t.transaction_date.slice(0,4))===year),[transactions,year]);
  const prior=useMemo(()=>transactions.filter(t=>t.status!=='declined' && Number(t.transaction_date.slice(0,4))===year-1),[transactions,year]);

  const metrics=useMemo(()=>calculateMetrics(current),[current]);
  const priorMetrics=useMemo(()=>calculateMetrics(prior),[prior]);
  const monthly=useMemo(()=>buildMonthly(current),[current]);
  const breakdown=useMemo(()=>buildBreakdown(current),[current]);
  const occupied=units.filter(u=>u.occupied).length;
  const expectedRent=units.filter(u=>u.occupied).reduce((s,u)=>s+Number(u.current_rent||0),0);

  if(loading) return <div className="property-workspace"><PageSkeleton variant="properties"/></div>;
  if(error || !property) return <div className="property-workspace"><Link href="/properties" className="property-back"><ArrowLeft size={16}/> Properties</Link><div className="card property-empty">{error || 'Property not found.'}</div></div>;

  return <div className="property-workspace">
    <Link href="/properties" className="property-back"><ArrowLeft size={16}/> Back to Properties</Link>

    <header className="property-workspace-header">
      <div className="property-title-block">
        {imageUrl ? <img src={imageUrl} alt="" className="property-workspace-image"/> : <div className="property-workspace-image property-image-placeholder"><Home size={28}/></div>}
        <div><h1>{property.address}</h1><p>{property.city}, {property.state} {property.zip}</p><div className="property-meta"><span><Building2 size={14}/>{prettyPropertyType(property.property_type)}</span><span><Users size={14}/>{units.length} {units.length===1?'unit':'units'}</span>{property.purchase_date&&<span><CalendarDays size={14}/>Purchased {formatDate(property.purchase_date)}</span>}</div></div>
      </div>
      <div className="property-header-actions"><select value={year} onChange={e=>setYear(Number(e.target.value))} className="property-year-select">{(years.length?years:[year]).map(y=><option key={y} value={y}>{y}</option>)}</select><Link href={`/ledger?property=${property.id}`} className="property-secondary-action">View ledger</Link></div>
    </header>

    <nav className="property-subnav" aria-label="Property sections">{(['overview','performance','units','documents'] as Tab[]).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</nav>

    {tab==='overview' && <Overview property={property} units={units} transactions={transactions} documents={documents} imageUrl={imageUrl} occupied={occupied} expectedRent={expectedRent} metrics={metrics}/>} 
    {tab==='performance' && <Performance year={year} metrics={metrics} priorMetrics={priorMetrics} monthly={monthly} breakdown={breakdown} propertyId={property.id}/>} 
    {tab==='units' && <Units units={units}/>} 
    {tab==='documents' && <Documents documents={documents} propertyId={property.id}/>} 
  </div>;
}

function Overview({property,units,transactions,documents,occupied,expectedRent,metrics}:{property:Property;units:Unit[];transactions:Tx[];documents:PropertyDocument[];imageUrl:string;occupied:number;expectedRent:number;metrics:ReturnType<typeof calculateMetrics>}){
  return <div className="property-section-stack">
    <div className="property-kpi-grid property-kpi-grid-four">
      <Kpi label="Occupancy" value={units.length?`${occupied}/${units.length}`:'—'} sub={units.length?`${Math.round(occupied/units.length*100)}% occupied`:'No units yet'}/>
      <Kpi label="Expected monthly rent" value={formatCurrency(expectedRent)} sub="Occupied units"/>
      <Kpi label="Mortgage balance" value={formatCurrency(Number(property.mortgage_balance||0))} sub={property.monthly_mortgage_payment?`${formatCurrency(Number(property.monthly_mortgage_payment))}/mo`:'No monthly payment'}/>
      <Kpi label="YTD cash flow" value={formatCurrency(metrics.cashFlow)} sub="After recorded expenses" tone={metrics.cashFlow>=0?'positive':'negative'}/>
    </div>
    <div className="property-two-col">
      <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">UNITS</div><h2>Rent roll</h2></div><button className="property-text-action" onClick={()=>{ const b=document.querySelector<HTMLButtonElement>('.property-subnav button:nth-child(3)'); b?.click(); }}>View units <ChevronRight size={15}/></button></div>
        <div className="property-list">{units.length?units.map(u=><div className="property-list-row" key={u.id}><div><strong>{u.unit_number||'Unit'}</strong><span>{u.tenant_name||'No tenant'} · {u.bedroom_count||0} bd / {u.bathroom_count||0} ba</span></div><div className="property-row-right"><strong>{formatCurrency(Number(u.current_rent||0))}</strong><span className={u.occupied?'status-good':'status-warn'}>{u.occupied?'Occupied':'Vacant'}</span></div></div>):<Empty text="No units yet."/>}</div>
      </section>
      <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">RECENT</div><h2>Transactions</h2></div><Link href={`/ledger?property=${property.id}`} className="property-text-action">View all <ChevronRight size={15}/></Link></div>
        <div className="property-list">{transactions.slice(0,5).map(t=><TransactionRow key={t.id} tx={t}/>) }{!transactions.length&&<Empty text="No transactions yet."/>}</div>
      </section>
    </div>
    <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">DOCUMENTS</div><h2>Property paperwork</h2></div><Link href={`/ledger?tab=documents&property=${property.id}`} className="property-text-action">Open documents <ChevronRight size={15}/></Link></div><div className="property-doc-summary"><FileText size={22}/><div><strong>{documents.length} {documents.length===1?'document':'documents'}</strong><span>Leases, insurance, registrations, invoices and property records.</span></div></div></section>
  </div>;
}

function Performance({year,metrics,priorMetrics,monthly,breakdown,propertyId}:{year:number;metrics:ReturnType<typeof calculateMetrics>;priorMetrics:ReturnType<typeof calculateMetrics>;monthly:ReturnType<typeof buildMonthly>;breakdown:ReturnType<typeof buildBreakdown>;propertyId:string}){
  const expenseRatio=metrics.income>0?metrics.operatingExpenses/metrics.income:0;
  const priorExpenseRatio=priorMetrics.income>0?priorMetrics.operatingExpenses/priorMetrics.income:0;
  const maintenance=breakdown.find(x=>x.key==='maintenance');
  const priorMaintenance=0;
  return <div className="property-section-stack performance-origin">
    <div className="property-kpi-grid">
      <Kpi label="Gross income" value={formatCurrency(metrics.income)} change={pctChange(metrics.income,priorMetrics.income)} changeLabel={`vs ${year-1}`}/>
      <Kpi label="Operating expenses" value={formatCurrency(metrics.operatingExpenses)} change={pctChange(metrics.operatingExpenses,priorMetrics.operatingExpenses)} inverse changeLabel={`vs ${year-1}`}/>
      <Kpi label="NOI" value={formatCurrency(metrics.noi)} change={pctChange(metrics.noi,priorMetrics.noi)} changeLabel={`vs ${year-1}`}/>
      <Kpi label="Cash flow after mortgage" value={formatCurrency(metrics.cashFlow)} change={pctChange(metrics.cashFlow,priorMetrics.cashFlow)} changeLabel={`vs ${year-1}`}/>
      <Kpi label="Operating expense ratio" value={`${(expenseRatio*100).toFixed(1)}%`} sub={priorMetrics.income?`${((expenseRatio-priorExpenseRatio)*100).toFixed(1)} pp vs ${year-1}`:'Operating expenses ÷ income'} tone={expenseRatio<=priorExpenseRatio?'positive':undefined}/>
    </div>

    <div className="property-performance-grid">
      <section className="card origin-panel"><div className="property-panel-head"><div><div className="eyebrow">PERFORMANCE</div><h2>Income & expenses over time</h2></div><span className="origin-period">{year}</span></div><PerformanceChart rows={monthly}/><div className="chart-legend"><span><i className="legend-income"/>Income</span><span><i className="legend-expense"/>Operating expenses</span><span><i className="legend-noi"/>NOI</span></div></section>
      <section className="card origin-panel"><div className="property-panel-head"><div><div className="eyebrow">BREAKDOWN</div><h2>Operating expenses</h2></div><span className="muted-small">{year}</span></div><div className="origin-breakdown">{breakdown.length?breakdown.map(x=><BreakdownRow key={x.category} item={x} total={metrics.operatingExpenses}/>):<Empty text="No operating expenses recorded."/>}</div><Link href={`/ledger?property=${propertyId}`} className="origin-footer-link">View all transactions <ChevronRight size={15}/></Link></section>
    </div>

    <section className="card origin-panel property-insights"><div className="property-panel-head"><div><div className="eyebrow">TRENDS</div><h2>What to watch</h2></div></div><div className="insight-grid">
      <Insight icon={<Wrench size={18}/>} color="var(--category-maintenance)" title="Repairs & maintenance" body={maintenance?`${formatCurrency(maintenance.amount)} recorded in ${year}, ${Math.round(maintenance.share*100)}% of operating expenses.`:'No repairs or maintenance recorded this year.'}/>
      <Insight icon={expenseRatio<=priorExpenseRatio?<TrendingDown size={18}/>:<TrendingUp size={18}/>} color={expenseRatio<=priorExpenseRatio?'var(--positive)':'var(--category-review)'} title="Operating expense ratio" body={priorMetrics.income?`${(expenseRatio*100).toFixed(1)}% this year vs ${(priorExpenseRatio*100).toFixed(1)}% last year.`:`${(expenseRatio*100).toFixed(1)}% of recorded income is going to operating expenses.`}/>
      <Insight icon={metrics.cashFlow>=priorMetrics.cashFlow?<TrendingUp size={18}/>:<TrendingDown size={18}/>} color={metrics.cashFlow>=priorMetrics.cashFlow?'var(--positive)':'var(--negative)'} title="Cash flow" body={priorMetrics.income?`${formatCurrency(metrics.cashFlow)} this year vs ${formatCurrency(priorMetrics.cashFlow)} last year.`:`${formatCurrency(metrics.cashFlow)} after all recorded cash expenses.`}/>
    </div></section>
  </div>;
}

function Units({units}:{units:Unit[]}){ return <section className="card property-panel property-tab-panel"><div className="property-panel-head"><div><div className="eyebrow">UNITS</div><h2>Units & tenants</h2></div><Link href="/properties" className="property-secondary-action">Edit units</Link></div><div className="unit-workspace-grid">{units.length?units.map(u=><article className="unit-workspace-card" key={u.id}><div className="unit-workspace-top"><div><strong>{u.unit_number||'Unit'}</strong><span>{u.bedroom_count||0} bd · {u.bathroom_count||0} ba · {u.sqft||0} sqft</span></div><span className={u.occupied?'unit-status occupied':'unit-status vacant'}>{u.occupied?'Occupied':'Vacant'}</span></div><div className="unit-workspace-rent">{formatCurrency(Number(u.current_rent||0))}<span>/mo</span></div><div className="unit-workspace-tenant">{u.tenant_name||'No tenant assigned'}</div></article>):<Empty text="No units yet."/>}</div></section>; }

function Documents({documents,propertyId}:{documents:PropertyDocument[];propertyId:string}){ return <section className="card property-panel property-tab-panel"><div className="property-panel-head"><div><div className="eyebrow">DOCUMENTS</div><h2>Property documents</h2></div><Link href={`/ledger?tab=documents&property=${propertyId}`} className="property-secondary-action">Manage documents</Link></div><div className="property-document-list">{documents.length?documents.map(d=><div className="property-document-row" key={d.id}><div className="property-document-icon"><FileText size={18}/></div><div><strong>{d.title||d.file_name}</strong><span>{d.category}{d.expires_at?` · Expires ${formatDate(d.expires_at)}`:''}</span></div></div>):<Empty text="No documents uploaded for this property."/>}</div></section>; }

function Kpi({label,value,sub,tone,change,changeLabel,inverse}:{label:string;value:string;sub?:string;tone?:'positive'|'negative';change?:number|null;changeLabel?:string;inverse?:boolean}){ const good=change!=null?(inverse?change<=0:change>=0):tone==='positive'; return <div className="card property-kpi"><span>{label}</span><strong className={tone?`kpi-${tone}`:''}>{value}</strong>{change!=null&&Number.isFinite(change)?<small className={good?'change-good':'change-bad'}>{change>=0?'↑':'↓'} {Math.abs(change).toFixed(1)}% <em>{changeLabel}</em></small>:<small>{sub||changeLabel||' '}</small>}</div>; }
function BreakdownRow({item,total}:{item:ReturnType<typeof buildBreakdown>[number];total:number}){ const color=categoryVar[item.key]||'var(--category-neutral)'; const pct=total?Math.round(item.amount/total*100):0; return <div className="origin-breakdown-row"><div className="origin-breakdown-label"><span className="origin-dot" style={{background:color}}/><strong>{item.category}</strong><span>{formatCurrency(item.amount)}</span></div><div className="origin-breakdown-track"><i style={{width:`${pct}%`,background:color}}/></div><div className="origin-breakdown-percent">{pct}%</div></div>; }
function Insight({icon,color,title,body}:{icon:React.ReactNode;color:string;title:string;body:string}){ return <div className="insight-row"><div className="insight-icon" style={{color,background:`color-mix(in srgb, ${color} 13%, transparent)`}}>{icon}</div><div><strong>{title}</strong><span>{body}</span></div></div>; }
function TransactionRow({tx}:{tx:Tx}){ const positive=tx.type==='income'; return <div className="property-list-row"><div><strong>{tx.description||tx.category}</strong><span>{formatDate(tx.transaction_date)} · {tx.category}</span></div><div className={positive?'amount-positive':'amount-negative'}>{positive?'+':'−'}{formatCurrency(Math.abs(Number(tx.amount||0)))}</div></div>; }
function Empty({text}:{text:string}){return <div className="property-empty-inline">{text}</div>}

function PerformanceChart({rows}:{rows:ReturnType<typeof buildMonthly>}){
  const W=760,H=260,pad={l:44,r:18,t:18,b:36}; const innerW=W-pad.l-pad.r, innerH=H-pad.t-pad.b; const max=Math.max(1,...rows.flatMap(r=>[r.income,r.operatingExpenses])); const groupW=innerW/12; const barW=Math.max(7,Math.min(16,groupW*.22));
  const noiPoints=rows.map((r,i)=>{const x=pad.l+groupW*i+groupW/2; const y=pad.t+innerH-(Math.max(0,r.noi)/max)*innerH; return `${x},${y}`}).join(' ');
  return <div className="origin-chart-wrap"><svg viewBox={`0 0 ${W} ${H}`} className="origin-chart" role="img" aria-label="Monthly income, operating expenses and net operating income">
    {[0,.25,.5,.75,1].map(v=>{const y=pad.t+innerH-innerH*v;return <g key={v}><line x1={pad.l} x2={W-pad.r} y1={y} y2={y} className="origin-grid"/><text x={pad.l-8} y={y+4} textAnchor="end" className="origin-y-label">{v===0?'$0':`$${Math.round(max*v/1000)}K`}</text></g>})}
    {rows.map((r,i)=>{const cx=pad.l+groupW*i+groupW/2; const ih=(r.income/max)*innerH; const eh=(r.operatingExpenses/max)*innerH; return <g key={r.label}><rect x={cx-barW-2} y={pad.t+innerH-ih} width={barW} height={ih} rx="3" className="origin-income-bar"/><rect x={cx+2} y={pad.t+innerH-eh} width={barW} height={eh} rx="3" className="origin-expense-bar"/><text x={cx} y={H-11} textAnchor="middle" className="origin-x-label">{r.label}</text></g>})}
    <polyline points={noiPoints} fill="none" className="origin-noi-line"/>{rows.map((r,i)=>{const x=pad.l+groupW*i+groupW/2;const y=pad.t+innerH-(Math.max(0,r.noi)/max)*innerH;return <circle key={r.label} cx={x} cy={y} r="3.2" className="origin-noi-point"/>})}
  </svg></div>;
}

function calculateMetrics(rows:Tx[]){ let income=0,operatingExpenses=0,cashExpenses=0; for(const t of rows){const amount=Math.abs(Number(t.amount||0)); if(t.type==='income') income+=amount; if(t.type==='expense'){cashExpenses+=amount; const key=categoryKey(t.category||''); if(!OPERATING_EXCLUSIONS.includes(key)) operatingExpenses+=amount;}} const noi=income-operatingExpenses; return {income,operatingExpenses,noi,cashFlow:income-cashExpenses,cashExpenses}; }
function buildMonthly(rows:Tx[]){ return Array.from({length:12},(_,m)=>{const set=rows.filter(t=>Number(t.transaction_date.slice(5,7))===m+1); const x=calculateMetrics(set); return {label:new Date(2020,m,1).toLocaleString('en-US',{month:'short'}),...x};}); }
function buildBreakdown(rows:Tx[]){ const map=new Map<string,{category:string;key:string;amount:number}>(); for(const t of rows){if(t.type!=='expense')continue; const key=categoryKey(t.category||''); if(OPERATING_EXCLUSIONS.includes(key))continue; const name=t.category||'Other Expense'; const curr=map.get(name)||{category:name,key,amount:0};curr.amount+=Math.abs(Number(t.amount||0));map.set(name,curr);} const arr=[...map.values()].sort((a,b)=>b.amount-a.amount); const total=arr.reduce((s,x)=>s+x.amount,0); return arr.map(x=>({...x,share:total?x.amount/total:0})); }
function pctChange(current:number,prior:number){ if(!prior) return null; return (current-prior)/Math.abs(prior)*100; }
function formatDate(value:string){ if(!value)return ''; const d=new Date(`${value.slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function prettyPropertyType(v:string){ return ({duplex:'Duplex',single_family:'Single family',triplex:'Triplex',multi_unit:'Multi-unit'} as Record<string,string>)[v]||v||'Property'; }

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, Building2, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, FileText, Gauge, Hammer, Home, Landmark, LockKeyhole, Receipt, RotateCcw, Scale, ShieldCheck, TrendingDown, TrendingUp, Users, WalletCards, Wrench, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';
import { categoryKey } from '@/lib/accounting';
import type { Property, PropertyDocument, Unit } from '@/lib/types';

type Tab = 'overview' | 'performance' | 'improve' | 'units' | 'documents';
type Tx = {
  id:string; property_id:string; unit_id?:string|null; transaction_date:string; type:'income'|'expense'|'transfer'; category:string; description:string; payee_source?:string|null; amount:number; notes?:string|null; status?:string|null; archived_at?:string|null; needs_review?:boolean|null; receipt_path?:string|null;
};

const OPERATING_EXCLUSIONS = ['mortgage-interest','mortgage-principal','mortgage','capex','distribution'];
const categoryVar:Record<string,string> = {
  rent:'var(--category-rent)', management:'var(--category-management)', leasing:'var(--category-management)', maintenance:'var(--category-maintenance)', utilities:'var(--category-utilities)', insurance:'var(--category-insurance)', taxes:'var(--category-taxes)', capex:'var(--category-capex)', legal:'var(--category-legal)', 'mortgage-interest':'var(--category-mortgage)', 'mortgage-principal':'var(--category-mortgage)', mortgage:'var(--category-mortgage)', review:'var(--category-review)', neutral:'var(--category-neutral)', 'other-income':'var(--category-rent)'
};

const formatKpiCurrency=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Math.round(value));

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
    setLoading(false);
  })(); },[propertyId]);

  const years=useMemo(()=>Array.from(new Set(transactions.map(t=>Number(t.transaction_date.slice(0,4))).filter(Boolean))).sort((a,b)=>b-a),[transactions]);
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
        <div className="property-title-copy"><h1>{property.address}</h1><p>{property.city}, {property.state} {property.zip}</p><div className="property-meta"><span><Building2 size={14}/>{prettyPropertyType(property.property_type)}</span><span><Users size={14}/>{units.length} {units.length===1?'unit':'units'}</span>{units.length>0&&<span className={`property-occupancy-meta ${occupied===units.length?'full':occupied>0?'partial':'vacant'}`}><i/>{occupied}/{units.length} occupied</span>}{property.purchase_date&&<span><CalendarDays size={14}/>Purchased {formatDate(property.purchase_date)}</span>}</div><Link href={`/ledger?property=${property.id}`} className="property-ledger-action">View ledger <ChevronRight size={14}/></Link></div>
      </div>
    </header>

    <nav className="property-subnav" aria-label="Property sections">{(['overview','performance','improve','units','documents'] as Tab[]).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</nav>

    {tab==='overview' && <Overview property={property} units={units} transactions={transactions} documents={documents} imageUrl={imageUrl} occupied={occupied} expectedRent={expectedRent} metrics={metrics}/>} 
    {tab==='performance' && <Performance transactions={transactions} years={years} propertyId={property.id}/>} 
    {tab==='improve' && <Improve property={property} units={units} transactions={transactions}/>} 
    {tab==='units' && <Units units={units}/>} 
    {tab==='documents' && <Documents documents={documents} propertyId={property.id}/>} 
  </div>;
}

function Overview({property,units,transactions,documents,occupied,expectedRent,metrics}:{property:Property;units:Unit[];transactions:Tx[];documents:PropertyDocument[];imageUrl:string;occupied:number;expectedRent:number;metrics:ReturnType<typeof calculateMetrics>}){
  return <div className="property-section-stack">
    <div className="property-metric-strip overview-metric-strip">
      <Kpi label="Expected monthly rent" value={formatKpiCurrency(expectedRent)} sub="Occupied units"/>
      <Kpi label="YTD cash flow" value={formatKpiCurrency(metrics.cashFlow)} sub="After recorded expenses" tone={metrics.cashFlow>=0?'positive':'negative'}/>
      <Kpi label="Mortgage balance" value={formatKpiCurrency(Number(property.mortgage_balance||0))} sub={property.monthly_mortgage_payment?`${formatCurrency(Number(property.monthly_mortgage_payment))}/mo`:'No monthly payment'}/>
      <Kpi label="Operating expense ratio" value={metrics.income>0?`${(metrics.operatingExpenses/metrics.income*100).toFixed(1)}%`:'—'} tone={metrics.income>0?(metrics.operatingExpenses/metrics.income>=0.70?'negative':metrics.operatingExpenses/metrics.income>=0.55?'warning':'positive'):undefined} status={metrics.income>0?(metrics.operatingExpenses/metrics.income>=0.70?'High':metrics.operatingExpenses/metrics.income>=0.55?'Elevated':'Healthy'):undefined}/>

    </div>
    <div className="property-two-col">
      <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">UNITS</div><h2>Rent roll</h2></div><button className="property-text-action" onClick={()=>{ const b=document.querySelector<HTMLButtonElement>('.property-subnav button:nth-child(3)'); b?.click(); }}>View units <ChevronRight size={15}/></button></div>
        <div className="property-list">{units.length?units.map(u=><div className="property-list-row" key={u.id}><div><strong>{u.unit_number||'Unit'}</strong><span>{u.tenant_name||'No tenant'} · {u.bedroom_count||0} bd / {u.bathroom_count||0} ba</span></div><div className="property-row-right"><strong>{formatCurrency(Number(u.current_rent||0))}</strong><span className={`status-pill ${u.occupied?'occupied':'vacant'}`}>{u.occupied?'Occupied':'Vacant'}</span></div></div>):<Empty text="No units yet."/>}</div>
      </section>
      <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">RECENT</div><h2>Transactions</h2></div><Link href={`/ledger?property=${property.id}`} className="property-text-action">View all <ChevronRight size={15}/></Link></div>
        <div className="property-list">{transactions.slice(0,5).map(t=><TransactionRow key={t.id} tx={t}/>) }{!transactions.length&&<Empty text="No transactions yet."/>}</div>
      </section>
    </div>
    <section className="card property-panel"><div className="property-panel-head"><div><div className="eyebrow">DOCUMENTS</div><h2>Property paperwork</h2></div><Link href={`/ledger?tab=documents&property=${property.id}`} className="property-text-action">Open documents <ChevronRight size={15}/></Link></div><div className="property-doc-summary"><FileText size={22}/><div><strong>{documents.length} {documents.length===1?'document':'documents'}</strong><span>Leases, insurance, registrations, invoices and property records.</span></div></div></section>
  </div>;
}

function Performance({transactions,years,propertyId}:{transactions:Tx[];years:number[];propertyId:string}){
  const now=new Date();
  const [period,setPeriod]=useState<string>('ytd');
  const range=useMemo(()=>getPeriodRange(period,now),[period]);
  const previousRange=useMemo(()=>getPreviousRange(range),[range.start.getTime(),range.end.getTime()]);
  const rows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&inRange(t.transaction_date,range.start,range.end)),[transactions,range.start.getTime(),range.end.getTime()]);
  const priorRows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&inRange(t.transaction_date,previousRange.start,previousRange.end)),[transactions,previousRange.start.getTime(),previousRange.end.getTime()]);
  const metrics=useMemo(()=>calculateMetrics(rows),[rows]);
  const priorMetrics=useMemo(()=>calculateMetrics(priorRows),[priorRows]);
  const monthly=useMemo(()=>buildMonthlyRange(rows,range.start,range.end),[rows,range.start.getTime(),range.end.getTime()]);
  const breakdown=useMemo(()=>buildBreakdown(rows),[rows]);
  const breakdownTotal=useMemo(()=>breakdown.reduce((sum,item)=>sum+item.amount,0),[breakdown]);
  const expenseRatio=metrics.income>0?metrics.operatingExpenses/metrics.income:0;
  const priorExpenseRatio=priorMetrics.income>0?priorMetrics.operatingExpenses/priorMetrics.income:0;
  const maintenance=breakdown.find(x=>x.key==='maintenance');
  const label=period==='ytd'?'YTD':period==='l12m'?'Last 12M':period;
  const compareLabel=period==='ytd'?'vs prior YTD':period==='l12m'?'vs previous 12M':`vs ${Number(period)-1}`;
  const periodOptions=Array.from(new Set([String(now.getFullYear()),...years.map(String)])).sort((a,b)=>Number(b)-Number(a));
  const watch = metrics.noi<0
    ? {title:'Negative NOI',body:`Operating expenses exceeded gross income by ${formatCurrency(Math.abs(metrics.noi))} in ${label}.`}
    : expenseRatio>=0.70
      ? {title:'Expense ratio watch',body:`Operating expenses are ${(expenseRatio*100).toFixed(1)}% of gross income in ${label}.`}
      : maintenance && maintenance.share>=0.40
        ? {title:'Maintenance concentration',body:`Repairs & maintenance account for ${Math.round(maintenance.share*100)}% of operating expenses in ${label}.`}
        : null;
  return <div className="property-section-stack performance-origin">
    <div className="performance-toolbar">
      <div className="performance-period-switch performance-period-control" aria-label="Performance period"><button className={period==='ytd'?'active':''} onClick={()=>setPeriod('ytd')}>YTD</button><button className={period==='l12m'?'active':''} onClick={()=>setPeriod('l12m')}>Last 12M</button>{periodOptions.map(y=><button key={y} className={period===y?'active':''} onClick={()=>setPeriod(y)}>{y}</button>)}</div>
    </div>
    <div className="property-metric-strip performance-metric-strip performance-kpis">
      <Kpi label="Gross income" value={formatKpiCurrency(metrics.income)} change={pctChange(metrics.income,priorMetrics.income)} changeLabel={compareLabel}/>
      <Kpi label="Operating expenses" value={formatKpiCurrency(metrics.operatingExpenses)} change={pctChange(metrics.operatingExpenses,priorMetrics.operatingExpenses)} inverse changeLabel={compareLabel}/>
      <Kpi label="NOI" value={formatKpiCurrency(metrics.noi)} change={pctChange(metrics.noi,priorMetrics.noi)} changeLabel={compareLabel}/>
      <Kpi label="Cash flow after mortgage" value={formatKpiCurrency(metrics.cashFlow)} change={pctChange(metrics.cashFlow,priorMetrics.cashFlow)} changeLabel={compareLabel}/>
      <Kpi label="Operating expense ratio" value={`${(expenseRatio*100).toFixed(1)}%`} sub={undefined} tone={expenseRatio>=0.70?'negative':expenseRatio>=0.55?'warning':'positive'} status={expenseRatio>=0.70?'High':expenseRatio>=0.55?'Elevated':'Healthy'}/>
    </div>
    <div className="property-performance-grid performance-panels">
      <section className="card origin-panel performance-chart-panel"><div className="property-panel-head"><div><div className="eyebrow">PERFORMANCE</div><h2>Income & expenses over time</h2></div><span className="origin-period">{label}</span></div><PerformanceChart rows={monthly}/><div className="chart-legend"><span><i className="legend-income"/>Income</span><span><i className="legend-expense"/>Operating expenses</span><span><i className="legend-noi"/>NOI</span></div></section>
      <section className="card origin-panel performance-breakdown-panel"><div className="property-panel-head"><div><div className="eyebrow">BREAKDOWN</div><h2>Operating expenses</h2></div><span className="muted-small">{label}</span></div><div className="origin-breakdown">{breakdown.length?breakdown.map(x=><BreakdownRow key={x.category} item={x} total={breakdownTotal} propertyId={propertyId}/>):<Empty text="No operating expenses recorded."/>}</div><Link href={`/ledger?property=${propertyId}`} className="origin-footer-link">View all transactions <ChevronRight size={15}/></Link></section>
    </div>
    {watch&&<section className="performance-watch"><AlertTriangle size={18}/><div><strong>{watch.title}</strong><span>{watch.body}</span></div></section>}
    <section className="card origin-panel property-insights"><div className="property-panel-head"><div><div className="eyebrow">TRENDS</div><h2>What to watch</h2></div></div><div className="insight-grid">
      <Insight icon={<Wrench size={18}/>} color="var(--category-maintenance)" title="Repairs & maintenance" body={maintenance?`${formatCurrency(maintenance.amount)} in ${label}, ${Math.round(maintenance.share*100)}% of operating expenses.`:`No repairs or maintenance recorded in ${label}.`}/>
      <Insight icon={expenseRatio<=priorExpenseRatio?<TrendingDown size={18}/>:<TrendingUp size={18}/>} color={expenseRatio<=priorExpenseRatio?'var(--positive)':'var(--category-review)'} title="Operating expense ratio" body={priorMetrics.income?`${(expenseRatio*100).toFixed(1)}% ${label.toLowerCase()} vs ${(priorExpenseRatio*100).toFixed(1)}% in the comparison period.`:`${(expenseRatio*100).toFixed(1)}% of recorded income is going to operating expenses.`}/>
      <Insight icon={metrics.cashFlow>=priorMetrics.cashFlow?<TrendingUp size={18}/>:<TrendingDown size={18}/>} color={metrics.cashFlow>=priorMetrics.cashFlow?'var(--positive)':'var(--negative)'} title="Cash flow" body={priorMetrics.income?`${formatCurrency(metrics.cashFlow)} ${label.toLowerCase()} vs ${formatCurrency(priorMetrics.cashFlow)} in the comparison period.`:`${formatCurrency(metrics.cashFlow)} after all recorded cash expenses.`}/>
    </div></section>
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
      <div className="improve-projection-bar"><div><span>Current</span><strong>{formatKpiCurrency(currentMonthly)}</strong></div><i><b style={{width:`${Math.max(4,Math.min(100,projected>0?currentMonthly/projected*100:4))}%`}}/></i><div><span>Scenario</span><strong>{formatKpiCurrency(projected)}</strong></div></div>
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

function Units({units}:{units:Unit[]}){ const [selected,setSelected]=useState(units[0]?.id||''); const unit=units.find(u=>u.id===selected)||units[0]; return <section className="card property-panel property-tab-panel compact-units-panel"><div className="property-panel-head"><div><div className="eyebrow">UNITS</div><h2>Units & tenants</h2></div><Link href="/properties" className="property-secondary-action">Edit units</Link></div>{!unit?<Empty text="No units yet."/>:<><div className="property-unit-tabs">{units.map(u=><button type="button" key={u.id} className={u.id===unit.id?'active':''} onClick={()=>setSelected(u.id)}>{u.unit_number||'Unit'}</button>)}</div><div className="compact-unit-detail"><div><span className={unit.occupied?'unit-status occupied':'unit-status vacant'}>{unit.occupied?'Occupied':'Vacant'}</span><h3>{unit.unit_number||'Unit'}</h3><p>{unit.tenant_name||'No tenant assigned'}</p></div><div className="compact-unit-stats"><div><span>Rent</span><strong>{formatCurrency(Number(unit.current_rent||0))}/mo</strong></div><div><span>Layout</span><strong>{unit.bedroom_count||0} bd · {unit.bathroom_count||0} ba</strong></div><div><span>Size</span><strong>{unit.sqft||0} sqft</strong></div></div></div></>}</section>; }

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

function calculateMetrics(rows:Tx[]){ let income=0,operatingExpenses=0,cashExpenses=0; for(const t of rows){const amount=Math.abs(Number(t.amount||0)); if(t.type==='income') income+=amount; if(t.type==='expense'){cashExpenses+=amount; const key=categoryKey(t.category||''); if(!OPERATING_EXCLUSIONS.includes(key)) operatingExpenses+=amount;}} const noi=income-operatingExpenses; return {income,operatingExpenses,noi,cashFlow:income-cashExpenses,cashExpenses}; }
function buildMonthlyRange(rows:Tx[],start:Date,end:Date){const months:{year:number;month:number;label:string}[]=[];let d=new Date(start.getFullYear(),start.getMonth(),1);const last=new Date(end.getFullYear(),end.getMonth(),1);while(d<=last&&months.length<18){months.push({year:d.getFullYear(),month:d.getMonth()+1,label:d.toLocaleString('en-US',{month:'short'})});d=new Date(d.getFullYear(),d.getMonth()+1,1);}return months.map(m=>{const set=rows.filter(t=>Number(t.transaction_date.slice(0,4))===m.year&&Number(t.transaction_date.slice(5,7))===m.month);return {label:m.label,...calculateMetrics(set)}})}
function buildBreakdown(rows:Tx[]){ const map=new Map<string,{category:string;key:string;amount:number;transactions:Tx[]}>(); for(const t of rows){if(t.type!=='expense')continue; const key=categoryKey(t.category||''); if(OPERATING_EXCLUSIONS.includes(key)||key==='review')continue; const name=t.category||'Other Expense'; const curr=map.get(name)||{category:name,key,amount:0,transactions:[]};curr.amount+=Math.abs(Number(t.amount||0));curr.transactions.push(t);map.set(name,curr);} const arr=[...map.values()].sort((a,b)=>b.amount-a.amount);arr.forEach(x=>x.transactions.sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))); const total=arr.reduce((sum,x)=>sum+x.amount,0); return arr.map(x=>({...x,share:total?x.amount/total:0})); }
function getPeriodRange(period:string,now:Date){if(period==='ytd')return{start:new Date(now.getFullYear(),0,1),end:new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59)};if(period==='l12m')return{start:new Date(now.getFullYear(),now.getMonth()-11,1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};const y=Number(period);return{start:new Date(y,0,1),end:new Date(y,11,31,23,59,59)}}
function getPreviousRange(range:{start:Date;end:Date}){const start=new Date(range.start);const end=new Date(range.end);start.setFullYear(start.getFullYear()-1);end.setFullYear(end.getFullYear()-1);return{start,end}}
function inRange(value:string,start:Date,end:Date){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d>=start&&d<=end}

function pctChange(current:number,prior:number){ if(!prior) return null; return (current-prior)/Math.abs(prior)*100; }
function formatDate(value:string){ if(!value)return ''; const d=new Date(`${value.slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function prettyPropertyType(v:string){ return ({duplex:'Duplex',single_family:'Single family',triplex:'Triplex',multi_unit:'Multi-unit'} as Record<string,string>)[v]||v||'Property'; }

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageSkeleton from '@/components/common/PageSkeleton';
import { useAuth } from '@/components/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { calculatePortfolioStats, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency } from '@/lib/formatters';
import type { Property, Unit, Transaction, PropertyDocument } from '@/lib/types';
import { withTimeout } from '@/lib/async';
import { Banknote, Landmark, Wrench, Zap, ShieldCheck, Receipt, FileText, Building2, Hammer, Scale, WalletCards, CircleDollarSign, ClipboardCheck, RotateCcw, Plus, X, TrendingDown, TrendingUp } from 'lucide-react';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import Toast from '@/components/common/Toast';
import { categoryKey } from '@/lib/accounting';

type CashPeriod='1M'|'3M'|'YTD'|'1Y';
type CashPoint={key:string;label:string;fullLabel:string;value:number;periodNet:number;income:number;expense:number};
type DailyInsight={id:string;kicker:string;title:string;detail:string;tone:'positive'|'warning'|'neutral';kind:'rent'|'expense'|'occupancy'};

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [cashPeriod, setCashPeriod] = useState<CashPeriod>('1M');
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
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [toast,setToast]=useState('');
  const [sinceLastVisit,setSinceLastVisit]=useState('Your portfolio is ready');
  const [dismissedInsightIds,setDismissedInsightIds]=useState<string[]>([]);
  const visitRecorded=useRef(false);

  const refreshTransactions = useCallback(async () => {
    try {
      const r = await withTimeout(Promise.resolve(supabase.from('transactions').select('*').is('archived_at',null).order('transaction_date',{ascending:false})), 8000, 'The ledger took too long to refresh.');
      if (!r.error) setTransactions((r.data||[]) as Transaction[]);
    } catch {
      // Background refresh failure should never hide the dashboard.
    }
  }, []);

  const recordDashboardVisit = useCallback(async (txRows:Transaction[]) => {
    const now=new Date().toISOString();
    const todayKey=localDateKey(new Date());
    const storageKey=`re-portal:last-dashboard-visit:${user.id}`;
    const dismissedStorageKey=`re-portal:dismissed-insights:${user.id}:${todayKey}`;
    let previous='';
    try{setDismissedInsightIds(JSON.parse(window.localStorage.getItem(dismissedStorageKey)||'[]'));}catch{}
    try{previous=window.localStorage.getItem(storageKey)||'';}catch{}
    try{
      const visit=await supabase.from('dashboard_visits').select('last_seen_at,dismissed_insight_ids,dismissed_for_date').eq('user_id',user.id).maybeSingle();
      if(!visit.error&&visit.data?.last_seen_at) previous=visit.data.last_seen_at;
      if(!visit.error&&visit.data?.dismissed_for_date===todayKey&&Array.isArray(visit.data.dismissed_insight_ids)) setDismissedInsightIds(visit.data.dismissed_insight_ids as string[]);
    }catch{}
    if(previous){
      const updateCount=txRows.filter(tx=>tx.created_at&&tx.created_at>previous).length;
      setSinceLastVisit(updateCount?`${updateCount} new ledger ${updateCount===1?'update':'updates'} since your last visit`:'No new ledger activity since your last visit');
    }else{
      setSinceLastVisit('Your first portfolio pulse is ready');
    }
    try{window.localStorage.setItem(storageKey,now);}catch{}
    try{await supabase.from('dashboard_visits').upsert({user_id:user.id,last_seen_at:now,updated_at:now},{onConflict:'user_id'});}catch{}
  },[user.id]);

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
      const dueDay=Math.min(28,Math.max(1,Number((property as any).mortgage_due_day||1))); const mortgageDate=`${month}-${String(dueDay).padStart(2,'0')}`;
      if(mortgageStart && mortgageDate < mortgageStart) continue;
      const exists=txRows.some(tx=>tx.property_id===property.id&&['Mortgage','Mortgage Payment','Mortgage Payment (Unsplit)','Mortgage Interest','Mortgage Principal'].includes(tx.category)&&tx.transaction_date.startsWith(month)&&['posted','declined'].includes(tx.status||'posted'));
      if(!exists){
        const principal=Math.max(0,Number((property as any).mortgage_principal_amount||0));
        const interest=Math.max(0,Number((property as any).mortgage_interest_amount||0));
        const escrow=Math.max(0,Number((property as any).mortgage_escrow_amount||0));
        const allocated=principal+interest+escrow;
        const splitComplete=allocated>0&&Math.abs(allocated-payment)<=0.020001;
        inserts.push({user_id:user.id,property_id:property.id,unit_id:null,transaction_date:mortgageDate,type:'expense',category:'Mortgage Payment',description:'Monthly mortgage payment',amount:-Math.abs(payment),notes:'Recurring monthly mortgage',source:'recurring',status:'posted',confirmed_at:new Date().toISOString(),needs_review:!splitComplete,mortgage_principal_amount:principal||null,mortgage_interest_amount:interest||null,mortgage_escrow_amount:escrow||null,import_key:`recurring-mortgage:${property.id}:${month}`});
      }
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
        supabase.from('properties').select('*').is('archived_at',null).order('address'),
        supabase.from('units').select('*').is('archived_at',null).order('unit_number'),
        supabase.from('transactions').select('*').is('archived_at',null).order('transaction_date',{ascending:false}),
        supabase.from('documents').select('*').is('archived_at',null).order('created_at',{ascending:false}),
      ]), 8000, 'Dashboard data took too long to load. Please retry.');
      const err=p.error||u.error||t.error||d.error; if(err) throw err;
      const props=(p.data||[]) as Property[]; const unitRows=(u.data||[]) as Unit[]; const txRows=(t.data||[]) as Transaction[];

      // Show the useful dashboard as soon as the core data arrives.
      setProperties(props); setUnits(unitRows); setTransactions(txRows); setDocuments((d.data||[]) as PropertyDocument[]); setLoading(false);
      if(!visitRecorded.current){visitRecorded.current=true;void recordDashboardVisit(txRows);}

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
  },[ensureRecurring,recordDashboardVisit]);

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
  const formatKpiCurrency=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Math.round(value));
  const postedThisMonth=useMemo(()=>transactions.filter(t=>t.transaction_date.startsWith(currentMonth)&&(t.status||'posted')==='posted'),[transactions,currentMonth]);
  const monthlyTotals=useMemo(()=>calculateMonthlyTotals(postedThisMonth),[postedThisMonth]);
  const pendingRents=useMemo(()=>transactions.filter(t=>t.status==='pending'&&t.category==='Rent'),[transactions]);
  const unitMap=useMemo(()=>Object.fromEntries(units.map(u=>[u.id,u])),[units]);
  const reviewRents=pendingRents.filter(t=>t.property_id===reviewPropertyId);
  const testReviewUnits=useMemo(()=>units.filter(u=>u.property_id===reviewPropertyId&&u.occupied&&u.recurring_rent_enabled!==false&&Number(u.current_rent||0)>0&&!testResolvedUnitIds.includes(u.id)),[units,reviewPropertyId,testResolvedUnitIds]);
  const testPendingForProperty=(propertyId:string)=>testModeActive?units.filter(u=>u.property_id===propertyId&&u.occupied&&u.recurring_rent_enabled!==false&&Number(u.current_rent||0)>0&&!testResolvedUnitIds.includes(u.id)).length:0;

  const actionItems=useMemo(()=>{
    const items:{id:string;kind:'rent'|'document'|'review';title:string;detail:string;propertyId?:string;days?:number;test?:boolean}[]=[];
    const grouped=new Map<string,number>(); pendingRents.forEach(t=>grouped.set(t.property_id,(grouped.get(t.property_id)||0)+1));
    grouped.forEach((count,propertyId)=>{const prop=properties.find(p=>p.id===propertyId);items.push({id:`rent-${propertyId}`,kind:'rent',propertyId,title:`Confirm ${monthLabel} rent`,detail:`${prop?.address||'Property'} · ${count} unit${count===1?'':'s'} waiting`});});
    const today=new Date(); today.setHours(0,0,0,0);
    documents.filter(d=>d.expires_at).forEach(doc=>{const due=new Date(`${doc.expires_at}T12:00:00`);const days=Math.ceil((due.getTime()-today.getTime())/86400000);const remind=Number(doc.reminder_days||60);if(days<=remind){const prop=properties.find(p=>p.id===doc.property_id);items.push({id:`doc-${doc.id}`,kind:'document',title:days<0?`${doc.category} expired`:days===0?`${doc.category} due today`:`${doc.category} due in ${days} days`,detail:`${prop?.address||'Property'} · ${doc.title}`,days});}});
    const needsReview=transactions.filter(tx=>(tx.status||'posted')==='posted'&&((tx as Transaction & {needs_review?:boolean}).needs_review||tx.category==='Needs Review'));
    if(needsReview.length){items.push({id:'needs-review',kind:'review',title:`${needsReview.length} transaction${needsReview.length===1?'':'s'} need categorization`,detail:'Review these before year-end accountant export',days:-500});}
    if(testActionsActive){
      const sampleProperty=properties[0];
      items.unshift(
        {id:'test-rent',kind:'rent',propertyId:sampleProperty?.id,title:`Confirm ${monthLabel} rents`,detail:`${sampleProperty?.address||'Sample property'} · Review expected rent`,test:true},
        {id:'test-insurance',kind:'document',title:'Insurance renewal due in 30 days',detail:`${sampleProperty?.address||'Sample property'} · Policy renewal`,days:30,test:true},
        {id:'test-lease',kind:'document',title:'Lease expires in 60 days',detail:`${sampleProperty?.address||'Sample property'} · Unit 1 lease`,days:60,test:true}
      );
    }
    return items.sort((a,b)=>(a.days??999)-(b.days??999));
  },[documents,pendingRents,properties,monthLabel,testActionsActive,transactions]);

  const expectedMonthlyRent=useMemo(()=>units.filter(unit=>unit.occupied&&unit.recurring_rent_enabled!==false).reduce((sum,unit)=>sum+Math.max(0,Number(unit.current_rent||0)),0),[units]);
  const confirmedRent=useMemo(()=>postedThisMonth.filter(tx=>tx.type==='income'&&tx.category==='Rent').reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount||0)),0),[postedThisMonth]);
  const now=new Date();
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const rentEarned=expectedMonthlyRent*(now.getDate()/daysInMonth);
  const dailyRent=expectedMonthlyRent/daysInMonth;
  const nonRentIncome=postedThisMonth.filter(tx=>tx.type==='income'&&tx.category!=='Rent').reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount||0)),0);
  const projectedMonthEnd=expectedMonthlyRent+nonRentIncome-monthlyTotals.expense;
  const greeting=now.getHours()<12?'Good morning':now.getHours()<18?'Good afternoon':'Good evening';
  const todayLabel=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  const dailyInsights=useMemo<DailyInsight[]>(()=>{
    const dateKey=localDateKey(now);
    const rentPace=expectedMonthlyRent>0?Math.min(100,Math.round((rentEarned/expectedMonthlyRent)*100)):0;
    const insights:DailyInsight[]=[];
    if(expectedMonthlyRent>0) insights.push({id:`rent-pace-${dateKey}`,kicker:'Rent pace',title:`${rentPace}% of ${monthLabel} rent earned`,detail:`${formatKpiCurrency(rentEarned)} of ${formatKpiCurrency(expectedMonthlyRent)} scheduled`,tone:'positive',kind:'rent'});
    const previousMonthExpenses:number[]=[];
    for(let offset=1;offset<=3;offset++){
      const monthDate=new Date(now.getFullYear(),now.getMonth()-offset,1);
      const prefix=`${monthDate.getFullYear()}-${String(monthDate.getMonth()+1).padStart(2,'0')}`;
      previousMonthExpenses.push(transactions.filter(tx=>tx.transaction_date.startsWith(prefix)&&(tx.status||'posted')==='posted'&&tx.type==='expense').reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0));
    }
    const comparable=previousMonthExpenses.filter(value=>value>0);
    if(comparable.length){
      const average=comparable.reduce((sum,value)=>sum+value,0)/comparable.length;
      const delta=Math.round(((monthlyTotals.expense-average)/average)*100);
      const lower=delta<=0;
      insights.push({id:`expense-trend-${dateKey}`,kicker:'Expense trend',title:`Expenses are ${Math.abs(delta)}% ${lower?'below':'above'} recent average`,detail:`${formatKpiCurrency(monthlyTotals.expense)} posted this month`,tone:lower?'positive':'warning',kind:'expense'});
    }
    const vacantUnits=units.filter(unit=>!unit.occupied);
    const knownVacantRent=vacantUnits.reduce((sum,unit)=>sum+Math.max(0,Number(unit.current_rent||0)),0);
    if(knownVacantRent>0) insights.push({id:`vacancy-${dateKey}`,kicker:'Vacancy exposure',title:`${formatCurrency(knownVacantRent/daysInMonth)} per day at risk`,detail:`${vacantUnits.length} vacant unit${vacantUnits.length===1?'':'s'} with known rent`,tone:'warning',kind:'occupancy'});
    else insights.push({id:`occupancy-${dateKey}`,kicker:'Occupancy',title:`${stats.occupiedUnits} of ${stats.totalUnits} units occupied`,detail:stats.totalUnits===stats.occupiedUnits?'Your portfolio is fully occupied':`${stats.totalUnits-stats.occupiedUnits} unit${stats.totalUnits-stats.occupiedUnits===1?'':'s'} currently vacant`,tone:stats.totalUnits===stats.occupiedUnits?'positive':'neutral',kind:'occupancy'});
    return insights.slice(0,3);
  },[now,expectedMonthlyRent,rentEarned,monthLabel,transactions,monthlyTotals.expense,units,daysInMonth,stats.occupiedUnits,stats.totalUnits]);
  const visibleDailyInsights=dailyInsights.filter(insight=>!dismissedInsightIds.includes(insight.id));

  async function dismissDailyInsight(id:string){
    const todayKey=localDateKey(new Date());
    const next=Array.from(new Set([...dismissedInsightIds,id]));
    setDismissedInsightIds(next);
    try{window.localStorage.setItem(`re-portal:dismissed-insights:${user.id}:${todayKey}`,JSON.stringify(next));}catch{}
    try{await supabase.from('dashboard_visits').upsert({user_id:user.id,dismissed_insight_ids:next,dismissed_for_date:todayKey,updated_at:new Date().toISOString()},{onConflict:'user_id'});}catch{}
  }

  const cashFlow=useMemo(()=>buildCashFlowSeries(transactions,cashPeriod,cashPropertyId),[transactions,cashPeriod,cashPropertyId]);
  const cashForecast=cashPeriod==='1M'&&cashFlow.length
    ? {value:cashFlow[cashFlow.length-1].value+Math.max(0,expectedMonthlyRent-confirmedRent),label:new Date(now.getFullYear(),now.getMonth()+1,0).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
    : null;

  return <div className="dashboard-page pulse-page">
    <header className="pulse-page-header"><div><h1>{greeting}</h1><p>{todayLabel}</p></div>{!loading&&properties.length>0&&<button className="pulse-add-button" type="button" onClick={()=>setShowQuickAdd(true)}><Plus size={18}/><span className="pulse-add-desktop">Add transaction</span><span className="pulse-add-mobile">Add</span></button>}</header>
    {error&&<div style={errorBox}>{error}</div>}
    {loading?<PageSkeleton variant="dashboard"/>:<>
      <section className="pulse-top-grid">
        <div className="pulse-primary">
          <div className="pulse-hero">
            <span className="pulse-kicker">Rent earned this month</span>
            <CountUpCurrency value={rentEarned}/>
            <div className="pulse-daily-gain">+{formatCurrency(dailyRent)} today</div>
            <p className="pulse-earned-note">Lease-based daily accrual. Collected cash is shown separately.</p>
            <div className="pulse-since-visit"><span aria-hidden="true">●</span>{sinceLastVisit}<b> · {stats.occupiedUnits}/{stats.totalUnits} occupied</b></div>
          </div>
          <div className="pulse-supporting-metrics" aria-label="Portfolio overview">
            <PulseMetric label="Expected rent" value={formatKpiCurrency(expectedMonthlyRent)}/>
            <PulseMetric label="Collected rent" value={formatKpiCurrency(confirmedRent)} tone="positive"/>
            <PulseMetric label="Projected month-end" value={formatKpiCurrency(projectedMonthEnd)} tone={projectedMonthEnd>=0?'positive':'negative'}/>
            <PulseMetric label="Mortgage balance" value={formatKpiCurrency(stats.totalMortgageBalance)}/>
          </div>
          <div className="pulse-chart-head"><div><h2>Cash flow</h2><p>Cumulative posted ledger activity</p></div><select aria-label="Cash flow property" value={cashPropertyId} onChange={e=>setCashPropertyId(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
          <CashFlowChart rows={cashFlow} period={cashPeriod} forecast={cashForecast}/>
          <div className="pulse-periods" aria-label="Cash flow period">{(['1M','3M','YTD','1Y'] as CashPeriod[]).map(period=><button key={period} className={cashPeriod===period?'active':''} onClick={()=>setCashPeriod(period)}>{period}</button>)}</div>
        </div>
        <aside className="pulse-action-center card">
          <div className="pulse-section-head"><div><span>Needs you</span><h2>Action Center</h2></div>{actionItems.length>0&&<em>{actionItems.length}</em>}</div>
          {actionItems.length>0?<><div className="action-list">{actionItems.slice(0,3).map(item=><button key={item.id} className="action-row" onClick={()=>{if(item.kind==='rent'&&item.propertyId){setReviewPropertyId(item.propertyId);setTestPreview(Boolean(item.test));if(item.test)setTestModeActive(true);}else if(!item.test)router.push(item.kind==='review'?'/ledger?review=1':'/ledger');}}><ActionIcon kind={item.kind} title={item.title}/><span><strong>{item.title}</strong><small>{item.detail}{item.test?' · Test preview':''}</small></span><span className="action-cta">→</span></button>)}</div><button className="pulse-see-all" onClick={()=>router.push(testActionsActive?'/actions?test=1':'/actions')}>See all <span aria-hidden="true">→</span></button></>:<div className="pulse-all-clear"><strong>All clear</strong><span>No portfolio tasks need attention.</span></div>}
        </aside>
      </section>
      {visibleDailyInsights.length>0&&<section className="daily-brief" aria-labelledby="daily-brief-title">
        <div className="daily-brief-heading"><div><span>Fresh today</span><h2 id="daily-brief-title">Daily Brief</h2></div><p>Updates refresh each day</p></div>
        <div className="daily-brief-rail">{visibleDailyInsights.map(insight=><article key={insight.id} className="daily-insight" data-tone={insight.tone}>
          <div className="daily-insight-icon" aria-hidden="true">{insight.kind==='rent'?<Banknote size={19}/>:insight.kind==='expense'?(insight.tone==='positive'?<TrendingDown size={19}/>:<TrendingUp size={19}/>):<Building2 size={19}/>}</div>
          <button type="button" className="daily-insight-dismiss" onClick={()=>void dismissDailyInsight(insight.id)} aria-label={`Dismiss ${insight.kicker}`}><X size={16}/></button>
          <span>{insight.kicker}</span><strong>{insight.title}</strong><p>{insight.detail}</p>
        </article>)}</div>
      </section>}
      <section className="pulse-lower-grid">
        <div className="pulse-activity-section"><div className="pulse-section-title"><h2>Recent Activity</h2><Link href="/ledger">Open ledger →</Link></div><div className="card recent-activity-card"><div className="recent-activity-list">{transactions.filter(t=>(t.status||'posted')==='posted').slice(0,6).map(tx=>{const property=properties.find(p=>p.id===tx.property_id);const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <button type="button" className="recent-activity-row" key={tx.id} onClick={()=>router.push('/ledger')} aria-label={`Open ${tx.description} in ledger`}><DashboardCategoryIcon category={tx.category}/><div className="recent-activity-copy"><strong>{property?.address||'Portfolio activity'}</strong><span>{tx.description}{unit?.unit_number?` · Unit ${unit.unit_number}`:''} · {new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div><strong className={tx.type==='income'?'amount-positive':tx.type==='expense'?'amount-negative':''}>{tx.type==='expense'?'-':''}{formatCurrency(Math.abs(tx.amount))}</strong></button>})}</div></div></div>
        <div className="pulse-properties-section"><div className="pulse-section-title"><h2>Properties</h2><Link href="/properties">Manage →</Link></div><div className="dashboard-properties-panel card"><div className="dashboard-properties-list">{properties.map(property=>{const pu=units.filter(u=>u.property_id===property.id);const pt=postedThisMonth.filter(t=>t.property_id===property.id);const totals=calculateMonthlyTotals(pt);return <div key={property.id} className="dashboard-property-compact" role="button" tabIndex={0} onClick={()=>router.push('/properties')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();router.push('/properties');}}}>
          {imageUrls[property.id]?<img src={imageUrls[property.id]} alt="" className="property-compact-thumb"/>:<div className="property-compact-thumb property-compact-fallback">⌂</div>}
          <div className="property-compact-copy"><strong>{property.address}</strong><span>{pu.filter(u=>u.occupied).length}/{pu.length} occupied</span></div><strong className={totals.net>=0?'amount-positive':'amount-negative'}>{formatCurrency(totals.net)}</strong>
        </div>})}</div></div></div>
      </section>
    </>}
    {showQuickAdd&&<AddTransactionModal userId={user.id} properties={properties} units={units} onClose={()=>setShowQuickAdd(false)} onSaved={async message=>{await load();setToast(message||'Transaction added')}}/>}
    {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}
    {reviewPropertyId&&<div style={overlay}><div className="card" style={{width:'100%',maxWidth:620,padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><div><h2 style={{fontSize:21}}>Review {monthLabel} rents</h2>{testPreview&&<div style={{display:'inline-block',marginTop:6,padding:'3px 8px',borderRadius:999,background:'var(--accent-soft)',color:'var(--nav-active-text)',fontSize:11,fontWeight:700}}>TEST PREVIEW</div>}</div><button onClick={()=>{setReviewPropertyId(null);setTestPreview(false);}} style={secondaryButton}>✕</button></div><p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:18}}>{testPreview?'This preview lets you test the rent-review interface today. It does not write anything to your ledger.':"Confirm only the rent payments you actually received. Decline removes that unit's suggestion for this month."}</p><div style={{display:'grid',gap:10}}>
      {testPreview?testReviewUnits.map(unit=><div key={unit.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit.unit_number||'Unit'} · {formatCurrency(Number(unit.current_rent||0))}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>resolveTestUnit(unit.id)} style={secondaryButton}>Decline</button><button className="primary-action" onClick={()=>resolveTestUnit(unit.id)} style={primaryButton}>Confirm received</button></div></div>):reviewRents.map(tx=>{const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <div key={tx.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit?.unit_number||'Unit'} · {formatCurrency(tx.amount)}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>{unit?.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>declineRent(tx)} style={secondaryButton}>Decline</button><button className="primary-action" disabled={confirming===tx.id} onClick={()=>confirmRent(tx)} style={primaryButton}>{confirming===tx.id?'Confirming…':'Confirm received'}</button></div></div>})}
      {testPreview&&testReviewUnits.length===0&&<div style={{padding:18,textAlign:'center',color:'var(--text-secondary)',border:'1px solid var(--border-color)',borderRadius:10}}>Test complete. All occupied units were reviewed.</div>}
    </div></div></div>}
  </div>;
}
function PulseMetric({label,value,tone}:{label:string;value:string;tone?:'positive'|'negative'}){return <div className="pulse-metric"><span>{label}</span><strong className={tone?`amount-${tone}`:''}>{value}</strong></div>}
function CountUpCurrency({value}:{value:number}){
  const [display,setDisplay]=useState(0);
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setDisplay(value);return;}
    let frame=0;const started=performance.now();const duration=700;
    const tick=(time:number)=>{const progress=Math.min(1,(time-started)/duration);const eased=1-Math.pow(1-progress,3);setDisplay(value*eased);if(progress<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[value]);
  return <strong className="pulse-earned-value" aria-label={formatCurrency(value)}>{formatCurrency(display)}</strong>;
}
function DashboardCategoryIcon({category}:{category:string}){const props={size:19,strokeWidth:1.8};const key=categoryKey(category);const Icon=key==='rent'?Banknote:key.startsWith('mortgage')?Landmark:key==='maintenance'?Wrench:key==='utilities'?Zap:key==='insurance'?ShieldCheck:key==='management'?ClipboardCheck:key==='leasing'?Receipt:key==='taxes'?Building2:key==='capex'?Hammer:key==='legal'?Scale:key==='distribution'?WalletCards:key==='other-income'?CircleDollarSign:key==='refund'?RotateCcw:key==='review'?ClipboardCheck:FileText;return <span className="ledger-category-icon recent-category-icon" data-category={key} aria-hidden="true"><Icon {...props}/></span>}
function ActionIcon({kind,title}:{kind:'rent'|'document'|'review';title:string}){const props={size:19,strokeWidth:1.8};const lower=title.toLowerCase();const Icon=kind==='rent'?Banknote:kind==='review'?ClipboardCheck:lower.includes('insurance')?ShieldCheck:lower.includes('lease')?FileText:ClipboardCheck;const actionTone=kind==='rent'?'rent':kind==='review'?'review':lower.includes('insurance')?'insurance':lower.includes('lease')?'lease':'document';return <span className="action-icon" data-action={actionTone} aria-hidden="true"><Icon {...props}/></span>}

function CashFlowChart({rows,period,forecast}:{rows:CashPoint[];period:CashPeriod;forecast:{value:number;label:string}|null}){
  const [selectedIndex,setSelectedIndex]=useState<number|null>(null);
  useEffect(()=>setSelectedIndex(null),[period]);
  const w=760,h=250,padX=16,padTop=20,padBottom=30;
  const vals=[0,...rows.map(r=>r.value),...(forecast?[forecast.value]:[])];
  const minValue=Math.min(...vals),maxValue=Math.max(...vals);
  const range=Math.max(1,maxValue-minValue);
  const chartMin=minValue-range*.12,chartMax=maxValue+range*.12;
  const actualRight=forecast?w-padX-86:w-padX;
  const x=(i:number)=>padX+i*((actualRight-padX)/Math.max(1,rows.length-1));
  const y=(v:number)=>padTop+((chartMax-v)/(chartMax-chartMin))*(h-padTop-padBottom);
  const zero=y(0);
  const points=rows.map((r,i)=>`${x(i)},${y(r.value)}`).join(' ');
  const activeIndex=selectedIndex??Math.max(0,rows.length-1);
  const active=rows[activeIndex];
  const tone=(rows[rows.length-1]?.value||0)>=0?'positive':'negative';
  const tickIndexes=new Set([0,.25,.5,.75,1].map(position=>Math.round((rows.length-1)*position)));

  function selectFromPointer(e:React.PointerEvent<SVGSVGElement>){
    const rect=e.currentTarget.getBoundingClientRect();
    const px=Math.max(0,Math.min(rect.width,e.clientX-rect.left));
    const normalized=(px/rect.width)*w;
    const index=Math.max(0,Math.min(rows.length-1,Math.round((normalized-padX)/((actualRight-padX)/Math.max(1,rows.length-1)))));
    setSelectedIndex(index);
  }

  return <div className="pulse-chart-wrap">
    <div className="pulse-chart-summary" aria-live="polite">
      <span>{selectedIndex===null?'Today':active?.fullLabel}</span>
      <strong className={(active?.value||0)<0?'amount-negative':'amount-positive'}>{formatCurrency(active?.value||0)}</strong>
      {selectedIndex!==null&&active&&<small>Day activity <b className={active.periodNet<0?'amount-negative':'amount-positive'}>{formatCurrency(active.periodNet)}</b></small>}
    </div>
    <svg className="pulse-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Interactive cumulative cash flow for ${period}`} onPointerDown={selectFromPointer} onPointerMove={e=>{if(e.pointerType==='mouse'||e.buttons===1)selectFromPointer(e);}} onPointerLeave={()=>setSelectedIndex(null)} onPointerCancel={()=>setSelectedIndex(null)}>
      <line x1={padX} y1={zero} x2={w-padX} y2={zero} className="chart-zero"/>
      <polyline points={points} className={`pulse-chart-line ${tone}`} fill="none"/>
      {forecast&&rows.length>0&&<line x1={x(rows.length-1)} y1={y(rows[rows.length-1].value)} x2={w-padX} y2={y(forecast.value)} className={`pulse-chart-forecast ${forecast.value>=rows[rows.length-1].value?'positive':'negative'}`}/>}
      {selectedIndex!==null&&active&&<><line x1={x(activeIndex)} y1={padTop} x2={x(activeIndex)} y2={h-padBottom} className="pulse-chart-guide"/><circle cx={x(activeIndex)} cy={y(active.value)} r="5" className={`pulse-chart-selected ${active.value>=0?'positive':'negative'}`}/></>}
      {rows.map((r,i)=>tickIndexes.has(i)?<text key={r.key} x={x(i)} y={h-7} textAnchor={i===0?'start':i===rows.length-1?'end':'middle'} className="pulse-chart-label">{r.label}</text>:null)}
      {forecast&&<text x={w-padX} y={h-7} textAnchor="end" className="pulse-chart-label forecast">{forecast.label}</text>}
      <rect x="0" y="0" width={w} height={h-padBottom} fill="transparent"/>
    </svg>
    <div className="pulse-chart-hint">Tap and drag to inspect</div>
  </div>;
}

function buildCashFlowSeries(transactions:Transaction[],period:CashPeriod,propertyId:string):CashPoint[]{
  const today=new Date();today.setHours(0,0,0,0);
  let start:Date;
  if(period==='1M') start=new Date(today.getFullYear(),today.getMonth(),1);
  else if(period==='3M'){start=new Date(today);start.setDate(start.getDate()-89);}
  else if(period==='YTD') start=new Date(today.getFullYear(),0,1);
  else {start=new Date(today);start.setFullYear(start.getFullYear()-1);start.setDate(start.getDate()+1);}
  const posted=transactions.filter(tx=>(tx.status||'posted')==='posted'&&tx.type!=='transfer'&&(!propertyId||tx.property_id===propertyId));
  const byDate=new Map<string,Transaction[]>();
  posted.forEach(tx=>byDate.set(tx.transaction_date,[...(byDate.get(tx.transaction_date)||[]),tx]));
  const rows:CashPoint[]=[];let running=0;
  for(const cursor=new Date(start);cursor<=today;cursor.setDate(cursor.getDate()+1)){
    const key=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
    const dayRows=byDate.get(key)||[];
    const income=dayRows.filter(tx=>tx.type==='income').reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount||0)),0);
    const expense=dayRows.filter(tx=>tx.type==='expense').reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0);
    const periodNet=income-expense;running+=periodNet;
    rows.push({key,label:period==='1M'?String(cursor.getDate()):cursor.toLocaleDateString('en-US',{month:'short',day:'numeric'}),fullLabel:cursor.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}),value:running,periodNet,income,expense});
  }
  return rows;
}

function localDateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}

const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:999,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:650,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:18};
const overlay:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'grid',placeItems:'center',padding:18,zIndex:1000};

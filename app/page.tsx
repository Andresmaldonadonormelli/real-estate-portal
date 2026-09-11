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
import { Banknote, Landmark, Wrench, Zap, ShieldCheck, Receipt, FileText, Building2, Hammer, Scale, WalletCards, CircleDollarSign, ClipboardCheck, RotateCcw, Plus, X, TrendingDown, TrendingUp, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import Toast from '@/components/common/Toast';
import { categoryKey } from '@/lib/accounting';
import FinancialHistoryChart from '@/components/charts/FinancialHistoryChart';
import MiniSparkline from '@/components/charts/MiniSparkline';
import ActionCenter from '@/components/dashboard/ActionCenter';
import RecentActivity from '@/components/dashboard/RecentActivity';
import { buildMonthlyFinancialHistory, type HistoryPeriod, type MonthlyFinancialPoint } from '@/lib/financialHistory';
import { cachedSupabaseRequest, DOCUMENT_FIELDS, historyStart, invalidateSupabaseCache, PROPERTY_FIELDS, TRANSACTION_FIELDS, UNIT_FIELDS } from '@/lib/supabaseData';

type DailyInsight={id:string;kicker:'Changed'|'Watch'|'Progress';title:string;detail:string;tone:'positive'|'warning'|'neutral';kind:'rent'|'expense'|'occupancy';href:string;opened?:boolean;resolved?:boolean};

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [cashPeriod, setCashPeriod] = useState<HistoryPeriod>('1Y');
  const [cashPropertyId, setCashPropertyId] = useState('');
  const [inspectedCashFlow,setInspectedCashFlow]=useState<MonthlyFinancialPoint|null>(null);
  const [briefDirection,setBriefDirection]=useState<'next'|'previous'>('next');
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
  const [dismissedInsightIds,setDismissedInsightIds]=useState<string[]>([]);
  const [briefItems,setBriefItems]=useState<DailyInsight[]>([]);
  const [briefUpdatedAt,setBriefUpdatedAt]=useState<Date|null>(null);
  const [briefIndex,setBriefIndex]=useState(0);
  const briefTouchStart=useRef<{x:number;y:number}|null>(null);
  const briefSwipeHandled=useRef(false);
  const [rentExpanded,setRentExpanded]=useState(false);
  const visitRecorded=useRef(false);

  useEffect(()=>{
    const propertyId=new URLSearchParams(window.location.search).get('reviewProperty');
    if(propertyId)setReviewPropertyId(propertyId);
  },[]);

  const refreshTransactions = useCallback(async () => {
    try {
      invalidateSupabaseCache('dashboard:transactions');
      const r = await withTimeout(Promise.resolve(supabase.from('transactions').select(TRANSACTION_FIELDS).is('archived_at',null).gte('transaction_date',historyStart(121)).order('transaction_date',{ascending:false})), 8000, 'The ledger took too long to refresh.');
      if (!r.error) setTransactions((r.data||[]) as Transaction[]);
    } catch {
      // Background refresh failure should never hide the dashboard.
    }
  }, []);

  const initializeDashboardVisit = useCallback(async (props:Property[],unitRows:Unit[],txRows:Transaction[],docRows:PropertyDocument[]) => {
    const now=new Date(); const nowIso=now.toISOString();
    const sessionKey=`re-portal:dashboard-session:${user.id}`; const activityKey=`re-portal:dashboard-activity:${user.id}`; const snapshotKey=`re-portal:dashboard-brief:${user.id}`;
    const priorActivity=Number(window.localStorage.getItem(activityKey)||0); const newSession=!window.sessionStorage.getItem(sessionKey); const newVisit=newSession||!priorActivity||(now.getTime()-priorActivity)>=30*60*1000;
    window.sessionStorage.setItem(sessionKey,'1'); window.localStorage.setItem(activityKey,String(now.getTime()));
    if(!newVisit){try{const saved=JSON.parse(window.sessionStorage.getItem(snapshotKey)||'null');if(saved?.items){setBriefItems(saved.items);setBriefUpdatedAt(new Date(saved.updatedAt));return;}}catch{}}
    let previousVisit:string|null=null; let events:any[]=[];
    try{const visit=await supabase.from('dashboard_visits').select('last_seen_at,current_visit_started_at').eq('user_id',user.id).maybeSingle();previousVisit=(visit.data as any)?.current_visit_started_at||(visit.data as any)?.last_seen_at||null;if(previousVisit){const eventResult=await supabase.from('app_events').select('id,event_type,entity_type,entity_id,property_id,unit_id,occurred_at,metadata').gt('occurred_at',previousVisit).order('occurred_at',{ascending:false}).limit(50);if(!eventResult.error)events=eventResult.data||[];}}catch{}
    const items=buildDailyBrief(props,unitRows,txRows,docRows,events,previousVisit,now); const snapshot={items,updatedAt:nowIso};
    window.sessionStorage.setItem(snapshotKey,JSON.stringify(snapshot)); setBriefItems(items); setBriefUpdatedAt(now);
    try{await supabase.from('dashboard_visits').upsert({user_id:user.id,previous_visit_at:previousVisit,current_visit_started_at:nowIso,last_seen_at:nowIso,brief_items:items,brief_opened_ids:[],brief_resolved_ids:[],updated_at:nowIso},{onConflict:'user_id'});}catch{}
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
        cachedSupabaseRequest('shared:properties',async()=>await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at',null).order('address')),
        cachedSupabaseRequest('shared:units',async()=>await supabase.from('units').select(UNIT_FIELDS).is('archived_at',null).order('unit_number')),
        cachedSupabaseRequest('dashboard:transactions',async()=>await supabase.from('transactions').select(TRANSACTION_FIELDS).is('archived_at',null).gte('transaction_date',historyStart(121)).order('transaction_date',{ascending:false})),
        cachedSupabaseRequest('dashboard:documents',async()=>await supabase.from('documents').select(DOCUMENT_FIELDS).is('archived_at',null).order('created_at',{ascending:false})),
      ]), 8000, 'Dashboard data took too long to load. Please retry.');
      const err=p.error||u.error||t.error||d.error; if(err) throw err;
      const props=(p.data||[]) as Property[]; const unitRows=(u.data||[]) as Unit[]; const txRows=(t.data||[]) as Transaction[];

      // Show the useful dashboard as soon as the core data arrives.
      const docRows=(d.data||[]) as PropertyDocument[];
      setProperties(props); setUnits(unitRows); setTransactions(txRows); setDocuments(docRows); setLoading(false);
      if(!visitRecorded.current){visitRecorded.current=true;void initializeDashboardVisit(props,unitRows,txRows,docRows);}

      void ensureRecurring(props, unitRows, txRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
      setLoading(false);
    }
  },[ensureRecurring,initializeDashboardVisit]);

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
    invalidateSupabaseCache();await load(); setConfirming(null);
  }
  async function declineRent(tx:Transaction){
    if(!confirm('Remove this rent confirmation for this month? It will not come back this month.')) return;
    const r=await supabase.from('transactions').update({status:'declined',notes:'Recurring rent suggestion declined'}).eq('id',tx.id).eq('status','pending');
    if(r.error)setError(r.error.message); else {invalidateSupabaseCache();await load();}
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
    const items:{id:string;kind:'rent'|'document'|'review';title:string;detail:string;actionLabel?:string;propertyId?:string;days?:number;test?:boolean}[]=[];
    const grouped=new Map<string,number>(); pendingRents.forEach(t=>grouped.set(t.property_id,(grouped.get(t.property_id)||0)+1));
    grouped.forEach((count,propertyId)=>{const prop=properties.find(p=>p.id===propertyId);items.push({id:`rent-${propertyId}`,kind:'rent',propertyId,title:`Confirm ${monthLabel} rent`,detail:`${count} payment${count===1?' is':'s are'} waiting. Confirm them before monthly reporting.`,actionLabel:'Confirm'});});
    const today=new Date(); today.setHours(0,0,0,0);
    documents.filter(d=>d.expires_at).forEach(doc=>{const due=new Date(`${doc.expires_at}T12:00:00`);const days=Math.ceil((due.getTime()-today.getTime())/86400000);const remind=Number(doc.reminder_days||60);if(days<=remind){const prop=properties.find(p=>p.id===doc.property_id);items.push({id:`doc-${doc.id}`,kind:'document',title:days<0?`${doc.category} expired`:days===0?`${doc.category} due today`:`${doc.category} due in ${days} days`,detail:`${prop?.address||'Property'} · ${doc.title}`,days});}});
    const needsReview=transactions.filter(tx=>(tx.status||'posted')==='posted'&&((tx as Transaction & {needs_review?:boolean}).needs_review||tx.category==='Needs Review'));
    if(needsReview.length){items.push({id:'needs-review',kind:'review',title:`Review ${needsReview.length} transaction${needsReview.length===1?'':'s'}`,detail:`Categorize ${needsReview.length===1?'it':'them'} before September reporting.`,actionLabel:'Review',days:-500});}
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
  const now=new Date();
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const rentEarned=expectedMonthlyRent*(now.getDate()/daysInMonth);
  const dailyRent=expectedMonthlyRent/daysInMonth;
  const nonRentIncome=postedThisMonth.filter(tx=>tx.type==='income'&&tx.category!=='Rent').reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount||0)),0);
  const projectedMonthEnd=expectedMonthlyRent+nonRentIncome-monthlyTotals.expense;
  const greeting=now.getHours()<12?'Good morning':now.getHours()<18?'Good afternoon':'Good evening';
  const todayLabel=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  const visibleDailyInsights=briefItems;
  const activeBrief=visibleDailyInsights.length?visibleDailyInsights[Math.min(briefIndex,visibleDailyInsights.length-1)]:null;

  async function dismissDailyInsight(id:string){
    const todayKey=localDateKey(new Date());
    const next=Array.from(new Set([...dismissedInsightIds,id]));
    setDismissedInsightIds(next);
    setBriefItems(items=>items.filter(item=>item.id!==id));
    setBriefIndex(index=>Math.max(0,Math.min(index,visibleDailyInsights.length-2)));
    try{window.localStorage.setItem(`re-portal:dismissed-insights:${user.id}:${todayKey}`,JSON.stringify(next));}catch{}
    try{await supabase.from('dashboard_visits').upsert({user_id:user.id,dismissed_insight_ids:next,dismissed_for_date:todayKey,updated_at:new Date().toISOString()},{onConflict:'user_id'});}catch{}
  }
  async function openDailyInsight(id:string){
    setBriefItems(items=>items.map(item=>item.id===id?{...item,opened:true}:item));
    try{const visit=await supabase.from('dashboard_visits').select('brief_opened_ids').eq('user_id',user.id).maybeSingle();const ids=Array.from(new Set([...(Array.isArray((visit.data as any)?.brief_opened_ids)?(visit.data as any).brief_opened_ids:[]),id]));await supabase.from('dashboard_visits').update({brief_opened_ids:ids,updated_at:new Date().toISOString()}).eq('user_id',user.id);}catch{}
  }

  const cashFlow=useMemo(()=>buildMonthlyFinancialHistory(transactions,cashPeriod,cashPropertyId),[transactions,cashPeriod,cashPropertyId]);
  const periodCashFlow=useMemo(()=>cashFlow.reduce((total,row)=>({cashFlow:total.cashFlow+row.cashFlow,income:total.income+row.income,cashExpenses:total.cashExpenses+row.cashExpenses}),{cashFlow:0,income:0,cashExpenses:0}),[cashFlow]);
  const displayedCashFlow=inspectedCashFlow||periodCashFlow;

  return <div className="dashboard-page pulse-page">
    <header className="pulse-page-header"><div><h1>{greeting}</h1><p>{todayLabel}</p></div>{!loading&&properties.length>0&&<button className="pulse-add-button" type="button" onClick={()=>setShowQuickAdd(true)}><Plus size={18}/><span className="pulse-add-desktop">Add transaction</span><span className="pulse-add-mobile">Add</span></button>}</header>
    {error&&<div style={errorBox}>{error}</div>}
    {loading?<PageSkeleton variant="dashboard"/>:<>
      <div className="pulse-dashboard-grid">
      <main className="pulse-dashboard-main">
        <section className="pulse-performance-open">
          <div className="pulse-chart-head"><span className="pulse-kicker">Net cash flow</span></div>
          <div className="pulse-cash-summary"><strong className={(displayedCashFlow?.cashFlow||0)>=0?'amount-positive':'amount-negative'}>{formatCurrency(displayedCashFlow?.cashFlow||0)}</strong><div className="pulse-cash-breakdown"><span><b>Income</b><strong>{formatCurrency(displayedCashFlow?.income||0)}</strong></span><span><b>Expenses</b><strong>{formatCurrency(displayedCashFlow?.cashExpenses||0)}</strong></span></div></div>
          <FinancialHistoryChart rows={cashFlow} label="Monthly portfolio cash flow and expenses" onInspect={setInspectedCashFlow}/>
          <div className="pulse-chart-controls"><div className={`pulse-periods ${periodCashFlow.cashFlow<0?'is-negative':'is-positive'}`} aria-label="Cash flow period">{(['3M','6M','9M','1Y','3Y','5Y','10Y'] as HistoryPeriod[]).map(period=><button key={period} className={cashPeriod===period?'active':''} onClick={()=>setCashPeriod(period)}>{period}</button>)}</div><div className="pulse-property-select"><select aria-label="Cash flow property" value={cashPropertyId} onChange={e=>setCashPropertyId(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select><ChevronDown size={17} aria-hidden="true"/></div></div>
          <div className="pulse-rent-module"><button type="button" className="pulse-rent-secondary" aria-expanded={rentExpanded} onClick={()=>setRentExpanded(value=>!value)}><span>Rent earned this month <ChevronDown size={17} className={rentExpanded?'is-open':''} aria-hidden="true"/></span><div><strong>{formatCurrency(rentEarned)}</strong><b className="amount-positive">+{formatCurrency(dailyRent)} today</b></div></button>{rentExpanded&&<div className="pulse-rent-pace"><strong>{formatCurrency(dailyRent)} per day</strong><span>for {now.getDate()} days this month</span></div>}</div>
        </section>
      <section className="daily-brief" aria-labelledby="daily-brief-title">
        <div className="daily-brief-heading"><h2 id="daily-brief-title">Daily Brief</h2><p>{briefUpdatedAt?`Updated ${briefUpdatedAt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:'Updating…'}</p></div>
        {activeBrief?<><article key={activeBrief.id} className="daily-insight" data-tone={activeBrief.tone} data-direction={briefDirection} onTouchStart={event=>{const touch=event.touches[0];briefTouchStart.current={x:touch.clientX,y:touch.clientY};briefSwipeHandled.current=false;}} onTouchEnd={event=>{const start=briefTouchStart.current;const touch=event.changedTouches[0];briefTouchStart.current=null;if(!start||visibleDailyInsights.length<2)return;const dx=touch.clientX-start.x;const dy=touch.clientY-start.y;if(Math.abs(dx)<42||Math.abs(dx)<=Math.abs(dy)*1.2)return;briefSwipeHandled.current=true;if(dx<0){setBriefDirection('next');setBriefIndex(index=>(index+1)%visibleDailyInsights.length)}else{setBriefDirection('previous');setBriefIndex(index=>(index-1+visibleDailyInsights.length)%visibleDailyInsights.length)}}}>
          <button type="button" className="daily-insight-dismiss" onClick={()=>void dismissDailyInsight(activeBrief.id)} aria-label={`Dismiss ${activeBrief.kicker}`}><X size={18}/></button>
          <Link href={activeBrief.href} onClick={event=>{if(briefSwipeHandled.current){event.preventDefault();briefSwipeHandled.current=false;return}void openDailyInsight(activeBrief.id)}} className="daily-insight-link"><div className="daily-insight-icon" aria-hidden="true">{activeBrief.kind==='rent'?<Banknote size={19}/>:activeBrief.kind==='expense'?(activeBrief.tone==='positive'?<TrendingDown size={19}/>:<TrendingUp size={19}/>):<Building2 size={19}/>}</div><span>{activeBrief.kicker}</span><strong>{activeBrief.title}</strong><p>{activeBrief.detail}</p></Link>
        </article><div className="daily-brief-pagination"><button type="button" aria-label="Previous brief" onClick={()=>{setBriefDirection('previous');setBriefIndex(index=>(index-1+visibleDailyInsights.length)%visibleDailyInsights.length)}}><ChevronLeft size={18}/></button><span>{Math.min(briefIndex+1,visibleDailyInsights.length)} of {visibleDailyInsights.length}</span><button type="button" aria-label="Next brief" onClick={()=>{setBriefDirection('next');setBriefIndex(index=>(index+1)%visibleDailyInsights.length)}}><ChevronRight size={18}/></button></div></>:<div className="daily-brief-clear"><strong>You’re caught up</strong><span>New portfolio changes will appear on your next visit.</span></div>}
      </section>
      <ActionCenter items={actionItems.map(item=>({...item,detail:`${item.detail}${item.test?' · Test preview':''}`,onSelect:()=>{if(item.kind==='rent'&&item.propertyId){setReviewPropertyId(item.propertyId);setTestPreview(Boolean(item.test));if(item.test)setTestModeActive(true);}else if(!item.test)router.push(item.kind==='review'?'/ledger?review=1':'/ledger')}}))} onViewAll={()=>router.push(testActionsActive?'/actions?test=1':'/actions')}/>
      <RecentActivity items={transactions.filter(t=>(t.status||'posted')==='posted').map(tx=>{const property=properties.find(p=>p.id===tx.property_id);const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return {id:tx.id,title:property?.address||'Portfolio activity',detail:`${tx.description}${unit?.unit_number?` · Unit ${unit.unit_number}`:''} · ${new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`,amount:tx.amount,type:tx.type,href:'/ledger'}})}/>
      </main>
      <aside className="portfolio-rail" aria-labelledby="portfolio-rail-title">
        <div className="portfolio-rail-head"><h2 id="portfolio-rail-title">Properties</h2><Link href="/properties">Manage</Link></div>
        <div className="portfolio-rail-list">{properties.map(property=>{const pu=units.filter(u=>u.property_id===property.id);const history=buildMonthlyFinancialHistory(transactions,cashPeriod,property.id);const propertyCashFlow=history.reduce((sum,row)=>sum+row.cashFlow,0);const status=pu.length>0&&pu.every(u=>u.occupied)?'Fully occupied':propertyCashFlow<0?'Negative cash flow':'Watch expenses';return <Link key={property.id} href={`/properties/${property.id}`} className="portfolio-rail-row">
          <span className="portfolio-rail-copy"><strong>{property.address}</strong><small>{status}</small></span>
          <MiniSparkline rows={history} negative={propertyCashFlow<0}/><strong className={propertyCashFlow>=0?'amount-positive':'amount-negative'}>{formatRailCurrency(propertyCashFlow)}</strong>
        </Link>})}</div>
      </aside>
      </div>
    </>}
    {showQuickAdd&&<AddTransactionModal userId={user.id} properties={properties} units={units} onClose={()=>setShowQuickAdd(false)} onSaved={async message=>{invalidateSupabaseCache();await load();setToast(message||'Transaction added')}}/>}
    {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}
    {reviewPropertyId&&<div style={overlay}><div className="card" style={{width:'100%',maxWidth:620,padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><div><h2 style={{fontSize:'var(--type-section-title-size)'}}>Review {monthLabel} rents</h2>{testPreview&&<div style={{display:'inline-block',marginTop:6,padding:'3px 8px',borderRadius:999,background:'var(--accent-soft)',color:'var(--nav-active-text)',fontSize:'var(--type-label-size)',fontWeight:700}}>TEST PREVIEW</div>}</div><button onClick={()=>{setReviewPropertyId(null);setTestPreview(false);}} style={secondaryButton}>✕</button></div><p style={{color:'var(--text-secondary)',fontSize:'var(--type-small-size)',marginBottom:18}}>{testPreview?'This preview lets you test the rent-review interface today. It does not write anything to your ledger.':"Confirm only the rent payments you actually received. Decline removes that unit's suggestion for this month."}</p><div style={{display:'grid',gap:10}}>
      {testPreview?testReviewUnits.map(unit=><div key={unit.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit.unit_number||'Unit'} · {formatCurrency(Number(unit.current_rent||0))}</strong><div style={{fontSize:'var(--type-small-size)',color:'var(--text-secondary)',marginTop:3}}>{unit.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>resolveTestUnit(unit.id)} style={secondaryButton}>Decline</button><button className="primary-action" onClick={()=>resolveTestUnit(unit.id)} style={primaryButton}>Confirm received</button></div></div>):reviewRents.map(tx=>{const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;return <div key={tx.id} style={{border:'1px solid var(--border-color)',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}><div><strong>{unit?.unit_number||'Unit'} · {formatCurrency(tx.amount)}</strong><div style={{fontSize:'var(--type-small-size)',color:'var(--text-secondary)',marginTop:3}}>{unit?.tenant_name||'Tenant'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>declineRent(tx)} style={secondaryButton}>Decline</button><button className="primary-action" disabled={confirming===tx.id} onClick={()=>confirmRent(tx)} style={primaryButton}>{confirming===tx.id?'Confirming…':'Confirm received'}</button></div></div>})}
      {testPreview&&testReviewUnits.length===0&&<div style={{padding:18,textAlign:'center',color:'var(--text-secondary)',border:'1px solid var(--border-color)',borderRadius:10}}>Test complete. All occupied units were reviewed.</div>}
    </div></div></div>}
  </div>;
}
function PulseMetric({label,value,tone}:{label:string;value:string;tone?:'positive'|'negative'}){return <div className="pulse-metric"><span>{label}</span><strong className={tone?`amount-${tone}`:''}>{value}</strong></div>}
function formatRailCurrency(value:number){return formatCurrency(Math.round(value)).replace(/\.00$/,'')}
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

function localDateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}

function buildDailyBrief(properties:Property[],units:Unit[],transactions:Transaction[],documents:PropertyDocument[],events:any[],previousVisit:string|null,now:Date):DailyInsight[]{
  const since=previousVisit?new Date(previousVisit).getTime():0; const month=now.toISOString().slice(0,7); const items:DailyInsight[]=[]; const recentEvents=events.filter(event=>new Date(event.occurred_at).getTime()>since);
  const changedTx=transactions.filter(tx=>new Date(tx.confirmed_at||tx.created_at||0).getTime()>since&&(tx.status||'posted')!=='pending'); const rentEvent=recentEvents.find(event=>event.event_type==='rent_confirmed'||event.event_type==='rent_declined');
  if(rentEvent){const property=properties.find(p=>p.id===rentEvent.property_id);items.push({id:`changed-${rentEvent.id}`,kicker:'Changed',title:rentEvent.event_type==='rent_confirmed'?'Rent was confirmed':'Rent confirmation was declined',detail:property?.address||'Portfolio rent',tone:'positive',kind:'rent',href:rentEvent.property_id?`/ledger?property=${rentEvent.property_id}`:'/ledger'});}
  else if(changedTx.length){items.push({id:`changed-transactions-${since}`,kicker:'Changed',title:`${changedTx.length} transaction${changedTx.length===1?' was':'s were'} added or updated`,detail:'Since your previous visit',tone:'neutral',kind:'expense',href:'/ledger'});}
  else {const changedDocs=documents.filter(doc=>new Date(doc.created_at||0).getTime()>since);if(changedDocs.length)items.push({id:`changed-docs-${since}`,kicker:'Changed',title:`${changedDocs.length} document${changedDocs.length===1?' was':'s were'} added`,detail:'Since your previous visit',tone:'neutral',kind:'occupancy',href:'/ledger?tab=documents'});}
  const vacant=units.filter(unit=>!unit.occupied).map(unit=>{const property=properties.find(p=>p.id===unit.property_id);const start=(unit as any).vacancy_started_at||(unit as any).lease_end_date||property?.purchase_date||unit.created_at;return{unit,property,days:start?Math.max(0,Math.floor((now.getTime()-new Date(`${String(start).slice(0,10)}T12:00:00`).getTime())/86400000)):0};}).filter(item=>item.days>=14).sort((a,b)=>b.days-a.days)[0];
  if(vacant){items.push({id:`watch-vacancy-${vacant.unit.id}`,kicker:'Watch',title:`${vacant.property?.address||vacant.unit.unit_number} has been vacant for at least ${vacant.days} days`,detail:'Based on the best available vacancy date',tone:'warning',kind:'occupancy',href:`/properties/${vacant.unit.property_id}`});}
  else {const negative=properties.map(property=>({property,cash:buildMonthlyFinancialHistory(transactions,'1Y',property.id).reduce((sum,row)=>sum+row.cashFlow,0)})).sort((a,b)=>a.cash-b.cash)[0];if(negative&&negative.cash<0)items.push({id:`watch-cash-${negative.property.id}`,kicker:'Watch',title:`${negative.property.address} has negative trailing cash flow`,detail:`${formatCurrency(negative.cash)} over the last year`,tone:'warning',kind:'expense',href:`/properties/${negative.property.id}`});}
  const expected=units.filter(unit=>unit.occupied&&unit.recurring_rent_enabled!==false&&Number(unit.current_rent||0)>0);const confirmed=new Set(transactions.filter(tx=>tx.transaction_date.startsWith(month)&&tx.category==='Rent'&&tx.status==='posted').map(tx=>tx.unit_id).filter(Boolean));
  if(expected.length)items.push({id:`progress-rent-${month}`,kicker:'Progress',title:`${confirmed.size} of ${expected.length} ${now.toLocaleString('en-US',{month:'long'})} rents are confirmed`,detail:confirmed.size===expected.length?'All occupied-unit rents are confirmed':'Based only on confirmed posted rent',tone:confirmed.size===expected.length?'positive':'neutral',kind:'rent',href:'/ledger'});
  else items.push({id:`progress-current-${month}`,kicker:'Progress',title:'Your portfolio records are current',detail:'No occupied-unit rent confirmations are expected',tone:'positive',kind:'occupancy',href:'/properties'});
  return items.slice(0,3);
}

const sharedButtonType:React.CSSProperties={fontSize:'var(--type-button-size)',lineHeight:'var(--type-button-line)',fontWeight:'var(--type-button-weight)'};
const primaryButton:React.CSSProperties={...sharedButtonType,padding:'10px 14px',border:0,borderRadius:999,background:'var(--accent)',color:'var(--accent-contrast)',cursor:'pointer'};
const secondaryButton:React.CSSProperties={...sharedButtonType,padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:18};
const overlay:React.CSSProperties={position:'fixed',inset:0,background:'var(--theme-overlay)',display:'grid',placeItems:'center',padding:18,zIndex:1000};

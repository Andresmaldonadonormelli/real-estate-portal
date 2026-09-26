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
import RecentActivity from '@/components/dashboard/RecentActivity';
import { ChartLegend, ProductSelect } from '@/components/common/ProductControls';
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
  const [activeTransaction,setActiveTransaction]=useState<Transaction|null>(null);
  const [addMenuOpen,setAddMenuOpen]=useState(false);
  const addMenuRef=useRef<HTMLDivElement|null>(null);
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
    // Mortgage payments come from linked bank imports (Chase), not synthetic recurring posts.
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
        cachedSupabaseRequest('dashboard:units',async()=>await supabase.from('units').select(`${UNIT_FIELDS},lease_end_date`).is('archived_at',null).order('unit_number')),
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
  useEffect(()=>{if(!addMenuOpen)return;const close=(event:MouseEvent)=>{if(!addMenuRef.current?.contains(event.target as Node))setAddMenuOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setAddMenuOpen(false)};document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)};},[addMenuOpen]);

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
    // Only auto-create a management fee for gross recurring rent suggestions.
    // Chase/Plaid deposits are net payouts and must be split explicitly so income is not double-counted.
    const alreadySplit=transactions.some(row=>row.import_key===`management-fee-split:${tx.id}`||row.import_key===`management-fee:${tx.id}`);
    if(feePercent>0&&tx.source==='recurring'&&!alreadySplit){
      const fee=Math.round(Math.abs(Number(tx.amount))*feePercent)/100;
      const fr=await supabase.from('transactions').upsert({user_id:user.id,property_id:tx.property_id,unit_id:tx.unit_id||null,transaction_date:tx.transaction_date,type:'expense',category:'Management Fee',description:`Management fee (${feePercent}%)`,payee_source:'Property manager',amount:-fee,notes:`Automatically created when rent was confirmed. Rate: ${feePercent}%`,source:'recurring',status:'posted',confirmed_at:new Date().toISOString(),import_key:`management-fee:${tx.id}`},{onConflict:'user_id,import_key',ignoreDuplicates:true});
      if(fr.error)setError(fr.error.message);
    }
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
    const today=new Date(); today.setHours(0,0,0,0);
    documents.filter(d=>d.expires_at).forEach(doc=>{const due=new Date(`${doc.expires_at}T12:00:00`);const days=Math.ceil((due.getTime()-today.getTime())/86400000);const remind=Number(doc.reminder_days||60);if(days<=remind){const prop=properties.find(p=>p.id===doc.property_id);items.push({id:`doc-${doc.id}`,kind:'document',title:days<0?`${doc.category} expired`:days===0?`${doc.category} due today`:`${doc.category} due in ${days} days`,detail:`${prop?.address||'Property'} · ${doc.title}`,days});}});
    const posted=transactions.filter(tx=>(tx.status||'posted')==='posted');const newImports=posted.filter(tx=>tx.source==='plaid'&&tx.is_new_import);const needsCategory=posted.filter(tx=>!(tx.source==='plaid'&&tx.is_new_import)&&((tx as Transaction & {needs_review?:boolean}).needs_review||tx.category==='Needs Review'));
    if(newImports.length){items.push({id:'new-bank-imports',kind:'review',title:`${newImports.length} new bank transaction${newImports.length===1?'':'s'}`,detail:'Review newly imported bank activity.',actionLabel:'Review',days:-501});}
    if(needsCategory.length){items.push({id:'needs-category',kind:'review',title:`${needsCategory.length} transaction${needsCategory.length===1?' needs':'s need'} a category`,detail:`Categorize ${needsCategory.length===1?'it':'them'} before reporting.`,actionLabel:'Review',days:-500});}
    if(testActionsActive){
      const sampleProperty=properties[0];
      items.unshift(
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
  const currentCashFlow=cashFlow[cashFlow.length-1];
  const displayedCashFlow=inspectedCashFlow||currentCashFlow;
  const scopedTransactions=useMemo(()=>cashPropertyId?transactions.filter(tx=>tx.property_id===cashPropertyId):transactions,[transactions,cashPropertyId]);
  const scopedUnits=useMemo(()=>cashPropertyId?units.filter(unit=>unit.property_id===cashPropertyId):units,[units,cashPropertyId]);
  const postedScoped=useMemo(()=>scopedTransactions.filter(tx=>(tx.status||'posted')==='posted'),[scopedTransactions]);
  const rentCollected=useMemo(()=>postedScoped.filter(tx=>tx.transaction_date.startsWith(currentMonth)&&tx.type==='income'&&categoryKey(tx.category)==='rent').reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0),[postedScoped,currentMonth]);
  const rentExpected=useMemo(()=>scopedUnits.filter(unit=>unit.occupied).reduce((sum,unit)=>sum+Math.max(0,Number(unit.current_rent||0)),0),[scopedUnits]);
  const managementFees=useMemo(()=>postedScoped.filter(tx=>tx.transaction_date.startsWith(currentMonth)&&tx.type==='expense'&&categoryKey(tx.category)==='management').reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0),[postedScoped,currentMonth]);
  const pendingBank=useMemo(()=>scopedTransactions.filter(tx=>tx.source==='plaid'&&tx.is_new_import&&(tx.status||'posted')==='posted').length,[scopedTransactions]);
  const pendingRent=useMemo(()=>scopedTransactions.filter(tx=>tx.status==='pending'&&categoryKey(tx.category)==='rent').length,[scopedTransactions]);
  const vacantCount=scopedUnits.filter(unit=>!unit.occupied).length;
  const leaseRisk=useMemo(()=>{
    const today=new Date(); today.setHours(0,0,0,0);
    return scopedUnits.filter(unit=>{
      const end=(unit as Unit & {lease_end_date?:string|null}).lease_end_date;
      if(!end) return false;
      const date=new Date(`${end.slice(0,10)}T12:00:00`);
      const days=Math.ceil((date.getTime()-today.getTime())/86400000);
      return days<=90;
    }).length;
  },[scopedUnits]);
  const expenseBreakdown=useMemo(()=>{
    const keys=new Set(cashFlow.map(row=>row.key));
    const debt=new Set(['mortgage-interest','mortgage-principal','mortgage','capex','distribution']);
    const map=new Map<string,number>();
    postedScoped.forEach(tx=>{
      if(tx.type!=='expense'||!keys.has(tx.transaction_date.slice(0,7))) return;
      const key=categoryKey(tx.category||'');
      if(debt.has(key)) return;
      const label=!tx.category||/needs review|uncategor/i.test(tx.category)?'Uncategorized':tx.category;
      map.set(label,(map.get(label)||0)+Math.abs(Number(tx.amount||0)));
    });
    const items=[...map.entries()].map(([label,amount])=>({label,amount,uncategorized:label==='Uncategorized'})).sort((a,b)=>b.amount-a.amount);
    const total=items.reduce((sum,item)=>sum+item.amount,0);
    const top=items.filter(item=>!item.uncategorized).slice(0,5);
    const uncategorized=items.find(item=>item.uncategorized);
    const rows=uncategorized&&!top.includes(uncategorized)?[...top,uncategorized]:top;
    return {rows:rows.map(item=>({...item,share:total?item.amount/total:0})),total};
  },[cashFlow,postedScoped]);
  const recentItems=postedScoped.map(tx=>{
    const property=properties.find(p=>p.id===tx.property_id);
    const unit=tx.unit_id?unitMap[tx.unit_id]:undefined;
    const bank=tx.source==='plaid'?`${tx.source_institution||'Bank'}${tx.source_account_mask?` •••• ${tx.source_account_mask}`:''} · Imported`:tx.category;
    return {id:tx.id,title:tx.description||tx.payee_source||tx.category,detail:`${property?.address||'Portfolio'}${unit?.unit_number?` · ${unit.unit_number}`:''}`,meta:(tx as Transaction & {needs_review?:boolean}).needs_review?'Category needed':bank,date:new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}),amount:tx.amount,type:tx.type,href:cashPropertyId?`/ledger?property=${cashPropertyId}`:'/ledger'};
  });
  const netValue=displayedCashFlow?.cashFlow||0;
  const netTone=netValue>0?'positive':netValue<0?'negative':'';
  const monthNet=currentCashFlow?.cashFlow||0;
  const monthNetTone=monthNet>0?'positive':monthNet<0?'negative':'';
  const rentProgress=rentExpected>0?Math.min(100,Math.round(rentCollected/rentExpected*100)):0;
  const periodNames:Record<HistoryPeriod,string>={'3M':'Last 3 months','6M':'Last 6 months','9M':'Last 9 months','1Y':'Last 12 months'};

  return <div className="dashboard-operating">
    <header className="dashboard-operating-header">
      <div><h1>{greeting}</h1><p>{todayLabel}</p></div>
      <div className="dashboard-operating-controls">
        {!loading&&<ProductSelect aria-label="Property" value={cashPropertyId} onChange={e=>setCashPropertyId(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</ProductSelect>}
        {!loading&&properties.length>0&&<div className="pulse-add-menu" ref={addMenuRef}><button type="button" className="pulse-add-button" aria-expanded={addMenuOpen} onClick={()=>setAddMenuOpen(open=>!open)}><Plus size={18}/><span>Add</span></button>{addMenuOpen&&<div className="pulse-add-options"><button type="button" onClick={()=>{setShowQuickAdd(true);setAddMenuOpen(false)}}><Banknote size={17}/>Record rent</button><button type="button" onClick={()=>{setShowQuickAdd(true);setAddMenuOpen(false)}}><Receipt size={17}/>Add transaction</button><button type="button" onClick={()=>router.push('/properties?add=1')}><Building2 size={17}/>Add property</button><button type="button" onClick={()=>router.push('/ledger?tab=documents&upload=1')}><FileText size={17}/>Upload document</button></div>}</div>}
      </div>
    </header>
    {error&&<div className="dashboard-retry-box" style={errorBox}><span>{error}</span><button type="button" className="product-secondary-button" onClick={()=>location.reload()}>Try again</button></div>}
    {loading?<PageSkeleton variant="dashboard"/>:<>
      <section className="dashboard-module dashboard-summary" aria-label="Financial summary">
        <div><span>Rent collected</span><strong>{formatKpiCurrency(rentCollected)}</strong><small>of {formatKpiCurrency(rentExpected)} expected</small></div>
        <div><span>Operating expenses</span><strong>{formatKpiCurrency(currentCashFlow?.operatingExpenses||0)}</strong><small>This month</small></div>
        <div><span>Net cash flow</span><strong className={monthNetTone?`amount-${monthNetTone}`:''}>{formatKpiCurrency(monthNet)}</strong><small>This month</small></div>
      </section>
      <div className="dashboard-main-row">
        <section className="dashboard-module dashboard-chart-module" aria-label="Monthly cash flow">
          <div className="dashboard-chart-top">
            <div>
              <h2>{inspectedCashFlow?`${inspectedCashFlow.fullLabel} net cash flow`:'Net cash flow'}</h2>
              <div className={`dashboard-chart-value ${netTone?`amount-${netTone}`:''}`}>{formatKpiCurrency(netValue)}</div>
            </div>
            <div className="dashboard-periods" aria-label="Chart period">{(['3M','6M','9M','1Y'] as HistoryPeriod[]).map(period=><button key={period} type="button" className={cashPeriod===period?'active':''} onClick={()=>setCashPeriod(period)}>{period}</button>)}</div>
          </div>
          <ChartLegend variant="incomeExpense"/>
          <div className="dashboard-chart-meta"><span>Expenses <b>{formatKpiCurrency(displayedCashFlow?.cashExpenses||0)}</b></span><span>Income <b>{formatKpiCurrency(displayedCashFlow?.income||0)}</b></span></div>
          <FinancialHistoryChart rows={cashFlow} mode="cashFlow" kind="incomeExpense" label="Monthly portfolio income and expenses" onInspect={setInspectedCashFlow}/>
        </section>
        <section className="dashboard-module dashboard-rent-status" aria-label="Rent status">
          <h2>Rent status</h2>
          <div className="dashboard-rent-figure">
            <strong>{formatKpiCurrency(rentCollected)}</strong>
            <span>received of {formatKpiCurrency(rentExpected)} expected this month</span>
          </div>
          <span className="dashboard-rent-track" aria-hidden="true"><i style={{width:`${rentProgress}%`}}/></span>
          <div className="dashboard-rent-list">
            {managementFees>0&&<p><span>Management fees deducted</span><b>{formatKpiCurrency(managementFees)}</b></p>}
            {pendingBank>0&&<p><span>Pending bank activity</span><b>{pendingBank} new</b></p>}
            {pendingRent>0&&<p><span>Rent awaiting confirmation</span><b>{pendingRent}</b></p>}
            {scopedUnits.length>0&&vacantCount>0&&<p className="is-warning"><span>Vacant units</span><b>{vacantCount} of {scopedUnits.length}</b></p>}
            {leaseRisk>0&&<p className="is-warning"><span>Lease risk within 90 days</span><b>{leaseRisk}</b></p>}
          </div>
        </section>
      </div>
      <div className="dashboard-lower-row">
        <section className="dashboard-module" aria-label="Operating expenses">
          <h2>Expense breakdown</h2>
          <p className="dashboard-module-kicker">{periodNames[cashPeriod]} · mortgage excluded</p>
          {expenseBreakdown.rows.length?<div className="dashboard-expense-list">{expenseBreakdown.rows.map(item=><div className={`dashboard-expense-row${item.uncategorized?' is-uncategorized':''}`} key={item.label}><strong>{item.label}</strong><b>{formatKpiCurrency(item.amount)}</b><em>{Math.round(item.share*100)}%</em><span className="dashboard-expense-track"><i style={{width:`${Math.round(item.share*100)}%`}}/></span></div>)}</div>:<p className="dashboard-empty">No operating expenses in this range.</p>}
        </section>
        <RecentActivity items={recentItems} ledgerHref={cashPropertyId?`/ledger?property=${cashPropertyId}`:'/ledger'} onOpenTransaction={id=>setActiveTransaction(transactions.find(tx=>tx.id===id)||null)}/>
      </div>
    </>}
    {(showQuickAdd||activeTransaction)&&<AddTransactionModal userId={user.id} properties={properties} units={units} transaction={activeTransaction} viewOnly={Boolean(activeTransaction)} onClose={()=>{setShowQuickAdd(false);setActiveTransaction(null)}} onSaved={async message=>{invalidateSupabaseCache();await load();setToast(message||'Transaction updated')}} onArchived={async (message,id,phase)=>{const archivedId=id||activeTransaction?.id;if(phase!=='complete'&&archivedId)setTransactions(rows=>rows.filter(row=>row.id!==archivedId));if(phase==='complete'){invalidateSupabaseCache();setToast(message||'Transaction deleted')}}} onArchiveFailed={(tx,error)=>{setTransactions(rows=>rows.some(row=>row.id===tx.id)?rows:[tx,...rows]);setToast(error);invalidateSupabaseCache()}}/>}
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
  const changedTx=transactions.filter(tx=>tx.source!=='plaid'&&new Date(tx.confirmed_at||tx.created_at||0).getTime()>since&&(tx.status||'posted')!=='pending'); const rentEvent=recentEvents.find(event=>event.event_type==='rent_confirmed'||event.event_type==='rent_declined');
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

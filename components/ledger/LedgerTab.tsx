'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import { groupTransactionsByMonth, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency, formatDateShort, formatMonthYear } from '@/lib/formatters';
import type { Property, Transaction, Unit } from '@/lib/types';
import { withTimeout } from '@/lib/async';
import { Banknote, Landmark, Wrench, Zap, ShieldCheck, Receipt, FileText, Building2, Hammer, Scale, WalletCards, CircleDollarSign, ClipboardCheck, RotateCcw, BadgeDollarSign, Paperclip, ChevronRight, ChevronDown, Search, SlidersHorizontal, MoreHorizontal, Upload, Download, Plus, X } from 'lucide-react';
import { ACCOUNTING_CATEGORIES, categoryKey, categoryNeedsReview } from '@/lib/accounting';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import Toast from '@/components/common/Toast';

type ViewMode = 'months' | 'table';
type TxType = 'income' | 'expense' | 'transfer';
type CsvRow = Record<string,string>;
type PreviewRow = { row: CsvRow; date:string; propertyId:string; unitId:string|null; unitLabel:string; type:TxType; category:string; description:string; payee:string|null; amount:number; notes:string|null; importKey:string };

const categories = [...ACCOUNTING_CATEGORIES];
const emptyTx = { property_id:'', unit_id:'', transaction_date:new Date().toISOString().slice(0,10), type:'expense' as TxType, category:'Needs Review', description:'', payee_source:'', amount:'', notes:'', needs_review:true };

export default function LedgerTab({ selectedPropertyId, onSelectedPropertyChange }:{ selectedPropertyId:string; onSelectedPropertyChange:(value:string)=>void }) {
  const { user } = useAuth();
  const searchParams=useSearchParams();
  const reviewOnly=searchParams.get('review')==='1';
  const [reviewFilter,setReviewFilter]=useState(reviewOnly);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState(emptyTx);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ search:'', type:'', category:'', min:'', max:'' });
  const [showImport, setShowImport] = useState(false);
  const [importPropertyId, setImportPropertyId] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File|null>(null);
  const [attachmentCounts,setAttachmentCounts]=useState<Record<string,number>>({});
  const [toast,setToast]=useState('');
  const [showSearch,setShowSearch]=useState(false);
  const [showFilters,setShowFilters]=useState(false);
  const [showMore,setShowMore]=useState(false);

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [t,p,u] = await withTimeout(Promise.all([
        supabase.from('transactions').select('*').is('archived_at',null).order('transaction_date',{ascending:false}),
        supabase.from('properties').select('*').is('archived_at',null).order('address'),
        supabase.from('units').select('*').is('archived_at',null).order('unit_number'),
      ]), 8000, 'Ledger data took too long to load. Please retry.');
      const err=t.error||p.error||u.error;
      if(err) throw err;
      setTransactions((t.data||[]) as Transaction[]); setProperties((p.data||[]) as Property[]); setUnits((u.data||[]) as Unit[]);
      const links=await supabase.from('transaction_documents').select('transaction_id');
      if(!links.error){const counts:Record<string,number>={};(links.data||[]).forEach((x:any)=>counts[x.transaction_id]=(counts[x.transaction_id]||0)+1);setAttachmentCounts(counts);}
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Could not load ledger data.');
    } finally { setLoading(false); }
  }
  useEffect(()=>{loadData();},[]);
  useEffect(()=>{setReviewFilter(reviewOnly)},[reviewOnly]);

  const filtered = useMemo(()=>transactions.filter(tx=>{
    const q=filters.search.toLowerCase();
    if(q && ![tx.description,tx.category,tx.payee_source||''].some(v=>v.toLowerCase().includes(q))) return false;
    if(selectedPropertyId && tx.property_id!==selectedPropertyId) return false;
    if(filters.type && tx.type!==filters.type) return false;
    if(filters.category && tx.category!==filters.category) return false;
    if(reviewFilter && !Boolean((tx as Transaction & {needs_review?:boolean}).needs_review)) return false;
    const a=Math.abs(tx.amount);
    if(filters.min && a<Number(filters.min)) return false;
    if(filters.max && a>Number(filters.max)) return false;
    return true;
  }),[transactions,filters,selectedPropertyId,reviewFilter]);

  const total=useMemo(()=>calculateMonthlyTotals(filtered),[filtered]);
  const reviewCount=useMemo(()=>transactions.filter(tx=>(!selectedPropertyId||tx.property_id===selectedPropertyId)&&Boolean((tx as Transaction & {needs_review?:boolean}).needs_review)).length,[transactions,selectedPropertyId]);
  const activeFilterCount=[filters.type,filters.category,filters.min,filters.max].filter(Boolean).length;
  const groups=useMemo(()=>Object.entries(groupTransactionsByMonth(filtered)).sort(([a],[b])=>b.localeCompare(a)).map(([key,txs])=>({key,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),transactions:[...txs].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))})),[filtered]);
  const propertyName=(id:string)=>properties.find(p=>p.id===id)?.address||'Unknown property';
  const unitName=(id?:string|null)=>units.find(u=>u.id===id)?.unit_number||'';

  function openAdd(){setEditing(null);setShowForm(true);}
  function openEdit(tx:Transaction){setEditing(tx);setShowForm(true);}

  async function saveTx(e:FormEvent){
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    const entered=Math.abs(Number(form.amount||0));
    let receiptPath=(editing as (Transaction & {receipt_path?:string|null})|null)?.receipt_path||null;
    if(receiptFile){
      const safe=receiptFile.name.replace(/[^a-zA-Z0-9._-]/g,'-');
      receiptPath=`${user.id}/${crypto.randomUUID()}-${safe}`;
      const upload=await supabase.storage.from('transaction-receipts').upload(receiptPath,receiptFile,{upsert:false});
      if(upload.error){setError(upload.error.message);setSaving(false);return;}
    }
    const payload={user_id:user.id,property_id:form.property_id,unit_id:form.unit_id||null,transaction_date:form.transaction_date,type:form.type,category:form.category,description:form.description.trim(),payee_source:form.payee_source.trim()||null,amount:form.type==='expense'?-entered:entered,notes:form.notes.trim()||null,source:'manual',import_key:null,status:'posted',confirmed_at:new Date().toISOString(),needs_review:form.needs_review,receipt_path:receiptPath};
    const result=editing?await supabase.from('transactions').update(payload).eq('id',editing.id):await supabase.from('transactions').insert(payload);
    if(result.error)setError(result.error.message);else{setShowForm(false);await loadData();} setSaving(false);
  }
  async function deleteTx(tx:Transaction){if(!confirm(`Delete “${tx.description}”?`))return;const recurring=tx.source==='recurring';const result=recurring?await supabase.from('transactions').update({status:'declined',notes:[tx.notes,'Skipped/deleted by owner'].filter(Boolean).join(' · ')}).eq('id',tx.id):await supabase.from('transactions').update({archived_at:new Date().toISOString()}).eq('id',tx.id);if(result.error)setError(result.error.message);else{if(recurring)setNotice('Recurring entry skipped for this month. It will not be recreated.');await loadData();}}

  function exportCsv(){const rows=[['Date','Property','Unit','Description','Category','Payee','Type','Status','Needs Review','Receipt Path','Amount'],...filtered.map(tx=>[tx.transaction_date,propertyName(tx.property_id),unitName(tx.unit_id),tx.description,tx.category,tx.payee_source||'',tx.type,tx.status||'posted',String(Boolean((tx as Transaction & {needs_review?:boolean}).needs_review)),(tx as Transaction & {receipt_path?:string|null}).receipt_path||'',String(tx.amount)])];const csv=rows.map(r=>r.map(v=>`"${String(v).split('"').join('""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ledger.csv';a.click();URL.revokeObjectURL(url);}

  function openImport(){setError('');setNotice('');setPreviewRows([]);setImportFileName('');setImportPropertyId(selectedPropertyId||properties[0]?.id||'');setShowImport(true);}

  async function chooseCsv(file:File|null){
    if(!file)return;
    setError(''); setNotice(''); setImportFileName(file.name);
    try{
      const text=await file.text();
      const rows=parseDoorvestCsv(text);
      const previews=await buildPreview(rows, importPropertyId || properties[0]?.id || '', units);
      setPreviewRows(previews);
    }catch(e){setError(e instanceof Error?e.message:'Could not read CSV.');setPreviewRows([]);}
  }

  async function remapPreview(propertyId:string){
    setImportPropertyId(propertyId);
    if(!previewRows.length)return;
    const rows=previewRows.map(p=>p.row);
    setPreviewRows(await buildPreview(rows,propertyId,units));
  }

  async function importCsv(){
    if(!previewRows.length || !importPropertyId)return;
    setImporting(true);setError('');setNotice('');
    const payload=previewRows.map(p=>({user_id:user.id,property_id:p.propertyId,unit_id:p.unitId,transaction_date:p.date,type:p.type,category:p.category,description:p.description,payee_source:p.payee,amount:p.amount,notes:p.notes,source:'doorvest_csv',import_key:p.importKey,status:'posted',confirmed_at:new Date().toISOString(),needs_review:categoryNeedsReview(p.category)}));
    const {error:e}=await supabase.from('transactions').upsert(payload,{onConflict:'user_id,import_key',ignoreDuplicates:true});
    if(e)setError(e.message);else{setShowImport(false);setNotice(`Import complete. ${payload.length} CSV rows were processed; existing duplicates were skipped.`);await loadData();}
    setImporting(false);
  }

  return <div className="ledger-v230-tab">
    <div className="ledger-v230-primary-row">
      <label className="ledger-v230-property-picker"><span>Property</span><select value={selectedPropertyId} onChange={e=>onSelectedPropertyChange(e.target.value)}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></label>
      <button className="ledger-v230-add" onClick={openAdd} disabled={!properties.length}><Plus size={18}/><span>Add transaction</span></button>
    </div>
    {error&&<div style={errorBox}>{error}</div>}
    {notice&&<div style={noticeBox}>{notice}</div>}
    {!properties.length&&!loading&&<div className="card" style={{padding:18,marginBottom:18}}>Add a property before entering transactions.</div>}

    <div className="ledger-v230-toolbar">
      <div className="ledger-v230-view-switch"><button onClick={()=>setViewMode('table')} className={viewMode==='table'?'active':''}>Table</button><button onClick={()=>setViewMode('months')} className={viewMode==='months'?'active':''}>Months</button></div>
      <div className="ledger-v230-tools">
        <button className={showSearch||filters.search?'active':''} onClick={()=>setShowSearch(v=>!v)} aria-expanded={showSearch} aria-label="Search transactions"><Search size={17}/><span>Search</span></button>
        <button className={showFilters||activeFilterCount?'active':''} onClick={()=>setShowFilters(v=>!v)} aria-expanded={showFilters}><SlidersHorizontal size={17}/><span>Filters</span>{activeFilterCount>0&&<em>{activeFilterCount}</em>}</button>
        {reviewCount>0&&<label className="ledger-v230-review"><span>Needs review</span><em>{reviewCount}</em><input type="checkbox" checked={reviewFilter} onChange={e=>setReviewFilter(e.target.checked)}/><i aria-hidden="true"><b/></i></label>}
        <div className="ledger-v230-more-wrap"><button className={showMore?'active':''} onClick={()=>setShowMore(v=>!v)} aria-label="More ledger actions" aria-expanded={showMore}><MoreHorizontal size={18}/><span>More</span></button>{showMore&&<div className="ledger-v230-more-menu"><button onClick={()=>{setShowMore(false);openImport();}}><Upload size={16}/>Import CSV</button><button onClick={()=>{setShowMore(false);exportCsv();}}><Download size={16}/>Export CSV</button></div>}</div>
      </div>
    </div>
    {showSearch&&<div className="ledger-v230-search"><Search size={18}/><input autoFocus placeholder="Search transactions" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/>{filters.search&&<button onClick={()=>setFilters({...filters,search:''})} aria-label="Clear search"><X size={16}/></button>}</div>}
    {showFilters&&<div className="ledger-v230-filter-panel"><div className="ledger-v230-filter-head"><strong>Filters</strong><button onClick={()=>setShowFilters(false)} aria-label="Close filters"><X size={18}/></button></div>
      <select aria-label="Transaction type" value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select>
      <select aria-label="Transaction category" value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
      <input aria-label="Minimum amount" type="number" min="0" placeholder="Min amount" value={filters.min} onChange={e=>setFilters({...filters,min:e.target.value})}/>
      <input aria-label="Maximum amount" type="number" min="0" placeholder="Max amount" value={filters.max} onChange={e=>setFilters({...filters,max:e.target.value})}/>
      {activeFilterCount>0&&<button className="ledger-v230-clear" onClick={()=>setFilters({...filters,type:'',category:'',min:'',max:''})}>Clear filters</button>}
    </div>}
    {activeFilterCount>0&&<div className="ledger-v230-filter-chips">{filters.type&&<button onClick={()=>setFilters({...filters,type:''})}>Type: {filters.type}<X size={13}/></button>}{filters.category&&<button onClick={()=>setFilters({...filters,category:''})}>{filters.category}<X size={13}/></button>}{filters.min&&<button onClick={()=>setFilters({...filters,min:''})}>Min ${filters.min}<X size={13}/></button>}{filters.max&&<button onClick={()=>setFilters({...filters,max:''})}>Max ${filters.max}<X size={13}/></button>}</div>}

    <div className="ledger-summary-inline"><Metric label="Income" value={formatCurrency(total.income)} tone="positive"/><Metric label="Expenses" value={formatCurrency(total.expense)} tone="negative"/><Metric label="Net" value={formatCurrency(total.net)} tone={total.net>=0?'positive':'negative'}/></div>

    {loading?<PageSkeleton variant="ledger"/>:filtered.length===0?<div className="ledger-empty-state"><strong>No transactions found</strong><span>Try clearing a filter or add a transaction.</span></div>:viewMode==='months'?<div className="ledger-months-list">{groups.map(group=>{const totals=calculateMonthlyTotals(group.transactions);const open=expandedMonths.has(group.key);return <section className={`ledger-month-section ${open?'open':''}`} key={group.key}><button onClick={()=>setExpandedMonths(prev=>{const n=new Set(prev);n.has(group.key)?n.delete(group.key):n.add(group.key);return n;})} className="ledger-month-head"><div className="ledger-month-title"><strong>{formatMonthYear(group.year,group.month)}</strong><span>{group.transactions.length} transactions</span></div><div className="ledger-month-metrics"><span><small>Income</small><b className="amount-positive">{formatCurrency(totals.income)}</b></span><span><small>Expenses</small><b className="amount-negative">{formatCurrency(totals.expense)}</b></span><span><small>Net</small><b className={totals.net>=0?'amount-positive':'amount-negative'}>{formatCurrency(totals.net)}</b></span><ChevronDown size={18} className="ledger-month-chevron"/></div></button>{open&&<div className="ledger-month-transactions">{group.transactions.map(tx=><TxRow key={tx.id} tx={tx} property={propertyName(tx.property_id)} unit={unitName(tx.unit_id)} attachmentCount={(attachmentCounts[tx.id]||0)+((tx as any).receipt_path?1:0)} onEdit={()=>openEdit(tx)}/>)}</div>}</section>})}</div>:<div className="ledger-feed">
      {filtered.map(tx=>{
        const needsReview=Boolean((tx as any).needs_review);
        const attachments=(attachmentCounts[tx.id]||0)+((tx as any).receipt_path?1:0);
        const title=(tx.payee_source||tx.description||tx.category||'Transaction').trim();
        const categoryLabel=needsReview?'':tx.category;
        const propertyLabel=propertyName(tx.property_id);
        const unitLabel=unitName(tx.unit_id);
        return <button type="button" key={tx.id} className="ledger-feed-row" onClick={()=>openEdit(tx)}>
          <span className="ledger-feed-main">
            <span className="ledger-feed-primary">
              <CategoryIcon category={tx.category}/>
              <strong>{title}</strong>
              {needsReview&&<span className="needs-review-badge">Needs review</span>}
            </span>
            <span className="ledger-feed-secondary">
              <span className="ledger-secondary-text">{propertyLabel}{unitLabel?` · ${unitLabel}`:''}{categoryLabel?` · ${categoryLabel}`:''}</span>
              {attachments>0&&<span className="ledger-paperclip" title={`${attachments} supporting ${attachments===1?'document':'documents'}`}><Paperclip size={12}/>{attachments}</span>}
            </span>
          </span>
          <span className="ledger-feed-right"><strong className={tx.type==='income'?'amount-positive':tx.type==='expense'?'amount-negative':''}>{formatCurrency(tx.amount)}</strong><small>{formatDateShort(tx.transaction_date)}</small></span>
          <ChevronRight size={17} className="ledger-feed-chevron"/>
        </button>
      })}
    </div>}

    {showForm&&<AddTransactionModal userId={user.id} properties={properties} units={units} transaction={editing as any} onClose={()=>setShowForm(false)} onSaved={async message=>{await loadData();setToast(message||'Transaction saved')}} onArchived={async message=>{await loadData();setToast(message||'Transaction archived')}}/>}
    {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}
    {showImport&&<Modal title="Import Doorvest CSV" onClose={()=>setShowImport(false)}><div style={{display:'grid',gap:14}}>
      <p style={{fontSize:14,color:'var(--text-secondary)'}}>Import a Doorvest ledger export in bulk. Re-importing the same CSV is safe because duplicate rows are skipped.</p>
      <Field label="Import into property"><select required value={importPropertyId} onChange={e=>remapPreview(e.target.value)} style={inputStyle}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></Field>
      <Field label="CSV file"><input type="file" accept=".csv,text/csv" onChange={e=>chooseCsv(e.target.files?.[0]||null)} style={inputStyle}/></Field>
      {importFileName&&<div style={{fontSize:13,color:'var(--text-secondary)'}}>{importFileName}</div>}
      {previewRows.length>0&&<ImportPreview rows={previewRows}/>} 
      <button disabled={!previewRows.length||importing} onClick={importCsv} style={primaryButton}>{importing?'Importing…':`Import ${previewRows.length || ''} transactions`}</button>
    </div></Modal>}
  </div>;
}

function CategoryIcon({category}:{category:string}){const props={size:19,strokeWidth:1.8};const key=categoryKey(category);const Icon=key==='rent'?Banknote:key.startsWith('mortgage')?Landmark:key==='maintenance'?Wrench:key==='utilities'?Zap:key==='insurance'?ShieldCheck:key==='management'?ClipboardCheck:key==='leasing'?Receipt:key==='taxes'?Building2:key==='capex'?Hammer:key==='legal'?Scale:key==='distribution'?WalletCards:key==='other-income'?CircleDollarSign:key==='refund'?RotateCcw:key==='review'?BadgeDollarSign:FileText;return <span className="ledger-category-icon" data-category={key} aria-hidden="true"><Icon {...props}/></span>}
function TxRow({tx,property,unit,attachmentCount,onEdit}:{tx:Transaction;property:string;unit:string;attachmentCount:number;onEdit:()=>void}){const pending=tx.status==='pending';const needsReview=Boolean((tx as any).needs_review);return <button type="button" className="ledger-feed-row ledger-month-transaction" onClick={onEdit}><span className="ledger-feed-main"><span className="ledger-feed-primary"><CategoryIcon category={tx.category}/><strong>{tx.description}</strong>{needsReview&&<span className="needs-review-badge">Needs review</span>}{pending&&<span className="pending-badge">Pending</span>}</span><span className="ledger-feed-secondary">{property}{unit?` · ${unit}`:''} · {tx.category}{tx.payee_source?` · ${tx.payee_source}`:''}{attachmentCount>0&&<span className="ledger-paperclip"><Paperclip size={12}/>{attachmentCount}</span>}</span></span><span className="ledger-feed-right"><strong className={pending?'':tx.type==='income'?'amount-positive':tx.type==='expense'?'amount-negative':''}>{formatCurrency(tx.amount)}</strong><small>{formatDateShort(tx.transaction_date)}</small></span><ChevronRight size={17} className="ledger-feed-chevron"/></button>}

function Metric({label,value,tone}:{label:string;value:string;tone?:'positive'|'negative'}){return <div className="ledger-summary-metric"><span>{label}</span><strong className={tone?`amount-${tone}`:''}>{value}</strong></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:6,fontSize:13}}>{label}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'grid',placeItems:'center',padding:18,zIndex:1000}}><div className="card" style={{width:'100%',maxWidth:620,maxHeight:'90vh',overflow:'auto',padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}><h2 style={{fontSize:21}}>{title}</h2><button type="button" onClick={onClose} style={secondaryButton}>✕</button></div>{children}</div></div>}
function ImportPreview({rows}:{rows:PreviewRow[]}){const income=rows.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);const expenses=rows.filter(r=>r.type==='expense').reduce((s,r)=>s+Math.abs(r.amount),0);const unmatched=rows.filter(r=>r.unitLabel&&!r.unitId).length;return <div className="card" style={{padding:14}}><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}><Metric label="Rows" value={String(rows.length)}/><Metric label="Income" value={formatCurrency(income)} tone="positive"/><Metric label="Expenses" value={formatCurrency(expenses)} tone="negative"/></div>{unmatched>0&&<div style={{marginTop:12,fontSize:'var(--type-small-size)',color:'var(--danger)'}}>{unmatched} row(s) reference a unit name that does not match an existing unit. They will import at the property level.</div>}<div style={{marginTop:12,maxHeight:190,overflow:'auto',fontSize:'var(--type-label-size)',color:'var(--text-secondary)'}}>{rows.slice(0,12).map((r,i)=><div key={i} style={{padding:'6px 0',borderTop:'1px solid var(--border-color)'}}>{r.date} · {r.unitLabel||'Property'} · {r.description} · {formatCurrency(r.amount)}</div>)}{rows.length>12&&<div style={{paddingTop:8}}>+ {rows.length-12} more rows</div>}</div></div>}

async function buildPreview(rows:CsvRow[],propertyId:string,units:Unit[]):Promise<PreviewRow[]>{
  if(!propertyId)throw new Error('Choose a property first.');
  const propertyUnits=units.filter(u=>u.property_id===propertyId);
  return Promise.all(rows.map(async row=>{
    const date=toIsoDate(row.Date);
    const unitLabel=(row.Unit||'').trim();
    const matched=unitLabel?propertyUnits.find(u=>normalizeUnit(u.unit_number)===normalizeUnit(unitLabel)):undefined;
    const nonOperating=(row['Non-Operating']||'').toLowerCase()==='yes';
    const rawType=(row.Type||'').toLowerCase();
    const type:TxType=nonOperating?'transfer':rawType==='income'?'income':rawType==='expense'?'expense':'transfer';
    const category=normalizeCategory(row.Category||'',row.Account||'');
    const rawAmount=Number(String(row.Amount||'0').replace(/[$,]/g,''))||0;
    const amount=type==='expense'?-Math.abs(rawAmount):rawAmount;
    const description=(row.Description||row.Account||'Imported transaction').trim();
    const payee=(row['Payee/Payer']||'').trim()||null;
    const notes=[row.Account?`Doorvest account: ${row.Account}`:'',nonOperating?'Non-operating transaction':''].filter(Boolean).join(' · ')||null;
    const fingerprint=[date,unitLabel,row.Account||'',description,payee||'',row.Category||'',row.Type||'',row.Amount||''].join('|').toLowerCase();
    return {row,date,propertyId,unitId:matched?.id||null,unitLabel,type,category,description,payee,amount,notes,importKey:await sha256(fingerprint)};
  }));
}
function normalizeCategory(category:string,account:string){const c=category.trim();if(c==='Rental Income')return 'Rent';if(c==='Other Income')return 'Other Income';if(c==='Owner Distribution')return 'Owner Distribution';if(c==='Balance Forward')return 'Balance Forward';if(c==='Mortgage'||c==='Mortgage Payment (Unsplit)'||c==='Mortgage Interest'||c==='Mortgage Principal')return 'Mortgage Payment';if(c==='CapEx')return 'Capital Improvements / CapEx';if(c==='Legal')return 'Legal & Professional';if(c==='Other Expense'&&account.toLowerCase().includes('maintenance'))return 'Repairs & Maintenance';if(categories.includes(c as typeof categories[number]))return c;return 'Needs Review';}
function normalizeUnit(v:string){return v.toLowerCase().replace(/unit/g,'').replace(/#/g,'').replace(/[^a-z0-9]/g,'');}
function toIsoDate(v:string){const m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)throw new Error(`Unsupported date: ${v}`);return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;}
async function sha256(value:string){const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function parseDoorvestCsv(text:string):CsvRow[]{const records=parseCsv(text);const headerIndex=records.findIndex(r=>r[0]==='Date'&&r.includes('Amount'));if(headerIndex<0)throw new Error('Could not find the Doorvest ledger header row.');const headers=records[headerIndex];return records.slice(headerIndex+1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));}
function parseCsv(text:string):string[][]{const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else{if(ch==='"')quoted=true;else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=ch;}}if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}return rows;}

const inputStyle:React.CSSProperties={width:'100%',padding:'10px 11px',border:'1px solid var(--border-color)',borderRadius:10,background:'var(--bg-primary)',color:'var(--text-primary)',fontSize:16};
const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:999,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:600,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const dangerButton:React.CSSProperties={...secondaryButton,color:'var(--danger)'};
const smallButton:React.CSSProperties={padding:'5px 8px',border:'1px solid var(--border-color)',borderRadius:999,background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:12};
const twoCol:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:16,fontSize:13};
const noticeBox:React.CSSProperties={padding:12,color:'var(--text-primary)',border:'1px solid var(--accent)',background:'color-mix(in srgb, var(--accent) 10%, transparent)',borderRadius:8,marginBottom:16,fontSize:13};

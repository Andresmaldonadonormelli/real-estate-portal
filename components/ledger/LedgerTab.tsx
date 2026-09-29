'use client';

import { ProductSelect } from '@/components/common/ProductControls';
import PropertyPicker from '@/components/common/PropertyPicker';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import { groupTransactionsByMonth, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency, formatDateShort, formatMonthYear, shortPropertyName } from '@/lib/formatters';
import type { Property, Transaction, Unit } from '@/lib/types';
import { withTimeout } from '@/lib/async';
import { Paperclip, ChevronDown, Search, SlidersHorizontal, MoreHorizontal, Upload, Download, X } from 'lucide-react';
import { ACCOUNTING_CATEGORIES, categoryKey, categoryNeedsReview } from '@/lib/accounting';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import TransactionDetailModal, { ChaseMark } from '@/components/transactions/TransactionDetailModal';
import Toast from '@/components/common/Toast';
import { cachedSupabaseRequest, invalidateSupabaseCache, PROPERTY_FIELDS, TRANSACTION_FIELDS, UNIT_FIELDS } from '@/lib/supabaseData';
import { Button } from '@/components/ui/Button';
import { Modal as UiModal } from '@/components/ui/Modal';

type ViewMode = 'months' | 'table';
type TxType = 'income' | 'expense' | 'transfer';
type CsvRow = Record<string,string>;
type PreviewRow = { row: CsvRow; date:string; propertyId:string; unitId:string|null; unitLabel:string; type:TxType; category:string; description:string; payee:string|null; amount:number; notes:string|null; importKey:string };

const categories = [...ACCOUNTING_CATEGORIES];
const emptyTx = { property_id:'', unit_id:'', transaction_date:new Date().toISOString().slice(0,10), type:'expense' as TxType, category:'Needs Review', description:'', payee_source:'', amount:'', notes:'', needs_review:true };

export default function LedgerTab({ selectedPropertyId, onSelectedPropertyChange, addRequest=0, onActionHandled }:{ selectedPropertyId:string; onSelectedPropertyChange:(value:string)=>void; addRequest?:number; onActionHandled?:()=>void }) {
  const { user } = useAuth();
  const searchParams=useSearchParams();
  const reviewOnly=searchParams.get('review')==='1';
  const [reviewFilter,setReviewFilter]=useState(reviewOnly);
  const [newImportFilter,setNewImportFilter]=useState(searchParams.get('imports')==='1');
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
  const [formEditing, setFormEditing] = useState(false);
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
  const [showFilters,setShowFilters]=useState(false);
  const [showMore,setShowMore]=useState(false);

  useEffect(()=>{
    const media=window.matchMedia('(max-width: 767px)');
    let locked=false;
    const sync=()=>{
      const shouldLock=showFilters&&media.matches;
      if(shouldLock&&!locked){document.body.style.overflow='hidden';locked=true;}
      else if(!shouldLock&&locked){document.body.style.overflow='';locked=false;}
    };
    sync();
    media.addEventListener('change',sync);
    return()=>{media.removeEventListener('change',sync);if(locked)document.body.style.overflow='';};
  },[showFilters]);

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [t,p,u] = await withTimeout(Promise.all([
        supabase.from('transactions').select(TRANSACTION_FIELDS).is('archived_at',null).order('transaction_date',{ascending:false}).limit(500),
        cachedSupabaseRequest('shared:properties',async()=>await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at',null).order('address')),
        cachedSupabaseRequest('shared:units',async()=>await supabase.from('units').select(UNIT_FIELDS).is('archived_at',null).order('unit_number')),
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
  useEffect(()=>{if(addRequest>0){openAdd();onActionHandled?.()}},[addRequest]);

  const filtered = useMemo(()=>transactions.filter(tx=>{
    const q=filters.search.toLowerCase();
    if(q && ![tx.description,tx.category,tx.payee_source||''].some(v=>v.toLowerCase().includes(q))) return false;
    if(selectedPropertyId && tx.property_id!==selectedPropertyId) return false;
    if(filters.type && tx.type!==filters.type) return false;
    if(filters.category && tx.category!==filters.category) return false;
    if(reviewFilter && (tx.status!=='posted'||!Boolean((tx as Transaction & {needs_review?:boolean}).needs_review)||Boolean(tx.is_new_import))) return false;
    if(newImportFilter && (tx.status!=='posted'||tx.source!=='plaid'||!Boolean(tx.is_new_import))) return false;
    const a=Math.abs(tx.amount);
    if(filters.min && a<Number(filters.min)) return false;
    if(filters.max && a>Number(filters.max)) return false;
    return true;
  }),[transactions,filters,selectedPropertyId,reviewFilter,newImportFilter]);

  const total=useMemo(()=>calculateMonthlyTotals(filtered),[filtered]);
  const reviewCount=useMemo(()=>transactions.filter(tx=>(!selectedPropertyId||tx.property_id===selectedPropertyId)&&tx.status==='posted'&&!tx.is_new_import&&Boolean((tx as Transaction & {needs_review?:boolean}).needs_review)).length,[transactions,selectedPropertyId]);
  const newImportCount=useMemo(()=>transactions.filter(tx=>(!selectedPropertyId||tx.property_id===selectedPropertyId)&&tx.status==='posted'&&tx.source==='plaid'&&Boolean(tx.is_new_import)).length,[transactions,selectedPropertyId]);
  const activeFilterCount=[filters.type,filters.category,filters.min,filters.max,reviewFilter?'review':''].filter(Boolean).length;
  const groups=useMemo(()=>Object.entries(groupTransactionsByMonth(filtered)).sort(([a],[b])=>b.localeCompare(a)).map(([key,txs])=>({key,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),transactions:[...txs].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))})),[filtered]);
  const propertyName=(id:string)=>properties.find(p=>p.id===id)?.address||'Unknown property';
  const propertyKind=(id:string)=>properties.find(p=>p.id===id)?.property_type||'';
  const unitName=(id?:string|null)=>units.find(u=>u.id===id)?.unit_number||'';

  function openAdd(){setEditing(null);setFormEditing(true);setShowForm(true);}
  async function openEdit(tx:Transaction){setEditing(tx);setFormEditing(false);setShowForm(true);if(tx.is_new_import){setTransactions(rows=>rows.map(row=>row.id===tx.id?{...row,is_new_import:false,import_acknowledged_at:new Date().toISOString()}:row));await supabase.from('transactions').update({is_new_import:false,import_acknowledged_at:new Date().toISOString()}).eq('id',tx.id)}}

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
  async function deleteTx(tx:Transaction){
    if(!confirm(`Delete “${tx.description}”?`))return;
    const previous=transactions;
    setTransactions(rows=>rows.filter(row=>row.id!==tx.id));
    setNotice('Transaction deleted.');
    const result=await supabase.from('transactions').update({archived_at:new Date().toISOString()}).eq('id',tx.id);
    if(result.error){
      setTransactions(previous);
      setNotice('');
      setError(result.error.message);
      return;
    }
    invalidateSupabaseCache();
  }

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
    {error&&<div style={errorBox}>{error}</div>}
    {notice&&<div style={noticeBox}>{notice}</div>}
    {!properties.length&&!loading&&<div className="card" style={{padding:18,marginBottom:18}}>Add a property before entering transactions.</div>}

    <div className="ledger-v230-toolbar">
      <PropertyPicker className="ledger-toolbar-property" value={selectedPropertyId} properties={properties} onChange={onSelectedPropertyChange}/>
      <label className="ledger-v230-search ledger-toolbar-search"><Search size={16} aria-hidden="true"/><input placeholder="Search" aria-label="Search transactions" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/>{filters.search&&<button type="button" onClick={()=>setFilters({...filters,search:''})} aria-label="Clear search"><X size={16}/></button>}</label>
      <div className="ledger-v230-tools">
        <button type="button" className={`ledger-filters ${showFilters||activeFilterCount?'active':''}`} onClick={()=>setShowFilters(v=>!v)} aria-expanded={showFilters}><SlidersHorizontal size={17}/><span>Filters</span>{activeFilterCount>0&&<em>{activeFilterCount}</em>}</button>
        <div className="ledger-v230-more-wrap"><button className={showMore?'active':''} onClick={()=>setShowMore(v=>!v)} aria-label="More ledger actions" aria-expanded={showMore}><MoreHorizontal size={18}/></button>{showMore&&<div className="ledger-v230-more-menu">{newImportCount>0&&<button type="button" aria-pressed={newImportFilter} onClick={()=>{setNewImportFilter(value=>!value);setShowMore(false);}}>New imports <em>{newImportCount}</em></button>}<button onClick={()=>{setShowMore(false);openImport();}}><Upload size={16}/>Import CSV</button><button onClick={()=>{setShowMore(false);exportCsv();}}><Download size={16}/>Export CSV</button></div>}</div>
      </div>
    </div>
    {showFilters&&<><button type="button" className="ledger-v230-filter-backdrop" onClick={()=>setShowFilters(false)} aria-label="Close filters"/><div className="ledger-v230-filter-panel"><div className="ledger-v230-filter-head"><strong>Filters</strong><button onClick={()=>setShowFilters(false)} aria-label="Close filters"><X size={18}/></button></div><label className="ledger-v230-search ledger-sheet-search"><Search size={16} aria-hidden="true"/><input placeholder="Search" aria-label="Search transactions" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/>{filters.search&&<button type="button" onClick={()=>setFilters({...filters,search:''})} aria-label="Clear search"><X size={16}/></button>}</label>
      <ProductSelect aria-label="Transaction type" value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></ProductSelect>
      <ProductSelect aria-label="Transaction category" value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</ProductSelect>
      <input aria-label="Minimum amount" type="number" min="0" placeholder="Min amount" value={filters.min} onChange={e=>setFilters({...filters,min:e.target.value})}/>
      <input aria-label="Maximum amount" type="number" min="0" placeholder="Max amount" value={filters.max} onChange={e=>setFilters({...filters,max:e.target.value})}/>
      {(reviewCount>0||reviewFilter)&&<button type="button" className={`ledger-filter-needs ${reviewFilter?'active':''}`} aria-pressed={reviewFilter} onClick={()=>setReviewFilter(value=>!value)}><span>Needs category</span>{reviewCount>0&&<em>{reviewCount}</em>}</button>}
      {activeFilterCount>0&&<button className="ledger-v230-clear" onClick={()=>{setReviewFilter(false);setFilters({...filters,type:'',category:'',min:'',max:''})}}>Clear filters</button>}
      <button className="ledger-v230-filter-apply" onClick={()=>setShowFilters(false)}>Apply filters</button>
    </div></>}
    {activeFilterCount>0&&<div className="ledger-v230-filter-chips">{filters.type&&<button onClick={()=>setFilters({...filters,type:''})}>Type: {filters.type}<X size={13}/></button>}{filters.category&&<button onClick={()=>setFilters({...filters,category:''})}>{filters.category}<X size={13}/></button>}{filters.min&&<button onClick={()=>setFilters({...filters,min:''})}>Min ${filters.min}<X size={13}/></button>}{filters.max&&<button onClick={()=>setFilters({...filters,max:''})}>Max ${filters.max}<X size={13}/></button>}{reviewFilter&&<button onClick={()=>setReviewFilter(false)}>Needs category<X size={13}/></button>}</div>}

    <div className="ledger-summary-inline"><Metric label="Income" value={formatCurrency(total.income)} tone="positive"/><Metric label="Expenses" value={formatCurrency(total.expense)} tone="negative"/><Metric label="Net" value={formatCurrency(total.net)} tone={total.net>=0?'positive':'negative'}/></div>
    <div className="ledger-view-toggle" role="group" aria-label="Ledger view">
      <button type="button" aria-pressed={viewMode==='table'} onClick={()=>setViewMode('table')}>Table</button>
      <button type="button" aria-pressed={viewMode==='months'} onClick={()=>setViewMode('months')}>Months</button>
    </div>

    {loading?<PageSkeleton variant="ledger"/>:filtered.length===0?<div className="ledger-empty-state"><strong>No transactions found</strong><span>Try clearing a filter or add a transaction.</span></div>:viewMode==='months'?<div className="ledger-months-list">{groups.map(group=>{const totals=calculateMonthlyTotals(group.transactions);const open=expandedMonths.has(group.key);return <section className={`ledger-month-section ${open?'open':''}`} key={group.key}><button onClick={()=>setExpandedMonths(prev=>{const n=new Set(prev);n.has(group.key)?n.delete(group.key):n.add(group.key);return n;})} className="ledger-month-head"><div className="ledger-month-title"><strong>{formatMonthYear(group.year,group.month)}</strong><span>{group.transactions.length} transactions</span></div><div className="ledger-month-metrics"><span><small>Income</small><b className="amount-positive">{formatCurrency(totals.income)}</b></span><span><small>Expenses</small><b className="amount-negative">{formatCurrency(totals.expense)}</b></span><span><small>Net</small><b className={totals.net>=0?'amount-positive':'amount-negative'}>{formatCurrency(totals.net)}</b></span><ChevronDown size={18} className="ledger-month-chevron"/></div></button>{open&&<div className="ledger-table">{group.transactions.map(tx=><LedgerRow key={tx.id} tx={tx} property={propertyName(tx.property_id)} kind={propertyKind(tx.property_id)} unit={unitName(tx.unit_id)} attachments={(attachmentCounts[tx.id]||0)+((tx as Transaction & {receipt_path?:string|null}).receipt_path?1:0)} onOpen={()=>openEdit(tx)}/>)}</div>}</section>})}</div>:<div className="ledger-table"><div className="ledger-columns" aria-hidden="true"><span>Transaction</span><span>Property</span><span>Category</span><span>Date</span><span>Amount</span></div>{filtered.map(tx=><LedgerRow key={tx.id} tx={tx} property={propertyName(tx.property_id)} kind={propertyKind(tx.property_id)} unit={unitName(tx.unit_id)} attachments={(attachmentCounts[tx.id]||0)+((tx as Transaction & {receipt_path?:string|null}).receipt_path?1:0)} onOpen={()=>openEdit(tx)}/>)}</div>}

    {showForm&&editing&&!formEditing&&<TransactionDetailModal transaction={editing} properties={properties} units={units} transactions={transactions} onClose={()=>{setShowForm(false);setEditing(null);setFormEditing(false)}} onEdit={()=>setFormEditing(true)} onSaved={async message=>{await loadData();setToast(message||'Transaction saved')}} onArchived={async (message,id,phase)=>{const archivedId=id||editing.id;if(phase!=='complete'&&archivedId)setTransactions(rows=>rows.filter(row=>row.id!==archivedId));if(phase==='complete'){invalidateSupabaseCache();await loadData();setToast(message||'Transaction archived')}}} onArchiveFailed={(tx,error)=>{setTransactions(rows=>rows.some(row=>row.id===tx.id)?rows:[tx,...rows]);setToast(error);invalidateSupabaseCache()}}/>}
    {showForm&&(!editing||formEditing)&&<AddTransactionModal userId={user.id} properties={properties} units={units} transaction={formEditing?editing as any:null} onClose={()=>{if(formEditing&&editing){setFormEditing(false);return;}setShowForm(false);setEditing(null);setFormEditing(false)}} onSaved={async message=>{await loadData();setToast(message||'Transaction saved');setShowForm(false);setEditing(null);setFormEditing(false)}} onArchived={async (message,id,phase)=>{const archivedId=id||editing?.id;if(phase!=='complete'&&archivedId)setTransactions(rows=>rows.filter(row=>row.id!==archivedId));if(phase==='complete'){invalidateSupabaseCache();await loadData();setToast(message||'Transaction archived')}}} onArchiveFailed={(tx,error)=>{setTransactions(rows=>rows.some(row=>row.id===tx.id)?rows:[tx,...rows]);setToast(error);invalidateSupabaseCache()}}/>}
    {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}
    {showImport&&<UiModal title="Import Doorvest CSV" onClose={()=>setShowImport(false)}><div style={{display:'grid',gap:14}}>
      <p style={{fontSize:'var(--type-small-size)',color:'var(--text-secondary)'}}>Import a Doorvest ledger export in bulk. Re-importing the same CSV is safe because duplicate rows are skipped.</p>
      <Field label="Import into property"><select required value={importPropertyId} onChange={e=>remapPreview(e.target.value)} style={inputStyle}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></Field>
      <Field label="CSV file"><input type="file" accept=".csv,text/csv" onChange={e=>chooseCsv(e.target.files?.[0]||null)} style={inputStyle}/></Field>
      {importFileName&&<div style={{fontSize:'var(--type-compact-size)',color:'var(--text-secondary)'}}>{importFileName}</div>}
      {previewRows.length>0&&<ImportPreview rows={previewRows}/>} 
      <Button disabled={!previewRows.length||importing} onClick={importCsv}>{importing?'Importing…':`Import ${previewRows.length || ''} transactions`}</Button>
    </div></UiModal>}
  </div>;
}

function needsCategory(tx:Transaction){return Boolean((tx as Transaction & {needs_review?:boolean}).needs_review)||/needs review|uncategor/i.test(tx.category||'');}
function looksLikeBankDescriptor(value:string){const text=value.trim();if(!text)return false;if(/\b(ach|pos|debit|autopay|auto-pay|auto pay|chk|checkcard|sq \*|tst\*|paypal|visa|mastercard|withdrawal|orig co|ppd|web id|trace)\b/i.test(text))return true;const letters=text.replace(/[^A-Za-z]/g,'');if(letters.length>=10&&letters===letters.toUpperCase())return true;if(/\d{5,}/.test(text))return true;return false;}
function trimRailNoise(value:string){return value.replace(/\b(?:ppd|ach|pos|web|id|trace|chk|checkcard|debit|autopay)\b[:#\s-]*/gi,' ').replace(/\b\d{5,}\b/g,' ').replace(/[^A-Za-z0-9&.' -]+/g,' ').replace(/\s+/g,' ').trim();}
function readableName(value:string){if(value!==value.toUpperCase())return value;return value.toLowerCase().replace(/\b[a-z]/g,letter=>letter.toUpperCase());}
function merchantLabel(tx:Transaction){const payee=(tx.payee_source||'').trim();const description=(tx.description||'').trim();if(payee&&!looksLikeBankDescriptor(payee))return payee;const trimmed=trimRailNoise(description);if(trimmed&&trimmed.length>2&&!looksLikeBankDescriptor(trimmed))return readableName(trimmed);if(description&&!looksLikeBankDescriptor(description))return description;return needsCategory(tx)?'Transaction':(tx.category||'Transaction');}
function isChase(tx:Transaction){return tx.source==='plaid'&&/chase/i.test(tx.source_institution||'');}
function chaseSource(tx:Transaction){if(!isChase(tx))return '';const mask=(tx.source_account_mask||'').replace(/\D/g,'');return mask?`Chase · ••••${mask}`:'Chase';}
function LedgerRow({tx,property,kind,unit,attachments,onOpen}:{tx:Transaction;property:string;kind:string;unit:string;attachments:number;onOpen:()=>void}){const needs=needsCategory(tx);const pending=tx.status==='pending';const source=chaseSource(tx);const meta=Boolean(unit||kind||source);const mobileDetail=[source,shortPropertyName(property),needs?'':tx.category].filter(Boolean).join(' · ');return <button type="button" className={`ledger-table-row ${meta?'has-meta':''}`} onClick={onOpen}><span className="ledger-tx"><strong>{merchantLabel(tx)}{pending?<em>Pending</em>:null}{tx.is_new_import?<i className="ledger-new-dot" aria-label="New import"/>:null}{attachments>0?<Paperclip size={12} aria-hidden="true"/>:null}</strong>{source?<span className="ledger-tx-source"><ChaseMark/>{source}</span>:null}{unit?<span className="ledger-tx-meta">{unit}</span>:null}</span><span className="ledger-mobile-sub">{source?<ChaseMark/>:null}{mobileDetail?<span>{mobileDetail}</span>:null}</span><span className="ledger-property"><b>{property}</b>{kind?<small>{kind}</small>:null}</span><span className={needs?'ledger-needs':'ledger-cell'}>{needs?'Needs category':tx.category}</span><span className="ledger-cell ledger-date">{formatDateShort(tx.transaction_date)}</span><strong className={`ledger-amount ${tx.type==='income'?'amount-positive':tx.type==='expense'?'amount-negative':''}`}>{formatCurrency(tx.amount)}</strong></button>;}

function Metric({label,value,tone}:{label:string;value:string;tone?:'positive'|'negative'}){return <div className="ledger-summary-metric"><span>{label}</span><strong className={tone?`amount-${tone}`:''}>{value}</strong></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:6,fontSize:'var(--type-compact-size)'}}>{label}{children}</label>}
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

const inputStyle:React.CSSProperties={width:'100%',padding:'10px 11px',border:'1px solid var(--border-color)',borderRadius:'var(--radius-control)',background:'var(--bg-primary)',color:'var(--text-primary)',fontSize:'var(--type-body-size)'};
const smallButton:React.CSSProperties={padding:'5px 8px',border:'1px solid var(--border-color)',borderRadius:'var(--radius-pill)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:'var(--type-label-size)'};
const twoCol:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:'var(--radius-control-compact)',marginBottom:16,fontSize:'var(--type-compact-size)'};
const noticeBox:React.CSSProperties={padding:12,color:'var(--text-primary)',border:'1px solid var(--accent)',background:'color-mix(in srgb, var(--accent) 10%, transparent)',borderRadius:'var(--radius-control-compact)',marginBottom:16,fontSize:'var(--type-compact-size)'};

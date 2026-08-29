'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import { groupTransactionsByMonth, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency, formatDateShort, formatMonthYear } from '@/lib/formatters';
import type { Property, Transaction, Unit } from '@/lib/types';
import { withTimeout } from '@/lib/async';

type ViewMode = 'months' | 'table';
type TxType = 'income' | 'expense' | 'transfer';
type CsvRow = Record<string,string>;
type PreviewRow = { row: CsvRow; date:string; propertyId:string; unitId:string|null; unitLabel:string; type:TxType; category:string; description:string; payee:string|null; amount:number; notes:string|null; importKey:string };

const categories = ['Rent','Other Income','Management Fee','Leasing Fee','Repairs & Maintenance','Utilities','Insurance','Property Taxes','Mortgage','CapEx','Legal','Owner Distribution','Balance Forward','Other'];
const emptyTx = { property_id:'', unit_id:'', transaction_date:new Date().toISOString().slice(0,10), type:'expense' as TxType, category:'Repairs & Maintenance', description:'', payee_source:'', amount:'', notes:'' };

export default function LedgerTab({ selectedPropertyId }:{ selectedPropertyId:string }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('months');
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

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [t,p,u] = await withTimeout(Promise.all([
        supabase.from('transactions').select('*').order('transaction_date',{ascending:false}),
        supabase.from('properties').select('*').order('address'),
        supabase.from('units').select('*').order('unit_number'),
      ]), 8000, 'Ledger data took too long to load. Please retry.');
      const err=t.error||p.error||u.error;
      if(err) throw err;
      setTransactions((t.data||[]) as Transaction[]); setProperties((p.data||[]) as Property[]); setUnits((u.data||[]) as Unit[]);
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Could not load ledger data.');
    } finally { setLoading(false); }
  }
  useEffect(()=>{loadData();},[]);

  const filtered = useMemo(()=>transactions.filter(tx=>{
    const q=filters.search.toLowerCase();
    if(q && ![tx.description,tx.category,tx.payee_source||''].some(v=>v.toLowerCase().includes(q))) return false;
    if(selectedPropertyId && tx.property_id!==selectedPropertyId) return false;
    if(filters.type && tx.type!==filters.type) return false;
    if(filters.category && tx.category!==filters.category) return false;
    const a=Math.abs(tx.amount);
    if(filters.min && a<Number(filters.min)) return false;
    if(filters.max && a>Number(filters.max)) return false;
    return true;
  }),[transactions,filters,selectedPropertyId]);

  const total=useMemo(()=>calculateMonthlyTotals(filtered),[filtered]);
  const groups=useMemo(()=>Object.entries(groupTransactionsByMonth(filtered)).sort(([a],[b])=>b.localeCompare(a)).map(([key,txs])=>({key,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),transactions:[...txs].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))})),[filtered]);
  const propertyName=(id:string)=>properties.find(p=>p.id===id)?.address||'Unknown property';
  const unitName=(id?:string|null)=>units.find(u=>u.id===id)?.unit_number||'';

  function openAdd(){setEditing(null);setForm({...emptyTx,property_id:selectedPropertyId||properties[0]?.id||''});setShowForm(true);}
  function openEdit(tx:Transaction){setEditing(tx);setForm({property_id:tx.property_id,unit_id:tx.unit_id||'',transaction_date:tx.transaction_date,type:tx.type,category:tx.category,description:tx.description,payee_source:tx.payee_source||'',amount:String(Math.abs(tx.amount)),notes:tx.notes||''});setShowForm(true);}

  async function saveTx(e:FormEvent){
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    const entered=Math.abs(Number(form.amount||0));
    const payload={user_id:user.id,property_id:form.property_id,unit_id:form.unit_id||null,transaction_date:form.transaction_date,type:form.type,category:form.category,description:form.description.trim(),payee_source:form.payee_source.trim()||null,amount:form.type==='expense'?-entered:entered,notes:form.notes.trim()||null,source:'manual',import_key:null,status:'posted',confirmed_at:new Date().toISOString()};
    const result=editing?await supabase.from('transactions').update(payload).eq('id',editing.id):await supabase.from('transactions').insert(payload);
    if(result.error)setError(result.error.message);else{setShowForm(false);await loadData();} setSaving(false);
  }
  async function deleteTx(tx:Transaction){if(!confirm(`Delete “${tx.description}”?`))return;const recurring=tx.source==='recurring';const result=recurring?await supabase.from('transactions').update({status:'declined',notes:[tx.notes,'Skipped/deleted by owner'].filter(Boolean).join(' · ')}).eq('id',tx.id):await supabase.from('transactions').delete().eq('id',tx.id);if(result.error)setError(result.error.message);else{if(recurring)setNotice('Recurring entry skipped for this month. It will not be recreated.');await loadData();}}

  function exportCsv(){const rows=[['Date','Property','Unit','Description','Category','Payee','Type','Status','Amount'],...filtered.map(tx=>[tx.transaction_date,propertyName(tx.property_id),unitName(tx.unit_id),tx.description,tx.category,tx.payee_source||'',tx.type,tx.status||'posted',String(tx.amount)])];const csv=rows.map(r=>r.map(v=>`"${String(v).split('"').join('""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ledger.csv';a.click();URL.revokeObjectURL(url);}

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
    const payload=previewRows.map(p=>({user_id:user.id,property_id:p.propertyId,unit_id:p.unitId,transaction_date:p.date,type:p.type,category:p.category,description:p.description,payee_source:p.payee,amount:p.amount,notes:p.notes,source:'doorvest_csv',import_key:p.importKey,status:'posted',confirmed_at:new Date().toISOString()}));
    const {error:e}=await supabase.from('transactions').upsert(payload,{onConflict:'user_id,import_key',ignoreDuplicates:true});
    if(e)setError(e.message);else{setShowImport(false);setNotice(`Import complete. ${payload.length} CSV rows were processed; existing duplicates were skipped.`);await loadData();}
    setImporting(false);
  }

  return <div>
    <div className="ledger-actions"><button onClick={openImport} disabled={!properties.length} style={secondaryButton}>Import CSV</button><button onClick={openAdd} disabled={!properties.length} style={primaryButton}>+ Add transaction</button></div>
    {error&&<div style={errorBox}>{error}</div>}
    {notice&&<div style={noticeBox}>{notice}</div>}
    {!properties.length&&!loading&&<div className="card" style={{padding:18,marginBottom:18}}>Add a property before entering transactions.</div>}

    <div className="ledger-view-actions"><button onClick={()=>setViewMode('months')} style={viewMode==='months'?primaryButton:secondaryButton}>Months</button><button onClick={()=>setViewMode('table')} style={viewMode==='table'?primaryButton:secondaryButton}>Table</button><button onClick={exportCsv} style={secondaryButton}>Export</button></div>

    <div className="card ledger-filters">
      <input placeholder="Search transactions" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} style={inputStyle}/>
      <select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})} style={inputStyle}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select>
      <select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})} style={inputStyle}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
      <input type="number" min="0" placeholder="Min amount" value={filters.min} onChange={e=>setFilters({...filters,min:e.target.value})} style={inputStyle}/><input type="number" min="0" placeholder="Max amount" value={filters.max} onChange={e=>setFilters({...filters,max:e.target.value})} style={inputStyle}/>
    </div>

    <div className="card ledger-summary"><Metric label="Income" value={formatCurrency(total.income)} color="var(--accent)"/><Metric label="Expenses" value={formatCurrency(total.expense)} color="var(--danger)"/><Metric label="Net" value={formatCurrency(total.net)} color={total.net>=0?'var(--accent)':'var(--danger)'}/></div>

    {loading?<PageSkeleton variant="ledger"/>:filtered.length===0?<div className="card ledger-empty-state"><strong style={{display:'block',color:'var(--text-primary)',marginBottom:5}}>No transactions found</strong><span>Try clearing a filter or add a transaction.</span></div>:viewMode==='months'?<div style={{display:'grid',gap:12}}>{groups.map(group=>{const totals=calculateMonthlyTotals(group.transactions);const open=expandedMonths.has(group.key);return <div className="card" key={group.key} style={{padding:0,overflow:'hidden'}}><button onClick={()=>setExpandedMonths(prev=>{const n=new Set(prev);n.has(group.key)?n.delete(group.key):n.add(group.key);return n;})} style={{width:'100%',padding:18,border:0,background:'transparent',color:'var(--text-primary)',cursor:'pointer',display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:16,textAlign:'left'}}><div><strong style={{fontSize:18}}>{formatMonthYear(group.year,group.month)}</strong><span style={{marginLeft:10,fontSize:13,color:'var(--text-secondary)'}}>{group.transactions.length} txns</span><div style={{marginTop:10,fontSize:13,color:'var(--text-secondary)'}}>Income <span style={{color:'var(--accent)'}}>{formatCurrency(totals.income)}</span> · Expenses <span style={{color:'var(--danger)'}}>{formatCurrency(totals.expense)}</span></div></div><div style={{textAlign:'right'}}><strong style={{fontSize:18,color:totals.net>=0?'var(--accent)':'var(--danger)'}}>{formatCurrency(totals.net)}</strong><div style={{marginTop:8,color:'var(--text-secondary)'}}>{open?'⌃':'⌄'}</div></div></button>{open&&<div style={{borderTop:'1px solid var(--border-color)'}}>{group.transactions.map(tx=><TxRow key={tx.id} tx={tx} property={propertyName(tx.property_id)} unit={unitName(tx.unit_id)} onEdit={()=>openEdit(tx)} onDelete={()=>deleteTx(tx)}/>)}</div>}</div>})}</div>:<><div className="card ledger-table-wrap"><table style={{minWidth:850}}><thead><tr><th>Date</th><th>Property / Unit</th><th>Description</th><th>Category</th><th>Payee</th><th>Amount</th><th></th></tr></thead><tbody>{filtered.map(tx=><tr key={tx.id}><td>{formatDateShort(tx.transaction_date)}</td><td>{propertyName(tx.property_id)}{unitName(tx.unit_id)?` · ${unitName(tx.unit_id)}`:''}</td><td>{tx.description}</td><td>{tx.category}</td><td>{tx.payee_source||'—'}</td><td style={{color:tx.type==='income'?'var(--accent)':tx.type==='expense'?'var(--danger)':'var(--text-secondary)',fontWeight:600}}>{formatCurrency(tx.amount)}</td><td><button onClick={()=>openEdit(tx)} style={smallButton}>Edit</button></td></tr>)}</tbody></table></div><div className="ledger-mobile-list">{filtered.map(tx=><div key={tx.id} className="card ledger-mobile-card"><div className="ledger-mobile-top"><div><div className="ledger-mobile-meta">{formatDateShort(tx.transaction_date)} · {propertyName(tx.property_id)}{unitName(tx.unit_id)?` · ${unitName(tx.unit_id)}`:''}</div><strong>{tx.description}</strong><div style={{fontSize:12,color:'var(--text-secondary)',marginTop:4}}>{tx.category}{tx.payee_source?` · ${tx.payee_source}`:''}</div></div><div className="ledger-mobile-amount" style={{color:tx.type==='income'?'var(--accent)':tx.type==='expense'?'var(--danger)':'var(--text-secondary)'}}>{formatCurrency(tx.amount)}</div></div><div className="ledger-mobile-actions"><button onClick={()=>openEdit(tx)} style={smallButton}>Edit</button></div></div>)}</div></>}

    {showForm&&<Modal title={editing?'Edit transaction':'Add transaction'} onClose={()=>setShowForm(false)}><form onSubmit={saveTx} style={{display:'grid',gap:12}}><Field label="Property"><select required value={form.property_id} onChange={e=>setForm({...form,property_id:e.target.value,unit_id:''})} style={inputStyle}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></Field><Field label="Unit (optional)"><select value={form.unit_id} onChange={e=>setForm({...form,unit_id:e.target.value})} style={inputStyle}><option value="">Whole property</option>{units.filter(u=>u.property_id===form.property_id).map(u=><option key={u.id} value={u.id}>{u.unit_number}</option>)}</select></Field><div style={twoCol}><Field label="Date"><input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})} style={inputStyle}/></Field><Field label="Type"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value as TxType})} style={inputStyle}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></Field></div><div style={twoCol}><Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inputStyle}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Amount"><input required type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={inputStyle}/></Field></div><Field label="Description"><input required value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={inputStyle}/></Field><Field label="Payee / source"><input value={form.payee_source} onChange={e=>setForm({...form,payee_source:e.target.value})} style={inputStyle}/></Field><Field label="Notes"><textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={inputStyle}/></Field><div className="modal-actions" style={{display:'flex',gap:10,justifyContent:'space-between'}}>{editing?<button type="button" className="danger-action" onClick={()=>deleteTx(editing)} style={dangerButton}>{editing.source==='recurring'?'Skip this month':'Delete'}</button>:<span/>}<button disabled={saving} style={primaryButton}>{saving?'Saving…':'Save transaction'}</button></div></form></Modal>}

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

function TxRow({tx,property,unit,onEdit,onDelete}:{tx:Transaction;property:string;unit:string;onEdit:()=>void;onDelete:()=>void}){const pending=tx.status==='pending';return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,padding:'14px 18px',borderBottom:'1px solid var(--border-color)',opacity:pending?0.72:1}}><div><div style={{fontSize:13,color:'var(--text-secondary)'}}>{formatDateShort(tx.transaction_date)} · {property}{unit?` · ${unit}`:''}</div><div style={{fontWeight:550,marginTop:3}}>{tx.description}{pending&&<span style={{marginLeft:8,fontSize:11,padding:'2px 6px',border:'1px solid var(--border-color)',borderRadius:999,color:'var(--text-secondary)'}}>Pending</span>}</div><div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>{tx.category}{tx.payee_source?` · ${tx.payee_source}`:''}</div></div><div style={{textAlign:'right'}}><div style={{fontWeight:600,color:pending?'var(--text-secondary)':tx.type==='income'?'var(--accent)':tx.type==='expense'?'var(--danger)':'var(--text-secondary)'}}>{formatCurrency(tx.amount)}</div><div style={{display:'flex',gap:5,marginTop:6}}><button onClick={onEdit} style={smallButton}>Edit</button><button className="danger-action" onClick={onDelete} style={{...smallButton,color:'var(--danger)'}}>{tx.source==='recurring'?'Skip month':'Delete'}</button></div></div></div>}
function Metric({label,value,color}:{label:string;value:string;color:string}){return <div><div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{label}</div><div style={{fontSize:18,fontWeight:600,color}}>{value}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:6,fontSize:13}}>{label}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'grid',placeItems:'center',padding:18,zIndex:1000}}><div className="card" style={{width:'100%',maxWidth:620,maxHeight:'90vh',overflow:'auto',padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}><h2 style={{fontSize:21}}>{title}</h2><button type="button" onClick={onClose} style={secondaryButton}>✕</button></div>{children}</div></div>}
function ImportPreview({rows}:{rows:PreviewRow[]}){const income=rows.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);const expenses=rows.filter(r=>r.type==='expense').reduce((s,r)=>s+Math.abs(r.amount),0);const unmatched=rows.filter(r=>r.unitLabel&&!r.unitId).length;return <div className="card" style={{padding:14}}><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}><Metric label="Rows" value={String(rows.length)} color="var(--text-primary)"/><Metric label="Income" value={formatCurrency(income)} color="var(--accent)"/><Metric label="Expenses" value={formatCurrency(expenses)} color="var(--danger)"/></div>{unmatched>0&&<div style={{marginTop:12,fontSize:13,color:'var(--danger)'}}>{unmatched} row(s) reference a unit name that does not match an existing unit. They will import at the property level.</div>}<div style={{marginTop:12,maxHeight:190,overflow:'auto',fontSize:12,color:'var(--text-secondary)'}}>{rows.slice(0,12).map((r,i)=><div key={i} style={{padding:'6px 0',borderTop:'1px solid var(--border-color)'}}>{r.date} · {r.unitLabel||'Property'} · {r.description} · {formatCurrency(r.amount)}</div>)}{rows.length>12&&<div style={{paddingTop:8}}>+ {rows.length-12} more rows</div>}</div></div>}

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
function normalizeCategory(category:string,account:string){const c=category.trim();if(c==='Rental Income')return 'Rent';if(c==='Other Income')return 'Other Income';if(c==='Owner Distribution')return 'Owner Distribution';if(c==='Balance Forward')return 'Balance Forward';if(c==='Other Expense'&&account.toLowerCase().includes('maintenance'))return 'Repairs & Maintenance';if(categories.includes(c))return c;return 'Other';}
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

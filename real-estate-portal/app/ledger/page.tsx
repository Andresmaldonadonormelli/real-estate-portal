'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { groupTransactionsByMonth, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency, formatDateShort, formatMonthYear } from '@/lib/formatters';
import type { Property, Transaction, Unit } from '@/lib/types';

type ViewMode = 'months' | 'table';
type TxType = 'income' | 'expense' | 'transfer';

const categories = ['Rent','Management Fee','Leasing Fee','Repairs & Maintenance','Utilities','Insurance','Property Taxes','Mortgage','CapEx','Legal','Other'];
const emptyTx = { property_id:'', unit_id:'', transaction_date:new Date().toISOString().slice(0,10), type:'expense' as TxType, category:'Repairs & Maintenance', description:'', payee_source:'', amount:'', notes:'' };

export default function LedgerPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('months');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState(emptyTx);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ search:'', propertyId:'', type:'', category:'', min:'', max:'' });

  async function loadData() {
    setLoading(true); setError('');
    const [t,p,u] = await Promise.all([
      supabase.from('transactions').select('*').order('transaction_date',{ascending:false}),
      supabase.from('properties').select('*').order('address'),
      supabase.from('units').select('*').order('unit_number'),
    ]);
    const err=t.error||p.error||u.error;
    if(err) setError(err.message); else { setTransactions((t.data||[]) as Transaction[]); setProperties((p.data||[]) as Property[]); setUnits((u.data||[]) as Unit[]); }
    setLoading(false);
  }
  useEffect(()=>{loadData();},[]);

  const filtered = useMemo(()=>transactions.filter(tx=>{
    const q=filters.search.toLowerCase();
    if(q && ![tx.description,tx.category,tx.payee_source||''].some(v=>v.toLowerCase().includes(q))) return false;
    if(filters.propertyId && tx.property_id!==filters.propertyId) return false;
    if(filters.type && tx.type!==filters.type) return false;
    if(filters.category && tx.category!==filters.category) return false;
    const a=Math.abs(tx.amount);
    if(filters.min && a<Number(filters.min)) return false;
    if(filters.max && a>Number(filters.max)) return false;
    return true;
  }),[transactions,filters]);

  const total=useMemo(()=>calculateMonthlyTotals(filtered),[filtered]);
  const groups=useMemo(()=>Object.entries(groupTransactionsByMonth(filtered)).sort(([a],[b])=>b.localeCompare(a)).map(([key,txs])=>({key,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),transactions:[...txs].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))})),[filtered]);
  const propertyName=(id:string)=>properties.find(p=>p.id===id)?.address||'Unknown property';
  const unitName=(id?:string|null)=>units.find(u=>u.id===id)?.unit_number||'';

  function openAdd(){setEditing(null);setForm({...emptyTx,property_id:properties[0]?.id||''});setShowForm(true);}
  function openEdit(tx:Transaction){setEditing(tx);setForm({property_id:tx.property_id,unit_id:tx.unit_id||'',transaction_date:tx.transaction_date,type:tx.type,category:tx.category,description:tx.description,payee_source:tx.payee_source||'',amount:String(Math.abs(tx.amount)),notes:tx.notes||''});setShowForm(true);}

  async function saveTx(e:FormEvent){
    e.preventDefault(); setSaving(true); setError('');
    const {data:auth}=await supabase.auth.getUser();
    if(!auth.user){setError('You are not signed in.');setSaving(false);return;}
    const entered=Math.abs(Number(form.amount||0));
    const payload={user_id:auth.user.id,property_id:form.property_id,unit_id:form.unit_id||null,transaction_date:form.transaction_date,type:form.type,category:form.category,description:form.description.trim(),payee_source:form.payee_source.trim()||null,amount:form.type==='expense'?-entered:entered,notes:form.notes.trim()||null};
    const result=editing?await supabase.from('transactions').update(payload).eq('id',editing.id):await supabase.from('transactions').insert(payload);
    if(result.error)setError(result.error.message);else{setShowForm(false);await loadData();} setSaving(false);
  }
  async function deleteTx(tx:Transaction){if(!confirm(`Delete “${tx.description}”?`))return;const {error:e}=await supabase.from('transactions').delete().eq('id',tx.id);if(e)setError(e.message);else await loadData();}

  function exportCsv(){const rows=[['Date','Property','Unit','Description','Category','Payee','Type','Amount'],...filtered.map(tx=>[tx.transaction_date,propertyName(tx.property_id),unitName(tx.unit_id),tx.description,tx.category,tx.payee_source||'',tx.type,String(tx.amount)])];const csv=rows.map(r=>r.map(v=>`"${String(v).split('\"').join('\"\"')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ledger.csv';a.click();URL.revokeObjectURL(url);}

  return <div style={{padding:24,maxWidth:1200,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:20}}><h1 style={{fontSize:28,fontWeight:500}}>Ledger</h1><button onClick={openAdd} disabled={!properties.length} style={primaryButton}>+ Add transaction</button></div>
    {error&&<div style={errorBox}>{error}</div>}
    {!properties.length&&!loading&&<div className="card" style={{padding:18,marginBottom:18}}>Add a property before entering transactions.</div>}

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}><button onClick={()=>setViewMode('months')} style={viewMode==='months'?primaryButton:secondaryButton}>Months</button><button onClick={()=>setViewMode('table')} style={viewMode==='table'?primaryButton:secondaryButton}>Table</button><button onClick={exportCsv} style={secondaryButton}>Export</button></div>

    <div className="card" style={{padding:14,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:10,marginBottom:14}}>
      <input placeholder="Search transactions" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} style={inputStyle}/>
      <select value={filters.propertyId} onChange={e=>setFilters({...filters,propertyId:e.target.value})} style={inputStyle}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select>
      <select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})} style={inputStyle}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select>
      <select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})} style={inputStyle}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
      <input type="number" min="0" placeholder="Min amount" value={filters.min} onChange={e=>setFilters({...filters,min:e.target.value})} style={inputStyle}/><input type="number" min="0" placeholder="Max amount" value={filters.max} onChange={e=>setFilters({...filters,max:e.target.value})} style={inputStyle}/>
    </div>

    <div className="card" style={{padding:16,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:18}}><Metric label="Income" value={formatCurrency(total.income)} color="var(--accent)"/><Metric label="Expenses" value={formatCurrency(total.expense)} color="var(--danger)"/><Metric label="Net" value={formatCurrency(total.net)} color={total.net>=0?'var(--accent)':'var(--danger)'}/></div>

    {loading?<p>Loading…</p>:filtered.length===0?<div className="card" style={{padding:22,color:'var(--text-secondary)'}}>No transactions found.</div>:viewMode==='months'?<div style={{display:'grid',gap:12}}>{groups.map(group=>{const totals=calculateMonthlyTotals(group.transactions);const open=expandedMonths.has(group.key);return <div className="card" key={group.key} style={{padding:0,overflow:'hidden'}}><button onClick={()=>setExpandedMonths(prev=>{const n=new Set(prev);n.has(group.key)?n.delete(group.key):n.add(group.key);return n;})} style={{width:'100%',padding:18,border:0,background:'transparent',color:'var(--text-primary)',cursor:'pointer',display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:16,textAlign:'left'}}><div><strong style={{fontSize:18}}>{formatMonthYear(group.year,group.month)}</strong><span style={{marginLeft:10,fontSize:13,color:'var(--text-secondary)'}}>{group.transactions.length} txns</span><div style={{marginTop:10,fontSize:13,color:'var(--text-secondary)'}}>Income <span style={{color:'var(--accent)'}}>{formatCurrency(totals.income)}</span> · Expenses <span style={{color:'var(--danger)'}}>{formatCurrency(totals.expense)}</span></div></div><div style={{textAlign:'right'}}><strong style={{fontSize:18,color:totals.net>=0?'var(--accent)':'var(--danger)'}}>{formatCurrency(totals.net)}</strong><div style={{marginTop:8,color:'var(--text-secondary)'}}>{open?'⌃':'⌄'}</div></div></button>{open&&<div style={{borderTop:'1px solid var(--border-color)'}}>{group.transactions.map(tx=><TxRow key={tx.id} tx={tx} property={propertyName(tx.property_id)} unit={unitName(tx.unit_id)} onEdit={()=>openEdit(tx)} onDelete={()=>deleteTx(tx)}/>)}</div>}</div>})}</div>:<div className="card" style={{overflowX:'auto'}}><table style={{minWidth:850}}><thead><tr><th>Date</th><th>Property / Unit</th><th>Description</th><th>Category</th><th>Payee</th><th>Amount</th><th></th></tr></thead><tbody>{filtered.map(tx=><tr key={tx.id}><td>{formatDateShort(tx.transaction_date)}</td><td>{propertyName(tx.property_id)}{unitName(tx.unit_id)?` · ${unitName(tx.unit_id)}`:''}</td><td>{tx.description}</td><td>{tx.category}</td><td>{tx.payee_source||'—'}</td><td style={{color:tx.type==='income'?'var(--accent)':tx.type==='expense'?'var(--danger)':'var(--text-secondary)',fontWeight:600}}>{tx.type==='expense'?'-':''}{formatCurrency(Math.abs(tx.amount))}</td><td><button onClick={()=>openEdit(tx)} style={smallButton}>Edit</button></td></tr>)}</tbody></table></div>}

    {showForm&&<Modal title={editing?'Edit transaction':'Add transaction'} onClose={()=>setShowForm(false)}><form onSubmit={saveTx} style={{display:'grid',gap:12}}><Field label="Property"><select required value={form.property_id} onChange={e=>setForm({...form,property_id:e.target.value,unit_id:''})} style={inputStyle}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></Field><Field label="Unit (optional)"><select value={form.unit_id} onChange={e=>setForm({...form,unit_id:e.target.value})} style={inputStyle}><option value="">Whole property</option>{units.filter(u=>u.property_id===form.property_id).map(u=><option key={u.id} value={u.id}>{u.unit_number}</option>)}</select></Field><div style={twoCol}><Field label="Date"><input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})} style={inputStyle}/></Field><Field label="Type"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value as TxType})} style={inputStyle}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></Field></div><div style={twoCol}><Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inputStyle}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Amount"><input required type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={inputStyle}/></Field></div><Field label="Description"><input required value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={inputStyle}/></Field><Field label="Payee / source"><input value={form.payee_source} onChange={e=>setForm({...form,payee_source:e.target.value})} style={inputStyle}/></Field><Field label="Notes"><textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={inputStyle}/></Field><div style={{display:'flex',gap:10,justifyContent:'space-between'}}>{editing?<button type="button" onClick={()=>deleteTx(editing)} style={dangerButton}>Delete</button>:<span/>}<button disabled={saving} style={primaryButton}>{saving?'Saving…':'Save transaction'}</button></div></form></Modal>}
  </div>;
}

function TxRow({tx,property,unit,onEdit,onDelete}:{tx:Transaction;property:string;unit:string;onEdit:()=>void;onDelete:()=>void}){return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,padding:'14px 18px',borderBottom:'1px solid var(--border-color)'}}><div><div style={{fontSize:13,color:'var(--text-secondary)'}}>{formatDateShort(tx.transaction_date)} · {property}{unit?` · ${unit}`:''}</div><div style={{fontWeight:550,marginTop:3}}>{tx.description}</div><div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>{tx.category}{tx.payee_source?` · ${tx.payee_source}`:''}</div></div><div style={{textAlign:'right'}}><div style={{fontWeight:600,color:tx.type==='income'?'var(--accent)':tx.type==='expense'?'var(--danger)':'var(--text-secondary)'}}>{tx.type==='expense'?'-':''}{formatCurrency(Math.abs(tx.amount))}</div><div style={{display:'flex',gap:5,marginTop:6}}><button onClick={onEdit} style={smallButton}>Edit</button><button onClick={onDelete} style={{...smallButton,color:'var(--danger)'}}>Delete</button></div></div></div>}
function Metric({label,value,color}:{label:string;value:string;color:string}){return <div><div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{label}</div><div style={{fontSize:18,fontWeight:600,color}}>{value}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:6,fontSize:13}}>{label}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'grid',placeItems:'center',padding:18,zIndex:1000}}><div className="card" style={{width:'100%',maxWidth:560,maxHeight:'90vh',overflow:'auto',padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}><h2 style={{fontSize:21}}>{title}</h2><button type="button" onClick={onClose} style={secondaryButton}>✕</button></div>{children}</div></div>}
const inputStyle:React.CSSProperties={width:'100%',padding:'10px 11px',border:'1px solid var(--border-color)',borderRadius:8,background:'var(--bg-primary)',color:'var(--text-primary)',fontSize:16};
const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:8,background:'var(--accent)',color:'#fff',fontWeight:600,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:8,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const dangerButton:React.CSSProperties={...secondaryButton,color:'var(--danger)'};
const smallButton:React.CSSProperties={padding:'5px 8px',border:'1px solid var(--border-color)',borderRadius:6,background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:12};
const twoCol:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:16,fontSize:13};

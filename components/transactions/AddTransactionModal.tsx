'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, FileText, Paperclip, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, Transaction, Unit } from '@/lib/types';
import { ACCOUNTING_CATEGORIES, categoryNeedsReview } from '@/lib/accounting';

type TxType = 'income' | 'expense' | 'transfer';
type Doc = {id:string;title:string|null;file_name:string;category:string};
type EditableTx = Transaction & {needs_review?:boolean|null;receipt_path?:string|null};

export default function AddTransactionModal({ userId, properties, units, transaction, onClose, onSaved, onArchived }:{
  userId:string; properties:Property[]; units:Unit[]; transaction?:EditableTx|null;
  onClose:()=>void; onSaved:(message?:string)=>void|Promise<void>; onArchived?:(message?:string)=>void|Promise<void>;
}) {
  const editing=Boolean(transaction?.id);
  const [form,setForm]=useState({
    property_id:transaction?.property_id||properties[0]?.id||'', unit_id:transaction?.unit_id||'',
    transaction_date:transaction?.transaction_date||new Date().toISOString().slice(0,10), type:(transaction?.type||'expense') as TxType,
    category:transaction?.category||'Needs Review', description:transaction?.description||'', payee_source:transaction?.payee_source||'',
    amount:transaction?String(Math.abs(Number(transaction.amount||0))):'', needs_review:transaction?Boolean(transaction.needs_review)||categoryNeedsReview(transaction.category):true,
  });
  const [receipt,setReceipt]=useState<File|null>(null);
  const [documents,setDocuments]=useState<Doc[]>([]);
  const [linkedDocumentIds,setLinkedDocumentIds]=useState<string[]>([]);
  const [showMore,setShowMore]=useState(false);
  const [showDocumentPicker,setShowDocumentPicker]=useState(false);
  const [docSearch,setDocSearch]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const propertyUnits=useMemo(()=>units.filter(u=>u.property_id===form.property_id),[units,form.property_id]);
  const filteredDocs=useMemo(()=>documents.filter(d=>`${d.title||''} ${d.file_name} ${d.category}`.toLowerCase().includes(docSearch.toLowerCase())),[documents,docSearch]);

  useEffect(()=>{const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[]);

  useEffect(()=>{let alive=true;(async()=>{if(!form.property_id){setDocuments([]);return;}const r=await supabase.from('documents').select('id,title,file_name,category').eq('property_id',form.property_id).is('archived_at',null).order('created_at',{ascending:false});if(alive&&!r.error)setDocuments((r.data||[]) as Doc[]);})();return()=>{alive=false};},[form.property_id]);
  useEffect(()=>{let alive=true;(async()=>{if(!transaction?.id){setLinkedDocumentIds([]);return;}const r=await supabase.from('transaction_documents').select('document_id').eq('transaction_id',transaction.id);if(alive&&!r.error)setLinkedDocumentIds((r.data||[]).map((x:any)=>x.document_id));})();return()=>{alive=false};},[transaction?.id]);

  function toggleDocument(id:string){setLinkedDocumentIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
  async function syncDocumentLinks(transactionId:string){const del=await supabase.from('transaction_documents').delete().eq('transaction_id',transactionId);if(del.error)throw del.error;if(linkedDocumentIds.length){const ins=await supabase.from('transaction_documents').insert(linkedDocumentIds.map(document_id=>({user_id:userId,transaction_id:transactionId,document_id})));if(ins.error)throw ins.error;}}

  async function submit(e:FormEvent){
    e.preventDefault(); setSaving(true); setError('');
    try{
      let receiptPath=transaction?.receipt_path||null;
      if(receipt){const safe=receipt.name.replace(/[^a-zA-Z0-9._-]/g,'-');receiptPath=`${userId}/${crypto.randomUUID()}-${safe}`;const upload=await supabase.storage.from('transaction-receipts').upload(receiptPath,receipt,{upsert:false});if(upload.error)throw upload.error;}
      const entered=Math.abs(Number(form.amount||0));
      const payload={user_id:userId,property_id:form.property_id,unit_id:form.unit_id||null,transaction_date:form.transaction_date,type:form.type,category:form.category,description:form.description.trim()||form.payee_source.trim()||form.category,payee_source:form.payee_source.trim()||null,amount:form.type==='expense'?-entered:entered,notes:null,source:transaction?.source||'manual',import_key:transaction?.import_key||null,status:transaction?.status==='pending'?'pending':'posted',confirmed_at:transaction?.confirmed_at||new Date().toISOString(),needs_review:form.needs_review||categoryNeedsReview(form.category),receipt_path:receiptPath};
      let transactionId=transaction?.id||'';
      if(editing){const result=await supabase.from('transactions').update(payload).eq('id',transaction!.id).select('id').single();if(result.error)throw result.error;transactionId=result.data.id;}
      else{const result=await supabase.from('transactions').insert(payload).select('id').single();if(result.error)throw result.error;transactionId=result.data.id;}
      await syncDocumentLinks(transactionId); await onSaved(editing?'Transaction updated':'Transaction added'); onClose();
    }catch(err){setError(err instanceof Error?err.message:'Could not save transaction.');}finally{setSaving(false);}
  }

  async function archive(){
    if(!transaction)return;const recurring=transaction.source==='recurring';if(!confirm(recurring?'Skip this recurring transaction for this month?':'Archive this transaction?'))return;setSaving(true);setError('');
    const r=recurring?await supabase.from('transactions').update({status:'declined',notes:[transaction.notes,'Skipped by owner'].filter(Boolean).join(' · ')}).eq('id',transaction.id):await supabase.from('transactions').update({archived_at:new Date().toISOString()}).eq('id',transaction.id);
    if(r.error){setError(r.error.message);setSaving(false);return;}await onArchived?.(recurring?'Recurring transaction skipped':'Transaction archived');onClose();setSaving(false);
  }

  const linkedDocs=documents.filter(d=>linkedDocumentIds.includes(d.id));
  return <div className="quick-add-overlay" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
    <div className="quick-add-modal card" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
      <div className="quick-add-head"><div><div className="eyebrow">LEDGER</div><h2 id="quick-add-title">{editing?'Edit transaction':'Add transaction'}</h2><p>{editing?'Update the accounting details or supporting documents.':'Get it in now. Categorize it later if needed.'}</p></div><button className="icon-close" type="button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
      {error&&<div className="quick-add-error">{error}</div>}
      <form onSubmit={submit} className="quick-add-form">
        <div className="quick-add-two"><label>Amount<input autoFocus={!editing} required inputMode="decimal" type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Property<select required value={form.property_id} onChange={e=>{setForm({...form,property_id:e.target.value,unit_id:''});setLinkedDocumentIds([])}}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></label></div>
        {propertyUnits.length>0&&<div className="unit-chip-field"><span>Applies to</span><div className="unit-chips"><button type="button" className={!form.unit_id?'active':''} onClick={()=>setForm({...form,unit_id:''})}>Property-wide</button>{propertyUnits.map(u=><button type="button" key={u.id} className={form.unit_id===u.id?'active':''} onClick={()=>setForm({...form,unit_id:u.id})}>{u.unit_number}</button>)}</div></div>}
        <div className="quick-add-two"><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value,needs_review:categoryNeedsReview(e.target.value)})}>{ACCOUNTING_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Date<input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/></label></div>
        <div className="quick-add-two"><label><span className="quick-add-label-title">Type</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value as TxType})}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label></div>
        <button type="button" className={`quick-add-more ${showMore?'expanded':''}`} onClick={()=>setShowMore(v=>!v)}><span>{showMore?'Hide additional details':'Add details'}</span><ChevronDown size={16} aria-hidden="true"/></button>
        {showMore&&<div className="quick-add-more-panel">
          <label><span className="quick-add-label-title">Vendor / payee <em>(optional)</em></span><input value={form.payee_source} onChange={e=>setForm({...form,payee_source:e.target.value})}/></label>
          <label>Note <span>(optional)</span><textarea rows={2} placeholder="Anything useful to remember" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <div className="supporting-docs-box"><div className="supporting-docs-head"><div><strong>Supporting documents</strong><span>Receipts, policies, invoices or other paperwork.</span></div><Paperclip size={17}/></div>
            {linkedDocs.length>0&&<div className="linked-doc-chips">{linkedDocs.map(d=><button type="button" key={d.id} onClick={()=>toggleDocument(d.id)} title="Remove link"><FileText size={13}/>{d.title||d.file_name}<X size={12}/></button>)}</div>}
            <div className="supporting-doc-actions"><label className="upload-doc-button">Upload new<input type="file" accept="image/*,.pdf" onChange={e=>setReceipt(e.target.files?.[0]||null)}/></label><button type="button" onClick={()=>setShowDocumentPicker(v=>!v)}>Link existing</button></div>
            {receipt&&<small className="selected-file"><Check size={13}/> {receipt.name}</small>}
            {showDocumentPicker&&<div className="document-picker"><div className="document-search"><Search size={14}/><input placeholder="Search property documents" value={docSearch} onChange={e=>setDocSearch(e.target.value)}/></div>{filteredDocs.length?filteredDocs.map(d=><button type="button" key={d.id} className={linkedDocumentIds.includes(d.id)?'selected':''} onClick={()=>toggleDocument(d.id)}><span><FileText size={15}/><span><strong>{d.title||d.file_name}</strong><small>{d.category}</small></span></span>{linkedDocumentIds.includes(d.id)&&<Check size={15}/>}</button>):<div className="document-picker-empty">No documents for this property yet.</div>}</div>}
          </div>
          <label className="review-check"><input type="checkbox" checked={form.needs_review} onChange={e=>setForm({...form,needs_review:e.target.checked})}/><span><strong>Needs review</strong><small>Use only when the accounting category is genuinely uncertain.</small></span></label>
        </div>}
        <div className="quick-add-footer">{editing?<button type="button" className="transaction-archive-button" disabled={saving} onClick={archive}>{transaction?.source==='recurring'?'Skip month':'Archive'}</button>:<span/>}<button className="quick-add-submit" disabled={saving||!properties.length}>{saving?'Saving…':editing?'Save changes':'Save transaction'}</button></div>
      </form>
    </div>
  </div>;
}

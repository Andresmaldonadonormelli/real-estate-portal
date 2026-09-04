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
    category:(transaction?.category&&['Mortgage Payment (Unsplit)','Mortgage Interest','Mortgage Principal','Mortgage'].includes(transaction.category)?'Mortgage Payment':transaction?.category)||'Needs Review', description:transaction?.description||'', payee_source:transaction?.payee_source||'',
    amount:transaction?String(Math.abs(Number(transaction.amount||0))):'', needs_review:transaction?Boolean(transaction.needs_review):true,
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
  const selectedProperty=useMemo(()=>properties.find(p=>p.id===form.property_id),[properties,form.property_id]);
  const recurringMortgage=Boolean(editing&&transaction?.source==='recurring'&&['Mortgage Payment','Mortgage Payment (Unsplit)'].includes(transaction?.category||''));
  const isMortgage=['Mortgage Payment','Mortgage Payment (Unsplit)','Mortgage Interest','Mortgage Principal'].includes(form.category);
  const [mortgageSplit,setMortgageSplit]=useState({principal:String(Number((transaction as any)?.mortgage_principal_amount||0)||''),interest:String(Number((transaction as any)?.mortgage_interest_amount||0)||''),escrow:String(Number((transaction as any)?.mortgage_escrow_amount||0)||'')});
  const mortgageAllocated=['principal','interest','escrow'].reduce((sum,key)=>sum+Math.max(0,Number((mortgageSplit as any)[key]||0)),0);
  const mortgageAmount=Math.abs(Number(form.amount||0));
  const mortgageSplitComplete=isMortgage&&mortgageAllocated>0&&Math.abs(mortgageAllocated-mortgageAmount)<0.01;
  const [recurringEnabled,setRecurringEnabled]=useState(()=>selectedProperty?(selectedProperty as any).mortgage_recurring_enabled!==false:true);

  useEffect(()=>{if(selectedProperty)setRecurringEnabled((selectedProperty as any).mortgage_recurring_enabled!==false)},[selectedProperty?.id]);

  const reviewReason=isMortgage&&!mortgageSplitComplete
    ? 'The mortgage payment is confirmed, but its principal, interest and escrow breakdown is incomplete. Complete the split below or mark it reviewed if you intentionally want to leave it unsplit.'
    : form.category==='Needs Review'
      ? 'Choose the correct accounting category before year-end reporting, or mark reviewed if this classification is intentional.'
      : 'This transaction was flagged for an owner accounting check. Review the category and supporting details, then mark it reviewed.';

  async function toggleRecurringMortgage(){
    if(!selectedProperty)return;
    const next=!recurringEnabled;
    setRecurringEnabled(next);
    const r=await supabase.from('properties').update({mortgage_recurring_enabled:next}).eq('id',selectedProperty.id);
    if(r.error){setRecurringEnabled(!next);setError(r.error.message);}
  }

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
      const payload={user_id:userId,property_id:form.property_id,unit_id:form.unit_id||null,transaction_date:form.transaction_date,type:form.type,category:isMortgage?'Mortgage Payment':form.category,description:form.description.trim()||form.payee_source.trim()||form.category,payee_source:form.payee_source.trim()||null,amount:form.type==='expense'?-entered:entered,notes:null,source:transaction?.source||'manual',import_key:transaction?.import_key||null,status:transaction?.status==='pending'?'pending':'posted',confirmed_at:transaction?.confirmed_at||new Date().toISOString(),needs_review:isMortgage&&mortgageSplitComplete?false:form.needs_review,receipt_path:receiptPath,mortgage_principal_amount:isMortgage?(Number(mortgageSplit.principal||0)||null):null,mortgage_interest_amount:isMortgage?(Number(mortgageSplit.interest||0)||null):null,mortgage_escrow_amount:isMortgage?(Number(mortgageSplit.escrow||0)||null):null};
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
        <div className="quick-add-two"><label>Category<select value={form.category} onChange={e=>{const category=e.target.value;setForm({...form,category,needs_review:categoryNeedsReview(category)})}}>{ACCOUNTING_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Date<input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/></label></div>
        <div className="quick-add-two"><label><span className="quick-add-label-title">Type</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value as TxType})}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label></div>
        {isMortgage&&<div className="mortgage-split-box">
          <div className="mortgage-split-head"><div><strong>Split mortgage payment</strong><small>Allocate this payment between principal, interest and escrow.</small></div><span className={mortgageSplitComplete?'complete':''}>{mortgageAllocated.toLocaleString(undefined,{style:'currency',currency:'USD'})} / {mortgageAmount.toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>
          <div className="mortgage-split-fields">
            <label>Principal<input inputMode="decimal" type="number" min="0" step="0.01" value={mortgageSplit.principal} onChange={e=>setMortgageSplit({...mortgageSplit,principal:e.target.value})}/></label>
            <label>Interest<input inputMode="decimal" type="number" min="0" step="0.01" value={mortgageSplit.interest} onChange={e=>setMortgageSplit({...mortgageSplit,interest:e.target.value})}/></label>
            <label>Escrow<input inputMode="decimal" type="number" min="0" step="0.01" value={mortgageSplit.escrow} onChange={e=>setMortgageSplit({...mortgageSplit,escrow:e.target.value})}/></label>
          </div>
          <small className={mortgageSplitComplete?'mortgage-split-ok':'mortgage-split-note'}>{mortgageSplitComplete?'Fully allocated. This payment can leave the review queue.':mortgageAllocated>mortgageAmount?'Allocated amount is higher than the payment.':'Any unallocated amount can remain in Needs Review until you have the statement.'}</small>
        </div>}
        {recurringMortgage&&<div style={{padding:'14px 15px',borderRadius:16,background:'var(--surface-subtle, rgba(127,127,127,.08))',display:'grid',gap:8}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'flex-start'}}>
            <div><strong style={{display:'block',fontSize:14}}>Recurring mortgage payment</strong><small style={{display:'block',marginTop:4,color:'var(--text-secondary)'}}>Monthly · day {Number((selectedProperty as any)?.mortgage_due_day||1)}{Number((selectedProperty as any)?.monthly_mortgage_payment||0)>0?` · $${Number((selectedProperty as any).monthly_mortgage_payment).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:''}</small></div>
            <button type="button" onClick={toggleRecurringMortgage} style={{border:0,borderRadius:999,padding:'7px 11px',background:'var(--surface-strong, rgba(127,127,127,.14))',color:'var(--text-primary)',fontWeight:650,cursor:'pointer'}}>{recurringEnabled?'Pause':'Resume'}</button>
          </div>
          <small style={{color:'var(--text-secondary)'}}>{recurringEnabled?'Future monthly mortgage entries will continue to post automatically.':'Future monthly mortgage entries are paused. This transaction is unchanged.'}</small>
        </div>}
        {(form.needs_review||transaction?.needs_review)&&<div style={{padding:'14px 15px',borderRadius:16,background:'rgba(196,127,0,.09)',display:'grid',gap:8}}>
          <div><strong style={{display:'block',fontSize:14}}>Why this needs review</strong><small style={{display:'block',marginTop:5,color:'var(--text-secondary)',lineHeight:1.45}}>{reviewReason}</small></div>
          {form.needs_review&&<button type="button" onClick={()=>setForm({...form,needs_review:false})} style={{justifySelf:'start',border:0,borderRadius:999,padding:'8px 12px',background:'var(--text-primary)',color:'var(--bg-primary)',fontWeight:700,cursor:'pointer'}}>Mark reviewed</button>}
          {!form.needs_review&&<small style={{color:'var(--text-secondary)'}}>Marked reviewed. Save changes to keep it cleared.</small>}
        </div>}
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
          <label className="review-check"><input type="checkbox" checked={form.needs_review} onChange={e=>setForm({...form,needs_review:e.target.checked})}/><span><strong>Needs review</strong><small>Turn this on only when you want this transaction to return to the review queue.</small></span></label>
        </div>}
        <div className="quick-add-footer">{editing?<button type="button" className="transaction-archive-button" disabled={saving} onClick={archive}>{transaction?.source==='recurring'?'Skip month':'Archive'}</button>:<span/>}<button className="quick-add-submit" disabled={saving||!properties.length}>{saving?'Saving…':editing?'Save changes':'Save transaction'}</button></div>
      </form>
    </div>
  </div>;
}

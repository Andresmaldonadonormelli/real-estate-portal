'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { X, Paperclip } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, Unit } from '@/lib/types';
import { ACCOUNTING_CATEGORIES, categoryNeedsReview } from '@/lib/accounting';

type TxType = 'income' | 'expense' | 'transfer';

export default function AddTransactionModal({ userId, properties, units, onClose, onSaved }:{
  userId:string;
  properties:Property[];
  units:Unit[];
  onClose:()=>void;
  onSaved:()=>void|Promise<void>;
}) {
  const [form,setForm]=useState({
    property_id:properties[0]?.id||'',
    unit_id:'',
    transaction_date:new Date().toISOString().slice(0,10),
    type:'expense' as TxType,
    category:'Needs Review',
    description:'',
    payee_source:'',
    amount:'',
    notes:'',
    needs_review:true,
  });
  const [receipt,setReceipt]=useState<File|null>(null);
  const [documents,setDocuments]=useState<{id:string;title:string|null;file_name:string;category:string}[]>([]);
  const [supportingDocumentId,setSupportingDocumentId]=useState('');
  const [showMore,setShowMore]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const propertyUnits=useMemo(()=>units.filter(u=>u.property_id===form.property_id),[units,form.property_id]);

  useEffect(()=>{ let alive=true; (async()=>{
    if(!form.property_id){setDocuments([]);return;}
    const r=await supabase.from('documents').select('id,title,file_name,category').eq('property_id',form.property_id).is('archived_at',null).order('created_at',{ascending:false});
    if(alive&&!r.error)setDocuments((r.data||[]) as any);
  })(); return()=>{alive=false}; },[form.property_id]);

  async function submit(e:FormEvent){
    e.preventDefault(); setSaving(true); setError('');
    try{
      let receiptPath:string|null=null;
      if(receipt){
        const safe=receipt.name.replace(/[^a-zA-Z0-9._-]/g,'-');
        receiptPath=`${userId}/${crypto.randomUUID()}-${safe}`;
        const upload=await supabase.storage.from('transaction-receipts').upload(receiptPath,receipt,{upsert:false});
        if(upload.error) throw upload.error;
      }
      const entered=Math.abs(Number(form.amount||0));
      const payload={
        user_id:userId,
        property_id:form.property_id,
        unit_id:form.unit_id||null,
        transaction_date:form.transaction_date,
        type:form.type,
        category:form.category,
        description:form.description.trim()||form.payee_source.trim()||form.category,
        payee_source:form.payee_source.trim()||null,
        amount:form.type==='expense'?-entered:entered,
        notes:null,
        source:'manual',
        import_key:null,
        status:'posted',
        confirmed_at:new Date().toISOString(),
        needs_review:form.needs_review||categoryNeedsReview(form.category),
        receipt_path:receiptPath,
        supporting_document_id:supportingDocumentId||null,
      };
      const result=await supabase.from('transactions').insert(payload);
      if(result.error) throw result.error;
      await onSaved();
      onClose();
    }catch(err){setError(err instanceof Error?err.message:'Could not save transaction.');}
    finally{setSaving(false);}
  }

  return <div className="quick-add-overlay" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
    <div className="quick-add-modal card" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
      <div className="quick-add-head"><div><div className="eyebrow">LEDGER</div><h2 id="quick-add-title">Add transaction</h2><p>Get it in now. Categorize it later if needed.</p></div><button className="icon-close" type="button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
      {error&&<div className="quick-add-error">{error}</div>}
      <form onSubmit={submit} className="quick-add-form">
        <div className="quick-add-two"><label>Amount<input autoFocus required inputMode="decimal" type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Property<select required value={form.property_id} onChange={e=>{setForm({...form,property_id:e.target.value,unit_id:''});setSupportingDocumentId('')}}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></label></div>
        {propertyUnits.length>0&&<div className="unit-chip-field"><span>Applies to</span><div className="unit-chips"><button type="button" className={!form.unit_id?'active':''} onClick={()=>setForm({...form,unit_id:''})}>Property-wide</button>{propertyUnits.map(u=><button type="button" key={u.id} className={form.unit_id===u.id?'active':''} onClick={()=>setForm({...form,unit_id:u.id})}>{u.unit_number}</button>)}</div></div>}
        <div className="quick-add-two"><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value,needs_review:categoryNeedsReview(e.target.value)})}>{ACCOUNTING_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Date<input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/></label></div>
        <div className="quick-add-two"><label>Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value as TxType})}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label><label>Vendor / payee <span>(optional)</span><input value={form.payee_source} onChange={e=>setForm({...form,payee_source:e.target.value})}/></label></div>
        <button type="button" className="quick-add-more" onClick={()=>setShowMore(v=>!v)}>{showMore?'Hide optional details':'Add note or documentation'}</button>
        {showMore&&<div className="quick-add-more-panel">
          <label>Note <span>(optional)</span><textarea rows={2} placeholder="Anything useful to remember" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <label className="receipt-field"><span><Paperclip size={17}/> Upload receipt / invoice <em>(optional)</em></span><input type="file" accept="image/*,.pdf" onChange={e=>setReceipt(e.target.files?.[0]||null)}/>{receipt&&<small>{receipt.name}</small>}</label>
          {documents.length>0&&<label>Or link existing document <span>(optional)</span><select value={supportingDocumentId} onChange={e=>setSupportingDocumentId(e.target.value)}><option value="">No linked document</option>{documents.map(d=><option value={d.id} key={d.id}>{d.title||d.file_name} · {d.category}</option>)}</select></label>}
        </div>}
        <label className="review-check"><input type="checkbox" checked={form.needs_review} onChange={e=>setForm({...form,needs_review:e.target.checked})}/><span><strong>Needs review</strong><small>Keep this on if the accounting category is uncertain. It will appear in Action Center.</small></span></label>
        <button className="quick-add-submit" disabled={saving||!properties.length}>{saving?'Saving…':'Save transaction'}</button>
      </form>
    </div>
  </div>;
}

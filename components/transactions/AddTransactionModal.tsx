'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, FileText, Paperclip, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, Transaction, Unit } from '@/lib/types';
import { ACCOUNTING_CATEGORIES, categoryKey, categoryNeedsReview, transactionTypeForCategory } from '@/lib/accounting';
import { mortgageBalanceAfterExtraPrincipal, postedExtraPrincipal, type PrincipalTransaction } from '@/lib/extraPrincipal';
import { formatCurrency, shortPropertyName } from '@/lib/formatters';
import { ProductSelect } from '@/components/common/ProductControls';
import { buildRuleDraftFromTransaction, canCreateRuleFrom, describeRuleAssignment, describeRuleMatch } from '@/lib/transactionRules';
import {
  buildPayoutSplitPayloads,
  canOfferPayoutSplit,
  emptyExpenseShare,
  emptyRentShare,
  payoutSplitTotals,
  type PayoutExpenseShare,
  type PayoutRentShare,
} from '@/lib/managementPayout';

type TxType = 'income' | 'expense' | 'transfer';
type Doc = {id:string;title:string|null;file_name:string;category:string};
type EditableTx = Transaction & {needs_review?:boolean|null;receipt_path?:string|null};

const PAYOUT_EXPENSE_CATEGORIES = ACCOUNTING_CATEGORIES.filter(category =>
  !['Needs Review','Uncategorized Inflow','Rent','Other Income','Refund','Owner Contribution','Owner Distribution','PM Distribution','Transfer','Loan Proceeds','Security Deposit','Credit Card Payment','Balance Forward'].includes(category)
);

export default function AddTransactionModal({ userId, properties, units, transaction, viewOnly=false, onClose, onSaved, onArchived, onArchiveFailed }:{
  userId:string; properties:Property[]; units:Unit[]; transaction?:EditableTx|null;
  viewOnly?:boolean;
  onClose:()=>void; onSaved:(message?:string)=>void|Promise<void>;
  onArchived?:(message?:string,id?:string,phase?:'optimistic'|'complete')=>void|Promise<void>;
  onArchiveFailed?:(tx:EditableTx,error:string)=>void|Promise<void>;
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
  const [showEditor,setShowEditor]=useState(!viewOnly);
  const [applyFutureMatches,setApplyFutureMatches]=useState(false);
  const [pendingCategory,setPendingCategory]=useState<string|null>(null);
  const [splitPayout,setSplitPayout]=useState(false);
  const [rentShares,setRentShares]=useState<PayoutRentShare[]>(()=>[emptyRentShare(transaction?.property_id||properties[0]?.id||'',transaction?String(Math.abs(Number(transaction.amount||0))):'')]);
  const [expenseShares,setExpenseShares]=useState<PayoutExpenseShare[]>([]);
  const propertyUnits=useMemo(()=>units.filter(u=>u.property_id===form.property_id),[units,form.property_id]);
  const filteredDocs=useMemo(()=>documents.filter(d=>`${d.title||''} ${d.file_name} ${d.category}`.toLowerCase().includes(docSearch.toLowerCase())),[documents,docSearch]);
  const selectedProperty=useMemo(()=>properties.find(p=>p.id===form.property_id),[properties,form.property_id]);
  const netDeposit=Math.abs(Number(transaction?.amount ?? (form.amount || 0)));
  const payoutEligible=Boolean(editing&&canOfferPayoutSplit({type:form.type,amount:netDeposit,category:form.category,source:transaction?.source}));
  const payoutTotals=useMemo(()=>payoutSplitTotals({netDeposit,rents:rentShares,expenses:expenseShares}),[netDeposit,rentShares,expenseShares]);
  const ruleCandidate=useMemo(()=>{
    const entered=Math.abs(Number(form.amount||0));
    const signed=transaction&&Number.isFinite(Number(transaction.amount))?Number(transaction.amount):form.type==='expense'?-entered:entered;
    return {
      payee_source:form.payee_source||transaction?.payee_source||null,
      description:form.description||transaction?.description||null,
      amount:signed,
      property_id:form.property_id||null,
      source_account_mask:transaction?.source_account_mask||null,
      category:form.category,
    };
  },[form,transaction]);
  const ruleDraft=useMemo(()=>buildRuleDraftFromTransaction(ruleCandidate),[ruleCandidate]);
  const showRuleOption=Boolean(editing&&ruleDraft&&canCreateRuleFrom(ruleCandidate));
  const rulePropertyName=useMemo(()=>{
    const id=ruleDraft?.assign_property_id||form.property_id;
    return properties.find(property=>property.id===id)?.address||null;
  },[ruleDraft,form.property_id,properties]);
  const isMortgage=['Mortgage Payment','Mortgage Payment (Unsplit)','Mortgage Interest','Mortgage Principal'].includes(form.category);
  const [mortgageSplit,setMortgageSplit]=useState({principal:String(Number((transaction as any)?.mortgage_principal_amount||0)||''),interest:String(Number((transaction as any)?.mortgage_interest_amount||0)||''),escrow:String(Number((transaction as any)?.mortgage_escrow_amount||0)||'')});
  const mortgageAllocated=['principal','interest','escrow'].reduce((sum,key)=>sum+Math.max(0,Number((mortgageSplit as any)[key]||0)),0);
  const mortgageAmount=Math.abs(Number(form.amount||0));
  const mortgageSplitDifference=Math.abs(mortgageAllocated-mortgageAmount);
  const mortgageSplitComplete=isMortgage&&mortgageAllocated>0&&mortgageSplitDifference<=0.020001;
  const propertyDefaultSplit=useMemo(()=>({
    principal:Math.max(0,Number((selectedProperty as any)?.mortgage_principal_amount||0)),
    interest:Math.max(0,Number((selectedProperty as any)?.mortgage_interest_amount||0)),
    escrow:Math.max(0,Number((selectedProperty as any)?.mortgage_escrow_amount||0)),
  }),[selectedProperty]);
  const propertyDefaultAllocated=propertyDefaultSplit.principal+propertyDefaultSplit.interest+propertyDefaultSplit.escrow;
  const propertyDefaultAvailable=propertyDefaultAllocated>0;
  function applyMortgageDefault(){
    if(!propertyDefaultAvailable)return;
    setMortgageSplit({principal:String(propertyDefaultSplit.principal||''),interest:String(propertyDefaultSplit.interest||''),escrow:String(propertyDefaultSplit.escrow||'')});
    const exact=Number(propertyDefaultAllocated.toFixed(2));
    if(exact>0)setForm(prev=>({...prev,amount:exact.toFixed(2),needs_review:false}));
  }

  useEffect(()=>{const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[]);

  useEffect(()=>{let alive=true;(async()=>{if(!form.property_id){setDocuments([]);return;}const r=await supabase.from('documents').select('id,title,file_name,category').eq('property_id',form.property_id).is('archived_at',null).order('created_at',{ascending:false});if(alive&&!r.error)setDocuments((r.data||[]) as Doc[]);})();return()=>{alive=false};},[form.property_id]);
  useEffect(()=>{let alive=true;(async()=>{if(!transaction?.id){setLinkedDocumentIds([]);return;}const r=await supabase.from('transaction_documents').select('document_id').eq('transaction_id',transaction.id);if(alive&&!r.error)setLinkedDocumentIds((r.data||[]).map((x:any)=>x.document_id));})();return()=>{alive=false};},[transaction?.id]);

  const balanceAdjustments=useMemo(()=>new Map<string, number>(),[]);
  async function syncPrincipalBalance(next:PrincipalTransaction,previous?:PrincipalTransaction|null){
    const previousId=previous?.property_id||'';
    const nextId=next.property_id||previousId;
    if(previousId&&nextId&&previousId!==nextId){
      await applyPrincipal(previousId,postedExtraPrincipal(previous),0);
      await applyPrincipal(nextId,0,postedExtraPrincipal(next));
      return;
    }
    await applyPrincipal(nextId||previousId,postedExtraPrincipal(previous),postedExtraPrincipal(next));
  }
  async function applyPrincipal(propertyId:string,previouslyApplied:number,nextApplied:number){
    if(!propertyId)return;
    const property=properties.find(item=>item.id===propertyId);
    if(!property)return;
    const current=balanceAdjustments.has(propertyId)?balanceAdjustments.get(propertyId)! : Number(property.mortgage_balance||0);
    const balance=mortgageBalanceAfterExtraPrincipal(current,previouslyApplied,nextApplied);
    if(Math.abs(balance-current)<0.005)return;
    const result=await supabase.from('properties').update({mortgage_balance:balance}).eq('id',propertyId);
    if(result.error)throw result.error;
    balanceAdjustments.set(propertyId,balance);
  }
  function toggleDocument(id:string){setLinkedDocumentIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
  async function syncDocumentLinks(transactionId:string){const del=await supabase.from('transaction_documents').delete().eq('transaction_id',transactionId);if(del.error)throw del.error;if(linkedDocumentIds.length){const ins=await supabase.from('transaction_documents').insert(linkedDocumentIds.map(document_id=>({user_id:userId,transaction_id:transactionId,document_id})));if(ins.error)throw ins.error;}}
  async function saveRuleFor(category:string,transactionId:string){
    const draft=buildRuleDraftFromTransaction({...ruleCandidate,category});
    if(!draft)return;
    const result=await supabase.from('transaction_rules').insert({
      user_id:userId,
      enabled:true,
      match_text:draft.match_text,
      match_direction:draft.match_direction,
      match_account_mask:draft.match_account_mask,
      match_property_id:draft.match_property_id,
      assign_category:draft.assign_category,
      assign_property_id:draft.assign_property_id,
      created_from_transaction_id:transactionId,
    });
    if(result.error)throw result.error;
  }

  function enablePayoutSplit(){
    const first=properties.find(p=>p.id===form.property_id)||properties[0];
    const second=properties.find(p=>p.id!==first?.id);
    setSplitPayout(true);
    setRentShares([
      emptyRentShare(first?.id||'', ''),
      ...(second?[emptyRentShare(second.id,'')]:[]),
    ]);
    setExpenseShares([emptyExpenseShare(first?.id||'')]);
    setForm(current=>({...current,type:'income',category:'Rent',needs_review:false}));
  }

  async function submit(e:FormEvent){
    e.preventDefault(); setSaving(true); setError('');
    try{
      if(splitPayout&&editing&&transaction){
        const {primaryUpdate,inserts}=buildPayoutSplitPayloads({
          userId,
          parent:transaction,
          draft:{netDeposit,rents:rentShares,expenses:expenseShares},
          netLabel:formatCurrency(netDeposit),
        });
        const updated=await supabase.from('transactions').update(primaryUpdate).eq('id',transaction.id).select('id').single();
        if(updated.error)throw updated.error;
        if(inserts.length){
          const created=await supabase.from('transactions').upsert(inserts,{onConflict:'user_id,import_key',ignoreDuplicates:true});
          if(created.error)throw created.error;
        }
        if(applyFutureMatches)await saveRuleFor('PM Distribution',transaction.id); // future deposits stay as PM Distribution for review/split
        await onSaved(applyFutureMatches?'Payout split saved and rule created':'Payout split saved');
        onClose();
        return;
      }
      let receiptPath=transaction?.receipt_path||null;
      if(receipt){const safe=receipt.name.replace(/[^a-zA-Z0-9._-]/g,'-');receiptPath=`${userId}/${crypto.randomUUID()}-${safe}`;const upload=await supabase.storage.from('transaction-receipts').upload(receiptPath,receipt,{upsert:false});if(upload.error)throw upload.error;}
      const entered=Math.abs(Number(form.amount||0));
      const normalizedEntered=isMortgage&&mortgageSplitComplete?Number(mortgageAllocated.toFixed(2)):entered;
      const category=isMortgage?'Mortgage Payment':form.category;
      const extra=categoryKey(category)==='extra-principal';
      const type=extra?'transfer':form.type;
      const payload={user_id:userId,property_id:form.property_id,unit_id:form.unit_id||null,transaction_date:form.transaction_date,type,category,description:form.description.trim()||form.payee_source.trim()||form.category,payee_source:form.payee_source.trim()||null,amount:extra||type==='expense'?-normalizedEntered:normalizedEntered,notes:null,source:transaction?.source||'manual',import_key:transaction?.import_key||null,status:transaction?.status==='pending'?'pending':'posted',confirmed_at:transaction?.confirmed_at||new Date().toISOString(),needs_review:isMortgage&&mortgageSplitComplete?false:form.needs_review,receipt_path:receiptPath,mortgage_principal_amount:isMortgage?(Number(mortgageSplit.principal||0)||null):null,mortgage_interest_amount:isMortgage?(Number(mortgageSplit.interest||0)||null):null,mortgage_escrow_amount:isMortgage?(Number(mortgageSplit.escrow||0)||null):null};
      await syncPrincipalBalance(payload,editing?transaction:null);
      let transactionId=transaction?.id||'';
      try{
        if(editing){const result=await supabase.from('transactions').update(payload).eq('id',transaction!.id).select('id').single();if(result.error)throw result.error;transactionId=result.data.id;}
        else{const result=await supabase.from('transactions').insert(payload).select('id').single();if(result.error)throw result.error;transactionId=result.data.id;}
        if(applyFutureMatches)await saveRuleFor(category,transactionId);
      }catch(saveError){
        const undone=editing?transaction!:{...payload,archived_at:new Date().toISOString()};
        await syncPrincipalBalance(undone,payload);
        throw saveError;
      }
      await syncDocumentLinks(transactionId); await onSaved(editing?(applyFutureMatches?'Transaction updated and rule saved':'Transaction updated'):'Transaction added'); onClose();
    }catch(err){setError(err instanceof Error?err.message:'Could not save transaction.');}finally{setSaving(false);}
  }

  async function archive(){
    if(!transaction||!confirm('Delete this transaction?'))return;
    setSaving(true);setError('');
    const archivedId=transaction.id;
    const snapshot=transaction;
    const archived={...transaction,archived_at:new Date().toISOString()};
    await syncPrincipalBalance(archived,transaction);
    await onArchived?.('Transaction deleted',archivedId,'optimistic');
    onClose();
    const r=await supabase.from('transactions').update({archived_at:archived.archived_at}).eq('id',archivedId);
    if(r.error){
      await syncPrincipalBalance(transaction,archived);
      await onArchiveFailed?.(snapshot,r.error.message||'Could not delete transaction.');
      setSaving(false);
      return;
    }
    await onArchived?.('Transaction deleted',archivedId,'complete');
    setSaving(false);
  }

  function chooseReviewCategory(category:string){
    const type=transactionTypeForCategory(category,form.type);
    setPendingCategory(category);
    setForm(current=>({...current,category,type,needs_review:categoryNeedsReview(category)}));
    setApplyFutureMatches(false);
  }

  async function resolveCategory(){
    if(!transaction||!pendingCategory)return;
    const category=pendingCategory;
    const type=transactionTypeForCategory(category,form.type);
    setSaving(true);setError('');
    const needsReview=categoryNeedsReview(category);
    const next={...transaction,category,type};
    try{await syncPrincipalBalance(next,transaction);}catch(err){setError(err instanceof Error?err.message:'Could not update the loan balance.');setSaving(false);return;}
    const r=await supabase.from('transactions').update({category,type,needs_review:needsReview}).eq('id',transaction.id);
    if(r.error){await syncPrincipalBalance(transaction,next);setError(r.error.message);setSaving(false);return;}
    try{
      if(applyFutureMatches)await saveRuleFor(category,transaction.id);
      setForm(current=>({...current,category,type,needs_review:needsReview}));
      setPendingCategory(null);
      await onSaved(applyFutureMatches?'Category updated and rule saved':'Category updated');
    }catch(err){setError(err instanceof Error?err.message:'Category saved, but the rule could not be created.');}
    setSaving(false);
  }

  const linkedDocs=documents.filter(d=>linkedDocumentIds.includes(d.id));
  return <div className="quick-add-overlay" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
    <div className="quick-add-modal card" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
      <div className="quick-add-head"><div><h2 id="quick-add-title">{editing?(showEditor?'Edit transaction':'Transaction details'):'Add transaction'}</h2><p>{editing?(showEditor?'Update the accounting details or supporting documents.':'Review the transaction before making changes.'):'Post it now. Categorize it later if needed.'}</p></div><button className="icon-close" type="button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
      {error&&<div className="quick-add-error">{error}</div>}
      {editing&&!showEditor?<div className="transaction-detail-sheet"><div><span>Amount</span><strong className={transaction!.type==='income'?'amount-positive':'amount-negative'}>{formatCurrency(transaction!.amount)}</strong></div><div><span>Property</span><strong>{selectedProperty?.address||'Portfolio'}</strong></div>{transaction!.unit_id&&<div><span>Applies to</span><strong>{propertyUnits.find(unit=>unit.id===transaction!.unit_id)?.unit_number||'Unit'}</strong></div>}<div className="transaction-detail-category"><span>Category</span>{form.needs_review||pendingCategory?<ProductSelect className="needs-category" aria-label="Category" value={form.category} onChange={e=>chooseReviewCategory(e.target.value)} disabled={saving}>{ACCOUNTING_CATEGORIES.map(c=><option key={c}>{c}</option>)}</ProductSelect>:<strong>{form.category}</strong>}</div>{pendingCategory&&canCreateRuleFrom({...ruleCandidate,category:pendingCategory})&&<div className="transaction-rule-panel"><label className="review-check"><input type="checkbox" checked={applyFutureMatches} onChange={e=>setApplyFutureMatches(e.target.checked)}/><span><strong>Apply to future matches</strong><small>Create a rule from this payee, direction, and bank account.</small></span></label>{applyFutureMatches&&ruleDraft&&<RulePreview match={describeRuleMatch(ruleDraft,rulePropertyName)} assignment={describeRuleAssignment(ruleDraft,rulePropertyName)}/>}</div>}{pendingCategory&&<div className="transaction-detail-actions"><button type="button" className="quick-add-submit" disabled={saving} onClick={()=>void resolveCategory()}>{saving?'Saving…':applyFutureMatches?'Save category & rule':'Save category'}</button></div>}<div><span>Date</span><strong>{new Date(`${form.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</strong></div><div className="transaction-detail-actions"><button type="button" className="quick-add-submit" onClick={()=>setShowEditor(true)}>Edit transaction</button><button type="button" className="transaction-archive-button" disabled={saving} onClick={archive}>Delete transaction</button></div></div>:<form onSubmit={submit} className="quick-add-form">
        {!editing&&<div className="transaction-type-choice" role="group" aria-label="Transaction type"><button type="button" className={form.type==='income'?'active':''} onClick={()=>setForm({...form,type:'income'})}>Income</button><button type="button" className={form.type==='expense'?'active':''} onClick={()=>setForm({...form,type:'expense'})}>Expense</button></div>}
        <label className="transaction-amount-field">Amount<span aria-hidden="true">$</span><input autoFocus={!editing} required={!splitPayout} inputMode="decimal" type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} disabled={splitPayout}/></label>
        {!splitPayout&&<>
          <div className="transaction-property-choice"><span>Property</span><div>{properties.map(p=><button type="button" key={p.id} className={form.property_id===p.id?'active':''} onClick={()=>{setForm({...form,property_id:p.id,unit_id:''});setLinkedDocumentIds([])}}>{p.address}</button>)}</div></div>
          {propertyUnits.length>0&&<div className="unit-chip-field"><span>Applies to</span><div className="unit-chips"><button type="button" className={!form.unit_id?'active':''} onClick={()=>setForm({...form,unit_id:''})}>Property-wide</button>{propertyUnits.map(u=><button type="button" key={u.id} className={form.unit_id===u.id?'active':''} onClick={()=>setForm({...form,unit_id:u.id})}>{u.unit_number}</button>)}</div></div>}
          <div className="quick-add-two"><ProductSelect className={editing&&form.needs_review?'needs-category':''} label="Category" value={form.category} onChange={e=>{const category=e.target.value;const type=transactionTypeForCategory(category,form.type);setForm({...form,category,type,needs_review:categoryNeedsReview(category)});setApplyFutureMatches(false)}}>{ACCOUNTING_CATEGORIES.map(c=><option key={c}>{c}</option>)}</ProductSelect><label>Date<input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/></label></div>
        </>}
        {splitPayout&&<label>Date<input required type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/></label>}
        {payoutEligible&&!splitPayout&&<label className="review-check"><input type="checkbox" checked={false} onChange={e=>{if(e.target.checked)enablePayoutSplit();}}/><span><strong>Split across properties</strong><small>Use this when one bank deposit is net rent for multiple properties after expenses were already deducted.</small></span></label>}
        {splitPayout&&<div className="mortgage-split-box payout-split-box">
          <div className="mortgage-split-head">
            <div>
              <strong>Split net deposit</strong>
              <small>Enter gross rent per property, then add the expenses already taken out. Gross rents − expenses must equal {formatCurrency(netDeposit)}.</small>
            </div>
            <div className="mortgage-split-head-actions">
              <button type="button" className="mortgage-default-button" onClick={()=>setSplitPayout(false)}>Cancel split</button>
              <span className={payoutTotals.balanced?'complete':''}>{formatCurrency(payoutTotals.impliedNet)} / {formatCurrency(netDeposit)}</span>
            </div>
          </div>
          <div className="payout-split-section">
            <div className="payout-split-section-head"><strong>Gross rent by property</strong><button type="button" onClick={()=>setRentShares(rows=>[...rows,emptyRentShare(properties.find(p=>!rows.some(row=>row.property_id===p.id))?.id||properties[0]?.id||'')])}>Add property</button></div>
            {rentShares.map((row,index)=>{
              const shareUnits=units.filter(unit=>unit.property_id===row.property_id);
              return <div className="payout-split-row" key={row.key}>
                <ProductSelect aria-label={`Rent property ${index+1}`} value={row.property_id} onChange={e=>setRentShares(rows=>rows.map(item=>item.key===row.key?{...item,property_id:e.target.value,unit_id:''}:item))}>{properties.map(p=><option key={p.id} value={p.id}>{shortPropertyName(p.address)}</option>)}</ProductSelect>
                {shareUnits.length>0&&<ProductSelect aria-label={`Rent unit ${index+1}`} value={row.unit_id} onChange={e=>setRentShares(rows=>rows.map(item=>item.key===row.key?{...item,unit_id:e.target.value}:item))}><option value="">Property-wide</option>{shareUnits.map(unit=><option key={unit.id} value={unit.id}>{unit.unit_number}</option>)}</ProductSelect>}
                <label className="payout-split-amount"><span>$</span><input inputMode="decimal" type="number" min="0" step="1" placeholder="Gross rent" value={row.amount} onChange={e=>setRentShares(rows=>rows.map(item=>item.key===row.key?{...item,amount:e.target.value}:item))}/></label>
                {rentShares.length>1&&<button type="button" className="payout-split-remove" aria-label="Remove rent share" onClick={()=>setRentShares(rows=>rows.filter(item=>item.key!==row.key))}><X size={15}/></button>}
              </div>;
            })}
          </div>
          <div className="payout-split-section">
            <div className="payout-split-section-head"><strong>Expenses already deducted</strong><button type="button" onClick={()=>setExpenseShares(rows=>[...rows,emptyExpenseShare(rentShares[0]?.property_id||properties[0]?.id||'')])}>Add expense</button></div>
            {!expenseShares.length&&<small className="mortgage-split-note">Optional. Add repairs, management fees, or other amounts the manager withheld from this deposit.</small>}
            {expenseShares.map((row,index)=><div className="payout-split-row payout-split-expense" key={row.key}>
              <ProductSelect aria-label={`Expense property ${index+1}`} value={row.property_id} onChange={e=>setExpenseShares(rows=>rows.map(item=>item.key===row.key?{...item,property_id:e.target.value}:item))}>{properties.map(p=><option key={p.id} value={p.id}>{shortPropertyName(p.address)}</option>)}</ProductSelect>
              <ProductSelect aria-label={`Expense category ${index+1}`} value={row.category} onChange={e=>setExpenseShares(rows=>rows.map(item=>item.key===row.key?{...item,category:e.target.value}:item))}>{PAYOUT_EXPENSE_CATEGORIES.map(category=><option key={category}>{category}</option>)}</ProductSelect>
              <input aria-label={`Expense description ${index+1}`} placeholder="Description" value={row.description} onChange={e=>setExpenseShares(rows=>rows.map(item=>item.key===row.key?{...item,description:e.target.value}:item))}/>
              <label className="payout-split-amount"><span>$</span><input inputMode="decimal" type="number" min="0" step="1" placeholder="Amount" value={row.amount} onChange={e=>setExpenseShares(rows=>rows.map(item=>item.key===row.key?{...item,amount:e.target.value}:item))}/></label>
              <button type="button" className="payout-split-remove" aria-label="Remove expense" onClick={()=>setExpenseShares(rows=>rows.filter(item=>item.key!==row.key))}><X size={15}/></button>
            </div>)}
          </div>
          <div className="payout-split-summary">
            <span>Gross rent <b className="amount-positive">{formatCurrency(payoutTotals.rentTotal)}</b></span>
            <span>Expenses <b className="amount-negative">{formatCurrency(payoutTotals.expenseTotal)}</b></span>
            <span>Equals deposit <b>{formatCurrency(payoutTotals.impliedNet)}</b></span>
          </div>
          <small className={payoutTotals.balanced?'mortgage-split-ok':'mortgage-split-note'}>{payoutTotals.balanced?'Balanced. Saving will post rent to each property and the deducted expenses.':payoutTotals.difference>0?`Still ${formatCurrency(payoutTotals.difference)} above the bank deposit.`:`Still ${formatCurrency(Math.abs(payoutTotals.difference))} below the bank deposit.`}</small>
        </div>}
        {showRuleOption&&<div className="transaction-rule-panel"><label className="review-check"><input type="checkbox" checked={applyFutureMatches} onChange={e=>setApplyFutureMatches(e.target.checked)}/><span><strong>Apply to future matches</strong><small>{splitPayout?'Save a rule so future deposits from this payee are categorized as PM Distribution for review.':'Create a rule from this payee, direction, and bank account. Amount and date can vary.'}</small></span></label>{applyFutureMatches&&ruleDraft&&<RulePreview match={describeRuleMatch(ruleDraft,rulePropertyName)} assignment={describeRuleAssignment({assign_category:splitPayout?'PM Distribution':ruleDraft.assign_category,assign_property_id:splitPayout?null:ruleDraft.assign_property_id},splitPayout?null:rulePropertyName)}/>}</div>}
        {editing&&!splitPayout&&<div className="quick-add-two"><ProductSelect label="Type" value={form.type} onChange={e=>setForm({...form,type:e.target.value as TxType})}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></ProductSelect></div>}
        {isMortgage&&!splitPayout&&<div className="mortgage-split-box">
          <div className="mortgage-split-head"><div><strong>Split mortgage payment</strong><small>{propertyDefaultAvailable?'Uses the property mortgage setup by default. Adjust only if this month differs.':'Allocate this payment between principal, interest and escrow.'}</small></div><div className="mortgage-split-head-actions">{propertyDefaultAvailable&&<button type="button" className="mortgage-default-button" onClick={applyMortgageDefault}>Use mortgage default</button>}<span className={mortgageSplitComplete?'complete':''}>{formatCurrency(mortgageAllocated)} / {formatCurrency(mortgageAmount)}</span></div></div>
          <div className="mortgage-split-fields">
            <label>Principal<input inputMode="decimal" type="number" min="0" step="0.01" value={mortgageSplit.principal} onChange={e=>setMortgageSplit({...mortgageSplit,principal:e.target.value})}/></label>
            <label>Interest<input inputMode="decimal" type="number" min="0" step="0.01" value={mortgageSplit.interest} onChange={e=>setMortgageSplit({...mortgageSplit,interest:e.target.value})}/></label>
            <label>Escrow<input inputMode="decimal" type="number" min="0" step="0.01" value={mortgageSplit.escrow} onChange={e=>setMortgageSplit({...mortgageSplit,escrow:e.target.value})}/></label>
          </div>
          <small className={mortgageSplitComplete?'mortgage-split-ok':'mortgage-split-note'}>{mortgageSplitComplete?'Fully allocated. This payment will be marked reviewed when saved.':mortgageAllocated>mortgageAmount?'Allocated amount is higher than the payment.':'Any unallocated amount can remain in Needs Review until you have the statement.'}</small>
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
        <div className="quick-add-footer">{editing&&<div className="quick-add-destructive-actions"><button type="button" className="transaction-archive-button" disabled={saving} onClick={archive}>Delete transaction</button></div>}<button className="quick-add-submit" disabled={saving||!properties.length||(splitPayout&&!payoutTotals.balanced)}>{saving?'Saving…':splitPayout?'Save split':editing?'Update':'Post'}</button></div>
      </form>}
    </div>
  </div>;
}

function RulePreview({ match, assignment }:{ match:string; assignment:string }){
  return <div className="transaction-rule-preview" aria-live="polite">
    <div><span>Will match</span><strong>{match}</strong></div>
    <div><span>Will assign</span><strong>{assignment}</strong></div>
  </div>;
}

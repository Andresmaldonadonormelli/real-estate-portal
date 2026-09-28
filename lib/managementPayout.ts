/** Estimate gross rent and management fee from a net Chase payout deposit. */
export function estimatePayoutSplit(netDeposit:number,feePercent:number){
  const net=Math.max(0,Math.round(Math.abs(netDeposit)));
  const rate=Number(feePercent||0)/100;
  if(rate<=0||rate>=1)return {gross:net,fee:0,net,estimated:false};
  const gross=Math.round(net/(1-rate));
  const fee=Math.max(0,gross-net);
  return {gross,fee,net,estimated:true};
}

export type PayoutDeduction={label:string;amount:number};
export type PayoutBreakdown={
  gross:number;
  fee:number;
  deductions:PayoutDeduction[];
  net:number;
  confirmed:boolean;
};

type PayoutTransaction={
  id:string;
  property_id?:string|null;
  transaction_date?:string|null;
  type?:string|null;
  category?:string|null;
  description?:string|null;
  payee_source?:string|null;
  amount?:number|null;
  notes?:string|null;
  source?:string|null;
  import_key?:string|null;
  status?:string|null;
};

const CONFIRMED_SPLIT=/split from (net|Chase\/net) payout|split from net deposit/i;

export function isPropertyManagementDeposit(transaction:PayoutTransaction|null|undefined,feePercent?:number|null){
  if(!transaction||transaction.type!=='income')return false;
  if(CONFIRMED_SPLIT.test(String(transaction.notes||'')))return true;
  return transaction.source==='plaid'&&Number(feePercent||0)>0;
}

function netFromNotes(notes:string){
  const match=notes.match(/(?:net deposit|net payout)[^0-9]*([0-9][0-9,]*(?:\.\d+)?)/i);
  if(!match)return null;
  const value=Number(match[1].replace(/,/g,''));
  return Number.isFinite(value)?Math.round(value):null;
}

function deductionLabel(transaction:PayoutTransaction){
  const text=`${transaction.description||''} ${transaction.payee_source||''} ${transaction.category||''}`;
  if(/mow|lawn|landscap/i.test(text))return 'Lawn mowing';
  const description=(transaction.description||'').trim();
  if(description&&!/management fee/i.test(description))return description;
  return transaction.category||'Approved deduction';
}

/** Explain a manager deposit as gross rent, fee, linked deductions, and the net that reached the bank. */
export function buildPayoutBreakdown(transaction:PayoutTransaction,feePercent:number|null|undefined,related:PayoutTransaction[]=[]):PayoutBreakdown|null{
  if(!isPropertyManagementDeposit(transaction,feePercent))return null;
  const notes=String(transaction.notes||'');
  const confirmed=CONFIRMED_SPLIT.test(notes);
  const feeKey=`management-fee-split:${transaction.id}`;
  const sameDay=(row:PayoutTransaction)=>row.property_id===transaction.property_id&&row.transaction_date===transaction.transaction_date&&row.type==='expense'&&(row.status||'posted')==='posted';
  const feeRow=related.find(row=>row.import_key===feeKey&&(row.status||'posted')==='posted');
  const linked=related.filter(row=>row.id!==feeRow?.id&&sameDay(row)&&(String(row.notes||'').includes(transaction.id)||String(row.import_key||'').includes(transaction.id)));
  const deductions=linked.map(row=>({label:deductionLabel(row),amount:Math.round(Math.abs(Number(row.amount||0)))})).filter(row=>row.amount>0);
  const notedNet=netFromNotes(notes);
  const fee=feeRow?Math.round(Math.abs(Number(feeRow.amount||0))):estimatePayoutSplit(notedNet??Math.abs(Number(transaction.amount||0)),Number(feePercent||0)).fee;
  const net=confirmed?(notedNet??Math.max(0,Math.round(Math.abs(Number(transaction.amount||0)))-fee)):Math.round(Math.abs(Number(transaction.amount||0)));
  const gross=net+fee+deductions.reduce((sum,row)=>sum+row.amount,0);
  return {gross,fee,deductions,net,confirmed};
}

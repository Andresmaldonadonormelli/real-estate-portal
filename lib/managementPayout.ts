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
  if(/^pm distribution$/i.test(String(transaction.category||'').trim()))return false;
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

export type PayoutRentShare={key:string;property_id:string;unit_id:string;amount:string};
export type PayoutExpenseShare={key:string;property_id:string;category:string;description:string;amount:string};
export type PayoutSplitDraft={netDeposit:number;rents:PayoutRentShare[];expenses:PayoutExpenseShare[]};

/** Gross rents minus posted expenses must equal the bank net deposit. */
export function payoutSplitTotals(draft:PayoutSplitDraft){
  const rentTotal=draft.rents.reduce((sum,row)=>sum+Math.max(0,Math.round(Number(row.amount||0)||0)),0);
  const expenseTotal=draft.expenses.reduce((sum,row)=>sum+Math.max(0,Math.round(Number(row.amount||0)||0)),0);
  const impliedNet=rentTotal-expenseTotal;
  const netDeposit=Math.max(0,Math.round(Math.abs(Number(draft.netDeposit||0))));
  const difference=impliedNet-netDeposit;
  return {rentTotal,expenseTotal,impliedNet,netDeposit,difference,balanced:rentTotal>0&&Math.abs(difference)<=0};
}

export function canOfferPayoutSplit(transaction:{type?:string|null;amount?:number|null;category?:string|null;source?:string|null}|null|undefined){
  if(!transaction)return false;
  const amount=Number(transaction.amount||0);
  if(!(amount>0||transaction.type==='income'))return false;
  const category=String(transaction.category||'');
  if(/mortgage|transfer|owner contribution|credit card/i.test(category))return false;
  return true;
}

export function emptyRentShare(propertyId:string,amount=''):PayoutRentShare{
  return {key:cryptoRandom(),property_id:propertyId,unit_id:'',amount};
}

export function emptyExpenseShare(propertyId:string,category='Management Fee'):PayoutExpenseShare{
  return {key:cryptoRandom(),property_id:propertyId,category,description:'',amount:''};
}

export function buildPayoutSplitPayloads(input:{
  userId:string;
  parent:PayoutTransaction&{id:string;transaction_date:string;source?:string|null;payee_source?:string|null;description?:string|null;import_key?:string|null};
  draft:PayoutSplitDraft;
  netLabel:string;
}){
  const totals=payoutSplitTotals(input.draft);
  if(!totals.balanced)throw new Error('Gross rents minus expenses must equal the bank deposit.');
  const rents=input.draft.rents.filter(row=>row.property_id&&Math.round(Number(row.amount||0))>0);
  const expenses=input.draft.expenses.filter(row=>row.property_id&&Math.round(Number(row.amount||0))>0);
  if(!rents.length)throw new Error('Add at least one property rent share.');
  const [primary,...rest]=rents;
  const note=`Confirmed split from net deposit ${input.netLabel}.`;
  const primaryUpdate={
    type:'income' as const,
    category:'Rent',
    property_id:primary.property_id,
    unit_id:primary.unit_id||null,
    amount:Math.round(Number(primary.amount)),
    description:input.parent.description||'Property management payout',
    notes:note,
    needs_review:false,
    is_new_import:false,
    import_acknowledged_at:new Date().toISOString(),
  };
  type SplitInsert={
    user_id:string;
    property_id:string;
    unit_id:string|null;
    transaction_date:string;
    type:'income'|'expense';
    category:string;
    description:string;
    payee_source:string|null;
    amount:number;
    notes:string;
    source:string;
    import_key:string;
    status:'posted';
    confirmed_at:string;
    needs_review:boolean;
    is_new_import:boolean;
  };
  const rentInserts:SplitInsert[]=rest.map((row,index)=>({
    user_id:input.userId,
    property_id:row.property_id,
    unit_id:row.unit_id||null,
    transaction_date:input.parent.transaction_date,
    type:'income',
    category:'Rent',
    description:input.parent.description||'Property management payout',
    payee_source:input.parent.payee_source||null,
    amount:Math.round(Number(row.amount)),
    notes:`${note} Linked to ${input.parent.id}.`,
    source:input.parent.source||'plaid',
    import_key:`payout-rent-split:${input.parent.id}:${index+1}`,
    status:'posted',
    confirmed_at:new Date().toISOString(),
    needs_review:false,
    is_new_import:false,
  }));
  const expenseInserts:SplitInsert[]=expenses.map((row,index)=>({
    user_id:input.userId,
    property_id:row.property_id,
    unit_id:null,
    transaction_date:input.parent.transaction_date,
    type:'expense',
    category:row.category,
    description:(row.description||row.category).trim()||row.category,
    payee_source:input.parent.payee_source||'Property manager',
    amount:-Math.round(Number(row.amount)),
    notes:`Deducted on ${input.parent.id}. ${note}`,
    source:input.parent.source||'plaid',
    import_key:`payout-expense-split:${input.parent.id}:${index+1}`,
    status:'posted',
    confirmed_at:new Date().toISOString(),
    needs_review:false,
    is_new_import:false,
  }));
  return {primaryUpdate,inserts:[...rentInserts,...expenseInserts],totals};
}

function cryptoRandom(){
  if(typeof crypto!=='undefined'&&'randomUUID' in crypto)return crypto.randomUUID();
  return `row-${Math.random().toString(36).slice(2,10)}`;
}

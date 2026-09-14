import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, plaidClient } from './server';

type PlaidItem={id:string;user_id:string;access_token_encrypted:string;cursor:string|null;institution_name:string};
type LinkedAccount={id:string;plaid_account_id:string;property_id:string|null;mask:string|null;import_enabled:boolean};

async function materialize(db:SupabaseClient,item:PlaidItem,row:any,account:LinkedAccount){
  if(!account.property_id||account.import_enabled===false)return;
  const primary=String(row.personal_finance_category?.primary||'');
  const type=primary.startsWith('TRANSFER_')||row.amount<0?'transfer':'expense';
  const category=row.amount<0?'Uncategorized Inflow':'Needs Review';
  const amount=type==='expense'?-Math.abs(row.amount):Math.abs(row.amount);
  const status=row.pending?'pending':'posted';
  if(row.pending_transaction_id){const {data:predecessor}=await db.from('plaid_transactions').select('ledger_transaction_id').eq('plaid_transaction_id',row.pending_transaction_id).maybeSingle();if(predecessor?.ledger_transaction_id)await db.from('transactions').update({status:'declined',needs_review:false}).eq('id',predecessor.ledger_transaction_id).eq('status','pending');}
  const payload={user_id:item.user_id,property_id:account.property_id,unit_id:null,transaction_date:row.date,type,category,description:row.name||'Bank transaction',payee_source:row.merchant_name||row.name||null,amount,notes:'Imported from linked bank account',source:'plaid',source_institution:item.institution_name,source_account_mask:account.mask,source_connection_status:'connected',import_key:`plaid:${row.transaction_id}`,status,confirmed_at:status==='posted'?new Date().toISOString():null,needs_review:true,is_new_import:status==='posted',import_acknowledged_at:null};
  const {data:existing}=await db.from('transactions').select('id,status,needs_review').eq('user_id',item.user_id).eq('import_key',payload.import_key).maybeSingle();
  let ledger:{id:string}|null=null;
  if(existing){const {is_new_import:ignoredNew,import_acknowledged_at:ignoredAt,...reviewUpdate}=payload;const update:any=existing.needs_review?reviewUpdate:{transaction_date:row.date,amount,status,confirmed_at:status==='posted'?new Date().toISOString():null,source_connection_status:'connected'};if(existing.status==='pending'&&status==='posted'){update.is_new_import=true;update.import_acknowledged_at=null;}ledger=(await db.from('transactions').update(update).eq('id',existing.id).select('id').single()).data;}
  else ledger=(await db.from('transactions').insert(payload).select('id').single()).data;
  if(ledger?.id)await db.from('plaid_transactions').update({ledger_transaction_id:ledger.id}).eq('plaid_transaction_id',row.transaction_id);
}

export async function backfillPlaidAccount(db:SupabaseClient,item:PlaidItem,accountId:string){
  const {data:account,error}=await db.from('plaid_accounts').select('id,plaid_account_id,property_id,mask,import_enabled').eq('id',accountId).eq('item_id',item.id).single();if(error)throw error;
  const {data:rows,error:rowsError}=await db.from('plaid_transactions').select('raw_data').eq('account_id',accountId).eq('removed',false).order('transaction_date');if(rowsError)throw rowsError;
  for(const stored of rows||[])if(stored.raw_data)await materialize(db,item,stored.raw_data,account as LinkedAccount);
}

export async function syncPlaidItem(db:SupabaseClient,item:PlaidItem){
  const accessToken=decryptToken(item.access_token_encrypted);let cursor=item.cursor||undefined;let hasMore=true;const added:any[]=[];const modified:any[]=[];const removed:string[]=[];
  while(hasMore){const response=await plaidClient().transactionsSync({access_token:accessToken,cursor,count:500});added.push(...response.data.added);modified.push(...response.data.modified);removed.push(...response.data.removed.map(row=>row.transaction_id));cursor=response.data.next_cursor;hasMore=response.data.has_more;}
  const changed=[...added,...modified];
  if(changed.length){
    const accountIds=[...new Set(changed.map(row=>row.account_id))];const {data:accounts}=await db.from('plaid_accounts').select('id,plaid_account_id,property_id,mask,import_enabled').eq('item_id',item.id).in('plaid_account_id',accountIds);const byPlaid=new Map((accounts||[]).map(row=>[row.plaid_account_id,row as LinkedAccount]));
    await db.from('plaid_transactions').upsert(changed.map(row=>({user_id:item.user_id,item_id:item.id,account_id:byPlaid.get(row.account_id)?.id||null,plaid_transaction_id:row.transaction_id,transaction_date:row.date,authorized_date:row.authorized_date||null,name:row.name,merchant_name:row.merchant_name||null,amount:row.amount,pending:Boolean(row.pending),pending_transaction_id:row.pending_transaction_id||null,category_primary:row.personal_finance_category?.primary||null,category_detailed:row.personal_finance_category?.detailed||null,removed:false,raw_data:row})),{onConflict:'plaid_transaction_id'});
    for(const row of changed){const account=byPlaid.get(row.account_id);if(account)await materialize(db,item,row,account);}
  }
  if(removed.length){const {data:linked}=await db.from('plaid_transactions').select('ledger_transaction_id').in('plaid_transaction_id',removed);const ledgerIds=(linked||[]).map(row=>row.ledger_transaction_id).filter(Boolean);await db.from('plaid_transactions').update({removed:true}).in('plaid_transaction_id',removed);if(ledgerIds.length)await db.from('transactions').update({status:'declined',needs_review:false}).in('id',ledgerIds);}
  const balances=await plaidClient().accountsBalanceGet({access_token:accessToken});for(const account of balances.data.accounts)await db.from('plaid_accounts').update({current_balance:account.balances.current,available_balance:account.balances.available,iso_currency_code:account.balances.iso_currency_code||'USD',last_synced_at:new Date().toISOString()}).eq('item_id',item.id).eq('plaid_account_id',account.account_id);
  await db.from('plaid_items').update({cursor,last_synced_at:new Date().toISOString(),status:'connected',error_code:null,error_message:null}).eq('id',item.id);return {added:added.length,modified:modified.length,removed:removed.length};
}

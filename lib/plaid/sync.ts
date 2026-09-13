import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, plaidClient } from './server';

type PlaidItem={id:string;user_id:string;access_token_encrypted:string;cursor:string|null};

export async function syncPlaidItem(db:SupabaseClient,item:PlaidItem){
  const accessToken=decryptToken(item.access_token_encrypted);
  let cursor=item.cursor||undefined;
  let hasMore=true;
  const added:any[]=[];const modified:any[]=[];const removed:string[]=[];
  while(hasMore){
    const response=await plaidClient().transactionsSync({access_token:accessToken,cursor,count:500});
    added.push(...response.data.added);modified.push(...response.data.modified);removed.push(...response.data.removed.map(row=>row.transaction_id));
    cursor=response.data.next_cursor;hasMore=response.data.has_more;
  }
  const changed=[...added,...modified];
  if(changed.length){
    const accountIds=[...new Set(changed.map(row=>row.account_id))];
    const {data:accounts}=await db.from('plaid_accounts').select('id,plaid_account_id,property_id').eq('item_id',item.id).in('plaid_account_id',accountIds);
    const byPlaid=new Map((accounts||[]).map(row=>[row.plaid_account_id,row]));
    await db.from('plaid_transactions').upsert(changed.map(row=>({
      user_id:item.user_id,item_id:item.id,account_id:byPlaid.get(row.account_id)?.id||null,plaid_transaction_id:row.transaction_id,
      transaction_date:row.date,authorized_date:row.authorized_date||null,name:row.name,merchant_name:row.merchant_name||null,
      amount:row.amount,pending:Boolean(row.pending),pending_transaction_id:row.pending_transaction_id||null,category_primary:row.personal_finance_category?.primary||null,
      category_detailed:row.personal_finance_category?.detailed||null,removed:false,raw_data:row
    })),{onConflict:'plaid_transaction_id'});
    for(const row of changed){
      const account=byPlaid.get(row.account_id);if(!account?.property_id)continue;
      const type=row.amount>0?'expense':'income';
      const ledgerAmount=type==='expense'?-Math.abs(row.amount):Math.abs(row.amount);
      if(row.pending_transaction_id){
        const {data:predecessor}=await db.from('plaid_transactions').select('ledger_transaction_id').eq('plaid_transaction_id',row.pending_transaction_id).maybeSingle();
        if(predecessor?.ledger_transaction_id)await db.from('transactions').update({archived_at:new Date().toISOString()}).eq('id',predecessor.ledger_transaction_id).eq('status','pending');
      }
      const payload={
        user_id:item.user_id,property_id:account.property_id,unit_id:null,transaction_date:row.date,type,category:'Needs Review',
        description:row.name||'Bank transaction',payee_source:row.merchant_name||row.name||null,amount:ledgerAmount,
        notes:'Imported from connected bank account',source:'plaid',import_key:`plaid:${row.transaction_id}`,
        status:'pending',confirmed_at:null,needs_review:true
      };
      const {data:existing}=await db.from('transactions').select('id,status').eq('user_id',item.user_id).eq('import_key',payload.import_key).maybeSingle();
      const ledger=existing?.status==='pending'
        ? (await db.from('transactions').update(payload).eq('id',existing.id).select('id').single()).data
        : existing || (await db.from('transactions').insert(payload).select('id').single()).data;
      if(ledger?.id)await db.from('plaid_transactions').update({ledger_transaction_id:ledger.id}).eq('plaid_transaction_id',row.transaction_id);
    }
  }
  if(removed.length){
    const {data:linked}=await db.from('plaid_transactions').select('ledger_transaction_id').in('plaid_transaction_id',removed);
    const ledgerIds=(linked||[]).map(row=>row.ledger_transaction_id).filter(Boolean);
    await db.from('plaid_transactions').update({removed:true}).in('plaid_transaction_id',removed);
    if(ledgerIds.length)await db.from('transactions').update({archived_at:new Date().toISOString()}).in('id',ledgerIds).eq('status','pending');
  }
  const balances=await plaidClient().accountsBalanceGet({access_token:accessToken});
  for(const account of balances.data.accounts)await db.from('plaid_accounts').update({current_balance:account.balances.current,available_balance:account.balances.available,iso_currency_code:account.balances.iso_currency_code||'USD',last_synced_at:new Date().toISOString()}).eq('item_id',item.id).eq('plaid_account_id',account.account_id);
  await db.from('plaid_items').update({cursor,last_synced_at:new Date().toISOString(),status:'connected',error_code:null,error_message:null}).eq('id',item.id);
  return {added:added.length,modified:modified.length,removed:removed.length};
}

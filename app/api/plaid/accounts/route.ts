import { after } from 'next/server';
import { apiError, adminDb, authenticatedUser, errorMessage } from '@/lib/plaid/server';
import { reconcileDuplicateConnections } from '@/lib/plaid/reconcile';
import { restorableAccounts, type StoredAccount } from '@/lib/plaid/accountIdentity';
import { needsReconnect } from '@/lib/plaid/accountStatus';
import { checkConnectionHealth } from '@/lib/plaid/sync';
export const runtime='nodejs';

const ACCOUNT_FIELDS='id,item_id,plaid_account_id,name,official_name,mask,type,subtype,current_balance,available_balance,iso_currency_code,property_id,last_synced_at,import_enabled,archived_at,created_at';

export async function GET(request:Request){try{
  const user=await authenticatedUser(request);
  const db=adminDb();
  try{await reconcileDuplicateConnections(db,user.id);}catch(error){console.error('[plaid reconcile]',{userId:user.id,message:errorMessage(error)});}
  const {data:items,error:itemError}=await db.from('plaid_items').select('id,institution_id,institution_name,status,error_code,error_message,last_synced_at').eq('user_id',user.id).is('disconnected_at',null).order('created_at');
  if(itemError)throw itemError;
  const itemIds=(items||[]).map(item=>item.id);
  const {data:rows,error:accountError}=itemIds.length?await db.from('plaid_accounts').select(ACCOUNT_FIELDS).eq('user_id',user.id).in('item_id',itemIds).order('name'):{data:[],error:null};
  if(accountError)throw accountError;
  const bankOf=new Map((items||[]).map(item=>[item.id,item.institution_id||`name:${item.institution_name}`]));
  const all=(rows||[]) as (StoredAccount&Record<string,unknown>)[];
  const strip=({plaid_account_id:_id,archived_at:_archived,created_at:_created,...account}:StoredAccount&Record<string,unknown>)=>account;
  const accounts=all.filter(row=>!row.archived_at).map(strip);
  const disconnected=restorableAccounts(all,itemId=>bankOf.get(itemId)).map(strip);
  const healthy=(items||[]).filter(item=>!needsReconnect(item)&&accounts.some(account=>account.item_id===item.id)).map(item=>item.id);
  if(healthy.length){
    after(async()=>{
      const {data:connections}=await db.from('plaid_items').select('id,user_id,access_token_encrypted,cursor,institution_name,status,error_code').in('id',healthy).is('disconnected_at',null);
      await Promise.all((connections||[]).filter(item=>item.access_token_encrypted!=='revoked').map(item=>checkConnectionHealth(db,item)));
    });
  }
  return Response.json({items,accounts,disconnected,sandbox:(process.env.PLAID_ENV||'sandbox').toLowerCase()==='sandbox'});
}catch(error){return apiError(error)}}

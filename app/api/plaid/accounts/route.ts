import { after } from 'next/server';
import { apiError, adminDb, authenticatedUser, errorMessage } from '@/lib/plaid/server';
import { reconcileDuplicateConnections } from '@/lib/plaid/reconcile';
import { checkConnectionHealth } from '@/lib/plaid/sync';
export const runtime='nodejs';
export async function GET(request:Request){try{
  const user=await authenticatedUser(request);
  const db=adminDb();
  try{await reconcileDuplicateConnections(db,user.id);}catch(error){console.error('[plaid reconcile]',{userId:user.id,message:errorMessage(error)});}
  const [{data:items,error:itemError},{data:accounts,error:accountError}]=await Promise.all([
    db.from('plaid_items').select('id,institution_id,institution_name,status,error_code,error_message,last_synced_at').eq('user_id',user.id).is('disconnected_at',null).order('created_at'),
    db.from('plaid_accounts').select('id,item_id,name,official_name,mask,type,subtype,current_balance,available_balance,iso_currency_code,property_id,last_synced_at,import_enabled').eq('user_id',user.id).is('archived_at',null).order('name'),
  ]);
  if(itemError||accountError)throw itemError||accountError;
  const inUse=[...new Set((accounts||[]).map(account=>account.item_id))];
  if(inUse.length){
    after(async()=>{
      const {data:connections}=await db.from('plaid_items').select('id,user_id,access_token_encrypted,cursor,institution_name,status,error_code').in('id',inUse).is('disconnected_at',null);
      await Promise.all((connections||[]).filter(item=>item.access_token_encrypted!=='revoked').map(item=>checkConnectionHealth(db,item)));
    });
  }
  return Response.json({items,accounts,sandbox:(process.env.PLAID_ENV||'sandbox').toLowerCase()==='sandbox'});
}catch(error){return apiError(error)}}

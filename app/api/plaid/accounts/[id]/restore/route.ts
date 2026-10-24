import { after } from 'next/server';
import { apiError, adminDb, authenticatedUser } from '@/lib/plaid/server';
import { restoreAccount } from '@/lib/plaid/reconcile';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';

const ACCOUNT_FIELDS='id,item_id,name,official_name,mask,type,subtype,current_balance,available_balance,iso_currency_code,property_id,last_synced_at,import_enabled';

/** Undo "Disconnect account". History stays where it is; the next sync links new activity to the same ledger rows. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await authenticatedUser(request);
  const {id}=await params;
  const db=adminDb();
  const result=await restoreAccount(db,user.id,id);
  if('conflict'in result)return Response.json({error:result.conflict},{status:409});
  const {data:account,error}=await db.from('plaid_accounts').select(ACCOUNT_FIELDS).eq('id',result.accountId).single();
  if(error)throw error;
  if(account.property_id){
    after(async()=>{
      try{
        const {data:item}=await db.from('plaid_items').select('*').eq('id',account.item_id).is('disconnected_at',null).single();
        if(item)await syncPlaidItem(db,item,{resync:true});
      }catch{/* Recorded on the connection; Sync retries. */}
    });
  }
  return Response.json({ok:true,account,replacedId:result.accountId===id?null:id,inferredProperty:result.inferredProperty});
}catch(error){return apiError(error)}}

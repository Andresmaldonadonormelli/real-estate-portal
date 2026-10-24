import { after } from 'next/server';
import { apiError, adminDb, authenticatedUser } from '@/lib/plaid/server';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';

const ACCOUNT_FIELDS='id,item_id,name,official_name,mask,type,subtype,current_balance,available_balance,iso_currency_code,property_id,last_synced_at,import_enabled';

/** Assign or unassign a property. The Plaid connection is untouched. */
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await authenticatedUser(request);
    const {id}=await params;
    const body=await request.json();
    if(!('propertyId'in body))return Response.json({error:'Choose a property or Not assigned.'},{status:400});
    const db=adminDb();
    const propertyId=body.propertyId||null;
    const {data:account,error}=await db.from('plaid_accounts').update({property_id:propertyId,import_enabled:Boolean(propertyId),stopped_at:propertyId?null:new Date().toISOString()}).eq('id',id).eq('user_id',user.id).is('archived_at',null).select(ACCOUNT_FIELDS).single();
    if(error)throw error;
    if(account.property_id){
      after(async()=>{
        try{
          const {data:item}=await db.from('plaid_items').select('id,user_id,access_token_encrypted,cursor,institution_name,status,error_code').eq('id',account.item_id).eq('user_id',user.id).is('disconnected_at',null).single();
          if(item)await syncPlaidItem(db,item,{resync:true});
        }catch{/* The next webhook or Sync imports this account. */}
      });
    }
    return Response.json({ok:true,account});
  }catch(error){return apiError(error)}
}

/** Stop importing one account while the rest of the bank stays connected. History and the property assignment are kept for reconnecting. */
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await authenticatedUser(request);
    const {id}=await params;
    const db=adminDb();
    const {data:account,error}=await db.from('plaid_accounts').select('id,item_id,mask').eq('id',id).eq('user_id',user.id).is('archived_at',null).single();
    if(error)throw error;
    const now=new Date().toISOString();
    const result=await db.from('plaid_accounts').update({archived_at:now,import_enabled:false,stopped_at:now}).eq('id',id).eq('user_id',user.id);
    if(result.error)throw result.error;
    const {data:item}=await db.from('plaid_items').select('institution_name').eq('id',account.item_id).maybeSingle();
    if(item?.institution_name&&account.mask){
      const marked=await db.from('transactions').update({source_connection_status:'unlinked'}).eq('user_id',user.id).eq('source','plaid').eq('source_institution',item.institution_name).eq('source_account_mask',account.mask);
      if(marked.error)throw marked.error;
    }
    return Response.json({ok:true});
  }catch(error){return apiError(error)}
}

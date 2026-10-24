import { apiError, adminDb, authenticatedUser, decryptToken, plaidClient } from '@/lib/plaid/server';
export const runtime='nodejs';

/** Disconnect a bank connection from Plaid. Imported history and property assignments are kept for reconnecting. */
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await authenticatedUser(request);
  const {id}=await params;
  const db=adminDb();
  const {data:item,error}=await db.from('plaid_items').select('id,institution_name,access_token_encrypted').eq('id',id).eq('user_id',user.id).single();
  if(error)throw error;
  if(item.access_token_encrypted!=='revoked'){
    try{await plaidClient().itemRemove({access_token:decryptToken(item.access_token_encrypted)});}
    catch{/* The bank may already have revoked access. The connection is still closed here. */}
  }
  const now=new Date().toISOString();
  const closed=await db.from('plaid_items').update({status:'unlinked',disconnected_at:now,access_token_encrypted:'revoked'}).eq('id',id);
  if(closed.error)throw closed.error;
  const {data:accounts}=await db.from('plaid_accounts').select('mask').eq('item_id',id).is('archived_at',null);
  const archived=await db.from('plaid_accounts').update({archived_at:now,import_enabled:false,stopped_at:now}).eq('item_id',id).is('archived_at',null);
  if(archived.error)throw archived.error;
  const masks=(accounts||[]).map(row=>row.mask).filter(Boolean) as string[];
  if(masks.length){
    const marked=await db.from('transactions').update({source_connection_status:'unlinked'}).eq('user_id',user.id).eq('source','plaid').eq('source_institution',item.institution_name).in('source_account_mask',masks);
    if(marked.error)throw marked.error;
  }
  return Response.json({ok:true});
}catch(error){return apiError(error)}}

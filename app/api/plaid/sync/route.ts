import { apiError, adminDb, authenticatedUser, errorMessage, plaidErrorDetails } from '@/lib/plaid/server';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';
export const maxDuration=60;

/** Each connection succeeds or fails on its own, so one revoked Chase connection cannot fail the others. */
export async function POST(request:Request){try{
  const user=await authenticatedUser(request);
  const body=await request.json().catch(()=>({}));
  const db=adminDb();
  let query=db.from('plaid_items').select('*').eq('user_id',user.id).is('disconnected_at',null);
  const itemIds=Array.isArray(body.itemIds)?body.itemIds.filter(Boolean):body.itemId?[body.itemId]:[];
  if(itemIds.length)query=query.in('id',itemIds);
  const {data:items,error}=await query;
  if(error)throw error;
  const {data:active,error:accountError}=await db.from('plaid_accounts').select('item_id').eq('user_id',user.id).is('archived_at',null).in('item_id',(items||[]).map(item=>item.id));
  if(accountError)throw accountError;
  const withAccounts=new Set((active||[]).map(row=>row.item_id));
  const refresh=body.refresh!==false;
  const resync=body.resync!==false;
  const results=await Promise.all((items||[]).filter(item=>withAccounts.has(item.id)).map(async item=>{
    try{return {itemId:item.id,ok:true,...await syncPlaidItem(db,item,{refresh,resync})};}
    catch(failure){return {itemId:item.id,ok:false,error:errorMessage(failure),code:plaidErrorDetails(failure)?.code||null};}
  }));
  return Response.json({ok:results.every(result=>result.ok),results});
}catch(error){return apiError(error)}}

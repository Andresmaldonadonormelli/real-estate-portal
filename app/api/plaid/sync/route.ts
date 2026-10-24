import { apiError, adminDb, authenticatedUser } from '@/lib/plaid/server';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';
export async function POST(request:Request){try{
  const user=await authenticatedUser(request);
  const body=await request.json().catch(()=>({}));
  const db=adminDb();
  let query=db.from('plaid_items').select('*').eq('user_id',user.id).is('disconnected_at',null);
  const itemIds=Array.isArray(body.itemIds)?body.itemIds.filter(Boolean):body.itemId?[body.itemId]:[];
  if(itemIds.length)query=query.in('id',itemIds);
  const {data:items,error}=await query;
  if(error)throw error;
  const refresh=body.refresh!==false;
  const resync=body.resync!==false;
  const results=await Promise.all((items||[]).map(item=>syncPlaidItem(db,item,{refresh,resync})));
  return Response.json({ok:true,results});
}catch(error){return apiError(error)}}

import { apiError, adminDb, authenticatedUser } from '@/lib/plaid/server';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';
export async function POST(request:Request){try{const user=await authenticatedUser(request);const body=await request.json().catch(()=>({}));const db=adminDb();let query=db.from('plaid_items').select('*').eq('user_id',user.id).is('disconnected_at',null);if(body.itemId)query=query.eq('id',body.itemId);const {data:items,error}=await query;if(error)throw error;const results=[];for(const item of items||[])results.push(await syncPlaidItem(db,item));return Response.json({ok:true,results});}catch(error){return apiError(error)}}

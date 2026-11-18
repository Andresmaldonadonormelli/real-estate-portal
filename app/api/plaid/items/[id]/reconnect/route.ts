import { after } from 'next/server';
import { apiError, adminDb, authenticatedUser } from '@/lib/plaid/server';
import { reconnectItem } from '@/lib/plaid/reconcile';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';

/** Called after Plaid Link update mode succeeds for an existing connection. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await authenticatedUser(request);
  const {id}=await params;
  const db=adminDb();
  const result=await reconnectItem(db,user.id,id);
  after(async()=>{
    try{
      const {data:item}=await db.from('plaid_items').select('*').eq('id',id).is('disconnected_at',null).single();
      if(item)await syncPlaidItem(db,item,{resync:true});
    }catch{/* Recorded on the connection; Sync retries. */}
  });
  return Response.json({ok:true,accountCount:result.accountCount,restored:result.restored});
}catch(error){return apiError(error)}}

import { apiError, adminDb, authenticatedUser } from '@/lib/plaid/server';

export const runtime='nodejs';

export async function POST(request:Request){
  try{
    if((process.env.PLAID_ENV||'sandbox').toLowerCase()!=='sandbox')return Response.json({error:'Sandbox tools are only available in Sandbox.'},{status:403});
    const user=await authenticatedUser(request);const db=adminDb();
    const {data:items,error:itemError}=await db.from('plaid_items').select('id').eq('user_id',user.id).eq('institution_id','re_portal_sandbox_fixture').is('disconnected_at',null);
    if(itemError)throw itemError;
    const ids=(items||[]).map(item=>item.id);
    const {data:transactions,error:transactionError}=await db.from('transactions').select('id').eq('user_id',user.id).eq('source','plaid').eq('source_institution','Sandbox Test Bank').is('archived_at',null);
    if(transactionError)throw transactionError;
    const now=new Date().toISOString();
    if(transactions?.length){const {error}=await db.from('transactions').update({archived_at:now}).in('id',transactions.map(transaction=>transaction.id));if(error)throw error;}
    if(ids.length){const {error:accountError}=await db.from('plaid_accounts').update({archived_at:now,import_enabled:false,stopped_at:now,property_id:null}).in('item_id',ids);if(accountError)throw accountError;const {error:itemUpdateError}=await db.from('plaid_items').update({status:'unlinked',disconnected_at:now,access_token_encrypted:'revoked'}).in('id',ids);if(itemUpdateError)throw itemUpdateError;}
    return Response.json({ok:true,removed:transactions?.length||0});
  }catch(error){return apiError(error);}
}

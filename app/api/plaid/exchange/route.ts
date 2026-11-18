import { after } from 'next/server';
import { apiError, adminDb, authenticatedUser, encryptToken, plaidClient } from '@/lib/plaid/server';
import { attachAccounts } from '@/lib/plaid/reconcile';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';
export async function POST(request:Request){try{
  const user=await authenticatedUser(request);
  const {publicToken,institution,selectedAccountIds=[]}=await request.json();
  if(!publicToken)return Response.json({error:'Missing public token.'},{status:400});
  if(!Array.isArray(selectedAccountIds)||!selectedAccountIds.length)return Response.json({error:'Select at least one account in Plaid.'},{status:400});
  const plaid=plaidClient();
  const exchange=await plaid.itemPublicTokenExchange({public_token:publicToken});
  const accessToken=exchange.data.access_token;
  const db=adminDb();
  const {data:item,error}=await db.from('plaid_items').upsert({user_id:user.id,plaid_item_id:exchange.data.item_id,access_token_encrypted:encryptToken(accessToken),institution_id:institution?.institution_id||null,institution_name:institution?.name||'Linked bank',status:'connected',disconnected_at:null},{onConflict:'plaid_item_id'}).select().single();
  if(error)throw error;
  const accounts=await plaid.accountsGet({access_token:accessToken});
  const selected=new Set(selectedAccountIds);
  const supported=accounts.data.accounts.filter(account=>selected.has(account.account_id)&&(account.type==='depository'||(account.type==='credit'&&account.subtype==='credit card')));
  const result=await attachAccounts(db,item,supported);
  after(async()=>{try{await syncPlaidItem(db,item,{resync:true});}catch{/* The next webhook or Sync retries the import. */}});
  return Response.json({ok:true,accountCount:result.accountCount,restored:result.restored});
}catch(error){return apiError(error)}}

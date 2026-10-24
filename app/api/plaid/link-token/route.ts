import { CountryCode, Products } from 'plaid';
import { apiError, adminDb, authenticatedUser, decryptToken, plaidClient } from '@/lib/plaid/server';
export const runtime='nodejs';

/** With an itemId, opens Link in update mode for that existing connection so its accounts, mappings, and history stay attached. */
export async function POST(request:Request){try{
  const user=await authenticatedUser(request);
  const body=await request.json().catch(()=>({}));
  const base={user:{client_user_id:user.id},client_name:'RE Portal',country_codes:[CountryCode.Us],language:'en',webhook:process.env.PLAID_WEBHOOK_URL||undefined};
  if(body.itemId){
    const {data:item,error}=await adminDb().from('plaid_items').select('id,access_token_encrypted,disconnected_at').eq('id',body.itemId).eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    if(!item||item.disconnected_at||item.access_token_encrypted==='revoked')return Response.json({error:'This bank connection was disconnected. Use Link bank to connect it again; existing accounts and history will be matched.'},{status:409});
    const response=await plaidClient().linkTokenCreate({...base,access_token:decryptToken(item.access_token_encrypted),update:{account_selection_enabled:true}});
    return Response.json({link_token:response.data.link_token,mode:'update'});
  }
  const response=await plaidClient().linkTokenCreate({...base,products:[Products.Transactions]});
  return Response.json({link_token:response.data.link_token,mode:'new'});
}catch(error){return apiError(error)}}

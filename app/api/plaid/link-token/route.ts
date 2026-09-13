import { CountryCode, Products } from 'plaid';
import { apiError, authenticatedUser, plaidClient } from '@/lib/plaid/server';
export const runtime='nodejs';
export async function POST(request:Request){try{const user=await authenticatedUser(request);const response=await plaidClient().linkTokenCreate({user:{client_user_id:user.id},client_name:'RE Portal',products:[Products.Transactions],country_codes:[CountryCode.Us],language:'en',webhook:process.env.PLAID_WEBHOOK_URL||undefined});return Response.json({link_token:response.data.link_token});}catch(error){return apiError(error)}}

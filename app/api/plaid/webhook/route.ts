import crypto from 'node:crypto';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { adminDb, apiError, plaidClient } from '@/lib/plaid/server';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';

async function verifiedBody(request:Request){
  const raw=await request.text();const token=request.headers.get('plaid-verification');if(!token)throw new Error('Invalid webhook signature.');
  const {kid}=decodeProtectedHeader(token);if(!kid)throw new Error('Invalid webhook signature.');
  const response=await plaidClient().webhookVerificationKeyGet({key_id:kid});
  const key=await importJWK(response.data.key as JsonWebKey,'ES256');
  const {payload}=await jwtVerify(token,key,{algorithms:['ES256'],maxTokenAge:'5 minutes'});
  const digest=crypto.createHash('sha256').update(raw).digest('hex');
  if(payload.request_body_sha256!==digest)throw new Error('Invalid webhook signature.');
  return JSON.parse(raw);
}

export async function POST(request:Request){try{const body=await verifiedBody(request);if(body.webhook_type!=='TRANSACTIONS'||body.webhook_code!=='SYNC_UPDATES_AVAILABLE')return Response.json({ok:true});const db=adminDb();const {data:item,error}=await db.from('plaid_items').select('*').eq('plaid_item_id',body.item_id).is('disconnected_at',null).single();if(error)throw error;await syncPlaidItem(db,item);return Response.json({ok:true});}catch(error){return apiError(error)}}

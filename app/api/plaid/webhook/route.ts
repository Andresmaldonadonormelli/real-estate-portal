import crypto from 'node:crypto';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { adminDb, apiError, plaidClient } from '@/lib/plaid/server';
import { syncPlaidItem } from '@/lib/plaid/sync';
export const runtime='nodejs';

async function verifiedBody(request:Request){
  const raw=await request.text();
  const token=request.headers.get('plaid-verification');
  if(!token)throw new Error('Invalid webhook signature.');
  const {kid}=decodeProtectedHeader(token);
  if(!kid)throw new Error('Invalid webhook signature.');
  const response=await plaidClient().webhookVerificationKeyGet({key_id:kid});
  const key=await importJWK(response.data.key as JsonWebKey,'ES256');
  const {payload}=await jwtVerify(token,key,{algorithms:['ES256'],maxTokenAge:'5 minutes'});
  const digest=crypto.createHash('sha256').update(raw).digest('hex');
  if(payload.request_body_sha256!==digest)throw new Error('Invalid webhook signature.');
  return JSON.parse(raw);
}

export async function POST(request:Request){
  try{
    const body=await verifiedBody(request);
    const db=adminDb();

    if(body.webhook_type==='TRANSACTIONS'&&body.webhook_code==='SYNC_UPDATES_AVAILABLE'){
      const {data:item,error}=await db.from('plaid_items').select('*').eq('plaid_item_id',body.item_id).is('disconnected_at',null).single();
      if(error)throw error;
      await syncPlaidItem(db,item);
      return Response.json({ok:true});
    }

    if(body.webhook_type==='ITEM'){
      const errorCode=body.error?.error_code||body.webhook_code||null;
      const errorMessage=body.error?.error_message||(
        body.webhook_code==='PENDING_EXPIRATION'?'Bank connection expires soon. Re-link to keep importing.':
        body.webhook_code==='USER_PERMISSION_REVOKED'?'Bank access was revoked. Re-link to resume importing.':
        body.webhook_code==='WEBHOOK_UPDATE_ACKNOWLEDGED'?null:
        'Bank connection needs attention.'
      );
      const status=body.webhook_code==='ERROR'||body.webhook_code==='USER_PERMISSION_REVOKED'||errorCode==='ITEM_LOGIN_REQUIRED'
        ?'needs_reauth'
        :body.webhook_code==='PENDING_EXPIRATION'
          ?'pending_expiration'
          :'connected';
      if(errorMessage||status!=='connected'){
        await db.from('plaid_items').update({
          status,
          error_code:errorCode,
          error_message:errorMessage,
        }).eq('plaid_item_id',body.item_id).is('disconnected_at',null);
      }
      return Response.json({ok:true});
    }

    return Response.json({ok:true});
  }catch(error){return apiError(error)}
}

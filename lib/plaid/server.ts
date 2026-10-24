import 'server-only';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

function required(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is not configured.`);return value;}

export function plaidClient(){
  const env=(process.env.PLAID_ENV||'sandbox').toLowerCase();
  const basePath=env==='production'?PlaidEnvironments.production:env==='development'?PlaidEnvironments.development:PlaidEnvironments.sandbox;
  return new PlaidApi(new Configuration({basePath,baseOptions:{headers:{'PLAID-CLIENT-ID':required('PLAID_CLIENT_ID'),'PLAID-SECRET':required('PLAID_SECRET')}}}));
}

export function adminDb(){return createClient(required('NEXT_PUBLIC_SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}

export async function authenticatedUser(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('Unauthorized');
  const client=createClient(required('NEXT_PUBLIC_SUPABASE_URL'),required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)throw new Error('Unauthorized');
  return data.user;
}

function encryptionKey(){return crypto.createHash('sha256').update(required('PLAID_TOKEN_ENCRYPTION_KEY')).digest();}
export function encryptToken(value:string){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;}
export function decryptToken(value:string){const [iv,tag,data]=value.split('.');const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');}

type PlaidErrorBody={error_code?:string;error_type?:string;error_message?:string;display_message?:string|null;request_id?:string};

/** Plaid SDK errors are axios errors whose own message is only "Request failed with status code 400". */
export function plaidErrorDetails(error:unknown){
  const response=(error as {response?:{status?:number;data?:PlaidErrorBody}})?.response;
  const body=response?.data;
  if(!body?.error_code)return null;
  return {status:response?.status||400,code:body.error_code,type:body.error_type||'',message:body.display_message||body.error_message||'The bank returned an error.',requestId:body.request_id||''};
}

export function errorMessage(error:unknown){
  const plaid=plaidErrorDetails(error);
  if(plaid)return `${plaid.message} (${plaid.code})`;
  if(error instanceof Error)return error.message;
  if(error&&typeof error==='object'&&'message'in error&&typeof error.message==='string')return error.message;
  return 'Unexpected server error.';
}

export function apiError(error:unknown){
  const plaid=plaidErrorDetails(error);
  const message=errorMessage(error);
  if(message!=='Unauthorized')console.error('[plaid api]',plaid?{status:plaid.status,code:plaid.code,type:plaid.type,requestId:plaid.requestId,message:plaid.message}:message);
  return Response.json({error:message,code:plaid?.code||null},{status:message==='Unauthorized'?401:plaid?502:500});
}

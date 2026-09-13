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

export function apiError(error:unknown){const message=error instanceof Error?error.message:'Unexpected server error.';return Response.json({error:message},{status:message==='Unauthorized'?401:500});}

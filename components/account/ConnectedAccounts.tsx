'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { ProductSelect } from '@/components/common/ProductControls';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';

type Item={id:string;institution_name:string;status:string;error_message:string|null;last_synced_at:string|null};
type Account={id:string;item_id:string;name:string;official_name:string|null;mask:string|null;current_balance:number|null;available_balance:number|null;property_id:string|null;last_synced_at:string|null};
type Property={id:string;address:string};

export default function ConnectedAccounts(){
  const {session}=useAuth();const [items,setItems]=useState<Item[]>([]);const [accounts,setAccounts]=useState<Account[]>([]);const [properties,setProperties]=useState<Property[]>([]);const [linkToken,setLinkToken]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const headers=useMemo(()=>({Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'}),[session.access_token]);
  const request=useCallback(async(path:string,init:RequestInit={})=>{const response=await fetch(path,{...init,headers:{...headers,...init.headers}});const json=await response.json();if(!response.ok)throw new Error(json.error||'Request failed.');return json},[headers]);
  const load=useCallback(async()=>{const [connected,propertyRows]=await Promise.all([request('/api/plaid/accounts'),supabase.from('properties').select('id,address').is('archived_at',null).order('address')]);setItems(connected.items||[]);setAccounts(connected.accounts||[]);if(!propertyRows.error)setProperties((propertyRows.data||[]) as Property[]);},[request]);
  useEffect(()=>{load().catch(e=>setError(e.message))},[load]);
  const createLink=async()=>{setBusy(true);setError('');try{const data=await request('/api/plaid/link-token',{method:'POST'});setLinkToken(data.link_token);}catch(e){setError(e instanceof Error?e.message:'Could not start Plaid.')}finally{setBusy(false)}};
  const onSuccess=useCallback(async(publicToken:string,metadata:any)=>{setBusy(true);setError('');try{await request('/api/plaid/exchange',{method:'POST',body:JSON.stringify({publicToken,institution:metadata.institution})});setLinkToken(null);await load();}catch(e){setError(e instanceof Error?e.message:'Could not connect account.')}finally{setBusy(false)}},[request,load]);
  const plaid=usePlaidLink({token:linkToken,onSuccess,onExit:()=>setLinkToken(null)});
  useEffect(()=>{if(linkToken&&plaid.ready)plaid.open()},[linkToken,plaid.ready,plaid.open]);
  const map=async(id:string,propertyId:string)=>{setBusy(true);try{await request(`/api/plaid/accounts/${id}`,{method:'PATCH',body:JSON.stringify({propertyId})});await load();}catch(e){setError(e instanceof Error?e.message:'Could not map account.')}finally{setBusy(false)}};
  const sync=async()=>{setBusy(true);setError('');try{await request('/api/plaid/sync',{method:'POST',body:'{}'});await load();}catch(e){setError(e instanceof Error?e.message:'Could not sync accounts.')}finally{setBusy(false)}};
  const disconnect=async(item:Item)=>{if(!confirm(`Disconnect ${item.institution_name}? Pending imported transactions remain in Needs Review.`))return;setBusy(true);try{await request(`/api/plaid/items/${item.id}`,{method:'DELETE'});await load();}catch(e){setError(e instanceof Error?e.message:'Could not disconnect bank.')}finally{setBusy(false)}};
  return <section className="connected-accounts-setting"><div className="connected-accounts-head"><div><strong>Connected accounts</strong><span>Import bank activity into Needs Review and map each account to one property.</span></div><div className="connected-accounts-actions">{accounts.length>0&&<button className="product-secondary-button" onClick={sync} disabled={busy}><RefreshCw size={16}/>{busy?'Syncing…':'Sync'}</button>}<button className="product-secondary-button" onClick={createLink} disabled={busy}>{busy?'Please wait…':'Connect bank'}</button></div></div>{error&&<p className="connected-accounts-error">{error}</p>}{items.map(item=><div className="connected-bank" key={item.id}><div className="connected-bank-title"><div><strong>{item.institution_name}</strong><span>{item.last_synced_at?`Synced ${new Date(item.last_synced_at).toLocaleString()}`:'Ready to sync'}</span></div><button onClick={()=>disconnect(item)} aria-label={`Disconnect ${item.institution_name}`}><Trash2 size={16}/></button></div>{accounts.filter(account=>account.item_id===item.id).map(account=><div className="connected-bank-account" key={account.id}><div><strong>{account.official_name||account.name}{account.mask?` •••• ${account.mask}`:''}</strong><span>{formatCurrency(account.current_balance||0)} current balance</span></div><ProductSelect aria-label={`Property for ${account.name}`} value={account.property_id||''} disabled={busy} onChange={event=>map(account.id,event.target.value)}><option value="">Choose property</option>{properties.map(property=><option value={property.id} key={property.id}>{property.address}</option>)}</ProductSelect></div>)}</div>)}{!items.length&&!error&&<p className="connected-accounts-empty">No bank accounts connected yet. Sandbox uses test-bank data only.</p>}</section>;
}

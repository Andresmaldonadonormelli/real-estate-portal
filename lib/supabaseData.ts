type CacheEntry<T>={expires:number;value?:T;pending?:Promise<T>};
const requestCache=new Map<string,CacheEntry<unknown>>();

export const PROPERTY_FIELDS='id,address,city,state,zip,mortgage_balance,property_type,purchase_price,purchase_date,monthly_mortgage_payment,management_fee_percent,image_path,mortgage_start_date,mortgage_recurring_enabled,archived_at,created_at';
export const UNIT_FIELDS='id,property_id,unit_number,bedroom_count,bathroom_count,sqft,current_rent,tenant_name,occupied,recurring_rent_enabled,archived_at,created_at';
export const UNIT_DETAIL_FIELDS=`${UNIT_FIELDS},lease_start_date,lease_end_date,lease_document_path,rent_due_day`;
export const TRANSACTION_FIELDS='id,property_id,unit_id,transaction_date,type,category,description,payee_source,amount,notes,import_key,source,status,confirmed_at,archived_at,created_at,needs_review,receipt_path,supporting_document_id';
export const DOCUMENT_FIELDS='id,property_id,unit_id,category,title,file_name,storage_path,mime_type,file_size,document_date,notes,created_at,expires_at,reminder_days,archived_at';

export function historyStart(months=15){
  const date=new Date();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-(months-1));
  return date.toISOString().slice(0,10);
}

export async function cachedSupabaseRequest<T>(key:string,loader:()=>Promise<T>,ttl=15000):Promise<T>{
  const now=Date.now();const cached=requestCache.get(key) as CacheEntry<T>|undefined;
  if(cached?.value!==undefined&&cached.expires>now)return cached.value;
  if(cached?.pending)return cached.pending;
  const pending=loader().then(value=>{requestCache.set(key,{value,expires:Date.now()+ttl});return value}).catch(error=>{requestCache.delete(key);throw error});
  requestCache.set(key,{expires:now+ttl,pending});return pending;
}

export function invalidateSupabaseCache(prefix=''){for(const key of requestCache.keys())if(!prefix||key.startsWith(prefix))requestCache.delete(key)}

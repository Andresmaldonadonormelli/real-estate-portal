'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, PropertyDocument, Unit } from '@/lib/types';
import PropertyOverview from '@/components/property/PropertyOverview';
import PropertyCashflow from '@/components/property/PropertyCashflow';
import PropertyImprove from '@/components/property/PropertyImprove';
import PropertyLoan from '@/components/property/PropertyLoan';
import PropertyUnits from '@/components/property/PropertyUnits';
import PropertyDocuments from '@/components/property/PropertyDocuments';
import { ButtonLink } from '@/components/ui/Button';
import { UnderlineTabs } from '@/components/common/ProductControls';
import { emptyProfile, parseProfile, type PropertyProfile } from '@/lib/propertyProfile';
import { propertyTypeLabel } from '@/lib/propertyPosition';
import type { PropertyTransaction as Tx } from '@/lib/propertyFinancials';
import { cachedSupabaseRequest, DOCUMENT_FIELDS, historyStart, invalidateSupabaseCache, PROPERTY_FIELDS, TRANSACTION_FIELDS, UNIT_DETAIL_FIELDS, UNIT_FIELDS } from '@/lib/supabaseData';

type Tab = 'overview' | 'cashflow' | 'tenants' | 'loan' | 'improve' | 'documents';

const LEASE_DOC_PREFIX='property-documents:';
function leaseStorageRef(value?:string|null){
  const path=String(value||'');
  return path.startsWith(LEASE_DOC_PREFIX)?{bucket:'property-documents',path:path.slice(LEASE_DOC_PREFIX.length)}:{bucket:'unit-leases',path};
}
function leaseFileName(path:string){
  const raw=path.split('/').pop()||'lease.pdf';
  return raw.replace(/^\d+-/,'')||'lease.pdf';
}
async function syncLegacyUnitLeases(propertyId:string,unitRows:any[],docRows:any[]){
  const auth=await supabase.auth.getUser();
  const user=auth.data.user;
  if(!user)return {units:unitRows,documents:docRows};
  const nextUnits=[...unitRows];
  const nextDocs=[...docRows];
  for(let i=0;i<nextUnits.length;i++){
    let unit=nextUnits[i];
    if(!unit?.lease_document_path)continue;

    let ref=leaseStorageRef(unit.lease_document_path);
    let storagePath=ref.path;
    let mimeType='application/pdf';
    let fileSize:number|null=null;
    let fileName=leaseFileName(storagePath);

    // Move legacy unit-leases files into the central property-documents bucket first.
    if(ref.bucket!=='property-documents'){
      const signed=await supabase.storage.from(ref.bucket).createSignedUrl(ref.path,120);
      if(signed.error||!signed.data?.signedUrl)continue;
      const response=await fetch(signed.data.signedUrl);
      if(!response.ok)continue;
      const blob=await response.blob();
      mimeType=blob.type||mimeType; fileSize=blob.size||null;
      const safe=fileName.replace(/[^a-zA-Z0-9._-]+/g,'-');
      storagePath=`${user.id}/${propertyId}/${unit.id}/${Date.now()}-${safe}`;
      const moved=await supabase.storage.from('property-documents').upload(storagePath,blob,{upsert:false,contentType:mimeType});
      if(moved.error)continue;
      const newLeasePath=`${LEASE_DOC_PREFIX}${storagePath}`;
      const unitUpdate=await supabase.from('units').update({lease_document_path:newLeasePath}).eq('id',unit.id);
      if(unitUpdate.error)continue;
      unit={...unit,lease_document_path:newLeasePath};
      nextUnits[i]=unit;
    }

    const title=`${unit.unit_number||'Unit'} Lease${unit.tenant_name?` · ${unit.tenant_name}`:''}`;
    const row={
      user_id:user.id, property_id:propertyId, unit_id:unit.id, category:'Lease',
      title, file_name:fileName, storage_path:storagePath, mime_type:mimeType, file_size:fileSize,
      document_date:unit.lease_start_date||null, expires_at:unit.lease_end_date||null,
      reminder_days:60, notes:unit.tenant_name?`Signed lease for ${unit.tenant_name}`:null, archived_at:null,
    };

    // The actual unit lease path is the source of truth. Do not treat any random
    // Lease record for the unit as "already synced" unless it points to this file.
    const exact=nextDocs.find((d:any)=>d.storage_path===storagePath&&!d.archived_at);
    const unitLease=nextDocs.find((d:any)=>d.unit_id===unit.id&&d.category==='Lease'&&!d.archived_at);
    const target=exact||unitLease;
    if(target){
      const updated=await supabase.from('documents').update(row).eq('id',target.id).select(DOCUMENT_FIELDS).single();
      if(!updated.error&&updated.data){
        const idx=nextDocs.findIndex((d:any)=>d.id===target.id);
        if(idx>=0)nextDocs[idx]=updated.data;
      }
      continue;
    }

    const inserted=await supabase.from('documents').insert(row).select(DOCUMENT_FIELDS).single();
    if(!inserted.error&&inserted.data)nextDocs.unshift(inserted.data);
  }
  return {units:nextUnits,documents:nextDocs};
}

export default function PropertyWorkspacePage(){
  const params=useParams<{id:string}>();
  const searchParams=useSearchParams();
  const propertyId=String(params?.id || '');
  const [tab,setTab]=useState<Tab>('overview');
  const requestedTab=searchParams.get('tab');
  const [property,setProperty]=useState<Property|null>(null);
  const [units,setUnits]=useState<Unit[]>([]);
  const [transactions,setTransactions]=useState<Tx[]>([]);
  const [documents,setDocuments]=useState<PropertyDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [profile,setProfile]=useState<PropertyProfile>(emptyProfile());

  useEffect(()=>{
    const requested = requestedTab === 'units' ? 'tenants' : requestedTab;
    if (requested === 'overview' || requested === 'cashflow' || requested === 'tenants' || requested === 'loan' || requested === 'improve' || requested === 'documents') setTab(requested);
  },[requestedTab]);

  useEffect(()=>{ if(!propertyId) return; (async()=>{
    setLoading(true); setError('');
    const [p,u,t,d]=await Promise.all([
      cachedSupabaseRequest(`property:${propertyId}`,async()=>{
        const extended=await supabase.from('properties').select(`${PROPERTY_FIELDS},property_profile`).eq('id',propertyId).is('archived_at',null).single();
        if(!extended.error)return extended;
        return supabase.from('properties').select(PROPERTY_FIELDS).eq('id',propertyId).is('archived_at',null).single();
      }),
      cachedSupabaseRequest(`property:${propertyId}:units`,async()=>await supabase.from('units').select(UNIT_DETAIL_FIELDS).eq('property_id',propertyId).is('archived_at',null).order('unit_number')),
      cachedSupabaseRequest(`property:${propertyId}:transactions`,async()=>await supabase.from('transactions').select(TRANSACTION_FIELDS).eq('property_id',propertyId).is('archived_at',null).gte('transaction_date',historyStart(121)).order('transaction_date',{ascending:false})),
      cachedSupabaseRequest(`property:${propertyId}:documents`,async()=>await supabase.from('documents').select(DOCUMENT_FIELDS).eq('property_id',propertyId).is('archived_at',null).order('created_at',{ascending:false})),
    ]);
    if(p.error){ setError(p.error.message); setLoading(false); return; }
    const row=p.data as Property & { property_profile?: unknown };
    const prop=row as Property;
    let unitRows=(u.data||[]) as Unit[];
    if(u.error){
      const fallback=await cachedSupabaseRequest(`property:${propertyId}:units:core`,async()=>await supabase.from('units').select(UNIT_FIELDS).eq('property_id',propertyId).is('archived_at',null).order('unit_number'));
      if(fallback.error){setError(fallback.error.message);setLoading(false);return;}
      unitRows=(fallback.data||[]) as Unit[];
    }
    const synced=await syncLegacyUnitLeases(propertyId,unitRows,(d.data||[]) as PropertyDocument[]);
    setProperty(prop); setProfile(parseProfile(row.property_profile)); setUnits(synced.units as Unit[]); setTransactions((t.data||[]) as Tx[]); setDocuments(synced.documents as PropertyDocument[]);
    setLoading(false);
  })(); },[propertyId]);

  if(loading) return <div className="property-workspace property-workspace-skeleton" aria-busy="true" aria-label="Loading property">
    <div className="property-skeleton-back skeleton-block"/>
    <div className="property-skeleton-header">
      <div className="property-skeleton-image skeleton-block"/>
      <div className="property-skeleton-title-copy">
        <div className="property-skeleton-title skeleton-block"/>
        <div className="property-skeleton-city skeleton-block"/>
        <div className="property-skeleton-meta skeleton-block"/>
        <div className="property-skeleton-ledger skeleton-block"/>
      </div>
    </div>
    <div className="property-skeleton-tabs skeleton-block"/>
    <div className="property-skeleton-overview">
      <div className="property-skeleton-main">
        <section className="property-skeleton-module property-skeleton-chart">
          <div className="skeleton-block property-skeleton-heading"/>
          <div className="skeleton-block property-skeleton-value"/>
          <div className="skeleton-block property-skeleton-plot"/>
        </section>
        <section className="property-skeleton-module property-skeleton-actions">
          <div className="skeleton-block property-skeleton-heading"/>
          <div className="skeleton-block property-skeleton-row"/>
          <div className="skeleton-block property-skeleton-row"/>
        </section>
        {['financials','trends','expenses','statistics','transactions'].map(section=><div className="property-skeleton-section" key={section}><div className="skeleton-block"/></div>)}
      </div>
      <aside className="property-skeleton-module property-skeleton-pulse">
        <div className="skeleton-block property-skeleton-heading"/>
        <div className="skeleton-block property-skeleton-line"/>
        <div className="skeleton-block property-skeleton-track"/>
        <div className="skeleton-block property-skeleton-row"/>
        <div className="skeleton-block property-skeleton-row"/>
        <div className="skeleton-block property-skeleton-row"/>
      </aside>
    </div>
  </div>;
  if(error || !property) return <div className="property-workspace"><Link href="/properties" className="property-back"><ArrowLeft size={16}/> Properties</Link><div className="card property-empty">{error || 'Property not found.'}</div></div>;

  return <div className="property-workspace">
    <Link href="/properties" className="property-back"><ArrowLeft size={16}/> Properties</Link>

    <header className="property-workspace-header">
      <div className="property-title-copy">
        <h1>{property.address}</h1>
        <p>{property.city}, {property.state} {property.zip}</p>
        <p>{propertyTypeLabel(property.property_type)} · {units.length} {units.length === 1 ? 'unit' : 'units'}</p>
      </div>
      <div className="property-header-actions">
        <ButtonLink variant="primary" href={`/properties/${property.id}/edit`}>Edit</ButtonLink>
      </div>
    </header>

    <UnderlineTabs primary value={tab} onChange={setTab} label="Property sections" className="property-menu" options={[{value:'overview',label:'Overview'},{value:'cashflow',label:'Cash flow'},{value:'tenants',label:'Tenants'},{value:'loan',label:'Loan'},{value:'improve',label:'Improve'},{value:'documents',label:'Documents'}]}/>

    {tab==='overview' && <PropertyOverview property={property} units={units} transactions={transactions} profile={profile}/>}
    {tab==='cashflow' && <PropertyCashflow propertyId={property.id} transactions={transactions}/>}
    {tab==='tenants' && <PropertyUnits units={units} propertyId={property.id} documents={documents} transactions={transactions} managementFeePercent={property.management_fee_percent} profile={profile} onUnitsUpdated={next=>setUnits(next)} onProfileSaved={next=>{setProfile(next);invalidateSupabaseCache(`property:${propertyId}`);}} onManagementFee={fee=>setProperty(prev=>prev?{...prev,management_fee_percent:fee}:prev)} onLeaseSynced={async()=>{const d=await supabase.from('documents').select(DOCUMENT_FIELDS).eq('property_id',property.id).is('archived_at',null).order('created_at',{ascending:false});if(!d.error)setDocuments((d.data||[]) as PropertyDocument[]);}}/>}
    {tab==='loan' && <PropertyLoan property={property} profile={profile}/>}
    {tab==='improve' && <PropertyImprove property={property} units={units} transactions={transactions}/>}
    {tab==='documents' && <PropertyDocuments documents={documents} propertyId={property.id}/>}
  </div>;
}

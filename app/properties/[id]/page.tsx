'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, ChevronRight, Home, PencilLine, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, PropertyDocument, Unit } from '@/lib/types';
import PropertyOverview from '@/components/property/PropertyOverview';
import PropertyImprove from '@/components/property/PropertyImprove';
import PropertyUnits from '@/components/property/PropertyUnits';
import PropertyDocuments from '@/components/property/PropertyDocuments';
import PropertyEditModal from '@/components/property/PropertyEditModal';
import { formatDate, type PropertyTransaction as Tx } from '@/lib/propertyFinancials';
import { cachedSupabaseRequest, DOCUMENT_FIELDS, historyStart, PROPERTY_FIELDS, TRANSACTION_FIELDS, UNIT_DETAIL_FIELDS, UNIT_FIELDS } from '@/lib/supabaseData';

type Tab = 'overview' | 'improve' | 'units' | 'documents';

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
  const propertyId=String(params?.id || '');
  const [tab,setTab]=useState<Tab>('overview');
  const [property,setProperty]=useState<Property|null>(null);
  const [units,setUnits]=useState<Unit[]>([]);
  const [transactions,setTransactions]=useState<Tx[]>([]);
  const [documents,setDocuments]=useState<PropertyDocument[]>([]);
  const [imageUrl,setImageUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [editingProperty,setEditingProperty]=useState(false);

  useEffect(()=>{ if(!propertyId) return; (async()=>{
    setLoading(true); setError('');
    const [p,u,t,d]=await Promise.all([
      cachedSupabaseRequest(`property:${propertyId}`,async()=>await supabase.from('properties').select(PROPERTY_FIELDS).eq('id',propertyId).is('archived_at',null).single()),
      cachedSupabaseRequest(`property:${propertyId}:units`,async()=>await supabase.from('units').select(UNIT_DETAIL_FIELDS).eq('property_id',propertyId).is('archived_at',null).order('unit_number')),
      cachedSupabaseRequest(`property:${propertyId}:transactions`,async()=>await supabase.from('transactions').select(TRANSACTION_FIELDS).eq('property_id',propertyId).is('archived_at',null).gte('transaction_date',historyStart(121)).order('transaction_date',{ascending:false})),
      cachedSupabaseRequest(`property:${propertyId}:documents`,async()=>await supabase.from('documents').select(DOCUMENT_FIELDS).eq('property_id',propertyId).is('archived_at',null).order('created_at',{ascending:false})),
    ]);
    if(p.error){ setError(p.error.message); setLoading(false); return; }
    const prop=p.data as Property;
    let unitRows=(u.data||[]) as Unit[];
    if(u.error){
      const fallback=await cachedSupabaseRequest(`property:${propertyId}:units:core`,async()=>await supabase.from('units').select(UNIT_FIELDS).eq('property_id',propertyId).is('archived_at',null).order('unit_number'));
      if(fallback.error){setError(fallback.error.message);setLoading(false);return;}
      unitRows=(fallback.data||[]) as Unit[];
    }
    const synced=await syncLegacyUnitLeases(propertyId,unitRows,(d.data||[]) as PropertyDocument[]);
    setProperty(prop); setUnits(synced.units as Unit[]); setTransactions((t.data||[]) as Tx[]); setDocuments(synced.documents as PropertyDocument[]);
    if(prop.image_path){ const signed=await supabase.storage.from('property-images').createSignedUrl(prop.image_path,3600); if(signed.data?.signedUrl) setImageUrl(signed.data.signedUrl); }
    setLoading(false);
  })(); },[propertyId]);

  const occupied=units.filter(u=>u.occupied).length;
  const expectedRent=units.filter(u=>u.occupied).reduce((s,u)=>s+Number(u.current_rent||0),0);

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
      <div className="property-skeleton-chart skeleton-block"/>
      <div className="property-skeleton-pulse skeleton-block"/>
    </div>
    <div className="property-skeleton-sections">{[0,1,2,3].map(i=><div className="property-skeleton-section" key={i}><div className="skeleton-block"/><div className="skeleton-block"/><div className="skeleton-block"/></div>)}</div>
  </div>;
  if(error || !property) return <div className="property-workspace"><Link href="/properties" className="property-back"><ArrowLeft size={16}/> Properties</Link><div className="card property-empty">{error || 'Property not found.'}</div></div>;

  return <div className="property-workspace">
    <Link href="/properties" className="property-back"><ArrowLeft size={16}/> Back to Properties</Link>

    <header className="property-workspace-header">
      <div className="property-title-block">
        {imageUrl ? <img src={imageUrl} alt="" className="property-workspace-image"/> : <div className="property-workspace-image property-image-placeholder"><Home size={28}/></div>}
        <div className="property-title-copy"><h1>{property.address}</h1><p>{property.city}, {property.state} {property.zip}</p><div className="property-meta"><span><Building2 size={14}/>{prettyPropertyType(property.property_type)}</span><span><Users size={14}/>{units.length} {units.length===1?'unit':'units'}</span>{units.length>0&&<span className={`property-occupancy-meta ${occupied===units.length?'full':occupied>0?'partial':'vacant'}`}><i/>{occupied}/{units.length} occupied</span>}{property.purchase_date&&<span><CalendarDays size={14}/>Purchased {formatDate(property.purchase_date)}</span>}</div><div className="property-header-actions"><button type="button" className="property-edit-inline" onClick={()=>setEditingProperty(true)}><PencilLine size={14}/> Edit property</button><Link href={`/ledger?property=${property.id}`} className="property-ledger-action">View ledger <ChevronRight size={14}/></Link></div></div>
      </div>
    </header>

    <nav className="property-subnav" aria-label="Property sections">{(['overview','improve','units','documents'] as Tab[]).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</nav>

    {tab==='overview' && <PropertyOverview property={property} units={units} transactions={transactions} expectedRent={expectedRent} onNavigate={setTab}/>} 
    {tab==='improve' && <PropertyImprove property={property} units={units} transactions={transactions}/>} 
    {tab==='units' && <PropertyUnits units={units} propertyId={property.id} onUnitsUpdated={next=>setUnits(next)} onLeaseSynced={async()=>{const d=await supabase.from('documents').select(DOCUMENT_FIELDS).eq('property_id',property.id).is('archived_at',null).order('created_at',{ascending:false});if(!d.error)setDocuments((d.data||[]) as PropertyDocument[]);}}/>} 
    {tab==='documents' && <PropertyDocuments documents={documents} propertyId={property.id}/>} 
    {editingProperty&&<PropertyEditModal property={property} onClose={()=>setEditingProperty(false)} onSaved={patch=>{setProperty(prev=>prev?({...prev,...patch} as Property):prev);setEditingProperty(false);}}/>}
  </div>;
}

function prettyPropertyType(v:string){ return ({duplex:'Duplex',single_family:'Single family',triplex:'Triplex',multi_unit:'Multi-unit'} as Record<string,string>)[v]||v||'Property'; }

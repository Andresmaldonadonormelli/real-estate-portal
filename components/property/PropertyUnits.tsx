'use client';

import React, { useState } from 'react';
import { CalendarDays, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Unit } from '@/lib/types';
import { formatKpiCurrency } from '@/lib/propertyFinancials';

const LEASE_DOC_PREFIX = 'property-documents:';
function leaseStorageRef(value?: string | null) {
  const leasePath = String(value || '');
  return leasePath.startsWith(LEASE_DOC_PREFIX) ? { bucket: 'property-documents', path: leasePath.slice(LEASE_DOC_PREFIX.length) } : { bucket: 'unit-leases', path: leasePath };
}

export default function PropertyUnits({units,propertyId,onUnitsUpdated,onLeaseSynced}:{units:Unit[];propertyId:string;onUnitsUpdated:(units:Unit[])=>void;onLeaseSynced:()=>void|Promise<void>}){
  const [editingUnitId,setEditingUnitId]=useState<string|null>(null);
  const editingUnit=(units.find(u=>u.id===editingUnitId)||null) as any;
  const handleSaved=(unitId:string,patch:Record<string,unknown>)=>{ onUnitsUpdated(units.map(u=>u.id===unitId?({...u,...patch} as Unit):u)); setEditingUnitId(null); };
  return <>
    <section className="property-tab-panel units-directory-panel">
      <div className="property-panel-head"><div><h2>Units & tenants</h2></div></div>
      {!units.length?<Empty text="No units yet."/>:<div className="units-directory-list">
        {units.map((rawUnit,index)=>{
          const unit=rawUnit as any;
          const lease=leaseStatus(unit.lease_start_date,unit.lease_end_date,unit.occupied);
          const hasLease=Boolean(unit.lease_document_path);
          const hasLeaseDates=Boolean(unit.lease_start_date&&unit.lease_end_date);
          return <article className="card unit-directory-item" key={unit.id}>
            <div className="unit-directory-head">
              <div className="unit-directory-identity">
                <div className="unit-directory-title-row">
                  <h3>{unit.unit_number||`Unit ${index+1}`}</h3>
                  <span className={unit.occupied?'unit-status occupied':'unit-status vacant'}>{unit.occupied?'Occupied':'Vacant'}</span>
                </div>
                <p>{unit.tenant_name||'No tenant assigned'}</p>
              </div>
              <button type="button" className="property-secondary-action unit-edit-action" onClick={()=>setEditingUnitId(unit.id)}>Edit unit</button>
            </div>

            <div className="unit-core-facts">
              <div><span className="unit-fact-label">Rent</span><strong>{formatKpiCurrency(Number(unit.current_rent||0))}/mo</strong></div>
              <div><span className="unit-fact-label">Layout</span><strong>{unit.bedroom_count||0} bd · {unit.bathroom_count||0} ba</strong></div>
              <div><span className="unit-fact-label">Size</span><strong>{Number(unit.sqft||0).toLocaleString()} sqft</strong></div>
            </div>

            <div className={`unit-lease-summary ${lease.tone}`}>
              <CalendarDays size={17}/>
              <span>Lease</span>
              <strong>{hasLeaseDates?`${longDate(unit.lease_start_date)} → ${longDate(unit.lease_end_date)}`:unit.occupied?'Dates not set':'No active lease'}</strong>
              {unit.occupied&&lease.short&&lease.short!=='Not set'&&lease.short!=='Vacant'?<small className={`lease-state-badge ${lease.tone}`}>{lease.short}</small>:null}
            </div>

            <div className={`unit-document-state ${hasLease?'uploaded':'missing'}`}>
              <div className="unit-document-state-main">
                <FileText size={17}/>
                <strong>{hasLease?'Lease uploaded':'No lease uploaded'}</strong>
              </div>
              <div className="unit-document-actions">{hasLease?<LeaseViewButton path={unit.lease_document_path}/>:<button type="button" className="property-secondary-action" onClick={()=>setEditingUnitId(unit.id)}>Upload lease</button>}</div>
            </div>
          </article>;
        })}
      </div>}
    </section>
    {editingUnit&&<UnitEditModal unit={editingUnit} propertyId={propertyId} onClose={()=>setEditingUnitId(null)} onSaved={(patch)=>handleSaved(editingUnit.id,patch)} onLeaseSynced={onLeaseSynced}/>}
  </>;
}

function UnitEditModal({unit,propertyId,onClose,onSaved,onLeaseSynced}:{unit:any;propertyId:string;onClose:()=>void;onSaved:(patch:Record<string,unknown>)=>void;onLeaseSynced:()=>void|Promise<void>}){
  const [form,setForm]=useState({unit_number:unit.unit_number||'',tenant_name:unit.tenant_name||'',current_rent:String(Number(unit.current_rent||0)||''),bedroom_count:String(unit.bedroom_count??''),bathroom_count:String(unit.bathroom_count??''),sqft:String(unit.sqft??''),occupied:Boolean(unit.occupied),lease_start_date:unit.lease_start_date||'',lease_end_date:unit.lease_end_date||''});
  const [file,setFile]=useState<File|null>(null); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const save=async(e:React.FormEvent)=>{
    e.preventDefault(); setSaving(true); setError('');
    let leasePath=unit.lease_document_path||null;
    try{
      const auth=await supabase.auth.getUser(); const user=auth.data.user;
      if(!user)throw new Error('You need to be signed in.');
      let uploadedDoc:{storagePath:string;fileName:string;mimeType:string|null;fileSize:number}|null=null;
      if(file){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
        const storagePath=`${user.id}/${propertyId}/${unit.id}/${Date.now()}-${safe}`;
        const upload=await supabase.storage.from('property-documents').upload(storagePath,file,{upsert:false,contentType:file.type||undefined});
        if(upload.error)throw upload.error;
        leasePath=`${LEASE_DOC_PREFIX}${storagePath}`;
        uploadedDoc={storagePath,fileName:file.name,mimeType:file.type||null,fileSize:file.size};
      }
      const patch={unit_number:form.unit_number.trim(),tenant_name:form.tenant_name.trim(),current_rent:form.current_rent?Number(form.current_rent):0,bedroom_count:form.bedroom_count?Number(form.bedroom_count):0,bathroom_count:form.bathroom_count?Number(form.bathroom_count):0,sqft:form.sqft?Number(form.sqft):0,occupied:form.occupied,lease_start_date:form.lease_start_date||null,lease_end_date:form.lease_end_date||null,lease_document_path:leasePath};
      const r=await supabase.from('units').update(patch).eq('id',unit.id); if(r.error)throw r.error;
      if(uploadedDoc){
        const exact=await supabase.from('documents').select('id').eq('property_id',propertyId).eq('storage_path',uploadedDoc.storagePath).is('archived_at',null).limit(1).maybeSingle();
        const byUnit=exact.data?.id?{data:null,error:null}:await supabase.from('documents').select('id').eq('property_id',propertyId).eq('unit_id',unit.id).eq('category','Lease').is('archived_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
        const existingId=exact.data?.id||byUnit.data?.id||null;
        const docPatch={user_id:user.id,property_id:propertyId,unit_id:unit.id,category:'Lease',title:`${patch.unit_number||'Unit'} Lease${patch.tenant_name?` · ${patch.tenant_name}`:''}`,file_name:uploadedDoc.fileName,storage_path:uploadedDoc.storagePath,mime_type:uploadedDoc.mimeType,file_size:uploadedDoc.fileSize,document_date:patch.lease_start_date,expires_at:patch.lease_end_date,reminder_days:60,notes:patch.tenant_name?`Signed lease for ${patch.tenant_name}`:null,archived_at:null};
        const docSave=existingId?await supabase.from('documents').update(docPatch).eq('id',existingId):await supabase.from('documents').insert(docPatch);
        if(docSave.error)throw new Error(`Unit saved, but the lease could not be added to Documents: ${docSave.error.message}`);
        await onLeaseSynced();
      }
      onSaved(patch);
    }catch(err:any){setError(err?.message||'Could not save unit.');}finally{setSaving(false);}
  };
  return <div className="workspace-modal-overlay"><div className="workspace-modal unit-edit-modal"><div className="workspace-modal-head"><div><div className="eyebrow">UNIT</div><h2>Edit {unit.unit_number||'unit'}</h2></div><button type="button" className="workspace-modal-close" onClick={onClose}>×</button></div>{error&&<div className="workspace-form-error">{error}</div>}<form onSubmit={save} className="workspace-form"><div className="workspace-form-grid two"><label>Unit name / number<input required value={form.unit_number} onChange={e=>setForm({...form,unit_number:e.target.value})}/></label><label>Monthly rent<input type="number" min="0" step="0.01" value={form.current_rent} onChange={e=>setForm({...form,current_rent:e.target.value})}/></label></div><label>Tenant<input value={form.tenant_name} onChange={e=>setForm({...form,tenant_name:e.target.value})}/></label><label className="workspace-checkbox"><input type="checkbox" checked={form.occupied} onChange={e=>setForm({...form,occupied:e.target.checked})}/><span>Occupied</span></label><div className="workspace-form-grid two"><label>Lease start<input type="date" value={form.lease_start_date} onChange={e=>setForm({...form,lease_start_date:e.target.value})}/></label><label>Lease end<input type="date" value={form.lease_end_date} onChange={e=>setForm({...form,lease_end_date:e.target.value})}/></label></div><div className="workspace-form-grid three"><label>Bedrooms<input type="number" min="0" step="1" value={form.bedroom_count} onChange={e=>setForm({...form,bedroom_count:e.target.value})}/></label><label>Bathrooms<input type="number" min="0" step="0.5" value={form.bathroom_count} onChange={e=>setForm({...form,bathroom_count:e.target.value})}/></label><label>Sqft<input type="number" min="0" step="1" value={form.sqft} onChange={e=>setForm({...form,sqft:e.target.value})}/></label></div><label className="workspace-file-field"><span>Lease document</span><input type="file" accept="application/pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?file.name:unit.lease_document_path?'Current lease will be kept unless you choose a replacement.':'Upload the signed lease or lease PDF.'}</small></label><div className="workspace-modal-footer"><button type="button" className="property-secondary-action" onClick={onClose}>Cancel</button><button disabled={saving} className="workspace-primary-button">{saving?'Saving…':'Save unit'}</button></div></form></div></div>;
}

function LeaseViewButton({path}:{path:string}){const [opening,setOpening]=useState(false);const open=async()=>{setOpening(true);const ref=leaseStorageRef(path);const r=await supabase.storage.from(ref.bucket).createSignedUrl(ref.path,120);setOpening(false);if(r.data?.signedUrl)window.open(r.data.signedUrl,'_blank','noopener,noreferrer');};return <button type="button" className="property-secondary-action" disabled={opening} onClick={open}>{opening?'Opening…':'View lease'}</button>}

function leaseStatus(start?:string|null,end?:string|null,occupied?:boolean){if(!occupied)return{label:'Vacant',short:'Vacant',tone:'neutral'};if(!end)return{label:'Lease dates not set',short:'Not set',tone:'neutral'};const today=new Date();today.setHours(0,0,0,0);const endDate=new Date(`${end.slice(0,10)}T12:00:00`);const days=Math.ceil((endDate.getTime()-today.getTime())/86400000);if(days<0)return{label:`Lease expired ${Math.abs(days)} days ago`,short:'Expired',tone:'danger'};if(days===0)return{label:'Lease ends today',short:'Ends today',tone:'warning'};if(days<=60)return{label:`Lease ends in ${days} days`,short:`${days} days left`,tone:'warning'};return{label:`${days} days remaining on lease`,short:`${days} days left`,tone:'good'};}
function shortDate(value:string){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});}
function longDate(value:string){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

function Empty({ text }: { text: string }) { return <div className="property-empty-inline">{text}</div>; }

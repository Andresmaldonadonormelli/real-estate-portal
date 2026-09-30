'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Unit } from '@/lib/types';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { UNIT_DETAIL_FIELDS, invalidateSupabaseCache } from '@/lib/supabaseData';
import { SecondaryButton } from '@/components/common/ProductControls';

const LEASE_DOC_PREFIX = 'property-documents:';
function leaseStorageRef(value?: string | null) {
  const leasePath = String(value || '');
  return leasePath.startsWith(LEASE_DOC_PREFIX) ? { bucket: 'property-documents', path: leasePath.slice(LEASE_DOC_PREFIX.length) } : { bucket: 'unit-leases', path: leasePath };
}

export default function PropertyUnits({units,propertyId,managementFeePercent=0,onUnitsUpdated,onLeaseSynced}:{units:Unit[];propertyId:string;managementFeePercent?:number|null;onUnitsUpdated:(units:Unit[])=>void;onLeaseSynced:()=>void|Promise<void>}){
  const [editingUnitId,setEditingUnitId]=useState<string|null>(null);
  const [adding,setAdding]=useState(false);
  const editingUnit=(units.find(u=>u.id===editingUnitId)||null) as any;
  const handleSaved=(unitId:string,patch:Record<string,unknown>)=>{ onUnitsUpdated(units.map(u=>u.id===unitId?({...u,...patch} as Unit):u)); setEditingUnitId(null); };
  const occupied=units.filter(unit=>unit.occupied);
  const inPlace=occupied.reduce((sum,unit)=>sum+Number(unit.current_rent||0),0);
  const expected=units.reduce((sum,unit)=>sum+Number(unit.current_rent||0),0);
  const fee=Number(managementFeePercent||0);
  return <>
    <div className="property-stack">
      <section className="property-module">
        <h2>Rent</h2>
        <div className="property-stat-row">
          <div><span>In place</span><strong>{formatKpiCurrency(inPlace)}/mo</strong></div>
          <div><span>Expected</span><strong>{formatKpiCurrency(expected)}/mo</strong></div>
          <div><span>Vacant</span><strong>{units.length-occupied.length}</strong></div>
        </div>
        {fee>0&&<p className="property-module-note">Management fee is {fee}% of collected rent.</p>}
      </section>
      <section className="property-module">
        <div className="property-module-head"><h2>Tenants</h2><SecondaryButton onClick={()=>setAdding(true)}>Add unit</SecondaryButton></div>
        {!units.length?<p className="property-module-note">No units yet.</p>:<div className="property-table-scroll"><table className="property-tenant-table">
          <thead><tr><th>Unit</th><th>Tenant</th><th>Rent</th><th>Lease</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {units.map((rawUnit,index)=>{
              const unit=rawUnit as any;
              const lease=leaseStatus(unit.lease_start_date,unit.lease_end_date,unit.occupied);
              const hasLease=Boolean(unit.lease_document_path);
              return <tr key={unit.id}>
                <td>{unit.unit_number||`Unit ${index+1}`}</td>
                <td>{unit.tenant_name||'—'}</td>
                <td>{formatKpiCurrency(Number(unit.current_rent||0))}</td>
                <td>{unit.lease_end_date?longDate(unit.lease_end_date):'—'}</td>
                <td>{unit.occupied?lease.short:'Vacant'}</td>
                <td className="property-tenant-actions">{hasLease?<LeaseViewButton path={unit.lease_document_path}/>:<button type="button" className="property-text-action" onClick={()=>setEditingUnitId(unit.id)}>Add lease</button>}<SecondaryButton className="unit-edit-action" onClick={()=>setEditingUnitId(unit.id)}>Edit</SecondaryButton></td>
              </tr>;
            })}
          </tbody>
        </table></div>}
      </section>
    </div>
    {adding&&<UnitAddModal propertyId={propertyId} onClose={()=>setAdding(false)} onCreated={unit=>{onUnitsUpdated([...units,unit]);setAdding(false);}}/>}
    {editingUnit&&<UnitEditModal unit={editingUnit} propertyId={propertyId} onClose={()=>setEditingUnitId(null)} onSaved={(patch)=>handleSaved(editingUnit.id,patch)} onArchived={()=>{onUnitsUpdated(units.filter(unit=>unit.id!==editingUnit.id));setEditingUnitId(null);}} onLeaseSynced={onLeaseSynced}/>}
  </>;
}

function UnitEditModal({unit,propertyId,onClose,onSaved,onArchived,onLeaseSynced}:{unit:any;propertyId:string;onClose:()=>void;onSaved:(patch:Record<string,unknown>)=>void;onArchived:()=>void;onLeaseSynced:()=>void|Promise<void>}){
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
  const archive=async()=>{
    if(!confirm(`Archive ${unit.unit_number||'this unit'}? You can restore it later from Archive.`))return;
    setSaving(true); setError('');
    const result=await supabase.from('units').update({archived_at:new Date().toISOString()}).eq('id',unit.id);
    setSaving(false);
    if(result.error){setError(result.error.message);return;}
    invalidateSupabaseCache();
    onArchived();
  };
  return <div className="workspace-modal-overlay"><div className="workspace-modal unit-edit-modal"><div className="workspace-modal-head"><div><div className="eyebrow">UNIT</div><h2>Edit {unit.unit_number||'unit'}</h2></div><button type="button" className="workspace-modal-close" onClick={onClose}>×</button></div>{error&&<div className="workspace-form-error">{error}</div>}<form onSubmit={save} className="workspace-form"><div className="workspace-form-grid two"><label>Unit name / number<input required value={form.unit_number} onChange={e=>setForm({...form,unit_number:e.target.value})}/></label><label>Monthly rent<input type="number" min="0" step="0.01" value={form.current_rent} onChange={e=>setForm({...form,current_rent:e.target.value})}/></label></div><label>Tenant<input value={form.tenant_name} onChange={e=>setForm({...form,tenant_name:e.target.value})}/></label><label className="workspace-checkbox"><input type="checkbox" checked={form.occupied} onChange={e=>setForm({...form,occupied:e.target.checked})}/><span>Occupied</span></label><div className="workspace-form-grid two"><label>Lease start<input type="date" value={form.lease_start_date} onChange={e=>setForm({...form,lease_start_date:e.target.value})}/></label><label>Lease end<input type="date" value={form.lease_end_date} onChange={e=>setForm({...form,lease_end_date:e.target.value})}/></label></div><div className="workspace-form-grid three"><label>Bedrooms<input type="number" min="0" step="1" value={form.bedroom_count} onChange={e=>setForm({...form,bedroom_count:e.target.value})}/></label><label>Bathrooms<input type="number" min="0" step="0.5" value={form.bathroom_count} onChange={e=>setForm({...form,bathroom_count:e.target.value})}/></label><label>Sqft<input type="number" min="0" step="1" value={form.sqft} onChange={e=>setForm({...form,sqft:e.target.value})}/></label></div><label className="workspace-file-field"><span>Lease document</span><input type="file" accept="application/pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?file.name:unit.lease_document_path?'Current lease will be kept unless you choose a replacement.':'Upload the signed lease or lease PDF.'}</small></label><div className="workspace-modal-footer"><button type="button" className="property-secondary-action" disabled={saving} onClick={archive}>Archive unit</button><button type="button" className="property-secondary-action" onClick={onClose}>Cancel</button><button disabled={saving} className="workspace-primary-button">{saving?'Saving…':'Save unit'}</button></div></form></div></div>;
}

function LeaseViewButton({path}:{path:string}){const [opening,setOpening]=useState(false);const open=async()=>{setOpening(true);const ref=leaseStorageRef(path);const r=await supabase.storage.from(ref.bucket).createSignedUrl(ref.path,120);setOpening(false);if(r.data?.signedUrl)window.open(r.data.signedUrl,'_blank','noopener,noreferrer');};return <button type="button" className="property-secondary-action" disabled={opening} onClick={open}>{opening?'Opening…':'View lease'}</button>}

function UnitAddModal({propertyId,onClose,onCreated}:{propertyId:string;onClose:()=>void;onCreated:(unit:Unit)=>void}){
  const [form,setForm]=useState({unit_number:'',tenant_name:'',current_rent:'',bedroom_count:'',bathroom_count:'',sqft:'',occupied:false});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const save=async(event:React.FormEvent)=>{
    event.preventDefault(); setSaving(true); setError('');
    const auth=await supabase.auth.getUser();
    const user=auth.data.user;
    if(!user){setSaving(false);setError('You need to be signed in.');return;}
    const payload={user_id:user.id,property_id:propertyId,unit_number:form.unit_number.trim(),tenant_name:form.tenant_name.trim(),current_rent:form.current_rent?Number(form.current_rent):0,bedroom_count:form.bedroom_count?Number(form.bedroom_count):0,bathroom_count:form.bathroom_count?Number(form.bathroom_count):0,sqft:form.sqft?Number(form.sqft):0,occupied:form.occupied,recurring_rent_enabled:true};
    const result=await supabase.from('units').insert(payload).select(UNIT_DETAIL_FIELDS).single();
    setSaving(false);
    if(result.error||!result.data){setError(result.error?.message||'Could not add unit.');return;}
    invalidateSupabaseCache();
    onCreated(result.data as Unit);
  };
  return <div className="workspace-modal-overlay"><div className="workspace-modal unit-edit-modal"><div className="workspace-modal-head"><div><div className="eyebrow">UNIT</div><h2>Add unit</h2></div><button type="button" className="workspace-modal-close" onClick={onClose}>×</button></div>{error&&<div className="workspace-form-error">{error}</div>}<form onSubmit={save} className="workspace-form"><label>Unit name / number<input required value={form.unit_number} onChange={event=>setForm({...form,unit_number:event.target.value})}/></label><div className="workspace-form-grid two"><label>Monthly rent<input type="number" min="0" step="0.01" value={form.current_rent} onChange={event=>setForm({...form,current_rent:event.target.value})}/></label><label>Tenant<input value={form.tenant_name} onChange={event=>setForm({...form,tenant_name:event.target.value})}/></label></div><label className="workspace-checkbox"><input type="checkbox" checked={form.occupied} onChange={event=>setForm({...form,occupied:event.target.checked})}/><span>Occupied</span></label><div className="workspace-form-grid three"><label>Bedrooms<input type="number" min="0" step="1" value={form.bedroom_count} onChange={event=>setForm({...form,bedroom_count:event.target.value})}/></label><label>Bathrooms<input type="number" min="0" step="0.5" value={form.bathroom_count} onChange={event=>setForm({...form,bathroom_count:event.target.value})}/></label><label>Sqft<input type="number" min="0" step="1" value={form.sqft} onChange={event=>setForm({...form,sqft:event.target.value})}/></label></div><div className="workspace-modal-footer"><button type="button" className="property-secondary-action" onClick={onClose}>Cancel</button><button disabled={saving} className="workspace-primary-button">{saving?'Saving…':'Add unit'}</button></div></form></div></div>;
}

function leaseStatus(start?:string|null,end?:string|null,occupied?:boolean){if(!occupied)return{label:'Vacant',short:'Vacant',tone:'neutral'};if(!end)return{label:'Lease dates not set',short:'Not set',tone:'neutral'};const today=new Date();today.setHours(0,0,0,0);const endDate=new Date(`${end.slice(0,10)}T12:00:00`);const days=Math.ceil((endDate.getTime()-today.getTime())/86400000);if(days<0)return{label:`Lease expired ${Math.abs(days)} days ago`,short:'Expired',tone:'danger'};if(days===0)return{label:'Lease ends today',short:'Ends today',tone:'warning'};if(days<=60)return{label:`Lease ends in ${days} days`,short:`${days} days left`,tone:'warning'};return{label:`${days} days remaining on lease`,short:`${days} days left`,tone:'good'};}
function longDate(value:string){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

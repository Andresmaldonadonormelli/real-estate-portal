'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PropertyDocument, Unit } from '@/lib/types';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { UNIT_DETAIL_FIELDS, invalidateSupabaseCache } from '@/lib/supabaseData';
import { SecondaryButton } from '@/components/common/ProductControls';
import { emptyProfile, type PropertyProfile } from '@/lib/propertyProfile';
import { monthActivity, nextLeaseLabel } from '@/lib/propertyPosition';
import type { HistoryTransaction } from '@/lib/financialHistory';

const LEASE_DOC_PREFIX = 'property-documents:';
function leaseStorageRef(value?: string | null) {
  const leasePath = String(value || '');
  return leasePath.startsWith(LEASE_DOC_PREFIX) ? { bucket: 'property-documents', path: leasePath.slice(LEASE_DOC_PREFIX.length) } : { bucket: 'unit-leases', path: leasePath };
}

export default function PropertyUnits({units,propertyId,documents=[],transactions=[],managementFeePercent=0,profile=emptyProfile(),onUnitsUpdated,onLeaseSynced,onProfileSaved,onManagementFee}:{units:Unit[];propertyId:string;documents?:PropertyDocument[];transactions?:HistoryTransaction[];managementFeePercent?:number|null;profile?:PropertyProfile;onUnitsUpdated:(units:Unit[])=>void;onLeaseSynced:()=>void|Promise<void>;onProfileSaved?:(profile:PropertyProfile)=>void;onManagementFee?:(fee:number)=>void}){
  const [editingUnitId,setEditingUnitId]=useState<string|null>(null);
  const [adding,setAdding]=useState(false);
  const [leaseUnitId,setLeaseUnitId]=useState(units[0]?.id||'');
  const [uploading,setUploading]=useState(false);
  const [editingManagement,setEditingManagement]=useState(false);
  const [managerName,setManagerName]=useState(profile.manager_name||'');
  const [managementType,setManagementType]=useState(profile.management_type||'self');
  const [feeInput,setFeeInput]=useState(String(managementFeePercent||0));
  const [managementError,setManagementError]=useState('');
  const editingUnit=(units.find(u=>u.id===editingUnitId)||null) as any;
  const handleSaved=(unitId:string,patch:Record<string,unknown>)=>{ onUnitsUpdated(units.map(u=>u.id===unitId?({...u,...patch} as Unit):u)); setEditingUnitId(null); };
  const expected=units.reduce((sum,unit)=>sum+Number(unit.current_rent||0),0);
  const occupiedCount=units.filter(unit=>unit.occupied).length;
  const occupancyLabel=!units.length?'No units':occupiedCount===units.length?'Fully occupied':occupiedCount===0?'Vacant':'Partially occupied';
  const lastMonthDate=useMemo(()=>{const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-1);return date;},[]);
  const lastRent=monthActivity(transactions,propertyId,lastMonthDate).rent;
  const lastLabel=lastMonthDate.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  const leaseLine=nextLeaseLabel(units as any);
  const leases=documents.filter(document=>document.category==='Lease'&&!document.archived_at);
  const fee=Number(managementFeePercent||0);
  async function setOccupied(unit:Unit,occupied:boolean){
    const result=await supabase.from('units').update({occupied}).eq('id',unit.id);
    if(!result.error)onUnitsUpdated(units.map(item=>item.id===unit.id?{...item,occupied}:item));
  }
  async function uploadLease(file:File){
    const unit=units.find(item=>item.id===leaseUnitId)||units[0];
    if(!unit)return;
    setUploading(true);
    try{
      const auth=await supabase.auth.getUser();
      const user=auth.data.user;
      if(!user)throw new Error('You need to be signed in.');
      const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
      const storagePath=`${user.id}/${propertyId}/${unit.id}/${Date.now()}-${safe}`;
      const upload=await supabase.storage.from('property-documents').upload(storagePath,file,{upsert:false,contentType:file.type||undefined});
      if(upload.error)throw upload.error;
      const leasePath=`${LEASE_DOC_PREFIX}${storagePath}`;
      const unitUpdate=await supabase.from('units').update({lease_document_path:leasePath}).eq('id',unit.id);
      if(unitUpdate.error)throw unitUpdate.error;
      const docPatch={user_id:user.id,property_id:propertyId,unit_id:unit.id,category:'Lease',title:`${unit.unit_number||'Unit'} Lease${unit.tenant_name?` · ${unit.tenant_name}`:''}`,file_name:file.name,storage_path:storagePath,mime_type:file.type||null,file_size:file.size,document_date:(unit as any).lease_start_date||null,expires_at:(unit as any).lease_end_date||null,reminder_days:60,notes:unit.tenant_name?`Signed lease for ${unit.tenant_name}`:null,archived_at:null};
      const inserted=await supabase.from('documents').insert(docPatch);
      if(inserted.error)throw inserted.error;
      onUnitsUpdated(units.map(item=>item.id===unit.id?{...item,lease_document_path:leasePath} as Unit:item));
      await onLeaseSynced();
    }finally{setUploading(false);}
  }
  async function saveManagement(){
    setManagementError('');
    const nextFee=Number(feeInput||0);
    const nextProfile={...profile,management_type:managementType,manager_name:managementType==='manager'?managerName.trim():''};
    const result=await supabase.from('properties').update({management_fee_percent:nextFee,property_profile:nextProfile}).eq('id',propertyId);
    if(result.error){setManagementError(result.error.message.includes('property_profile')?'Run V246_PROPERTY_PROFILE.sql, then save again.':result.error.message);return;}
    invalidateSupabaseCache(`property:${propertyId}`);
    onManagementFee?.(nextFee);
    onProfileSaved?.(nextProfile);
    setEditingManagement(false);
  }
  return <>
    <div className="property-stack">
      <section className="property-module">
        <h2>Rent at a glance</h2>
        <p className="property-module-note">What the units should bring in, and what came in last month.</p>
        <div className="property-glance">
          <div><span>Expected rent</span><strong>{formatKpiCurrency(expected)}/mo</strong><small>All units</small></div>
          <div><span>Occupancy</span><strong className={occupancyLabel==='Fully occupied'?'property-signed is-positive':''}>{occupancyLabel}</strong></div>
          <div><span>Rent · {lastLabel}</span><strong>{lastRent>0?formatKpiCurrency(lastRent):'Not entered'}</strong></div>
          <div><span>Lease ends</span><strong>{leaseLine==='No upcoming lease end'?'No lease dates':leaseLine.replace('Next lease ends ','')}</strong></div>
        </div>
      </section>
      <section className="property-module">
        <div className="property-module-head"><div><h2>Units</h2><p className="property-module-note">Rent, deposit, lease dates and status per unit.</p></div><SecondaryButton onClick={()=>setAdding(true)}>Add unit</SecondaryButton></div>
        {!units.length?<p className="property-module-note">No units yet.</p>:<div className="property-unit-rows">
          {units.map((rawUnit,index)=>{
            const unit=rawUnit as any;
            return <div className="property-unit-row" key={unit.id}>
              <div><strong>{unit.unit_number||`Unit ${index+1}`}</strong><span>{formatKpiCurrency(Number(unit.current_rent||0))}/mo · {unit.lease_end_date?`lease ends ${longDate(unit.lease_end_date)}`:'no lease date'}</span></div>
              <div className="property-unit-tools">
                <select aria-label={`${unit.unit_number||'Unit'} status`} value={unit.occupied?'occupied':'vacant'} onChange={event=>setOccupied(unit,event.target.value==='occupied')}><option value="occupied">Occupied</option><option value="vacant">Vacant</option></select>
                <button type="button" className="property-text-action" onClick={()=>setEditingUnitId(unit.id)}>Edit</button>
              </div>
            </div>;
          })}
        </div>}
      </section>
      <section className="property-module">
        <div className="property-module-head">
          <div><h2>Lease documents</h2><p className="property-module-note">Signed leases and rental agreements, kept with the rent details.</p></div>
          <label className="property-secondary-action">{uploading?'Uploading…':'Upload lease'}<input type="file" accept="application/pdf,image/*" hidden disabled={uploading||!units.length} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadLease(file);event.target.value='';}} /></label>
        </div>
        {units.length>1?<label className="property-lease-unit">Attach to<select value={leaseUnitId} onChange={event=>setLeaseUnitId(event.target.value)}>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.unit_number||'Unit'}</option>)}</select></label>:null}
        {leases.length?<ul className="property-coming-list">{leases.map(document=><li key={document.id}><span>{document.title||document.file_name}</span><LeaseViewButton path={`${LEASE_DOC_PREFIX}${document.storage_path}`} /></li>)}</ul>:<p className="property-module-note">No lease uploaded yet — add the signed lease so it’s on hand at renewal time.</p>}
      </section>
      <section className="property-module">
        <div className="property-module-head"><div><h2>Property management</h2><p className="property-module-note">Who runs this property day to day.</p></div><button type="button" className="property-secondary-action" onClick={()=>setEditingManagement(open=>!open)}>Edit</button></div>
        {editingManagement?<div className="property-management-form">
          <div className="property-chart-pills">
            <button type="button" className={managementType==='self'?'active':''} onClick={()=>setManagementType('self')}>Self-managed</button>
            <button type="button" className={managementType==='manager'?'active':''} onClick={()=>setManagementType('manager')}>Manager</button>
          </div>
          {managementType==='manager'?<label>Manager<input value={managerName} onChange={event=>setManagerName(event.target.value)} /></label>:null}
          <label>Fee percent<input type="number" min="0" max="100" step="0.1" value={feeInput} onChange={event=>setFeeInput(event.target.value)} /></label>
          {managementError?<p className="property-module-note">{managementError}</p>:null}
          <button type="button" className="ui-button ui-button--primary" onClick={saveManagement}>Save</button>
        </div>:<span className="property-management-pill">{profile.management_type==='manager'&&profile.manager_name?profile.manager_name:'Self-managed'}{fee>0?` · ${fee}%`:''}</span>}
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

function longDate(value:string){const d=new Date(`${value.slice(0,10)}T12:00:00`);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

'use client';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Bolt, ChevronDown, ChevronRight, CircleEllipsis, Droplets, Flame, Trash2, Waves, Wifi, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import type { Property, UtilityAccount } from '@/lib/types';
import { withTimeout } from '@/lib/async';

const types=['Electric','Gas','Water','Sewer','Internet','Trash','Other'];
const empty={utility_type:'Electric',provider:'',account_number:'',username_email:'',login_url:'',autopay:false,responsibility:'Owner' as const,billing_cycle:'',password_reference:'',notes:''};
type UtilityLink={utility_account_id:string;property_id:string};
type UtilityWithProperties=UtilityAccount&{property_ids:string[]};

export default function UtilitiesPage(){
  const { user } = useAuth();
  const [items,setItems]=useState<UtilityWithProperties[]>([]);
  const [properties,setProperties]=useState<Property[]>([]);
  const [selected,setSelected]=useState('');
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState<UtilityWithProperties|null>(null);
  const [detail,setDetail]=useState<UtilityWithProperties|null>(null);
  const [showDetails,setShowDetails]=useState(false);
  const [form,setForm]=useState<any>(empty);
  const [propertyIds,setPropertyIds]=useState<string[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [deleting,setDeleting]=useState(false);

  async function load(){
    setLoading(true);setError('');
    try{
      const [u,p,l]=await withTimeout(Promise.all([
        supabase.from('utility_accounts').select('*').is('archived_at',null).order('utility_type'),
        supabase.from('properties').select('*').is('archived_at',null).order('address'),
        supabase.from('utility_account_properties').select('utility_account_id,property_id')
      ]),8000,'Utilities took too long to load. Please retry.');
      if(u.error||p.error||l.error)throw(u.error||p.error||l.error);
      const links=(l.data||[]) as UtilityLink[];
      const byUtility=new Map<string,string[]>();
      links.forEach(link=>byUtility.set(link.utility_account_id,[...(byUtility.get(link.utility_account_id)||[]),link.property_id]));
      const hydrated=((u.data||[]) as UtilityAccount[]).map(x=>({
        ...x,
        property_ids:byUtility.get(x.id)?.length?byUtility.get(x.id)!:[x.property_id].filter(Boolean)
      }));
      setItems(hydrated);setProperties((p.data||[]) as Property[]);
    }catch(e){setError(e instanceof Error?e.message:'Could not load utilities');}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const filtered=useMemo(()=>items.filter(x=>!selected||x.property_ids.includes(selected)),[items,selected]);
  const grouped=useMemo(()=>properties
    .filter(p=>!selected||p.id===selected)
    .map(property=>({property,utilities:filtered.filter(x=>x.property_ids.includes(property.id))}))
    .filter(group=>group.utilities.length>0),[properties,filtered,selected]);

  const propertyName=(id:string)=>properties.find(p=>p.id===id)?.address||'Unknown property';
  function add(){setEditing(null);setDetail(null);setShowDetails(false);setForm({...empty});setPropertyIds(selected?[selected]:(properties[0]?.id?[properties[0].id]:[]));setShow(true)}
  function edit(x:UtilityWithProperties){setDetail(null);setEditing(x);setShowDetails(true);setPropertyIds(x.property_ids);setForm({utility_type:x.utility_type,provider:x.provider,account_number:x.account_number||'',username_email:x.username_email||'',login_url:x.login_url||'',autopay:x.autopay,responsibility:x.responsibility,billing_cycle:x.billing_cycle||'',password_reference:x.password_reference||'',notes:x.notes||''});setShow(true)}
  function openDetail(x:UtilityWithProperties){setDetail(x)}
  function cardKey(e:KeyboardEvent<HTMLDivElement>,x:UtilityWithProperties){if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(x)}}
  function toggleProperty(id:string){setPropertyIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])}

  async function save(e:FormEvent){
    e.preventDefault();setError('');
    if(!propertyIds.length){setError('Choose at least one property for this utility.');return;}
    const payload={...form,user_id:user.id,property_id:propertyIds[0],account_number:form.account_number||null,username_email:form.username_email||null,login_url:form.login_url||null,billing_cycle:form.billing_cycle||null,password_reference:form.password_reference||null,notes:form.notes||null};
    const r=editing
      ?await supabase.from('utility_accounts').update(payload).eq('id',editing.id).select('*').single()
      :await supabase.from('utility_accounts').insert(payload).select('*').single();
    if(r.error){setError(r.error.message);return;}
    const utilityId=r.data.id as string;
    const cleared=await supabase.from('utility_account_properties').delete().eq('utility_account_id',utilityId);
    if(cleared.error){setError(cleared.error.message);return;}
    const linked=await supabase.from('utility_account_properties').insert(propertyIds.map(property_id=>({utility_account_id:utilityId,property_id,user_id:user.id})));
    if(linked.error){setError(linked.error.message);return;}
    setShow(false);setEditing(null);await load();
  }
  async function del(x:UtilityWithProperties){if(!confirm(`Archive ${x.utility_type} — ${x.provider}? You can restore it later from Archive.`))return;setDeleting(true);const r=await supabase.from('utility_accounts').update({archived_at:new Date().toISOString()}).eq('id',x.id);if(r.error)setError(r.error.message);else{setShow(false);setEditing(null);setDetail(null);await load()}setDeleting(false)}

  return <div className="mobile-page-shell utilities-page">
    <div className="utilities-page-head"><div><h1>Utilities</h1><p>Service accounts and access details, organized around each property.</p></div><button onClick={add} disabled={!properties.length} style={primary}>+ Add utility</button></div>
    {error&&<div style={errorBox}>{error}</div>}
    <div className="utilities-toolbar"><label><span>Property</span><select value={selected} onChange={e=>setSelected(e.target.value)} style={input}><option value="">All properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></label></div>
    <div className="utilities-security-note">Passwords are intentionally not stored here. Use “Password reference” for something like “1Password → Cleveland Water”.</div>

    {loading?<PageSkeleton variant="utilities"/>:grouped.length===0?<div className="card utilities-empty">No utility accounts yet.</div>:<div className="utility-property-groups">{grouped.map(({property,utilities})=><section key={property.id} className="utility-property-group"><div className="utility-property-head"><div><span>PROPERTY</span><h2>{property.address}</h2></div><small>{utilities.length} {utilities.length===1?'utility':'utilities'}</small></div><div className="utility-grid">{utilities.map(x=><div key={`${property.id}-${x.id}`} className="utility-directory-card" role="button" tabIndex={0} onClick={()=>openDetail(x)} onKeyDown={e=>cardKey(e,x)} aria-label={`Open ${x.utility_type} utility details`}><div className="utility-card-icon">{utilityIcon(x.utility_type)}</div><div className="utility-card-copy"><div className="utility-card-type">{x.utility_type}</div><div className="utility-card-provider">{x.provider}</div><div className="utility-card-meta"><span>{x.responsibility}</span><span>·</span><span>Autopay {x.autopay?'on':'off'}</span>{x.account_number&&<><span>·</span><span>{maskedAccount(x.account_number)}</span></>}</div></div><ChevronRight className="utility-card-chevron" size={18}/></div>)}</div></section>)}</div>}

    {detail&&<Modal title={detail.utility_type} onClose={()=>setDetail(null)}><div className="utility-detail-view"><div className="utility-detail-hero"><div className="utility-detail-icon">{utilityIcon(detail.utility_type)}</div><div><div className="utility-detail-provider">{detail.provider}</div><div className="utility-detail-properties">{detail.property_ids.map(propertyName).join(' · ')}</div></div></div><div className="utility-detail-list">{detail.account_number&&<DetailRow l="Account number" v={detail.account_number}/>} {detail.username_email&&<DetailRow l="Username / email" v={detail.username_email}/>}<DetailRow l="Autopay" v={detail.autopay?'On':'Off'}/><DetailRow l="Responsibility" v={detail.responsibility}/>{detail.billing_cycle&&<DetailRow l="Billing cycle" v={detail.billing_cycle}/>} {detail.password_reference&&<DetailRow l="Password reference" v={detail.password_reference}/>} {detail.notes&&<DetailRow l="Notes" v={detail.notes}/>}</div><div className="utility-detail-actions">{detail.login_url&&<button onClick={()=>window.open(detail.login_url!,'_blank','noopener,noreferrer')} style={secondary}>Open provider</button>}<button onClick={()=>edit(detail)} style={primary}>Edit utility</button></div></div></Modal>}

    {show&&<Modal title={editing?'Edit utility':'Add utility'} onClose={()=>{setShow(false);setEditing(null)}}><form onSubmit={save} className="mobile-sheet-form utility-edit-form"><Field label="Properties"><div className="utility-property-picker">{properties.map(p=><label key={p.id} className={`utility-property-option ${propertyIds.includes(p.id)?'selected':''}`}><input type="checkbox" checked={propertyIds.includes(p.id)} onChange={()=>toggleProperty(p.id)}/><span>{p.address}</span></label>)}</div></Field><div style={two}><Field label="Utility type"><select value={form.utility_type} onChange={e=>setForm({...form,utility_type:e.target.value})} style={input}>{types.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Provider"><input required value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} style={input}/></Field></div><Field label="Responsibility"><select value={form.responsibility} onChange={e=>setForm({...form,responsibility:e.target.value})} style={input}><option>Owner</option><option>Tenant</option><option>Shared</option></select></Field><button type="button" className={`sheet-details-toggle ${showDetails?'expanded':''}`} onClick={()=>setShowDetails(v=>!v)}><span>{showDetails?'Hide account details':'Add account details'}</span><ChevronDown size={16} aria-hidden="true"/></button>{showDetails&&<div className="sheet-details-panel"><div style={two}><Field label="Account number"><input value={form.account_number} onChange={e=>setForm({...form,account_number:e.target.value})} style={input}/></Field><Field label="Username / email"><input value={form.username_email} onChange={e=>setForm({...form,username_email:e.target.value})} style={input}/></Field></div><Field label="Provider login URL"><input placeholder="https://..." value={form.login_url} onChange={e=>setForm({...form,login_url:e.target.value})} style={input}/></Field><Field label="Billing cycle"><input placeholder="Monthly" value={form.billing_cycle} onChange={e=>setForm({...form,billing_cycle:e.target.value})} style={input}/></Field><label style={{display:'flex',gap:9,alignItems:'center',fontSize:13}}><input type="checkbox" checked={form.autopay} onChange={e=>setForm({...form,autopay:e.target.checked})}/>Autopay enabled</label><Field label="Password reference"><input placeholder="e.g. 1Password → Cleveland Water" value={form.password_reference} onChange={e=>setForm({...form,password_reference:e.target.value})} style={input}/></Field><Field label="Notes"><textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={input}/></Field></div>}<button className="mobile-sheet-submit" style={primary}>Save utility</button>{editing&&<div className="danger-zone"><div><div style={{fontWeight:600,fontSize:14}}>Danger zone</div><div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>Archive removes this utility from the active directory without deleting its history.</div></div><button type="button" disabled={deleting} onClick={()=>del(editing)} style={danger}>{deleting?'Archiving…':'Archive utility'}</button></div>}</form></Modal>}
  </div>
}

function utilityIcon(type:string){const props={size:20,strokeWidth:2};switch(type){case'Electric':return <Bolt {...props}/>;case'Gas':return <Flame {...props}/>;case'Water':return <Droplets {...props}/>;case'Sewer':return <Waves {...props}/>;case'Internet':return <Wifi {...props}/>;case'Trash':return <Trash2 {...props}/>;default:return <CircleEllipsis {...props}/>}}
function maskedAccount(v:string){const clean=v.trim();return clean.length>4?`•••• ${clean.slice(-4)}`:clean}
function DetailRow({l,v}:{l:string;v:string}){return <div className="utility-detail-row"><span>{l}</span><strong>{v}</strong></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:6,fontSize:13}}>{label}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){useEffect(()=>{const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[]);return <div className="mobile-sheet-overlay" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}><div className="card mobile-sheet" role="dialog" aria-modal="true"><div className="mobile-sheet-head"><div className="mobile-sheet-handle"/><h2>{title}</h2><button onClick={onClose} type="button" className="sheet-close-button" aria-label="Close"><X size={18}/></button></div><div className="mobile-sheet-body">{children}</div></div></div>}
const input:React.CSSProperties={width:'100%',padding:'10px 11px',border:'1px solid var(--border-color)',borderRadius:10,background:'var(--bg-primary)',color:'var(--text-primary)'};
const primary:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:999,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:650,cursor:'pointer'};
const secondary:React.CSSProperties={padding:'10px 14px',border:'1px solid var(--border-color)',borderRadius:999,background:'var(--bg-primary)',color:'var(--text-primary)',fontWeight:600,cursor:'pointer'};
const danger:React.CSSProperties={...secondary,color:'var(--danger)'};
const two:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:16};

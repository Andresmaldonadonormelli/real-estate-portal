'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import type { Property, PropertyDocument, Unit } from '@/lib/types';

const categories = ['Lease','Invoice / Receipt','Lead Certificate','Insurance','Inspection','Management Agreement','Closing / Property','Tax','Other'];

export default function DocumentsTab({ selectedPropertyId }:{ selectedPropertyId:string }) {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ property_id:'', unit_id:'', category:'Lease', title:'', document_date:'', notes:'' });

  async function loadData() {
    setLoading(true); setError('');
    const [p,u,d] = await Promise.all([
      supabase.from('properties').select('*').order('address'),
      supabase.from('units').select('*').order('unit_number'),
      supabase.from('documents').select('*').order('created_at',{ascending:false}),
    ]);
    const err = p.error || u.error || d.error;
    if (err) setError(err.message);
    else {
      setProperties((p.data || []) as Property[]);
      setUnits((u.data || []) as Unit[]);
      setDocuments((d.data || []) as PropertyDocument[]);
      if (!form.property_id && p.data?.[0]?.id) setForm(f => ({...f, property_id:p.data![0].id}));
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => documents.filter(d => {
    if (selectedPropertyId && d.property_id !== selectedPropertyId) return false;
    if (categoryFilter && d.category !== categoryFilter) return false;
    return true;
  }), [documents, selectedPropertyId, categoryFilter]);

  const propertyName = (id:string) => properties.find(p => p.id === id)?.address || 'Unknown property';
  const unitName = (id?:string|null) => units.find(u => u.id === id)?.unit_number || '';

  function openUpload() {
    setFile(null);
    setForm({property_id:selectedPropertyId || properties[0]?.id || '', unit_id:'', category:'Lease', title:'', document_date:'', notes:''});
    setShowUpload(true);
  }

  async function uploadDocument(e:FormEvent) {
    e.preventDefault();
    if (!file) { setError('Choose a file to upload.'); return; }
    setSaving(true); setError('');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const path = `${user.id}/${form.property_id}/${Date.now()}-${safeName}`;
    const upload = await supabase.storage.from('property-documents').upload(path, file, { upsert:false, contentType:file.type || undefined });
    if (upload.error) { setError(upload.error.message); setSaving(false); return; }

    const row = {
      user_id: user.id,
      property_id: form.property_id,
      unit_id: form.unit_id || null,
      category: form.category,
      title: form.title.trim() || file.name,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      file_size: file.size,
      document_date: form.document_date || null,
      notes: form.notes.trim() || null,
    };
    const insert = await supabase.from('documents').insert(row);
    if (insert.error) {
      await supabase.storage.from('property-documents').remove([path]);
      setError(insert.error.message);
    } else {
      setShowUpload(false);
      await loadData();
    }
    setSaving(false);
  }

  async function openDocument(doc:PropertyDocument) {
    const { data, error:e } = await supabase.storage.from('property-documents').createSignedUrl(doc.storage_path, 60);
    if (e || !data?.signedUrl) { setError(e?.message || 'Could not open document.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function deleteDocument(doc:PropertyDocument) {
    if (!confirm(`Delete “${doc.title}”?`)) return;
    setError('');
    const storage = await supabase.storage.from('property-documents').remove([doc.storage_path]);
    if (storage.error) { setError(storage.error.message); return; }
    const row = await supabase.from('documents').delete().eq('id', doc.id);
    if (row.error) setError(row.error.message); else await loadData();
  }

  return <div>
    <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:12,marginBottom:18}}><button onClick={openUpload} disabled={!properties.length} style={primaryButton}>+ Upload document</button></div>
    {error && <div style={errorBox}>{error}</div>}
    {!properties.length && !loading && <div className="card" style={{padding:20,marginBottom:16}}>Add a property before uploading documents.</div>}

    <div className="card" style={{padding:14,display:'grid',gridTemplateColumns:'minmax(180px,280px)',gap:10,marginBottom:18}}>
      <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={inputStyle}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
    </div>

    {loading ? <PageSkeleton variant="ledger" /> : filtered.length === 0 ? <div className="card" style={{padding:28,color:'var(--text-secondary)'}}>No documents yet.</div> :
      <div style={{display:'grid',gap:10}}>{filtered.map(doc => <div key={doc.id} className="card" style={{padding:16,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:14,alignItems:'center'}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{doc.category} · {propertyName(doc.property_id)}{unitName(doc.unit_id)?` · ${unitName(doc.unit_id)}`:''}</div>
          <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.title}</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:4}}>{doc.document_date || doc.file_name}</div>
        </div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',justifyContent:'flex-end'}}><button onClick={()=>openDocument(doc)} style={secondaryButton}>Open</button><button onClick={()=>deleteDocument(doc)} style={dangerButton}>Delete</button></div>
      </div>)}</div>
    }

    {showUpload && <Modal title="Upload document" onClose={()=>setShowUpload(false)}><form onSubmit={uploadDocument} style={{display:'grid',gap:12}}>
      <Field label="Property"><select required value={form.property_id} onChange={e=>setForm({...form,property_id:e.target.value,unit_id:''})} style={inputStyle}>{properties.map(p=><option key={p.id} value={p.id}>{p.address}</option>)}</select></Field>
      <Field label="Unit (optional)"><select value={form.unit_id} onChange={e=>setForm({...form,unit_id:e.target.value})} style={inputStyle}><option value="">Whole property</option>{units.filter(u=>u.property_id===form.property_id).map(u=><option key={u.id} value={u.id}>{u.unit_number}</option>)}</select></Field>
      <div style={twoCol}><Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inputStyle}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Document date"><input type="date" value={form.document_date} onChange={e=>setForm({...form,document_date:e.target.value})} style={inputStyle}/></Field></div>
      <Field label="Title"><input placeholder="e.g. 2026 Lease - Unit 1" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={inputStyle}/></Field>
      <Field label="File"><input required type="file" onChange={e=>setFile(e.target.files?.[0] || null)} style={inputStyle}/></Field>
      <Field label="Notes"><textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={inputStyle}/></Field>
      <button disabled={saving} style={primaryButton}>{saving?'Uploading…':'Upload document'}</button>
    </form></Modal>}
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:6,fontSize:13}}>{label}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'grid',placeItems:'center',padding:18,zIndex:1000}}><div className="card" style={{width:'100%',maxWidth:560,maxHeight:'90vh',overflow:'auto',padding:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}><h2 style={{fontSize:21}}>{title}</h2><button type="button" onClick={onClose} style={secondaryButton}>✕</button></div>{children}</div></div>}
const inputStyle:React.CSSProperties={width:'100%',padding:'10px 11px',border:'1px solid var(--border-color)',borderRadius:8,background:'var(--bg-primary)',color:'var(--text-primary)',fontSize:16};
const primaryButton:React.CSSProperties={padding:'10px 14px',border:0,borderRadius:8,background:'var(--accent)',color:'var(--accent-contrast)',fontWeight:600,cursor:'pointer'};
const secondaryButton:React.CSSProperties={padding:'9px 12px',border:'1px solid var(--border-color)',borderRadius:8,background:'var(--bg-primary)',color:'var(--text-primary)',cursor:'pointer'};
const dangerButton:React.CSSProperties={...secondaryButton,color:'var(--danger)'};
const twoCol:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12};
const errorBox:React.CSSProperties={padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8,marginBottom:16,fontSize:13};

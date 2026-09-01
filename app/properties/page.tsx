'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import { formatCurrency } from '@/lib/formatters';
import type { Property, Unit } from '@/lib/types';
import { withTimeout } from '@/lib/async';

const emptyProperty = {
  address: '', city: '', state: 'OH', zip: '', property_type: 'duplex',
  mortgage_balance: '', purchase_price: '', purchase_date: '', monthly_mortgage_payment: '', mortgage_start_date: '', management_fee_percent: '8', mortgage_recurring_enabled: true,
};

const emptyUnit = {
  property_id: '', unit_number: '', bedroom_count: '', bathroom_count: '', sqft: '', current_rent: '', tenant_name: '', occupied: false, recurring_rent_enabled: true,
};

export default function PropertiesPage() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [propertyForm, setPropertyForm] = useState(emptyProperty);
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const [saving, setSaving] = useState(false);
  const [propertyImage, setPropertyImage] = useState<File | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingProperty, setDeletingProperty] = useState(false);
  const [showPropertyDetails, setShowPropertyDetails] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [{ data: props, error: propError }, { data: unitRows, error: unitError }] = await withTimeout(Promise.all([
        supabase.from('properties').select('*').is('archived_at',null).order('address'),
        supabase.from('units').select('*').is('archived_at',null).order('unit_number'),
      ]), 8000, 'Properties took too long to load. Please retry.');
      if (propError || unitError) throw (propError || unitError);
      const propertyRows = (props || []) as Property[];
      setProperties(propertyRows);
      setUnits((unitRows || []) as Unit[]);
      setLoading(false);
      void (async()=>{
        const urls: Record<string,string> = {};
        await Promise.all(propertyRows.filter(p => p.image_path).map(async p => { try { const r = await supabase.storage.from('property-images').createSignedUrl(p.image_path!, 3600); if (r.data?.signedUrl) urls[p.id] = r.data.signedUrl; } catch {} }));
        setImageUrls(urls);
      })();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load properties.');
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const unitsByProperty = useMemo(() => {
    return units.reduce<Record<string, Unit[]>>((acc, unit) => {
      (acc[unit.property_id] ||= []).push(unit);
      return acc;
    }, {});
  }, [units]);

  function startAddProperty() {
    setEditingProperty(null);
    setPropertyImage(null);
    setPropertyForm(emptyProperty);
    setShowPropertyDetails(false);
    setShowPropertyForm(true);
  }

  function startEditProperty(property: Property) {
    setEditingProperty(property);
    setPropertyImage(null);
    setPropertyForm({
      address: property.address || '', city: property.city || '', state: property.state || '', zip: property.zip || '',
      property_type: property.property_type || 'duplex',
      mortgage_balance: String(property.mortgage_balance ?? ''), purchase_price: String(property.purchase_price ?? ''),
      purchase_date: property.purchase_date || '',
      monthly_mortgage_payment: String(property.monthly_mortgage_payment ?? ''),
      mortgage_start_date: (property as Property & {mortgage_start_date?:string|null}).mortgage_start_date ?? '',
      management_fee_percent: String(property.management_fee_percent ?? 0),
      mortgage_recurring_enabled: property.mortgage_recurring_enabled !== false,
    });
    setShowPropertyDetails(false);
    setShowPropertyForm(true);
  }

  async function saveProperty(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');

    const payload = {
      user_id: user.id,
      address: propertyForm.address.trim(), city: propertyForm.city.trim(), state: propertyForm.state.trim(), zip: propertyForm.zip.trim(),
      property_type: propertyForm.property_type,
      mortgage_balance: Number(propertyForm.mortgage_balance || 0),
      purchase_price: propertyForm.purchase_price ? Number(propertyForm.purchase_price) : null,
      purchase_date: propertyForm.purchase_date || null,
      monthly_mortgage_payment: Number(propertyForm.monthly_mortgage_payment || 0),
      mortgage_start_date: propertyForm.mortgage_start_date || null,
      management_fee_percent: Number(propertyForm.management_fee_percent || 0),
      mortgage_recurring_enabled: propertyForm.mortgage_recurring_enabled !== false,
    };

    let propertyId = editingProperty?.id || '';
    const result = editingProperty
      ? await supabase.from('properties').update(payload).eq('id', editingProperty.id).select('id').single()
      : await supabase.from('properties').insert(payload).select('id').single();

    if (result.error) { setError(result.error.message); setSaving(false); return; }
    propertyId = result.data?.id || propertyId;
    if (propertyImage && propertyId) {
      if (!propertyImage.type.startsWith('image/')) { setError('Please choose an image file.'); setSaving(false); return; }
      const ext = propertyImage.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${propertyId}/primary-${Date.now()}.${ext}`;
      const upload = await supabase.storage.from('property-images').upload(path, propertyImage, { upsert: true, contentType: propertyImage.type });
      if (upload.error) { setError(upload.error.message); setSaving(false); return; }
      const imageUpdate = await supabase.from('properties').update({ image_path: path }).eq('id', propertyId);
      if (imageUpdate.error) { setError(imageUpdate.error.message); setSaving(false); return; }
    }
    setShowPropertyForm(false); setPropertyImage(null); await loadData();
    setSaving(false);
  }

  function startAddUnit(propertyId?: string) {
    setEditingUnit(null);
    setUnitForm({ ...emptyUnit, property_id: propertyId || properties[0]?.id || '' });
    setShowUnitForm(true);
  }

  function startEditUnit(unit: Unit) {
    setEditingUnit(unit);
    setUnitForm({
      property_id: unit.property_id,
      unit_number: unit.unit_number || '',
      bedroom_count: String(unit.bedroom_count ?? ''),
      bathroom_count: String(unit.bathroom_count ?? ''),
      sqft: String(unit.sqft ?? ''),
      current_rent: String(unit.current_rent ?? ''),
      tenant_name: unit.tenant_name || '',
      occupied: Boolean(unit.occupied),
      recurring_rent_enabled: unit.recurring_rent_enabled !== false,
    });
    setShowUnitForm(true);
  }

  async function saveUnit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');

    const payload = {
      user_id: user.id,
      property_id: unitForm.property_id,
      unit_number: unitForm.unit_number.trim(),
      bedroom_count: Number(unitForm.bedroom_count || 0), bathroom_count: Number(unitForm.bathroom_count || 0),
      sqft: Number(unitForm.sqft || 0), current_rent: Number(unitForm.current_rent || 0),
      tenant_name: unitForm.tenant_name.trim(), occupied: unitForm.occupied, recurring_rent_enabled: unitForm.recurring_rent_enabled,
    };
    const result = editingUnit
      ? await supabase.from('units').update(payload).eq('id', editingUnit.id)
      : await supabase.from('units').insert(payload);
    if (result.error) setError(result.error.message);
    else { setShowUnitForm(false); setEditingUnit(null); await loadData(); }
    setSaving(false);
  }

  async function deleteUnit(unit: Unit) {
    if (!confirm(`Archive ${unit.unit_number}? You can restore it later from Archive.`)) return;
    const { error: deleteError } = await supabase.from('units').update({archived_at:new Date().toISOString()}).eq('id', unit.id);
    if (deleteError) setError(deleteError.message); else { setShowUnitForm(false); setEditingUnit(null); await loadData(); }
  }

  function requestDeleteProperty(property: Property) {
    setDeleteTarget(property);
    setDeleteConfirmText('');
  }

  async function deletePropertyPermanently() {
    if (!deleteTarget || deleteConfirmText.trim() !== deleteTarget.address.trim()) return;
    setDeletingProperty(true);
    setError('');
    const { error: deleteError } = await supabase.from('properties').update({archived_at:new Date().toISOString()}).eq('id', deleteTarget.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setDeleteTarget(null);
      setDeleteConfirmText('');
      setShowPropertyForm(false);
      setEditingProperty(null);
      await loadData();
    }
    setDeletingProperty(false);
  }

  return (
    <div className="mobile-page-shell" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500 }}>Properties</h1>
        <button onClick={startAddProperty} style={primaryButton}>+ Add property</button>
      </div>

      {error && <ErrorBox message={error} />}
      {loading ? <PageSkeleton variant="properties" /> : properties.length === 0 ? (
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Add your first property</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 18 }}>Your dashboard and ledger will build from the properties and transactions you enter here.</p>
          <button onClick={startAddProperty} style={primaryButton}>Add property</button>
        </div>
      ) : (
        <div className="compact-properties-list">
          {properties.map((property) => {
            const propertyUnits = unitsByProperty[property.id] || [];
            const occupied = propertyUnits.filter((u) => u.occupied).length;
            const monthlyRent = propertyUnits.filter(u=>u.occupied).reduce((s,u)=>s+Number(u.current_rent||0),0);
            return <section key={property.id} className="card compact-property-row">
              <Link href={`/properties/${property.id}`} className="compact-property-main">
                {imageUrls[property.id] ? <img src={imageUrls[property.id]} alt="" className="compact-property-thumb"/> : <div className="compact-property-thumb compact-property-placeholder">⌂</div>}
                <div className="compact-property-copy"><strong>{property.address}</strong><span>{property.city}, {property.state} · {propertyUnits.length} {propertyUnits.length===1?'unit':'units'} · {occupied}/{propertyUnits.length||0} occupied</span></div>
                <div className="compact-property-rent"><strong>{formatCurrency(monthlyRent)}</strong><span>/mo scheduled rent</span></div>
              </Link>
              <div className="compact-property-actions"><Link href={`/properties/${property.id}`} className="property-open-button">Open</Link><button onClick={()=>startEditProperty(property)} style={secondaryButton}>Edit</button><button onClick={()=>startAddUnit(property.id)} style={secondaryButton}>+ Unit</button></div>
            </section>;
          })}
        </div>
      )}

      {showPropertyForm && (
        <Modal title={editingProperty ? 'Edit property' : 'Add property'} onClose={() => setShowPropertyForm(false)}>
          <form onSubmit={saveProperty} className="mobile-sheet-form" style={{ display: 'grid', gap: 12 }}>
            <Field label="Address"><input required value={propertyForm.address} onChange={e => setPropertyForm({ ...propertyForm, address: e.target.value })} style={inputStyle} /></Field>
            <div style={twoCol}><Field label="City"><input required value={propertyForm.city} onChange={e => setPropertyForm({ ...propertyForm, city: e.target.value })} style={inputStyle} /></Field><Field label="State"><input required value={propertyForm.state} onChange={e => setPropertyForm({ ...propertyForm, state: e.target.value })} style={inputStyle} /></Field></div>
            <div style={twoCol}><Field label="ZIP"><input required value={propertyForm.zip} onChange={e => setPropertyForm({ ...propertyForm, zip: e.target.value })} style={inputStyle} /></Field><Field label="Property type"><select value={propertyForm.property_type} onChange={e => setPropertyForm({ ...propertyForm, property_type: e.target.value })} style={inputStyle}><option value="duplex">Duplex</option><option value="single_family">Single family</option><option value="triplex">Triplex</option><option value="multi_unit">Multi-unit</option></select></Field></div>

            <button type="button" className="sheet-details-toggle" onClick={()=>setShowPropertyDetails(v=>!v)}>{showPropertyDetails?'Hide financial details':'Add financial & property details'}</button>
            {showPropertyDetails&&<div className="sheet-details-panel">
              <div style={twoCol}><Field label="Purchase price"><input type="number" min="0" step="0.01" value={propertyForm.purchase_price} onChange={e => setPropertyForm({ ...propertyForm, purchase_price: e.target.value })} style={inputStyle} /></Field><Field label="Purchase date"><input type="date" value={propertyForm.purchase_date} onChange={e => setPropertyForm({ ...propertyForm, purchase_date: e.target.value })} style={inputStyle} /></Field></div>
              <Field label="Mortgage balance"><input type="number" min="0" step="0.01" value={propertyForm.mortgage_balance} onChange={e => setPropertyForm({ ...propertyForm, mortgage_balance: e.target.value })} style={inputStyle} /></Field>
              <div style={twoCol}><Field label="Monthly mortgage payment"><input type="number" min="0" step="0.01" value={propertyForm.monthly_mortgage_payment} onChange={e => setPropertyForm({ ...propertyForm, monthly_mortgage_payment: e.target.value })} style={inputStyle} /></Field><Field label="Mortgage start date"><input type="date" value={propertyForm.mortgage_start_date} onChange={e => setPropertyForm({ ...propertyForm, mortgage_start_date: e.target.value })} style={inputStyle} /></Field></div>
              <label style={{display:'flex',gap:9,alignItems:'center',fontSize:13}}><input type="checkbox" checked={propertyForm.mortgage_recurring_enabled} onChange={e=>setPropertyForm({...propertyForm,mortgage_recurring_enabled:e.target.checked})}/>Automatically post monthly mortgage</label>
              <Field label="Management fee %"><input type="number" min="0" max="100" step="0.1" value={propertyForm.management_fee_percent} onChange={e => setPropertyForm({ ...propertyForm, management_fee_percent: e.target.value })} style={inputStyle} /></Field>
              <Field label="Property image"><input type="file" accept="image/*" onChange={e => setPropertyImage(e.target.files?.[0] || null)} style={inputStyle} /></Field>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Monthly mortgage posts automatically. Management fee is created when you confirm rent received.</div>
            </div>}
            <button className="mobile-sheet-submit" disabled={saving} style={primaryButton}>{saving ? 'Saving…' : 'Save property'}</button>
            {editingProperty && <div className="danger-zone">
              <div>
                <div style={{fontWeight:600,fontSize:14}}>Danger zone</div>
                <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>Permanent deletion also removes linked units, ledger transactions, documents and utilities.</div>
              </div>
              <button type="button" onClick={() => requestDeleteProperty(editingProperty)} style={dangerButton}>Archive property…</button>
            </div>}
          </form>
        </Modal>
      )}


      {deleteTarget && (
        <Modal title="Archive property property?" onClose={() => { if (!deletingProperty) { setDeleteTarget(null); setDeleteConfirmText(''); } }}>
          <div style={{display:'grid',gap:14}}>
            <div style={{padding:14,border:'1px solid var(--danger)',borderRadius:12,background:'color-mix(in srgb, var(--danger) 8%, transparent)'}}>
              <div style={{fontWeight:650,color:'var(--danger)',marginBottom:6}}>This cannot be undone.</div>
              <div style={{fontSize:13,lineHeight:1.5,color:'var(--text-secondary)'}}>Deleting <strong style={{color:'var(--text-primary)'}}>{deleteTarget.address}</strong> also permanently deletes its units, ledger transactions, document records and utility accounts.</div>
            </div>
            <Field label={`Type “${deleteTarget.address}” to confirm`}><input autoFocus value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} style={inputStyle} /></Field>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,flexWrap:'wrap'}}>
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }} style={secondaryButton}>Cancel</button>
              <button type="button" disabled={deletingProperty || deleteConfirmText.trim() !== deleteTarget.address.trim()} onClick={deletePropertyPermanently} style={{...dangerButton,opacity:deleteConfirmText.trim() === deleteTarget.address.trim()?1:.45}}>{deletingProperty?'Deleting…':'Archive property'}</button>
            </div>
          </div>
        </Modal>
      )}
      {showUnitForm && (
        <Modal title={editingUnit ? 'Edit unit' : 'Add unit'} onClose={() => { setShowUnitForm(false); setEditingUnit(null); }}>
          <form onSubmit={saveUnit} style={{ display: 'grid', gap: 12 }}>
            <Field label="Property"><select required value={unitForm.property_id} onChange={e => setUnitForm({ ...unitForm, property_id: e.target.value })} style={inputStyle}>{properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}</select></Field>
            <Field label="Unit name / number"><input required placeholder="Unit 1" value={unitForm.unit_number} onChange={e => setUnitForm({ ...unitForm, unit_number: e.target.value })} style={inputStyle} /></Field>
            <div style={twoCol}><Field label="Bedrooms"><input type="number" min="0" step="1" value={unitForm.bedroom_count} onChange={e => setUnitForm({ ...unitForm, bedroom_count: e.target.value })} style={inputStyle} /></Field><Field label="Bathrooms"><input type="number" min="0" step="0.5" value={unitForm.bathroom_count} onChange={e => setUnitForm({ ...unitForm, bathroom_count: e.target.value })} style={inputStyle} /></Field></div>
            <div style={twoCol}><Field label="Sqft"><input type="number" min="0" value={unitForm.sqft} onChange={e => setUnitForm({ ...unitForm, sqft: e.target.value })} style={inputStyle} /></Field><Field label="Monthly rent"><input type="number" min="0" step="0.01" value={unitForm.current_rent} onChange={e => setUnitForm({ ...unitForm, current_rent: e.target.value })} style={inputStyle} /></Field></div>
            <Field label="Tenant"><input value={unitForm.tenant_name} onChange={e => setUnitForm({ ...unitForm, tenant_name: e.target.value })} style={inputStyle} /></Field>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={unitForm.occupied} onChange={e => setUnitForm({ ...unitForm, occupied: e.target.checked })} /> Occupied</label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={unitForm.recurring_rent_enabled} onChange={e => setUnitForm({ ...unitForm, recurring_rent_enabled: e.target.checked })} /> Create pending rent each month</label>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>{editingUnit ? <button type="button" onClick={() => deleteUnit(editingUnit)} style={dangerButton}>Delete unit</button> : <span />}<button disabled={saving} style={primaryButton}>{saving ? 'Saving…' : 'Save unit'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>{label}{children}</label>; }
function ErrorBox({ message }: { message: string }) { return <div style={{ marginBottom: 18, padding: 12, border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{message}</div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(()=>{const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[]);
  return <div className="mobile-sheet-overlay" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}><div className="card mobile-sheet" role="dialog" aria-modal="true"><div className="mobile-sheet-head"><div className="mobile-sheet-handle"/><h2 style={{ fontSize: 21 }}>{title}</h2><button onClick={onClose} type="button" style={{ ...secondaryButton, padding: '7px 10px' }}>✕</button></div><div className="mobile-sheet-body">{children}</div></div></div>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 16 };
const primaryButton: React.CSSProperties = { padding: '10px 14px', border: 0, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-contrast)', fontWeight: 600, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { padding: '9px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' };
const dangerButton: React.CSSProperties = { ...secondaryButton, color: 'var(--danger)' };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 };

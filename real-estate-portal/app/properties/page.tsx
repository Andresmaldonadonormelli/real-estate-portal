'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';
import type { Property, Unit } from '@/lib/types';

const emptyProperty = {
  address: '', city: '', state: 'OH', zip: '', property_type: 'duplex',
  estimated_value: '', mortgage_balance: '', purchase_price: '', purchase_date: '',
};

const emptyUnit = {
  property_id: '', unit_number: '', bedroom_count: '', bathroom_count: '', sqft: '', current_rent: '', tenant_name: '', occupied: false,
};

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [propertyForm, setPropertyForm] = useState(emptyProperty);
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    const [{ data: props, error: propError }, { data: unitRows, error: unitError }] = await Promise.all([
      supabase.from('properties').select('*').order('address'),
      supabase.from('units').select('*').order('unit_number'),
    ]);
    if (propError || unitError) {
      setError(propError?.message || unitError?.message || 'Could not load properties.');
    } else {
      setProperties((props || []) as Property[]);
      setUnits((unitRows || []) as Unit[]);
    }
    setLoading(false);
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
    setPropertyForm(emptyProperty);
    setShowPropertyForm(true);
  }

  function startEditProperty(property: Property) {
    setEditingProperty(property);
    setPropertyForm({
      address: property.address || '', city: property.city || '', state: property.state || '', zip: property.zip || '',
      property_type: property.property_type || 'duplex', estimated_value: String(property.estimated_value ?? ''),
      mortgage_balance: String(property.mortgage_balance ?? ''), purchase_price: String(property.purchase_price ?? ''),
      purchase_date: property.purchase_date || '',
    });
    setShowPropertyForm(true);
  }

  async function saveProperty(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError('You are not signed in.'); setSaving(false); return; }

    const payload = {
      user_id: auth.user.id,
      address: propertyForm.address.trim(), city: propertyForm.city.trim(), state: propertyForm.state.trim(), zip: propertyForm.zip.trim(),
      property_type: propertyForm.property_type,
      estimated_value: Number(propertyForm.estimated_value || 0), mortgage_balance: Number(propertyForm.mortgage_balance || 0),
      purchase_price: propertyForm.purchase_price ? Number(propertyForm.purchase_price) : null,
      purchase_date: propertyForm.purchase_date || null,
    };

    const result = editingProperty
      ? await supabase.from('properties').update(payload).eq('id', editingProperty.id)
      : await supabase.from('properties').insert(payload);

    if (result.error) setError(result.error.message);
    else { setShowPropertyForm(false); await loadData(); }
    setSaving(false);
  }

  function startAddUnit(propertyId?: string) {
    setUnitForm({ ...emptyUnit, property_id: propertyId || properties[0]?.id || '' });
    setShowUnitForm(true);
  }

  async function saveUnit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError('You are not signed in.'); setSaving(false); return; }

    const payload = {
      user_id: auth.user.id,
      property_id: unitForm.property_id,
      unit_number: unitForm.unit_number.trim(),
      bedroom_count: Number(unitForm.bedroom_count || 0), bathroom_count: Number(unitForm.bathroom_count || 0),
      sqft: Number(unitForm.sqft || 0), current_rent: Number(unitForm.current_rent || 0),
      tenant_name: unitForm.tenant_name.trim(), occupied: unitForm.occupied,
    };
    const { error: insertError } = await supabase.from('units').insert(payload);
    if (insertError) setError(insertError.message);
    else { setShowUnitForm(false); await loadData(); }
    setSaving(false);
  }

  async function deleteProperty(property: Property) {
    if (!confirm(`Delete ${property.address}? This should only be done if it has no records you need.`)) return;
    const { error: deleteError } = await supabase.from('properties').delete().eq('id', property.id);
    if (deleteError) setError(deleteError.message); else await loadData();
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500 }}>Properties</h1>
        <button onClick={startAddProperty} style={primaryButton}>+ Add property</button>
      </div>

      {error && <ErrorBox message={error} />}
      {loading ? <p>Loading…</p> : properties.length === 0 ? (
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Add your first property</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 18 }}>Your dashboard and ledger will build from the properties and transactions you enter here.</p>
          <button onClick={startAddProperty} style={primaryButton}>Add property</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {properties.map((property) => {
            const propertyUnits = unitsByProperty[property.id] || [];
            const occupied = propertyUnits.filter((u) => u.occupied).length;
            return (
              <section key={property.id} className="card" style={{ padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 21, fontWeight: 550, marginBottom: 5 }}>{property.address}</h2>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{property.city}, {property.state} {property.zip}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startEditProperty(property)} style={secondaryButton}>Edit</button>
                    <button onClick={() => deleteProperty(property)} style={dangerButton}>Delete</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 14, marginTop: 20 }}>
                  <Metric label="Estimated Value" value={formatCurrency(property.estimated_value || 0)} />
                  <Metric label="Mortgage" value={formatCurrency(property.mortgage_balance || 0)} />
                  <Metric label="Units" value={String(propertyUnits.length)} />
                  <Metric label="Occupancy" value={propertyUnits.length ? `${occupied}/${propertyUnits.length}` : '—'} />
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 20, paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>Units</h3>
                    <button onClick={() => startAddUnit(property.id)} style={secondaryButton}>+ Add unit</button>
                  </div>
                  {propertyUnits.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No units yet.</div> : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {propertyUnits.map((unit) => (
                        <div key={unit.id} style={{ padding: 14, border: '1px solid var(--border-color)', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                          <div>
                            <strong>{unit.unit_number}</strong>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                              {unit.bedroom_count} bd · {unit.bathroom_count} ba · {unit.sqft || 0} sqft · {unit.tenant_name || 'No tenant'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 600 }}>{formatCurrency(unit.current_rent || 0)}/mo</div>
                            <div style={{ fontSize: 12, color: unit.occupied ? 'var(--accent)' : 'var(--danger)', marginTop: 4 }}>{unit.occupied ? 'Occupied' : 'Vacant'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showPropertyForm && (
        <Modal title={editingProperty ? 'Edit property' : 'Add property'} onClose={() => setShowPropertyForm(false)}>
          <form onSubmit={saveProperty} style={{ display: 'grid', gap: 12 }}>
            <Field label="Address"><input required value={propertyForm.address} onChange={e => setPropertyForm({ ...propertyForm, address: e.target.value })} style={inputStyle} /></Field>
            <div style={twoCol}><Field label="City"><input required value={propertyForm.city} onChange={e => setPropertyForm({ ...propertyForm, city: e.target.value })} style={inputStyle} /></Field><Field label="State"><input required value={propertyForm.state} onChange={e => setPropertyForm({ ...propertyForm, state: e.target.value })} style={inputStyle} /></Field></div>
            <div style={twoCol}><Field label="ZIP"><input required value={propertyForm.zip} onChange={e => setPropertyForm({ ...propertyForm, zip: e.target.value })} style={inputStyle} /></Field><Field label="Property type"><select value={propertyForm.property_type} onChange={e => setPropertyForm({ ...propertyForm, property_type: e.target.value })} style={inputStyle}><option value="duplex">Duplex</option><option value="single_family">Single family</option><option value="triplex">Triplex</option><option value="multi_unit">Multi-unit</option></select></Field></div>
            <div style={twoCol}><Field label="Purchase price"><input type="number" min="0" step="0.01" value={propertyForm.purchase_price} onChange={e => setPropertyForm({ ...propertyForm, purchase_price: e.target.value })} style={inputStyle} /></Field><Field label="Purchase date"><input type="date" value={propertyForm.purchase_date} onChange={e => setPropertyForm({ ...propertyForm, purchase_date: e.target.value })} style={inputStyle} /></Field></div>
            <div style={twoCol}><Field label="Estimated value"><input type="number" min="0" step="0.01" value={propertyForm.estimated_value} onChange={e => setPropertyForm({ ...propertyForm, estimated_value: e.target.value })} style={inputStyle} /></Field><Field label="Mortgage balance"><input type="number" min="0" step="0.01" value={propertyForm.mortgage_balance} onChange={e => setPropertyForm({ ...propertyForm, mortgage_balance: e.target.value })} style={inputStyle} /></Field></div>
            <button disabled={saving} style={primaryButton}>{saving ? 'Saving…' : 'Save property'}</button>
          </form>
        </Modal>
      )}

      {showUnitForm && (
        <Modal title="Add unit" onClose={() => setShowUnitForm(false)}>
          <form onSubmit={saveUnit} style={{ display: 'grid', gap: 12 }}>
            <Field label="Property"><select required value={unitForm.property_id} onChange={e => setUnitForm({ ...unitForm, property_id: e.target.value })} style={inputStyle}>{properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}</select></Field>
            <Field label="Unit name / number"><input required placeholder="Unit 1" value={unitForm.unit_number} onChange={e => setUnitForm({ ...unitForm, unit_number: e.target.value })} style={inputStyle} /></Field>
            <div style={twoCol}><Field label="Bedrooms"><input type="number" min="0" step="1" value={unitForm.bedroom_count} onChange={e => setUnitForm({ ...unitForm, bedroom_count: e.target.value })} style={inputStyle} /></Field><Field label="Bathrooms"><input type="number" min="0" step="0.5" value={unitForm.bathroom_count} onChange={e => setUnitForm({ ...unitForm, bathroom_count: e.target.value })} style={inputStyle} /></Field></div>
            <div style={twoCol}><Field label="Sqft"><input type="number" min="0" value={unitForm.sqft} onChange={e => setUnitForm({ ...unitForm, sqft: e.target.value })} style={inputStyle} /></Field><Field label="Monthly rent"><input type="number" min="0" step="0.01" value={unitForm.current_rent} onChange={e => setUnitForm({ ...unitForm, current_rent: e.target.value })} style={inputStyle} /></Field></div>
            <Field label="Tenant"><input value={unitForm.tenant_name} onChange={e => setUnitForm({ ...unitForm, tenant_name: e.target.value })} style={inputStyle} /></Field>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={unitForm.occupied} onChange={e => setUnitForm({ ...unitForm, occupied: e.target.checked })} /> Occupied</label>
            <button disabled={saving} style={primaryButton}>{saving ? 'Saving…' : 'Save unit'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>{label}{children}</label>; }
function ErrorBox({ message }: { message: string }) { return <div style={{ marginBottom: 18, padding: 12, border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{message}</div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 1000 }}><div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', padding: 22 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}><h2 style={{ fontSize: 21 }}>{title}</h2><button onClick={onClose} type="button" style={{ ...secondaryButton, padding: '7px 10px' }}>✕</button></div>{children}</div></div>; }

const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 16 };
const primaryButton: React.CSSProperties = { padding: '10px 14px', border: 0, borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { padding: '9px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' };
const dangerButton: React.CSSProperties = { ...secondaryButton, color: 'var(--danger)' };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 };

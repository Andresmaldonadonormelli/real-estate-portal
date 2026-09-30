'use client';

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, Unit } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { cachedSupabaseRequest, invalidateSupabaseCache, PROPERTY_FIELDS, UNIT_DETAIL_FIELDS } from '@/lib/supabaseData';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { emptyProfile, originalLoan, parseProfile, rememberValue, type DatedAmount, type PropertyProfile, type RecurringAmount, type RefinanceRecord } from '@/lib/propertyProfile';

type UnitDraft = { id: string; isNew: boolean; unit_number: string; current_rent: string; occupied: boolean };
type PropertyDraft = ReturnType<typeof draftFrom>;

export default function PropertyEditPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [form, setForm] = useState<ReturnType<typeof draftFrom> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    (async () => {
      const loaded = await loadProperty(propertyId);
      const units = await cachedSupabaseRequest(`property:${propertyId}:units`, async () => await supabase.from('units').select(UNIT_DETAIL_FIELDS).eq('property_id', propertyId).is('archived_at', null).order('unit_number'));
      if (!active) return;
      if (loaded.error || !loaded.property) {
        setError(loaded.error || 'Property not found.');
        setLoading(false);
        return;
      }
      setProperty(loaded.property);
      setForm(draftFrom(loaded.property, loaded.profile, (units.data || []) as Unit[]));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [propertyId]);

  const summary = useMemo(() => {
    if (!form || !property) return null;
    const profile = profileFrom(form, property);
    const loan = originalLoan({ purchase_price: num(form.purchase_price) }, profile);
    return {
      loan: loan == null ? Number(form.mortgage_balance || 0) : loan,
      deal: num(form.down_payment) + num(form.closing_costs),
      payment: num(form.monthly_payment),
      equity: num(form.estimated_value) - num(form.mortgage_balance),
    };
  }, [form, property]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !property) return;
    setSaving(true);
    setError('');
    const previous = parseProfile((property as Property & { property_profile?: unknown }).property_profile);
    const profile = profileFrom(form, property);
    profile.value_history = rememberValue(previous, profile.estimated_value, profile.estimated_value_as_of);
    const payment = num(form.monthly_payment);
    const escrow = num(form.escrow_amount);
    const fees = num(form.pmi);
    const patch = {
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
      property_type: form.property_type,
      purchase_price: form.purchase_price ? num(form.purchase_price) : null,
      purchase_date: form.purchase_date || null,
      mortgage_balance: num(form.mortgage_balance),
      mortgage_interest_rate: form.mortgage_interest_rate ? num(form.mortgage_interest_rate) : null,
      mortgage_term_years: form.mortgage_term_years ? num(form.mortgage_term_years) : null,
      mortgage_start_date: form.mortgage_start_date || null,
      monthly_mortgage_payment: payment,
      mortgage_escrow_amount: escrow,
      mortgage_pmi_amount: fees,
      mortgage_principal_interest_payment: Math.max(0, payment - escrow - fees),
      mortgage_recurring_enabled: false,
      property_profile: profile,
    };
    const saved = await supabase.from('properties').update(patch).eq('id', property.id);
    if (saved.error) {
      setSaving(false);
      setError(saved.error.message.includes('property_profile') ? 'The property profile column is missing. Run V246_PROPERTY_PROFILE.sql, then save again.' : saved.error.message);
      return;
    }
    const auth = await supabase.auth.getUser();
    const user = auth.data.user;
    for (const unit of form.units) {
      const unitPatch = { unit_number: unit.unit_number.trim(), current_rent: num(unit.current_rent), occupied: unit.occupied };
      if (unit.isNew) {
        if (!user || !unit.unit_number.trim()) continue;
        const inserted = await supabase.from('units').insert({ ...unitPatch, user_id: user.id, property_id: property.id, tenant_name: '', bedroom_count: 0, bathroom_count: 0, sqft: 0, recurring_rent_enabled: true });
        if (inserted.error) { setSaving(false); setError(inserted.error.message); return; }
      } else {
        const updated = await supabase.from('units').update(unitPatch).eq('id', unit.id);
        if (updated.error) { setSaving(false); setError(updated.error.message); return; }
      }
    }
    invalidateSupabaseCache();
    router.push(`/properties/${property.id}`);
  }

  async function archiveProperty() {
    if (!property || !confirm('Archive this property? Posted ledger history stays, and you can restore it from Archive.')) return;
    setSaving(true);
    const result = await supabase.from('properties').update({ archived_at: new Date().toISOString() }).eq('id', property.id);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    invalidateSupabaseCache();
    router.push('/properties');
  }

  function update<K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) {
    setForm(current => current ? { ...current, [key]: value } : current);
  }

  if (loading || !form || !summary) return <div className="property-workspace"><p className="property-module-note">{error || 'Loading property…'}</p></div>;

  return <form className="property-workspace property-edit-page workspace-form" onSubmit={save}>
    <Link href={`/properties/${propertyId}`} className="property-back"><ArrowLeft size={16} /> Back</Link>
    <h1>Edit property</h1>
    {error ? <div className="workspace-form-error">{error}</div> : null}

    <section className="property-module" id="basics">
      <h2>Basics</h2>
      <div className="workspace-form-grid two">
        <label>Property name<input value={form.name} onChange={event => update('name', event.target.value)} /></label>
        <label>Type<select value={form.property_type} onChange={event => update('property_type', event.target.value)}><option value="duplex">Duplex</option><option value="single_family">Single family</option><option value="triplex">Triplex</option><option value="multi_unit">Multi-unit</option></select></label>
      </div>
      <label>Street address<input required value={form.address} onChange={event => update('address', event.target.value)} /></label>
      <div className="workspace-form-grid two">
        <label>City<input required value={form.city} onChange={event => update('city', event.target.value)} /></label>
        <label>ZIP code<input required value={form.zip} onChange={event => update('zip', event.target.value)} /></label>
      </div>
      <div className="workspace-form-grid two">
        <label>Country<input value={form.country} onChange={event => update('country', event.target.value)} /></label>
        <label>State<input required value={form.state} onChange={event => update('state', event.target.value)} /></label>
      </div>
      <div className="property-edit-owner">
        <div>
          <span>Who owns it</span>
          <div className="property-chart-pills">
            <button type="button" className={form.owner_type === 'me' ? 'active' : ''} onClick={() => update('owner_type', 'me')}>Me</button>
            <button type="button" className={form.owner_type === 'company' ? 'active' : ''} onClick={() => update('owner_type', 'company')}>A company</button>
          </div>
        </div>
        <label>Your share (%)<input type="number" min="0" max="100" value={form.ownership_share} onChange={event => update('ownership_share', event.target.value)} /></label>
      </div>
      <label>Tags (optional)<input value={form.tags} placeholder="e.g. Duplexes" onChange={event => update('tags', event.target.value)} /><small>For grouping and filtering properties.</small></label>
    </section>

    <section className="property-module" id="financing">
      <h2>Acquisition & financing</h2>
      <p className="property-module-note">Closing costs and renovations are tracked separately and are not financed.</p>
      <div className="workspace-form-grid three">
        <label>Purchase price<input type="number" min="0" value={form.purchase_price} onChange={event => update('purchase_price', event.target.value)} /></label>
        <label>Down payment<input type="number" min="0" value={form.down_payment} onChange={event => update('down_payment', event.target.value)} /></label>
        <label>Closing costs<input type="number" min="0" value={form.closing_costs} onChange={event => update('closing_costs', event.target.value)} /></label>
      </div>
      <label className="workspace-checkbox"><input type="checkbox" checked={form.paid_in_cash} onChange={event => update('paid_in_cash', event.target.checked)} /><span>Paid in cash (no mortgage)</span></label>
      <div className="workspace-form-grid three">
        <label>Estimated value (current)<input type="number" min="0" value={form.estimated_value} onChange={event => update('estimated_value', event.target.value)} /></label>
        <label>Value as of<input type="date" value={form.estimated_value_as_of} onChange={event => update('estimated_value_as_of', event.target.value)} /><small>A new value keeps the old one on your equity chart.</small></label>
        <label>Loan start date<input type="date" value={form.mortgage_start_date} onChange={event => update('mortgage_start_date', event.target.value)} /></label>
      </div>
      <label>Purchase date<input type="date" value={form.purchase_date} onChange={event => update('purchase_date', event.target.value)} /></label>
      <div className="workspace-form-grid three">
        <label>Financing type<select value={form.financing_type} onChange={event => update('financing_type', event.target.value)}><option>Conventional mortgage</option><option>FHA</option><option>VA</option><option>Other</option></select></label>
        <label>Amortization (years)<input type="number" min="0" value={form.mortgage_term_years} onChange={event => update('mortgage_term_years', event.target.value)} /></label>
        <label>Interest rate (%)<input type="number" min="0" step="0.001" value={form.mortgage_interest_rate} onChange={event => update('mortgage_interest_rate', event.target.value)} /></label>
      </div>
      <div className="workspace-form-grid three">
        <label>Rate type<select value={form.rate_type} onChange={event => update('rate_type', event.target.value)}><option>Fixed</option><option>Adjustable</option></select></label>
        <label>Actual monthly payment<input type="number" min="0" value={form.monthly_payment} onChange={event => update('monthly_payment', event.target.value)} /><small>What your lender actually bills. Cash flow uses this; the rate still drives your loan paydown.</small></label>
        <label>Lender (optional)<input value={form.lender} onChange={event => update('lender', event.target.value)} /></label>
      </div>
      <div className="property-edit-choice">
        <span>Does this payment include property tax and insurance (escrow)?</span>
        <div className="property-chart-pills">
          <button type="button" className={form.payment_includes_escrow ? 'active' : ''} onClick={() => update('payment_includes_escrow', true)}>Yes</button>
          <button type="button" className={!form.payment_includes_escrow ? 'active' : ''} onClick={() => update('payment_includes_escrow', false)}>No</button>
        </div>
        <small>Still enter them under expenses; they’re taken out of this payment, so they count once, as bills. The rest is your mortgage.</small>
      </div>
      <div className="workspace-form-grid two">
        <label>Escrow part of the payment (optional)<input type="number" min="0" value={form.escrow_amount} onChange={event => update('escrow_amount', event.target.value)} /></label>
        <label>Fees and other (optional)<input type="number" min="0" value={form.pmi} onChange={event => update('pmi', event.target.value)} /></label>
      </div>
      <label>Escrow balance (optional)<input type="number" min="0" value={form.escrow_balance} placeholder="Not entered" onChange={event => update('escrow_balance', event.target.value)} /></label>
      <label>Term ends (optional)<input type="date" value={form.term_end} onChange={event => update('term_end', event.target.value)} /><small>Most US fixed-rate loans don’t have one; leave it blank unless yours has a balloon or term end.</small></label>
      <label className="workspace-checkbox"><input type="checkbox" checked={form.skip_first} onChange={event => update('skip_first', event.target.checked)} /><span>I didn’t have a mortgage payment my first month</span></label>
      <div className="workspace-form-grid two">
        <label>Current loan balance<input type="number" min="0" value={form.mortgage_balance} onChange={event => update('mortgage_balance', event.target.value)} /></label>
        <label>Current equity<input type="number" value={String(summary.equity || 0)} onChange={event => update('estimated_value', String(num(event.target.value) + num(form.mortgage_balance)))} /><small>Estimated value minus loan balance. Enter either one; they stay in sync.</small></label>
      </div>
      <p className="property-edit-summary">Loan amount: {formatKpiCurrency(summary.loan)} · Cash in the deal: {formatKpiCurrency(summary.deal)} · Est. monthly payment: {formatKpiCurrency(summary.payment)}</p>
    </section>

    <RecordList id="refinances" title="Refinances" note="Each refinance replaces the loan from its date — new rate and term, optionally pulling equity out as cash." empty="No refinances — the original loan runs the whole time." addLabel="Add refinance" rows={form.refinances} onAdd={() => update('refinances', [...form.refinances, blankRefinance()])}>
      {form.refinances.map(row => <div className="property-edit-record" key={row.id}>
        <div className="workspace-form-grid three">
          <label>Date<input type="date" value={row.date} onChange={event => update('refinances', replace(form.refinances, row.id, { ...row, date: event.target.value }))} /></label>
          <label>Balance<input type="number" min="0" value={row.balance || ''} onChange={event => update('refinances', replace(form.refinances, row.id, { ...row, balance: num(event.target.value) }))} /></label>
          <label>Rate<input type="number" min="0" step="0.001" value={row.rate || ''} onChange={event => update('refinances', replace(form.refinances, row.id, { ...row, rate: num(event.target.value) }))} /></label>
        </div>
        <button type="button" className="property-text-action" onClick={() => update('refinances', form.refinances.filter(item => item.id !== row.id))}>Remove</button>
      </div>)}
    </RecordList>

    <RecordList id="principal" title="Extra principal payments" note="Lump sums you paid straight against the loan balance during the year — they build equity and speed up payoff, on top of the regular payment." empty="No extra principal payments logged — only the regular monthly payment pays the loan down." addLabel="Add principal payment" rows={form.extra_principal} onAdd={() => update('extra_principal', [...form.extra_principal, blankAmount()])}>
      {form.extra_principal.map(row => <div className="property-edit-record" key={row.id}><AmountRow row={row} onChange={next => update('extra_principal', replace(form.extra_principal, row.id, next))} /><button type="button" className="property-text-action" onClick={() => update('extra_principal', form.extra_principal.filter(item => item.id !== row.id))}>Remove</button></div>)}
    </RecordList>

    <RecordList id="capex" title="Capital expenditures" note="One-time capital like a roof or full renovation — counts as invested equity, not a monthly expense." empty="No capital expenditures added yet." addLabel="Add capital expenditure" rows={form.capital_expenditures} onAdd={() => update('capital_expenditures', [...form.capital_expenditures, blankAmount()])}>
      {form.capital_expenditures.map(row => <div className="property-edit-record" key={row.id}><AmountRow row={row} onChange={next => update('capital_expenditures', replace(form.capital_expenditures, row.id, next))} /><button type="button" className="property-text-action" onClick={() => update('capital_expenditures', form.capital_expenditures.filter(item => item.id !== row.id))}>Remove</button></div>)}
    </RecordList>

    <section className="property-module" id="units">
      <div className="property-module-head"><h2>Units & rent</h2><button type="button" className="property-secondary-action" onClick={() => update('units', [...form.units, { id: nid(), isNew: true, unit_number: '', current_rent: '', occupied: true }])}>Add unit</button></div>
      <p className="property-module-note">Gross rent: {formatKpiCurrency(form.units.reduce((sum, unit) => sum + num(unit.current_rent), 0))}/mo</p>
      {form.units.map(unit => <div className="workspace-form-grid three" key={unit.id}>
        <label>Unit name<input value={unit.unit_number} onChange={event => update('units', form.units.map(item => item.id === unit.id ? { ...item, unit_number: event.target.value } : item))} /></label>
        <label>Monthly rent<input type="number" min="0" value={unit.current_rent} onChange={event => update('units', form.units.map(item => item.id === unit.id ? { ...item, current_rent: event.target.value } : item))} /></label>
        <label className="workspace-checkbox"><input type="checkbox" checked={unit.occupied} onChange={event => update('units', form.units.map(item => item.id === unit.id ? { ...item, occupied: event.target.checked } : item))} /><span>Occupied</span></label>
      </div>)}
    </section>

    <RecordList id="income" title="Other income" note="Beyond rent — late fees, parking, utilities, laundry." empty="No additional income added yet." addLabel="Add income" rows={form.other_income} onAdd={() => update('other_income', [...form.other_income, blankRecurring()])}>
      {form.other_income.map(row => <div className="property-edit-record" key={row.id}><RecurringRow row={row} onChange={next => update('other_income', replace(form.other_income, row.id, next))} /><button type="button" className="property-text-action" onClick={() => update('other_income', form.other_income.filter(item => item.id !== row.id))}>Remove</button></div>)}
    </RecordList>

    <RecordList id="expenses" title="Monthly operating expenses" note="Regular bills. Repairs you actually pay are entered in the month you paid them." empty="No property tax or insurance yet. Almost every rental pays both; without them, cash flow looks better than it is." addLabel="Add expense" rows={form.operating_expenses} onAdd={() => update('operating_expenses', [...form.operating_expenses, blankRecurring()])}>
      {form.operating_expenses.map(row => <div className="property-edit-record" key={row.id}><RecurringRow row={row} onChange={next => update('operating_expenses', replace(form.operating_expenses, row.id, next))} /><button type="button" className="property-text-action" onClick={() => update('operating_expenses', form.operating_expenses.filter(item => item.id !== row.id))}>Remove</button></div>)}
    </RecordList>

    <div className="property-edit-bar">
      <button type="button" className="property-edit-delete" disabled={saving} onClick={archiveProperty}>Delete</button>
      <div>
        <Link href={`/properties/${propertyId}`} className="property-secondary-action">Cancel</Link>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  </form>;
}

function RecordList<T extends { id: string }>({ id, title, note, empty, addLabel, rows, onAdd, children }: {
  id: string;
  title: string;
  note: string;
  empty: string;
  addLabel: string;
  rows: T[];
  onAdd: () => void;
  children: ReactNode;
}) {
  return <section className="property-module" id={id}>
    <div className="property-module-head"><div><h2>{title}</h2><p className="property-module-note">{note}</p></div><button type="button" className="property-secondary-action" onClick={onAdd}>{addLabel}</button></div>
    {rows.length ? <div className="property-edit-records">{children}</div> : <p className="property-module-note">{empty}</p>}
  </section>;
}

function AmountRow({ row, onChange }: { row: DatedAmount; onChange: (row: DatedAmount) => void }) {
  return <div className="workspace-form-grid three">
    <label>Label<input value={row.label} onChange={event => onChange({ ...row, label: event.target.value })} /></label>
    <label>Date<input type="date" value={row.date} onChange={event => onChange({ ...row, date: event.target.value })} /></label>
    <label>Amount<input type="number" min="0" value={row.amount || ''} onChange={event => onChange({ ...row, amount: num(event.target.value) })} /></label>
  </div>;
}

function RecurringRow({ row, onChange }: { row: RecurringAmount; onChange: (row: RecurringAmount) => void }) {
  return <div className="workspace-form-grid two">
    <label>Label<input value={row.label} onChange={event => onChange({ ...row, label: event.target.value })} /></label>
    <label>Amount / mo<input type="number" min="0" value={row.amount || ''} onChange={event => onChange({ ...row, amount: num(event.target.value) })} /></label>
  </div>;
}

async function loadProperty(propertyId: string) {
  const extended = await cachedSupabaseRequest(`property:${propertyId}:profile`, async () => await supabase.from('properties').select(`${PROPERTY_FIELDS},property_profile`).eq('id', propertyId).is('archived_at', null).single());
  if (!extended.error && extended.data) {
    const row = extended.data as Property & { property_profile?: unknown };
    return { property: row, profile: parseProfile(row.property_profile), error: '' };
  }
  const basic = await cachedSupabaseRequest(`property:${propertyId}`, async () => await supabase.from('properties').select(PROPERTY_FIELDS).eq('id', propertyId).is('archived_at', null).single());
  if (basic.error || !basic.data) return { property: null, profile: emptyProfile(), error: basic.error?.message || 'Property not found.' };
  return { property: basic.data as Property, profile: emptyProfile(), error: '' };
}

function draftFrom(property: Property, profile: PropertyProfile, units: Unit[]) {
  return {
    address: property.address || '',
    city: property.city || '',
    state: property.state || '',
    zip: property.zip || '',
    property_type: property.property_type || 'duplex',
    name: profile.name,
    country: profile.country,
    owner_type: profile.owner_type,
    ownership_share: String(profile.ownership_share),
    tags: profile.tags.join(', '),
    purchase_price: property.purchase_price ? String(property.purchase_price) : '',
    purchase_date: property.purchase_date || '',
    down_payment: profile.down_payment ? String(profile.down_payment) : '',
    closing_costs: profile.closing_costs ? String(profile.closing_costs) : '',
    paid_in_cash: profile.paid_in_cash,
    estimated_value: profile.estimated_value ? String(profile.estimated_value) : '',
    estimated_value_as_of: profile.estimated_value_as_of,
    mortgage_balance: property.mortgage_balance ? String(property.mortgage_balance) : '',
    mortgage_interest_rate: property.mortgage_interest_rate ? String(property.mortgage_interest_rate) : '',
    mortgage_term_years: property.mortgage_term_years ? String(property.mortgage_term_years) : '',
    mortgage_start_date: property.mortgage_start_date || '',
    financing_type: profile.financing_type,
    rate_type: profile.rate_type,
    lender: profile.lender,
    monthly_payment: property.monthly_mortgage_payment ? String(property.monthly_mortgage_payment) : '',
    payment_includes_escrow: profile.payment_includes_escrow,
    escrow_amount: property.mortgage_escrow_amount ? String(property.mortgage_escrow_amount) : '',
    pmi: property.mortgage_pmi_amount ? String(property.mortgage_pmi_amount) : '',
    term_end: profile.mortgage_term_end,
    skip_first: profile.skip_first_payment,
    escrow_balance: profile.escrow_balance == null ? '' : String(profile.escrow_balance),
    refinances: profile.refinances,
    extra_principal: profile.extra_principal,
    capital_expenditures: profile.capital_expenditures,
    other_income: profile.other_income,
    operating_expenses: profile.operating_expenses,
    units: units.map(unit => ({ id: unit.id, isNew: false, unit_number: unit.unit_number || '', current_rent: unit.current_rent ? String(unit.current_rent) : '', occupied: Boolean(unit.occupied) })),
  };
}

function profileFrom(form: NonNullable<ReturnType<typeof draftFrom>>, property: Property): PropertyProfile {
  const previous = parseProfile((property as Property & { property_profile?: unknown }).property_profile);
  return {
    ...previous,
    name: form.name.trim(),
    country: form.country.trim() || 'United States',
    owner_type: form.owner_type,
    ownership_share: num(form.ownership_share) || 100,
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    down_payment: num(form.down_payment),
    closing_costs: num(form.closing_costs),
    paid_in_cash: form.paid_in_cash,
    estimated_value: num(form.estimated_value),
    estimated_value_as_of: form.estimated_value_as_of,
    financing_type: form.financing_type,
    rate_type: form.rate_type,
    lender: form.lender.trim(),
    payment_includes_escrow: form.payment_includes_escrow,
    mortgage_term_end: form.term_end,
    skip_first_payment: form.skip_first,
    escrow_balance: form.escrow_balance === '' ? null : num(form.escrow_balance),
    refinances: form.refinances,
    extra_principal: form.extra_principal,
    capital_expenditures: form.capital_expenditures,
    other_income: form.other_income,
    operating_expenses: form.operating_expenses,
  };
}

function blankAmount(): DatedAmount {
  return { id: nid(), date: '', amount: 0, label: '' };
}
function blankRecurring(): RecurringAmount {
  return { id: nid(), label: '', amount: 0 };
}
function blankRefinance(): RefinanceRecord {
  return { id: nid(), date: '', balance: 0, rate: 0, term_years: 30, financing_type: 'Conventional mortgage', rate_type: 'Fixed', lender: '' };
}
function replace<T extends { id: string }>(rows: T[], id: string, next: T) {
  return rows.map(row => row.id === id ? next : row);
}
function num(value: string | number) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}
function nid() {
  return globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

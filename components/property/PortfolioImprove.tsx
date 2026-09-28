'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { Property } from '@/lib/types';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { ProductSelect } from '@/components/common/ProductControls';

type Status = 'idea' | 'active' | 'done';
type Priority = 'high' | 'normal';
type Benefit = 'rent' | 'maintenance' | 'value';

type Improvement = {
  id: string;
  propertyId: string;
  name: string;
  status: Status;
  priority: Priority;
  estimatedCost: number;
  benefit: Benefit;
  benefitAmount: number | null;
  note: string;
  createdAt: string;
};

const BENEFIT_LABEL: Record<Benefit, string> = {
  rent: 'Rent increase',
  maintenance: 'Maintenance avoided',
  value: 'Value',
};
const STATUS_LABEL: Record<Status, string> = { idea: 'Idea', active: 'Active', done: 'Done' };
const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', normal: 'Normal' };

const EMPTY = {
  propertyId: '',
  name: '',
  status: 'idea' as Status,
  priority: 'normal' as Priority,
  estimatedCost: '',
  benefit: 'rent' as Benefit,
  benefitAmount: '',
  note: '',
};

function wholeDollars(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function storageKey(userId: string) {
  return `portfolio-improvements:${userId}`;
}

function isImprovement(value: unknown): value is Improvement {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Improvement>;
  return typeof item.id === 'string' && typeof item.propertyId === 'string' && typeof item.name === 'string'
    && (item.status === 'idea' || item.status === 'active' || item.status === 'done')
    && (item.priority === 'high' || item.priority === 'normal')
    && typeof item.estimatedCost === 'number'
    && (item.benefit === 'rent' || item.benefit === 'maintenance' || item.benefit === 'value')
    && (item.benefitAmount === null || typeof item.benefitAmount === 'number')
    && typeof item.note === 'string';
}

function loadItems(userId: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isImprovement) : [];
  } catch {
    return [];
  }
}

function benefitText(item: Improvement) {
  const label = BENEFIT_LABEL[item.benefit];
  if (item.benefitAmount && item.benefitAmount > 0) {
    const amount = item.benefit === 'rent' ? `+${formatCurrency(item.benefitAmount)}/mo` : formatCurrency(item.benefitAmount);
    return `${label} · ${amount}`;
  }
  return item.note.trim() ? `${label} · ${item.note.trim()}` : label;
}

function statusText(item: Improvement) {
  if (item.status === 'done') return 'Done';
  return `${STATUS_LABEL[item.status]} · ${PRIORITY_LABEL[item.priority]}`;
}

export default function PortfolioImprove({ properties, userId, addSignal }: { properties: Property[]; userId: string; addSignal: number }) {
  const [items, setItems] = useState<Improvement[]>([]);
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;

  useEffect(() => {
    setItems(loadItems(userId));
    setReady(true);
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
  }, [items, ready, userId]);

  useEffect(() => {
    if (addSignal < 1) return;
    setEditingId(null);
    setForm({ ...EMPTY, propertyId: propertiesRef.current[0]?.id || '' });
    setOpen(true);
  }, [addSignal]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const propertyName = useMemo(() => new Map(properties.map(property => [property.id, property.address])), [properties]);
  const propertyOrder = useMemo(() => new Map(properties.map((property, index) => [property.id, index])), [properties]);

  const active = items.filter(item => item.status !== 'done').sort((a, b) => {
    const priority = Number(a.priority !== 'high') - Number(b.priority !== 'high');
    if (priority) return priority;
    const status = Number(a.status !== 'active') - Number(b.status !== 'active');
    if (status) return status;
    return (propertyOrder.get(a.propertyId) ?? 99) - (propertyOrder.get(b.propertyId) ?? 99);
  });
  const completed = items.filter(item => item.status === 'done').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  function edit(item: Improvement) {
    setEditingId(item.id);
    setForm({
      propertyId: item.propertyId,
      name: item.name,
      status: item.status,
      priority: item.priority,
      estimatedCost: item.estimatedCost ? String(item.estimatedCost) : '',
      benefit: item.benefit,
      benefitAmount: item.benefitAmount ? String(item.benefitAmount) : '',
      note: item.note,
    });
    setOpen(true);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.propertyId) return;
    const next: Improvement = {
      id: editingId || crypto.randomUUID(),
      propertyId: form.propertyId,
      name,
      status: form.status,
      priority: form.status === 'done' ? 'normal' : form.priority,
      estimatedCost: wholeDollars(form.estimatedCost),
      benefit: form.benefit,
      benefitAmount: form.benefitAmount.trim() ? wholeDollars(form.benefitAmount) : null,
      note: form.note.trim(),
      createdAt: items.find(item => item.id === editingId)?.createdAt || new Date().toISOString(),
    };
    setItems(current => editingId ? current.map(item => item.id === editingId ? next : item) : [next, ...current]);
    setOpen(false);
  }

  function remove() {
    if (!editingId) return;
    setItems(current => current.filter(item => item.id !== editingId));
    setOpen(false);
  }

  return <div className="portfolio-improve">
    {!items.length ? <p className="portfolio-empty">No improvements yet. Add one when you want to compare a project against a property.</p> : <>
      {active.length ? <ImproveGroup title="To do next" items={active} propertyName={propertyName} onEdit={edit} showHeader /> : <p className="portfolio-empty">Nothing in progress. Completed improvements stay below.</p>}
      {completed.length ? <ImproveGroup title="Completed" items={completed} propertyName={propertyName} onEdit={edit} showHeader={!active.length} /> : null}
    </>}
    {open && <div className="portfolio-improve-overlay" onMouseDown={event => { if (event.currentTarget === event.target) setOpen(false); }}>
      <div className="portfolio-improve-dialog" role="dialog" aria-modal="true" aria-labelledby="portfolio-improve-title">
        <div className="portfolio-improve-head">
          <h2 id="portfolio-improve-title">{editingId ? 'Edit improvement' : 'Add improvement'}</h2>
          <button type="button" className="sheet-close-button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <form className="portfolio-form" onSubmit={save}>
          <ProductSelect label="Property" required value={form.propertyId} onChange={event => setForm({ ...form, propertyId: event.target.value })}>
            {properties.map(property => <option key={property.id} value={property.id}>{property.address}</option>)}
          </ProductSelect>
          <label>Project<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <div className="portfolio-form-pair">
            <ProductSelect label="Status" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as Status })}>
              <option value="idea">Idea</option>
              <option value="active">Active</option>
              <option value="done">Done</option>
            </ProductSelect>
            {form.status !== 'done' && <ProductSelect label="Priority" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as Priority })}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </ProductSelect>}
          </div>
          <div className="portfolio-form-pair">
            <label>Estimated cost<input inputMode="decimal" min="0" type="number" value={form.estimatedCost} onChange={event => setForm({ ...form, estimatedCost: event.target.value })} /></label>
            <label>Benefit amount<input inputMode="decimal" min="0" type="number" value={form.benefitAmount} onChange={event => setForm({ ...form, benefitAmount: event.target.value })} /></label>
          </div>
          <ProductSelect label="Expected benefit" value={form.benefit} onChange={event => setForm({ ...form, benefit: event.target.value as Benefit })}>
            <option value="rent">Rent increase</option>
            <option value="maintenance">Maintenance avoided</option>
            <option value="value">Value</option>
          </ProductSelect>
          <label>Note<input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
          <div className="portfolio-form-actions">
            {editingId ? <button type="button" className="portfolio-text-button" onClick={remove}>Remove</button> : <span />}
            <Button type="submit">Save</Button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}

function ImproveGroup({ title, items, propertyName, onEdit, showHeader }: { title: string; items: Improvement[]; propertyName: Map<string, string>; onEdit: (item: Improvement) => void; showHeader: boolean }) {
  return <section className="portfolio-group">
    <h2 className="portfolio-group-title"><span>{title}</span></h2>
    {showHeader && <div className="portfolio-columns portfolio-improve-grid" aria-hidden="true">
      <span>Property</span>
      <span>Project</span>
      <span>Status</span>
      <span>Cost</span>
      <span>Benefit</span>
      <span />
    </div>}
    {items.map(item => <div key={item.id} className="portfolio-improve-row portfolio-improve-grid">
      <button type="button" className="portfolio-improve-open" onClick={() => onEdit(item)}>
        <span className="portfolio-improve-property">{propertyName.get(item.propertyId) || 'Property'}</span>
        <span className="portfolio-improve-name">{item.name}</span>
        <span className="portfolio-improve-status" data-status={item.status}>{statusText(item)}</span>
        <span className="portfolio-improve-cost">{formatCurrency(item.estimatedCost)}</span>
        <span className="portfolio-improve-benefit">{benefitText(item)}</span>
      </button>
      <Link className="portfolio-improve-model" href={`/properties/${item.propertyId}?tab=improve`}>Model cash flow</Link>
    </div>)}
  </section>;
}

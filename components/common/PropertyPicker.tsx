'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { ProductSelect } from '@/components/common/ProductControls';
import { propertyChipName } from '@/lib/formatters';

type PropertyOption = { id: string; address: string };

export default function PropertyPicker({ value, properties, onChange, className = '' }: {
  value: string;
  properties: PropertyOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const selected = properties.find((property) => property.id === value);
  const label = selected ? propertyChipName(selected.address) : 'All properties';

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  const sheet = open ? (
    <div className="property-sheet-root">
      <button type="button" className="property-sheet-scrim" aria-label="Close property list" onClick={() => setOpen(false)} />
      <div className="property-sheet" role="dialog" aria-modal="true" aria-label="Property">
        <div className="property-sheet-head">
          <strong>Property</strong>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <button type="button" aria-pressed={value === ''} onClick={() => choose('')}>All properties</button>
        {properties.map((property) => (
          <button type="button" key={property.id} aria-pressed={value === property.id} onClick={() => choose(property.id)}>
            <b>{propertyChipName(property.address)}</b>
            <small>{property.address}</small>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <ProductSelect className={`property-picker-select ${className}`.trim()} aria-label="Property" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All properties</option>
        {properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}
      </ProductSelect>
      <button type="button" className={`property-picker-trigger ${className}`.trim()} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span>{label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {mounted && sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}

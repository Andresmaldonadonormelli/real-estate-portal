'use client';

import Link from 'next/link';
import type { Property } from '@/lib/types';
import type { HistoryTransaction } from '@/lib/financialHistory';
import { formatCurrency } from '@/lib/formatters';
import { leaseRangeLabel, occupancyCounts, occupancyLabel, propertyWatch, unitAttention, type PortfolioUnit, type UnitKind } from '@/lib/portfolioAttention';
import { cashFlowThisMonth, rentThisMonth } from '@/lib/portfolioMonth';

function signedMoney(amount: number) {
  const rounded = Math.round(amount);
  if (rounded > 0) return { text: `+${formatCurrency(rounded)}`, tone: 'positive' as const };
  if (rounded < 0) return { text: formatCurrency(rounded), tone: 'negative' as const };
  return { text: formatCurrency(0), tone: 'zero' as const };
}

function PropertyFace({ property, image, eager = false }: { property: Property; image?: string; eager?: boolean }) {
  return <span className="portfolio-property-identity">
    {image ? <img src={image} alt="" className="portfolio-thumb" width="40" height="40" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" /> : <span className="portfolio-thumb portfolio-thumb-empty" aria-hidden="true" />}
    <span className="portfolio-property-copy">
      <strong>{property.address}</strong>
      <span>{property.city}, {property.state}</span>
    </span>
  </span>;
}

function OccupancyRing({ units }: { units: PortfolioUnit[] }) {
  const { occupied, total } = occupancyCounts(units);
  if (!total) return <span className="portfolio-occupancy">No units</span>;
  const size = 32;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const length = 2 * Math.PI * radius;
  const ratio = occupied / total;
  return <span className="portfolio-occupancy" aria-label={occupancyLabel(units)}>
    <svg className="portfolio-occupancy-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="portfolio-occupancy-track" cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} />
      {ratio > 0 && <circle className="portfolio-occupancy-arc" cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap={ratio < 1 ? 'round' : 'butt'} strokeDasharray={ratio < 1 ? `${length * ratio} ${length}` : undefined} transform={`rotate(-90 ${center} ${center})`} />}
    </svg>
    <span>{occupied}/{total}</span>
  </span>;
}

function statusLabel(kind: UnitKind, label: string, vacancyDays: number | null) {
  if (kind === 'vacant' && vacancyDays !== null) return `Vacant · ${vacancyDays} ${vacancyDays === 1 ? 'day' : 'days'}`;
  return label;
}

export function PropertiesList({ properties, unitsByProperty, transactions, imageUrls }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
  transactions: HistoryTransaction[];
  imageUrls: Record<string, string>;
}) {
  return <div className="portfolio-panel">
    <div className="portfolio-panel-head"><strong>Properties</strong><span>{properties.length}</span></div>
    <div className="portfolio-columns portfolio-property-grid" aria-hidden="true">
      <span>Property</span>
      <span>Occupancy</span>
      <span>Rent this month</span>
      <span>Net cash flow</span>
      <span>Watch</span>
    </div>
    {properties.map((property, index) => {
      const units = unitsByProperty[property.id] || [];
      const watch = propertyWatch(units);
      const flow = signedMoney(cashFlowThisMonth(transactions, property.id));
      return <Link key={property.id} href={`/properties/${property.id}`} className="portfolio-property-row portfolio-property-grid">
        <PropertyFace property={property} image={imageUrls[property.id]} eager={index === 0} />
        <OccupancyRing units={units} />
        <span className="portfolio-figure">
          <span className="portfolio-figure-label">Rent this month</span>
          <strong>{formatCurrency(rentThisMonth(transactions, property.id))}</strong>
        </span>
        <span className="portfolio-figure">
          <span className="portfolio-figure-label">Net cash flow</span>
          <strong className={flow.tone === 'positive' ? 'amount-positive' : flow.tone === 'negative' ? 'amount-negative' : ''}>{flow.text}</strong>
        </span>
        <span className="portfolio-watch" data-tone={watch.tone}>{watch.label}</span>
      </Link>;
    })}
  </div>;
}

export function UnitsList({ properties, unitsByProperty, imageUrls }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
  imageUrls: Record<string, string>;
}) {
  const rows = properties.flatMap(property => [...(unitsByProperty[property.id] || [])]
    .sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }))
    .map(unit => ({ property, unit })));
  return <div className="portfolio-panel">
    <div className="portfolio-panel-head"><strong>Units</strong><span>{rows.length}</span></div>
    {rows.length ? <>
      <div className="portfolio-columns portfolio-unit-grid" aria-hidden="true">
        <span>Property</span>
        <span>Unit</span>
        <span>Status</span>
        <span>Tenant</span>
        <span>Monthly rent</span>
        <span>Lease</span>
      </div>
      {rows.map(({ property, unit }, index) => {
        const attention = unitAttention(unit);
        return <Link key={unit.id} href={`/properties/${property.id}?tab=units`} className="portfolio-unit-row portfolio-unit-grid">
          <PropertyFace property={property} image={imageUrls[property.id]} eager={index === 0} />
          <span className="portfolio-unit-name">{unit.unit_number}</span>
          <span className="portfolio-unit-status" data-kind={attention.kind}>{statusLabel(attention.kind, attention.label, attention.vacancyDays)}</span>
          <span className="portfolio-unit-tenant">{attention.tenantLabel}</span>
          <span className="portfolio-unit-rent">{formatCurrency(Number(unit.current_rent || 0))}</span>
          <span className="portfolio-unit-lease">{leaseRangeLabel(unit)}</span>
        </Link>;
      })}
    </> : <p className="portfolio-empty">No units yet.</p>}
  </div>;
}

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { Property } from '@/lib/types';
import type { HistoryTransaction } from '@/lib/financialHistory';
import { formatCurrency } from '@/lib/formatters';
import { formatLeaseDate, leaseRangeLabel, nextMortgagePaymentLabel, occupancyCounts, propertyWatch, unitAttention, type PortfolioUnit, type UnitKind } from '@/lib/portfolioAttention';
import { equityOf, moneyOrDash, percentOrDash, propertyTypeLabel, signedTone, trailingCashFlow, monthActivity } from '@/lib/propertyPosition';
import { formatKpiCurrency } from '@/lib/propertyFinancials';

export type PortfolioDocument = {
  id: string;
  property_id: string;
  document_date?: string | null;
  created_at?: string | null;
};

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

function statusLabel(kind: UnitKind, label: string, vacancyDays: number | null) {
  if (kind === 'vacant' && vacancyDays !== null) return `Vacant · ${vacancyDays} ${vacancyDays === 1 ? 'day' : 'days'}`;
  return label;
}

function OccupancyRing({ units }: { units: PortfolioUnit[] }) {
  const { occupied, total } = occupancyCounts(units);
  if (!total) return <span className="portfolio-occupancy">No units</span>;
  const size = 28;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const length = 2 * Math.PI * radius;
  const ratio = occupied / total;
  const label = `${occupied} of ${total} occupied`;
  return <span className="portfolio-occupancy">
    <svg className="portfolio-occupancy-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="portfolio-occupancy-track" cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} />
      {ratio > 0 && <circle className="portfolio-occupancy-arc" cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap={ratio < 1 ? 'round' : 'butt'} strokeDasharray={ratio < 1 ? `${length * ratio} ${length}` : undefined} transform={`rotate(-90 ${center} ${center})`} />}
    </svg>
    <span>{label}</span>
  </span>;
}

function monthName(now = new Date()) {
  return now.toLocaleDateString('en-US', { month: 'long' });
}

function knownRate(rate?: number | null) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)}%`;
}

function knownMoney(value?: number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return formatCurrency(amount);
}

function documentSummary(docs: PortfolioDocument[]) {
  if (!docs.length) return { count: 'No files', latest: '' };
  const latest = docs.reduce((best, doc) => {
    const key = (doc.document_date || doc.created_at || '').slice(0, 10);
    return key > best ? key : best;
  }, '');
  return {
    count: docs.length === 1 ? '1 file' : `${docs.length} files`,
    latest: latest ? formatLeaseDate(latest) : '',
  };
}

function hasMortgage(property: Property) {
  const balance = Number(property.mortgage_balance || 0);
  const payment = Number(property.monthly_mortgage_payment || 0);
  const rate = property.mortgage_interest_rate;
  const hasRate = rate !== null && rate !== undefined && Number.isFinite(Number(rate));
  return balance > 0 || payment > 0 || hasRate || Boolean(property.mortgage_start_date);
}

function Fact({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }) {
  return <div><dt>{label}</dt><dd className={quiet ? 'is-quiet' : undefined}>{value}</dd></div>;
}

function PropertyDetail({ open, id, label, children }: { open: boolean; id: string; label: string; children: ReactNode }) {
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setPresent(true);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        setShown(true);
        return;
      }
      let second = 0;
      const frame = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setPresent(false), reduce ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [open]);
  if (!present) return null;
  return <div className="portfolio-detail-clip" data-open={shown ? 'true' : 'false'}>
    <div id={id} className="portfolio-property-detail" role="region" aria-label={label}>{children}</div>
  </div>;
}

export function PropertiesList({ properties, unitsByProperty, transactions, view }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
  transactions: HistoryTransaction[];
  view: 'cards' | 'table';
}) {
  const rows = properties.map(property => {
    const units = unitsByProperty[property.id] || [];
    const equity = equityOf(property);
    const trailing = trailingCashFlow(transactions, property.id);
    const price = Number(property.purchase_price || 0);
    const month = monthActivity(transactions, property.id).cashFlow;
    return {
      property,
      units: units.length,
      equity,
      month,
      average: trailing / 12,
      cashReturn: price > 0 ? trailing / price : null,
      returnOnEquity: equity != null && equity > 0 ? trailing / equity : null,
    };
  });

  if (view === 'table') {
    return <div className="portfolio-panel property-directory-table">
      <div className="portfolio-columns property-directory-columns" aria-hidden="true">
        <span>Property</span><span>Equity</span><span>Cash flow</span><span>Cash return</span><span>Return on equity</span>
      </div>
      {rows.map(row => <Link key={row.property.id} href={`/properties/${row.property.id}`} className="portfolio-property-row property-directory-row">
        <span className="portfolio-property-copy">
          <strong>{row.property.address}</strong>
          <small>{row.property.city}, {row.property.state} · {propertyTypeLabel(row.property.property_type)} · {row.units} {row.units === 1 ? 'unit' : 'units'}</small>
        </span>
        <span className="portfolio-figure"><span className="portfolio-figure-label">Equity</span><strong>{moneyOrDash(row.equity)}</strong></span>
        <span className="portfolio-figure"><span className="portfolio-figure-label">Cash flow</span><strong className={`property-signed ${signedTone(row.month)}`}>{formatKpiCurrency(row.month)}</strong><small>12-mo avg {formatKpiCurrency(row.average)}</small></span>
        <span className="portfolio-figure"><span className="portfolio-figure-label">Cash return</span><strong>{percentOrDash(row.cashReturn)}</strong></span>
        <span className="portfolio-figure"><span className="portfolio-figure-label">Return on equity</span><strong>{percentOrDash(row.returnOnEquity)}</strong></span>
      </Link>)}
    </div>;
  }

  return <div className="property-directory-cards">
    {rows.map(row => <Link key={row.property.id} href={`/properties/${row.property.id}`} className="property-directory-card">
      <span className="portfolio-property-copy">
        <strong>{row.property.address}</strong>
        <small>{row.property.city}, {row.property.state}</small>
        <small>{propertyTypeLabel(row.property.property_type)} · {row.units} {row.units === 1 ? 'unit' : 'units'}</small>
      </span>
      <dl>
        <div><dt>Equity</dt><dd>{moneyOrDash(row.equity)}</dd></div>
        <div><dt>Cash flow</dt><dd className={`property-signed ${signedTone(row.month)}`}>{formatKpiCurrency(row.month)}</dd><small>12-month average {formatKpiCurrency(row.average)}</small></div>
        <div><dt>Cash return</dt><dd>{percentOrDash(row.cashReturn)}</dd></div>
        <div><dt>Return on equity</dt><dd>{percentOrDash(row.returnOnEquity)}</dd></div>
      </dl>
    </Link>)}
  </div>;
}

export function UnitsList({ properties, unitsByProperty, imageUrls, onAddTenant }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
  imageUrls: Record<string, string>;
  onAddTenant: (property: Property) => void;
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
        const vacant = attention.kind === 'vacant';
        return <div key={unit.id} className="portfolio-unit-row portfolio-unit-grid">
          <Link href={`/properties/${property.id}?tab=units`} className="portfolio-unit-open">
            <PropertyFace property={property} image={imageUrls[property.id]} eager={index === 0} />
            <span className="portfolio-unit-name">{unit.unit_number}</span>
            <span className="portfolio-unit-status" data-kind={attention.kind}>{statusLabel(attention.kind, attention.label, attention.vacancyDays)}</span>
            {vacant ? <span className="portfolio-unit-tenant" /> : <span className="portfolio-unit-tenant">{attention.tenantLabel}</span>}
            <span className="portfolio-unit-rent">{formatCurrency(Number(unit.current_rent || 0))}</span>
            <span className="portfolio-unit-lease">{leaseRangeLabel(unit)}</span>
          </Link>
          {vacant && <button type="button" className="portfolio-unit-tenant-action" onClick={() => onAddTenant(property)}>Add tenant</button>}
        </div>;
      })}
    </> : <p className="portfolio-empty">No units yet.</p>}
  </div>;
}

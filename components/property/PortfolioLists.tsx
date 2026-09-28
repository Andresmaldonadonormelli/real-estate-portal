'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { Property } from '@/lib/types';
import type { HistoryTransaction } from '@/lib/financialHistory';
import { formatCurrency } from '@/lib/formatters';
import { formatLeaseDate, leaseRangeLabel, mortgagePayoffLabel, nextMortgagePaymentLabel, occupancyCounts, propertyWatch, unitAttention, type PortfolioUnit, type UnitKind } from '@/lib/portfolioAttention';
import { cashFlowThisMonth, rentThisMonth } from '@/lib/portfolioMonth';

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

function rateLabel(rate?: number | null) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(rate))}%`;
}

function moneyOrDash(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return formatCurrency(Number(value));
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

export function PropertiesList({ properties, unitsByProperty, transactions, documents, imageUrls, onAddFinancing }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
  transactions: HistoryTransaction[];
  documents: PortfolioDocument[];
  imageUrls: Record<string, string>;
  onAddFinancing: (property: Property) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rentHeading = `${monthName()} rent`;
  const flowHeading = `${monthName()} net cash flow`;
  const docsByProperty = documents.reduce<Record<string, PortfolioDocument[]>>((acc, doc) => {
    (acc[doc.property_id] ||= []).push(doc);
    return acc;
  }, {});

  return <div className="portfolio-panel">
    <div className="portfolio-panel-head"><strong>Properties</strong><span>{properties.length}</span></div>
    <div className="portfolio-columns portfolio-property-grid" aria-hidden="true">
      <span>Property</span>
      <span>Units</span>
      <span>{rentHeading}</span>
      <span>{flowHeading}</span>
      <span>Watch</span>
      <span />
    </div>
    {properties.map((property, index) => {
      const units = [...(unitsByProperty[property.id] || [])].sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
      const watch = propertyWatch(units);
      const flow = signedMoney(cashFlowThisMonth(transactions, property.id));
      const open = expandedId === property.id;
      const detailId = `property-detail-${property.id}`;
      const docs = documentSummary(docsByProperty[property.id] || []);
      const acquired = formatLeaseDate(property.purchase_date);
      const financed = hasMortgage(property);
      return <div key={property.id} className="portfolio-property-block">
        <button type="button" className="portfolio-property-row portfolio-property-grid" aria-expanded={open} aria-controls={detailId} onClick={() => setExpandedId(current => current === property.id ? null : property.id)}>
          <PropertyFace property={property} image={imageUrls[property.id]} eager={index === 0} />
          <OccupancyRing units={units} />
          <span className="portfolio-figure">
            <span className="portfolio-figure-label">{rentHeading}</span>
            <strong>{formatCurrency(rentThisMonth(transactions, property.id))}</strong>
          </span>
          <span className="portfolio-figure">
            <span className="portfolio-figure-label">{flowHeading}</span>
            <strong className={flow.tone === 'positive' ? 'amount-positive' : flow.tone === 'negative' ? 'amount-negative' : ''}>{flow.text}</strong>
          </span>
          <span className="portfolio-watch" data-tone={watch.tone}>{watch.label}</span>
          <ChevronDown className="portfolio-row-chevron" size={16} aria-hidden="true" />
        </button>
        {open && <div id={detailId} className="portfolio-property-detail" role="region" aria-label={`${property.address} details`}>
          <section className="portfolio-detail-col portfolio-detail-units">
            <h3>Units</h3>
            {units.length ? units.map(unit => {
              const attention = unitAttention(unit);
              const leaseEnd = formatLeaseDate(unit.lease_end_date);
              return <div key={unit.id} className="portfolio-detail-unit">
                <div className="portfolio-detail-unit-top">
                  <strong>{unit.unit_number}</strong>
                  <span className="portfolio-unit-status" data-kind={attention.kind}>{statusLabel(attention.kind, attention.label, attention.vacancyDays)}</span>
                </div>
                <span className="portfolio-unit-tenant">{attention.tenantLabel}</span>
                <span className="portfolio-detail-unit-meta">{formatCurrency(Number(unit.current_rent || 0))}{leaseEnd ? ` · Ends ${leaseEnd}` : ''}</span>
              </div>;
            }) : <p className="portfolio-detail-empty">No units yet.</p>}
          </section>
          <section className="portfolio-detail-col">
            <h3>Mortgage</h3>
            {financed ? <dl className="portfolio-facts">
              <Fact label="Balance" value={formatCurrency(Number(property.mortgage_balance || 0))} />
              <Fact label="Interest rate" value={rateLabel(property.mortgage_interest_rate)} />
              <Fact label="Monthly payment" value={moneyOrDash(property.monthly_mortgage_payment)} />
              <Fact label="Next payment" value={nextMortgagePaymentLabel(property.mortgage_start_date)} />
              <Fact label="Payoff" value={mortgagePayoffLabel(property.mortgage_start_date, property.mortgage_term_years)} />
            </dl> : <>
              <p className="portfolio-detail-empty">Mortgage details not added</p>
              <button type="button" className="portfolio-detail-action" onClick={() => onAddFinancing(property)}>Add financing</button>
            </>}
          </section>
          <section className="portfolio-detail-col">
            <h3>Property details</h3>
            <dl className="portfolio-facts">
              <Fact label="Property manager" value="Not added" quiet />
              <Fact label="Ownership entity" value="Not added" quiet />
              <Fact label="Acquired" value={acquired || 'Not added'} quiet={!acquired} />
              {property.purchase_price != null && <Fact label="Purchase price" value={formatCurrency(Number(property.purchase_price))} />}
            </dl>
            <p className="portfolio-doc-line">
              <span>Documents</span>
              <span aria-hidden="true">·</span>
              <span>{docs.count}</span>
              {docs.latest && <><span aria-hidden="true">·</span><span>Latest {docs.latest}</span></>}
              <span aria-hidden="true">·</span>
              <Link href={`/properties/${property.id}?tab=documents`}>View documents</Link>
            </p>
          </section>
        </div>}
      </div>;
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

'use client';

import Link from 'next/link';
import type { Property } from '@/lib/types';
import type { HistoryTransaction } from '@/lib/financialHistory';
import { formatCurrency } from '@/lib/formatters';
import { leaseRangeLabel, occupancyLabel, propertyWatch, unitAttention, type PortfolioUnit } from '@/lib/portfolioAttention';
import { cashFlowThisMonth, rentThisMonth } from '@/lib/portfolioMonth';

function signedMoney(amount: number) {
  const rounded = Math.round(amount);
  if (rounded > 0) return { text: `+${formatCurrency(rounded)}`, tone: 'positive' as const };
  if (rounded < 0) return { text: formatCurrency(rounded), tone: 'negative' as const };
  return { text: formatCurrency(0), tone: 'zero' as const };
}

export function PropertiesList({ properties, unitsByProperty, transactions, imageUrls }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
  transactions: HistoryTransaction[];
  imageUrls: Record<string, string>;
}) {
  return <div className="portfolio-list">
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
      const image = imageUrls[property.id];
      return <Link key={property.id} href={`/properties/${property.id}`} className="portfolio-property-row portfolio-property-grid">
        <span className="portfolio-property-identity">
          {image ? <img src={image} alt="" className="portfolio-thumb" width="40" height="40" loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" /> : <span className="portfolio-thumb portfolio-thumb-empty" aria-hidden="true" />}
          <span className="portfolio-property-copy">
            <strong>{property.address}</strong>
            <span>{property.city}, {property.state}</span>
          </span>
        </span>
        <span className="portfolio-occupancy">{occupancyLabel(units)}</span>
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

export function UnitsList({ properties, unitsByProperty }: {
  properties: Property[];
  unitsByProperty: Record<string, PortfolioUnit[]>;
}) {
  const groups = properties.map(property => ({
    property,
    units: [...(unitsByProperty[property.id] || [])].sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })),
  })).filter(group => group.units.length > 0);
  if (!groups.length) return <p className="portfolio-empty">No units yet.</p>;
  return <div className="portfolio-list">
    <div className="portfolio-columns portfolio-unit-grid" aria-hidden="true">
      <span>Unit</span>
      <span>Status</span>
      <span>Tenant</span>
      <span>Monthly rent</span>
      <span>Lease</span>
    </div>
    {groups.map(group => <section key={group.property.id} className="portfolio-group">
      <h2 className="portfolio-group-title"><span>{group.property.address}</span><small>{group.property.city}, {group.property.state}</small></h2>
      {group.units.map(unit => {
        const attention = unitAttention(unit);
        const days = attention.kind === 'vacant' && attention.vacancyDays !== null ? `${attention.vacancyDays} ${attention.vacancyDays === 1 ? 'day' : 'days'}` : '';
        return <Link key={unit.id} href={`/properties/${group.property.id}?tab=units`} className="portfolio-unit-row portfolio-unit-grid">
          <span className="portfolio-unit-name">{unit.unit_number}</span>
          <span className="portfolio-unit-state">
            <span className="portfolio-unit-status" data-kind={attention.kind}>{attention.label}</span>
            {days ? <span className="portfolio-unit-days">{days}</span> : null}
          </span>
          <span className="portfolio-unit-tenant">{attention.tenantLabel}</span>
          <span className="portfolio-unit-rent">{formatCurrency(Number(unit.current_rent || 0))}</span>
          <span className="portfolio-unit-lease">{leaseRangeLabel(unit)}</span>
        </Link>;
      })}
    </section>)}
  </div>;
}

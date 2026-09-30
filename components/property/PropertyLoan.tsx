'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate, formatKpiCurrency } from '@/lib/propertyFinancials';
import { emptyProfile, escrowYear, originalLoan, type PropertyProfile } from '@/lib/propertyProfile';
import { calendarPayoff, moneyOrDash, nextPaymentParts, payoffModel, percentOrDash } from '@/lib/propertyPosition';
import type { Property } from '@/lib/types';

export default function PropertyLoan({ property, profile = emptyProfile() }: { property: Property; profile?: PropertyProfile }) {
  const balance = Number(property.mortgage_balance || 0);
  const rate = Number(property.mortgage_interest_rate || 0);
  const parts = nextPaymentParts(property);
  const payoff = calendarPayoff(property);
  const model = payoffModel(property);
  const value = Number(profile.estimated_value || 0);
  const ltv = value > 0 ? balance / value : null;
  const escrow = escrowYear(property, profile);
  const original = originalLoan(property, profile);
  const hasLoan = balance > 0 || parts.total > 0;
  const [showAllYears, setShowAllYears] = useState(false);
  const visibleYears = showAllYears ? payoff.rows : payoff.rows.slice(0, 5);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const previousMonth = new Date();
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const previousLabel = previousMonth.toLocaleDateString('en-US', { month: 'short' });

  return <div className="property-stack">
    <section className="property-module property-loan-hero">
      {hasLoan ? <>
        <div className="property-loan-top">
          <div>
            <h2>Current loan</h2>
            {profile.lender ? <p className="property-module-note">{profile.lender}</p> : null}
            <p className="property-series-label">Balance today</p>
            <strong className="property-position-value">{formatKpiCurrency(balance)}</strong>
            {payoff.yearEndBalance != null ? <p className="property-module-note">As of {monthLabel}, after the {previousLabel} payment. {payoff.monthsLeft} more {payoff.monthsLeft === 1 ? 'payment takes' : 'payments take'} it to {formatKpiCurrency(payoff.yearEndBalance)} by Dec 31, the {new Date().getFullYear()} row below.</p> : null}
          </div>
          <aside className="property-loan-breakdown">
            <p className="property-kicker">Next payment · {monthLabel}</p>
            <div><span>Principal</span><strong>{formatKpiCurrency(parts.principal)}</strong></div>
            <div><span>Interest</span><strong>{formatKpiCurrency(parts.interest)}</strong></div>
            <div><span>Escrow</span><strong>{formatKpiCurrency(parts.escrow)}</strong></div>
            <div><span>Fees and other</span><strong>{formatKpiCurrency(parts.fees)}</strong></div>
            <div className="is-total"><span>Payment</span><strong>{formatKpiCurrency(parts.total)}</strong></div>
            <small>Your payment is what you entered from your lender; the rate gives the principal and interest.</small>
          </aside>
        </div>
        <div className="property-loan-stats">
          <div><span>Paid off by</span><strong>{model?.payoffLabel || '—'}</strong><small>{model?.payoffMonth ? `${model.payoffMonth} payments left` : 'Add a rate and payment'}</small></div>
          <div><span>Loan-to-value</span><strong>{percentOrDash(ltv)}</strong><small>{value > 0 ? `Of a ${formatKpiCurrency(value)} value` : 'No value saved'}</small></div>
          <div><span>Rate</span><strong>{rate > 0 ? `${rate}%${profile.rate_type ? ` ${profile.rate_type.toLowerCase()}` : ''}` : '—'}</strong><small>Since purchase</small></div>
        </div>
      </> : <><h2>Current loan</h2><p className="property-module-note">No mortgage is saved for this property. Edit the property to add one.</p></>}
    </section>

    <section className="property-module">
      <div className="property-module-head">
        <div>
          <h2>Escrow account</h2>
          <p className="property-module-note">Your lender holds part of each payment and pays your property tax and insurance from it, so they’re never missed.</p>
        </div>
        <Link href={`/properties/${property.id}/edit#financing`} className="property-secondary-action">Add from your statement</Link>
      </div>
      <div className="property-loan-stats">
        <div><span>Into escrow each month</span><strong>{formatKpiCurrency(escrow.monthly)}</strong><small>From your statement</small></div>
        <div><span>Paid in, {new Date().getFullYear()}</span><strong>{formatKpiCurrency(escrow.paidIn)}</strong><small>{escrow.months ? `${escrow.months} ${escrow.months === 1 ? 'month' : 'months'}` : 'Nothing yet this year'}</small></div>
        <div><span>Paid out, {new Date().getFullYear()}</span><strong>{formatKpiCurrency(escrow.paidOut)}</strong><small>{escrow.paidOut > 0 ? 'From your statement' : 'Nothing yet this year'}</small></div>
        <div><span>Balance</span><strong>{profile.escrow_balance == null ? 'Not entered' : formatKpiCurrency(profile.escrow_balance)}</strong><small>Add it from your statement</small></div>
      </div>
      {escrow.paidIn > escrow.paidOut ? <p className="property-module-note">This year {formatKpiCurrency(escrow.paidIn - escrow.paidOut)} more went in than was paid out: it stays in the account for the next bills.</p> : null}
    </section>

    <section className="property-module">
      <h2>Payoff by year</h2>
      <p className="property-module-note">What you pay each year and what’s left on Dec 31. Whole loan, in USD.</p>
      {visibleYears.length ? <>
        <div className="property-table-scroll">
          <table>
            <thead><tr><th>Year</th><th>Principal</th><th>Interest</th><th>Year-end balance</th></tr></thead>
            <tbody>
              {visibleYears.map(row => <tr key={row.year}>
                <td>{row.year}{row.current ? ' this year' : ''}</td>
                <td>{formatKpiCurrency(row.principal)}</td>
                <td>{formatKpiCurrency(row.interest)}</td>
                <td>{formatKpiCurrency(row.balance)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {payoff.rows.length > 5 ? <button type="button" className="property-secondary-action" onClick={() => setShowAllYears(open => !open)}>{showAllYears ? 'Show fewer years' : `Show all ${payoff.rows.length} years`}</button> : null}
      </> : <p className="property-module-note">Add a balance, interest rate, and payment to estimate the payoff.</p>}
    </section>

    <section className="property-module">
      <div className="property-module-head">
        <div>
          <h2>Financing history</h2>
          <p className="property-module-note">The original loan and each renewal or refinance that replaced it.</p>
        </div>
        <Link href={`/properties/${property.id}/edit#refinances`} className="property-secondary-action">Add renewal or refinance</Link>
      </div>
      <div className="property-finance-list">
        <div>
          <span>{property.mortgage_start_date ? formatDate(property.mortgage_start_date) : 'Start date not saved'} · Purchase loan</span>
          <small>{[profile.financing_type, rate > 0 ? `${rate}%${profile.rate_type ? ` ${profile.rate_type.toLowerCase()}` : ''}` : ''].filter(Boolean).join(' · ') || 'Loan details not saved'}</small>
          <strong>{moneyOrDash(original ?? (balance > 0 ? balance : null))}</strong>
        </div>
        {profile.refinances.map(item => <div key={item.id}>
          <span>{item.date ? formatDate(item.date) : 'Refinance'}</span>
          <small>{[item.financing_type, item.rate ? `${item.rate}%` : '', item.lender].filter(Boolean).join(' · ') || 'Refinance'}</small>
          <strong>{formatKpiCurrency(Number(item.balance || 0))}</strong>
        </div>)}
      </div>
      {!profile.refinances.length ? <p className="property-module-note">No renewals or refinances yet. Add one when your rate or term changes, or when you take cash out.</p> : null}
    </section>
  </div>;
}


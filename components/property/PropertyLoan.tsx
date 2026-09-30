'use client';

import { formatDate, formatKpiCurrency } from '@/lib/propertyFinancials';
import { moneyOrDash, payoffModel, percentOrDash } from '@/lib/propertyPosition';
import type { Property } from '@/lib/types';

export default function PropertyLoan({ property }: { property: Property }) {
  const balance = Number(property.mortgage_balance || 0);
  const price = Number(property.purchase_price || 0);
  const rate = Number(property.mortgage_interest_rate || 0);
  const model = payoffModel(property);
  const ltv = price > 0 ? balance / price : null;
  const payment = Number(property.monthly_mortgage_payment || 0);
  const principal = Number(property.mortgage_principal_interest_payment || 0);
  const escrow = Number(property.mortgage_escrow_amount || 0);
  const pmi = Number(property.mortgage_pmi_amount || 0);

  return <div className="property-stack">
    <section className="property-module">
      <h2>Loan</h2>
      {balance <= 0 && payment <= 0 ? <p className="property-module-note">No mortgage is saved for this property. Edit the property to add one.</p> : <dl className="property-fact-grid">
        <Fact label="Balance" value={moneyOrDash(balance)} />
        <Fact label="Rate" value={rate > 0 ? `${rate}%` : '—'} />
        <Fact label="Payment" value={payment > 0 ? `${formatKpiCurrency(payment)}/mo` : '—'} />
        {principal > 0 && <Fact label="Principal and interest" value={`${formatKpiCurrency(principal)}/mo`} />}
        {escrow > 0 && <Fact label="Escrow" value={`${formatKpiCurrency(escrow)}/mo`} />}
        {pmi > 0 && <Fact label="PMI" value={`${formatKpiCurrency(pmi)}/mo`} />}
        <Fact label="Start date" value={property.mortgage_start_date ? formatDate(property.mortgage_start_date) : '—'} />
        <Fact label="Term" value={property.mortgage_term_years ? `${property.mortgage_term_years} years` : '—'} />
        <Fact label="Estimated payoff" value={model?.payoffLabel || '—'} />
        <Fact label="Loan to value" value={percentOrDash(ltv)} />
      </dl>}
    </section>
    <section className="property-module">
      <h2>Property</h2>
      <dl className="property-fact-grid">
        <Fact label="Purchase price" value={moneyOrDash(price > 0 ? price : null)} />
        <Fact label="Purchased" value={property.purchase_date ? formatDate(property.purchase_date) : '—'} />
      </dl>
    </section>
    <section className="property-module">
      <h2>Payoff schedule</h2>
      {model?.schedule.length ? <div className="property-table-scroll">
        <table>
          <thead><tr><th>Year</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
          <tbody>
            {model.schedule.map(row => <tr key={row.year}>
              <td>{row.year}</td>
              <td>{formatKpiCurrency(row.principal)}</td>
              <td>{formatKpiCurrency(row.interest)}</td>
              <td>{formatKpiCurrency(row.balance)}</td>
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="property-module-note">Add a balance, interest rate, and payment to estimate the payoff.</p>}
    </section>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

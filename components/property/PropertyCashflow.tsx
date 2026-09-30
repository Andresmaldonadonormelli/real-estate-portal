'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { ProductSelect } from '@/components/common/ProductControls';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { cashFlowYears, monthActivity, signedTone } from '@/lib/propertyPosition';
import type { HistoryTransaction } from '@/lib/financialHistory';
import type { Property } from '@/lib/types';

type LedgerUnit = { occupied?: boolean | null; current_rent?: number | null };

export default function PropertyCashflow({ property, units, transactions }: {
  property: Property;
  units: LedgerUnit[];
  transactions: HistoryTransaction[];
}) {
  const now = useMemo(() => new Date(), []);
  const years = useMemo(() => {
    const values = new Set(cashFlowYears(transactions, property.id, now));
    const purchase = parseDay(property.purchase_date) || parseDay(property.created_at);
    if (purchase) values.add(purchase.getFullYear());
    return [...values].sort((a, b) => b - a);
  }, [transactions, property.id, property.purchase_date, property.created_at, now]);
  const [year, setYear] = useState(years[0]);
  const [help, setHelp] = useState(false);
  const rows = useMemo(() => ledgerMonths(property, units, transactions, year, now), [property, units, transactions, year, now]);
  const entered = rows.filter(row => row.entered).length;
  const cashFlow = rows.reduce((sum, row) => sum + row.cashFlow, 0);
  const totals = rows.reduce((sum, row) => ({
    income: sum.income + row.income,
    expenses: sum.expenses + row.expenses,
    mortgage: sum.mortgage + row.mortgage,
    cashFlow: sum.cashFlow + row.cashFlow,
  }), { income: 0, expenses: 0, mortgage: 0, cashFlow: 0 });

  return <section className="property-module property-cashflow">
    <div className="property-module-head">
      <div>
        <h2>Monthly ledger <button type="button" className="property-ledger-info" aria-label="How months are counted" aria-expanded={help} aria-controls="monthly-ledger-help" onClick={() => setHelp(open => !open)}><Info size={14} /></button></h2>
        <p className="property-module-note" id="monthly-ledger-help">Month by month. Months you haven&apos;t entered are estimated from your typical month.</p>
        {help ? <p className="property-module-note">An entered month has at least one posted transaction. Anything else uses occupied rent minus the saved mortgage payment.</p> : null}
      </div>
      <div className="property-module-tools">
        <ProductSelect aria-label="Cash flow year" value={String(year)} onChange={event => setYear(Number(event.target.value))}>
          {years.map(value => <option key={value} value={value}>{value}</option>)}
        </ProductSelect>
        <Link href={`/ledger?property=${property.id}`}>Open ledger</Link>
      </div>
    </div>
    <p className="property-ledger-kicker">{year === now.getFullYear() ? `${year} so far` : year}</p>
    <strong className={`property-ledger-total property-signed ${signedTone(cashFlow)}`}>{signed(cashFlow)}</strong>
    <p className="property-module-note">{entered} of {rows.length} months entered.</p>
    <div className="property-table-scroll">
      <table>
        <thead>
          <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Mortgage</th><th>Cash flow</th></tr>
        </thead>
        <tbody>
          {rows.length ? rows.map(row => <tr key={row.key}>
            <td>{row.label} <em className={`property-ledger-status ${row.entered ? 'is-entered' : 'is-estimated'}`}>{row.entered ? 'entered' : 'estimated'}</em></td>
            <td>{formatKpiCurrency(row.income)}</td>
            <td>{formatKpiCurrency(row.expenses)}</td>
            <td>{formatKpiCurrency(row.mortgage)}</td>
            <td className={`property-signed ${signedTone(row.cashFlow)}`}>{signed(row.cashFlow)}</td>
          </tr>) : <tr><td colSpan={5}>No finished month yet.</td></tr>}
        </tbody>
        {rows.length ? <tfoot>
          <tr>
            <th>Total</th>
            <td>{formatKpiCurrency(totals.income)}</td>
            <td>{formatKpiCurrency(totals.expenses)}</td>
            <td>{formatKpiCurrency(totals.mortgage)}</td>
            <td className={`property-signed ${signedTone(totals.cashFlow)}`}>{signed(totals.cashFlow)}</td>
          </tr>
        </tfoot> : null}
      </table>
    </div>
  </section>;
}

function ledgerMonths(property: Property, units: LedgerUnit[], transactions: HistoryTransaction[], year: number, now: Date) {
  const purchase = parseDay(property.purchase_date) || parseDay(property.created_at);
  const startMonth = purchase && purchase.getFullYear() > year ? 12 : purchase && purchase.getFullYear() === year ? purchase.getMonth() : 0;
  const endMonth = year < now.getFullYear() ? 11 : year === now.getFullYear() ? now.getMonth() - 1 : -1;
  const rent = units.filter(unit => unit.occupied).reduce((sum, unit) => sum + Number(unit.current_rent || 0), 0);
  const payment = Number(property.monthly_mortgage_payment || 0);
  const rows = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    const date = new Date(year, month, 1);
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const posted = transactions.some(tx => (tx.status || 'posted') === 'posted' && tx.type !== 'transfer' && tx.property_id === property.id && tx.transaction_date.startsWith(key));
    const activity = posted ? monthActivity(transactions, property.id, date) : null;
    rows.push({
      key,
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      entered: posted,
      income: activity ? activity.cashFlow + activity.expenses + activity.mortgage : rent,
      expenses: activity ? activity.expenses : 0,
      mortgage: activity ? activity.mortgage : payment,
      cashFlow: activity ? activity.cashFlow : rent - payment,
    });
  }
  return rows.reverse();
}

function signed(value: number) {
  const text = formatKpiCurrency(Math.abs(value));
  if (value > 0.5) return `+${text}`;
  if (value < -0.5) return `-${text}`;
  return formatKpiCurrency(0);
}

function parseDay(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

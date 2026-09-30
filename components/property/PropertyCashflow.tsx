'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProductSelect } from '@/components/common/ProductControls';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { cashFlowYear, cashFlowYears, signedTone, type CashFlowMonth } from '@/lib/propertyPosition';
import type { HistoryTransaction } from '@/lib/financialHistory';

export default function PropertyCashflow({ propertyId, transactions }: { propertyId: string; transactions: HistoryTransaction[] }) {
  const years = useMemo(() => cashFlowYears(transactions, propertyId), [transactions, propertyId]);
  const [year, setYear] = useState(years[0]);
  const rows = useMemo(() => cashFlowYear(transactions, propertyId, year), [transactions, propertyId, year]);
  const totals = rows.reduce<CashFlowMonth>((sum, row) => ({
    key: 'total',
    label: 'Year',
    income: sum.income + row.income,
    expenses: sum.expenses + row.expenses,
    mortgage: sum.mortgage + row.mortgage,
    cashFlow: sum.cashFlow + row.cashFlow,
  }), { key: 'total', label: 'Year', income: 0, expenses: 0, mortgage: 0, cashFlow: 0 });

  return <section className="property-module property-cashflow">
    <div className="property-module-head">
      <h2>Cash flow</h2>
      <div className="property-module-tools">
        <ProductSelect aria-label="Cash flow year" value={String(year)} onChange={event => setYear(Number(event.target.value))}>
          {years.map(value => <option key={value} value={value}>{value}</option>)}
        </ProductSelect>
        <Link href={`/ledger?property=${propertyId}`}>Open ledger</Link>
      </div>
    </div>
    <div className="property-table-scroll">
      <table>
        <thead>
          <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Mortgage</th><th>Cash flow</th></tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.key}>
            <td>{row.label}</td>
            <td>{formatKpiCurrency(row.income)}</td>
            <td>{formatKpiCurrency(row.expenses)}</td>
            <td>{formatKpiCurrency(row.mortgage)}</td>
            <td className={`property-signed ${signedTone(row.cashFlow)}`}>{formatKpiCurrency(row.cashFlow)}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr>
            <th>Year</th>
            <td>{formatKpiCurrency(totals.income)}</td>
            <td>{formatKpiCurrency(totals.expenses)}</td>
            <td>{formatKpiCurrency(totals.mortgage)}</td>
            <td className={`property-signed ${signedTone(totals.cashFlow)}`}>{formatKpiCurrency(totals.cashFlow)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>;
}

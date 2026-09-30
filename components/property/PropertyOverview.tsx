'use client';

import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/components/common/ProductControls';
import FinancialHistoryChart from '@/components/charts/FinancialHistoryChart';
import PositionChart from '@/components/property/PositionChart';
import { buildMonthlyFinancialHistory, type HistoryPeriod, type HistoryTransaction } from '@/lib/financialHistory';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { occupancyCounts } from '@/lib/portfolioAttention';
import {
  cashFlowThisYear,
  equityOf,
  investorNumbers,
  moneyOrDash,
  monthActivity,
  nextLeaseLabel,
  payoffModel,
  percentOrDash,
  ratioOrDash,
  signedTone,
  upcomingLeases,
} from '@/lib/propertyPosition';
import type { Property, Unit } from '@/lib/types';

type Series = 'equity' | 'debt';
type Path = 'to-date' | 'payoff';
type LeaseUnit = Unit & { lease_end_date?: string | null };

const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '9M', label: '9M' },
  { value: '1Y', label: '1Y' },
];

export default function PropertyOverview({ property, units, transactions }: {
  property: Property;
  units: Unit[];
  transactions: HistoryTransaction[];
}) {
  const [series, setSeries] = useState<Series>('equity');
  const [path, setPath] = useState<Path>('to-date');
  const [period, setPeriod] = useState<HistoryPeriod>('1Y');
  const [flowPeriod, setFlowPeriod] = useState<HistoryPeriod>('1Y');
  const leaseUnits = units as LeaseUnit[];
  const occupancy = occupancyCounts(leaseUnits);
  const equity = equityOf(property);
  const debt = Number(property.mortgage_balance || 0);
  const price = Number(property.purchase_price || 0);
  const model = useMemo(() => payoffModel(property), [property]);
  const numbers = useMemo(() => investorNumbers(property, transactions), [property, transactions]);
  const month = useMemo(() => monthActivity(transactions, property.id), [transactions, property.id]);
  const yearFlow = useMemo(() => cashFlowThisYear(transactions, property.id), [transactions, property.id]);
  const comingUp = useMemo(() => upcomingLeases(leaseUnits), [leaseUnits]);
  const history = useMemo(() => buildMonthlyFinancialHistory(transactions, flowPeriod, property.id), [transactions, flowPeriod, property.id]);
  const current = series === 'equity' ? equity : debt;
  const payoffPoints = series === 'equity' ? model?.equity : model?.debt;

  return <div className="property-stack">
    <section className="property-module property-position">
      <div className="property-position-main">
        <div className="property-position-switches">
          <SegmentedControl value={series} onChange={setSeries} label="Chart series" options={[{ value: 'equity', label: 'Equity' }, { value: 'debt', label: 'Debt' }]} />
          <SegmentedControl value={path} onChange={setPath} label="Chart range" options={[{ value: 'to-date', label: 'To date' }, { value: 'payoff', label: 'Payoff path' }]} />
        </div>
        <p className="property-kicker">{series === 'equity' ? 'Equity' : 'Debt'}</p>
        <strong className={`property-position-value property-signed ${signedTone(current)}`}>{moneyOrDash(current)}</strong>
        {path === 'to-date' ? <div className="position-chart-empty"><span>{period} view uses the saved {series === 'equity' ? 'equity' : 'balance'}. Earlier balances are not stored, so this does not draw a trend.</span></div> : payoffPoints ? <PositionChart points={payoffPoints} label={`${series} payoff path`} /> : <div className="position-chart-empty"><span>{series === 'equity' && price <= 0 ? 'Add a purchase price to chart equity.' : 'Add a balance, rate, and payment to chart the payoff path.'}</span></div>}
        {path === 'to-date' && <div className="property-chart-periods" role="group" aria-label="Equity and debt period">
          {PERIODS.map(option => <button key={option.value} type="button" className={period === option.value ? 'active' : ''} onClick={() => setPeriod(option.value)}>{option.label}</button>)}
        </div>}
      </div>
      <dl className="property-position-side">
        <div><dt>Cash flow</dt><dd className={`property-signed ${signedTone(yearFlow)}`}>{formatKpiCurrency(yearFlow)}</dd><small>This year</small></div>
        <div><dt>Loan balance</dt><dd>{moneyOrDash(debt > 0 ? debt : null)}</dd></div>
        <div><dt>Cash in the deal</dt><dd>{moneyOrDash(price > 0 ? price : null)}</dd><small>Purchase price</small></div>
      </dl>
    </section>

    <section className="property-module">
      <h2>Investor numbers</h2>
      <div className="property-stat-row">
        <Stat label="DSCR" value={numbers.dscr == null ? '—' : `${ratioOrDash(numbers.dscr)}×`} />
        <Stat label="Return on equity" value={percentOrDash(numbers.returnOnEquity)} />
        <Stat label="Cash return" value={percentOrDash(numbers.cashReturn)} />
      </div>
      <p className="property-module-note">Returns use the last 12 months of posted cash flow. DSCR uses operating income and mortgage payments from that same window.</p>
    </section>

    <section className="property-module property-status-line">
      <span>{occupancy.total ? `${occupancy.occupied} of ${occupancy.total} occupied` : 'No units'}</span>
      <span>{nextLeaseLabel(leaseUnits)}</span>
    </section>

    <section className="property-module">
      <h2>This month</h2>
      <div className="property-stat-row">
        <Stat label="Rent" value={formatKpiCurrency(month.rent)} />
        <Stat label="Expenses" value={formatKpiCurrency(month.expenses)} />
        <Stat label="Mortgage" value={formatKpiCurrency(month.mortgage)} />
        <Stat label="Cash flow" value={formatKpiCurrency(month.cashFlow)} tone={signedTone(month.cashFlow)} />
      </div>
    </section>

    <section className="property-module">
      <h2>Coming up</h2>
      {comingUp.length ? <ul className="property-coming-list">
        {comingUp.map(item => <li key={`${item.unit}-${item.label}`}><span>{item.unit}{item.tenant ? ` · ${item.tenant}` : ''}</span><strong>Lease ends {item.label}</strong></li>)}
      </ul> : <p className="property-module-note">Nothing coming up in the next 90 days.</p>}
    </section>

    <section className="property-module property-flow-chart">
      <div className="property-module-head">
        <h2>Cash flow</h2>
        <div className="property-chart-periods" role="group" aria-label="Cash flow period">
          {PERIODS.map(option => <button key={option.value} type="button" className={flowPeriod === option.value ? 'active' : ''} onClick={() => setFlowPeriod(option.value)}>{option.label}</button>)}
        </div>
      </div>
      <FinancialHistoryChart rows={history} label="Monthly cash flow" />
    </section>
  </div>;
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div><span>{label}</span><strong className={tone ? `property-signed ${tone}` : ''}>{value}</strong></div>;
}

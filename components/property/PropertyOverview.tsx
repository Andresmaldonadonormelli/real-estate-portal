'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import FinancialHistoryChart from '@/components/charts/FinancialHistoryChart';
import PositionChart from '@/components/property/PositionChart';
import { buildMonthlyFinancialHistory, type HistoryPeriod, type HistoryTransaction } from '@/lib/financialHistory';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { occupancyCounts } from '@/lib/portfolioAttention';
import { cashInDeal, currentEquity, emptyProfile, loanPaidDown, valueChange, type PropertyProfile } from '@/lib/propertyProfile';
import {
  cashFlowThisYear,
  investorNumbers,
  latestYearCashFlow,
  monthActivity,
  monthsEntered,
  nextLeaseStatus,
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

export default function PropertyOverview({ property, units, transactions, profile = emptyProfile() }: {
  property: Property;
  units: Unit[];
  transactions: HistoryTransaction[];
  profile?: PropertyProfile;
}) {
  const [series, setSeries] = useState<Series>('equity');
  const [path, setPath] = useState<Path>('to-date');
  const [period, setPeriod] = useState<HistoryPeriod>('1Y');
  const [flowPeriod, setFlowPeriod] = useState<HistoryPeriod>('1Y');
  const [showInvestors, setShowInvestors] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const leaseUnits = units as LeaseUnit[];
  const occupancy = occupancyCounts(leaseUnits);
  const leaseStatus = useMemo(() => nextLeaseStatus(leaseUnits), [leaseUnits]);
  const tracking = useMemo(() => monthsEntered(transactions, property.id, property.created_at), [transactions, property.id, property.created_at]);
  const occupancyLabel = !occupancy.total ? 'No units' : occupancy.occupied === occupancy.total ? 'Fully occupied' : occupancy.occupied === 0 ? 'Vacant' : 'Partially occupied';
  const occupancyDetail = !occupancy.total ? 'No units' : occupancy.total === 1 ? '1 unit' : `${occupancy.total} units`;
  const equity = currentEquity(property, profile);
  const debt = Number(property.mortgage_balance || 0);
  const price = Number(property.purchase_price || 0);
  const deal = cashInDeal(profile);
  const dealAmount = deal > 0 ? deal : price;
  const value = Number(profile.estimated_value || 0);
  const ltv = value > 0 ? debt / value : null;
  const model = useMemo(() => payoffModel(property, value > 0 ? value : null), [property, value]);
  const numbers = useMemo(() => investorNumbers(property, transactions), [property, transactions]);
  const yearFlow = useMemo(() => cashFlowThisYear(transactions, property.id), [transactions, property.id]);
  const latestMonth = useMemo(() => latestYearCashFlow(transactions, property.id), [transactions, property.id]);
  const comingUp = useMemo(() => upcomingLeases(leaseUnits), [leaseUnits]);
  const history = useMemo(() => buildMonthlyFinancialHistory(transactions, flowPeriod, property.id), [transactions, flowPeriod, property.id]);
  const lastMonthDate = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return date;
  }, []);
  const lastMonth = useMemo(() => monthActivity(transactions, property.id, lastMonthDate), [transactions, property.id, lastMonthDate]);
  const current = series === 'equity' ? equity : (debt > 0 ? debt : null);
  const headline = formatKpiCurrency(current ?? 0);
  const payoffPoints = series === 'equity' ? model?.equity : model?.debt;
  const lastLabel = lastMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return <div className="property-stack">
    <section className="property-module property-position">
      <div className="property-position-layout">
        <div className="property-position-main">
          <div className="property-position-top">
            <div>
              <p className="property-kicker">This property</p>
              <p className="property-series-label">{series === 'equity' ? 'Your equity' : 'Loan balance'}</p>
              <strong className={`property-position-value property-signed ${signedTone(current)}`}>{headline}</strong>
            </div>
            <PillGroup label="Chart series" value={series} onChange={setSeries} options={[{ value: 'equity', label: 'Equity' }, { value: 'debt', label: 'Debt' }]} />
          </div>
          <div className="property-position-plot">
            {path === 'payoff' && payoffPoints ? <PositionChart points={payoffPoints} label={`${series} payoff path`} /> : <EmptyPlot />}
          </div>
          <div className="property-position-controls">
            <PillGroup label="Chart period" value={period} onChange={setPeriod} options={PERIODS} />
            <PillGroup label="Chart range" value={path} onChange={setPath} options={[{ value: 'to-date', label: 'To date' }, { value: 'payoff', label: 'Payoff path' }]} />
          </div>
        </div>
        <aside className="property-position-side">
          <p className="property-kicker">Current position</p>
          <div className="property-position-metrics">
            <div>
              <span>Cash flow this year</span>
              <strong className={`property-signed ${signedTone(yearFlow)}`}>{yearFlow > 0 ? `+${formatKpiCurrency(yearFlow)}` : formatKpiCurrency(yearFlow)}</strong>
              {latestMonth ? <small>{latestMonth.label} {latestMonth.cashFlow > 0 ? `+${formatKpiCurrency(latestMonth.cashFlow)}` : formatKpiCurrency(latestMonth.cashFlow)}</small> : <small>No activity this year</small>}
            </div>
            <div>
              <span>Estimated value</span>
              <strong>{formatKpiCurrency(value)}</strong>
              <small>{value > 0 && profile.estimated_value_as_of ? `As of ${shortDate(profile.estimated_value_as_of)}` : 'Not saved'}</small>
            </div>
            <div>
              <span>Loan balance</span>
              <strong>{formatKpiCurrency(debt)}</strong>
              {ltv != null ? <small>{percentOrDash(ltv)} loan-to-value</small> : null}
            </div>
            <div>
              <span>Cash in the deal</span>
              <strong>{formatKpiCurrency(dealAmount)}</strong>
              <small>{deal > 0 ? 'Down payment and closing costs' : 'Purchase price'}</small>
            </div>
          </div>
        </aside>
        <div className="property-investor">
          <button type="button" aria-expanded={showInvestors} onClick={() => setShowInvestors(open => !open)}>
            <span>
              <strong>Investor numbers</strong>
              <small>DSCR, return on equity, and cash return · last 12 months</small>
            </span>
            <em>{showInvestors ? 'Hide' : 'Show'} <ChevronDown size={14} aria-hidden="true" /></em>
          </button>
          {showInvestors && <div className="property-stat-row">
            <Stat label="DSCR" value={numbers.dscr == null ? '—' : `${ratioOrDash(numbers.dscr)}×`} />
            <Stat label="Return on equity" value={percentOrDash(numbers.returnOnEquity)} />
            <Stat label="Cash return" value={percentOrDash(numbers.cashReturn)} />
          </div>}
        </div>
      </div>
    </section>

    <section className="property-module property-status-board" aria-label="Property status">
      <div>
        <span>Occupancy</span>
        <strong className={occupancyLabel === 'Fully occupied' ? 'property-signed is-positive' : ''}>{occupancyLabel}</strong>
        <small>{occupancyDetail}</small>
      </div>
      <div>
        <span>Lease ends</span>
        <strong>{leaseStatus.value}</strong>
        <small>{leaseStatus.detail}</small>
      </div>
      <div>
        <span>Months entered, last 12</span>
        <strong>{tracking.entered} of {tracking.total} entered</strong>
        <small>{tracking.detail}</small>
      </div>
    </section>

    <div className="property-quad">
      <section className="property-module property-last-month">
        <h2>Last month — {lastLabel}</h2>
        <dl>
          <Row label="Rent" value={formatKpiCurrency(lastMonth.rent)} />
          <Row label="Regular bills" value={formatKpiCurrency(lastMonth.expenses)} />
          <Row label="Rent minus bills" value={formatKpiCurrency(lastMonth.rent - lastMonth.expenses)} strong />
          <Row label="Mortgage payment" value={signedExpense(lastMonth.mortgage)} />
          <Row label="Cash flow" value={signedAmount(lastMonth.cashFlow)} strong tone={signedTone(lastMonth.cashFlow)} />
        </dl>
      </section>
      <section className="property-module property-coming">
        <h2>Coming up</h2>
        {comingUp.length ? <ul className="property-coming-list">
          {comingUp.map(item => <li key={`${item.unit}-${item.label}`}><span>{item.unit}{item.tenant ? ` · ${item.tenant}` : ''}</span><strong>Lease ends {item.label}</strong></li>)}
        </ul> : <div className="property-coming-empty">
          <strong>Nothing coming up</strong>
          <span>Lease ends, renewals and due dates will show here.</span>
        </div>}
      </section>
      <section className="property-module property-flow-chart">
        <div className="property-module-head">
          <h2>Monthly cash flow</h2>
          <PillGroup label="Cash flow period" value={flowPeriod} onChange={setFlowPeriod} options={PERIODS} />
        </div>
        <FinancialHistoryChart rows={history} label="Monthly cash flow" />
      </section>
      <EquityComposition property={property} profile={profile} equity={equity} open={showKnown} onToggle={() => setShowKnown(open => !open)} />
    </div>
  </div>;
}

function EquityComposition({ property, profile, equity, open, onToggle }: { property: Property; profile: PropertyProfile; equity: number | null; open: boolean; onToggle: () => void }) {
  const down = Number(profile.down_payment || 0);
  const paidDown = loanPaidDown(property, profile);
  const change = valueChange(property, profile);
  const parts = [Math.max(0, down), Math.max(0, paidDown), Math.max(0, change)];
  const total = parts.reduce((sum, part) => sum + part, 0) || 1;
  return <section className="property-module property-composition">
    <h2>Equity composition</h2>
    <p className="property-module-note">How your equity is built.</p>
    <div className="equity-bar" aria-hidden="true">
      <i className="is-down" style={{ width: `${(parts[0] / total) * 100}%` }} />
      <i className="is-paydown" style={{ width: `${(parts[1] / total) * 100}%` }} />
      <i className="is-value" style={{ width: `${(parts[2] / total) * 100}%` }} />
    </div>
    <dl>
      <Row label="Down payment" value={formatKpiCurrency(down)} swatch="is-down" />
      <Row label="Loan paid down since purchase" value={formatKpiCurrency(paidDown)} swatch="is-paydown" />
      <Row label="Value change since purchase" value={formatKpiCurrency(change)} swatch="is-value" />
    </dl>
    <div className="property-composition-total"><span>Equity</span><strong className={equity && equity > 0 ? 'property-signed is-positive' : ''}>{formatKpiCurrency(equity ?? 0)}</strong></div>
    <div className="property-composition-deal">
      <h3>Cash in the deal</h3>
      <p>The cash you have put in, minus cash you have taken out. Cash return is worked out on this.</p>
      <Row label="Down payment" value={formatKpiCurrency(down)} />
      <Row label="Closing costs" value={formatKpiCurrency(Number(profile.closing_costs || 0))} />
      <div className="property-composition-total"><span>Cash in the deal</span><strong>{formatKpiCurrency(down + Number(profile.closing_costs || 0))}</strong></div>
    </div>
    <button type="button" className="property-known" aria-expanded={open} onClick={onToggle}>
      <span>Known values</span>
      <em>{open ? 'Hide' : 'Show'} <ChevronDown size={14} aria-hidden="true" /></em>
    </button>
    {open && <p className="property-module-note">Down payment, closing costs, loan paydown, and value change are not saved yet.</p>}
  </section>;
}

function shortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function EmptyPlot() {
  return <svg className="position-chart" viewBox="0 0 640 220" role="img" aria-label="No balance history is saved">
    <line x1="52" x2="628" y1="16" y2="16" />
    <line x1="52" x2="628" y1="104" y2="104" />
    <line x1="52" x2="628" y1="192" y2="192" />
    <text x="44" y="196" textAnchor="end">$0</text>
  </svg>;
}

function PillGroup<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return <div className="property-chart-pills" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" className={value === option.value ? 'active' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function Row({ label, value, strong = false, tone = '', swatch = '' }: { label: string; value: string; strong?: boolean; tone?: string; swatch?: string }) {
  return <div className={strong ? 'is-strong' : ''}><dt>{swatch ? <i className={swatch} /> : null}{label}</dt><dd className={tone ? `property-signed ${tone}` : ''}>{value}</dd></div>;
}

function signedAmount(value: number) {
  const text = formatKpiCurrency(value);
  return value > 0 ? `+${text}` : text;
}

function signedExpense(value: number) {
  return value > 0 ? `-${formatKpiCurrency(value)}` : formatKpiCurrency(0);
}

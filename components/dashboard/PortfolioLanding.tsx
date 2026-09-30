'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import PositionChart from '@/components/property/PositionChart';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { buildPortfolioLanding, type LandingPath, type LandingPeriod, type LandingSeries, type LandingUnit } from '@/lib/portfolioLanding';
import { percentOrDash, signedTone } from '@/lib/propertyPosition';
import type { PropertyProfile } from '@/lib/propertyProfile';
import type { HistoryTransaction } from '@/lib/financialHistory';
import type { Property } from '@/lib/types';

const PERIODS: LandingPeriod[] = ['3M', '6M', '1Y', '2Y', '5Y', 'All'];
const SERIES: { value: LandingSeries; label: string }[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'value', label: 'Value' },
  { value: 'debt', label: 'Debt' },
];

export default function PortfolioLanding({ properties, units, transactions, profiles }: {
  properties: Property[];
  units: LandingUnit[];
  transactions: HistoryTransaction[];
  profiles: Record<string, PropertyProfile>;
}) {
  const [series, setSeries] = useState<LandingSeries>('equity');
  const [path, setPath] = useState<LandingPath>('to-date');
  const [period, setPeriod] = useState<LandingPeriod>('1Y');
  const [showMonths, setShowMonths] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [showInvestors, setShowInvestors] = useState(false);
  const model = useMemo(() => buildPortfolioLanding(properties, units, transactions, profiles, { series, path, period }), [properties, units, transactions, profiles, series, path, period]);
  const headline = series === 'debt' ? model.current.debt : series === 'value' ? model.current.value : model.current.equity;
  const movement = series === 'debt' ? model.debtDelta : series === 'value' ? model.valueDelta : model.equityDelta;
  const movementTone = series === 'debt' ? signedTone(-movement) : signedTone(movement);
  const flowTotal = model.flowMonths.reduce((sum, month) => ({
    income: sum.income + month.income,
    expenses: sum.expenses + month.expenses,
    mortgage: sum.mortgage + month.mortgage,
    cashFlow: sum.cashFlow + month.cashFlow,
  }), { income: 0, expenses: 0, mortgage: 0, cashFlow: 0 });
  const barMax = Math.max(model.averages.cashFlow, model.averages.paydown, 1);
  const rentBase = Math.max(flowTotal.income, 1);

  if (!properties.length) {
    return <section className="dashboard-module landing-empty"><h2>Portfolio pulse</h2><p>Add a property to see equity, cash flow, and what is coming up.</p></section>;
  }

  return <div className="landing-stack">
    <section className="dashboard-module landing-pulse" aria-label="Portfolio pulse">
      <div className="landing-pulse-main">
        <div className="landing-pulse-top">
          <div>
            <p className="landing-kicker">Portfolio pulse</p>
            <p className="landing-series">{series === 'equity' ? 'Your equity' : series === 'value' ? 'Portfolio value' : 'Total debt'}</p>
            <strong className="landing-value">{formatKpiCurrency(headline)}</strong>
            <p className={`landing-delta property-signed ${movementTone}`}>{signed(movement)} past year</p>
            {series === 'equity' ? <>
              <p className="landing-growth">Includes {formatKpiCurrency(model.putIn)} you put in{model.growth == null ? '.' : `, so ${percentOrDash(model.growth)} growth.`}</p>
              <div className="landing-parts">
                <span><i className="is-paydown" />Loan paydown <b className={`property-signed ${signedTone(model.paydown)}`}>{signed(model.paydown)}</b></span>
                <span><i className="is-value" />Value change (estimated) <b className={`property-signed ${signedTone(model.valueChange)}`}>{signed(model.valueChange)}</b></span>
                <span><i className="is-bought" />Bought <b>{signed(model.bought)}</b></span>
              </div>
            </> : null}
          </div>
          <div className="property-chart-pills" role="group" aria-label="Chart series">
            {SERIES.map(option => <button key={option.value} type="button" className={series === option.value ? 'active' : ''} aria-pressed={series === option.value} onClick={() => setSeries(option.value)}>{option.label}</button>)}
          </div>
        </div>
        <div className="landing-plot">
          {model.points?.length ? <PositionChart points={model.points} label={`${series} ${path}`} /> : <p className="landing-note">Payoff path needs a balance, rate, and payment.</p>}
        </div>
        <div className="landing-controls">
          <div className="property-chart-pills" role="group" aria-label="Chart period">
            {PERIODS.map(option => <button key={option} type="button" className={period === option ? 'active' : ''} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option}</button>)}
          </div>
          {path === 'to-date' ? <p className="landing-note">Values between known dates are estimated</p> : <span />}
          <div className="property-chart-pills" role="group" aria-label="Chart range">
            <button type="button" className={path === 'to-date' ? 'active' : ''} aria-pressed={path === 'to-date'} onClick={() => setPath('to-date')}>To date</button>
            <button type="button" className={path === 'payoff' ? 'active' : ''} aria-pressed={path === 'payoff'} onClick={() => setPath('payoff')}>Payoff path</button>
          </div>
        </div>
      </div>
      <aside className="landing-position">
        <p className="landing-kicker">Current position</p>
        <div>
          <span>Cash flow this year</span>
          <strong className={`property-signed ${signedTone(model.yearFlow)}`}>{signed(model.yearFlow)}</strong>
          <small>{model.latest ? `${model.latest.label} ${signed(model.latest.cashFlow)}` : 'No activity this year'}</small>
        </div>
        <div>
          <span>Portfolio value</span>
          <strong>{formatKpiCurrency(model.current.value)}</strong>
          <small>{model.propertyCount} {model.propertyCount === 1 ? 'property' : 'properties'} · {model.unitCount} {model.unitCount === 1 ? 'unit' : 'units'}</small>
        </div>
        <div>
          <span>Total debt</span>
          <strong>{formatKpiCurrency(model.current.debt)}</strong>
          <small>{model.current.value > 0 ? `${percentOrDash(model.current.debt / model.current.value)} loan-to-value` : 'Value not saved'}</small>
        </div>
        <div>
          <span>Cash in the deal</span>
          <strong>{formatKpiCurrency(model.averages.cashInDeal)}</strong>
          <small>Down payments, closing costs, and improvements</small>
        </div>
      </aside>
    </section>

    <div className="landing-split">
      <section className="dashboard-module" aria-label="Your properties">
        <div className="landing-module-head"><h2>Your properties</h2><Link href="/properties">Compare all <ChevronRight size={14} aria-hidden="true" /></Link></div>
        <div className="landing-share-head"><span>Your equity by property</span><strong>{formatKpiCurrency(model.current.equity)}</strong></div>
        <div className="landing-share" aria-hidden="true">{model.rows.map(row => <i key={row.id} style={{ width: `${Math.max(row.share * 100, row.equity > 0 ? 4 : 0)}%`, background: row.color }} />)}</div>
        <div className="landing-table">
          <div className="landing-table-head"><span>Property</span><span>Last month</span><span>12-month avg</span><span>Equity</span></div>
          {model.rows.map(row => <Link key={row.id} href={`/properties/${row.id}`} className="landing-property">
            <span className="landing-property-name"><i style={{ background: row.color }} />{row.name}<small>{row.city} · {row.units} {row.units === 1 ? 'unit' : 'units'}</small></span>
            <span className={`property-signed ${signedTone(row.cashFlow)}`}>{signed(row.cashFlow)}{row.expected ? <em>As expected</em> : null}</span>
            <span>{signed(row.average)}<small>over {row.ownedMonths} months owned</small></span>
            <span>{formatKpiCurrency(row.equity)} <ChevronRight size={14} aria-hidden="true" /></span>
          </Link>)}
        </div>
      </section>
      <section className="dashboard-module landing-coming" aria-label="Coming up">
        <h2>Coming up</h2>
        {model.coming.length ? <ul>{model.coming.map(item => <li key={item.id}><Link href={`/properties/${item.propertyId}`}><strong>{item.title}</strong><small>{item.detail}</small></Link></li>)}</ul> : <div className="landing-empty-copy"><strong>Nothing coming up</strong><span>Lease ends, renewals and due dates will show here.</span></div>}
        <Link href="/properties" className="landing-deadlines">See all deadlines <ChevronRight size={14} aria-hidden="true" /></Link>
      </section>
    </div>

    <div className="landing-split">
      <section className="dashboard-module" aria-label="Monthly cash flow">
        <div className="landing-module-head">
          <h2>Monthly cash flow</h2>
          <span className="landing-badge">{model.entered} of {model.propertyMonths} property-months entered</span>
        </div>
        <p className="landing-note">What came in, what went out, and what stayed with you.</p>
        <FlowBars months={model.flowMonths} />
        <div className="landing-legend"><span><i className="is-entered" />Entered</span><span><i className="is-partial" />Partly entered</span><span><i className="is-estimated" />Estimated</span></div>
        <p className="landing-total-label">Last 12 months, total</p>
        <div className="landing-totals">
          <div><span>Income</span><strong>{formatKpiCurrency(flowTotal.income)}</strong></div>
          <div><span>Expenses</span><strong>{signedExpense(flowTotal.expenses)}</strong></div>
          <div><span>Mortgage</span><strong>{signedExpense(flowTotal.mortgage)}</strong></div>
          <div><span>Cash flow</span><strong className={`property-signed ${signedTone(flowTotal.cashFlow)}`}>{signed(flowTotal.cashFlow)}</strong></div>
        </div>
        <p className="landing-note">Where the rent went: expenses, mortgage, and what you kept.</p>
        <div className="landing-rent-bar" aria-hidden="true">
          <i style={{ width: `${(flowTotal.expenses / rentBase) * 100}%` }} />
          <i style={{ width: `${(flowTotal.mortgage / rentBase) * 100}%` }} />
          <i style={{ width: `${(Math.max(0, flowTotal.cashFlow) / rentBase) * 100}%` }} />
        </div>
        <button type="button" className="landing-disclosure" aria-expanded={showMonths} onClick={() => setShowMonths(open => !open)}>Show month-by-month figures <ChevronDown size={14} aria-hidden="true" /></button>
        {showMonths && <div className="landing-months">{model.flowMonths.map(month => <div key={month.key}><span>{month.label}</span><strong className={`property-signed ${signedTone(month.cashFlow)}`}>{signed(month.cashFlow)}</strong></div>)}</div>}
        <button type="button" className="landing-disclosure" aria-expanded={showMath} onClick={() => setShowMath(open => !open)}>How these numbers are calculated <ChevronDown size={14} aria-hidden="true" /></button>
        {showMath && <p className="landing-note">Entered months use posted income and expenses. A month with no posts is estimated from recurring rent minus the saved mortgage payment. Cash flow is income minus expenses and the mortgage.</p>}
      </section>
      <section className="dashboard-module" aria-label="Cash and paydown">
        <h2>Cash + paydown</h2>
        <p className="landing-note">A typical month now: what the portfolio adds each month, before value change.</p>
        <strong className={`landing-month-add property-signed ${signedTone(model.averages.total)}`}>{signed(model.averages.total)}<small>/ month</small></strong>
        <div className="landing-meter"><span>Cash flow</span><i><b style={{ width: `${(Math.max(0, model.averages.cashFlow) / barMax) * 100}%` }} /></i><strong className={`property-signed ${signedTone(model.averages.cashFlow)}`}>{signed(model.averages.cashFlow)}</strong></div>
        <div className="landing-meter"><span>Loan paydown</span><i><b className="is-paydown" style={{ width: `${(Math.max(0, model.averages.paydown) / barMax) * 100}%` }} /></i><strong className="property-signed is-positive">{signed(model.averages.paydown)}</strong></div>
        <p className="landing-note">Each property’s average a month over the last 12 months, or since you bought it. Months you didn’t enter are left out of the average, and empty chart months are estimated.</p>
        <button type="button" className="landing-disclosure" aria-expanded={showInvestors} onClick={() => setShowInvestors(open => !open)}><span>Investor numbers</span><em>{showInvestors ? 'Hide' : 'Show'} <ChevronDown size={14} aria-hidden="true" /></em></button>
        {showInvestors && <div className="landing-investors">
          <div><span>Return on equity</span><strong>{percentOrDash(model.investor.returnOnEquity)}</strong></div>
          <div><span>Cash return</span><strong>{percentOrDash(model.investor.cashReturn)}</strong></div>
          <div><span>Trailing cash flow</span><strong className={`property-signed ${signedTone(model.investor.trailing)}`}>{signed(model.investor.trailing)}</strong></div>
        </div>}
      </section>
    </div>
  </div>;
}

function FlowBars({ months }: { months: { key: string; shortLabel: string; cashFlow: number; status: string }[] }) {
  const max = Math.max(1, ...months.map(month => Math.abs(month.cashFlow)));
  const hasNegative = months.some(month => month.cashFlow < 0);
  return <div className={`landing-bars ${hasNegative ? 'has-negative' : ''}`} role="img" aria-label="Monthly cash flow">
    {months.map(month => {
      const height = `${Math.max(8, (Math.abs(month.cashFlow) / max) * (hasNegative ? 46 : 100))}%`;
      return <div className="landing-bar" key={month.key}>
        <span className="landing-bar-plot"><i className={`is-${month.status} ${month.cashFlow < 0 ? 'is-down' : 'is-up'}`} style={{ height }} /></span>
        <small>{month.shortLabel}</small>
      </div>;
    })}
  </div>;
}

function signed(value: number) {
  const text = formatKpiCurrency(Math.abs(value));
  if (value > 0.5) return `+${text}`;
  if (value < -0.5) return `-${text}`;
  return formatKpiCurrency(0);
}

function signedExpense(value: number) {
  return value > 0.5 ? `-${formatKpiCurrency(value)}` : formatKpiCurrency(0);
}

'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Info, X } from 'lucide-react';
import CashFlowBars from '@/components/dashboard/CashFlowBars';
import LandingChart from '@/components/dashboard/LandingChart';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { buildPortfolioLanding, type LandingPath, type LandingPeriod, type LandingSeries, type LandingUnit } from '@/lib/portfolioLanding';
import { percentOrDash, signedTone } from '@/lib/propertyPosition';
import type { PropertyProfile } from '@/lib/propertyProfile';
import type { HistoryTransaction } from '@/lib/financialHistory';
import type { Property } from '@/lib/types';

const PERIODS: LandingPeriod[] = ['3M', '6M', '1Y', '2Y', '5Y', 'All'];
const SERIES: { value: LandingSeries; label: string }[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'debt', label: 'Debt' },
];

type CardId = 'change' | 'estimate' | 'cash' | 'value' | 'debt' | 'deal' | 'paydown';

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
  const [open, setOpen] = useState<CardId | null>(null);
  const [scrub, setScrub] = useState<{ value: number; caption: string } | null>(null);
  const model = useMemo(() => buildPortfolioLanding(properties, units, transactions, profiles, { series, path, period }), [properties, units, transactions, profiles, series, path, period]);
  const headline = scrub ? scrub.value : series === 'debt' ? model.current.debt : series === 'value' ? model.current.value : model.current.equity;
  const movement = scrub ? scrub.value - model.windowValue : series === 'debt' ? model.debtDelta : series === 'value' ? model.valueDelta : model.equityDelta;
  const flowTotal = model.flowMonths.reduce((sum, month) => ({
    income: sum.income + month.income,
    expenses: sum.expenses + month.expenses,
    mortgage: sum.mortgage + month.mortgage,
    cashFlow: sum.cashFlow + month.cashFlow,
  }), { income: 0, expenses: 0, mortgage: 0, cashFlow: 0 });
  const barMax = Math.max(model.averages.cashFlow, model.averages.paydown, 1);
  const rentParts = [
    { key: 'expenses', amount: Math.max(0, flowTotal.expenses), tone: 'is-expense' },
    { key: 'mortgage', amount: Math.max(0, flowTotal.mortgage), tone: 'is-mortgage' },
    { key: 'cash', amount: Math.abs(flowTotal.cashFlow), tone: flowTotal.cashFlow < -0.5 ? 'is-down' : 'is-up' },
  ].filter(part => part.amount > 0.5);
  const averageNames = model.averages.details.filter(item => item.months > 0).map(item => `${item.label}, ${item.months} ${item.months === 1 ? 'month' : 'months'}`).join('; ');

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null); };
    const onPointer = (event: PointerEvent) => {
      const card = document.querySelector(`[data-card="${open}"]`);
      if (card && !card.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

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
            <div className="landing-anchor" data-card="change">
              <p className="landing-delta">
                {signed(movement)} {model.periodLabel}
                <button type="button" className="landing-info" aria-label="How this change is counted" aria-expanded={open === 'change'} onClick={() => setOpen(open === 'change' ? null : 'change')}><Info size={14} /></button>
              </p>
              {open === 'change' ? <Breakdown title={scrub ? `To ${scrub.caption}` : `Change ${model.periodLabel}`} body="Loan paydown and properties bought in this period sit alongside this change." rows={series === 'equity' ? [
                { label: 'Loan paydown', amount: signed(model.paydown) },
                { label: 'Bought', amount: signed(model.bought), prefix: '+' },
                { label: 'Change', amount: signed(model.equityDelta), prefix: '=', strong: true },
              ] : [{ label: 'Debt change', amount: signed(movement), strong: true }]} footer={`This follows the ${model.periodLabel} on the chart.`} onClose={() => setOpen(null)} /> : null}
            </div>
            <div className="landing-composition">
              {series === 'equity' ? <>
                <p className="landing-growth">Includes {formatKpiCurrency(model.putIn)} you put in{model.growth == null ? '.' : `, so ${percentOrDash(model.growth)} growth.`}</p>
                <div className="landing-parts">
                  <span><i className="is-paydown" />Loan paydown <b>{signed(model.paydown)}</b></span>
                  <span><i className="is-bought" />Bought <b>{signed(model.bought)}</b></span>
                </div>
              </> : null}
            </div>
          </div>
          {path === 'to-date' ? <div className="property-chart-pills" role="group" aria-label="Chart series">
            {SERIES.map(option => <button key={option.value} type="button" className={series === option.value ? 'active' : ''} aria-pressed={series === option.value} onClick={() => setSeries(option.value)}>{option.label}</button>)}
          </div> : null}
        </div>
        <div className="landing-plot">
          {model.points?.length ? <LandingChart points={model.points} label={`${series} ${path}`} onScrub={setScrub} /> : <p className="landing-note">Payoff path needs a balance, rate, and payment.</p>}
        </div>
        <div className="landing-controls">
          {path === 'to-date' ? <div className="property-chart-pills" role="group" aria-label="Chart period">
            {PERIODS.map(option => <button key={option} type="button" className={period === option ? 'active' : ''} aria-pressed={period === option} onClick={() => { setPeriod(option); setScrub(null); }}>{option}</button>)}
          </div> : <span />}
          <div className="landing-anchor" data-card="estimate">
            {path === 'to-date' ? <p className="landing-note">Values between known dates are estimated <button type="button" className="landing-info" aria-label="Why values are estimated" aria-expanded={open === 'estimate'} onClick={() => setOpen(open === 'estimate' ? null : 'estimate')}><Info size={14} /></button></p> : <span />}
            {open === 'estimate' ? <Breakdown title="Estimated between known dates" body="The line is drawn through purchase, saved value dates, and today. Months between those dates are a straight estimate." rows={[]} footer="Payoff path uses the saved balance, rate, and payment instead." onClose={() => setOpen(null)} /> : null}
          </div>
          <div className="property-chart-pills" role="group" aria-label="Chart range">
            <button type="button" className={path === 'to-date' ? 'active' : ''} aria-pressed={path === 'to-date'} onClick={() => setPath('to-date')}>To date</button>
            <button type="button" className={path === 'payoff' ? 'active' : ''} aria-pressed={path === 'payoff'} onClick={() => setPath('payoff')}>Payoff path</button>
          </div>
        </div>
      </div>
      <aside className="landing-position">
        <p className="landing-kicker">Current position</p>
        <Figure id="cash" open={open} setOpen={setOpen} label="Cash flow this year" amount={signed(model.yearFlow)} tone={signedTone(model.yearFlow)} detail={model.year.slots ? `${model.year.latestLabel} ${signed(model.year.latestCash)}` : 'No finished month yet'} extra={model.year.slots ? `${model.year.range}${model.year.estimated ? ', some months estimated' : ''}` : ''} title="Cash flow this year" body="Rent and other income, minus expenses and mortgage payments, for the months of the year that have finished." rows={[
          { label: 'Rent and other income', amount: formatKpiCurrency(model.year.income) },
          { label: 'Expenses', amount: formatKpiCurrency(model.year.expenses), prefix: '+' },
          { label: 'Mortgage payments', amount: formatKpiCurrency(model.year.mortgage), prefix: '−' },
          { label: 'Cash flow', amount: signed(model.year.cashFlow), prefix: '=', strong: true },
        ]} footer={`${model.year.range}. ${model.year.entered} of ${model.year.slots} property-months entered; the rest are estimated from each property’s typical month.`} />
        <Figure id="value" open={open} setOpen={setOpen} label="Portfolio value" amount={formatKpiCurrency(model.current.value)} detail={`${model.propertyCount} ${model.propertyCount === 1 ? 'property' : 'properties'} · ${model.unitCount} ${model.unitCount === 1 ? 'unit' : 'units'}`} title="Portfolio value" body="What you think each property would sell for today, added up." rows={[...model.lines.value.map((line, index) => ({ label: line.label, amount: formatKpiCurrency(line.amount), prefix: index ? '+' : '' })), { label: 'Portfolio value', amount: formatKpiCurrency(model.current.value), prefix: '=', strong: true }]} footer="Each value is your latest estimate; update it on the property page." />
        <Figure id="debt" open={open} setOpen={setOpen} label="Total debt" amount={formatKpiCurrency(model.current.debt)} detail={model.current.value > 0 ? `${percentOrDash(model.current.debt / model.current.value)} loan-to-value` : 'Value not saved'} title="Total debt" body="The loan balance saved on each property, added up." rows={[...model.lines.debt.map((line, index) => ({ label: line.label, amount: formatKpiCurrency(line.amount), prefix: index ? '+' : '' })), { label: 'Total debt', amount: formatKpiCurrency(model.current.debt), prefix: '=', strong: true }]} footer={model.current.value > 0 ? `${percentOrDash(model.current.debt / model.current.value)} loan-to-value.` : 'Save a value to see loan-to-value.'} />
        <Figure id="deal" open={open} setOpen={setOpen} label="Cash in the deal" amount={formatKpiCurrency(model.averages.cashInDeal)} detail="Down payments, closing costs, and improvements" title="Cash in the deal" body="Down payments, closing costs, and improvements you have put into each property." rows={[...model.lines.deal.map((line, index) => ({ label: line.label, amount: formatKpiCurrency(line.amount), prefix: index ? '+' : '' })), { label: 'Cash in the deal', amount: formatKpiCurrency(model.averages.cashInDeal), prefix: '=', strong: true }]} footer="Cash return is worked out on this amount." />
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
            <span className="landing-property-name"><span className="landing-mark" style={{ '--mark': row.color } as CSSProperties}><i /></span>{row.name}<small>{row.city} · {row.units} {row.units === 1 ? 'unit' : 'units'}</small></span>
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
        <CashFlowBars months={model.flowMonths} />
        <p className="landing-total-label">Last 12 months, total</p>
        <div className="landing-totals">
          <div><span>Income</span><strong>{formatKpiCurrency(flowTotal.income)}</strong></div>
          <div><span>Expenses</span><strong>{signedExpense(flowTotal.expenses)}</strong></div>
          <div className="is-mortgage"><span>Mortgage</span><strong>{signedExpense(flowTotal.mortgage)}</strong></div>
          <div><span>Cash flow</span><strong className={`property-signed ${signedTone(flowTotal.cashFlow)}`}>{signed(flowTotal.cashFlow)}</strong></div>
        </div>
        <p className="landing-note">Where the rent went: expenses, mortgage, and what you kept.</p>
        <div className="landing-rent-bar" aria-hidden="true">
          {rentParts.map(part => <i key={part.key} className={part.tone} style={{ flexGrow: part.amount }} />)}
        </div>
        <button type="button" className="landing-disclosure" aria-expanded={showMonths} onClick={() => setShowMonths(open => !open)}>{showMonths ? 'Hide' : 'Show'} month-by-month figures <ChevronDown size={14} aria-hidden="true" /></button>
        {showMonths && <div className="landing-month-scroll"><table className="landing-month-table">
          <thead><tr><th>Month</th><th>Entered</th><th>Income</th><th>Expenses</th><th>Mortgage</th><th>Cash flow</th></tr></thead>
          <tbody>{[...model.flowMonths].reverse().map(month => <tr key={month.key}>
            <td>{month.label}</td>
            <td>{month.enteredLabel}</td>
            <td>{formatKpiCurrency(month.income)}</td>
            <td>{formatKpiCurrency(month.expenses)}</td>
            <td>{formatKpiCurrency(month.mortgage)}</td>
            <td className={`property-signed ${signedTone(month.cashFlow)}`}>{signed(month.cashFlow)}</td>
          </tr>)}</tbody>
        </table></div>}
        <button type="button" className="landing-disclosure" aria-expanded={showMath} onClick={() => setShowMath(open => !open)}>How these numbers are calculated <ChevronDown size={14} aria-hidden="true" /></button>
        {showMath && <p className="landing-note">Entered months use posted income and expenses. A month with no posts is estimated from recurring rent minus the saved mortgage payment. Cash flow is income minus expenses and the mortgage.</p>}
      </section>
      <section className="dashboard-module" aria-label="Cash and paydown">
        <h2>Cash + paydown</h2>
        <p className="landing-note">A typical month now: what the portfolio adds each month, before value change.</p>
        <div className="landing-figure" data-card="paydown">
          <button type="button" className={`landing-month-add landing-dotted property-signed ${signedTone(model.averages.total)}`} aria-expanded={open === 'paydown'} onClick={() => setOpen(open === 'paydown' ? null : 'paydown')}>{signed(model.averages.total)}<small>/ month</small></button>
          {open === 'paydown' ? <Breakdown title="Cash + paydown" body="What the portfolio adds each month before any change in value: the cash you keep, plus the part of your mortgage payments that pays down the loans." rows={[
            { label: 'Cash flow, average a month', amount: formatKpiCurrency(model.averages.cashFlow) },
            { label: 'Loan paydown, average a month', amount: formatKpiCurrency(model.averages.paydown), prefix: '+' },
            { label: 'Cash + paydown, a month', amount: signed(model.averages.total), prefix: '=', strong: true },
          ]} footer={`Each property’s average a month over the last 12 months, or since you bought it${averageNames ? `: ${averageNames}` : ''}. So it’s what the portfolio adds a month now, not the 12-month total divided by 12. Months you didn’t enter are estimated.`} onClose={() => setOpen(null)} /> : null}
        </div>
        <div className="landing-meter"><div className="landing-meter-label"><span>Cash flow</span><strong className={`property-signed ${signedTone(model.averages.cashFlow)}`}>{signed(model.averages.cashFlow)}</strong></div><i><b style={{ width: `${(Math.max(0, model.averages.cashFlow) / barMax) * 100}%` }} /></i></div>
        <div className="landing-meter"><div className="landing-meter-label"><span>Loan paydown</span><strong className="property-signed is-positive">{signed(model.averages.paydown)}</strong></div><i><b className="is-paydown" style={{ width: `${(Math.max(0, model.averages.paydown) / barMax) * 100}%` }} /></i></div>
        <p className="landing-note">Each property’s average a month over the last 12 months, or since you bought it. Months you didn’t enter are estimated from the typical month.</p>
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

function Figure({ id, open, setOpen, label, amount, tone = '', detail, extra, title, body, rows, footer }: {
  id: CardId;
  open: CardId | null;
  setOpen: (id: CardId | null) => void;
  label: string;
  amount: string;
  tone?: string;
  detail: string;
  extra?: string;
  title: string;
  body: string;
  rows: { label: string; amount: string; prefix?: string; strong?: boolean }[];
  footer: string;
}) {
  const active = open === id;
  return <div className="landing-figure" data-card={id}>
    <span>{label}</span>
    <button type="button" className={`landing-dotted landing-position-value ${tone ? `property-signed ${tone}` : ''}`} aria-expanded={active} onClick={() => setOpen(active ? null : id)}>{amount}</button>
    <small>{detail}</small>
    {extra ? <small>{extra}</small> : null}
    {active ? <Breakdown title={title} body={body} rows={rows} footer={footer} onClose={() => setOpen(null)} /> : null}
  </div>;
}

function Breakdown({ title, body, rows, footer, onClose }: {
  title: string;
  body: string;
  rows: { label: string; amount: string; prefix?: string; strong?: boolean }[];
  footer: string;
  onClose: () => void;
}) {
  return <div className="landing-pop" role="dialog" aria-label={title}>
    <div className="landing-pop-head"><strong>{title}</strong><button type="button" className="landing-pop-close" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
    <p>{body}</p>
    {rows.length ? <div className="landing-pop-rows">{rows.map(row => <div key={row.label} className={row.strong ? 'is-total' : ''}><span>{row.prefix ? `${row.prefix} ` : ''}{row.label}</span><b>{row.amount}</b></div>)}</div> : null}
    <p>{footer}</p>
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

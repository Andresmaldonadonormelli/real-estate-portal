'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Info, X } from 'lucide-react';
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
  { value: 'value', label: 'Value' },
  { value: 'debt', label: 'Debt' },
];

type CardId = 'change' | 'estimate' | 'cash' | 'value' | 'debt' | 'deal' | 'paydown';
type FlowMonth = {
  key: string;
  label: string;
  shortLabel: string;
  income: number;
  expenses: number;
  mortgage: number;
  cashFlow: number;
  status: string;
  enteredLabel: string;
};

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
  const rentBase = Math.max(flowTotal.income, 1);
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
                {signed(movement)} {scrub ? `to ${scrub.caption}` : model.periodLabel}
                <button type="button" className="landing-info" aria-label="How this change is counted" aria-expanded={open === 'change'} onClick={() => setOpen(open === 'change' ? null : 'change')}><Info size={14} /></button>
              </p>
              {open === 'change' ? <Breakdown title={scrub ? `To ${scrub.caption}` : `Change ${model.periodLabel}`} body="Loan paydown, estimated value change, and purchases add up to this change." rows={series === 'equity' ? [
                { label: 'Loan paydown', amount: signed(model.paydown) },
                { label: 'Value change (estimated)', amount: signed(model.valueChange), prefix: '+' },
                { label: 'Bought', amount: signed(model.bought), prefix: '+' },
                { label: 'Change', amount: signed(model.equityDelta), prefix: '=', strong: true },
              ] : [{ label: series === 'debt' ? 'Debt change' : 'Value change', amount: signed(movement), strong: true }]} footer={scrub ? `The breakdown is for the ${model.periodLabel}. Move off the chart to see it.` : `This follows the ${model.periodLabel} on the chart.`} onClose={() => setOpen(null)} /> : null}
            </div>
            <div className="landing-composition">
              {scrub ? <p className="landing-growth">The breakdown is for the {model.periodLabel}. Move off the chart to see it.</p> : series === 'equity' ? <>
                <p className="landing-growth">Includes {formatKpiCurrency(model.putIn)} you put in{model.growth == null ? '.' : `, so ${percentOrDash(model.growth)} growth.`}</p>
                <div className="landing-parts">
                  <span><i className="is-paydown" />Loan paydown <b>{signed(model.paydown)}</b></span>
                  <span><i className="is-value" />Value change (estimated) <b>{signed(model.valueChange)}</b></span>
                  <span><i className="is-bought" />Bought <b>{signed(model.bought)}</b></span>
                </div>
              </> : null}
            </div>
          </div>
          <div className="property-chart-pills" role="group" aria-label="Chart series">
            {SERIES.map(option => <button key={option.value} type="button" className={series === option.value ? 'active' : ''} aria-pressed={series === option.value} onClick={() => setSeries(option.value)}>{option.label}</button>)}
          </div>
        </div>
        <div className="landing-plot">
          {model.points?.length ? <LandingChart points={model.points} label={`${series} ${path}`} onScrub={setScrub} /> : <p className="landing-note">Payoff path needs a balance, rate, and payment.</p>}
        </div>
        <div className="landing-controls">
          <div className="property-chart-pills" role="group" aria-label="Chart period">
            {PERIODS.map(option => <button key={option} type="button" className={period === option ? 'active' : ''} aria-pressed={period === option} onClick={() => { setPeriod(option); setScrub(null); }}>{option}</button>)}
          </div>
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

function FlowBars({ months }: { months: FlowMonth[] }) {
  const [active, setActive] = useState<string | null>(null);
  const values = months.map(month => month.cashFlow);
  const scale = evenScale(Math.min(...values, 0), Math.max(...values, 1));
  const span = scale.max - scale.min || 1;
  const selected = months.find(month => month.key === active);
  const selectedIndex = months.findIndex(month => month.key === active);
  const place = selectedIndex >= 0 ? (selectedIndex + 0.5) / months.length : 0;
  return <div className="landing-flow">
    <div className="landing-flow-scale" aria-hidden="true">{scale.ticks.map(tick => <span key={tick} style={{ bottom: `${((tick - scale.min) / span) * 100}%` }}>{compact(tick)}</span>)}</div>
    <div className="landing-flow-plot">
      <i className="landing-zero" style={{ bottom: `${((0 - scale.min) / span) * 100}%` }} />
      <div className="landing-bars" role="img" aria-label="Monthly cash flow">
        {months.map(month => {
          const height = `${(Math.abs(month.cashFlow) / span) * 100}%`;
          const bottom = month.cashFlow >= 0 ? `${((0 - scale.min) / span) * 100}%` : `${((month.cashFlow - scale.min) / span) * 100}%`;
          return <button type="button" className={`landing-bar ${active === month.key ? 'is-active' : ''}`} key={month.key} aria-label={month.label} aria-pressed={active === month.key} onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(month.key); }} onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(current => current === month.key ? null : current); }} onPointerUp={event => { if (event.pointerType !== 'mouse') setActive(current => current === month.key ? null : month.key); }} onClick={event => { if (event.detail === 0) setActive(current => current === month.key ? null : month.key); }}>
            <span className="landing-bar-plot"><i className={`is-${month.status} ${month.cashFlow < 0 ? 'is-down' : 'is-up'}`} style={{ height, bottom }} /></span>
          </button>;
        })}
      </div>
      {selected && selectedIndex >= 0 ? <div className="landing-flow-tip" style={{ left: `${place * 100}%`, transform: place < 0.18 ? 'none' : place > 0.82 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
        <strong>{selected.label}</strong>
        <span>{selected.enteredLabel}</span>
        <span>Income <b>{formatKpiCurrency(selected.income)}</b></span>
        <span>Expenses <b>{formatKpiCurrency(selected.expenses)}</b></span>
        <span>Mortgage <b>{formatKpiCurrency(selected.mortgage)}</b></span>
        <span>Cash flow <b className={`property-signed ${signedTone(selected.cashFlow)}`}>{signed(selected.cashFlow)}</b></span>
      </div> : null}
    </div>
    <div className="landing-flow-labels" aria-hidden="true">{months.map(month => <small key={month.key}>{month.shortLabel}</small>)}</div>
  </div>;
}

function evenScale(minValue: number, maxValue: number) {
  const span = Math.max(maxValue - minValue, 1);
  const rough = span / 3;
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
  const steps = [1, 2, 2.5, 5, 10].map(factor => factor * power);
  const step = steps.find(candidate => span / candidate <= 4) || steps[steps.length - 1];
  const min = Math.floor(minValue / step) * step;
  const max = Math.max(Math.ceil(maxValue / step) * step, min + step);
  const ticks: number[] = [];
  for (let value = max; value >= min - step / 2; value -= step) ticks.push(Math.round(value));
  return { min, max, ticks };
}

function compact(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 1000) return `${sign}$${Math.round(absolute / 100) / 10}K`;
  return `${sign}$${Math.round(absolute)}`;
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

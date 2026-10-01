'use client';

import { useState } from 'react';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import { signedTone } from '@/lib/propertyPosition';

export type CashFlowBarMonth = {
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

export default function CashFlowBars({ months }: { months: CashFlowBarMonth[] }) {
  const [active, setActive] = useState<string | null>(null);
  const values = months.map(month => month.cashFlow);
  const scale = evenScale(Math.min(...values, 0), Math.max(...values, 0));
  const span = scale.max - scale.min || 1;
  const selected = months.find(month => month.key === active);
  const selectedIndex = months.findIndex(month => month.key === active);
  const place = selectedIndex >= 0 ? (selectedIndex + 0.5) / months.length : 0;
  return <>
    <div className="landing-flow">
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
    </div>
    <div className="landing-legend"><span><i className="is-entered" />Entered</span><span><i className="is-partial" />Partly entered</span><span><i className="is-estimated" />Estimated</span></div>
  </>;
}

function evenScale(minValue: number, maxValue: number) {
  const extent = Math.max(Math.abs(minValue), Math.abs(maxValue), 1);
  const power = Math.pow(10, Math.floor(Math.log10(extent)));
  const steps = [1, 2, 2.5, 5, 10].map(factor => factor * power);
  const step = steps.find(candidate => extent / candidate <= 2) || steps[steps.length - 1];
  const max = Math.ceil(extent / step) * step;
  const min = -max;
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

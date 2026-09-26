'use client';

import { useEffect, useState } from 'react';
import type { HistoryMode, MonthlyFinancialPoint } from '@/lib/financialHistory';
import { formatCurrency } from '@/lib/formatters';

type ChartKind = 'cashFlow' | 'holdingCosts' | 'incomeExpense';

function evenAxis(maxValue: number) {
  const value = Math.max(maxValue, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [0.2, 0.25, 0.5, 1, 2].map((factor) => factor * magnitude).filter((step) => step >= 2);
  let step = steps[0] ?? 2;
  let bestScore = Number.POSITIVE_INFINITY;
  steps.forEach((candidate) => {
    const evenStep = candidate % 2 === 0 ? candidate : candidate * 2;
    const max = Math.ceil(value / evenStep) * evenStep;
    const count = Math.round(max / evenStep) + 1;
    const score = Math.abs(count - 6) + (max / value > 1.35 ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      step = evenStep;
    }
  });
  const max = Math.ceil(value / step) * step;
  const ticks: number[] = [];
  for (let tick = max; tick >= -step / 2; tick -= step) {
    const rounded = Math.round(tick);
    if (rounded >= 0 && ticks[ticks.length - 1] !== rounded) ticks.push(rounded);
  }
  return { max, ticks };
}

function compactCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    const amount = absolute / 1000;
    return `${sign}$${Number.isInteger(amount) ? amount : amount.toFixed(1)}K`;
  }
  return `${sign}${formatCurrency(absolute)}`;
}

export default function FinancialHistoryChart({
  rows,
  mode = 'cashFlow',
  kind = 'cashFlow',
  label,
  onInspect,
}: {
  rows: MonthlyFinancialPoint[];
  mode?: HistoryMode;
  kind?: ChartKind;
  label: string;
  onInspect?: (row: MonthlyFinancialPoint | null) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    setSelected(null);
    onInspect?.(null);
  }, [rows, mode, kind, onInspect]);

  const holdingOnly = kind === 'holdingCosts';
  const grouped = kind === 'incomeExpense';
  const width = 820;
  const height = grouped ? 280 : 420;
  const pad = grouped ? { left: 76, right: 8, top: 12, bottom: 8 } : { left: 58, right: 4, top: 88, bottom: 12 };
  const innerWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const netValues = rows.map((row) => (mode === 'cashFlow' ? row.cashFlow : row.noi));
  const expenseValues = rows.map((row) => (mode === 'cashFlow' ? row.cashExpenses : row.operatingExpenses));
  const incomeValues = rows.map((row) => row.income);
  const rawExtent = Math.max(
    1,
    ...(holdingOnly
      ? expenseValues
      : grouped
        ? [...incomeValues, ...expenseValues]
        : netValues.map((value) => Math.abs(value))),
  );
  const groupedAxis = grouped ? evenAxis(rawExtent) : null;
  const extent = groupedAxis?.max ?? rawExtent;
  const zeroY = holdingOnly || grouped ? height - pad.bottom : pad.top + plotHeight / 2;
  const positiveHeight = holdingOnly || grouped ? plotHeight : zeroY - pad.top;
  const negativeHeight = holdingOnly || grouped ? 0 : height - pad.bottom - zeroY;
  const xStep = innerWidth / Math.max(1, rows.length);
  const barWidth = Math.min(
    holdingOnly ? 26 : grouped ? 32 : 34,
    Math.max(grouped ? 14 : 10, xStep * (holdingOnly ? 0.34 : grouped ? 0.28 : 0.46)),
  );
  const groupGap = grouped ? 3 : 0;
  const highlightIndex = grouped ? (selected == null ? Math.max(0, rows.length - 1) : selected) : selected;
  const x = (index: number) => pad.left + xStep * (index + 0.5);
  const upwardY = (value: number) => zeroY - (value / extent) * positiveHeight;
  const downwardHeight = (value: number) => (value / extent) * negativeHeight;
  const active = selected == null ? null : rows[selected];
  const middleY = pad.top + plotHeight / 2;

  function inspect(event: React.MouseEvent<SVGSVGElement>) {
    if (!rows.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.max(0, Math.min(rows.length - 1, Math.floor((pointer - pad.left) / Math.max(1, xStep))));
    setSelected(index);
    onInspect?.(rows[index] ?? null);
  }
  function finish() {
    setSelected(null);
    onInspect?.(null);
  }

  const axisLabels = grouped && groupedAxis
    ? groupedAxis.ticks.map((tick) => ({
        value: tick === 0 ? '$0' : formatCurrency(tick),
        y: zeroY - (tick / extent) * positiveHeight,
      }))
    : holdingOnly
    ? [
        { value: compactCurrency(extent), y: pad.top },
        { value: compactCurrency(extent / 2), y: middleY },
        { value: '$0', y: height - pad.bottom },
      ]
    : [
        { value: compactCurrency(extent), y: pad.top },
        { value: '$0', y: zeroY },
        { value: compactCurrency(-extent), y: height - pad.bottom },
      ];

  return (
    <div className={`financial-history-chart-wrap ${holdingOnly ? 'is-holding-costs' : ''} ${grouped ? 'is-income-expense' : ''}`}>
      <div className="financial-history-plot">
        <div className="financial-history-y-axis" aria-hidden="true">
          {axisLabels.map((tick, index) => (
            <span key={index} style={{ top: `${(tick.y / height) * 100}%` }}>
              {tick.value}
            </span>
          ))}
        </div>
        <svg
          className="financial-history-chart"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            inspect(event);
          }}
          onMouseMove={grouped ? inspect : undefined}
          onMouseLeave={grouped ? finish : undefined}
          onPointerMove={(event) => {
            if (grouped || event.pointerType === 'mouse' || event.currentTarget.hasPointerCapture(event.pointerId)) inspect(event);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (!grouped) finish();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') finish();
          }}
          onPointerCancel={finish}
        >
          {grouped && groupedAxis ? groupedAxis.ticks.map((tick) => {
            const y = zeroY - (tick / extent) * positiveHeight;
            return <line key={tick} x1={pad.left} x2={width - pad.right} y1={y} y2={y} className={tick === 0 ? 'financial-history-zero' : 'financial-history-grid'} vectorEffect="non-scaling-stroke" />;
          }) : (
            <>
              <line x1={pad.left} x2={width - pad.right} y1={pad.top} y2={pad.top} className="financial-history-grid" vectorEffect="non-scaling-stroke" />
              {holdingOnly && (
                <line x1={pad.left} x2={width - pad.right} y1={middleY} y2={middleY} className="financial-history-grid" vectorEffect="non-scaling-stroke" />
              )}
              <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} className="financial-history-zero" vectorEffect="non-scaling-stroke" />
            </>
          )}
          {!holdingOnly && !grouped && (
            <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} className="financial-history-grid" vectorEffect="non-scaling-stroke" />
          )}
          {rows.map((row, index) => {
            if (holdingOnly) {
              const value = expenseValues[index];
              return (
                <g key={row.key}>
                  <rect
                    x={x(index) - barWidth / 2}
                    y={upwardY(value)}
                    width={barWidth}
                    height={Math.max(0, zeroY - upwardY(value))}
                    rx="3"
                    className="financial-history-expense-bar"
                  />
                </g>
              );
            }
            if (grouped) {
              const income = incomeValues[index];
              const expenses = expenseValues[index];
              const pairWidth = barWidth * 2 + groupGap;
              const expenseX = x(index) - pairWidth / 2;
              const incomeX = expenseX + barWidth + groupGap;
              const activeMonth = index === highlightIndex;
              return (
                <g key={row.key} className={activeMonth ? 'is-active' : 'is-quiet'}>
                  <rect
                    x={expenseX}
                    y={upwardY(expenses)}
                    width={barWidth}
                    height={Math.max(2, zeroY - upwardY(expenses))}
                    rx="3"
                    className="financial-history-expense-series-bar"
                    fill="var(--chart-expense, #b0adb8)"
                  />
                  <rect
                    x={incomeX}
                    y={upwardY(income)}
                    width={barWidth}
                    height={Math.max(2, zeroY - upwardY(income))}
                    rx="3"
                    className="financial-history-income-series-bar"
                    fill={activeMonth ? 'var(--chart-income, #baa1f7)' : 'var(--chart-income-quiet, #e4daf8)'}
                  />
                </g>
              );
            }
            const net = netValues[index];
            if (net >= 0) {
              return (
                <g key={row.key}>
                  <rect
                    x={x(index) - barWidth / 2}
                    y={upwardY(net)}
                    width={barWidth}
                    height={Math.max(0, zeroY - upwardY(net))}
                    rx="3"
                    className="financial-history-income-bar"
                  />
                </g>
              );
            }
            return (
              <g key={row.key}>
                <rect
                  x={x(index) - barWidth / 2}
                  y={zeroY}
                  width={barWidth}
                  height={Math.max(0, downwardHeight(Math.abs(net)))}
                  rx="3"
                  className="financial-history-expense-bar"
                />
              </g>
            );
          })}
          {selected != null && !grouped && (
            <line x1={x(selected)} x2={x(selected)} y1={pad.top} y2={height - pad.bottom} className="financial-history-guide" vectorEffect="non-scaling-stroke" />
          )}
          <rect x={pad.left} y={pad.top} width={innerWidth} height={plotHeight} className="financial-history-hit" />
        </svg>
        {active && !grouped && (
          <div
            className="financial-history-tooltip"
            data-edge={selected === 0 ? 'left' : selected === rows.length - 1 ? 'right' : 'center'}
            style={{ left: `${(x(selected!) / width) * 100}%` }}
          >
            <strong>{active.fullLabel}</strong>
            {holdingOnly ? (
              <b className="amount-negative">
                <i>Holding costs</i>
                {formatCurrency(active.cashExpenses)}
              </b>
            ) : (
              <>
                <b className={(mode === 'cashFlow' ? active.cashFlow : active.noi) >= 0 ? 'amount-positive' : 'amount-negative'}>
                  <i>Net</i>
                  {formatCurrency(mode === 'cashFlow' ? active.cashFlow : active.noi)}
                </b>
                <span>
                  <i>
                    <em className="financial-tooltip-long">Income</em>
                    <em className="financial-tooltip-short">In</em>
                  </i>
                  <strong>{formatCurrency(active.income)}</strong>
                </span>
                <span>
                  <i>
                    <em className="financial-tooltip-long">Expenses</em>
                    <em className="financial-tooltip-short">Out</em>
                  </i>
                  <strong>{formatCurrency(mode === 'cashFlow' ? active.cashExpenses : active.operatingExpenses)}</strong>
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div
        className="financial-history-axis"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, rows.length)},minmax(0,1fr))`,
          paddingLeft: `${(pad.left / width) * 100}%`,
          paddingRight: `${(pad.right / width) * 100}%`,
        }}
        aria-hidden={grouped ? undefined : true}
        role={grouped ? 'listbox' : undefined}
        aria-label={grouped ? 'Months' : undefined}
        onKeyDown={grouped ? (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const current = selected == null ? rows.length - 1 : selected;
          const next = event.key === 'ArrowRight' ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1);
          setSelected(next);
          onInspect?.(rows[next] ?? null);
        } : undefined}
      >
        {rows.map((row, index) => grouped ? (
          <button
            type="button"
            key={row.key}
            role="option"
            aria-selected={index === highlightIndex}
            className={index === highlightIndex ? 'is-selected' : ''}
            onClick={() => { setSelected(index); onInspect?.(rows[index] ?? null); }}
            onFocus={() => { setSelected(index); onInspect?.(rows[index] ?? null); }}
          >{row.label}</button>
        ) : (
          <span key={row.key}>{row.label}</span>
        ))}
      </div>
    </div>
  );
}

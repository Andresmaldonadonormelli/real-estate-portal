'use client';

import { formatKpiCurrency } from '@/lib/propertyFinancials';
import type { PositionPoint } from '@/lib/propertyPosition';

export default function PositionChart({ points, label }: { points: PositionPoint[]; label: string }) {
  const width = 640;
  const height = 220;
  const pad = { left: 52, right: 12, top: 16, bottom: 28 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const values = points.map(point => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = pad.top + (1 - (point.value - min) / span) * innerHeight;
    return { ...point, x, y };
  });
  const path = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const ticks = [max, (max + min) / 2, min];
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return <svg className="position-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {ticks.map(tick => {
      const y = pad.top + (1 - (tick - min) / span) * innerHeight;
      return <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
        <text x={pad.left - 8} y={y + 4}>{compact(tick)}</text>
      </g>;
    })}
    <path d={path} />
    {axisLabels(coords, labelStep).map(point => <text key={`${point.label}-${point.x}`} className="position-chart-label" x={point.x} y={height - 8} textAnchor="middle">{point.label}</text>)}
  </svg>;
}

function axisLabels(points: { x: number; label: string }[], step: number) {
  const chosen: { x: number; label: string }[] = [];
  points.forEach((point, index) => {
    if (index % step !== 0 && index !== points.length - 1) return;
    const previous = chosen[chosen.length - 1];
    if (previous && Math.abs(point.x - previous.x) < 36) {
      if (index === points.length - 1) chosen[chosen.length - 1] = point;
      return;
    }
    chosen.push(point);
  });
  return chosen;
}

function compact(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    const amount = absolute / 1000;
    return `${value < 0 ? '-' : ''}$${Number.isInteger(amount) ? amount : amount.toFixed(0)}k`;
  }
  return formatKpiCurrency(value);
}

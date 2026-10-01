'use client';

import { useMemo, useState, type PointerEvent } from 'react';
import type { LandingPoint } from '@/lib/portfolioLanding';

type Sample = { x: number; y: number; value: number; caption: string };

export default function LandingChart({ points, label, onScrub }: {
  points: LandingPoint[];
  label: string;
  onScrub: (point: { value: number; caption: string } | null) => void;
}) {
  const width = 640;
  const height = 300;
  const pad = { left: 8, right: 24, top: 18, bottom: 36 };
  const [active, setActive] = useState<number | null>(null);
  const layout = useMemo(() => layoutChart(points, width, height, pad), [points]);

  function scrubAt(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const index = nearest(layout.samples, x);
    setActive(index);
    const sample = layout.samples[index];
    if (sample) onScrub({ value: sample.value, caption: sample.caption });
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'mouse' && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scrubAt(event);
  }

  function clear() {
    setActive(null);
    onScrub(null);
  }

  const scrub = active == null ? null : layout.samples[active];
  const end = layout.samples.length ? layout.samples[layout.samples.length - 1] : null;

  return <div className="landing-chart-frame">
    <div className="landing-chart-scale" aria-hidden="true">
      <span className="landing-chart-sizer">{layout.ticks.reduce((widest, tick) => tick.label.length > widest.length ? tick.label : widest, '$0')}</span>
      {layout.ticks.map(tick => <span key={tick.value} className="landing-chart-y" style={{ top: `${(tick.y / height) * 100}%` }}>{tick.label}</span>)}
    </div>
    <div className="landing-chart-stage">
      <svg
        className="landing-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onPointerDown={event => { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is unavailable for this event. */ } scrubAt(event); }}
        onPointerMove={move}
        onPointerUp={event => { if (event.pointerType !== 'mouse') clear(); }}
        onPointerLeave={event => { if (event.pointerType === 'mouse') clear(); }}
        onPointerCancel={clear}
      >
        <defs>
          <linearGradient id="landing-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--positive)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--positive)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {layout.ticks.map(tick => <g key={tick.value} className="landing-chart-grid">
          <line x1={pad.left} x2={width - pad.right} y1={tick.y} y2={tick.y} />
        </g>)}
        <path className="landing-chart-area" d={layout.area} />
        <path className={`landing-chart-line ${scrub ? 'is-faded' : ''}`} d={layout.line} />
        {scrub ? <>
          <clipPath id="landing-solid"><rect x="0" y="0" width={scrub.x} height={height} /></clipPath>
          <path className="landing-chart-line" d={layout.line} clipPath="url(#landing-solid)" />
          <line className="landing-chart-guide" x1={scrub.x} x2={scrub.x} y1={pad.top} y2={height - pad.bottom} />
        </> : null}
      </svg>
      {layout.labels.map((point, index) => <span key={`${point.label}-${point.x}`} className={`landing-chart-x${index === 0 ? ' is-start' : ''}${index === layout.labels.length - 1 && index !== 0 ? ' is-end' : ''}`} style={{ left: `${(point.x / width) * 100}%` }}>{point.label}</span>)}
      {end ? <span className="landing-chart-dot" style={{ left: `${(end.x / width) * 100}%`, top: `${(end.y / height) * 100}%` }} /> : null}
      {scrub ? <span className="landing-chart-dot" style={{ left: `${(scrub.x / width) * 100}%`, top: `${(scrub.y / height) * 100}%` }} /> : null}
    </div>
  </div>;
}

function layoutChart(points: LandingPoint[], width: number, height: number, pad: { left: number; right: number; top: number; bottom: number }) {
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const values = points.map(point => point.value);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const scale = evenScale(rawMin, rawMax);
  const coords = points.map((point, index) => ({
    ...point,
    x: pad.left + (points.length === 1 ? 0 : (index / (points.length - 1)) * innerWidth),
    y: yFor(point.value, scale, pad.top, innerHeight),
  }));
  const samples = sampleCurve(coords);
  const line = samples.length ? `M ${samples.map(point => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}` : '';
  const base = pad.top + innerHeight;
  const area = samples.length ? `${line} L ${samples[samples.length - 1].x.toFixed(1)} ${base} L ${samples[0].x.toFixed(1)} ${base} Z` : '';
  const ticks = scale.ticks.map(value => ({ value, y: yFor(value, scale, pad.top, innerHeight), label: compact(value) }));
  return { samples, line, area, ticks, labels: axisLabels(coords) };
}

function yFor(value: number, scale: { min: number; max: number }, top: number, innerHeight: number) {
  const span = scale.max - scale.min || 1;
  return top + (1 - (value - scale.min) / span) * innerHeight;
}

function sampleCurve(coords: Array<LandingPoint & { x: number; y: number }>): Sample[] {
  if (!coords.length) return [];
  if (coords.length === 1) return [{ x: coords[0].x, y: coords[0].y, value: coords[0].value, caption: longDate(coords[0].time) }];
  const samples: Sample[] = [{ x: coords[0].x, y: coords[0].y, value: coords[0].value, caption: longDate(coords[0].time) }];
  for (let index = 0; index < coords.length - 1; index += 1) {
    const p0 = coords[index - 1] || coords[index];
    const p1 = coords[index];
    const p2 = coords[index + 1];
    const p3 = coords[index + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8;
      samples.push({
        x: cubic(p1.x, c1x, c2x, p2.x, t),
        y: cubic(p1.y, c1y, c2y, p2.y, t),
        value: p1.value + (p2.value - p1.value) * t,
        caption: longDate(p1.time + (p2.time - p1.time) * t),
      });
    }
  }
  return samples;
}

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function nearest(samples: Sample[], x: number) {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    const next = Math.abs(sample.x - x);
    if (next < distance) {
      distance = next;
      best = index;
    }
  });
  return best;
}

function evenScale(minValue: number, maxValue: number) {
  const span = Math.max(maxValue - minValue, 1);
  const rough = span / 3;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const steps = [1, 2, 2.5, 5, 10].map(factor => factor * power);
  const step = steps.find(candidate => span / candidate <= 4) || steps[steps.length - 1];
  const min = Math.floor(minValue / step) * step;
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let value = max; value >= min - step / 2; value -= step) ticks.push(Math.round(value));
  return { min, max: Math.max(max, min + step), ticks };
}

function axisLabels(points: Array<{ x: number; label: string }>) {
  const step = Math.max(1, Math.ceil(points.length / 6));
  const chosen: Array<{ x: number; label: string }> = [];
  points.forEach((point, index) => {
    if (index % step !== 0 && index !== points.length - 1) return;
    const previous = chosen[chosen.length - 1];
    if (previous && Math.abs(point.x - previous.x) < 150) {
      if (index === points.length - 1) chosen[chosen.length - 1] = point;
      return;
    }
    chosen.push(point);
  });
  return chosen;
}

function compact(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 1000) {
    const amount = absolute / 1000;
    const digits = amount >= 100 || Number.isInteger(amount) ? 0 : 1;
    return `${sign}$${amount.toFixed(digits)}K`;
  }
  return `${sign}$${Math.round(absolute)}`;
}

function longDate(time: number) {
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

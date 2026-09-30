import { buildMonthlyFinancialHistory, type HistoryTransaction } from '@/lib/financialHistory';
import { cashInDeal, currentEquity, emptyProfile, type PropertyProfile } from '@/lib/propertyProfile';
import { monthActivity, nextPaymentParts, payoffModel } from '@/lib/propertyPosition';
import type { Property } from '@/lib/types';

export type LandingSeries = 'equity' | 'value' | 'debt';
export type LandingPath = 'to-date' | 'payoff';
export type LandingPeriod = '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'All';
export type FlowStatus = 'entered' | 'partial' | 'estimated';
export type LandingPoint = { label: string; value: number; time: number };
export type LandingLine = { label: string; amount: number };

const PERIOD_LABEL: Record<LandingPeriod, string> = {
  '3M': 'past 3 months',
  '6M': 'past 6 months',
  '1Y': 'past year',
  '2Y': 'past 2 years',
  '5Y': 'past 5 years',
  'All': 'since the start',
};

export type LandingUnit = {
  property_id: string;
  unit_number?: string | null;
  occupied?: boolean | null;
  current_rent?: number | null;
  lease_end_date?: string | null;
  tenant_name?: string | null;
};

type TrackPoint = { time: number; value: number; debt: number };

const PERIOD_MONTHS: Record<Exclude<LandingPeriod, 'All'>, number> = { '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '5Y': 60 };

export function buildPortfolioLanding(
  properties: Property[],
  units: LandingUnit[],
  transactions: HistoryTransaction[],
  profiles: Record<string, PropertyProfile>,
  options: { series: LandingSeries; path: LandingPath; period: LandingPeriod; now?: Date },
) {
  const now = options.now || new Date();
  const tracks = properties.map(property => ({ property, profile: profiles[property.id], track: propertyTrack(property, profiles[property.id], now) }));
  const current = snapshot(tracks, now.getTime());
  const windowDate = windowStart(options.period, tracks, now);
  const then = snapshot(tracks, windowDate.getTime());
  const equityDelta = current.equity - then.equity;
  const boughtProperties = tracks.filter(item => {
    const purchased = item.track[0]?.time || 0;
    return purchased > windowDate.getTime();
  });
  const bought = boughtProperties.reduce((sum, item) => sum + Number(item.property.purchase_price || 0), 0);
  const paydown = then.debt - current.debt;
  const valueChange = current.value - then.value - bought;
  const shownEquity = Math.round(equityDelta);
  const shownPaydown = Math.round(paydown);
  const shownBought = Math.round(bought);
  const shownValue = shownEquity - shownPaydown - shownBought;
  const putIn = boughtProperties.reduce((sum, item) => sum + invested(item.profile, item.property, windowDate), 0)
    + tracks.filter(item => (item.track[0]?.time || 0) <= windowDate.getTime()).reduce((sum, item) => sum + capexSince(item.profile, windowDate), 0);
  const growthBase = then.equity > 0 ? then.equity : putIn;
  const growth = growthBase > 0 ? (equityDelta - putIn) / growthBase : null;
  const valueDelta = current.value - then.value;
  const debtDelta = current.debt - then.debt;
  const points = options.path === 'payoff'
    ? payoffPoints(tracks, options.series, now)
    : historyPoints(tracks, options.series, options.period, now);
  const flowMonths = cashMonths(properties, units, transactions, now);
  const completedMonths = flowMonths.filter(month => !month.current);
  const entered = completedMonths.reduce((sum, month) => sum + month.postedProperties, 0);
  const propertyMonths = completedMonths.reduce((sum, month) => sum + month.owned, 0);
  const year = yearCash(properties, units, transactions, now);
  const rows = propertyRows(tracks, units, transactions, current.equity, now);
  const coming = comingUp(properties, units, now);
  const averages = monthlyAverages(tracks, units, transactions, now);
  const investor = investorSummary(properties, transactions, current.equity, averages.cashInDeal);
  return {
    current,
    equityDelta: shownEquity,
    bought: shownBought,
    paydown: shownPaydown,
    valueChange: shownValue,
    valueDelta,
    debtDelta,
    putIn,
    growth,
    periodLabel: PERIOD_LABEL[options.period],
    windowValue: seriesValue(then, options.series),
    points,
    flowMonths,
    entered,
    propertyMonths,
    yearFlow: year.cashFlow,
    year,
    lines: {
      value: tracks.map(item => ({ label: shortName(item.property.address), amount: item.track.at(-1)?.value || 0 })),
      debt: tracks.map(item => ({ label: shortName(item.property.address), amount: Number(item.property.mortgage_balance || 0) })),
      deal: tracks.map(item => ({ label: shortName(item.property.address), amount: invested(item.profile, item.property, new Date(0)) })),
    },
    rows,
    coming,
    averages,
    investor,
    propertyCount: properties.length,
    unitCount: units.length,
  };
}

function propertyTrack(property: Property, profile: PropertyProfile | undefined, now: Date): TrackPoint[] {
  const saved = profile || emptyProfile();
  const price = Number(property.purchase_price || 0);
  const currentDebt = Number(property.mortgage_balance || 0);
  const currentValue = saved.estimated_value > 0 ? saved.estimated_value : price;
  const startDebt = saved.paid_in_cash ? 0 : price > 0 && saved.down_payment > 0 ? Math.max(0, price - saved.down_payment) : currentDebt;
  const start = parseDay(property.purchase_date) || parseDay(property.created_at) || now;
  const span = Math.max(1, now.getTime() - start.getTime());
  const debtAt = (time: number) => startDebt + (currentDebt - startDebt) * Math.min(1, Math.max(0, (time - start.getTime()) / span));
  const points: TrackPoint[] = [{ time: start.getTime(), value: price > 0 ? price : currentValue, debt: startDebt }];
  saved.value_history.forEach(entry => {
    const date = parseDay(entry.as_of);
    if (!date) return;
    points.push({ time: date.getTime(), value: Number(entry.amount || 0), debt: debtAt(date.getTime()) });
  });
  if (saved.estimated_value > 0) {
    const asOf = parseDay(saved.estimated_value_as_of) || now;
    points.push({ time: asOf.getTime(), value: saved.estimated_value, debt: debtAt(asOf.getTime()) });
  }
  points.push({ time: now.getTime(), value: currentValue > 0 ? currentValue : price, debt: currentDebt });
  return points.sort((a, b) => a.time - b.time);
}

function snapshot(tracks: { track: TrackPoint[] }[], time: number) {
  return tracks.reduce((sum, item) => {
    if (time < (item.track[0]?.time || 0)) return sum;
    const point = atTime(item.track, time);
    sum.value += point.value;
    sum.debt += point.debt;
    sum.equity += point.value - point.debt;
    return sum;
  }, { value: 0, debt: 0, equity: 0 });
}

function atTime(track: TrackPoint[], time: number) {
  if (!track.length) return { value: 0, debt: 0 };
  if (time <= track[0].time) return track[0];
  const last = track[track.length - 1];
  if (time >= last.time) return last;
  const next = track.findIndex(point => point.time >= time);
  const right = track[next];
  const left = track[next - 1];
  const span = right.time - left.time || 1;
  const t = (time - left.time) / span;
  return { value: left.value + (right.value - left.value) * t, debt: left.debt + (right.debt - left.debt) * t };
}

function windowStart(period: LandingPeriod, tracks: { track: TrackPoint[] }[], now: Date) {
  if (period === 'All') {
    const earliest = tracks.reduce((min, item) => Math.min(min, item.track[0]?.time || now.getTime()), now.getTime());
    return new Date(earliest);
  }
  return new Date(now.getFullYear(), now.getMonth() - PERIOD_MONTHS[period], now.getDate());
}

function historyPoints(tracks: { track: TrackPoint[] }[], series: LandingSeries, period: LandingPeriod, now: Date): LandingPoint[] {
  const earliest = tracks.reduce((min, item) => Math.min(min, item.track[0]?.time || now.getTime()), now.getTime());
  const start = period === 'All' ? new Date(earliest) : new Date(now.getFullYear(), now.getMonth() - (PERIOD_MONTHS[period] - 1), 1);
  const months = Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);
  const step = months > 36 ? Math.ceil(months / 24) : 1;
  const points: LandingPoint[] = [];
  for (let offset = months - 1; offset >= 0; offset -= step) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const snap = snapshot(tracks, date.getTime());
    const showYear = date.getMonth() === 0 || offset === 0 || points.length === 0;
    points.push({ label: date.toLocaleDateString('en-US', showYear ? { month: 'short', year: '2-digit' } : { month: 'short' }), value: seriesValue(snap, series), time: date.getTime() });
  }
  return points;
}

function payoffPoints(tracks: { property: Property; profile?: PropertyProfile; track: TrackPoint[] }[], series: LandingSeries, now: Date): LandingPoint[] | null {
  const models = tracks.map(item => {
    const value = item.profile && item.profile.estimated_value > 0 ? item.profile.estimated_value : Number(item.property.purchase_price || 0);
    return { property: item.property, model: payoffModel(item.property, value), value };
  });
  if (!models.some(item => item.model)) return null;
  const length = Math.max(...models.map(item => (series === 'debt' ? item.model?.debt.length : item.model?.equity?.length) || 1));
  return Array.from({ length }, (_, index) => {
    const value = models.reduce((sum, item) => {
      if (series === 'value') return sum + item.value;
      const source = series === 'debt' ? item.model?.debt : item.model?.equity;
      if (!source?.length) return sum + (series === 'debt' ? Number(item.property.mortgage_balance || 0) : Math.max(0, item.value - Number(item.property.mortgage_balance || 0)));
      return sum + source[Math.min(index, source.length - 1)].value;
    }, 0);
    const labeled = models.find(item => (series === 'debt' ? item.model?.debt : item.model?.equity)?.[index]);
    const source = series === 'debt' ? labeled?.model?.debt : labeled?.model?.equity;
    return { label: source?.[index]?.label || (index === 0 ? 'Now' : String(index)), value, time: now.getTime() + index * 365 * 86400000 };
  });
}

function seriesValue(snap: { equity: number; value: number; debt: number }, series: LandingSeries) {
  if (series === 'value') return snap.value;
  if (series === 'debt') return snap.debt;
  return snap.equity;
}

function cashMonths(properties: Property[], units: LandingUnit[], transactions: HistoryTransaction[], now: Date) {
  return Array.from({ length: 12 }, (_, index) => {
    const offset = 11 - index;
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = monthKey(date);
    const current = offset === 0;
    const totals = { income: 0, expenses: 0, mortgage: 0, cashFlow: 0, postedProperties: 0, owned: 0 };
    let postedThisMonth = 0;
    properties.forEach(property => {
      if (!ownedDuring(property, date)) return;
      totals.owned += 1;
      if (postedCount(transactions, property.id, key) > 0) {
        const month = monthActivity(transactions, property.id, date);
        totals.income += month.cashFlow + month.expenses + month.mortgage;
        totals.expenses += month.expenses;
        totals.mortgage += month.mortgage;
        totals.cashFlow += month.cashFlow;
        postedThisMonth += 1;
        totals.postedProperties += 1;
      } else {
        const rent = recurringRent(property, units);
        const payment = Number(property.monthly_mortgage_payment || 0);
        totals.income += rent;
        totals.mortgage += payment;
        totals.cashFlow += rent - payment;
      }
    });
    const status: FlowStatus = current
      ? (postedThisMonth > 0 ? 'partial' : 'estimated')
      : postedThisMonth === 0
        ? 'estimated'
        : postedThisMonth >= totals.owned
          ? 'entered'
          : 'partial';
    return {
      key,
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      shortLabel: date.toLocaleDateString('en-US', { month: 'short' }),
      income: totals.income,
      expenses: totals.expenses,
      mortgage: totals.mortgage,
      cashFlow: totals.cashFlow,
      status,
      current,
      postedProperties: totals.postedProperties,
      owned: totals.owned,
      enteredLabel: status === 'estimated' ? 'Estimated' : status === 'partial' && current ? 'Partly entered' : `${postedThisMonth} of ${totals.owned} entered`,
    };
  });
}

function postedCount(transactions: HistoryTransaction[], propertyId: string, key: string) {
  return transactions.filter(tx => (tx.status || 'posted') === 'posted' && tx.type !== 'transfer' && tx.property_id === propertyId && tx.transaction_date.startsWith(key)).length;
}

function recurringRent(property: Property, units: LandingUnit[]) {
  return units.filter(unit => unit.property_id === property.id && unit.occupied).reduce((sum, unit) => sum + Number(unit.current_rent || 0), 0);
}

function ownedDuring(property: Property, monthStart: Date) {
  const start = parseDay(property.purchase_date) || parseDay(property.created_at);
  if (!start) return true;
  return start.getTime() < new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1).getTime();
}

function yearCash(properties: Property[], units: LandingUnit[], transactions: HistoryTransaction[], now: Date) {
  const finished = now.getMonth();
  const totals = { income: 0, expenses: 0, mortgage: 0, cashFlow: 0, entered: 0, slots: 0, latest: 0 };
  for (let month = 0; month < finished; month += 1) {
    const date = new Date(now.getFullYear(), month, 1);
    const key = monthKey(date);
    let monthCash = 0;
    properties.forEach(property => {
      if (!ownedDuring(property, date)) return;
      totals.slots += 1;
      if (postedCount(transactions, property.id, key) > 0) {
        const activity = monthActivity(transactions, property.id, date);
        totals.income += activity.cashFlow + activity.expenses + activity.mortgage;
        totals.expenses += activity.expenses;
        totals.mortgage += activity.mortgage;
        totals.cashFlow += activity.cashFlow;
        monthCash += activity.cashFlow;
        totals.entered += 1;
      } else {
        const rent = recurringRent(property, units);
        const payment = Number(property.monthly_mortgage_payment || 0);
        totals.income += rent;
        totals.mortgage += payment;
        totals.cashFlow += rent - payment;
        monthCash += rent - payment;
      }
    });
    totals.latest = monthCash;
  }
  const end = finished > 0 ? new Date(now.getFullYear(), finished - 1, 1) : now;
  return {
    cashFlow: totals.cashFlow,
    income: totals.income,
    expenses: totals.expenses,
    mortgage: totals.mortgage,
    entered: totals.entered,
    slots: totals.slots,
    range: finished > 0 ? `${new Date(now.getFullYear(), 0, 1).toLocaleDateString('en-US', { month: 'short' })} to ${end.toLocaleDateString('en-US', { month: 'short' })}` : 'No finished month yet',
    estimated: totals.slots > totals.entered,
    latestLabel: finished > 0 ? end.toLocaleDateString('en-US', { month: 'long' }) : '',
    latestCash: totals.latest,
  };
}

function propertyRows(tracks: { property: Property; profile?: PropertyProfile; track: TrackPoint[] }[], units: LandingUnit[], transactions: HistoryTransaction[], totalEquity: number, now: Date) {
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return tracks.map((item, index) => {
    const propertyUnits = units.filter(unit => unit.property_id === item.property.id);
    const lastMonth = monthActivity(transactions, item.property.id, last);
    const owned = monthsOwned(item.track[0]?.time || now.getTime(), now);
    const history = buildMonthlyFinancialHistory(transactions, '1Y', item.property.id).filter(month => {
      const [year, monthNumber] = month.key.split('-').map(Number);
      const date = new Date(year, monthNumber - 1, 1);
      return date >= new Date(item.track[0]?.time || 0) && date < new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const entered = history.filter(month => month.income > 0.5 || month.cashExpenses > 0.5);
    const average = entered.length ? entered.reduce((sum, month) => sum + month.cashFlow, 0) / entered.length : 0;
    const equity = currentEquity(item.property, item.profile || emptyProfile()) || 0;
    const expected = propertyUnits.filter(unit => unit.occupied).reduce((sum, unit) => sum + Number(unit.current_rent || 0), 0);
    return {
      id: item.property.id,
      name: shortName(item.property.address),
      city: item.property.city,
      units: propertyUnits.length,
      cashFlow: lastMonth.cashFlow,
      average,
      ownedMonths: owned,
      equity,
      share: totalEquity > 0 ? Math.max(0, equity) / Math.max(totalEquity, 1) : 0,
      expected: expected > 0.5 && lastMonth.rent + 0.5 >= expected * 0.95,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    };
  });
}

function comingUp(properties: Property[], units: LandingUnit[], now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return units.flatMap(unit => {
    if (!unit.occupied || !unit.lease_end_date) return [];
    const end = parseDay(unit.lease_end_date);
    if (!end || end < today) return [];
    const property = properties.find(item => item.id === unit.property_id);
    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (days > 180) return [];
    return [{
      id: `${unit.property_id}-${unit.unit_number}-${unit.lease_end_date}`,
      propertyId: unit.property_id,
      title: `${property ? shortName(property.address) : 'Property'} · ${unit.unit_number || 'Unit'}`,
      detail: unit.tenant_name ? `${unit.tenant_name} · lease ends ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : `Lease ends ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      days,
    }];
  }).sort((a, b) => a.days - b.days).slice(0, 4);
}

function monthlyAverages(tracks: { property: Property; profile?: PropertyProfile; track: TrackPoint[] }[], units: LandingUnit[], transactions: HistoryTransaction[], now: Date) {
  const details = tracks.map(item => {
    let sum = 0;
    let months = 0;
    for (let offset = 12; offset >= 1; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      if (!ownedDuring(item.property, date)) continue;
      const ownedFrom = item.track[0]?.time || now.getTime();
      if (date.getTime() < new Date(new Date(ownedFrom).getFullYear(), new Date(ownedFrom).getMonth(), 1).getTime()) continue;
      months += 1;
      if (postedCount(transactions, item.property.id, monthKey(date)) > 0) sum += monthActivity(transactions, item.property.id, date).cashFlow;
      else sum += recurringRent(item.property, units) - Number(item.property.monthly_mortgage_payment || 0);
    }
    return { label: shortName(item.property.address), months, cashFlow: months ? sum / months : 0 };
  });
  const cashFlow = details.reduce((sum, item) => sum + item.cashFlow, 0);
  const paydown = tracks.reduce((sum, item) => sum + nextPaymentParts(item.property).principal, 0);
  const cashIn = tracks.reduce((sum, item) => sum + invested(item.profile, item.property, new Date(0)), 0);
  return { cashFlow, paydown, total: cashFlow + paydown, cashInDeal: cashIn, details };
}

function investorSummary(properties: Property[], transactions: HistoryTransaction[], equity: number, cashIn: number) {
  const trailing = properties.reduce((sum, property) => sum + buildMonthlyFinancialHistory(transactions, '1Y', property.id).reduce((total, month) => total + month.cashFlow, 0), 0);
  return {
    trailing,
    returnOnEquity: equity > 0 ? trailing / equity : null,
    cashReturn: cashIn > 0 ? trailing / cashIn : null,
  };
}

function invested(profile: PropertyProfile | undefined, property: Property, since: Date) {
  const saved = profile || emptyProfile();
  const purchased = parseDay(property.purchase_date) || parseDay(property.created_at);
  const base = purchased && purchased >= since ? cashInDeal(saved) : 0;
  return base + capexSince(saved, since);
}

function capexSince(profile: PropertyProfile | undefined, since: Date) {
  return (profile?.capital_expenditures || []).reduce((sum, item) => {
    const date = parseDay(item.date);
    if (date && date < since) return sum;
    return sum + Number(item.amount || 0);
  }, 0);
}

function monthsOwned(start: number, now: Date) {
  const date = new Date(start);
  const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  return Math.max(1, Math.min(12, months || 1));
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseDay(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortName(address: string) {
  return address.split(',')[0]?.trim() || address;
}

const SERIES_COLORS = [
  'var(--chart-series-utilities)',
  'var(--chart-series-management)',
  'var(--chart-series-leasing)',
  'var(--chart-series-taxes)',
  'var(--chart-income)',
  'var(--chart-series-legal)',
];

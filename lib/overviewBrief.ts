import { categoryKey } from './accounting';
import { isOperatingExpenseCategory } from './propertyFinancials';
import { settleRentCollection, type RentLedgerRow } from './rentCollection';
import { propertyChipName, shortPropertyName } from './formatters';
import { buildUpcomingReminders } from './upcomingReminders';

export type BriefTone = 'positive' | 'negative' | 'neutral';
export type PulseStatus = 'On track' | 'Watch' | 'Needs attention';

export type BriefTransaction = RentLedgerRow & {
  id: string;
  property_id?: string | null;
  unit_id?: string | null;
  transaction_date: string;
  type?: string | null;
  amount?: number | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  is_new_import?: boolean | null;
  source?: string | null;
  needs_review?: boolean | null;
};

export type BriefProperty = {
  id: string;
  address: string;
  management_fee_percent?: number | null;
};

export type BriefUnit = {
  id: string;
  property_id: string;
  unit_number?: string | null;
  occupied?: boolean | null;
  current_rent?: number | null;
  lease_end_date?: string | null;
};

export type BriefDocument = {
  id: string;
  property_id: string;
  unit_id?: string | null;
  category?: string | null;
  title?: string | null;
  notes?: string | null;
  expires_at?: string | null;
};

export type BriefUpdate = {
  id: string;
  title: string;
  context: string;
  tone: BriefTone;
  priority: number;
  important: boolean;
  lead?: boolean;
};

export type PropertyPulseRow = {
  id: string;
  name: string;
  status: PulseStatus | null;
  detail: string;
};

export type UpcomingDate = {
  id: string;
  month: string;
  day: string;
  title: string;
  detail: string;
  when: string;
  href: string;
  sort: number;
};

export type OverviewBrief = {
  kicker: string;
  updates: BriefUpdate[];
  more: boolean;
  properties: PropertyPulseRow[];
  upcoming: UpcomingDate[];
};

const LARGE_EXPENSE = 250;
const LEASE_WATCH_DAYS = 45;

function dateKey(value?: string | null) {
  const key = (value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

function dayNumber(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayKey(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthKey(now: Date) {
  return todayKey(now).slice(0, 7);
}

function monthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function stamp(tx: BriefTransaction) {
  const raw = tx.created_at || tx.confirmed_at;
  if (raw) {
    const time = new Date(raw).getTime();
    if (!Number.isNaN(time)) return time;
  }
  const key = dateKey(tx.transaction_date);
  return key ? new Date(`${key}T12:00:00`).getTime() : 0;
}

function posted(tx: BriefTransaction) {
  return (tx.status || 'posted') === 'posted';
}

function signed(tx: { amount?: number | null }) {
  return Number(tx.amount || 0);
}

function shortDate(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function needsReview(tx: BriefTransaction) {
  return Boolean(tx.needs_review) || categoryKey(tx.category || '') === 'review' || /needs review|uncategor/i.test(tx.category || '');
}

function isMoneyIn(tx: BriefTransaction) {
  if (tx.type !== 'income' || needsReview(tx)) return false;
  const key = categoryKey(tx.category || '');
  if (key === 'rent') return true;
  return (key === 'other-income' || key === 'refund') && Math.abs(signed(tx)) >= LARGE_EXPENSE;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildOverviewBrief(input: {
  properties: BriefProperty[];
  units: BriefUnit[];
  transactions: BriefTransaction[];
  documents?: BriefDocument[];
  propertyId?: string;
  since?: string | null;
  now?: Date;
}): OverviewBrief {
  const now = input.now || new Date();
  const propertyId = input.propertyId || '';
  const properties = propertyId ? input.properties.filter((property) => property.id === propertyId) : input.properties;
  const propertyIds = new Set(properties.map((property) => property.id));
  const units = input.units.filter((unit) => propertyIds.has(unit.property_id));
  const transactions = input.transactions.filter((tx) => !propertyId || tx.property_id === propertyId);
  const postedRows = transactions.filter(posted);
  const hasPriorVisit = Boolean(input.since);
  const since = input.since ? new Date(input.since).getTime() : monthStart(now);
  const fresh = postedRows.filter((tx) => stamp(tx) > since);
  const names = new Map(properties.map((property) => [property.id, shortPropertyName(property.address)]));

  const health = properties.map((property) => propertyHealth(property, units, postedRows, now));
  const updates = financialInsights(properties, postedRows, fresh, names, now);

  return {
    kicker: hasPriorVisit ? 'Since your last visit' : 'This month',
    updates,
    more: updates.length > 1,
    properties: health,
    upcoming: buildUpcoming(properties, units, input.documents || [], now).slice(0, 5),
  };
}

const UTILITY_KINDS = [
  { kind: 'gas', label: 'Gas', test: /\benbridge\b|\bgas\b/i },
  { kind: 'sewer', label: 'Sewer', test: /\bsewer\b/i },
  { kind: 'water', label: 'Water', test: /\bwater\b/i },
  { kind: 'electric', label: 'Electricity', test: /\belectric|\billuminat|\bpower\b/i },
] as const;

const MORTGAGE_KEYS = new Set(['mortgage', 'mortgage-interest', 'mortgage-principal']);
const MIN_RECEIPT = 250;
const MIN_SHIFT = 25;

function utilityKind(tx: BriefTransaction) {
  if (tx.type === 'income') return null;
  const vendor = `${tx.payee_source || ''} ${tx.description || ''} ${tx.notes || ''}`;
  const utilityCategory = categoryKey(tx.category || '') === 'utilities';
  if (!utilityCategory && !/\benbridge\b/i.test(vendor)) return null;
  for (const pattern of UTILITY_KINDS) {
    if (pattern.kind === 'gas' && /gas station/i.test(vendor) && !/enbridge/i.test(vendor)) continue;
    if (pattern.test.test(vendor)) return pattern;
  }
  return utilityCategory ? { kind: 'utilities', label: 'Utilities' } : null;
}

function dollars(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(Math.abs(amount)));
}

function priorMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function rowsFor(rows: BriefTransaction[], propertyId: string, key: string) {
  return rows.filter((tx) => tx.property_id === propertyId && (tx.transaction_date || '').startsWith(key) && !needsReview(tx));
}

function amountOf(tx: BriefTransaction) {
  return Math.abs(signed(tx));
}

function shift(current: number, prior: number) {
  if (prior < 0.5) return null;
  const delta = current - prior;
  const ratio = Math.abs(delta) / prior;
  if (Math.abs(delta) < MIN_SHIFT) return null;
  if (ratio < 0.15 && Math.abs(delta) < 100) return null;
  return { delta, percent: Math.round(ratio * 100) };
}

function spendLabel(category: string) {
  const key = categoryKey(category || '');
  if (key === 'maintenance') return 'Repairs';
  if (key === 'insurance') return 'Insurance';
  if (key === 'taxes') return 'Property tax';
  if (key === 'legal') return 'Legal';
  if (key === 'leasing') return 'Leasing';
  if (key === 'management') return 'Management';
  if (key === 'utilities') return 'Utilities';
  return (category || 'Expense').trim();
}

function financialInsights(
  properties: BriefProperty[],
  postedRows: BriefTransaction[],
  fresh: BriefTransaction[],
  names: Map<string, string>,
  now: Date,
): BriefUpdate[] {
  const currentKey = monthKey(now);
  const previousKey = monthKey(priorMonth(now));
  const previousLabel = priorMonth(now).toLocaleDateString('en-US', { month: 'long' });
  const chips = new Map(properties.map((property) => [property.id, propertyChipName(property.address)]));
  const candidates: BriefUpdate[] = [];
  const coveredSpend = new Set<string>();

  const receipts = new Map<string, BriefTransaction[]>();
  fresh.filter((tx) => isMoneyIn(tx) && amountOf(tx) >= MIN_RECEIPT).forEach((tx) => {
    const id = tx.property_id || '';
    receipts.set(id, [...(receipts.get(id) || []), tx]);
  });
  const receiptCards = [...receipts.entries()]
    .map(([id, rows]) => ({ id, rows, total: rows.reduce((sum, tx) => sum + amountOf(tx), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);
  receiptCards.forEach((card, index) => {
    const dates = card.rows.map((tx) => dateKey(tx.transaction_date)).filter(Boolean).sort();
    const dateLabel = dates.length && dates[0] === dates[dates.length - 1] ? shortDate(dates[0]) : dates.length ? `${shortDate(dates[0])}–${shortDate(dates[dates.length - 1])}` : '';
    candidates.push({
      id: index === 0 ? 'money-in' : `money-${card.id}`,
      title: `${formatBriefAmount(card.total)} received`,
      context: [names.get(card.id) || '', dateLabel].filter(Boolean).join(' · '),
      tone: 'positive',
      priority: 0,
      important: false,
      lead: true,
    });
  });

  properties.forEach((property) => {
    const current = rowsFor(postedRows, property.id, currentKey);
    const previous = rowsFor(postedRows, property.id, previousKey);
    const chip = chips.get(property.id) || names.get(property.id) || '';

    const flow = (rows: BriefTransaction[]) => rows.reduce((sum, tx) => {
      const key = categoryKey(tx.category || '');
      if (key === 'extra-principal') return sum;
      if (tx.type === 'income') return sum + amountOf(tx);
      if (tx.type === 'expense') return sum - amountOf(tx);
      return sum;
    }, 0);
    const currentFlow = flow(current);
    const previousFlow = flow(previous);
    const flowActive = (rows: BriefTransaction[]) => rows.some((tx) => tx.type === 'income' || (tx.type === 'expense' && categoryKey(tx.category || '') !== 'extra-principal'));
    const flowDelta = currentFlow - previousFlow;
    const receipt = receiptCards.find((card) => card.id === property.id);
    const flowRepeatsReceipt = receipt && Math.abs(Math.abs(flowDelta) - receipt.total) < Math.max(50, receipt.total * 0.2);
    if (flowActive(current) && flowActive(previous) && Math.abs(flowDelta) >= 100 && !flowRepeatsReceipt) {
      const improved = flowDelta > 0;
      candidates.push({
        id: `flow-${property.id}`,
        title: `${chip} cash flow ${improved ? 'improved' : 'softened'}`,
        context: `${formatBriefAmount(flowDelta)} vs ${previousLabel}`,
        tone: improved ? 'positive' : 'negative',
        priority: 1,
        important: false,
      });
    }

    const utilityTotal = (rows: BriefTransaction[], kind?: string) => rows.reduce((sum, tx) => {
      const found = utilityKind(tx);
      if (!found || (kind && found.kind !== kind)) return sum;
      return sum + amountOf(tx);
    }, 0);
    const specific = UTILITY_KINDS.map((pattern) => {
      const change = shift(utilityTotal(current, pattern.kind), utilityTotal(previous, pattern.kind));
      return change ? { pattern, change, prior: utilityTotal(previous, pattern.kind), current: utilityTotal(current, pattern.kind) } : null;
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));
    specific.forEach((item) => {
      const sample = [...current, ...previous].find((tx) => utilityKind(tx)?.kind === item.pattern.kind);
      const vendor = (sample?.payee_source || '').trim() || item.pattern.label;
      const increased = item.change.delta > 0;
      candidates.push({
        id: `${item.pattern.kind}-${property.id}`,
        title: `${item.pattern.label} cost ${increased ? 'increased' : 'decreased'} ${item.change.percent}%`,
        context: `${vendor} · ${dollars(item.current)} vs ${dollars(item.prior)} last month`,
        tone: increased ? 'negative' : 'positive',
        priority: 3,
        important: false,
      });
      coveredSpend.add(property.id);
    });
    if (!specific.length) {
      const change = shift(utilityTotal(current), utilityTotal(previous));
      if (change) {
        const increased = change.delta > 0;
        candidates.push({
          id: `utilities-${property.id}`,
          title: `Utilities ${increased ? 'up' : 'down'} ${change.percent}%`,
          context: `${chip} · ${dollars(utilityTotal(current))} vs ${dollars(utilityTotal(previous))} last month`,
          tone: increased ? 'negative' : 'positive',
          priority: 2,
          important: false,
        });
        coveredSpend.add(property.id);
      }
    }

    const operating = (rows: BriefTransaction[]) => rows.reduce((sum, tx) => {
      if (tx.type !== 'expense') return sum;
      const key = categoryKey(tx.category || '');
      if (MORTGAGE_KEYS.has(key) || key === 'extra-principal' || utilityKind(tx) || needsReview(tx)) return sum;
      return sum + amountOf(tx);
    }, 0);
    const expenseChange = shift(operating(current), operating(previous));
    if (expenseChange && Math.abs(expenseChange.delta) >= 100) {
      candidates.push({
        id: `expenses-${property.id}`,
        title: expenseChange.delta > 0 ? 'Expenses higher than last month' : 'Expenses lower than last month',
        context: `${chip} · ${formatBriefAmount(expenseChange.delta)}`,
        tone: expenseChange.delta > 0 ? 'negative' : 'positive',
        priority: 4,
        important: false,
      });
      coveredSpend.add(property.id);
    }

    const rent = (rows: BriefTransaction[]) => rows.reduce((sum, tx) => sum + (tx.type === 'income' && categoryKey(tx.category || '') === 'rent' ? amountOf(tx) : 0), 0);
    const rentChange = shift(rent(current), rent(previous));
    const rentRepeatsReceipt = receipt && rentChange && Math.abs(Math.abs(rentChange.delta) - receipt.total) < 50;
    if (rentChange && !rentRepeatsReceipt) {
      candidates.push({
        id: `rent-${property.id}`,
        title: rentChange.delta > 0 ? 'Rent higher than last month' : 'Rent lower than last month',
        context: `${chip} · ${dollars(rent(current))} vs ${dollars(rent(previous))} last month`,
        tone: rentChange.delta > 0 ? 'positive' : 'negative',
        priority: 5,
        important: false,
      });
    }

    const principal = current.reduce((sum, tx) => {
      const key = categoryKey(tx.category || '');
      return key === 'mortgage-principal' || key === 'extra-principal' ? sum + amountOf(tx) : sum;
    }, 0);
    if (principal >= 50) {
      candidates.push({
        id: `principal-${property.id}`,
        title: 'Mortgage principal reduced',
        context: `${chip} · ${dollars(principal)} this month`,
        tone: 'positive',
        priority: 6,
        important: false,
      });
    }
  });

  fresh.filter((tx) => tx.type === 'expense' && amountOf(tx) >= MIN_RECEIPT && !needsReview(tx)).forEach((tx) => {
    const key = categoryKey(tx.category || '');
    if (MORTGAGE_KEYS.has(key) || key === 'extra-principal' || utilityKind(tx)) return;
    if (coveredSpend.has(tx.property_id || '')) return;
    candidates.push({
      id: `spent-${tx.id}`,
      title: `${formatBriefAmount(-amountOf(tx))} spent`,
      context: [names.get(tx.property_id || '') || '', spendLabel(tx.category || ''), shortDate(dateKey(tx.transaction_date))].filter(Boolean).join(' · '),
      tone: 'negative',
      priority: 0,
      important: false,
    });
  });

  const ranked = candidates.sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  return ranked.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 6);
}

export function propertyHealth(property: BriefProperty, units: BriefUnit[], transactions: ActivityRow[], now: Date) {
  const month = monthKey(now);
  const today = todayKey(now);
  const propertyUnits = units.filter((unit) => unit.property_id === property.id);
  const occupied = propertyUnits.filter((unit) => unit.occupied);
  const vacantUnits = propertyUnits.filter((unit) => unit.occupied === false);
  const expected = occupied.reduce((sum, unit) => sum + Math.max(0, Number(unit.current_rent || 0)), 0);
  const monthRows = transactions.filter((tx) => tx.property_id === property.id && (tx.transaction_date || '').startsWith(month));
  const deposits = monthRows.filter((tx) => tx.type === 'income' && categoryKey(tx.category || '') === 'rent');
  const received = deposits.reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const settled = expected > 0.5
    ? settleRentCollection({
      expected,
      net: received,
      expenses: monthRows.filter((tx) => tx.type === 'expense').map((tx) => ({ ...tx, id: tx.id || 'expense' })),
      deposits: deposits.map((tx) => ({ ...tx, id: tx.id || 'deposit' })),
      feePercent: property.management_fee_percent,
    })
    : null;
  const unusual = unusualExpense(property.id, transactions, now);
  const rentShort = Boolean(settled && settled.unpaid > 0.5);
  const rentComplete = Boolean(settled && settled.unpaid < 0.5 && expected > 0.5);
  const tagged = deposits.some((tx) => tx.unit_id);
  const uncovered = occupied.filter((unit) => {
    const rent = Math.max(0, Number(unit.current_rent || 0));
    if (rent < 0.5) return false;
    const got = deposits.filter((tx) => tx.unit_id === unit.id).reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
    return got + 0.5 < rent;
  });
  const missing = rentShort ? (tagged ? (uncovered.length || 1) : 1) : 0;
  const lease = occupied
    .map((unit) => dateKey(unit.lease_end_date))
    .filter(Boolean)
    .map((end) => ({ end, days: Math.round((dayNumber(end) - dayNumber(today)) / 86400000) }))
    .filter((item) => item.days >= 0 && item.days <= LEASE_WATCH_DAYS)
    .sort((a, b) => a.days - b.days)[0];

  const parts: string[] = [];
  if (received > 0.5) parts.push(`${formatBriefAmount(received)} received`);
  if (vacantUnits.length) parts.push(vacantUnits.length === 1 ? '1 vacant unit' : `${vacantUnits.length} vacant units`);
  if (now.getDate() >= 10 && rentShort) parts.push('Rent outstanding');
  if (unusual) parts.push('Large expense');
  if (lease) parts.push(`Lease ends ${shortDate(lease.end)}`);
  if (!parts.length && now.getDate() < 10 && rentShort) parts.push('Waiting on rent');
  if (!parts.length && rentComplete) parts.push('Rent fully collected');

  let status: PulseStatus | null = null;
  if (vacantUnits.length || (now.getDate() >= 10 && rentShort) || unusual) status = 'Needs attention';
  else if ((now.getDate() < 10 && rentShort) || lease) status = 'Watch';
  else if (rentComplete || received > 0.5) status = 'On track';

  return {
    id: property.id,
    name: shortPropertyName(property.address),
    chip: propertyChipName(property.address),
    status,
    detail: parts.join(' · '),
    vacant: vacantUnits.length,
    unusual,
    rentShort,
    missing,
  };
}

type ActivityRow = {
  id?: string;
  property_id?: string | null;
  unit_id?: string | null;
  transaction_date?: string | null;
  type?: string | null;
  category?: string | null;
  amount?: number | null;
  status?: string | null;
  description?: string | null;
  payee_source?: string | null;
  notes?: string | null;
  source?: string | null;
};

function unusualExpense(propertyId: string, transactions: ActivityRow[], now: Date) {
  const month = monthKey(now);
  const current = transactions.filter((tx) => tx.property_id === propertyId && (tx.transaction_date || '').startsWith(month) && tx.type === 'expense' && isOperatingExpenseCategory(tx.category || ''));
  const largest = current.reduce((max, tx) => Math.max(max, Math.abs(signed(tx))), 0);
  if (largest < LARGE_EXPENSE) return false;
  const prior: number[] = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const total = transactions
      .filter((tx) => tx.property_id === propertyId && (tx.transaction_date || '').startsWith(key) && tx.type === 'expense' && isOperatingExpenseCategory(tx.category || ''))
      .reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
    if (total > 0.5) prior.push(total);
  }
  if (prior.length < 2) return false;
  return largest > median(prior) * 1.5;
}

function buildUpcoming(properties: BriefProperty[], units: BriefUnit[], documents: BriefDocument[], now: Date): UpcomingDate[] {
  return buildUpcomingReminders(properties, units, documents, now).map((item) => ({
    id: item.id,
    month: item.month,
    day: item.day,
    title: item.title,
    detail: item.detail,
    when: item.when,
    href: item.href,
    sort: item.sort,
  }));
}

export function formatBriefAmount(amount: number) {
  const rounded = Math.round(amount);
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(rounded));
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return text;
}

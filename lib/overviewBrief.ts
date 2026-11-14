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

function nameList(names: string[]) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 2) return unique.join(' · ');
  return `${unique.slice(0, 2).join(' · ')} · +${unique.length - 2}`;
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
  const day = now.getDate();
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

  const money = fresh.filter(isMoneyIn);
  const moneyIn = money.reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const candidates: BriefUpdate[] = [];
  if (moneyIn > 0.5) {
    const dates = money.map((tx) => dateKey(tx.transaction_date)).filter(Boolean).sort();
    const dateLabel = dates.length && dates[0] === dates[dates.length - 1] ? shortDate(dates[0]) : dates.length ? `${shortDate(dates[0])}–${shortDate(dates[dates.length - 1])}` : '';
    const moneyNames = [...new Set(money.map((tx) => names.get(tx.property_id || '') || ''))];
    const context = moneyNames.length === 1 ? [moneyNames[0], dateLabel].filter(Boolean).join(' · ') : moneyNames.length === 2 ? moneyNames.join(' · ') : [moneyNames.length ? `${moneyNames.length} properties` : '', dateLabel].filter(Boolean).join(' · ');
    candidates.push({ id: 'money-in', title: `${formatBriefAmount(moneyIn)} received`, context, tone: 'positive', priority: 0, important: false, lead: true });
  }

  const health = properties.map((property) => propertyHealth(property, units, postedRows, now));
  const gaps = health.filter((row) => row.rentShort && day >= 10);
  if (gaps.length) {
    const count = gaps.reduce((sum, row) => sum + row.missing, 0);
    candidates.push({
      id: 'rent-missing',
      title: count === 1 ? '1 rent payment outstanding' : `${count} rent payments outstanding`,
      context: nameList(gaps.map((row) => row.chip)),
      tone: 'negative',
      priority: 1,
      important: true,
    });
  }

  const attention = health.filter((row) => row.vacant > 0 || row.unusual);
  if (attention.length) {
    const lead = attention[0];
    candidates.push({
      id: 'attention',
      title: attention.length === 1 ? '1 property needs attention' : `${attention.length} properties need attention`,
      context: attention.length === 1 ? `${lead.name} · ${attentionReason(lead)}` : attention.map((row) => attentionReason(row)).join(' · '),
      tone: 'neutral',
      priority: 2,
      important: true,
    });
  }

  const review = fresh.filter(needsReview);
  if (review.length) {
    candidates.push({
      id: 'review',
      title: review.length === 1 ? '1 bank transaction needs review' : `${review.length} bank transactions need review`,
      context: nameList(review.map((tx) => names.get(tx.property_id || '') || '')),
      tone: 'neutral',
      priority: 3,
      important: false,
    });
  }

  const principal = fresh.filter((tx) => categoryKey(tx.category || '') === 'extra-principal' && Math.abs(signed(tx)) >= LARGE_EXPENSE);
  const principalTotal = principal.reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  if (principalTotal > 0.5) {
    const latest = [...principal].sort((a, b) => dateKey(b.transaction_date).localeCompare(dateKey(a.transaction_date)))[0];
    candidates.push({
      id: 'principal',
      title: `${formatBriefAmount(principalTotal)} extra principal`,
      context: [names.get(latest.property_id || '') || '', shortDate(dateKey(latest.transaction_date))].filter(Boolean).join(' · '),
      tone: 'neutral',
      priority: 4,
      important: principalTotal >= 1000,
    });
  }

  const soon = units.flatMap((unit) => {
    if (!unit.occupied) return [];
    const end = dateKey(unit.lease_end_date);
    if (!end) return [];
    const days = Math.round((dayNumber(end) - dayNumber(todayKey(now))) / 86400000);
    if (days < 0 || days > 30) return [];
    return [{ unit, days, end }];
  }).sort((a, b) => a.days - b.days);
  if (soon.length) {
    const lead = soon[0];
    const unitName = (lead.unit.unit_number || '').trim().replace(/^unit\s+/i, '');
    candidates.push({
      id: 'lease',
      title: soon.length === 1 ? 'Lease ending soon' : `${soon.length} leases ending soon`,
      context: [names.get(lead.unit.property_id) || '', unitName ? `Unit ${unitName}` : '', shortDate(lead.end)].filter(Boolean).join(' · '),
      tone: 'neutral',
      priority: 5,
      important: lead.days <= 14,
    });
  }

  const ranked = candidates.sort((a, b) => a.priority - b.priority);
  const updates = ranked.slice(0, 6);
  const routineLeft = fresh.some((tx) => !isMoneyIn(tx) && categoryKey(tx.category || '') !== 'extra-principal' && !needsReview(tx));
  const more = ranked.length > updates.length || routineLeft || money.length > 1;
  if (!updates.length) {
    updates.push({
      id: 'quiet',
      title: hasPriorVisit ? 'Nothing new since your last visit' : 'Nothing new this month',
      context: '',
      tone: 'neutral',
      priority: 9,
      important: false,
    });
  }

  return {
    kicker: hasPriorVisit ? 'Since your last visit' : 'This month',
    updates,
    more: updates[0]?.id === 'quiet' ? false : more,
    properties: health,
    upcoming: buildUpcoming(properties, units, input.documents || [], now).slice(0, 5),
  };
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

function attentionReason(row: { vacant: number; unusual: boolean }) {
  const parts: string[] = [];
  if (row.vacant) parts.push(row.vacant === 1 ? '1 vacant unit' : `${row.vacant} vacant units`);
  if (row.unusual) parts.push('Large expense');
  return parts.join(' · ') || 'Needs a look';
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

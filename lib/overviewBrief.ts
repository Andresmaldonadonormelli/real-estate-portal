import { categoryKey } from './accounting';
import { isOperatingExpenseCategory } from './propertyFinancials';
import { settleRentCollection, type RentLedgerRow } from './rentCollection';
import { shortPropertyName } from './formatters';

export type BriefTone = 'positive' | 'negative' | 'neutral';
export type PulseStatus = 'On track' | 'Behind' | 'Stable';

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
  category?: string | null;
  title?: string | null;
  expires_at?: string | null;
};

export type BriefLine = {
  id: string;
  label: string;
  amount: number | null;
  tone: BriefTone;
};

export type BriefActivity = {
  id: string;
  title: string;
  amount: number;
  tone: 'positive' | 'negative';
  property: string;
  date: string;
};

export type PropertyPulseRow = {
  id: string;
  name: string;
  status: PulseStatus;
  amount: number | null;
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
  lines: BriefLine[];
  activity: BriefActivity[];
  properties: PropertyPulseRow[];
  upcoming: UpcomingDate[];
};

const LARGE_EXPENSE = 250;
const ACTIVITY_RANK: Record<string, number> = {
  rent: 0,
  mortgage: 1,
  'mortgage-interest': 1,
  'mortgage-principal': 1,
  management: 2,
  'extra-principal': 3,
};

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

function signed(tx: BriefTransaction) {
  return Number(tx.amount || 0);
}

function activityRank(tx: BriefTransaction) {
  const key = categoryKey(tx.category || '');
  if (key in ACTIVITY_RANK) return ACTIVITY_RANK[key];
  if (tx.type === 'expense' && Math.abs(signed(tx)) >= LARGE_EXPENSE) return 4;
  if (tx.type === 'income' && key !== 'review') return 5;
  return 9;
}

function activityTitle(tx: BriefTransaction) {
  const key = categoryKey(tx.category || '');
  if (key === 'rent' && tx.type === 'income') return 'Rent received';
  if (key === 'management') return 'Management fee';
  if (key === 'mortgage' || key === 'mortgage-interest' || key === 'mortgage-principal') return 'Mortgage payment';
  if (key === 'extra-principal') return 'Extra principal';
  const category = (tx.category || '').trim();
  if (!category || /needs review|uncategor/i.test(category)) return tx.type === 'income' ? 'Money in' : 'Expense';
  return category;
}

function countsAsCash(tx: BriefTransaction) {
  const key = categoryKey(tx.category || '');
  if (key === 'extra-principal' || key === 'contribution' || key === 'distribution' || key === 'non-operating') return false;
  return tx.type === 'income' || tx.type === 'expense';
}

function relativeWhen(days: number) {
  if (days < 0) return days === -1 ? '1 day ago' : `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 45) return `In ${days} days`;
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? 'In about 1 month' : `In about ${months} months`;
}

function eventTitle(category: string) {
  const key = categoryKey(category);
  if (key === 'insurance') return 'Insurance renewal';
  if (key === 'taxes') return 'Property tax due';
  if (/inspect/i.test(category)) return 'Inspection';
  if (/lease/i.test(category)) return 'Lease ending';
  return category.trim() || 'Reminder';
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
  const month = monthKey(now);
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

  const rentIn = fresh.filter((tx) => tx.type === 'income' && categoryKey(tx.category || '') === 'rent').reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const management = fresh.filter((tx) => categoryKey(tx.category || '') === 'management').reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const mortgage = fresh.filter((tx) => ['mortgage', 'mortgage-interest', 'mortgage-principal'].includes(categoryKey(tx.category || ''))).reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const largestExpense = fresh
    .filter((tx) => tx.type === 'expense' && !['management', 'mortgage', 'mortgage-interest', 'mortgage-principal', 'extra-principal'].includes(categoryKey(tx.category || '')))
    .sort((a, b) => Math.abs(signed(b)) - Math.abs(signed(a)))[0];
  const imports = fresh.filter((tx) => tx.is_new_import && tx.source === 'plaid');
  const net = fresh.filter(countsAsCash).reduce((sum, tx) => sum + signed(tx), 0);
  const moneyEvents = (rentIn > 0.5 ? 1 : 0) + (management > 0.5 ? 1 : 0) + (mortgage > 0.5 ? 1 : 0) + (largestExpense && Math.abs(signed(largestExpense)) >= LARGE_EXPENSE ? 1 : 0);

  const lines: BriefLine[] = [];
  if (rentIn > 0.5) lines.push({ id: 'rent-in', label: 'Rent received', amount: rentIn, tone: 'positive' });
  if (management > 0.5) lines.push({ id: 'management', label: 'Management fee', amount: -management, tone: 'negative' });
  if (mortgage > 0.5) lines.push({ id: 'mortgage', label: 'Mortgage payment', amount: -mortgage, tone: 'negative' });
  if (largestExpense && Math.abs(signed(largestExpense)) >= LARGE_EXPENSE) {
    lines.push({ id: `expense-${largestExpense.id}`, label: activityTitle(largestExpense), amount: -Math.abs(signed(largestExpense)), tone: 'negative' });
  }
  if (moneyEvents > 1 && Math.abs(net) > 0.5) {
    lines.push({ id: 'net', label: hasPriorVisit ? 'Net cash since you last checked' : 'Net cash this month', amount: net, tone: net > 0 ? 'positive' : 'negative' });
  }
  if (imports.length) lines.push({ id: 'bank', label: imports.length === 1 ? '1 new bank transaction' : `${imports.length} new bank transactions`, amount: null, tone: 'neutral' });

  let missingPayments = 0;
  properties.forEach((property) => {
    const propertyUnits = units.filter((unit) => unit.property_id === property.id && unit.occupied);
    const expected = propertyUnits.reduce((sum, unit) => sum + Math.max(0, Number(unit.current_rent || 0)), 0);
    if (expected < 0.5) return;
    const monthRows = postedRows.filter((tx) => tx.property_id === property.id && tx.transaction_date.startsWith(month));
    const deposits = monthRows.filter((tx) => tx.type === 'income' && categoryKey(tx.category || '') === 'rent');
    const settled = settleRentCollection({
      expected,
      net: deposits.reduce((sum, tx) => sum + Math.abs(signed(tx)), 0),
      expenses: monthRows.filter((tx) => tx.type === 'expense'),
      deposits,
      feePercent: property.management_fee_percent,
    });
    if (settled.unpaid < 0.5) return;
    const tagged = deposits.some((tx) => tx.unit_id);
    const uncovered = propertyUnits.filter((unit) => {
      const rent = Math.max(0, Number(unit.current_rent || 0));
      if (rent < 0.5) return false;
      const received = deposits.filter((tx) => tx.unit_id === unit.id).reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
      return received + 0.5 < rent;
    });
    missingPayments += tagged ? (uncovered.length || 1) : 1;
  });

  if (day >= 10 && missingPayments > 0) {
    lines.push({
      id: 'rent-missing',
      label: missingPayments === 1 ? '1 expected rent payment still missing' : `${missingPayments} expected rent payments still missing`,
      amount: null,
      tone: 'negative',
    });
  } else if (missingPayments === 0 && units.some((unit) => unit.occupied && Number(unit.current_rent || 0) > 0.5)) {
    lines.push({ id: 'rent-complete', label: 'All expected rent received', amount: null, tone: 'positive' });
  } else if (day < 10 && missingPayments > 0) {
    lines.push({ id: 'rent-waiting', label: 'Rent is still coming in', amount: null, tone: 'neutral' });
  }

  if (!lines.length) {
    lines.push({ id: 'quiet', label: hasPriorVisit ? 'Nothing new since you last checked' : 'Nothing new to catch up on', amount: null, tone: 'neutral' });
  }
  const standing = lines.filter((line) => line.id === 'rent-missing' || line.id === 'rent-complete' || line.id === 'rent-waiting' || line.id === 'quiet');
  const headline = lines.filter((line) => !standing.includes(line));
  const visible = [...headline.slice(0, standing.length ? 3 : 4), ...standing].slice(0, 4);

  const activity = postedRows
    .filter((tx) => tx.transaction_date.startsWith(month) && activityRank(tx) < 9)
    .sort((a, b) => dateKey(b.transaction_date).localeCompare(dateKey(a.transaction_date)) || activityRank(a) - activityRank(b))
    .slice(0, 4)
    .map((tx) => ({
      id: tx.id,
      title: activityTitle(tx),
      amount: signed(tx),
      tone: signed(tx) < 0 ? 'negative' as const : 'positive' as const,
      property: names.get(tx.property_id || '') || 'Portfolio',
      date: new Date(`${dateKey(tx.transaction_date)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

  const pulses = properties.map((property) => propertyPulse(property, units, postedRows, now));
  const upcoming = buildUpcoming(properties, units, input.documents || [], now).slice(0, 5);

  return {
    kicker: hasPriorVisit ? 'Since you last checked' : 'This month',
    lines: visible,
    activity,
    properties: pulses,
    upcoming,
  };
}

function propertyPulse(property: BriefProperty, units: BriefUnit[], transactions: BriefTransaction[], now: Date): PropertyPulseRow {
  const month = monthKey(now);
  const propertyUnits = units.filter((unit) => unit.property_id === property.id);
  const occupied = propertyUnits.filter((unit) => unit.occupied);
  const vacant = propertyUnits.filter((unit) => !unit.occupied);
  const expected = occupied.reduce((sum, unit) => sum + Math.max(0, Number(unit.current_rent || 0)), 0);
  const monthRows = transactions.filter((tx) => tx.property_id === property.id && tx.transaction_date.startsWith(month));
  const deposits = monthRows.filter((tx) => tx.type === 'income' && categoryKey(tx.category || '') === 'rent');
  const settled = expected > 0.5
    ? settleRentCollection({
      expected,
      net: deposits.reduce((sum, tx) => sum + Math.abs(signed(tx)), 0),
      expenses: monthRows.filter((tx) => tx.type === 'expense'),
      deposits,
      feePercent: property.management_fee_percent,
    })
    : null;
  const income = monthRows.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const operating = monthRows.filter((tx) => tx.type === 'expense' && isOperatingExpenseCategory(tx.category || '')).reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
  const hasOperatingActivity = income > 0.5 || operating > 0.5;
  const cash = hasOperatingActivity ? income - operating : null;
  const unusual = unusualExpense(property.id, transactions, now);
  const rentShort = Boolean(settled && settled.unpaid > 0.5);
  const rentComplete = Boolean(settled && settled.unpaid < 0.5 && expected > 0.5);

  let status: PulseStatus = 'Stable';
  let detail = 'Not enough activity to judge';
  if (vacant.length && propertyUnits.length) {
    status = 'Behind';
    detail = vacant.length === 1 ? '1 vacant unit' : `${vacant.length} vacant units`;
  } else if (now.getDate() >= 10 && rentShort) {
    status = 'Behind';
    detail = 'Rent still outstanding';
  } else if (unusual) {
    status = 'Behind';
    detail = 'Large expense this month';
  } else if (rentComplete) {
    status = 'On track';
    detail = 'Rent fully collected';
  } else if (now.getDate() < 10 && rentShort) {
    status = 'Stable';
    detail = 'Waiting on this month\'s rent';
  } else if (propertyUnits.length && !unusual) {
    status = 'Stable';
    detail = 'No unusual expenses';
  }

  return {
    id: property.id,
    name: shortPropertyName(property.address),
    status,
    amount: cash,
    detail,
  };
}

function unusualExpense(propertyId: string, transactions: BriefTransaction[], now: Date) {
  const month = monthKey(now);
  const current = transactions.filter((tx) => tx.property_id === propertyId && tx.transaction_date.startsWith(month) && tx.type === 'expense' && isOperatingExpenseCategory(tx.category || ''));
  const largest = current.reduce((max, tx) => Math.max(max, Math.abs(signed(tx))), 0);
  if (largest < LARGE_EXPENSE) return false;
  const prior: number[] = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const total = transactions
      .filter((tx) => tx.property_id === propertyId && tx.transaction_date.startsWith(key) && tx.type === 'expense' && isOperatingExpenseCategory(tx.category || ''))
      .reduce((sum, tx) => sum + Math.abs(signed(tx)), 0);
    if (total > 0.5) prior.push(total);
  }
  if (prior.length < 2) return false;
  return largest > median(prior) * 1.5;
}

function buildUpcoming(properties: BriefProperty[], units: BriefUnit[], documents: BriefDocument[], now: Date) {
  const today = todayKey(now);
  const names = new Map(properties.map((property) => [property.id, shortPropertyName(property.address)]));
  const events: UpcomingDate[] = [];
  units.forEach((unit) => {
    const end = dateKey(unit.lease_end_date);
    if (!end || !names.has(unit.property_id)) return;
    const days = Math.round((dayNumber(end) - dayNumber(today)) / 86400000);
    if (days < -14 || days > 365) return;
    const date = new Date(`${end}T12:00:00`);
    const unitName = (unit.unit_number || '').trim();
    events.push({
      id: `lease-${unit.id}`,
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: String(date.getDate()),
      title: 'Lease ending',
      detail: `${names.get(unit.property_id)}${unitName ? ` · Unit ${unitName.replace(/^unit\s+/i, '')}` : ''}`,
      when: relativeWhen(days),
      href: `/properties/${unit.property_id}?tab=units`,
      sort: dayNumber(end),
    });
  });
  documents.forEach((document) => {
    const due = dateKey(document.expires_at);
    if (!due || !names.has(document.property_id)) return;
    const days = Math.round((dayNumber(due) - dayNumber(today)) / 86400000);
    if (days < -14 || days > 365) return;
    const date = new Date(`${due}T12:00:00`);
    const category = document.category || '';
    events.push({
      id: `doc-${document.id}`,
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: String(date.getDate()),
      title: eventTitle(category),
      detail: `${names.get(document.property_id)}${document.title ? ` · ${document.title}` : ''}`,
      when: relativeWhen(days),
      href: `/properties/${document.property_id}?tab=documents`,
      sort: dayNumber(due),
    });
  });
  return events.sort((a, b) => a.sort - b.sort);
}

export function formatBriefAmount(amount: number) {
  const rounded = Math.round(amount);
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(rounded));
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return text;
}

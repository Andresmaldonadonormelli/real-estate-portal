import { formatCurrency, shortPropertyName } from '@/lib/formatters';
import { isPropertyManagementDeposit } from '@/lib/managementPayout';
import { unitAttention } from '@/lib/portfolioAttention';
import { supabase } from '@/lib/supabase';
import { historyStart } from '@/lib/supabaseData';
import type { Notification, NotificationType } from '@/lib/types';

export const LARGE_EXPENSE_MIN = 250;

const NOTIFICATION_FIELDS = 'id,user_id,type,read_at,created_at,title,body,amount,property_id,unit_id,transaction_id,dedupe_key,metadata,origin,archived_at';

export type NotificationGroup = 'transaction' | 'property';

export type NotificationProperty = {
  id: string;
  address: string;
  management_fee_percent?: number | null;
};

export type NotificationUnit = {
  id: string;
  property_id: string;
  unit_number?: string | null;
  occupied: boolean;
  tenant_name?: string | null;
  lease_start_date?: string | null;
  lease_end_date?: string | null;
  created_at?: string | null;
  archived_at?: string | null;
};

export type NotificationTransaction = {
  id: string;
  property_id?: string | null;
  unit_id?: string | null;
  transaction_date?: string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  payee_source?: string | null;
  amount?: number | null;
  notes?: string | null;
  source?: string | null;
  import_key?: string | null;
  status?: string | null;
  needs_review?: boolean | null;
  archived_at?: string | null;
};

export type DesiredNotification = {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  amount: number | null;
  property_id: string | null;
  unit_id: string | null;
  transaction_id: string | null;
  dedupe_key: string;
  metadata: Record<string, unknown>;
  origin: 'app';
};

export type FeedNotification = {
  id: string;
  group: NotificationGroup;
  type: NotificationType;
  title: string;
  body: string;
  amountText: string;
  amountTone: '' | 'positive' | 'negative';
  time: string;
  createdAt: string;
  unread: boolean;
  propertyId: string | null;
  unitId: string | null;
  transactionId: string | null;
};

type NotificationSource = {
  userId: string;
  properties: NotificationProperty[];
  units: NotificationUnit[];
  transactions: NotificationTransaction[];
  now?: Date;
};

export function notificationGroup(type: string): NotificationGroup {
  return type === 'lease_ending_soon' || type === 'unit_vacant' ? 'property' : 'transaction';
}

export function relativeNotificationTime(createdAt: string, now = new Date()) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return '';
  const elapsed = now.getTime() - created;
  if (elapsed < 60_000) return 'Just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(elapsed / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return new Date(created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function notificationAmount(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const value = Number(amount);
  if (Math.abs(value) < 0.5) return null;
  if (value > 0) return { text: `+${formatCurrency(value)}`, tone: 'positive' as const };
  return { text: formatCurrency(value), tone: 'negative' as const };
}

export function presentNotification(row: Notification, now = new Date()): FeedNotification {
  const amount = notificationAmount(row.amount);
  return {
    id: row.id,
    group: notificationGroup(row.type),
    type: row.type,
    title: row.title,
    body: row.body || '',
    amountText: amount?.text || '',
    amountTone: amount?.tone || '',
    time: relativeNotificationTime(row.created_at, now),
    createdAt: row.created_at,
    unread: !row.read_at,
    propertyId: row.property_id || null,
    unitId: row.unit_id || null,
    transactionId: row.transaction_id || null,
  };
}

export function notificationLoadError(error: unknown) {
  const record = error && typeof error === 'object' ? error as { message?: string; code?: string } : {};
  const message = record.message || '';
  if (record.code === '42P01' || /does not exist|schema cache|notifications/i.test(message) && /relation|schema|exist/i.test(message)) {
    return 'Notifications are not set up yet.';
  }
  return 'Notifications could not be loaded.';
}

/** Portfolio alerts derived from properties, units, and posted transactions. */
export function buildDesiredNotifications(source: NotificationSource): DesiredNotification[] {
  const now = source.now || new Date();
  const properties = source.properties.filter(property => property.id && property.address);
  const propertyIds = new Set(properties.map(property => property.id));
  const units = source.units.filter(unit => unit.id && !unit.archived_at && propertyIds.has(unit.property_id));
  const transactions = source.transactions.filter(transaction => isPosted(transaction) && (!transaction.property_id || propertyIds.has(transaction.property_id)));
  const rows: DesiredNotification[] = [];
  const seen = new Set<string>();

  const add = (row: DesiredNotification | null) => {
    if (!row || seen.has(row.dedupe_key)) return;
    seen.add(row.dedupe_key);
    rows.push(row);
  };

  transactions.forEach(transaction => add(transactionNotification(source.userId, transaction, properties, transactions)));
  units.forEach(unit => add(unitNotification(source.userId, unit, properties, now)));
  return rows;
}

export async function reconcileNotifications(userId: string) {
  const now = new Date();
  const [properties, units, transactions, existingResult] = await Promise.all([
    loadProperties(),
    loadUnits(),
    loadTransactions(),
    supabase.from('notifications').select(NOTIFICATION_FIELDS).eq('user_id', userId),
  ]);
  if (existingResult.error) throw existingResult.error;
  const existing = ((existingResult.data || []) as Notification[]).map(coerceNotification);
  const desired = buildDesiredNotifications({ userId, properties, units, transactions, now });
  const desiredByKey = new Map(desired.map(row => [row.dedupe_key, row]));
  const existingByKey = new Map(existing.map(row => [row.dedupe_key, row]));

  const toInsert = desired.filter(row => !existingByKey.has(row.dedupe_key)).map(insertPayload);
  if (toInsert.length) {
    const inserted = await supabase.from('notifications').insert(toInsert);
    if (inserted.error && inserted.error.code !== '23505') throw inserted.error;
  }

  for (const row of desired) {
    const current = existingByKey.get(row.dedupe_key);
    if (!current || copyMatches(current, row)) continue;
    const reopen = Boolean(current.archived_at);
    const updated = await supabase.from('notifications').update({
      title: row.title,
      body: row.body,
      amount: row.amount,
      property_id: row.property_id,
      unit_id: row.unit_id,
      transaction_id: row.transaction_id,
      metadata: row.metadata,
      archived_at: null,
      ...(reopen ? { read_at: null } : {}),
    }).eq('id', current.id).eq('user_id', userId);
    if (updated.error) throw updated.error;
  }

  const staleIds = existing
    .filter(row => !row.archived_at && row.origin !== 'plaid' && !desiredByKey.has(row.dedupe_key))
    .map(row => row.id);
  if (staleIds.length) {
    const archived = await supabase.from('notifications').update({ archived_at: now.toISOString() }).in('id', staleIds).eq('user_id', userId);
    if (archived.error) throw archived.error;
  }

  const fresh = await supabase.from('notifications').select(NOTIFICATION_FIELDS).eq('user_id', userId).is('archived_at', null).order('created_at', { ascending: false });
  if (fresh.error) throw fresh.error;
  return ((fresh.data || []) as Notification[]).map(coerceNotification);
}

function transactionNotification(userId: string, transaction: NotificationTransaction, properties: NotificationProperty[], transactions: NotificationTransaction[]): DesiredNotification | null {
  const propertyId = transaction.property_id || null;
  const address = addressFor(properties, propertyId);
  const name = party(transaction);
  if (isBankTransfer(transaction, properties)) {
    return {
      user_id: userId,
      type: 'bank_transfer_received',
      title: 'Bank transfer received',
      body: address || name,
      amount: signedAmount(transaction.amount, 'positive'),
      property_id: propertyId,
      unit_id: transaction.unit_id || null,
      transaction_id: transaction.id,
      dedupe_key: `bank_transfer_received:tx:${transaction.id}`,
      metadata: {},
      origin: 'app',
    };
  }
  if (isApprovedManagerDeduction(transaction, transactions, properties)) return null;
  if (needsCategory(transaction)) {
    return {
      user_id: userId,
      type: 'transaction_needs_category',
      title: 'Transaction needs category',
      body: [address, name].filter(Boolean).join(' · '),
      amount: signedAmount(transaction.amount, 'signed'),
      property_id: propertyId,
      unit_id: transaction.unit_id || null,
      transaction_id: transaction.id,
      dedupe_key: `transaction_needs_category:tx:${transaction.id}`,
      metadata: {},
      origin: 'app',
    };
  }
  if (transaction.type === 'expense' && Math.abs(Number(transaction.amount || 0)) >= LARGE_EXPENSE_MIN) {
    return {
      user_id: userId,
      type: 'large_expense_posted',
      title: 'Large expense posted',
      body: [name, address].filter(Boolean).join(' · '),
      amount: signedAmount(transaction.amount, 'negative'),
      property_id: propertyId,
      unit_id: transaction.unit_id || null,
      transaction_id: transaction.id,
      dedupe_key: `large_expense_posted:tx:${transaction.id}`,
      metadata: {},
      origin: 'app',
    };
  }
  return null;
}

function unitNotification(userId: string, unit: NotificationUnit, properties: NotificationProperty[], now: Date): DesiredNotification | null {
  const attention = unitAttention({
    id: unit.id,
    property_id: unit.property_id,
    unit_number: unit.unit_number || '',
    occupied: Boolean(unit.occupied),
    tenant_name: unit.tenant_name,
    lease_start_date: unit.lease_start_date,
    lease_end_date: unit.lease_end_date,
    created_at: unit.created_at,
  }, now);
  const propertyId = unit.property_id || null;
  const place = [addressFor(properties, propertyId), unitLabel(unit.unit_number)].filter(Boolean).join(' · ');
  if (attention.kind === 'ending') {
    const tenant = (unit.tenant_name || '').trim();
    const end = dateKey(unit.lease_end_date);
    return {
      user_id: userId,
      type: 'lease_ending_soon',
      title: attention.label,
      body: [place, tenant].filter(Boolean).join(' · '),
      amount: null,
      property_id: propertyId,
      unit_id: unit.id,
      transaction_id: null,
      dedupe_key: `lease_ending_soon:unit:${unit.id}:end:${end}`,
      metadata: { ...(end ? { lease_end_date: end } : {}), ...(tenant ? { tenant_name: tenant } : {}) },
      origin: 'app',
    };
  }
  if (attention.kind === 'vacant') {
    const since = vacantSince(unit, now);
    const days = attention.vacancyDays;
    return {
      user_id: userId,
      type: 'unit_vacant',
      title: days !== null && days >= 14 ? `Unit vacant for ${days} ${days === 1 ? 'day' : 'days'}` : 'Unit vacant',
      body: place,
      amount: null,
      property_id: propertyId,
      unit_id: unit.id,
      transaction_id: null,
      dedupe_key: `unit_vacant:unit:${unit.id}:since:${since}`,
      metadata: { ...(since !== 'unknown' ? { vacant_since: since } : {}), ...(days !== null ? { vacancy_days: days } : {}) },
      origin: 'app',
    };
  }
  return null;
}

function isPosted(transaction: NotificationTransaction) {
  return !transaction.archived_at && (transaction.status || 'posted') === 'posted';
}

function isBankTransfer(transaction: NotificationTransaction, properties: NotificationProperty[]) {
  if (transaction.type !== 'income') return false;
  const fee = properties.find(property => property.id === transaction.property_id)?.management_fee_percent;
  return isPropertyManagementDeposit(transaction, fee);
}

/** Fee splits and expenses linked to a manager payout are approved deductions, not alerts. */
function isApprovedManagerDeduction(transaction: NotificationTransaction, transactions: NotificationTransaction[], properties: NotificationProperty[]) {
  if (transaction.type && transaction.type !== 'expense') return false;
  const importKey = String(transaction.import_key || '');
  if (importKey.startsWith('management-fee-split:')) return true;
  return transactions.some(deposit => {
    if (deposit.id === transaction.id || deposit.property_id !== transaction.property_id) return false;
    if (deposit.transaction_date !== transaction.transaction_date) return false;
    const fee = properties.find(property => property.id === deposit.property_id)?.management_fee_percent;
    if (!isPropertyManagementDeposit(deposit, fee)) return false;
    return String(transaction.notes || '').includes(deposit.id) || importKey.includes(deposit.id);
  });
}

function needsCategory(transaction: NotificationTransaction) {
  if (transaction.needs_review) return true;
  const category = (transaction.category || '').trim();
  return !category || /needs review|uncategor/i.test(category);
}

function party(transaction: NotificationTransaction) {
  const payee = (transaction.payee_source || '').trim();
  if (payee) return payee;
  const description = (transaction.description || '').trim();
  return description || 'Transaction';
}

function addressFor(properties: NotificationProperty[], propertyId?: string | null) {
  const property = properties.find(item => item.id === propertyId);
  return property ? shortPropertyName(property.address) : '';
}

function unitLabel(unitNumber?: string | null) {
  const number = (unitNumber || '').trim();
  if (!number) return '';
  return /^unit\b/i.test(number) ? number : `Unit ${number}`;
}

function signedAmount(amount: number | null | undefined, sign: 'positive' | 'negative' | 'signed') {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const value = Number(amount);
  if (Math.abs(value) < 0.5) return null;
  if (sign === 'positive') return Math.abs(value);
  if (sign === 'negative') return -Math.abs(value);
  return value;
}

function dateKey(value?: string | null) {
  if (!value) return '';
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

function utcDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayKey(now: Date) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function vacantSince(unit: NotificationUnit, now: Date) {
  const end = dateKey(unit.lease_end_date);
  const today = todayKey(now);
  if (end && utcDay(end) <= utcDay(today)) return end;
  const created = dateKey(unit.created_at);
  return created || 'unknown';
}

function insertPayload(row: DesiredNotification) {
  const payload: Record<string, unknown> = {
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    amount: row.amount,
    property_id: row.property_id,
    unit_id: row.unit_id,
    transaction_id: row.transaction_id,
    dedupe_key: row.dedupe_key,
    metadata: row.metadata,
    origin: row.origin,
  };
  return payload;
}

function copyMatches(current: Notification, desired: DesiredNotification) {
  return !current.archived_at
    && current.title === desired.title
    && current.body === desired.body
    && amountsMatch(current.amount, desired.amount)
    && (current.property_id || null) === desired.property_id
    && (current.unit_id || null) === desired.unit_id
    && (current.transaction_id || null) === desired.transaction_id
    && canonical(current.metadata || {}) === canonical(desired.metadata);
}

function amountsMatch(current: number | null | undefined, desired: number | null) {
  if (current == null && desired == null) return true;
  if (current == null || desired == null) return false;
  return Math.abs(Number(current) - desired) < 0.01;
}

function canonical(value: unknown): string {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value ?? null);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function coerceNotification(row: Notification): Notification {
  const amount = row.amount == null || (row.amount as unknown) === '' ? null : Number(row.amount);
  return {
    ...row,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    property_id: row.property_id || null,
    unit_id: row.unit_id || null,
    transaction_id: row.transaction_id || null,
    read_at: row.read_at || null,
    archived_at: row.archived_at || null,
  };
}

async function loadProperties(): Promise<NotificationProperty[]> {
  const result = await supabase.from('properties').select('id,address,management_fee_percent').is('archived_at', null).order('address');
  if (result.error) throw result.error;
  return (result.data || []) as NotificationProperty[];
}

async function loadUnits(): Promise<NotificationUnit[]> {
  const detailed = await supabase.from('units').select('id,property_id,unit_number,occupied,tenant_name,lease_start_date,lease_end_date,created_at,archived_at').is('archived_at', null).order('unit_number');
  if (!detailed.error) return (detailed.data || []) as NotificationUnit[];
  if (!missingColumn(detailed.error)) throw detailed.error;
  const basic = await supabase.from('units').select('id,property_id,unit_number,occupied,tenant_name,created_at,archived_at').is('archived_at', null).order('unit_number');
  if (basic.error) throw basic.error;
  return (basic.data || []) as NotificationUnit[];
}

async function loadTransactions(): Promise<NotificationTransaction[]> {
  const result = await supabase.from('transactions').select('id,property_id,unit_id,transaction_date,type,category,description,payee_source,amount,notes,import_key,source,status,needs_review,archived_at').is('archived_at', null).gte('transaction_date', historyStart(121)).order('transaction_date', { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []) as NotificationTransaction[];
}

function missingColumn(error: { message?: string; code?: string }) {
  return error.code === '42703' || /column/i.test(error.message || '');
}

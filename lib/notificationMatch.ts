import type { Property, Transaction } from '@/lib/types';

export type NotificationMatch = 'payout' | 'review' | 'expense';

type NotificationQuery = { match?: NotificationMatch; detail: string; amount: string };

function money(value: string) {
  const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function addressMatches(address: string, detail: string) {
  const hay = address.toLowerCase().replace(/\s+/g, '');
  const tokens = detail.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1 && token !== 'uncategorized');
  return tokens.some((token) => hay.includes(token));
}

function closest(rows: Transaction[], target: number | null) {
  if (!rows.length) return null;
  if (target == null) return rows[0];
  return [...rows].sort((a, b) => Math.abs(Math.abs(Number(a.amount || 0)) - target) - Math.abs(Math.abs(Number(b.amount || 0)) - target))[0];
}

/** Match a static notification to a transaction already loaded for the current page. */
export function resolveNotificationTransaction(item: NotificationQuery, transactions: Transaction[], properties: Property[]) {
  if (!item.match) return null;
  const posted = transactions.filter((tx) => (tx.status || 'posted') === 'posted' && !tx.archived_at);
  const propertyIds = properties.filter((property) => addressMatches(property.address, item.detail)).map((property) => property.id);
  const scoped = propertyIds.length ? posted.filter((tx) => propertyIds.includes(tx.property_id)) : posted;
  const target = money(item.amount);
  if (item.match === 'payout') return closest(scoped.filter((tx) => tx.type === 'income'), target);
  if (item.match === 'review') {
    const needs = (tx: Transaction) => Boolean((tx as Transaction & { needs_review?: boolean }).needs_review) || /needs review|uncategor/i.test(tx.category || '');
    return scoped.find(needs) || posted.find(needs) || null;
  }
  const expenses = scoped.filter((tx) => tx.type === 'expense');
  const named = expenses.find((tx) => /harbor plumbing/i.test(`${tx.payee_source || ''} ${tx.description || ''}`));
  return named || closest(expenses, target);
}

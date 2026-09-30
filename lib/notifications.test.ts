import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesiredNotifications, notificationAmount, relativeNotificationTime, type NotificationProperty, type NotificationTransaction, type NotificationUnit } from './notifications.ts';

const now = new Date(2026, 8, 29, 15, 0, 0);
const property: NotificationProperty = { id: 'p1', address: '15334 Triskett Rd', management_fee_percent: 8 };
const maple: NotificationProperty = { id: 'p2', address: '214 Maple Ave', management_fee_percent: 0 };

function tx(partial: NotificationTransaction): NotificationTransaction {
  return { status: 'posted', property_id: 'p1', transaction_date: '2026-09-20', ...partial };
}

test('relative time uses hours and days', () => {
  assert.equal(relativeNotificationTime(new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), now), '2h ago');
  assert.equal(relativeNotificationTime(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), now), '1d ago');
  assert.equal(relativeNotificationTime(new Date(now.getTime() - 30 * 1000).toISOString(), now), 'Just now');
});

test('amounts stay whole dollars and use sign for color', () => {
  assert.deepEqual(notificationAmount(2377.4), { text: '+$2,377', tone: 'positive' });
  assert.deepEqual(notificationAmount(-280.2), { text: '-$280', tone: 'negative' });
  assert.equal(notificationAmount(null), null);
});

test('does not alert on an approved manager deduction or rent gap', () => {
  const units: NotificationUnit[] = [
    { id: 'u-lease', property_id: 'p2', unit_number: '1', occupied: true, tenant_name: 'A. Cole', lease_end_date: '2026-10-09' },
    { id: 'u-vacant', property_id: 'p1', unit_number: '2', occupied: false, lease_end_date: '2026-09-15' },
    { id: 'u-soon', property_id: 'p2', unit_number: '3', occupied: false, lease_start_date: '2026-10-05', tenant_name: 'Future' },
    { id: 'u-stable', property_id: 'p1', unit_number: '4', occupied: true, lease_end_date: '2027-06-01' },
  ];
  const transactions: NotificationTransaction[] = [
    tx({ id: 'tx-payout', type: 'income', category: 'Rent', description: 'Property management payout', payee_source: 'Manager', amount: 2377, notes: 'Confirmed fee split from Chase/net payout 2377.', needs_review: true }),
    tx({ id: 'tx-fee', type: 'expense', category: 'Management Fee', description: 'Management fee', amount: -180, import_key: 'management-fee-split:tx-payout' }),
    tx({ id: 'tx-mow', type: 'expense', category: 'Needs Review', description: 'Lawn mowing', amount: -45, notes: 'Deducted on tx-payout', needs_review: true }),
    tx({ id: 'tx-review', type: 'expense', category: 'Needs Review', description: 'City Electric', payee_source: 'City Electric', amount: -640, needs_review: true, transaction_date: '2026-09-18' }),
    tx({ id: 'tx-large', type: 'expense', category: 'Repairs', description: 'Harbor Plumbing', payee_source: 'Harbor Plumbing', amount: -280, transaction_date: '2026-09-18' }),
    tx({ id: 'tx-small', type: 'expense', category: 'Repairs', description: 'Keys', payee_source: 'Hardware', amount: -40, transaction_date: '2026-09-18' }),
  ];
  const rows = buildDesiredNotifications({ userId: 'user-1', properties: [property, maple], units, transactions, now });
  const types = rows.map(row => row.type);

  assert.equal(rows.some(row => /outstanding/i.test(`${row.title} ${row.body}`)), false);
  assert.equal(rows.some(row => row.transaction_id === 'tx-fee' || row.transaction_id === 'tx-mow' || row.transaction_id === 'tx-small'), false);
  assert.equal(rows.filter(row => row.origin === 'seed').length, 0);
  assert.deepEqual(types.filter(type => type === 'bank_transfer_received'), ['bank_transfer_received']);

  const payout = rows.find(row => row.transaction_id === 'tx-payout');
  assert.equal(payout?.type, 'bank_transfer_received');
  assert.equal(payout?.title, 'Bank transfer received');
  assert.equal(payout?.body, '15334 Triskett');
  assert.equal(payout?.amount, 2377);
  assert.equal(payout?.dedupe_key, 'bank_transfer_received:tx:tx-payout');

  const review = rows.filter(row => row.transaction_id === 'tx-review');
  assert.equal(review.length, 1);
  assert.equal(review[0].type, 'transaction_needs_category');
  assert.equal(review[0].body, '15334 Triskett · City Electric');
  assert.equal(review[0].amount, -640);

  const large = rows.find(row => row.transaction_id === 'tx-large');
  assert.equal(large?.type, 'large_expense_posted');
  assert.equal(large?.body, 'Harbor Plumbing · 15334 Triskett');
  assert.equal(large?.amount, -280);

  const lease = rows.find(row => row.unit_id === 'u-lease');
  assert.equal(lease?.type, 'lease_ending_soon');
  assert.equal(lease?.title, 'Lease ends in 10 days');
  assert.equal(lease?.body, '214 Maple · Unit 1 · A. Cole');
  assert.equal(lease?.dedupe_key, 'lease_ending_soon:unit:u-lease:end:2026-10-09');
  assert.equal(notificationGroupOf(lease?.type), 'property');

  const vacant = rows.find(row => row.unit_id === 'u-vacant');
  assert.equal(vacant?.title, 'Unit vacant for 14 days');
  assert.equal(vacant?.body, '15334 Triskett · Unit 2');
  assert.equal(vacant?.dedupe_key, 'unit_vacant:unit:u-vacant:since:2026-09-15');
  assert.equal(rows.some(row => row.unit_id === 'u-soon' || row.unit_id === 'u-stable'), false);
});

test('does not fabricate missing notification types and keeps stable dedupe keys', () => {
  const rows = buildDesiredNotifications({
    userId: 'user-1',
    properties: [property],
    units: [{ id: 'u1', property_id: 'p1', unit_number: '1', occupied: true, lease_end_date: '2027-01-01' }],
    transactions: [tx({ id: 'tx-rent', type: 'income', category: 'Rent', description: 'Rent', amount: 1200 })],
    now,
  });
  assert.deepEqual(rows, []);

  const realRows = buildDesiredNotifications({
    userId: 'user-1',
    properties: [property],
    units: [{ id: 'u1', property_id: 'p1', unit_number: '1', occupied: false, lease_end_date: '2026-09-15' }],
    transactions: [tx({ id: 'tx-review', type: 'expense', category: 'Needs Review', description: 'Imported repair', amount: -90, source: 'plaid', needs_review: true })],
    now,
  });
  const again = buildDesiredNotifications({
    userId: 'user-1',
    properties: [property],
    units: [{ id: 'u1', property_id: 'p1', unit_number: '1', occupied: false, lease_end_date: '2026-09-15' }],
    transactions: [tx({ id: 'tx-review', type: 'expense', category: 'Needs Review', description: 'Imported repair', amount: -90, source: 'plaid', needs_review: true })],
    now,
  });
  assert.deepEqual(realRows.map(row => row.type), ['transaction_needs_category', 'unit_vacant']);
  assert.ok(realRows.every(row => row.origin === 'app'));
  assert.ok(realRows.every(row => !row.dedupe_key.startsWith('seed:')));
  assert.deepEqual(again.map(row => row.dedupe_key), realRows.map(row => row.dedupe_key));
});

function notificationGroupOf(type?: string) {
  return type === 'lease_ending_soon' || type === 'unit_vacant' ? 'property' : 'transaction';
}

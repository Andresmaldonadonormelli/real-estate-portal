import type { Notification } from '@/lib/types';

export const LAB_PROPERTIES = [
  { id: 'triskett', address: '15334 Triskett Rd' },
  { id: 'west', address: '3765 W 134th St' },
  { id: 'maple', address: '214 Maple Ave' },
];

const sampleTime = Date.now();

function hoursAgo(hours: number) {
  return new Date(sampleTime - hours * 60 * 60 * 1000).toISOString();
}

function sampleNotification(row: Pick<Notification, 'id' | 'type' | 'title' | 'body' | 'amount' | 'created_at'>): Notification {
  return {
    user_id: 'lab',
    read_at: null,
    property_id: null,
    unit_id: null,
    transaction_id: null,
    dedupe_key: row.id,
    metadata: null,
    origin: 'app',
    archived_at: null,
    ...row,
  };
}

export const LAB_NOTIFICATIONS: Notification[] = [
  sampleNotification({ id: 'transfer', type: 'bank_transfer_received', title: 'Bank transfer received', body: '15334 Triskett', amount: 2377, created_at: hoursAgo(2) }),
  sampleNotification({ id: 'category', type: 'transaction_needs_category', title: 'Transaction needs review', body: '3765 W 134th · Uncategorized', amount: null, created_at: hoursAgo(3) }),
  sampleNotification({ id: 'expense', type: 'large_expense_posted', title: 'Large expense posted', body: 'Harbor Plumbing', amount: -280, created_at: hoursAgo(6) }),
  sampleNotification({ id: 'lease', type: 'lease_ending_soon', title: 'Lease ends in 30 days', body: '214 Maple · Unit 1', amount: null, created_at: hoursAgo(48) }),
  sampleNotification({ id: 'vacant', type: 'unit_vacant', title: 'Unit vacant for 14 days', body: '4365 W · Unit 1', amount: null, created_at: hoursAgo(96) }),
];

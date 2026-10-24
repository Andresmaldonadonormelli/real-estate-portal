import assert from 'node:assert/strict';
import test from 'node:test';
import { adoptableCopies, canonicalAccount, connectionDuplicatePairs, copiesOfAccount, duplicateAccountGroups, isSupersededAccount, supersededPlaidId, type LedgerCopy, type StoredAccount } from './accountIdentity.ts';

const account = (overrides: Partial<StoredAccount> & Pick<StoredAccount, 'id' | 'item_id' | 'plaid_account_id'>): StoredAccount => ({
  mask: '3199', type: 'depository', subtype: 'checking', property_id: null, import_enabled: false, archived_at: null, created_at: '2026-09-01T00:00:00Z', ...overrides,
});

const original = account({ id: 'a-orig', item_id: 'item-1', plaid_account_id: 'old-3199', property_id: 'prop-1', import_enabled: true });
const relinked = account({ id: 'a-new', item_id: 'item-2', plaid_account_id: 'new-3199', created_at: '2026-10-20T00:00:00Z' });
const savings = account({ id: 'b-orig', item_id: 'item-1', plaid_account_id: 'old-6822', mask: '6822' });

test('a Chase relink with new account ids finds the original account by mask, type, and subtype', () => {
  const copies = copiesOfAccount([original, relinked, savings], { account_id: 'new-3199', mask: '3199', type: 'depository', subtype: 'checking' });
  assert.deepEqual(copies.map(row => row.id).sort(), ['a-new', 'a-orig']);
});

test('the copy holding the property assignment stays canonical even when the relink created a newer row', () => {
  assert.equal(canonicalAccount([relinked, original])?.id, 'a-orig');
  const archivedAssigned = { ...original, archived_at: '2026-10-19T00:00:00Z', import_enabled: false };
  assert.equal(canonicalAccount([relinked, archivedAssigned])?.id, 'a-orig');
});

test('persistent account ids win over a mask match', () => {
  const other = account({ id: 'c', item_id: 'item-1', plaid_account_id: 'old-other', persistent_account_id: 'persist-B' });
  const copies = copiesOfAccount([{ ...original, persistent_account_id: 'persist-A' }, other], { account_id: 'new', mask: '3199', type: 'depository', subtype: 'checking', persistent_account_id: 'persist-A' });
  assert.deepEqual(copies.map(row => row.id), ['a-orig']);
});

test('two same-mask accounts on one connection are ambiguous and never merged', () => {
  const twin = account({ id: 'twin', item_id: 'item-1', plaid_account_id: 'old-twin' });
  const copies = copiesOfAccount([original, twin], { account_id: 'new-3199', mask: '3199', type: 'depository', subtype: 'checking' });
  assert.deepEqual(copies, []);
});

test('superseded copies are ignored and keep a record of the account that replaced them', () => {
  const retired = { ...relinked, plaid_account_id: supersededPlaidId('a-orig', 'new-3199'), archived_at: '2026-10-21T00:00:00Z' };
  assert.equal(isSupersededAccount(retired), true);
  assert.equal(retired.plaid_account_id, 'superseded:a-orig:new-3199');
  assert.deepEqual(copiesOfAccount([original, retired], { account_id: 'x', mask: '3199', type: 'depository', subtype: 'checking' }).map(row => row.id), ['a-orig']);
  assert.deepEqual(duplicateAccountGroups([original, retired]), []);
});

test('the same 3199 and 6822 under two Chase connections are reported as duplicates', () => {
  const relinkedSavings = account({ id: 'b-new', item_id: 'item-2', plaid_account_id: 'new-6822', mask: '6822' });
  const groups = duplicateAccountGroups([original, savings, relinked, relinkedSavings]).map(group => group.map(row => row.id).sort());
  assert.deepEqual(groups, [['a-new', 'a-orig'], ['b-new', 'b-orig']]);
});

const copy = (overrides: Partial<LedgerCopy> & Pick<LedgerCopy, 'id'>): LedgerCopy => ({
  date: '2026-10-16', amount: -2622, description: 'Online Transfer to CHK ...6822', needs_review: false, live: false, ...overrides,
});

test('a reconnected account adopts the reviewed earlier ledger row instead of importing a second copy', () => {
  const rows = [copy({ id: 'unreviewed', needs_review: true }), copy({ id: 'reviewed' }), copy({ id: 'current', live: true }), copy({ id: 'other-day', date: '2026-10-17' })];
  assert.deepEqual(adoptableCopies(rows, { date: '2026-10-16', amount: -2622, description: 'ONLINE TRANSFER TO CHK ...6822' }).map(row => row.id), ['reviewed', 'unreviewed']);
});

test('duplicate ledger rows from two connections keep the categorized copy', () => {
  const pairs = connectionDuplicatePairs([copy({ id: 'old', needs_review: false }), copy({ id: 'new', live: true, needs_review: true })]);
  assert.deepEqual(pairs.map(pair => [pair.keep.id, pair.drop.id]), [['old', 'new']]);
  const reviewedNew = connectionDuplicatePairs([copy({ id: 'old', needs_review: true }), copy({ id: 'new', live: true, needs_review: false })]);
  assert.deepEqual(reviewedNew.map(pair => [pair.keep.id, pair.drop.id]), [['new', 'old']]);
});

test('two real same-day transfers for the same amount are not collapsed when only one connection has them', () => {
  assert.deepEqual(connectionDuplicatePairs([copy({ id: 'first', live: true }), copy({ id: 'second', live: true })]), []);
});

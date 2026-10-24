import assert from 'node:assert/strict';
import test from 'node:test';
import { accountStatus, type AccountStatusInput } from './accountStatus.ts';

const assigned: AccountStatusInput = { propertyId: 'prop-1', importEnabled: true, saving: false, syncing: false, connectionStatus: 'connected', connectionErrorCode: null };

test('after a reload an assigned account reads as assigned, never as syncing', () => {
  assert.deepEqual(accountStatus(assigned), { label: 'Assigned', tone: 'active' });
});

test('syncing shows only while this tab is waiting on the account connection', () => {
  assert.equal(accountStatus({ ...assigned, syncing: true }).label, 'Syncing…');
  assert.equal(accountStatus({ ...assigned, syncing: false }).label, 'Assigned');
});

test('a failed sync on one connection marks only accounts on that connection', () => {
  const failedConnection = accountStatus({ ...assigned, connectionStatus: 'needs_reauth', connectionErrorCode: 'ITEM_LOGIN_REQUIRED' });
  const healthyConnection = accountStatus(assigned);
  assert.deepEqual(failedConnection, { label: 'Bank sync failed', tone: 'inactive' });
  assert.equal(healthyConnection.label, 'Assigned');
});

test('unassigned accounts need a property whatever the connection is doing', () => {
  assert.equal(accountStatus({ ...assigned, propertyId: null, importEnabled: false, syncing: true }).label, 'Needs property');
});

test('saving a property choice takes precedence over every other state', () => {
  assert.equal(accountStatus({ ...assigned, saving: true, connectionErrorCode: 'ITEM_LOGIN_REQUIRED' }).label, 'Saving…');
});

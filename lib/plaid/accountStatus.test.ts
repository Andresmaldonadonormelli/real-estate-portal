import assert from 'node:assert/strict';
import test from 'node:test';
import { accountStatus, needsReconnect, type AccountStatusInput } from './accountStatus.ts';

const assigned: AccountStatusInput = { propertyId: 'prop-1', importEnabled: true, saving: false, syncing: false, connectionStatus: 'connected', connectionErrorCode: null };

test('after a reload an assigned account reads as assigned, never as syncing', () => {
  assert.deepEqual(accountStatus(assigned), { label: 'Assigned', tone: 'active' });
});

test('syncing shows only while this tab is waiting on the account connection', () => {
  assert.equal(accountStatus({ ...assigned, syncing: true }).label, 'Syncing…');
  assert.equal(accountStatus({ ...assigned, syncing: false }).label, 'Assigned');
});

test('a failed sync on one connection marks only accounts on that connection', () => {
  const failedConnection = accountStatus({ ...assigned, connectionErrorCode: 'INSTITUTION_DOWN' });
  const healthyConnection = accountStatus(assigned);
  assert.deepEqual(failedConnection, { label: 'Bank sync failed', tone: 'inactive' });
  assert.equal(healthyConnection.label, 'Assigned');
});

test('ITEM_LOGIN_REQUIRED reads as Reconnect required, not as a failed or completed sync', () => {
  assert.deepEqual(accountStatus({ ...assigned, connectionStatus: 'needs_reauth', connectionErrorCode: 'ITEM_LOGIN_REQUIRED' }), { label: 'Reconnect required', tone: 'inactive' });
  assert.equal(accountStatus({ ...assigned, connectionStatus: 'connected', connectionErrorCode: 'ITEM_LOGIN_REQUIRED' }).label, 'Reconnect required');
  assert.equal(needsReconnect({ status: 'connected', error_code: 'INSTITUTION_DOWN' }), false);
  assert.equal(needsReconnect({ status: 'needs_reauth', error_code: null }), true);
});

test('unassigned accounts need a property whatever the connection is doing', () => {
  assert.equal(accountStatus({ ...assigned, propertyId: null, importEnabled: false, syncing: true }).label, 'Needs property');
});

test('saving a property choice takes precedence over every other state', () => {
  assert.equal(accountStatus({ ...assigned, saving: true, connectionErrorCode: 'ITEM_LOGIN_REQUIRED' }).label, 'Saving…');
});

export type AccountStatusInput = {
  propertyId: string | null;
  importEnabled: boolean;
  saving: boolean;
  /** True only while this tab is waiting on a sync request for the account's own connection. */
  syncing: boolean;
  connectionStatus: string | null;
  connectionErrorCode: string | null;
};

export type AccountStatus = { label: string; tone: 'pending' | 'active' | 'inactive' };

/** Plaid codes that cannot clear until the user signs in again through Link update mode. */
export const RECONNECT_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'INVALID_ACCESS_TOKEN', 'ITEM_NOT_FOUND', 'ACCESS_NOT_GRANTED', 'USER_PERMISSION_REVOKED', 'NO_ACCOUNTS', 'INVALID_CREDENTIALS', 'ITEM_LOCKED']);

export function needsReconnect(connection: { status?: string | null; error_code?: string | null }) {
  return connection.status === 'needs_reauth' || RECONNECT_CODES.has(connection.error_code || '');
}

/** Assignment is stored; sync activity is not. Nothing persisted can make a row read as syncing after a reload. */
export function accountStatus(input: AccountStatusInput): AccountStatus {
  if (input.saving) return { label: 'Saving…', tone: 'pending' };
  if (!input.propertyId) return { label: 'Needs property', tone: 'inactive' };
  if (!input.importEnabled) return { label: 'Paused', tone: 'inactive' };
  if (input.syncing) return { label: 'Syncing…', tone: 'pending' };
  if (needsReconnect({ status: input.connectionStatus, error_code: input.connectionErrorCode })) return { label: 'Reconnect required', tone: 'inactive' };
  if ((input.connectionStatus && input.connectionStatus !== 'connected') || input.connectionErrorCode) return { label: 'Bank sync failed', tone: 'inactive' };
  return { label: 'Assigned', tone: 'active' };
}

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

/** Assignment is stored; sync activity is not. Nothing persisted can make a row read as syncing after a reload. */
export function accountStatus(input: AccountStatusInput): AccountStatus {
  if (input.saving) return { label: 'Saving…', tone: 'pending' };
  if (!input.propertyId) return { label: 'Needs property', tone: 'inactive' };
  if (!input.importEnabled) return { label: 'Paused', tone: 'inactive' };
  if (input.syncing) return { label: 'Syncing…', tone: 'pending' };
  if ((input.connectionStatus && input.connectionStatus !== 'connected') || input.connectionErrorCode) return { label: 'Bank sync failed', tone: 'inactive' };
  return { label: 'Assigned', tone: 'active' };
}

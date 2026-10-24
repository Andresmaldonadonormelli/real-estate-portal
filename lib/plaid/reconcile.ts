import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, plaidClient } from './server';
import { canonicalAccount, connectionDuplicatePairs, copiesOfAccount, duplicateAccountGroups, isSupersededAccount, supersededPlaidId, type LedgerCopy, type StoredAccount } from './accountIdentity';

type ItemRow = { id: string; user_id: string; institution_id: string | null; institution_name: string; access_token_encrypted: string; disconnected_at: string | null; created_at: string };
type IncomingAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  persistent_account_id?: string | null;
  balances?: { current?: number | null; available?: number | null; iso_currency_code?: string | null };
};

const STORED_FIELDS = 'id,item_id,plaid_account_id,mask,type,subtype,property_id,import_enabled,archived_at,created_at';
const ITEM_FIELDS = 'id,user_id,institution_id,institution_name,access_token_encrypted,disconnected_at,created_at';

/** Attach the accounts Plaid returned for a new connection to the user's existing rows for the same real accounts. */
export async function attachAccounts(db: SupabaseClient, item: ItemRow, incoming: IncomingAccount[]) {
  const siblings = await institutionItems(db, item);
  const stored = await storedAccounts(db, siblings.map(row => row.id));
  await addPersistentIds(stored, siblings.filter(row => row.id !== item.id));
  let restored = 0;
  const merged: StoredAccount[] = [];
  for (const remote of incoming) {
    const copies = copiesOfAccount(stored, remote);
    const canonical = canonicalAccount(copies);
    if (!canonical) {
      const inserted = await db.from('plaid_accounts').insert({ ...accountDetails(item, remote), user_id: item.user_id, property_id: null, import_enabled: false, stopped_at: new Date().toISOString(), archived_at: null }).select(STORED_FIELDS).single();
      if (inserted.error) throw new Error(inserted.error.message);
      stored.push({ ...(inserted.data as StoredAccount), persistent_account_id: remote.persistent_account_id || null });
      continue;
    }
    for (const copy of copies) if (copy.id !== canonical.id) await supersedeCopy(db, copy, canonical);
    const moved = await moveCanonical(db, item, canonical, accountDetails(item, remote));
    if (canonical.property_id && (canonical.archived_at || !canonical.import_enabled || canonical.item_id !== item.id)) restored += 1;
    Object.assign(canonical, moved, { persistent_account_id: remote.persistent_account_id || null });
    merged.push(canonical);
  }
  for (const account of merged) await mergeLedgerCopies(db, item, account);
  await retireEmptyItems(db, siblings, item.id);
  return { accountCount: incoming.length, restored };
}

/** Repairs connections created before reconnects were reconciled. Cheap no-op when nothing is duplicated. */
export async function reconcileDuplicateConnections(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('plaid_items').select(ITEM_FIELDS).eq('user_id', userId).is('disconnected_at', null).order('created_at');
  if (error) throw new Error(error.message);
  const items = (data || []) as ItemRow[];
  const byInstitution = new Map<string, ItemRow[]>();
  items.forEach(item => byInstitution.set(institutionKey(item), [...(byInstitution.get(institutionKey(item)) || []), item]));
  let changed = false;
  for (const group of byInstitution.values()) {
    if (group.length < 2) continue;
    const newest = group[group.length - 1];
    const accounts = await storedAccounts(db, group.map(item => item.id));
    const emptyOld = group.slice(0, -1).some(item => !accounts.some(account => account.item_id === item.id && !account.archived_at));
    if (!duplicateAccountGroups(accounts).length && !emptyOld) continue;
    const { data: live, error: liveError } = await db.from('plaid_accounts').select('plaid_account_id,name,official_name,mask,type,subtype,current_balance,available_balance,iso_currency_code').eq('item_id', newest.id).is('archived_at', null);
    if (liveError) throw new Error(liveError.message);
    const incoming = (live || []).filter(row => !isSupersededAccount(row)).map(row => ({
      account_id: row.plaid_account_id,
      name: row.name,
      official_name: row.official_name,
      mask: row.mask,
      type: row.type,
      subtype: row.subtype,
      balances: { current: row.current_balance, available: row.available_balance, iso_currency_code: row.iso_currency_code },
    }));
    const persistent = await persistentIdsFor(newest);
    incoming.forEach(row => Object.assign(row, { persistent_account_id: persistent.get(row.account_id) || null }));
    await attachAccounts(db, newest, incoming);
    changed = true;
  }
  return changed;
}

function institutionKey(item: Pick<ItemRow, 'institution_id' | 'institution_name'>) {
  return item.institution_id || `name:${item.institution_name}`;
}

async function institutionItems(db: SupabaseClient, item: ItemRow) {
  const query = db.from('plaid_items').select(ITEM_FIELDS).eq('user_id', item.user_id);
  const { data, error } = item.institution_id ? await query.eq('institution_id', item.institution_id) : await query.eq('institution_name', item.institution_name);
  if (error) throw new Error(error.message);
  return (data || []) as ItemRow[];
}

async function storedAccounts(db: SupabaseClient, itemIds: string[]) {
  if (!itemIds.length) return [] as StoredAccount[];
  const { data, error } = await db.from('plaid_accounts').select(STORED_FIELDS).in('item_id', itemIds);
  if (error) throw new Error(error.message);
  return ((data || []) as StoredAccount[]).filter(row => !isSupersededAccount(row));
}

async function persistentIdsFor(item: ItemRow) {
  const ids = new Map<string, string>();
  if (item.disconnected_at || item.access_token_encrypted === 'revoked') return ids;
  try {
    const response = await plaidClient().accountsGet({ access_token: decryptToken(item.access_token_encrypted) });
    response.data.accounts.forEach(account => { if (account.persistent_account_id) ids.set(account.account_id, account.persistent_account_id); });
  } catch {
    // Older connections may no longer authenticate. Mask, type, and subtype still identify the account.
  }
  return ids;
}

async function addPersistentIds(stored: StoredAccount[], items: ItemRow[]) {
  for (const item of items) {
    if (!stored.some(row => row.item_id === item.id)) continue;
    const ids = await persistentIdsFor(item);
    stored.forEach(row => { if (row.item_id === item.id && ids.has(row.plaid_account_id)) row.persistent_account_id = ids.get(row.plaid_account_id); });
  }
}

function accountDetails(item: ItemRow, remote: IncomingAccount) {
  return {
    item_id: item.id,
    plaid_account_id: remote.account_id,
    name: remote.name,
    official_name: remote.official_name || null,
    mask: remote.mask || null,
    type: remote.type,
    subtype: remote.subtype || null,
    current_balance: remote.balances?.current ?? null,
    available_balance: remote.balances?.available ?? null,
    iso_currency_code: remote.balances?.iso_currency_code || 'USD',
  };
}

async function supersedeCopy(db: SupabaseClient, copy: StoredAccount, canonical: StoredAccount) {
  const now = new Date().toISOString();
  const renamed = await db.from('plaid_accounts').update({
    plaid_account_id: supersededPlaidId(canonical.id, copy.plaid_account_id),
    archived_at: copy.archived_at || now,
    import_enabled: false,
    stopped_at: now,
  }).eq('id', copy.id);
  if (renamed.error) throw new Error(renamed.error.message);
  const repointed = await db.from('plaid_transactions').update({ account_id: canonical.id }).eq('account_id', copy.id);
  if (repointed.error) throw new Error(repointed.error.message);
  if (!canonical.property_id && copy.property_id) {
    canonical.property_id = copy.property_id;
    canonical.import_enabled = copy.import_enabled;
  }
  copy.plaid_account_id = supersededPlaidId(canonical.id, copy.plaid_account_id);
  copy.archived_at = copy.archived_at || now;
}

async function moveCanonical(db: SupabaseClient, item: ItemRow, canonical: StoredAccount, details: ReturnType<typeof accountDetails>) {
  const importing = Boolean(canonical.property_id);
  const update = {
    ...details,
    property_id: canonical.property_id,
    import_enabled: importing,
    stopped_at: importing ? null : new Date().toISOString(),
    archived_at: null,
  };
  const saved = await db.from('plaid_accounts').update(update).eq('id', canonical.id).select(STORED_FIELDS).single();
  if (saved.error) throw new Error(saved.error.message);
  if (canonical.mask) {
    const relinked = await db.from('transactions').update({ source_connection_status: 'connected' }).eq('user_id', item.user_id).eq('source', 'plaid').eq('source_institution', item.institution_name).eq('source_account_mask', canonical.mask).eq('source_connection_status', 'unlinked');
    if (relinked.error) throw new Error(relinked.error.message);
  }
  return saved.data as StoredAccount;
}

/** Keeps one ledger row per movement when two connections imported the same account. The reviewed copy wins. */
async function mergeLedgerCopies(db: SupabaseClient, item: ItemRow, account: StoredAccount) {
  if (!account.mask) return;
  const rows: (LedgerCopy & { import_key: string | null })[] = [];
  let from = 0;
  for (;;) {
    const page = await db.from('transactions').select('id,transaction_date,amount,description,needs_review,import_key').eq('user_id', item.user_id).eq('source', 'plaid').eq('source_institution', item.institution_name).eq('source_account_mask', account.mask).eq('status', 'posted').is('archived_at', null).order('id').range(from, from + 499);
    if (page.error) throw new Error(page.error.message);
    const batch = page.data || [];
    batch.forEach(row => rows.push({ id: row.id, date: String(row.transaction_date || ''), amount: Number(row.amount), description: row.description || '', needs_review: Boolean(row.needs_review), import_key: row.import_key, live: false }));
    if (batch.length < 500) break;
    from += 500;
  }
  if (rows.length < 2) return;
  const live = new Set<string>();
  for (let index = 0; index < rows.length; index += 100) {
    const ids = rows.slice(index, index + 100).map(row => row.id);
    const links = await db.from('plaid_transactions').select('ledger_transaction_id').eq('item_id', item.id).eq('removed', false).in('ledger_transaction_id', ids);
    if (links.error) throw new Error(links.error.message);
    (links.data || []).forEach(link => live.add(link.ledger_transaction_id));
  }
  rows.forEach(row => { row.live = live.has(row.id); });
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const pair of connectionDuplicatePairs(rows)) {
    const keep = byId.get(pair.keep.id)!;
    const drop = byId.get(pair.drop.id)!;
    const liveKey = keep.live ? keep.import_key : drop.import_key;
    const archived = await db.from('transactions').update({ archived_at: new Date().toISOString(), import_key: null }).eq('id', drop.id);
    if (archived.error) throw new Error(archived.error.message);
    const kept = await db.from('transactions').update({ import_key: liveKey, source_connection_status: 'connected' }).eq('id', keep.id);
    if (kept.error) throw new Error(kept.error.message);
    const relinked = await db.from('plaid_transactions').update({ ledger_transaction_id: keep.id }).eq('ledger_transaction_id', drop.id);
    if (relinked.error) throw new Error(relinked.error.message);
  }
}

/** A connection whose accounts all moved to a newer connection is retired. Its history stays in the ledger. */
async function retireEmptyItems(db: SupabaseClient, siblings: ItemRow[], currentItemId: string) {
  const current = siblings.find(item => item.id === currentItemId);
  for (const item of siblings) {
    if (item.id === currentItemId || item.disconnected_at) continue;
    if (current && item.created_at > current.created_at) continue;
    const { count, error } = await db.from('plaid_accounts').select('id', { count: 'exact', head: true }).eq('item_id', item.id).is('archived_at', null);
    if (error) throw new Error(error.message);
    if (count) continue;
    if (item.access_token_encrypted !== 'revoked') {
      try {
        await plaidClient().itemRemove({ access_token: decryptToken(item.access_token_encrypted) });
      } catch {
        // The bank may already have revoked this connection.
      }
    }
    const retired = await db.from('plaid_items').update({ status: 'superseded', disconnected_at: new Date().toISOString(), access_token_encrypted: 'revoked', error_code: null, error_message: null }).eq('id', item.id);
    if (retired.error) throw new Error(retired.error.message);
  }
}

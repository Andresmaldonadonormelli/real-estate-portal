import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, errorMessage, plaidClient, plaidErrorDetails } from './server';
import { adoptableCopies } from './accountIdentity';
import { idsToDecline, ledgerDraftFromPlaid, matchLinkedAccount, plaidAmount, sameAccountMovement, shouldReplaceLedgerDetails, supersededLedgerIds, type MovementRow, type PlaidTransactionLike } from './mapTransaction';

type PlaidItem = { id: string; user_id: string; access_token_encrypted: string; cursor: string | null; institution_name: string };
type LinkedAccount = { id: string; plaid_account_id: string; property_id: string | null; mask: string | null; type: string | null; subtype: string | null; import_enabled: boolean; alias_ids?: string[] };
type SyncOptions = { refresh?: boolean; resync?: boolean };
type LedgerRow = { id: string; status?: string | null; needs_review?: boolean | null; category?: string | null; archived_at?: string | null };

const ACCOUNT_FIELDS = 'id,plaid_account_id,property_id,mask,type,subtype,import_enabled';

export async function backfillPlaidAccount(db: SupabaseClient, item: PlaidItem, accountId: string) {
  const { data: account, error } = await db.from('plaid_accounts').select(ACCOUNT_FIELDS).eq('id', accountId).eq('item_id', item.id).single();
  if (error) throw error;
  await healAccount(db, item, account as LinkedAccount);
}

/** Plaid codes that cannot clear until the bank connection is signed in again. */
const REAUTH_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'INVALID_ACCESS_TOKEN', 'ITEM_NOT_FOUND', 'ACCESS_NOT_GRANTED', 'USER_PERMISSION_REVOKED', 'NO_ACCOUNTS', 'INVALID_CREDENTIALS', 'ITEM_LOCKED']);

export async function syncPlaidItem(db: SupabaseClient, item: PlaidItem, options: SyncOptions = {}) {
  try {
    return await runSync(db, item, options);
  } catch (error) {
    await recordSyncFailure(db, item, error);
    throw error;
  }
}

/** The failure belongs to this connection only; its accounts and other connections keep their state. */
async function recordSyncFailure(db: SupabaseClient, item: PlaidItem, error: unknown) {
  const plaid = plaidErrorDetails(error);
  console.error('[plaid sync]', { itemId: item.id, institution: item.institution_name, code: plaid?.code || null, requestId: plaid?.requestId || null, message: errorMessage(error) });
  const update: Record<string, string | null> = { error_code: plaid?.code || 'SYNC_FAILED', error_message: errorMessage(error) };
  if (plaid && REAUTH_CODES.has(plaid.code)) update.status = 'needs_reauth';
  const saved = await db.from('plaid_items').update(update).eq('id', item.id);
  if (saved.error) console.error('[plaid sync] could not record failure', { itemId: item.id, message: saved.error.message });
}

/** Records what Plaid currently reports for a connection without importing anything. */
export async function checkConnectionHealth(db: SupabaseClient, item: PlaidItem & { status?: string | null; error_code?: string | null }) {
  try {
    const response = await plaidClient().itemGet({ access_token: decryptToken(item.access_token_encrypted) });
    const problem = response.data.item.error;
    if (problem?.error_code) {
      await db.from('plaid_items').update({
        error_code: problem.error_code,
        error_message: `${problem.display_message || problem.error_message} (${problem.error_code})`,
        ...(REAUTH_CODES.has(problem.error_code) ? { status: 'needs_reauth' } : {}),
      }).eq('id', item.id);
      return;
    }
    if (item.error_code || item.status === 'needs_reauth') {
      await db.from('plaid_items').update({ error_code: null, error_message: null, ...(item.status === 'needs_reauth' ? { status: 'connected' } : {}) }).eq('id', item.id);
    }
  } catch (error) {
    await recordSyncFailure(db, item, error);
  }
}

async function runSync(db: SupabaseClient, item: PlaidItem, options: SyncOptions) {
  const accessToken = decryptToken(item.access_token_encrypted);
  let refreshRequested = false;
  if (options.refresh) {
    try {
      await plaidClient().transactionsRefresh({ access_token: accessToken });
      refreshRequested = true;
    } catch {
      refreshRequested = false;
    }
  }

  const startCursor = options.resync ? undefined : item.cursor || undefined;
  const pulled = await pullTransactions(accessToken, startCursor);
  const accounts = await linkedAccounts(db, item.id);
  const remoteAccounts = new Map((pulled.accounts || []).map(account => [account.account_id, account]));
  const byPlaid = new Map<string, LinkedAccount>();
  for (const account of accounts) byPlaid.set(account.plaid_account_id, account);

  const changed = [...pulled.added, ...pulled.modified];
  const adopted: string[] = [];
  let created = 0;
  for (const row of changed) {
    const account = row.account_id ? await resolveAccount(db, accounts, byPlaid, row.account_id, remoteAccounts.get(row.account_id)) : null;
    const saved = await db.from('plaid_transactions').upsert(plaidRow(item, account, row), { onConflict: 'plaid_transaction_id' });
    if (saved.error) throw new Error(saved.error.message);
    if (!account) continue;
    const result = await materialize(db, item, row, account);
    created += result.created;
    if (result.adoptedId) adopted.push(result.adoptedId);
  }

  const removedIds = pulled.removed.filter(id => !changed.some(row => row.transaction_id === id));
  await declineRemoved(db, removedIds, adopted);

  if (options.resync && pulled.updateStatus === 'HISTORICAL_UPDATE_COMPLETE') {
    await reconcileMissing(db, item.id, new Set(changed.map(row => String(row.transaction_id || ''))), adopted);
  }

  for (const account of accounts) created += await healAccount(db, item, account);
  for (const account of accounts) await collapseAccountDuplicates(db, item.user_id, account);

  await updateBalances(db, item.id, accessToken, pulled.accounts || []);
  const cursorSaved = await db.from('plaid_items').update({
    cursor: pulled.cursor,
    last_synced_at: new Date().toISOString(),
    status: 'connected',
    error_code: null,
    error_message: null,
  }).eq('id', item.id);
  if (cursorSaved.error) throw new Error(cursorSaved.error.message);
  return { added: pulled.added.length, modified: pulled.modified.length, removed: removedIds.length, created, refreshRequested };
}

async function pullTransactions(accessToken: string, startCursor?: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const added: PlaidTransactionLike[] = [];
    const modified: PlaidTransactionLike[] = [];
    const removed: string[] = [];
    const accounts: any[] = [];
    let cursor = startCursor;
    let hasMore = true;
    let updateStatus = '';
    try {
      while (hasMore) {
        const response = await plaidClient().transactionsSync({ access_token: accessToken, cursor, count: 500 });
        added.push(...(response.data.added || []));
        modified.push(...(response.data.modified || []));
        removed.push(...(response.data.removed || []).map(row => row.transaction_id));
        accounts.push(...(response.data.accounts || []));
        cursor = response.data.next_cursor;
        hasMore = response.data.has_more;
        updateStatus = response.data.transactions_update_status || updateStatus;
      }
      return { added, modified, removed, accounts, cursor, updateStatus };
    } catch (error) {
      lastError = error;
      if (plaidErrorCode(error) !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not sync bank transactions.');
}

async function linkedAccounts(db: SupabaseClient, itemId: string) {
  const { data, error } = await db.from('plaid_accounts').select(ACCOUNT_FIELDS).eq('item_id', itemId).is('archived_at', null);
  if (error) throw new Error(error.message);
  return (data || []) as LinkedAccount[];
}

async function resolveAccount(db: SupabaseClient, accounts: LinkedAccount[], byPlaid: Map<string, LinkedAccount>, plaidAccountId: string, remote?: any) {
  const known = byPlaid.get(plaidAccountId);
  if (known) return known;
  const matched = matchLinkedAccount(accounts, plaidAccountId, remote ? { mask: remote.mask, type: remote.type, subtype: remote.subtype } : null);
  if (!matched) return null;
  byPlaid.set(plaidAccountId, matched);
  matched.alias_ids = [...new Set([...(matched.alias_ids || [matched.plaid_account_id]), plaidAccountId])];
  if (matched.plaid_account_id !== plaidAccountId) {
    const renamed = await db.from('plaid_accounts').update({ plaid_account_id: plaidAccountId }).eq('id', matched.id).eq('plaid_account_id', matched.plaid_account_id);
    if (!renamed.error) {
      byPlaid.delete(matched.plaid_account_id);
      matched.plaid_account_id = plaidAccountId;
    }
  }
  return matched;
}

async function materialize(db: SupabaseClient, item: PlaidItem, row: PlaidTransactionLike, account: LinkedAccount) {
  if (!account.property_id || account.import_enabled === false) return { created: 0, adoptedId: null as string | null };
  const draft = ledgerDraftFromPlaid(row);
  if (!draft.transaction_date || !row.transaction_id) return { created: 0, adoptedId: null as string | null };
  const payload = {
    user_id: item.user_id,
    property_id: account.property_id,
    unit_id: null,
    transaction_date: draft.transaction_date,
    type: draft.type,
    category: draft.category,
    description: draft.description,
    payee_source: draft.payee_source,
    amount: draft.amount,
    notes: 'Imported from linked bank account',
    source: 'plaid',
    source_institution: item.institution_name,
    source_account_mask: account.mask,
    source_connection_status: 'connected',
    import_key: draft.import_key,
    status: draft.status,
    confirmed_at: draft.status === 'posted' ? new Date().toISOString() : null,
    needs_review: draft.needs_review,
    is_new_import: draft.status === 'posted',
    import_acknowledged_at: null,
  };
  const existingResult = await db.from('transactions').select('id,status,needs_review,category,archived_at').eq('user_id', item.user_id).eq('import_key', payload.import_key).maybeSingle();
  if (existingResult.error) throw new Error(existingResult.error.message);
  let ledger: LedgerRow | null = existingResult.data as LedgerRow | null;
  let created = 0;
  let adoptedId: string | null = null;

  if (!ledger && row.pending_transaction_id) {
    const predecessor = await db.from('plaid_transactions').select('ledger_transaction_id').eq('plaid_transaction_id', row.pending_transaction_id).maybeSingle();
    if (predecessor.error) throw new Error(predecessor.error.message);
    if (predecessor.data?.ledger_transaction_id) {
      const prior = await db.from('transactions').select('id,status,needs_review,category,archived_at').eq('id', predecessor.data.ledger_transaction_id).maybeSingle();
      if (prior.error) throw new Error(prior.error.message);
      if (prior.data && !prior.data.archived_at) {
        ledger = prior.data as LedgerRow;
        adoptedId = prior.data.id;
      }
    }
  }

  if (!ledger && account.mask && draft.transaction_date && draft.status === 'posted') {
    const earlier = await findEarlierConnectionCopy(db, item, account.mask, draft);
    if (earlier) {
      ledger = earlier;
      adoptedId = earlier.id;
    }
  }

  if (!ledger && account.mask && draft.transaction_date && draft.status === 'posted') {
    const predecessor = await findAccountMovement(db, item.user_id, account.mask, draft, ['pending', 'declined']);
    if (predecessor) {
      ledger = predecessor;
      adoptedId = predecessor.id;
    }
  }

  if (!ledger && account.mask && draft.transaction_date && draft.status === 'pending') {
    const postedSibling = await findAccountMovement(db, item.user_id, account.mask, draft, ['posted']);
    if (postedSibling) {
      const hidden = await db.from('plaid_transactions').update({ removed: true, ledger_transaction_id: null }).eq('plaid_transaction_id', row.transaction_id);
      if (hidden.error) throw new Error(hidden.error.message);
      return { created: 0, adoptedId: null };
    }
  }

  if (ledger?.archived_at) {
    await linkLedger(db, row.transaction_id, ledger.id);
    return { created: 0, adoptedId: null };
  }

  if (ledger) {
    const { is_new_import: ignoredNew, import_acknowledged_at: ignoredAt, ...reviewUpdate } = payload;
    const update: Record<string, unknown> = shouldReplaceLedgerDetails(ledger) ? reviewUpdate : {
      transaction_date: payload.transaction_date,
      amount: payload.amount,
      status: payload.status,
      confirmed_at: payload.confirmed_at,
      source_connection_status: 'connected',
    };
    if ((ledger.status === 'pending' || ledger.status === 'declined') && payload.status === 'posted') {
      update.status = 'posted';
      update.confirmed_at = payload.confirmed_at;
      update.is_new_import = true;
      update.import_acknowledged_at = null;
    }
    if (adoptedId) update.import_key = payload.import_key;
    const saved = await db.from('transactions').update(update).eq('id', ledger.id).select('id').single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message || 'Could not update the bank transaction.');
    ledger = { id: saved.data.id };
  } else {
    const saved = await db.from('transactions').insert(payload).select('id').single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message || 'Could not save the bank transaction.');
    ledger = { id: saved.data.id };
    created = 1;
  }

  await linkLedger(db, String(row.transaction_id), ledger.id);
  if (adoptedId) {
    const cleared = await db.from('plaid_transactions').update({ ledger_transaction_id: null }).eq('ledger_transaction_id', adoptedId).neq('plaid_transaction_id', String(row.transaction_id));
    if (cleared.error) throw new Error(cleared.error.message);
  }
  return { created, adoptedId };
}

async function linkLedger(db: SupabaseClient, plaidTransactionId: string, ledgerId: string) {
  const linked = await db.from('plaid_transactions').update({ ledger_transaction_id: ledgerId }).eq('plaid_transaction_id', plaidTransactionId);
  if (linked.error) throw new Error(linked.error.message);
}

async function declineRemoved(db: SupabaseClient, removedIds: string[], adoptedIds: string[]) {
  if (!removedIds.length) return;
  const ledgerIds: string[] = [];
  for (const ids of chunks(removedIds, 100)) {
    const linked = await db.from('plaid_transactions').select('ledger_transaction_id').in('plaid_transaction_id', ids);
    if (linked.error) throw new Error(linked.error.message);
    ledgerIds.push(...(linked.data || []).map(row => row.ledger_transaction_id).filter(Boolean));
    const marked = await db.from('plaid_transactions').update({ removed: true }).in('plaid_transaction_id', ids);
    if (marked.error) throw new Error(marked.error.message);
  }
  await declineLedger(db, idsToDecline(ledgerIds, adoptedIds));
}

async function reconcileMissing(db: SupabaseClient, itemId: string, liveIds: Set<string>, adoptedIds: string[]) {
  const staleIds: string[] = [];
  const ledgerIds: string[] = [];
  let from = 0;
  for (;;) {
    const page = await db.from('plaid_transactions').select('plaid_transaction_id,ledger_transaction_id').eq('item_id', itemId).eq('removed', false).range(from, from + 499);
    if (page.error) throw new Error(page.error.message);
    const rows = page.data || [];
    for (const row of rows) {
      if (liveIds.has(row.plaid_transaction_id)) continue;
      staleIds.push(row.plaid_transaction_id);
      if (row.ledger_transaction_id) ledgerIds.push(row.ledger_transaction_id);
    }
    if (rows.length < 500) break;
    from += 500;
  }
  for (const ids of chunks(staleIds, 100)) {
    const marked = await db.from('plaid_transactions').update({ removed: true }).in('plaid_transaction_id', ids);
    if (marked.error) throw new Error(marked.error.message);
  }
  await declineLedger(db, idsToDecline(ledgerIds, adoptedIds));
}

async function healAccount(db: SupabaseClient, item: PlaidItem, account: LinkedAccount) {
  if (!account.property_id || account.import_enabled === false) return 0;
  let created = 0;
  for (const plaidAccountId of account.alias_ids?.length ? account.alias_ids : [account.plaid_account_id]) {
    const relinked = await db.from('plaid_transactions').update({ account_id: account.id }).eq('item_id', item.id).is('account_id', null).filter('raw_data->>account_id', 'eq', plaidAccountId);
    if (relinked.error) throw new Error(relinked.error.message);
  }
  let from = 0;
  for (;;) {
    const page = await db.from('plaid_transactions').select('raw_data,ledger_transaction_id').eq('account_id', account.id).eq('item_id', item.id).eq('removed', false).order('transaction_date').range(from, from + 499);
    if (page.error) throw new Error(page.error.message);
    const rows = page.data || [];
    if (!rows.length) break;
    const ledgerIds = rows.map(row => row.ledger_transaction_id).filter(Boolean);
    const ledgers = ledgerIds.length ? await db.from('transactions').select('id,status,needs_review,category,type,amount').in('id', ledgerIds) : { data: [], error: null };
    if (ledgers.error) throw new Error(ledgers.error.message);
    const byId = new Map((ledgers.data || []).map(row => [row.id, row]));
    for (const row of rows) {
      if (!row.raw_data) continue;
      const raw = row.raw_data as PlaidTransactionLike;
      const ledger = row.ledger_transaction_id ? byId.get(row.ledger_transaction_id) : null;
      const draft = ledgerDraftFromPlaid(raw);
      const stored = Number(ledger?.amount);
      const signWrong = Boolean(ledger?.needs_review) && Number.isFinite(stored) && Math.abs(stored - draft.amount) > 0.009;
      const misfiled = signWrong || Boolean(ledger?.needs_review && ledger.type === 'transfer' && plaidAmount(raw.amount) < 0 && !String(raw.personal_finance_category?.primary || '').startsWith('TRANSFER_'));
      if (!ledger || ledger.status === 'declined' || misfiled) created += (await materialize(db, item, raw, account)).created;
    }
    if (rows.length < 500) break;
    from += 500;
  }
  return created;
}

async function declineLedger(db: SupabaseClient, ledgerIds: string[]) {
  for (const ids of chunks(ledgerIds, 100)) {
    const declined = await db.from('transactions').update({ status: 'declined', needs_review: false }).in('id', ids);
    if (declined.error) throw new Error(declined.error.message);
  }
}

async function updateBalances(db: SupabaseClient, itemId: string, accessToken: string, syncedAccounts: any[]) {
  for (const account of syncedAccounts) {
    await db.from('plaid_accounts').update({
      current_balance: account.balances?.current ?? null,
      available_balance: account.balances?.available ?? null,
      iso_currency_code: account.balances?.iso_currency_code || 'USD',
      last_synced_at: new Date().toISOString(),
    }).eq('item_id', itemId).eq('plaid_account_id', account.account_id);
  }
  try {
    const balances = await plaidClient().accountsBalanceGet({ access_token: accessToken });
    for (const account of balances.data.accounts || []) {
      await db.from('plaid_accounts').update({
        current_balance: account.balances.current,
        available_balance: account.balances.available,
        iso_currency_code: account.balances.iso_currency_code || 'USD',
        last_synced_at: new Date().toISOString(),
      }).eq('item_id', itemId).eq('plaid_account_id', account.account_id);
    }
  } catch {
    // Chase often rejects a live balance refresh. Transactions still import.
  }
}

async function findAccountMovement(db: SupabaseClient, userId: string, mask: string, draft: { amount: number; transaction_date: string | null; description: string; status: string }, statuses: string[]) {
  if (!draft.transaction_date) return null;
  const start = shiftIsoDate(draft.transaction_date, -4);
  const end = shiftIsoDate(draft.transaction_date, 4);
  const result = await db.from('transactions').select('id,status,needs_review,category,archived_at,amount,transaction_date,description,source_account_mask').eq('user_id', userId).eq('source', 'plaid').eq('source_account_mask', mask).in('status', statuses).is('archived_at', null).gte('transaction_date', start).lte('transaction_date', end);
  if (result.error) throw new Error(result.error.message);
  const incoming: MovementRow = { id: 'incoming', mask, amount: draft.amount, date: draft.transaction_date, description: draft.description, status: draft.status };
  const matches = (result.data || []).filter(row => sameAccountMovement(incoming, {
    id: row.id,
    mask: row.source_account_mask,
    amount: Number(row.amount),
    date: String(row.transaction_date || ''),
    description: row.description || '',
    status: row.status || 'posted',
  }));
  matches.sort((left, right) => movementRank(left.status || '') - movementRank(right.status || '') || String(left.id).localeCompare(String(right.id)));
  return (matches[0] as LedgerRow | undefined) || null;
}

async function findEarlierConnectionCopy(db: SupabaseClient, item: PlaidItem, mask: string, draft: { amount: number; transaction_date: string | null; description: string }) {
  if (!draft.transaction_date) return null;
  const result = await db.from('transactions').select('id,status,needs_review,category,archived_at,amount,transaction_date,description').eq('user_id', item.user_id).eq('source', 'plaid').eq('source_institution', item.institution_name).eq('source_account_mask', mask).eq('status', 'posted').eq('transaction_date', draft.transaction_date).eq('amount', draft.amount).is('archived_at', null);
  if (result.error) throw new Error(result.error.message);
  const rows = result.data || [];
  if (!rows.length) return null;
  const links = await db.from('plaid_transactions').select('ledger_transaction_id').eq('item_id', item.id).eq('removed', false).in('ledger_transaction_id', rows.map(row => row.id));
  if (links.error) throw new Error(links.error.message);
  const live = new Set((links.data || []).map(link => link.ledger_transaction_id));
  const [match] = adoptableCopies(rows.map(row => ({
    id: row.id,
    date: String(row.transaction_date || ''),
    amount: Number(row.amount),
    description: row.description || '',
    needs_review: Boolean(row.needs_review),
    live: live.has(row.id),
  })), { date: draft.transaction_date, amount: draft.amount, description: draft.description });
  return match ? (rows.find(row => row.id === match.id) as LedgerRow) : null;
}

async function collapseAccountDuplicates(db: SupabaseClient, userId: string, account: LinkedAccount) {
  if (!account.mask || !account.property_id || account.import_enabled === false) return;
  const rows: MovementRow[] = [];
  let from = 0;
  for (;;) {
    const page = await db.from('transactions').select('id,amount,transaction_date,description,status,source_account_mask').eq('user_id', userId).eq('source', 'plaid').eq('source_account_mask', account.mask).is('archived_at', null).order('id').range(from, from + 499);
    if (page.error) throw new Error(page.error.message);
    const batch = page.data || [];
    for (const row of batch) {
      rows.push({
        id: row.id,
        mask: row.source_account_mask,
        amount: Number(row.amount),
        date: String(row.transaction_date || ''),
        description: row.description || '',
        status: row.status || 'posted',
      });
    }
    if (batch.length < 500) break;
    from += 500;
  }
  const linked = await db.from('plaid_transactions').select('ledger_transaction_id,pending,removed').eq('account_id', account.id).eq('removed', false).eq('pending', false);
  if (linked.error) throw new Error(linked.error.message);
  const livePosted = (linked.data || []).map(row => row.ledger_transaction_id).filter(Boolean);
  for (const ids of chunks(supersededLedgerIds(rows, livePosted), 100)) {
    const archived = await db.from('transactions').update({ archived_at: new Date().toISOString(), status: 'declined' }).in('id', ids).eq('user_id', userId).eq('source', 'plaid');
    if (archived.error) throw new Error(archived.error.message);
  }
}

function movementRank(status: string) {
  if (status === 'pending') return 0;
  if (status === 'declined') return 1;
  return 2;
}

function shiftIsoDate(iso: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function plaidRow(item: PlaidItem, account: LinkedAccount | null, row: PlaidTransactionLike) {
  return {
    user_id: item.user_id,
    item_id: item.id,
    account_id: account?.id || null,
    plaid_transaction_id: row.transaction_id,
    transaction_date: ledgerDraftFromPlaid(row).transaction_date,
    authorized_date: row.authorized_date || null,
    name: row.name,
    merchant_name: row.merchant_name || null,
    amount: row.amount,
    pending: Boolean(row.pending),
    pending_transaction_id: row.pending_transaction_id || null,
    category_primary: row.personal_finance_category?.primary || null,
    category_detailed: row.personal_finance_category?.detailed || null,
    removed: false,
    raw_data: JSON.parse(JSON.stringify(row)),
  };
}

function chunks<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function plaidErrorCode(error: unknown) {
  const response = (error as { response?: { data?: { error_code?: string } } })?.response;
  return response?.data?.error_code || '';
}

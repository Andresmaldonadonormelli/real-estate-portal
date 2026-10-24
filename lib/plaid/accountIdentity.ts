export type StoredAccount = {
  id: string;
  item_id: string;
  plaid_account_id: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  property_id: string | null;
  import_enabled: boolean;
  archived_at: string | null;
  created_at?: string | null;
  persistent_account_id?: string | null;
};

export type RemoteAccount = {
  account_id: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  persistent_account_id?: string | null;
};

export type LedgerCopy = {
  id: string;
  date: string;
  amount: number;
  description: string;
  needs_review: boolean;
  live: boolean;
};

const SUPERSEDED_PREFIX = 'superseded:';

export function isSupersededAccount(account: Pick<StoredAccount, 'plaid_account_id'>) {
  return account.plaid_account_id.startsWith(SUPERSEDED_PREFIX);
}

/** Frees the unique Plaid id on a merged copy while keeping which canonical row replaced it. */
export function supersededPlaidId(canonicalId: string, previousPlaidId: string) {
  return `${SUPERSEDED_PREFIX}${canonicalId}:${previousPlaidId}`;
}

/** Chase issues new account ids on every reconnect; persistent_account_id, then mask + type + subtype, survive it. */
export function sameRealAccount(left: Omit<RemoteAccount, 'account_id'>, right: Omit<RemoteAccount, 'account_id'>) {
  if (left.persistent_account_id && right.persistent_account_id) return left.persistent_account_id === right.persistent_account_id;
  if (!left.mask || left.mask !== right.mask) return false;
  return (left.type || '') === (right.type || '') && (left.subtype || '') === (right.subtype || '');
}

/** The copy that keeps its id: assigned and importing first, then assigned, then visible, then the oldest. */
export function canonicalAccount<T extends StoredAccount>(rows: T[]) {
  const rank = (row: T) => (row.property_id && row.import_enabled ? 0 : row.property_id ? 1 : 2) * 2 + (row.archived_at ? 1 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id.localeCompare(b.id))[0] || null;
}

/** Every stored copy of the account Plaid just returned. Empty when the match is ambiguous. */
export function copiesOfAccount<T extends StoredAccount>(stored: T[], remote: RemoteAccount) {
  const active = stored.filter(row => !isSupersededAccount(row));
  const exact = active.filter(row => row.plaid_account_id === remote.account_id);
  const similar = active.filter(row => row.plaid_account_id !== remote.account_id && sameRealAccount(row, remote));
  const itemIds = similar.map(row => row.item_id);
  const ambiguous = new Set(itemIds).size !== itemIds.length && !similar.every(row => row.persistent_account_id && remote.persistent_account_id);
  return ambiguous ? exact : [...exact, ...similar];
}

/** Visible accounts on different connections that are the same real account. */
export function duplicateAccountGroups<T extends StoredAccount>(rows: T[]) {
  const visible = rows.filter(row => !row.archived_at && !isSupersededAccount(row));
  const used = new Set<string>();
  const groups: T[][] = [];
  for (const row of visible) {
    if (used.has(row.id)) continue;
    const group = visible.filter(other => other.id === row.id || (!used.has(other.id) && other.item_id !== row.item_id && sameRealAccount(row, other)));
    group.forEach(member => used.add(member.id));
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

function normalizedDescription(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function copyKey(row: Pick<LedgerCopy, 'date' | 'amount' | 'description'>) {
  return `${row.date.slice(0, 10)}|${Math.round(Number(row.amount) * 100)}|${normalizedDescription(row.description)}`;
}

/** Older ledger rows for the same movement that a reconnected account may take over. Reviewed rows first. */
export function adoptableCopies(candidates: LedgerCopy[], incoming: Pick<LedgerCopy, 'date' | 'amount' | 'description'>) {
  const key = copyKey(incoming);
  return candidates
    .filter(row => !row.live && copyKey(row) === key)
    .sort((a, b) => Number(a.needs_review) - Number(b.needs_review) || a.id.localeCompare(b.id));
}

/** Pairs each row imported by the current connection with its copy from a superseded one. */
export function connectionDuplicatePairs(rows: LedgerCopy[]) {
  const groups = new Map<string, LedgerCopy[]>();
  rows.forEach(row => groups.set(copyKey(row), [...(groups.get(copyKey(row)) || []), row]));
  const pairs: { keep: LedgerCopy; drop: LedgerCopy }[] = [];
  groups.forEach(group => {
    const live = group.filter(row => row.live).sort((a, b) => a.id.localeCompare(b.id));
    const stale = group.filter(row => !row.live).sort((a, b) => Number(a.needs_review) - Number(b.needs_review) || a.id.localeCompare(b.id));
    for (let index = 0; index < Math.min(live.length, stale.length); index++) {
      const keepStale = !stale[index].needs_review || live[index].needs_review;
      pairs.push(keepStale ? { keep: stale[index], drop: live[index] } : { keep: live[index], drop: stale[index] });
    }
  });
  return pairs;
}

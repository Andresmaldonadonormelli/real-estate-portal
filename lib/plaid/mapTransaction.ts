export type LedgerType = 'income' | 'expense' | 'transfer';

export type PlaidTransactionLike = {
  transaction_id?: string;
  account_id?: string;
  amount?: number | string | null;
  date?: string | null;
  authorized_date?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  pending?: boolean | null;
  pending_transaction_id?: string | null;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
};

export type LedgerDraft = {
  type: LedgerType;
  category: string;
  amount: number;
  status: 'pending' | 'posted';
  transaction_date: string | null;
  description: string;
  payee_source: string | null;
  import_key: string;
  needs_review: boolean;
};

export type MatchableAccount = {
  plaid_account_id: string;
  mask: string | null;
  type?: string | null;
  subtype?: string | null;
};

const IMPORT_CATEGORIES = new Set(['Needs Review', 'Uncategorized Inflow', 'Transfer', 'Credit Card Payment', 'Mortgage Payment']);

export function plaidAmount(value: number | string | null | undefined) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export type MovementRow = {
  id: string;
  mask: string | null;
  amount: number;
  date: string;
  description: string;
  status: string;
};

export function ledgerDraftFromPlaid(row: PlaidTransactionLike): LedgerDraft {
  const detailed = String(row.personal_finance_category?.detailed || '');
  const raw = plaidAmount(row.amount);
  const memo = `${row.name || ''} ${row.merchant_name || ''}`.toLowerCase();
  const hinted = memoDirection(memo);
  const outgoing = hinted ? hinted === 'out' : raw > 0;
  const amount = hinted ? (outgoing ? -Math.abs(raw) : Math.abs(raw)) : -raw;
  const creditCardPayment = detailed.includes('CREDIT_CARD_PAYMENT');
  const mortgagePayment = detailed.includes('MORTGAGE');
  const internal = !/\bzelle\b/.test(memo) && (creditCardPayment || detailed.includes('ACCOUNT_TRANSFER') || /\bonline transfer\b|\b(to|from) (chk|sav|checking|savings)\b/.test(memo));
  let type: LedgerType;
  let category: string;
  if (creditCardPayment) {
    type = 'transfer';
    category = 'Credit Card Payment';
  } else if (mortgagePayment) {
    type = 'expense';
    category = 'Mortgage Payment';
  } else if (internal) {
    type = 'transfer';
    category = 'Transfer';
  } else if (!outgoing) {
    type = 'income';
    category = 'Uncategorized Inflow';
  } else {
    type = 'expense';
    category = 'Needs Review';
  }
  const status = row.pending ? 'pending' : 'posted';
  const transaction_date = isoDate(row.date) || isoDate(row.authorized_date);
  const description = (row.merchant_name || row.name || 'Bank transaction').trim() || 'Bank transaction';
  return {
    type,
    category,
    amount,
    status,
    transaction_date,
    description,
    payee_source: row.merchant_name || row.name || null,
    import_key: `plaid:${row.transaction_id || ''}`,
    needs_review: category !== 'Transfer',
  };
}

export function sameAccountMovement(left: MovementRow, right: MovementRow) {
  if (!left.mask || left.mask !== right.mask) return false;
  if (Math.abs(Math.abs(left.amount) - Math.abs(right.amount)) > 0.009) return false;
  if (daysApart(left.date, right.date) > 4) return false;
  return descriptionsMatch(left.description, right.description);
}

export function supersededLedgerIds(rows: MovementRow[], protectedIds: string[] = []) {
  const protect = new Set(protectedIds.filter(Boolean));
  const drop = new Set<string>();
  rows.forEach((row, index) => {
    rows.slice(index + 1).forEach(other => {
      if (drop.has(row.id) && drop.has(other.id)) return;
      if (!sameAccountMovement(row, other)) return;
      const preferred = keeper(row, other);
      const loser = preferred === row ? other : row;
      if (protect.has(loser.id) && !protect.has(preferred.id)) drop.add(preferred.id);
      else if (!protect.has(loser.id)) drop.add(loser.id);
    });
  });
  return [...drop];
}

export function shouldReplaceLedgerDetails(existing: { needs_review?: boolean | null; status?: string | null; category?: string | null }) {
  return Boolean(existing.needs_review) || (existing.status === 'declined' && IMPORT_CATEGORIES.has(existing.category || ''));
}

export function idsToDecline(candidateIds: string[], adoptedIds: string[]) {
  const adopted = new Set(adoptedIds.filter(Boolean));
  return [...new Set(candidateIds.filter(id => id && !adopted.has(id)))];
}

export function matchLinkedAccount<T extends MatchableAccount>(accounts: T[], plaidAccountId: string, remote?: { mask?: string | null; type?: string | null; subtype?: string | null } | null) {
  const direct = accounts.find(account => account.plaid_account_id === plaidAccountId);
  if (direct) return direct;
  if (!remote?.mask) return null;
  const matches = accounts.filter(account => account.mask === remote.mask && (!remote.type || !account.type || account.type === remote.type) && (!remote.subtype || !account.subtype || account.subtype === remote.subtype));
  return matches.length === 1 ? matches[0] : null;
}

function memoDirection(memo: string): 'out' | 'in' | null {
  const incoming = /\b(transfer|payment) from\b/.test(memo) || /\bfrom (chk|sav|checking|savings)\b/.test(memo) || (/\bzelle\b/.test(memo) && /\bfrom\b/.test(memo));
  const outgoing = /\b(transfer|payment) to\b/.test(memo) || /\bto (chk|sav|checking|savings)\b/.test(memo) || (/\bzelle\b/.test(memo) && /\bto\b/.test(memo));
  if (incoming && outgoing) {
    const fromAt = memo.search(/\bfrom\b/);
    const toAt = memo.search(/\bto\b/);
    return fromAt >= 0 && (toAt < 0 || fromAt < toAt) ? 'in' : 'out';
  }
  if (incoming) return 'in';
  if (outgoing) return 'out';
  return null;
}

function descriptionsMatch(left: string, right: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 12 && longer.includes(shorter);
}

function daysApart(left: string, right: string) {
  const a = Date.parse(`${left.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 99;
  return Math.abs(a - b) / 86400000;
}

function keeper(left: MovementRow, right: MovementRow) {
  const rank = (row: MovementRow) => row.status === 'posted' ? 2 : row.status === 'pending' ? 1 : 0;
  if (rank(left) !== rank(right)) return rank(left) > rank(right) ? left : right;
  return left.id < right.id ? left : right;
}

function isoDate(value?: string | null) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

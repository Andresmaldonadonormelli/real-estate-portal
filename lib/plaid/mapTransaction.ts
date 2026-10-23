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

export function ledgerDraftFromPlaid(row: PlaidTransactionLike): LedgerDraft {
  const primary = String(row.personal_finance_category?.primary || '');
  const detailed = String(row.personal_finance_category?.detailed || '');
  const raw = plaidAmount(row.amount);
  const moneyIn = raw < 0;
  const absolute = Math.abs(raw);
  const creditCardPayment = detailed.includes('CREDIT_CARD_PAYMENT');
  const mortgagePayment = detailed.includes('MORTGAGE');
  const transfer = primary.startsWith('TRANSFER_') || creditCardPayment;
  let type: LedgerType;
  let category: string;
  if (creditCardPayment) {
    type = 'transfer';
    category = 'Credit Card Payment';
  } else if (mortgagePayment) {
    type = 'expense';
    category = 'Mortgage Payment';
  } else if (transfer) {
    type = 'transfer';
    category = 'Transfer';
  } else if (moneyIn || primary === 'INCOME' || primary.startsWith('INCOME_')) {
    type = 'income';
    category = 'Uncategorized Inflow';
  } else {
    type = 'expense';
    category = 'Needs Review';
  }
  const amount = type === 'income' || (type === 'transfer' && moneyIn) ? absolute : -absolute;
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
    needs_review: true,
  };
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

function isoDate(value?: string | null) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

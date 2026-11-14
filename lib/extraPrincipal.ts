import { categoryKey } from './accounting';

export const EXTRA_PRINCIPAL_CATEGORY = 'Extra Principal Payment';

export type PrincipalTransaction = {
  property_id?: string | null;
  category?: string | null;
  amount?: number | null;
  status?: string | null;
  archived_at?: string | null;
  transaction_date?: string | null;
};

export type ManualPrincipal = { date?: string | null; amount?: number | null };

export function isExtraPrincipalCategory(category?: string | null) {
  return categoryKey(category || '') === 'extra-principal';
}

/** Posted extra principal that should already be reflected in the mortgage balance. */
export function postedExtraPrincipal(transaction?: PrincipalTransaction | null) {
  if (!transaction || transaction.archived_at) return 0;
  if ((transaction.status || 'posted') !== 'posted') return 0;
  if (!isExtraPrincipalCategory(transaction.category)) return 0;
  const amount = Math.abs(Number(transaction.amount || 0));
  return amount > 0.004 ? amount : 0;
}

/**
 * Move the stored mortgage balance by the change in posted extra principal.
 * Equity rises by the same amount because equity is value minus this balance.
 * The payment itself is the extra cash invested. It is not applied twice.
 */
export function mortgageBalanceAfterExtraPrincipal(currentBalance: number, previouslyApplied: number, nextApplied: number) {
  const next = Number(currentBalance || 0) + previouslyApplied - nextApplied;
  return Math.max(0, Math.round(next * 100) / 100);
}

/** Additional cash put into the loan, on top of the original cash in the deal. */
export function extraPrincipalInvested(rows: PrincipalTransaction[], propertyId = '') {
  return rows.reduce((sum, row) => {
    if (propertyId && row.property_id !== propertyId) return sum;
    return sum + postedExtraPrincipal(row);
  }, 0);
}

/** Cash invested through extra principal. A manual row and a ledger row for the same day and amount count once. */
export function extraPrincipalCash(manual: ManualPrincipal[], ledger: PrincipalTransaction[], propertyId = '') {
  const seen = new Set<string>();
  let total = 0;
  manual.forEach((row) => {
    const amount = Math.abs(Number(row.amount || 0));
    if (amount < 0.5) return;
    total += amount;
    seen.add(`${(row.date || '').slice(0, 10)}:${Math.round(amount)}`);
  });
  ledger.forEach((row) => {
    if (propertyId && row.property_id !== propertyId) return;
    const amount = postedExtraPrincipal(row);
    if (amount < 0.5) return;
    const key = `${(row.transaction_date || '').slice(0, 10)}:${Math.round(amount)}`;
    if (seen.has(key)) return;
    total += amount;
    seen.add(key);
  });
  return total;
}

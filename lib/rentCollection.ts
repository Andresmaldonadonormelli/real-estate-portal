import { categoryKey } from './accounting';
import { buildPayoutBreakdown, estimatePayoutSplit, isPropertyManagementDeposit } from './managementPayout';

const MOWING = /mow|lawn|landscap/i;
const LABEL_RANK = ['Management fee', 'mowing', 'Repairs', 'Leasing fee', 'Legal', 'Utilities', 'Other'];

export type RentLedgerRow = {
  id: string;
  property_id?: string | null;
  transaction_date?: string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  payee_source?: string | null;
  amount?: number | null;
  notes?: string | null;
  source?: string | null;
  import_key?: string | null;
  status?: string | null;
};

function transactionText(tx: RentLedgerRow) {
  return `${tx.description || ''} ${tx.payee_source || ''} ${tx.notes || ''} ${tx.category || ''}`;
}

export function isMowingTransaction(tx: RentLedgerRow) {
  return MOWING.test(transactionText(tx));
}

/** Label an expense that explains a rent shortfall. Uncategorized mowing still counts. */
export function rentDeductionLabel(tx: RentLedgerRow): string | null {
  if (tx.type && tx.type !== 'expense') return null;
  if (isMowingTransaction(tx)) return 'mowing';
  const category = tx.category || '';
  if (!category || /needs review|uncategor/i.test(category)) return null;
  const key = categoryKey(category);
  if (key === 'management') return 'Management fee';
  if (key === 'maintenance') return 'Repairs';
  if (key === 'utilities') return 'Utilities';
  if (key === 'leasing') return 'Leasing fee';
  if (key === 'legal') return 'Legal';
  if (key === 'review' || key === 'neutral') return 'Other';
  return null;
}

function rank(label: string) {
  const index = LABEL_RANK.indexOf(label);
  return index < 0 ? 99 : index;
}

/**
 * Separate gross rent collected from approved withholdings and true unpaid rent.
 * A manager who already paid the owner a net deposit did not leave that gap outstanding.
 */
export function settleRentCollection(input: {
  expected: number;
  net: number;
  expenses: RentLedgerRow[];
  deposits: RentLedgerRow[];
  feePercent?: number | null;
}) {
  const items: { label: string; amount: number }[] = [];
  input.expenses.forEach((tx) => {
    const label = rentDeductionLabel(tx);
    if (!label) return;
    const amount = Math.abs(Number(tx.amount || 0));
    if (amount > 0.5) items.push({ label, amount });
  });

  const feePercent = Number(input.feePercent || 0);
  const payoutDeposit = input.deposits.find((tx) => isPropertyManagementDeposit(tx, feePercent));
  const managed = Boolean(payoutDeposit) || (feePercent > 0 && input.deposits.some((tx) => Math.abs(Number(tx.amount || 0)) > 0.5));
  if (payoutDeposit) {
    const breakdown = buildPayoutBreakdown(payoutDeposit, feePercent, input.expenses);
    breakdown?.deductions.forEach((row) => {
      const label = MOWING.test(row.label) ? 'mowing' : 'Other';
      const already = items.some((item) => item.label === label && Math.abs(item.amount - row.amount) < 0.5);
      if (!already && row.amount > 0.5) items.push({ label, amount: row.amount });
    });
  }
  if (managed && feePercent > 0 && !items.some((item) => item.label === 'Management fee')) {
    const basis = Math.abs(Number((payoutDeposit || input.deposits[0])?.amount || 0));
    const fee = estimatePayoutSplit(basis, feePercent).fee;
    if (fee > 0.5) items.push({ label: 'Management fee', amount: Math.min(fee, Math.max(0, input.expected - input.net)) });
  }

  const depositMentionsMowing = input.deposits.some(isMowingTransaction);
  const mentioned = depositMentionsMowing || input.expenses.some(isMowingTransaction);
  const gap = Math.max(0, input.expected - input.net);
  const pool = items.reduce((sum, item) => sum + item.amount, 0);
  if (input.net > 0.5 && gap > pool + 0.5 && (managed || depositMentionsMowing)) {
    const hasFee = items.some((item) => item.label === 'Management fee');
    const label = mentioned ? 'mowing' : hasFee ? 'Other' : 'Management fee';
    items.push({ label, amount: gap - pool });
  }

  const applied = Math.min(gap, items.reduce((sum, item) => sum + item.amount, 0));
  const reasons: string[] = [];
  let covered = 0;
  [...items].sort((a, b) => rank(a.label) - rank(b.label) || b.amount - a.amount).forEach((item) => {
    if (covered >= applied - 0.5) return;
    if (!reasons.includes(item.label)) reasons.push(item.label);
    covered += item.amount;
  });

  return {
    expected: input.expected,
    net: input.net,
    gross: input.net + applied,
    deductions: applied,
    unpaid: Math.max(0, gap - applied),
    reason: reasons.slice(0, 3).join(' + '),
  };
}

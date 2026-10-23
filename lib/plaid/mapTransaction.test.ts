import assert from 'node:assert/strict';
import test from 'node:test';
import { idsToDecline, ledgerDraftFromPlaid, matchLinkedAccount, shouldReplaceLedgerDetails } from './mapTransaction.ts';

test('Chase deposits become income instead of transfers', () => {
  const rent = ledgerDraftFromPlaid({ transaction_id: 'rent', amount: -1850, date: '2026-10-14', name: 'ACH CREDIT RENT', personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_OTHER' } });
  assert.equal(rent.type, 'income');
  assert.equal(rent.category, 'Uncategorized Inflow');
  assert.equal(rent.amount, 1850);
  assert.equal(rent.status, 'posted');
  assert.equal(rent.transaction_date, '2026-10-14');

  const unlabeled = ledgerDraftFromPlaid({ transaction_id: 'in', amount: -40, date: '2026-10-13', name: 'DEPOSIT' });
  assert.equal(unlabeled.type, 'income');
  assert.equal(unlabeled.amount, 40);
});

test('spending stays an expense and internal transfers stay transfers', () => {
  const purchase = ledgerDraftFromPlaid({ transaction_id: 'store', amount: 64.2, date: '2026-10-12', name: 'HOME DEPOT', personal_finance_category: { primary: 'HOME_IMPROVEMENT', detailed: 'HOME_IMPROVEMENT_HARDWARE' } });
  assert.equal(purchase.type, 'expense');
  assert.equal(purchase.category, 'Needs Review');
  assert.equal(purchase.amount, -64.2);

  const moved = ledgerDraftFromPlaid({ transaction_id: 'xfer', amount: -500, date: '2026-10-11', name: 'CHASE TRANSFER', personal_finance_category: { primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' } });
  assert.equal(moved.type, 'transfer');
  assert.equal(moved.category, 'Transfer');
  assert.equal(moved.amount, 500);

  const card = ledgerDraftFromPlaid({ transaction_id: 'card', amount: 200, date: '2026-10-10', name: 'CHASE CREDIT CRD AUTOPAY', personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } });
  assert.equal(card.type, 'transfer');
  assert.equal(card.category, 'Credit Card Payment');
  assert.equal(card.amount, -200);

  const mortgage = ledgerDraftFromPlaid({ transaction_id: 'loan', amount: 1400, date: '2026-10-01', name: 'MORTGAGE PAYMENT', personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_MORTGAGE_PAYMENT' } });
  assert.equal(mortgage.type, 'expense');
  assert.equal(mortgage.category, 'Mortgage Payment');
  assert.equal(mortgage.amount, -1400);
});

test('a posted Chase transaction keeps the ledger row when its pending id is removed', () => {
  assert.deepEqual(idsToDecline(['pending-ledger', 'voided-ledger'], ['pending-ledger']), ['voided-ledger']);
});

test('reviewed categories are kept and unreviewed imports can be corrected', () => {
  assert.equal(shouldReplaceLedgerDetails({ needs_review: true, status: 'posted', category: 'Rent' }), true);
  assert.equal(shouldReplaceLedgerDetails({ needs_review: false, status: 'posted', category: 'Rent' }), false);
  assert.equal(shouldReplaceLedgerDetails({ needs_review: false, status: 'declined', category: 'Uncategorized Inflow' }), true);
  assert.equal(shouldReplaceLedgerDetails({ needs_review: false, status: 'declined', category: 'Rent' }), false);
});

test('Chase account ids that change still match the linked mask', () => {
  const accounts = [
    { id: 'checking', plaid_account_id: 'old-checking', mask: '4242', type: 'depository', subtype: 'checking' },
    { id: 'savings', plaid_account_id: 'old-savings', mask: '4242', type: 'depository', subtype: 'savings' },
  ];
  assert.equal(matchLinkedAccount(accounts, 'old-checking')?.id, 'checking');
  assert.equal(matchLinkedAccount(accounts, 'new-checking', { mask: '4242', type: 'depository', subtype: 'checking' })?.id, 'checking');
  assert.equal(matchLinkedAccount(accounts, 'new-shared', { mask: '4242', type: 'depository' }), null);
});

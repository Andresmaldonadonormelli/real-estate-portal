import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPayoutSplitPayloads,
  canOfferPayoutSplit,
  emptyExpenseShare,
  emptyRentShare,
  payoutSplitTotals,
} from './managementPayout.ts';

test('gross rents minus expenses must equal the bank net deposit', () => {
  const draft = {
    netDeposit: 2659,
    rents: [
      emptyRentShare('triskett', '1800'),
      emptyRentShare('w134', '1200'),
    ],
    expenses: [
      emptyExpenseShare('triskett', 'Repairs & Maintenance'),
      emptyExpenseShare('w134', 'Management Fee'),
    ],
  };
  draft.expenses[0].amount = '200';
  draft.expenses[1].amount = '141';
  const totals = payoutSplitTotals(draft);
  assert.equal(totals.rentTotal, 3000);
  assert.equal(totals.expenseTotal, 341);
  assert.equal(totals.impliedNet, 2659);
  assert.equal(totals.balanced, true);
});

test('unbalanced splits are rejected and balanced splits create linked ledger rows', () => {
  const unbalanced = {
    netDeposit: 2659,
    rents: [emptyRentShare('triskett', '1800'), emptyRentShare('w134', '1200')],
    expenses: [emptyExpenseShare('triskett')],
  };
  unbalanced.expenses[0].amount = '100';
  assert.equal(payoutSplitTotals(unbalanced).balanced, false);

  const balanced = {
    netDeposit: 2659,
    rents: [emptyRentShare('triskett', '1800'), emptyRentShare('w134', '1200')],
    expenses: [
      { ...emptyExpenseShare('triskett', 'Repairs & Maintenance'), amount: '200', description: 'Plumbing' },
      { ...emptyExpenseShare('w134', 'Management Fee'), amount: '141', description: '' },
    ],
  };
  const payload = buildPayoutSplitPayloads({
    userId: 'user-1',
    parent: {
      id: 'tx-net',
      transaction_date: '2026-11-12',
      source: 'plaid',
      payee_source: 'Doorvest',
      description: 'ACH CREDIT DOORVEST',
    },
    draft: balanced,
    netLabel: '$2,659',
  });
  assert.equal(payload.primaryUpdate.property_id, 'triskett');
  assert.equal(payload.primaryUpdate.amount, 1800);
  assert.equal(payload.primaryUpdate.category, 'Rent');
  assert.equal(payload.inserts.length, 3);
  assert.equal(payload.inserts[0].category, 'Rent');
  assert.equal(payload.inserts[0].amount, 1200);
  assert.equal(payload.inserts[1].type, 'expense');
  assert.equal(payload.inserts[1].amount, -200);
  assert.equal(payload.inserts[2].amount, -141);
});

test('payout split is offered for bank income deposits', () => {
  assert.equal(canOfferPayoutSplit({ type: 'income', amount: 2659, category: 'Rent', source: 'plaid' }), true);
  assert.equal(canOfferPayoutSplit({ type: 'expense', amount: -90, category: 'Utilities → Electric' }), false);
});

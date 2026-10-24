import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransferTransaction, isUncategorized } from './accounting.ts';
import { calculateMonthlyTotals, calculatePortfolioStats } from './calculations.ts';
import { buildMonthlyFinancialHistory } from './financialHistory.ts';
import { buildBreakdown, calculateMetrics } from './propertyFinancials.ts';
import { transactionDisplayName } from './transactionLabels.ts';
import type { Transaction } from './types';

const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

function row(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id || 'row',
    property_id: 'p1',
    transaction_date: `${month}-01`,
    type: 'expense',
    category: 'Needs Review',
    description: '',
    amount: 0,
    status: 'posted',
    created_at: '',
    ...partial,
  } as Transaction;
}

const rent = row({ id: 'rent', type: 'income', category: 'Rent', amount: 1850 });
const repair = row({ id: 'repair', type: 'expense', category: 'Repairs & Maintenance', amount: -400 });
const out3199 = row({ id: 'out-3199', type: 'transfer', category: 'Transfer', amount: -2622, description: 'Online Transfer to CHK ...6822' });
const in6822 = row({ id: 'in-6822', type: 'transfer', category: 'Transfer', amount: 2622, description: 'Online Transfer from CHK ...3199' });
const relabeledOut = row({ id: 'relabeled-out', type: 'expense', category: 'Transfer', amount: -2000 });
const relabeledIn = row({ id: 'relabeled-in', type: 'income', category: 'Transfer', amount: 2000 });
const ledger = [rent, repair, out3199, in6822, relabeledOut, relabeledIn];

test('both sides of a 3199 to 6822 transfer stay in the ledger but not in income or expenses', () => {
  assert.equal(isTransferTransaction(out3199), true);
  assert.equal(isTransferTransaction(in6822), true);
  assert.equal(isTransferTransaction(relabeledOut), true);
  assert.equal(isTransferTransaction(relabeledIn), true);
  assert.equal(isTransferTransaction(repair), false);

  assert.deepEqual(calculateMonthlyTotals(ledger), { income: 1850, expense: 400, net: 1450 });
  assert.deepEqual(calculateMonthlyTotals([out3199, in6822]), { income: 0, expense: 0, net: 0 });
});

test('dashboard cash flow, NOI, and property metrics skip transfers', () => {
  const current = buildMonthlyFinancialHistory(ledger, '3M').at(-1)!;
  assert.equal(current.income, 1850);
  assert.equal(current.cashExpenses, 400);
  assert.equal(current.operatingExpenses, 400);
  assert.equal(current.cashFlow, 1450);
  assert.equal(current.noi, 1450);

  const metrics = calculateMetrics(ledger);
  assert.deepEqual(metrics, { income: 1850, operatingExpenses: 400, noi: 1450, cashFlow: 1450, cashExpenses: 400 });
  assert.deepEqual(buildBreakdown(ledger).map(item => item.category), ['Repairs & Maintenance']);

  const stats = calculatePortfolioStats([], [], ledger);
  assert.equal(stats.monthlyRentIncome, 1850);
  assert.equal(stats.monthlyExpenses, 400);
  assert.equal(stats.netCashFlow, 1450);
});

test('only genuinely uncategorized rows need a category', () => {
  assert.equal(isUncategorized('Transfer'), false);
  assert.equal(isUncategorized('Credit Card Payment'), false);
  assert.equal(isUncategorized('Needs Review'), true);
  assert.equal(isUncategorized('Uncategorized Inflow'), true);
  assert.equal(isUncategorized(''), true);
});

test('Chase bank memos keep their name instead of a generic label', () => {
  const memo = 'HUNTINGTON BP MERCH PMT PPD ID: 9000001200';
  assert.equal(transactionDisplayName({ payee_source: memo, description: memo }), 'HUNTINGTON BP MERCH PMT');
  assert.equal(transactionDisplayName({ payee_source: null, description: memo }), 'HUNTINGTON BP MERCH PMT');
  assert.equal(transactionDisplayName({ payee_source: 'Home Depot', description: 'HOME DEPOT #1234 POS DEBIT' }), 'Home Depot');
  assert.equal(transactionDisplayName({ payee_source: 'Zelle payment to Karen', description: 'Zelle payment to Karen' }), 'Zelle payment to Karen');
  assert.equal(transactionDisplayName({ payee_source: '', description: '' }), '');
});

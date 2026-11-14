import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryKey, transactionTypeForCategory } from './accounting.ts';
import { buildMonthlyFinancialHistory } from './financialHistory.ts';
import { calculateMetrics } from './propertyFinancials.ts';
import { extraPrincipalCash, extraPrincipalInvested, mortgageBalanceAfterExtraPrincipal, postedExtraPrincipal } from './extraPrincipal.ts';
import { buildOverviewBrief } from './overviewBrief.ts';
import { buildPortfolioLanding } from './portfolioLanding.ts';
import { buildUpcomingReminders } from './upcomingReminders.ts';
import { emptyProfile } from './propertyProfile.ts';

const now = new Date(2026, 10, 13, 12, 0, 0);
const property = { id: 'p1', address: '15334 Triskett Rd', management_fee_percent: 8 };
const unit = { id: 'u1', property_id: 'p1', unit_number: '1', occupied: true, current_rent: 2850, lease_end_date: '2027-03-01' };

test('extra principal is financing, not an operating expense', () => {
  assert.equal(categoryKey('Extra Principal Payment'), 'extra-principal');
  assert.equal(transactionTypeForCategory('Extra Principal Payment'), 'transfer');
  const rows = [
    { id: 'rent', property_id: 'p1', transaction_date: '2026-11-10', type: 'income' as const, category: 'Rent', description: 'Rent', amount: 2850, status: 'posted' },
    { id: 'fee', property_id: 'p1', transaction_date: '2026-11-10', type: 'expense' as const, category: 'Management Fee', description: 'Fee', amount: -228, status: 'posted' },
    { id: 'extra', property_id: 'p1', transaction_date: '2026-11-11', type: 'expense' as const, category: 'Extra Principal Payment', description: 'Extra', amount: -100, status: 'posted' },
  ];
  const metrics = calculateMetrics(rows);
  assert.equal(metrics.income, 2850);
  assert.equal(metrics.operatingExpenses, 228);
  assert.equal(metrics.cashExpenses, 228);
  assert.equal(metrics.noi, 2622);
  assert.equal(metrics.cashFlow, 2622);
  const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const dated = rows.map((row) => ({ ...row, transaction_date: `${currentKey}-10` }));
  const history = buildMonthlyFinancialHistory(dated, '1Y');
  const current = history.find((month) => month.key === currentKey);
  assert.equal(current?.cashFlow, 2622);
  assert.equal(current?.noi, 2622);
});

test('extra principal reduces the balance once and counts as cash invested', () => {
  const posted = { property_id: 'p1', category: 'Extra Principal Payment', amount: -100, status: 'posted' };
  assert.equal(postedExtraPrincipal(posted), 100);
  assert.equal(postedExtraPrincipal({ ...posted, status: 'pending' }), 0);
  assert.equal(mortgageBalanceAfterExtraPrincipal(200000, 0, 100), 199900);
  assert.equal(mortgageBalanceAfterExtraPrincipal(199900, 100, 250), 199750);
  assert.equal(mortgageBalanceAfterExtraPrincipal(50, 0, 100), 0);
  assert.equal(extraPrincipalInvested([posted, { ...posted, amount: -50, property_id: 'p2' }], 'p1'), 100);
  assert.equal(extraPrincipalCash([{ date: '2026-11-11', amount: 100 }], [{ ...posted, transaction_date: '2026-11-11' }], 'p1'), 100);
  assert.equal(extraPrincipalCash([{ date: '2026-11-11', amount: 100 }], [{ ...posted, transaction_date: '2026-11-12' }], 'p1'), 200);
});

test('daily brief uses posted activity and does not invent a plan', () => {
  const brief = buildOverviewBrief({
    properties: [property, { id: 'p2', address: '134 W 134th St' }],
    units: [unit, { id: 'u2', property_id: 'p2', unit_number: '2', occupied: false, current_rent: 900 }],
    transactions: [
      { id: 'rent', property_id: 'p1', transaction_date: '2026-11-10', type: 'income', category: 'Rent', amount: 2850, status: 'posted', created_at: '2026-11-10T15:00:00.000Z' },
      { id: 'fee', property_id: 'p1', transaction_date: '2026-11-10', type: 'expense', category: 'Management Fee', amount: -228, status: 'posted', created_at: '2026-11-10T15:00:00.000Z' },
      { id: 'small', property_id: 'p1', transaction_date: '2026-11-02', type: 'expense', category: 'Utilities', amount: -18, status: 'posted', created_at: '2026-10-02T15:00:00.000Z' },
    ],
    documents: [{ id: 'd1', property_id: 'p1', category: 'Insurance', title: 'Policy', expires_at: '2027-04-01' }],
    since: '2026-11-01T00:00:00.000Z',
    now,
  });

  assert.equal(brief.kicker, 'Since your last visit');
  assert.equal(brief.updates.find((update) => update.id === 'money-in')?.title, '+$2,850 received');
  assert.equal(brief.updates.find((update) => update.id === 'money-in')?.context, '15334 Triskett · Nov 10');
  assert.equal(brief.updates.some((update) => /fee|net cash|mortgage|\$18/i.test(`${update.title} ${update.context}`)), false);
  assert.ok(brief.updates.length <= 6);
  assert.equal(brief.updates.find((update) => update.id === 'attention')?.context, '134 W · 1 vacant unit');
  assert.equal(brief.more, true);
  assert.equal(brief.properties.find((row) => row.id === 'p1')?.status, 'On track');
  assert.match(brief.properties.find((row) => row.id === 'p1')?.detail || '', /\+\$2,850 received/);
  assert.equal(brief.properties.find((row) => row.id === 'p2')?.status, 'Needs attention');
  assert.equal(brief.properties.find((row) => row.id === 'p2')?.detail, '1 vacant unit');
  assert.deepEqual(brief.upcoming.map((item) => item.month + item.day), ['MAR1', 'APR1']);
});

test('daily brief stays a short catch-up when many transactions post', () => {
  const rents = Array.from({ length: 6 }, (_, index) => ({
    id: `rent-${index}`,
    property_id: 'p1',
    transaction_date: `2026-11-${String(10 + index).padStart(2, '0')}`,
    type: 'income' as const,
    category: 'Rent',
    amount: 500,
    status: 'posted',
    created_at: '2026-11-10T15:00:00.000Z',
  }));
  const brief = buildOverviewBrief({
    properties: [property, { id: 'p3', address: '4365 W 28th St' }],
    units: [
      unit,
      { id: 'v1', property_id: 'p3', unit_number: '1', occupied: false, current_rent: 1000 },
      { id: 'v2', property_id: 'p3', unit_number: '2', occupied: false, current_rent: 1000 },
      { id: 'o1', property_id: 'p3', unit_number: '3', occupied: true, current_rent: 2659 },
    ],
    transactions: [
      ...rents,
      { id: 'mortgage', property_id: 'p1', transaction_date: '2026-11-01', type: 'expense', category: 'Mortgage Payment', amount: -1400, status: 'posted', created_at: '2026-11-01T15:00:00.000Z' },
      { id: 'lump', property_id: 'p3', transaction_date: '2026-11-12', type: 'income', category: 'Rent', amount: 2659, status: 'posted', created_at: '2026-11-12T15:00:00.000Z' },
    ],
    since: '2026-11-01T00:00:00.000Z',
    now,
  });
  assert.ok(brief.updates.length <= 6);
  assert.equal(brief.updates.filter((update) => update.id === 'money-in').length, 1);
  assert.equal(brief.updates.some((update) => /mortgage/i.test(update.title)), false);
  assert.equal(brief.more, true);
  const mixed = brief.properties.find((row) => row.id === 'p3');
  assert.equal(mixed?.status, 'Needs attention');
  assert.match(mixed?.detail || '', /\+\$2,659 received/);
  assert.match(mixed?.detail || '', /2 vacant units/);
});

test('cash in the deal includes extra principal once, and coming up uses calendar dates', () => {
  const profile = emptyProfile();
  profile.extra_principal = [{ id: 'm', date: '2026-11-11', amount: 100, label: 'Extra' }];
  const model = buildPortfolioLanding(
    [{ id: 'p1', address: '15334 Triskett Rd, Cleveland', purchase_price: 200000, mortgage_balance: 150000, purchase_date: '2020-01-01', created_at: '2020-01-01' } as never],
    [{ property_id: 'p1', unit_number: '1', occupied: true, current_rent: 2850, lease_end_date: '2027-03-01', tenant_name: 'Ada' }],
    [{ property_id: 'p1', transaction_date: '2026-11-11', type: 'transfer', category: 'Extra Principal Payment', amount: -100, status: 'posted' }],
    { p1: profile },
    {
      series: 'equity',
      path: 'to-date',
      period: '1Y',
      now,
      documents: [{ id: 'd1', property_id: 'p1', category: 'Insurance', title: 'Policy', expires_at: '2027-04-01' }],
    },
  );
  assert.equal(model.lines.deal[0]?.amount, 100);
  assert.equal(model.averages.cashInDeal, 100);
  assert.deepEqual(model.coming.map((item) => `${item.month}${item.day} ${item.title}`), ['MAR1 Lease ending', 'APR1 Insurance renewal']);
});

test('a unit lease and its lease document are one reminder', () => {
  const reminders = buildUpcomingReminders(
    [{ id: 'p1', address: '15334 Triskett Rd' }],
    [
      { id: 'u2', property_id: 'p1', unit_number: '2', occupied: true, tenant_name: '', lease_end_date: '2027-03-31' },
      { id: 'u1', property_id: 'p1', unit_number: '1', occupied: true, tenant_name: 'Kenyetta Frazier', lease_end_date: '2027-04-30' },
    ],
    [
      { id: 'lease-doc', property_id: 'p1', unit_id: 'u2', category: 'Lease', title: 'Unit #2 Lease · Janet M Perez', notes: 'Signed lease for Janet M Perez', expires_at: '2027-03-31' },
      { id: 'lease-doc-2', property_id: 'p1', unit_id: 'u1', category: 'Lease', title: 'Unit #1 Lease · Kenyetta Frazier', expires_at: '2027-04-30' },
    ],
    now,
  );
  assert.equal(reminders.length, 2);
  assert.equal(reminders[0]?.title, 'Lease ending');
  assert.equal(reminders[0]?.detail, '15334 Triskett · Unit #2 · Janet M Perez');
  assert.equal(reminders[0]?.when, 'In about 5 months');
  assert.equal(reminders[1]?.detail, '15334 Triskett · Unit #1 · Kenyetta Frazier');
});

test('rent is not called missing before the 10th', () => {
  const brief = buildOverviewBrief({
    properties: [property],
    units: [unit],
    transactions: [],
    since: null,
    now: new Date(2026, 10, 4, 12, 0, 0),
  });
  assert.equal(brief.kicker, 'This month');
  assert.equal(brief.updates.some((update) => update.id === 'rent-missing'), false);
  assert.equal(brief.updates[0]?.id, 'quiet');
  assert.equal(brief.properties[0]?.status, 'Watch');
  assert.equal(brief.properties[0]?.detail, 'Waiting on rent');
  assert.equal(brief.more, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTransactionRules,
  buildRuleDraftFromTransaction,
  classifyWithRules,
  describeRuleMatch,
  extractMatchText,
  ruleMatches,
  type TransactionRule,
} from './transactionRules.ts';

function rule(partial: Partial<TransactionRule> & Pick<TransactionRule, 'match_text' | 'match_direction' | 'assign_category'>): TransactionRule {
  return {
    id: partial.id || 'rule-1',
    user_id: 'user-1',
    enabled: partial.enabled ?? true,
    match_text: partial.match_text,
    match_direction: partial.match_direction,
    match_account_mask: partial.match_account_mask ?? null,
    match_property_id: partial.match_property_id ?? null,
    assign_category: partial.assign_category,
    assign_property_id: partial.assign_property_id ?? null,
    archived_at: partial.archived_at ?? null,
  };
}

test('utility bill still matches when the amount changes', () => {
  const electric = rule({
    match_text: 'city electric',
    match_direction: 'outgoing',
    match_account_mask: '4242',
    match_property_id: 'prop-a',
    assign_category: 'Utilities → Electric',
    assign_property_id: 'prop-a',
  });
  const first = {
    payee_source: 'CITY ELECTRIC',
    description: 'ACH DEBIT CITY ELECTRIC 99211',
    amount: -84.5,
    property_id: 'prop-a',
    source_account_mask: '4242',
  };
  const later = { ...first, amount: -112.3, description: 'ACH DEBIT CITY ELECTRIC AUTOPAY' };
  assert.equal(ruleMatches(electric, first), true);
  assert.equal(ruleMatches(electric, later), true);
  const applied = applyTransactionRules([electric], later);
  assert.equal(applied.status, 'match');
  if (applied.status === 'match') {
    assert.equal(applied.category, 'Utilities → Electric');
    assert.equal(applied.type, 'expense');
    assert.equal(applied.needs_review, false);
  }
});

test('same payee on two property accounts is assigned to the matching account', () => {
  const maple = rule({
    id: 'maple',
    match_text: 'city electric',
    match_direction: 'outgoing',
    match_account_mask: '1111',
    assign_category: 'Utilities → Electric',
    assign_property_id: 'maple',
  });
  const oak = rule({
    id: 'oak',
    match_text: 'city electric',
    match_direction: 'outgoing',
    match_account_mask: '2222',
    assign_category: 'Utilities → Electric',
    assign_property_id: 'oak',
  });
  const mapleBill = {
    payee_source: 'City Electric',
    description: 'City Electric',
    amount: -90,
    property_id: 'maple',
    source_account_mask: '1111',
  };
  const oakBill = { ...mapleBill, property_id: 'oak', source_account_mask: '2222' };
  const mapleResult = applyTransactionRules([maple, oak], mapleBill);
  const oakResult = applyTransactionRules([maple, oak], oakBill);
  assert.equal(mapleResult.status, 'match');
  assert.equal(oakResult.status, 'match');
  if (mapleResult.status === 'match') assert.equal(mapleResult.property_id, 'maple');
  if (oakResult.status === 'match') assert.equal(oakResult.property_id, 'oak');
});

test('conflicting rules send the transaction to Needs review', () => {
  const utilities = rule({
    id: 'util',
    match_text: 'harbor',
    match_direction: 'outgoing',
    match_account_mask: '4242',
    assign_category: 'Utilities → Electric',
    assign_property_id: 'prop-a',
  });
  const repairs = rule({
    id: 'repair',
    match_text: 'harbor',
    match_direction: 'outgoing',
    match_account_mask: '4242',
    assign_category: 'Repairs & Maintenance',
    assign_property_id: 'prop-a',
  });
  const draft = classifyWithRules(
    { category: 'Needs Review', type: 'expense' as const, needs_review: true },
    [utilities, repairs],
    {
      payee_source: 'Harbor Power',
      description: 'Harbor Power bill',
      amount: -60,
      property_id: 'prop-a',
      source_account_mask: '4242',
    },
  );
  assert.equal(draft.ruleStatus, 'conflict');
  assert.equal(draft.category, 'Needs Review');
  assert.equal(draft.needs_review, true);
});

test('mortgage, rent, and pm distribution drafts build the expected rule shape', () => {
  const mortgage = buildRuleDraftFromTransaction({
    payee_source: 'Mr Cooper',
    description: 'LOAN DEBIT MR COOPER',
    amount: -1800,
    property_id: 'prop-a',
    source_account_mask: '5555',
    category: 'Mortgage Payment',
  });
  assert.ok(mortgage);
  assert.equal(mortgage?.match_direction, 'outgoing');
  assert.equal(mortgage?.assign_category, 'Mortgage Payment');
  assert.equal(mortgage?.match_account_mask, '5555');

  const rent = buildRuleDraftFromTransaction({
    payee_source: 'Zelle from A Cole',
    description: 'Zelle payment from A Cole',
    amount: 1450,
    property_id: 'prop-b',
    source_account_mask: '6666',
    category: 'Rent',
  });
  assert.equal(rent?.match_direction, 'incoming');
  assert.equal(rent?.assign_category, 'Rent');

  const payout = buildRuleDraftFromTransaction({
    payee_source: 'Doorvest PM',
    description: 'ACH CREDIT DOORVEST PM',
    amount: 2100,
    property_id: 'prop-a',
    source_account_mask: '4242',
    category: 'PM Distribution',
  });
  assert.equal(payout?.assign_category, 'PM Distribution');
  assert.equal(payout?.match_direction, 'incoming');
});

test('existing classifications are preserved when rules would also match', () => {
  const electric = rule({
    match_text: 'city electric',
    match_direction: 'outgoing',
    match_account_mask: '4242',
    assign_category: 'Utilities → Electric',
    assign_property_id: 'prop-a',
  });
  const kept = classifyWithRules(
    { category: 'Repairs & Maintenance', type: 'expense' as const, needs_review: false },
    [electric],
    {
      payee_source: 'City Electric',
      description: 'City Electric',
      amount: -70,
      property_id: 'prop-a',
      source_account_mask: '4242',
    },
  );
  assert.equal(kept.ruleStatus, 'none');
  assert.equal(kept.category, 'Repairs & Maintenance');
});

test('match text prefers payee and rule summaries stay readable', () => {
  assert.equal(extractMatchText({ payee_source: 'Duke Energy', description: 'ACH DEBIT DUKE ENERGY 99881' }), 'duke energy');
  assert.equal(
    describeRuleMatch({ match_text: 'duke energy', match_direction: 'outgoing', match_account_mask: '4242', match_property_id: 'prop-a' }),
    'Outgoing · duke energy · ••••4242',
  );
});

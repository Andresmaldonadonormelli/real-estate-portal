import type { Property } from '@/lib/types';

export type DatedAmount = { id: string; date: string; amount: number; label: string };
export type RefinanceRecord = {
  id: string;
  date: string;
  balance: number;
  rate: number;
  term_years: number;
  financing_type: string;
  rate_type: string;
  lender: string;
};
export type RecurringAmount = { id: string; label: string; amount: number };

export type PropertyProfile = {
  name: string;
  country: string;
  owner_type: 'me' | 'company';
  ownership_share: number;
  tags: string[];
  down_payment: number;
  closing_costs: number;
  paid_in_cash: boolean;
  estimated_value: number;
  estimated_value_as_of: string;
  value_history: { amount: number; as_of: string }[];
  financing_type: string;
  rate_type: string;
  lender: string;
  payment_includes_escrow: boolean;
  mortgage_term_end: string;
  skip_first_payment: boolean;
  escrow_balance: number | null;
  escrow_paid_out: number;
  management_type: 'self' | 'manager';
  manager_name: string;
  refinances: RefinanceRecord[];
  extra_principal: DatedAmount[];
  capital_expenditures: DatedAmount[];
  other_income: RecurringAmount[];
  operating_expenses: RecurringAmount[];
};

export function emptyProfile(): PropertyProfile {
  return {
    name: '',
    country: 'United States',
    owner_type: 'me',
    ownership_share: 100,
    tags: [],
    down_payment: 0,
    closing_costs: 0,
    paid_in_cash: false,
    estimated_value: 0,
    estimated_value_as_of: '',
    value_history: [],
    financing_type: 'Conventional mortgage',
    rate_type: 'Fixed',
    lender: '',
    payment_includes_escrow: false,
    mortgage_term_end: '',
    skip_first_payment: false,
    escrow_balance: null,
    escrow_paid_out: 0,
    management_type: 'self',
    manager_name: '',
    refinances: [],
    extra_principal: [],
    capital_expenditures: [],
    other_income: [],
    operating_expenses: [],
  };
}

export function parseProfile(value: unknown): PropertyProfile {
  const base = emptyProfile();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<PropertyProfile>;
  return {
    ...base,
    ...raw,
    owner_type: raw.owner_type === 'company' ? 'company' : 'me',
    management_type: raw.management_type === 'manager' ? 'manager' : 'self',
    ownership_share: numberOr(raw.ownership_share, 100),
    tags: Array.isArray(raw.tags) ? raw.tags.map(tag => String(tag)).filter(Boolean) : [],
    down_payment: numberOr(raw.down_payment, 0),
    closing_costs: numberOr(raw.closing_costs, 0),
    paid_in_cash: Boolean(raw.paid_in_cash),
    estimated_value: numberOr(raw.estimated_value, 0),
    estimated_value_as_of: String(raw.estimated_value_as_of || ''),
    value_history: Array.isArray(raw.value_history) ? raw.value_history.filter(entry => entry && numberOr(entry.amount, 0) > 0) : [],
    payment_includes_escrow: Boolean(raw.payment_includes_escrow),
    escrow_balance: raw.escrow_balance == null || raw.escrow_balance === ('' as unknown) ? null : numberOr(raw.escrow_balance, 0),
    escrow_paid_out: numberOr(raw.escrow_paid_out, 0),
    refinances: Array.isArray(raw.refinances) ? raw.refinances : [],
    extra_principal: Array.isArray(raw.extra_principal) ? raw.extra_principal : [],
    capital_expenditures: Array.isArray(raw.capital_expenditures) ? raw.capital_expenditures : [],
    other_income: Array.isArray(raw.other_income) ? raw.other_income : [],
    operating_expenses: Array.isArray(raw.operating_expenses) ? raw.operating_expenses : [],
  };
}

export function cashInDeal(profile: PropertyProfile) {
  return numberOr(profile.down_payment, 0) + numberOr(profile.closing_costs, 0);
}

export function originalLoan(property: Pick<Property, 'purchase_price'>, profile: PropertyProfile) {
  if (profile.paid_in_cash) return 0;
  const price = Number(property.purchase_price || 0);
  if (price <= 0 || numberOr(profile.down_payment, 0) <= 0) return null;
  return Math.max(0, price - numberOr(profile.down_payment, 0));
}

export function loanPaidDown(property: Pick<Property, 'purchase_price' | 'mortgage_balance'>, profile: PropertyProfile) {
  const original = originalLoan(property, profile);
  if (original == null) return 0;
  return Math.max(0, original - Number(property.mortgage_balance || 0));
}

export function valueChange(property: Pick<Property, 'purchase_price'>, profile: PropertyProfile) {
  const value = numberOr(profile.estimated_value, 0);
  const price = Number(property.purchase_price || 0);
  if (value <= 0 || price <= 0) return 0;
  return value - price;
}

export function currentEquity(property: Pick<Property, 'purchase_price' | 'mortgage_balance'>, profile: PropertyProfile) {
  const debt = Number(property.mortgage_balance || 0);
  if (numberOr(profile.estimated_value, 0) > 0) return numberOr(profile.estimated_value, 0) - debt;
  const price = Number(property.purchase_price || 0);
  if (price <= 0) return null;
  return price - debt;
}

export function rememberValue(profile: PropertyProfile, nextValue: number, nextDate: string) {
  const previous = numberOr(profile.estimated_value, 0);
  if (previous <= 0 || (previous === nextValue && profile.estimated_value_as_of === nextDate)) return profile.value_history;
  const asOf = profile.estimated_value_as_of || new Date().toISOString().slice(0, 10);
  const already = profile.value_history.some(entry => entry.as_of === asOf && numberOr(entry.amount, 0) === previous);
  if (already) return profile.value_history;
  return [...profile.value_history, { amount: previous, as_of: asOf }];
}

export function escrowYear(property: Pick<Property, 'mortgage_escrow_amount' | 'mortgage_start_date'>, profile: PropertyProfile, now = new Date()) {
  const monthly = Number(property.mortgage_escrow_amount || 0);
  let startMonth = 0;
  if (property.mortgage_start_date) {
    const start = new Date(`${property.mortgage_start_date.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(start.getTime())) {
      if (start.getFullYear() > now.getFullYear()) return { monthly, months: 0, paidIn: 0, paidOut: numberOr(profile.escrow_paid_out, 0) };
      if (start.getFullYear() === now.getFullYear()) startMonth = start.getMonth();
    }
  }
  const months = monthly > 0 ? Math.max(0, now.getMonth() - startMonth + 1) : 0;
  return { monthly, months, paidIn: monthly * months, paidOut: numberOr(profile.escrow_paid_out, 0) };
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

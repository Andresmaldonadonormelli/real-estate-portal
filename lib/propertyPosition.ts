import { categoryKey } from '@/lib/accounting';
import { buildMonthlyFinancialHistory, type HistoryTransaction } from '@/lib/financialHistory';
import { formatKpiCurrency } from '@/lib/propertyFinancials';
import type { Property } from '@/lib/types';

const MORTGAGE = new Set(['mortgage', 'mortgage-interest', 'mortgage-principal']);

export type LeaseUnit = {
  unit_number: string;
  tenant_name?: string | null;
  occupied?: boolean | null;
  lease_end_date?: string | null;
  current_rent?: number | null;
};

export type PositionPoint = { label: string; value: number };

export function propertyTypeLabel(value: string) {
  return ({ duplex: 'Duplex', single_family: 'Single family', triplex: 'Triplex', multi_unit: 'Multi-unit' } as Record<string, string>)[value] || value || 'Property';
}

export function moneyOrDash(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatKpiCurrency(value);
}

export function percentOrDash(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const percent = value * 100;
  const digits = Math.abs(percent) >= 100 ? 0 : 1;
  return `${percent.toFixed(digits)}%`;
}

export function ratioOrDash(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

export function signedTone(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return '';
  return value > 0 ? 'is-positive' : 'is-negative';
}

export function equityOf(property: Pick<Property, 'purchase_price' | 'mortgage_balance'>) {
  const price = Number(property.purchase_price || 0);
  if (price <= 0) return null;
  return price - Number(property.mortgage_balance || 0);
}

export function trailingCashFlow(transactions: HistoryTransaction[], propertyId: string) {
  return buildMonthlyFinancialHistory(transactions, '1Y', propertyId).reduce((sum, row) => sum + row.cashFlow, 0);
}

export function cashFlowThisYear(transactions: HistoryTransaction[], propertyId: string, now = new Date()) {
  const year = String(now.getFullYear());
  return postedRows(transactions, propertyId).reduce((sum, tx) => {
    if (!tx.transaction_date.startsWith(year)) return sum;
    const amount = Math.abs(Number(tx.amount || 0));
    if (tx.type === 'income') return sum + amount;
    if (tx.type === 'expense') return sum - amount;
    return sum;
  }, 0);
}

export function investorNumbers(property: Property, transactions: HistoryTransaction[]) {
  const trailing = trailingCashFlow(transactions, property.id);
  const equity = equityOf(property);
  const price = Number(property.purchase_price || 0);
  return {
    dscr: trailingDscr(transactions, property.id),
    returnOnEquity: equity != null && equity > 0 ? trailing / equity : null,
    cashReturn: price > 0 ? trailing / price : null,
    trailing,
  };
}

export function monthActivity(transactions: HistoryTransaction[], propertyId: string, now = new Date()) {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let rent = 0;
  let expenses = 0;
  let mortgage = 0;
  let cashFlow = 0;
  postedRows(transactions, propertyId).forEach(tx => {
    if (!tx.transaction_date.startsWith(key)) return;
    const amount = Math.abs(Number(tx.amount || 0));
    if (tx.type === 'income') {
      cashFlow += amount;
      if (categoryKey(tx.category || '') === 'rent') rent += amount;
    }
    if (tx.type === 'expense') {
      cashFlow -= amount;
      if (MORTGAGE.has(categoryKey(tx.category || ''))) mortgage += amount;
      else expenses += amount;
    }
  });
  return { rent, expenses, mortgage, cashFlow };
}

export type CashFlowMonth = {
  key: string;
  label: string;
  income: number;
  expenses: number;
  mortgage: number;
  cashFlow: number;
};

export function cashFlowYears(transactions: HistoryTransaction[], propertyId: string, now = new Date()) {
  const years = new Set<number>([now.getFullYear()]);
  transactions.forEach(tx => {
    if (propertyId && tx.property_id !== propertyId) return;
    const year = Number(String(tx.transaction_date || '').slice(0, 4));
    if (Number.isFinite(year) && year > 1900) years.add(year);
  });
  return [...years].sort((a, b) => b - a);
}

export function cashFlowYear(transactions: HistoryTransaction[], propertyId: string, year: number): CashFlowMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const label = new Date(year, index, 1).toLocaleDateString('en-US', { month: 'short' });
    let income = 0;
    let expenses = 0;
    let mortgage = 0;
    postedRows(transactions, propertyId).forEach(tx => {
      if (!tx.transaction_date.startsWith(key)) return;
      const amount = Math.abs(Number(tx.amount || 0));
      if (tx.type === 'income') income += amount;
      if (tx.type === 'expense') {
        if (MORTGAGE.has(categoryKey(tx.category || ''))) mortgage += amount;
        else expenses += amount;
      }
    });
    return { key, label, income, expenses, mortgage, cashFlow: income - expenses - mortgage };
  });
}

export function latestYearCashFlow(transactions: HistoryTransaction[], propertyId: string, now = new Date()) {
  const year = String(now.getFullYear());
  const months = new Map<string, number>();
  postedRows(transactions, propertyId).forEach(tx => {
    if (!tx.transaction_date.startsWith(year)) return;
    const key = tx.transaction_date.slice(0, 7);
    const amount = Math.abs(Number(tx.amount || 0));
    const signed = tx.type === 'income' ? amount : tx.type === 'expense' ? -amount : 0;
    months.set(key, (months.get(key) || 0) + signed);
  });
  const key = [...months.keys()].sort().at(-1);
  if (!key) return null;
  const [yearNumber, monthNumber] = key.split('-').map(Number);
  return {
    label: new Date(yearNumber, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'long' }),
    cashFlow: months.get(key) || 0,
  };
}

export function nextPaymentParts(property: Property) {
  const balance = Number(property.mortgage_balance || 0);
  const rate = Number(property.mortgage_interest_rate || 0);
  const payment = Number(property.monthly_mortgage_payment || 0);
  const escrow = Number(property.mortgage_escrow_amount || 0);
  const savedFees = Number(property.mortgage_pmi_amount || 0);
  const savedPrincipalInterest = Number(property.mortgage_principal_interest_payment || 0);
  const principalInterest = savedPrincipalInterest > 0 ? savedPrincipalInterest : Math.max(0, payment - escrow - savedFees);
  const interest = balance > 0 && rate > 0 ? balance * (rate / 1200) : 0;
  const principal = Math.max(0, principalInterest - interest);
  const total = payment > 0 ? payment : principal + interest + escrow + savedFees;
  const fees = savedFees > 0 ? savedFees : Math.max(0, total - principal - interest - escrow);
  return { principal, interest, escrow, fees, total };
}

export function payoffModel(property: Property, valueBasis?: number | null) {
  const balance = Number(property.mortgage_balance || 0);
  const rate = Number(property.mortgage_interest_rate || 0);
  const payment = Number(property.mortgage_principal_interest_payment || property.monthly_mortgage_payment || 0);
  const price = Number(valueBasis || property.purchase_price || 0);
  if (balance <= 0 || rate <= 0 || payment <= 0) return null;
  const loan = amortize(balance, rate, payment);
  if (loan.points.length < 2) return null;
  const sampled = loan.points.filter((point, index) => point.month === 0 || point.month % 12 === 0 || index === loan.points.length - 1);
  const debt: PositionPoint[] = sampled.map(point => ({
    label: point.month === 0 ? 'Now' : String(Math.round(point.month / 12)),
    value: point.balance,
  }));
  const equity = price > 0 ? sampled.map(point => ({
    label: point.month === 0 ? 'Now' : String(Math.round(point.month / 12)),
    value: price - point.balance,
  })) : null;
  const lastMonth = loan.points[loan.points.length - 1]?.month || 0;
  const years = Math.ceil(lastMonth / 12);
  const schedule = Array.from({ length: years }, (_, index) => {
    const year = index + 1;
    const slice = loan.points.filter(point => point.month > index * 12 && point.month <= year * 12);
    const end = slice[slice.length - 1];
    return {
      year,
      principal: slice.reduce((sum, point) => sum + point.principal, 0),
      interest: slice.reduce((sum, point) => sum + point.interest, 0),
      balance: end?.balance ?? 0,
    };
  }).filter(row => row.principal > 0 || row.interest > 0);
  const payoff = new Date();
  if (loan.payoffMonth) payoff.setMonth(payoff.getMonth() + loan.payoffMonth);
  return { debt, equity, schedule, payoffMonth: loan.payoffMonth, payoffLabel: loan.payoffMonth ? payoff.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null, points: loan.points };
}

export function calendarPayoff(property: Property, now = new Date()) {
  const model = payoffModel(property);
  if (!model?.points) return { rows: [] as { year: number; principal: number; interest: number; balance: number; current: boolean }[], monthsLeft: 0, yearEndBalance: null as number | null };
  const monthsLeft = 12 - now.getMonth();
  const yearEnd = model.points[Math.min(monthsLeft, model.points.length - 1)];
  const rows = new Map<number, { principal: number; interest: number; balance: number }>();
  model.points.forEach(point => {
    if (point.month === 0) return;
    const date = new Date(now.getFullYear(), now.getMonth() + point.month - 1, 1);
    const year = date.getFullYear();
    const bucket = rows.get(year) || { principal: 0, interest: 0, balance: point.balance };
    bucket.principal += point.principal;
    bucket.interest += point.interest;
    bucket.balance = point.balance;
    rows.set(year, bucket);
  });
  return {
    rows: [...rows.entries()].map(([year, row]) => ({ year, ...row, current: year === now.getFullYear() })),
    monthsLeft,
    yearEndBalance: yearEnd ? yearEnd.balance : null,
  };
}

export function upcomingLeases(units: LeaseUnit[], withinDays = 90) {
  const today = startOfToday();
  return units.flatMap(unit => {
    if (!unit.occupied || !unit.lease_end_date) return [];
    const end = new Date(`${unit.lease_end_date.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(end.getTime())) return [];
    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (days < 0 || days > withinDays) return [];
    return [{ unit: unit.unit_number || 'Unit', tenant: unit.tenant_name || 'Tenant', days, label: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }];
  }).sort((a, b) => a.days - b.days);
}

export function nextLeaseLabel(units: LeaseUnit[]) {
  const today = startOfToday();
  const upcoming = units.flatMap(unit => {
    if (!unit.occupied || !unit.lease_end_date) return [];
    const end = new Date(`${unit.lease_end_date.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(end.getTime())) return [];
    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (days < 0) return [];
    return [{ days, label: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }];
  }).sort((a, b) => a.days - b.days);
  return upcoming[0] ? `Next lease ends ${upcoming[0].label}` : 'No upcoming lease end';
}

function trailingDscr(transactions: HistoryTransaction[], propertyId: string) {
  const months = buildMonthlyFinancialHistory(transactions, '1Y', propertyId);
  const keys = new Set(months.map(month => month.key));
  const income = months.reduce((sum, month) => sum + month.income, 0);
  const operating = months.reduce((sum, month) => sum + month.operatingExpenses, 0);
  if (income <= 0.5 && operating <= 0.5) return null;
  const debtService = transactions.reduce((sum, tx) => {
    const posted = (tx.status || 'posted') === 'posted' && tx.type === 'expense';
    const inScope = !propertyId || tx.property_id === propertyId;
    const inWindow = keys.has((tx.transaction_date || '').slice(0, 7));
    if (!posted || !inScope || !inWindow || !MORTGAGE.has(categoryKey(tx.category || ''))) return sum;
    return sum + Math.abs(Number(tx.amount || 0));
  }, 0);
  if (debtService <= 0.5) return null;
  return (income - operating) / debtService;
}

function amortize(balance: number, annualRatePercent: number, payment: number) {
  const monthlyRate = annualRatePercent / 1200;
  const points: { month: number; balance: number; principal: number; interest: number }[] = [
    { month: 0, balance, principal: 0, interest: 0 },
  ];
  let remaining = balance;
  let month = 0;
  while (remaining > 0.5 && month < 600) {
    const interest = remaining * monthlyRate;
    const principal = payment - interest;
    if (principal <= 0.5) break;
    const applied = Math.min(principal, remaining);
    remaining = Math.max(0, remaining - applied);
    month += 1;
    points.push({ month, balance: remaining, principal: applied, interest });
  }
  return { points, payoffMonth: remaining <= 0.5 ? month : null };
}

function postedRows(transactions: HistoryTransaction[], propertyId: string) {
  return transactions.filter(tx => (tx.status || 'posted') === 'posted' && tx.type !== 'transfer' && (!propertyId || tx.property_id === propertyId));
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

'use client';

import { categoryKey } from '@/lib/accounting';

export type PropertyTransaction = {
  id: string;
  property_id: string;
  unit_id?: string | null;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  description: string;
  payee_source?: string | null;
  amount: number;
  notes?: string | null;
  status?: string | null;
  archived_at?: string | null;
  needs_review?: boolean | null;
  receipt_path?: string | null;
};

const OPERATING_EXCLUSIONS = ['mortgage-interest', 'mortgage-principal', 'mortgage', 'capex', 'distribution'];

export const formatKpiCurrency = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Math.round(value));

export function calculateMetrics(rows: PropertyTransaction[]) {
  let income = 0;
  let operatingExpenses = 0;
  let cashExpenses = 0;
  for (const transaction of rows) {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (transaction.type === 'income') income += amount;
    if (transaction.type === 'expense') {
      cashExpenses += amount;
      if (!OPERATING_EXCLUSIONS.includes(categoryKey(transaction.category || ''))) operatingExpenses += amount;
    }
  }
  return { income, operatingExpenses, noi: income - operatingExpenses, cashFlow: income - cashExpenses, cashExpenses };
}

export function buildBreakdown(rows: PropertyTransaction[]) {
  const map = new Map<string, { category: string; key: string; amount: number; transactions: PropertyTransaction[] }>();
  for (const transaction of rows) {
    if (transaction.type !== 'expense') continue;
    const key = categoryKey(transaction.category || '');
    if (OPERATING_EXCLUSIONS.includes(key) || key === 'review') continue;
    const category = transaction.category || 'Other Expense';
    const current = map.get(category) || { category, key, amount: 0, transactions: [] };
    current.amount += Math.abs(Number(transaction.amount || 0));
    current.transactions.push(transaction);
    map.set(category, current);
  }
  const items = [...map.values()].sort((a, b) => b.amount - a.amount);
  items.forEach(item => item.transactions.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)));
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return items.map(item => ({ ...item, share: total ? item.amount / total : 0 }));
}

export function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

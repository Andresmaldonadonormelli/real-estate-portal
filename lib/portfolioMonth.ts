import { categoryKey } from '@/lib/accounting';
import { buildMonthlyFinancialHistory, type HistoryTransaction } from '@/lib/financialHistory';

function monthKey(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function rentThisMonth(transactions: HistoryTransaction[], propertyId: string, now = new Date()) {
  const key = monthKey(now);
  return transactions.reduce((sum, tx) => {
    if ((tx.status || 'posted') !== 'posted') return sum;
    if (tx.type !== 'income' || tx.property_id !== propertyId) return sum;
    if (!String(tx.transaction_date || '').startsWith(key)) return sum;
    if (categoryKey(tx.category || '') !== 'rent') return sum;
    return sum + Math.abs(Number(tx.amount || 0));
  }, 0);
}

export function cashFlowThisMonth(transactions: HistoryTransaction[], propertyId: string) {
  const points = buildMonthlyFinancialHistory(transactions, '3M', propertyId);
  return points[points.length - 1]?.cashFlow ?? 0;
}

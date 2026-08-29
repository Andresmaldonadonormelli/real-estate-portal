import type { Property, Unit, Transaction } from './types';

export const calculatePortfolioStats = (
  properties: Property[],
  units: Unit[],
  transactions: Transaction[]
) => {
  const totalProperties = properties.length;
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.occupied).length;
  const vacantUnits = totalUnits - occupiedUnits;

  const totalMortgageBalance = properties.reduce(
    (sum, p) => sum + (p.mortgage_balance || 0),
    0
  );

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthlyTransactions = transactions.filter((t) => {
    const txMonth = t.transaction_date.substring(0, 7);
    return txMonth === currentMonth && (t.status || 'posted') === 'posted';
  });

  const monthlyRentIncome = monthlyTransactions
    .filter((t) => t.category === 'Rent')
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyExpenses = monthlyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netCashFlow = monthlyRentIncome - monthlyExpenses;

  return {
    totalProperties,
    totalUnits,
    occupiedUnits,
    vacantUnits,
    totalMortgageBalance,
    monthlyRentIncome,
    monthlyExpenses,
    netCashFlow,
  };
};

export const groupTransactionsByMonth = (transactions: Transaction[]) => {
  const grouped: Record<string, Transaction[]> = {};

  transactions.forEach((t) => {
    const date = new Date(t.transaction_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(t);
  });

  return grouped;
};

export const calculateMonthlyTotals = (transactions: Transaction[]) => {
  const posted = transactions.filter((t) => (t.status || 'posted') === 'posted');
  const income = posted
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const expense = posted
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return {
    income,
    expense,
    net: income - expense,
  };
};

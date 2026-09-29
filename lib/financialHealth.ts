import { categoryKey } from '@/lib/accounting';
import { buildMonthlyFinancialHistory, type HistoryTransaction } from '@/lib/financialHistory';
import { formatCompactCurrency, formatCurrency } from '@/lib/formatters';

const MORTGAGE_KEYS = ['mortgage', 'mortgage-interest', 'mortgage-principal'];

export type HealthProperty = {
  id: string;
  address: string;
  mortgage_balance?: number | null;
  mortgage_interest_rate?: number | null;
};

export type HealthCell = {
  label: string;
  value: string;
  compact: string;
  tone: '' | 'positive' | 'negative';
  note: string;
};

export function financialHealth(transactions: HistoryTransaction[], properties: HealthProperty[], propertyId = ''): { title: string; cells: HealthCell[] } {
  const scope = propertyId ? properties.filter((property) => property.id === propertyId) : properties;
  const selected = propertyId ? scope[0] : null;
  const title = selected
    ? `${selected.address} financial health · Trailing 12 months`
    : 'Portfolio financial health · Trailing 12 months';
  const months = buildMonthlyFinancialHistory(transactions, '1Y', propertyId);
  const keys = new Set(months.map((month) => month.key));
  const income = months.reduce((sum, month) => sum + month.income, 0);
  const operating = months.reduce((sum, month) => sum + month.operatingExpenses, 0);
  const noi = income - operating;
  const noiKnown = income > 0.5 || operating > 0.5;
  const debtService = transactions.reduce((sum, tx) => {
    const posted = (tx.status || 'posted') === 'posted' && tx.type === 'expense';
    const inScope = !propertyId || tx.property_id === propertyId;
    const inWindow = keys.has((tx.transaction_date || '').slice(0, 7));
    if (!posted || !inScope || !inWindow || !MORTGAGE_KEYS.includes(categoryKey(tx.category || ''))) return sum;
    return sum + Math.abs(Number(tx.amount || 0));
  }, 0);
  const financed = scope.filter((property) => Number(property.mortgage_balance) > 0);
  const balance = financed.reduce((sum, property) => sum + Number(property.mortgage_balance), 0);
  const missingRate = financed.some((property) => !(Number(property.mortgage_interest_rate) > 0));
  const weighted = financed.reduce((sum, property) => sum + Number(property.mortgage_balance) * Number(property.mortgage_interest_rate || 0), 0);
  const single = Boolean(propertyId);

  const noiCell: HealthCell = noiKnown
    ? { label: 'TTM NOI', value: formatCurrency(noi), compact: formatCompactCurrency(noi), tone: noi > 0.5 ? 'positive' : noi < -0.5 ? 'negative' : '', note: '' }
    : { label: 'TTM NOI', value: 'Not available', compact: '', tone: '', note: 'No posted income or operating expenses in the last 12 months.' };

  const dscrCell: HealthCell = noiKnown && debtService > 0.5
    ? { label: 'DSCR', value: `${(noi / debtService).toFixed(2)}×`, compact: `${(noi / debtService).toFixed(2)}×`, tone: noi / debtService >= 1 ? 'positive' : 'negative', note: '' }
    : { label: 'DSCR', value: 'Not available', compact: '', tone: '', note: debtService > 0.5 ? 'Not enough activity in the last 12 months.' : 'No mortgage payments in the last 12 months.' };

  const debtCell: HealthCell = financed.length
    ? {
      label: 'Debt balance',
      value: formatCurrency(balance),
      compact: formatCompactCurrency(balance),
      tone: '',
      note: !single && financed.length < scope.length ? `${financed.length} of ${scope.length} properties` : '',
    }
    : { label: 'Debt balance', value: 'Not available', compact: '', tone: '', note: single ? 'Add the mortgage balance on the property.' : 'No mortgage balance is saved.' };

  const rateCell: HealthCell = financed.length && !missingRate
    ? { label: 'Average interest rate', value: formatRate(weighted / balance), compact: formatRate(weighted / balance), tone: '', note: '' }
    : {
      label: 'Average interest rate',
      value: 'Not available',
      compact: '',
      tone: '',
      note: financed.length ? (single ? 'Add the interest rate on the property.' : 'A mortgage is missing an interest rate.') : (single ? 'Add the mortgage balance on the property.' : 'No mortgage balance is saved.'),
    };

  return { title, cells: [dscrCell, noiCell, debtCell, rateCell] };
}

function formatRate(rate: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(rate)}%`;
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
};

export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export function shortPropertyName(address?: string | null) {
  const text = (address || '').trim();
  if (!text) return 'Portfolio';
  const parts = text.split(/\s+/);
  if (parts.length >= 2 && /^\d/.test(parts[0])) return `${parts[0]} ${parts[1].replace(/[.,]$/, '')}`;
  return parts.slice(0, 2).join(' ');
}

export const formatDateShort = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export const formatMonthYear = (year: number, month: number): string => {
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
};

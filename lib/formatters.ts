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

const STREET_SUFFIX = /^(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|terrace|ter|circle|cir)\.?$/i;
const STREET_DIRECTION: Record<string, string> = { n: 'N', s: 'S', e: 'E', w: 'W', north: 'N', south: 'S', east: 'E', west: 'W' };

export function propertyChipName(address?: string | null) {
  const words = (address || '').trim().split(/[\s,]+/).filter(Boolean);
  const body = words[0] && /^\d/.test(words[0]) ? words.slice(1) : words;
  const cleaned = body.filter((word) => !STREET_SUFFIX.test(word));
  const direction = STREET_DIRECTION[(cleaned[0] || '').toLowerCase().replace(/\.$/, '')];
  const number = cleaned[1]?.match(/^(\d+)/);
  if (direction && number) return `${direction}${number[1]}`;
  const packed = cleaned[0]?.match(/^([NSEW])(\d+)/i);
  if (packed) return `${packed[1].toUpperCase()}${packed[2]}`;
  const named = cleaned.find((word) => /[A-Za-z]/.test(word) && !STREET_DIRECTION[word.toLowerCase().replace(/\.$/, '')]);
  return (named || cleaned[0] || 'Property').replace(/[.,]$/, '');
}

export function formatCompactCurrency(amount: number) {
  const negative = amount < -0.5;
  const absolute = Math.abs(amount);
  const body = absolute >= 1000
    ? `$${trimThousands(absolute / 1000)}k`
    : `$${Math.round(absolute).toLocaleString('en-US')}`;
  return negative ? `-${body}` : body;
}

function trimThousands(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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

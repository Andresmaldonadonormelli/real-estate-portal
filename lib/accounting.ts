export const ACCOUNTING_CATEGORIES = [
  'Needs Review',
  'Rent',
  'Other Income',
  'Management Fee',
  'Leasing Fee',
  'Repairs & Maintenance',
  'Utilities',
  'Insurance',
  'Property Taxes',
  'Mortgage Payment',
  'Capital Improvements / CapEx',
  'Legal & Professional',
  'Owner Distribution',
  'Balance Forward',
  'Other Expense',
] as const;

export function categoryKey(category: string) {
  const c = category.toLowerCase();
  if (c === 'rent' || c.includes('rental')) return 'rent';
  if (c.includes('mortgage interest')) return 'mortgage-interest';
  if (c.includes('mortgage principal')) return 'mortgage-principal';
  if (c.includes('mortgage')) return 'mortgage';
  if (c.includes('management')) return 'management';
  if (c.includes('leasing')) return 'leasing';
  if (c.includes('repair') || c.includes('maintenance')) return 'maintenance';
  if (c.includes('utilit')) return 'utilities';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('tax')) return 'taxes';
  if (c.includes('capital') || c.includes('capex') || c.includes('renovation')) return 'capex';
  if (c.includes('legal') || c.includes('professional')) return 'legal';
  if (c.includes('owner distribution')) return 'distribution';
  if (c.includes('other income')) return 'other-income';
  if (c.includes('needs review') || c === 'other' || c.includes('other expense')) return 'review';
  if (c.includes('refund')) return 'refund';
  return 'neutral';
}

export function categoryNeedsReview(category: string) {
  return categoryKey(category) === 'review';
}

'use client';

import type { HistoryTransaction } from '@/lib/financialHistory';
import { financialHealth, type HealthProperty } from '@/lib/financialHealth';

const SUMMARY_LABELS: Record<string, string> = {
  DSCR: 'DSCR',
  'TTM NOI': 'TTM NOI',
  'Debt balance': 'Debt',
};

const COMPACT_LABELS: Record<string, string> = {
  DSCR: 'DSCR',
  'TTM NOI': 'NOI',
  'Debt balance': 'Debt',
};

export default function FinancialHealth({ transactions, properties, propertyId }: {
  transactions: HistoryTransaction[];
  properties: HealthProperty[];
  propertyId: string;
}) {
  const parts = financialHealth(transactions, properties, propertyId).cells.filter((cell) => cell.value !== 'Not available' && SUMMARY_LABELS[cell.label] && cell.compact);
  if (!parts.length) return null;
  return (
    <p className="dashboard-health-line">
      <span className="dashboard-health-full">
        <span>Financial health</span>
        {parts.map((cell) => (
          <span key={cell.label}>
            <span aria-hidden="true"> · </span>
            {SUMMARY_LABELS[cell.label]} <b className={cell.tone ? `amount-${cell.tone}` : ''}>{cell.value}</b>
          </span>
        ))}
      </span>
      <span className="dashboard-health-compact">
        {parts.map((cell, index) => (
          <span key={cell.label}>
            {index > 0 ? <span aria-hidden="true"> · </span> : null}
            {COMPACT_LABELS[cell.label]} <b className={cell.tone ? `amount-${cell.tone}` : ''}>{cell.compact}</b>
          </span>
        ))}
      </span>
    </p>
  );
}

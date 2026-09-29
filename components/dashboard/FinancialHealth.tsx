'use client';

import type { HistoryTransaction } from '@/lib/financialHistory';
import { financialHealth, type HealthProperty } from '@/lib/financialHealth';

export default function FinancialHealth({ transactions, properties, propertyId }: {
  transactions: HistoryTransaction[];
  properties: HealthProperty[];
  propertyId: string;
}) {
  const health = financialHealth(transactions, properties, propertyId);
  return (
    <section className="dashboard-module dashboard-health" aria-label={health.title}>
      <p className="dashboard-health-title">{health.title}</p>
      <div className="dashboard-health-metrics">
        {health.cells.map((cell) => (
          <div key={cell.label}>
            <span>{cell.label}</span>
            <strong className={cell.tone ? `amount-${cell.tone}` : ''}>{cell.value}</strong>
            {cell.note ? <small>{cell.note}</small> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

'use client';

import { PageHeader } from '@/components/common/ProductControls';

export default function TaxesPage() {
  return (
    <div className="mobile-page-shell">
      <PageHeader title="Taxes" />
      <div className="workspace-empty-panel">
        <strong>Taxes coming soon</strong>
        <p>Tax-ready summaries and year-end exports will live here.</p>
      </div>
    </div>
  );
}

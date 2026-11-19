'use client';

import { PageHeader } from '@/components/common/ProductControls';

export default function ReportsPage() {
  return (
    <div className="mobile-page-shell">
      <PageHeader title="Reports" />
      <div className="workspace-empty-panel">
        <strong>Reports coming soon</strong>
        <p>Portfolio summaries and exportable reports will live here.</p>
      </div>
    </div>
  );
}

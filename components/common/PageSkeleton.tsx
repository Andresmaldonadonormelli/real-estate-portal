'use client';

type Variant = 'dashboard' | 'properties' | 'ledger' | 'utilities' | 'account';

function Block({ className = '' }: { className?: string }) {
  return <div className={`skeleton-block ${className}`} aria-hidden="true" />;
}

function PanelRows({ columns, rows, head = false }: { columns: number; rows: number; head?: boolean }) {
  return <>
    {head && <div className="module-skeleton-head"><Block /><Block /></div>}
    <div className="module-skeleton-columns" aria-hidden="true">{Array.from({ length: columns }, (_, index) => <Block key={index} />)}</div>
    {Array.from({ length: rows }, (_, row) => <div className="module-skeleton-row" key={row}>{Array.from({ length: columns }, (_, index) => <Block key={index} />)}</div>)}
  </>;
}

export default function PageSkeleton({ variant = 'ledger' }: { variant?: Variant }) {
  if (variant === 'dashboard') {
    return <div className="dashboard-skeleton" aria-label="Loading dashboard" role="status">
      <div className="dashboard-skeleton-health"><Block /></div>
      <section className="dashboard-skeleton-module dashboard-skeleton-summary" aria-hidden="true">
        {[0, 1, 2].map(card => <div key={card}><Block /><Block /><Block /></div>)}
      </section>
      <div className="dashboard-skeleton-main-row">
        <section className="dashboard-skeleton-module dashboard-skeleton-chart">
          <Block className="dashboard-skeleton-heading" />
          <Block className="dashboard-skeleton-value" />
          <Block className="dashboard-skeleton-plot" />
        </section>
        <section className="dashboard-skeleton-module dashboard-skeleton-rent">
          <Block className="dashboard-skeleton-heading" />
          <Block className="dashboard-skeleton-line" />
          <Block className="dashboard-skeleton-track" />
          {[0, 1, 2].map(row => <Block className="dashboard-skeleton-row" key={row} />)}
        </section>
      </div>
      <div className="dashboard-skeleton-lower-row">
        <section className="dashboard-skeleton-module">
          <Block className="dashboard-skeleton-heading" />
          {[0, 1, 2, 3, 4].map(row => <Block className="dashboard-skeleton-row" key={row} />)}
        </section>
        <section className="dashboard-skeleton-module">
          <Block className="dashboard-skeleton-heading" />
          <div className="dashboard-skeleton-columns">{[0, 1, 2, 3, 4].map(column => <Block key={column} />)}</div>
          {[0, 1, 2, 3, 4].map(row => <div className="dashboard-skeleton-table-row" key={row}>{[0, 1, 2, 3, 4].map(column => <Block key={column} />)}</div>)}
        </section>
      </div>
    </div>;
  }

  if (variant === 'properties') {
    return <div className="module-skeleton module-skeleton-property" aria-label="Loading properties" role="status">
      <div className="module-skeleton-panel"><PanelRows columns={6} rows={4} /></div>
    </div>;
  }

  if (variant === 'utilities') {
    return <div className="module-skeleton module-skeleton-utility" aria-label="Loading utilities" role="status">
      <div className="module-skeleton-panel"><PanelRows columns={6} rows={4} head /></div>
    </div>;
  }

  if (variant === 'account') {
    return <div className="module-skeleton module-skeleton-account" aria-label="Loading account" role="status">
      <div className="module-skeleton-panel"><PanelRows columns={2} rows={4} /></div>
    </div>;
  }

  return <div className="module-skeleton module-skeleton-ledger" aria-label="Loading ledger" role="status">
    <div className="module-skeleton-panel"><PanelRows columns={5} rows={6} /></div>
  </div>;
}

import StatCard from '@/components/common/StatCard';
import { mockProperty, mockUnits, mockTransactions } from '@/lib/mockData';
import { calculatePortfolioStats, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency } from '@/lib/formatters';

export default function Dashboard() {
  const stats = calculatePortfolioStats([mockProperty], mockUnits, mockTransactions);

  const currentMonthTransactions = mockTransactions.filter((t) =>
    t.transaction_date.startsWith('2026-08')
  );
  const monthlyTotals = calculateMonthlyTotals(currentMonthTransactions);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '24px', fontWeight: 500 }}>Dashboard</h1>

      {/* Portfolio Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
        }}
      >
        <StatCard label="Portfolio Value" value={formatCurrency(stats.totalPortfolioValue)} />
        <StatCard label="Properties" value={stats.totalProperties} />
        <StatCard label="Occupied Units" value={`${stats.occupiedUnits}/${stats.totalUnits}`} />
        <StatCard label="Vacant Units" value={stats.vacantUnits} />
      </div>

      {/* Financial Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
        }}
      >
        <StatCard label="Monthly Rent" value={formatCurrency(monthlyTotals.income)} color="accent" />
        <StatCard label="Monthly Expenses" value={formatCurrency(monthlyTotals.expense)} color="danger" />
        <StatCard
          label="Net Cash Flow"
          value={formatCurrency(monthlyTotals.net)}
          color={monthlyTotals.net > 0 ? 'accent' : 'danger'}
        />
        <StatCard label="Mortgage Balance" value={formatCurrency(stats.totalMortgageBalance)} />
      </div>

      {/* Properties */}
      <h2 style={{ fontSize: '18px', marginBottom: '16px', marginTop: '32px', fontWeight: 500 }}>
        Properties
      </h2>
      <div className="card" style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '8px', fontWeight: 500 }}>
          {mockProperty.address}
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          {mockProperty.city}, {mockProperty.state} {mockProperty.zip}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            fontSize: '14px',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Est. Value: </span>
            <strong>{formatCurrency(mockProperty.estimated_value)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Mortgage: </span>
            <strong>{formatCurrency(mockProperty.mortgage_balance)}</strong>
          </div>
        </div>
      </div>

      {/* Units */}
      <h2 style={{ fontSize: '18px', marginBottom: '16px', fontWeight: 500 }}>Units</h2>
      <div style={{ display: 'grid', gap: '12px', marginBottom: '32px' }}>
        {mockUnits.map((unit) => (
          <div key={unit.id} className="card">
            <h4 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
              {unit.unit_number}
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Bedrooms: </span>
                {unit.bedroom_count}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Bathrooms: </span>
                {unit.bathroom_count}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Sqft: </span>
                {unit.sqft}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Rent: </span>
                {formatCurrency(unit.current_rent)}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Tenant: </span>
                {unit.tenant_name}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Status: </span>
                <span style={{ color: unit.occupied ? 'var(--accent)' : 'var(--danger)' }}>
                  {unit.occupied ? 'Occupied' : 'Vacant'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <h2 style={{ fontSize: '18px', marginBottom: '16px', fontWeight: 500 }}>Recent Activity</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {mockTransactions.slice(0, 10).map((tx) => (
              <tr key={tx.id}>
                <td>{tx.transaction_date}</td>
                <td>{tx.description}</td>
                <td
                  style={{
                    textAlign: 'right',
                    color:
                      tx.type === 'income'
                        ? 'var(--accent)'
                        : tx.type === 'expense'
                        ? 'var(--danger)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {tx.type === 'expense' && '-'}
                  {formatCurrency(Math.abs(tx.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

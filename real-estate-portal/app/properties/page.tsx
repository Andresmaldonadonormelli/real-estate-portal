import { mockProperty, mockUnits } from '@/lib/mockData';
import { formatCurrency } from '@/lib/formatters';

export default function PropertiesPage() {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '24px', fontWeight: 500 }}>Properties</h1>

      <div className="card" style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px', fontWeight: 500 }}>
          {mockProperty.address}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Location
            </div>
            <div style={{ fontSize: '16px', fontWeight: 500 }}>
              {mockProperty.city}, {mockProperty.state} {mockProperty.zip}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Estimated Value
            </div>
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--accent)' }}>
              {formatCurrency(mockProperty.estimated_value)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Mortgage Balance
            </div>
            <div style={{ fontSize: '16px', fontWeight: 500 }}>
              {formatCurrency(mockProperty.mortgage_balance)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Property Type
            </div>
            <div style={{ fontSize: '16px', fontWeight: 500, textTransform: 'capitalize' }}>
              {mockProperty.property_type}
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '20px', marginBottom: '16px', fontWeight: 500 }}>Units</h2>
      <div style={{ display: 'grid', gap: '12px' }}>
        {mockUnits.map((unit) => (
          <div key={unit.id} className="card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '8px', fontWeight: 500 }}>
                  {unit.unit_number}
                </h3>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {unit.bedroom_count} bed, {unit.bathroom_count} bath • {unit.sqft} sqft
                </div>
                <div style={{ fontSize: '14px', marginTop: '8px' }}>
                  Tenant: <strong>{unit.tenant_name}</strong>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Monthly Rent
                </div>
                <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--accent)' }}>
                  {formatCurrency(unit.current_rent)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    background: unit.occupied ? 'var(--bg-primary)' : 'var(--bg-primary)',
                    color: unit.occupied ? 'var(--accent)' : 'var(--danger)',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  {unit.occupied ? '✓ Occupied' : '✗ Vacant'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

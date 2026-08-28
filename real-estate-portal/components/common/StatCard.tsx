interface StatCardProps {
  label: string;
  value: string | number;
  color?: 'default' | 'accent' | 'danger';
}

export default function StatCard({ label, value, color = 'default' }: StatCardProps) {
  const colorMap = {
    default: 'var(--text-primary)',
    accent: 'var(--accent)',
    danger: 'var(--danger)',
  };

  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: colorMap[color] }}>
        {value}
      </div>
    </div>
  );
}

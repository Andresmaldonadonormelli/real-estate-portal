'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface BottomNavProps {
  onMenuClick: () => void;
}

export default function BottomNav({ onMenuClick }: BottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: '⌂' },
    { href: '/properties', label: 'Properties', icon: '🏠' },
    { href: '/ledger', label: 'Ledger', icon: '📊' },
    { href: '/work-orders', label: 'Work', icon: '🔧' },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: '64px',
        borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        zIndex: 50,
      }}
    >
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '8px 12px',
            fontSize: '12px',
            color: pathname === item.href ? 'var(--accent)' : 'var(--text-secondary)',
            textDecoration: 'none',
            flex: 1,
            cursor: 'pointer',
            transition: 'color 0.2s',
          }}
        >
          <span style={{ fontSize: '20px' }}>{item.icon}</span>
          {item.label}
        </Link>
      ))}
      <button
        onClick={onMenuClick}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 12px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          flex: 1,
        }}
      >
        <span style={{ fontSize: '20px' }}>≡</span>
        Menu
      </button>
    </nav>
  );
}

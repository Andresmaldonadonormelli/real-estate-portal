'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

export default function SideNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/properties', label: 'Properties' },
    { href: '/ledger', label: 'Ledger & Docs' },
    { href: '/utilities', label: 'Utilities' },
    { href: '/account', label: 'Account' },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '280px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        padding: '24px 0',
        overflowY: 'auto',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '0 24px', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '18px', marginBottom: '12px', fontWeight: 500 }}>RE Portal</h1>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Your property dashboard
        </p>
      </div>

      <div style={{ marginBottom: '32px', flex: 1 }}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
            style={{
              display: 'block',
              color: pathname === item.href ? 'var(--accent)' : 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div style={{ padding: '0 24px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
        <ThemeToggle />
      </div>
    </nav>
  );
}

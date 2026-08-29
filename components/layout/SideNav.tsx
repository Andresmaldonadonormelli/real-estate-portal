'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, House, Files, PlugZap, UserRound } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function SideNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/properties', label: 'Properties', icon: House },
    { href: '/ledger', label: 'Ledger & Docs', icon: Files },
    { href: '/utilities', label: 'Utilities', icon: PlugZap },
    { href: '/account', label: 'Account', icon: UserRound },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '260px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        padding: '18px 0',
        overflowY: 'auto',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '0 18px', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '18px', marginBottom: '12px', fontWeight: 500 }}>RE Portal</h1>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Your property dashboard
        </p>
      </div>

      <div style={{ marginBottom: '24px', flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${active ? 'active' : ''}`}
            >
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ padding: '0 18px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
        <ThemeToggle />
      </div>
    </nav>
  );
}

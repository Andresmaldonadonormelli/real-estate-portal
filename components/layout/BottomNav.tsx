'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, House, Files, PlugZap, Menu } from 'lucide-react';

interface BottomNavProps {
  onMenuClick: () => void;
}

export default function BottomNav({ onMenuClick }: BottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/properties', label: 'Properties', icon: House },
    { href: '/ledger', label: 'Ledger', icon: Files },
    { href: '/utilities', label: 'Utilities', icon: PlugZap },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`bottom-nav-link ${active ? 'active' : ''}`}>
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button onClick={onMenuClick} className="bottom-nav-link" type="button">
        <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}

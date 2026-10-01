'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, PanelLeft, Settings } from 'lucide-react';
import OverviewIcon from '@/components/layout/OverviewIcon';
import PropertiesIcon from '@/components/layout/PropertiesIcon';
import TransactionsIcon from '@/components/layout/TransactionsIcon';
import RotatingMascot from '@/components/layout/RotatingMascot';
import { useNotificationInbox } from '@/components/dashboard/notificationInbox';
import { shortPropertyName } from '@/lib/formatters';
import { iconSize } from '@/lib/iconSizes';
import { cachedSupabaseRequest, PROPERTY_FIELDS } from '@/lib/supabaseData';
import { supabase } from '@/lib/supabase';

type NavProperty = { id: string; address: string };

export default function SideNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotificationInbox();
  const [properties, setProperties] = useState<NavProperty[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const alertsActive = pathname.startsWith('/notifications');
  const accountActive = pathname.startsWith('/account') || pathname.startsWith('/archive');

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('nav-collapsed') === '1');
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await cachedSupabaseRequest('shared:properties', async () => await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at', null).order('address'));
        if (!active || result.error) return;
        setProperties((result.data || []) as NavProperty[]);
      } catch { /* The directory link still opens the properties page. */ }
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('portal:data-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('portal:data-changed', refresh);
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed(value => {
      const next = !value;
      window.localStorage.setItem('nav-collapsed', next ? '1' : '0');
      return next;
    });
  }

  return <nav className={`side-nav${collapsed ? ' is-collapsed' : ''}`} aria-label="Primary">
    <div className="side-nav-brand">
      <RotatingMascot embedded />
      <strong>Portfolio</strong>
    </div>
    <div className="side-nav-scroll">
      <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}><OverviewIcon active={pathname === '/'} size={iconSize.nav} /><span className="nav-label">Overview</span></Link>
      <Link href="/ledger" className={`nav-link ${pathname.startsWith('/ledger') || pathname.startsWith('/actions') ? 'active' : ''}`}><TransactionsIcon active={pathname.startsWith('/ledger') || pathname.startsWith('/actions')} size={iconSize.nav} /><span className="nav-label">Transactions</span></Link>
      <Link href="/notifications" className={`nav-link ${alertsActive ? 'active' : ''}`} aria-label={unreadCount ? `Alerts, ${unreadCount} unread` : 'Alerts'}>
        <span className="nav-alert-icon"><Bell size={iconSize.nav} strokeWidth={1.75} fill={alertsActive ? 'currentColor' : 'none'} />{unreadCount > 0 && <span className="dashboard-bell-count">{unreadCount}</span>}</span>
        <span className="nav-label">Alerts</span>
      </Link>
      <Link href="/properties" className={`nav-link nav-directory ${pathname === '/properties' ? 'active' : ''}`}><PropertiesIcon active={pathname === '/properties'} size={iconSize.nav} /><span className="nav-label">Properties</span></Link>
      {properties.length > 0 && <p className="nav-subheader">Properties</p>}
      {properties.map(property => {
        const href = `/properties/${property.id}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={property.id} href={href} className={`nav-link nav-property ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><span className="nav-label">{shortPropertyName(property.address)}</span></Link>;
      })}
    </div>
    <div className="side-nav-footer">
      <Link href="/account" className={`nav-link ${accountActive ? 'active' : ''}`}><Settings size={iconSize.nav} strokeWidth={1.75} /><span className="nav-label">Account settings</span></Link>
      <button type="button" className="nav-link nav-collapse" aria-pressed={collapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={toggleCollapsed}><PanelLeft size={iconSize.nav} strokeWidth={1.75} /><span className="nav-label">{collapsed ? 'Expand' : 'Collapse'}</span></button>
    </div>
  </nav>;
}

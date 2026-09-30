'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Archive, Landmark, Lightbulb, LogOut, SlidersHorizontal, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import { PageHeader } from '@/components/common/ProductControls';
import ConnectedAccounts from '@/components/account/ConnectedAccounts';
import ThemeToggle from '@/components/layout/ThemeToggle';
import UtilitiesWorkspace from '@/components/utilities/UtilitiesWorkspace';

const SECTIONS = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'utilities', label: 'Utilities', icon: Lightbulb },
  { id: 'banks', label: 'Banks', icon: Landmark },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function AccountPage() {
  const { user } = useAuth();
  const requested = useSearchParams().get('section');
  const section: SectionId = requested === 'account' || requested === 'profile'
    ? 'account'
    : requested === 'utilities'
      ? 'utilities'
      : requested === 'banks'
        ? 'banks'
        : 'general';

  return <div className="account-page account-settings">
    <PageHeader title="Account settings" />
    <div className="settings-layout">
      <nav className="settings-menu" aria-label="Account settings">
        {SECTIONS.map(item => {
          const Icon = item.icon;
          const active = section === item.id;
          return <Link key={item.id} href={`/account?section=${item.id}`} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon size={16} strokeWidth={1.75} /><span>{item.label}</span></Link>;
        })}
        <Link href="/archive"><Archive size={16} strokeWidth={1.75} /><span>Archive</span></Link>
      </nav>
      <div className="settings-panel">
        {section === 'general' && <GeneralSection />}
        {section === 'account' && <AccountSection email={user.email || 'Signed in'} />}
        {section === 'utilities' && <UtilitiesSection />}
        {section === 'banks' && <BanksSection />}
      </div>
    </div>
  </div>;
}

function GeneralSection() {
  return <>
    <h2>General</h2>
    <p className="settings-lead">How the portal looks on this device.</p>
    <hr className="settings-rule" />
    <section className="settings-block">
      <h3>Appearance</h3>
      <p>Light, dark, or match this device.</p>
      <ThemeToggle variant="menu" />
    </section>
  </>;
}

function AccountSection({ email }: { email: string }) {
  return <>
    <h2>Account</h2>
    <p className="settings-lead">Sign-in for this portfolio.</p>
    <hr className="settings-rule" />
    <section className="settings-block">
      <h3>Signed in as</h3>
      <p>Your portfolio and documents are private to this account.</p>
      <div className="settings-tile settings-signed-in">
        <i />
        <strong>{email}</strong>
      </div>
      <button type="button" className="settings-sign-out" onClick={() => supabase.auth.signOut()}><LogOut size={16} strokeWidth={1.75} />Sign out</button>
    </section>
  </>;
}

function UtilitiesSection() {
  return <>
    <h2>Utilities</h2>
    <p className="settings-lead">Accounts for electric, gas, water, and the other services on your properties.</p>
    <hr className="settings-rule" />
    <UtilitiesWorkspace />
  </>;
}

function BanksSection() {
  return <>
    <h2>Banks</h2>
    <p className="settings-lead">Link a bank, then assign each account to a property.</p>
    <hr className="settings-rule" />
    <div className="settings-tile settings-banks"><ConnectedAccounts /></div>
  </>;
}

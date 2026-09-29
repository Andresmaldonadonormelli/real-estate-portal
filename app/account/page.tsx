'use client';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, ArrowLeft, ChevronRight, FileText, Landmark, Lightbulb, Settings, UserRound } from 'lucide-react';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { PageHeader } from '@/components/common/ProductControls';
import ConnectedAccounts from '@/components/account/ConnectedAccounts';

export default function AccountPage() {
  const { user } = useAuth();
  return (
    <>
      <div className="account-page account-desktop">
        <PageHeader title="Account Settings"/>
        <div className="account-settings-list">
          <div className="account-settings-row"><div><span>Signed in as</span><strong>{user.email || 'Signed in'}</strong></div></div>
          <div className="account-settings-row"><div><strong>Appearance</strong><span>Choose how the portal looks on this device.</span></div><ThemeToggle variant="menu"/></div>
          <ConnectedAccounts/>
          <div className="account-settings-row"><div><strong>Bank accounts &amp; statements</strong><span>View imported bank activity and uploaded statements.</span></div><Link href="/ledger?tab=statements" className="pill-link">Open statements</Link></div>
          <div className="account-settings-row"><div><strong>Archive</strong><span>Restore properties, units, utilities, documents and transactions you archived.</span></div><Link href="/archive" className="pill-link">Open archive</Link></div>
        </div>
        <button className="account-sign-out" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <MorePage email={user.email || 'Signed in'} />
    </>
  );
}

function MorePage({ email }: { email: string }) {
  const router = useRouter();
  const section = useSearchParams().get('section');
  const titled = section === 'profile' || section === 'settings';

  return (
    <div className="more-page">
      {section === 'banks' || titled ? (
        <>
          <header className="more-section-head">
            <button type="button" aria-label="Back to More" onClick={() => router.push('/account')}><ArrowLeft size={18} /></button>
            {titled ? <h1>{section === 'profile' ? 'Profile' : 'Settings'}</h1> : null}
          </header>
          {section === 'banks' && <div className="more-panel"><ConnectedAccounts /></div>}
          {section === 'profile' && (
            <section className="more-panel">
              <div className="more-detail"><span>Signed in as</span><strong>{email}</strong></div>
              <button type="button" className="account-sign-out" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </section>
          )}
          {section === 'settings' && (
            <section className="more-panel more-settings">
              <div className="more-detail"><strong>Appearance</strong><span>Choose how the portal looks on this device.</span></div>
              <ThemeToggle variant="menu" />
            </section>
          )}
        </>
      ) : (
        <>
          <PageHeader title="More" />
          <section className="more-group">
            <h2>Manage portfolio</h2>
            <div className="more-panel">
              <Link href="/utilities"><Lightbulb size={20} strokeWidth={1.75} /><span>Utilities</span><ChevronRight size={18} /></Link>
              <Link href="/account?section=banks"><Landmark size={20} strokeWidth={1.75} /><span>Bank accounts</span><ChevronRight size={18} /></Link>
              <Link href="/ledger?tab=documents"><FileText size={20} strokeWidth={1.75} /><span>Documents &amp; statements</span><ChevronRight size={18} /></Link>
              <Link href="/archive"><Archive size={20} strokeWidth={1.75} /><span>Archive</span><ChevronRight size={18} /></Link>
            </div>
          </section>
          <section className="more-group">
            <h2>Account</h2>
            <div className="more-panel">
              <Link href="/account?section=profile"><UserRound size={20} strokeWidth={1.75} /><span>Profile</span><ChevronRight size={18} /></Link>
              <Link href="/account?section=settings"><Settings size={20} strokeWidth={1.75} /><span>Settings</span><ChevronRight size={18} /></Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

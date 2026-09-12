'use client';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import Link from 'next/link';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { PageHeader } from '@/components/common/ProductControls';

export default function AccountPage(){
  const { user } = useAuth();
  return <div className="account-page">
    <PageHeader title="Account Settings"/>
    <div className="account-settings-list">
      <div className="account-settings-row"><div><span>Signed in as</span><strong>{user.email || 'Signed in'}</strong></div></div>
      <div className="account-settings-row"><div><strong>Appearance</strong><span>Choose how the portal looks on this device.</span></div><ThemeToggle variant="menu"/></div>
      <div className="account-settings-row"><div><strong>Archive</strong><span>Restore properties, units, utilities, documents and transactions you archived.</span></div><Link href="/archive" className="pill-link">Open archive</Link></div>
    </div>
    <button className="account-sign-out" onClick={()=>supabase.auth.signOut()}>Sign out</button>
  </div>
}

'use client';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import Link from 'next/link';

export default function AccountPage(){
  const { user } = useAuth();
  return <div className="account-page">
    <header className="account-page-header"><h1>Account Settings</h1></header>
    <div className="account-settings-list">
      <div className="account-settings-row"><div><span>Signed in as</span><strong>{user.email || 'Signed in'}</strong></div></div>
      <div className="account-settings-row"><div><strong>Archive</strong><span>Restore properties, units, utilities, documents and transactions you archived.</span></div><Link href="/archive" className="pill-link">Open archive</Link></div>
    </div>
    <button className="account-sign-out" onClick={()=>supabase.auth.signOut()}>Sign out</button>
  </div>
}

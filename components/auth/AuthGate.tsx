'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { AuthSessionProvider } from '@/components/auth/AuthContext';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function bootstrapAuth() {
      // Resolve the persisted session first, then attach the live listener.
      // Sequencing these prevents the cold-load lock/race that could leave the
      // portal skeleton visible until a hard refresh.
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Auth session timed out.')), 3500)),
        ]);
        if (!active) return;
        setSession(result.data.session);
      } catch {
        if (!active) return;
        setSession(null);
      } finally {
        if (active) setLoading(false);
      }

      if (!active) return;
      const listener = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      });
      subscription = listener.data.subscription;
    }

    void bootstrapAuth();

    // Absolute watchdog: never leave the app on a skeleton forever.
    const watchdog = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 6000);

    return () => {
      active = false;
      window.clearTimeout(watchdog);
      subscription?.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    if (!email || password.length < 6) {
      setMessage('Enter an email and a password with at least 6 characters.');
      setSubmitting(false);
      return;
    }

    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === 'signup' && !result.data.session) {
      setMessage('Account created. Check your email to confirm, then sign in.');
      setMode('signin');
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="auth-loading-shell" role="status" aria-label="Loading portal"><div className="auth-loading-card"><div className="skeleton-block" style={{width:110,height:16,marginBottom:18}}/><div className="skeleton-block" style={{width:'58%',height:30,marginBottom:12}}/><div className="skeleton-block" style={{width:'82%',height:14,marginBottom:26}}/><div className="skeleton-block" style={{height:44,marginBottom:12}}/><div className="skeleton-block" style={{height:44,marginBottom:18}}/><div className="skeleton-block" style={{height:44}}/></div></div>;
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg-primary)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>RE Portal</div>
          <h1 style={{ fontSize: 30, marginBottom: 8, fontWeight: 600 }}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
            Your private property portfolio dashboard.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} style={inputStyle} />
            </label>

            {message && <div style={{ fontSize: 13, lineHeight: 1.45, padding: 12, borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{message}</div>}

            <button type="submit" disabled={submitting} style={primaryButtonStyle}>
              {submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }} style={{ marginTop: 16, width: '100%', border: 0, background: 'transparent', color: 'var(--accent)', cursor: 'pointer', padding: 10 }}>
            {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return <AuthSessionProvider session={session}>{children}</AuthSessionProvider>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 13px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 16 };
const primaryButtonStyle: React.CSSProperties = { padding: '12px 16px', border: 0, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 15, fontWeight: 600, cursor: 'pointer' };

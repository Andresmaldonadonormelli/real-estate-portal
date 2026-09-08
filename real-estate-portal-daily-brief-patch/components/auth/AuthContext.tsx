'use client';

import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

type AuthContextValue = {
  session: Session;
  user: User;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthSessionProvider({ session, children }: { session: Session; children: React.ReactNode }) {
  return <AuthContext.Provider value={{ session, user: session.user }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthSessionProvider.');
  return value;
}

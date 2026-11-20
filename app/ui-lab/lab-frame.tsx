'use client';

import type { Session } from '@supabase/supabase-js';
import { AuthSessionProvider } from '@/components/auth/AuthContext';
import { NotificationInboxProvider } from '@/components/dashboard/notificationInbox';
import { LAB_NOTIFICATIONS } from './fixtures';

const previewSession = { user: { id: 'lab' } } as Session;

export default function LabFrame({ children }: { children: React.ReactNode }) {
  return (
    <AuthSessionProvider session={previewSession}>
      <NotificationInboxProvider preview={LAB_NOTIFICATIONS}>{children}</NotificationInboxProvider>
    </AuthSessionProvider>
  );
}

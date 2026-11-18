'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { NotificationFeed } from '@/components/dashboard/NotificationFeed';
import { NotificationWorkspace } from '@/components/dashboard/NotificationWorkspace';

export default function NotificationsPage() {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/');
  }

  return (
    <NotificationWorkspace active>
      {openNotification => (
        <div className="notifications-page">
          <header className="notifications-page-bar">
            <button type="button" className="notifications-back" aria-label="Back" onClick={goBack}><ArrowLeft size={22} strokeWidth={1.75} /></button>
            <h1>Alerts</h1>
          </header>
          <NotificationFeed onOpen={openNotification} />
        </div>
      )}
    </NotificationWorkspace>
  );
}

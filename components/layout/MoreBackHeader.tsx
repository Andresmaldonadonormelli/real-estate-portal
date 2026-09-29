'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function MoreBackHeader({ title, action }: { title: string; action?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="more-back-header">
      <div className="more-back-bar">
        <button type="button" className="more-back-button" aria-label="Back to More" onClick={() => router.push('/account')}>
          <ChevronLeft size={22} strokeWidth={1.75} />
        </button>
        {action}
      </div>
      <h1>{title}</h1>
    </header>
  );
}

'use client';

import { useId } from 'react';

const cardLine = 'M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21';
const topEdge = 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2';

export default function TransactionsIcon({ active, size = 23 }: { active: boolean; size?: number }) {
  const maskId = `transactions-${useId().replace(/:/g, '')}`;
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <path d={topEdge} fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
          <path d={cardLine} fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <rect mask={`url(#${maskId})`} x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d={topEdge} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d={cardLine} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

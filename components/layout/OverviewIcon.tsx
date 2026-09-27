'use client';

import { useId } from 'react';

const house = 'M12 4c.6 0 1 .25 1.45.85L19.15 9.85c.65.55 1.55 1.1 1.3 1.95l-1.4 7c-.2.85-.85 1.6-1.8 1.6H6.75c-.95 0-1.6-.75-1.8-1.6l-1.4-7c-.25-.85.65-1.4 1.3-1.95L10.55 4.85C11 4.25 11.4 4 12 4Z';
const smile = 'M8.7 15.15c1 1.25 2.15 1.85 3.3 1.85s2.3-.6 3.3-1.85';

export default function OverviewIcon({ active, size = 18 }: { active: boolean; size?: number }) {
  const maskId = `overview-${useId().replace(/:/g, '')}`;
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <path d={smile} fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
        <path mask={`url(#${maskId})`} fill="currentColor" d={house} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={house} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d={smile} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

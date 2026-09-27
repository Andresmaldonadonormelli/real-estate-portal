'use client';

import { useId } from 'react';

export default function OverviewIcon({ active, size = 18 }: { active: boolean; size?: number }) {
  const maskId = `overview-${useId().replace(/:/g, '')}`;
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <path d="M8 15.1c1.15 1.55 2.5 2.2 4 2.2s2.85-.65 4-2.2" fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
        <path mask={`url(#${maskId})`} fill="currentColor" d="M12 2.6 21.4 10.1V21.4H2.6V10.1L12 2.6Z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 20.4 10.2V20.5H3.6V10.2L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8.2 15c1.1 1.4 2.4 2 3.8 2s2.7-.6 3.8-2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

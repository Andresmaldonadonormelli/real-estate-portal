'use client';

import { useId } from 'react';

const body = 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18H6Z';
const leftWing = 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2V12Z';
const rightWing = 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2V9Z';
const windows = 'M10 6h4M10 10h4M10 14h4M10 18h4';

export default function PropertiesIcon({ active, size = 23 }: { active: boolean; size?: number }) {
  const maskId = `properties-${useId().replace(/:/g, '')}`;
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <path d={windows} fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
        <path mask={`url(#${maskId})`} fill="currentColor" d={body} />
        <path mask={`url(#${maskId})`} fill="currentColor" d={leftWing} />
        <path mask={`url(#${maskId})`} fill="currentColor" d={rightWing} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d={windows} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

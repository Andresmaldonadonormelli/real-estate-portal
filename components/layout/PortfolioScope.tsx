'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

const PortfolioScopeContext = createContext<{ propertyId: string; setPropertyId: (id: string) => void } | null>(null);

export function PortfolioScopeProvider({ children }: { children: ReactNode }) {
  const [propertyId, setPropertyId] = useState('');
  return <PortfolioScopeContext.Provider value={{ propertyId, setPropertyId }}>{children}</PortfolioScopeContext.Provider>;
}

export function usePortfolioScope() {
  const value = useContext(PortfolioScopeContext);
  if (!value) throw new Error('Portfolio scope is only available inside the app shell.');
  return value;
}

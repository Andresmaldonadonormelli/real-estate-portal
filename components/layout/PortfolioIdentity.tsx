'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote, Building2, Check, ChevronDown, FileText, Home, Plus, Receipt, Settings } from 'lucide-react';
import NotificationBell from '@/components/dashboard/NotificationBell';
import { shortPropertyName } from '@/lib/formatters';
import { cachedSupabaseRequest, PROPERTY_FIELDS } from '@/lib/supabaseData';
import { supabase } from '@/lib/supabase';
import { usePortfolioScope } from '@/components/layout/PortfolioScope';

type HeaderProperty = { id: string; address: string };

export default function PortfolioIdentity() {
  const asOf = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const router = useRouter();
  const { propertyId, setPropertyId } = usePortfolioScope();
  const [properties, setProperties] = useState<HeaderProperty[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const addRef = useRef<HTMLDivElement | null>(null);
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = propertyId
    ? shortPropertyName(properties.find(property => property.id === propertyId)?.address || 'Property')
    : 'All properties';

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await cachedSupabaseRequest('shared:properties', async () => await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at', null).order('address'));
        if (!active || result.error) return;
        setProperties((result.data || []) as HeaderProperty[]);
      } catch { /* The menu still offers the whole portfolio. */ }
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('portal:data-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('portal:data-changed', refresh);
    };
  }, []);

  useEffect(() => {
    if (!addOpen && !scopeOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (addOpen && !addRef.current?.contains(target)) setAddOpen(false);
      if (scopeOpen && !scopeRef.current?.contains(target)) setScopeOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAddOpen(false);
      setScopeOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [addOpen, scopeOpen]);

  function go(href: string) {
    setAddOpen(false);
    router.push(href);
  }

  function chooseProperty(id: string) {
    setPropertyId(id);
    setScopeOpen(false);
  }

  return <header className="portfolio-identity">
    <div className="portfolio-identity-copy">
      <strong>Your Portfolio</strong>
      <p>As of {asOf}</p>
    </div>
    <div className="portfolio-identity-actions">
      <div className="portfolio-scope-menu" ref={scopeRef}>
        <button
          type="button"
          className="portfolio-icon-button"
          aria-label={`Property filter, ${selectedLabel}`}
          aria-expanded={scopeOpen}
          aria-haspopup="menu"
          data-active={propertyId ? 'true' : undefined}
          onClick={() => { setScopeOpen(open => !open); setAddOpen(false); }}
        >
          <Home size={18} />
        </button>
        {scopeOpen && <div className="portfolio-scope-options" role="menu" aria-label="Choose property">
          <button type="button" role="menuitemradio" aria-checked={!propertyId} data-selected={!propertyId ? 'true' : undefined} onClick={() => chooseProperty('')}>
            <span>All properties</span>
            {!propertyId ? <Check size={16} aria-hidden="true" /> : null}
          </button>
          {properties.map(property => {
            const selected = propertyId === property.id;
            return <button key={property.id} type="button" role="menuitemradio" aria-checked={selected} data-selected={selected ? 'true' : undefined} onClick={() => chooseProperty(property.id)}>
              <span>{shortPropertyName(property.address)}</span>
              {selected ? <Check size={16} aria-hidden="true" /> : null}
            </button>;
          })}
        </div>}
      </div>
      <NotificationBell />
      <Link href="/account" className="portfolio-icon-button" aria-label="Settings">
        <Settings size={18} />
      </Link>
      <div className="pulse-add-menu" ref={addRef}>
        <button type="button" className="pulse-add-button" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => { setAddOpen(open => !open); setScopeOpen(false); }}><Plus size={18} /><span>Add</span><ChevronDown size={16} aria-hidden="true" /></button>
        {addOpen && <div className="pulse-add-options" role="menu">
          <button type="button" onClick={() => go('/ledger?add=1')}><Banknote size={17} />Record rent</button>
          <button type="button" onClick={() => go('/ledger?add=1')}><Receipt size={17} />Add transaction</button>
          <button type="button" onClick={() => go('/properties?add=1')}><Building2 size={17} />Add property</button>
          <button type="button" onClick={() => go('/ledger?tab=documents&upload=1')}><FileText size={17} />Upload document</button>
        </div>}
      </div>
    </div>
  </header>;
}

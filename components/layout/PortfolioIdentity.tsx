'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Building2, ChevronDown, FileText, Plus, Receipt } from 'lucide-react';
import NotificationBell from '@/components/dashboard/NotificationBell';
import { ProductSelect } from '@/components/common/ProductControls';
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
  const addRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await cachedSupabaseRequest('shared:properties', async () => await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at', null).order('address'));
        if (!active || result.error) return;
        setProperties((result.data || []) as HeaderProperty[]);
      } catch { /* The select still offers the whole portfolio. */ }
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
    if (!addOpen) return;
    const close = (event: PointerEvent) => { if (!addRef.current?.contains(event.target as Node)) setAddOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAddOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [addOpen]);

  function go(href: string) {
    setAddOpen(false);
    router.push(href);
  }

  return <header className="portfolio-identity">
    <div>
      <strong>Your Portfolio</strong>
      <p>As of {asOf}</p>
    </div>
    <div className="portfolio-identity-tools">
      <ProductSelect aria-label="Property" value={propertyId} onChange={event => setPropertyId(event.target.value)}>
        <option value="">All properties</option>
        {properties.map(property => <option key={property.id} value={property.id}>{shortPropertyName(property.address)}</option>)}
      </ProductSelect>
      <NotificationBell />
      <div className="pulse-add-menu" ref={addRef}>
        <button type="button" className="pulse-add-button" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => setAddOpen(open => !open)}><Plus size={18} /><span>Add</span><ChevronDown size={16} aria-hidden="true" /></button>
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

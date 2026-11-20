'use client';

import { useState } from 'react';
import PropertyPicker from '@/components/common/PropertyPicker';
import { propertyChipName } from '@/lib/formatters';
import { LAB_PROPERTIES } from '../fixtures';

export default function EmbedClient({ theme, view }: { theme: 'light' | 'dark'; view: 'picker' | 'picker-open' | 'chips' }) {
  return (
    <div className="ui-lab-embed" data-theme={theme}>
      {view === 'chips' ? <Chips /> : <Picker startOpen={view === 'picker-open'} />}
    </div>
  );
}

function Picker({ startOpen }: { startOpen: boolean }) {
  const [value, setValue] = useState('triskett');
  return <PropertyPicker value={value} properties={LAB_PROPERTIES} onChange={setValue} startOpen={startOpen} />;
}

function Chips() {
  const [value, setValue] = useState('');
  return (
    <div className="dashboard-mobile-context">
      <div className="dashboard-property-chips" role="tablist" aria-label="Property">
        <button type="button" role="tab" aria-selected={value === ''} onClick={() => setValue('')}>All</button>
        {LAB_PROPERTIES.map((property) => (
          <button type="button" role="tab" key={property.id} aria-selected={value === property.id} onClick={() => setValue(property.id)}>{propertyChipName(property.address)}</button>
        ))}
      </div>
    </div>
  );
}

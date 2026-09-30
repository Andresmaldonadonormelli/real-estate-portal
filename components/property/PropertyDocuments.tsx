'use client';

import { useMemo } from 'react';
import type { PropertyDocument } from '@/lib/types';
import { formatDate } from '@/lib/propertyFinancials';
import DocumentFeed from '@/components/documents/DocumentFeed';
import { SecondaryLink } from '@/components/common/ProductControls';

export default function PropertyDocuments({ documents, propertyId }: { documents: PropertyDocument[]; propertyId: string }) {
  const groups = useMemo(() => {
    const receipts = documents.filter(isReceipt);
    const propertyDocs = documents.filter(document => !isReceipt(document));
    return [
      { title: 'Property documents', empty: 'No leases, insurance, or closing files yet.', items: propertyDocs },
      { title: 'Bills and receipts', empty: 'No bills or receipts yet.', items: receipts },
    ];
  }, [documents]);

  return <div className="property-stack">
    {groups.map((group, index) => <section key={group.title} className="property-module">
      <div className="property-module-head">
        <h2>{group.title}</h2>
        {index === 0 ? <SecondaryLink href={`/ledger?tab=documents&property=${propertyId}`}>Upload document</SecondaryLink> : null}
      </div>
      {group.items.length ? <DocumentFeed items={group.items.map(document => ({
        id: document.id,
        meta: document.category,
        title: document.title || document.file_name,
        subtext: document.expires_at ? `Expires ${formatDate(document.expires_at)}` : document.document_date ? formatDate(document.document_date) : document.file_name,
      }))} onOpen={() => { location.href = `/ledger?tab=documents&property=${propertyId}`; }} /> : <p className="property-module-note">{group.empty}</p>}
    </section>)}
  </div>;
}

function isReceipt(document: PropertyDocument) {
  return /receipt|bill|invoice/i.test(`${document.category || ''} ${document.title || ''} ${document.file_name || ''}`);
}

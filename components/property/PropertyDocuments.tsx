'use client';

import { useMemo, useState } from 'react';
import type { PropertyDocument } from '@/lib/types';
import { formatDate } from '@/lib/propertyFinancials';
import DocumentFeed from '@/components/documents/DocumentFeed';
import { ProductSelect, SecondaryLink } from '@/components/common/ProductControls';

export default function PropertyDocuments({documents,propertyId}:{documents:PropertyDocument[];propertyId:string}){
  const [category,setCategory]=useState('');
  const categories=useMemo(()=>[...new Set(documents.map(document=>document.category).filter(Boolean))].sort(),[documents]);
  const filtered=category?documents.filter(document=>document.category===category):documents;
  return <section className="property-open-panel property-tab-panel property-documents-panel">
    <div className="property-documents-toolbar"><ProductSelect aria-label="Document category" value={category} onChange={event=>setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value=><option key={value}>{value}</option>)}</ProductSelect><SecondaryLink href={`/ledger?tab=documents&property=${propertyId}`}>Upload document</SecondaryLink></div>
    {filtered.length?<DocumentFeed items={filtered.map(document=>({id:document.id,meta:document.category,title:document.title||document.file_name,subtext:document.expires_at?`Expires ${formatDate(document.expires_at)}`:document.document_date?formatDate(document.document_date):document.file_name}))} onOpen={()=>{location.href=`/ledger?tab=documents&property=${propertyId}`}}/>:<Empty text="No documents uploaded for this property."/>}
  </section>;
}

function Empty({ text }: { text: string }) { return <div className="property-empty-inline">{text}</div>; }

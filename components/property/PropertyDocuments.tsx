'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { PropertyDocument } from '@/lib/types';
import { formatDate } from '@/lib/propertyFinancials';

export default function PropertyDocuments({documents,propertyId}:{documents:PropertyDocument[];propertyId:string}){ return <section className="property-open-panel property-tab-panel"><div className="property-panel-head"><div><div className="eyebrow">DOCUMENTS</div><h2>Property documents</h2></div><Link href={`/ledger?tab=documents&property=${propertyId}`} className="property-secondary-action">Manage documents</Link></div><div className="property-document-list">{documents.length?documents.map(d=><div className="property-document-row" key={d.id}><div className="property-document-icon"><FileText size={18}/></div><div><strong>{d.title||d.file_name}</strong><span>{d.category}{d.expires_at?` · Expires ${formatDate(d.expires_at)}`:''}</span></div></div>):<Empty text="No documents uploaded for this property."/>}</div></section>; }

function Empty({ text }: { text: string }) { return <div className="property-empty-inline">{text}</div>; }

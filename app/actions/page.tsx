'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Banknote, ShieldCheck, FileText, ClipboardCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Property, PropertyDocument, Transaction } from '@/lib/types';
import PageSkeleton from '@/components/common/PageSkeleton';

type ActionItem = {
  id: string;
  kind: 'rent' | 'document' | 'review';
  title: string;
  detail: string;
  href: string;
  days: number;
  test?: boolean;
};

export default function ActionsPage() {
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === '1';
  const [properties, setProperties] = useState<Property[]>([]);
  const [docs, setDocs] = useState<PropertyDocument[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [p, d, t] = await Promise.all([
        supabase.from('properties').select('*').is('archived_at', null).order('address'),
        supabase.from('documents').select('*').is('archived_at', null),
        supabase.from('transactions').select('*').is('archived_at', null),
      ]);
      if (p.error || d.error || t.error) setError((p.error || d.error || t.error)!.message);
      else {
        setProperties((p.data || []) as Property[]);
        setDocs((d.data || []) as PropertyDocument[]);
        setTxs((t.data || []) as Transaction[]);
      }
      setLoading(false);
    })();
  }, []);

  const items = useMemo<ActionItem[]>(() => {
    const a: ActionItem[] = [];
    const grouped = new Map<string, Transaction[]>();
    txs.filter(t=>t.category==='Rent'&&t.status==='pending').forEach(t => grouped.set(t.property_id, [...(grouped.get(t.property_id) || []), t]));
    grouped.forEach((rows, id) => {
      const total = rows.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);
      const property = properties.find(p => p.id === id);
      a.push({
        id: `rent-${id}`,
        kind: 'rent',
        title: `Confirm ${new Date().toLocaleString('en-US', { month: 'long' })} rents`,
        detail: `${property?.address || 'Property'} · ${rows.length} unit${rows.length === 1 ? '' : 's'} · $${total.toLocaleString('en-US', { maximumFractionDigits: 2 })} expected`,
        href: '/',
        days: -999,
      });
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const needsReview=txs.filter(t=>(t.status||'posted')==='posted'&&((t as Transaction & {needs_review?:boolean}).needs_review||t.category==='Needs Review'));
    if(needsReview.length){a.push({id:'needs-review',kind:'review',title:`${needsReview.length} transaction${needsReview.length===1?'':'s'} need categorization`,detail:'Review before your accountant export',href:'/ledger?review=1',days:-500});}

    docs.filter(d => d.expires_at).forEach(d => {
      const days = Math.ceil((new Date(`${d.expires_at}T12:00:00`).getTime() - today.getTime()) / 86400000);
      if (days <= Number(d.reminder_days || 60)) {
        a.push({
          id: d.id,
          kind: 'document',
          title: days < 0 ? `${d.category} expired` : days === 0 ? `${d.category} due today` : `${d.category} due in ${days} days`,
          detail: `${properties.find(p => p.id === d.property_id)?.address || 'Property'} · ${d.title}`,
          href: '/ledger',
          days,
        });
      }
    });

    if (testMode) {
      const property = properties[0];
      const address = property?.address || '15334 Triskett Rd';
      a.unshift(
        { id: 'test-rent', kind: 'rent', title: 'Confirm August rents', detail: `${address} · 2 units · $2,850 expected · Test preview`, href: '/', days: -999, test: true },
        { id: 'test-insurance', kind: 'document', title: 'Insurance renewal due in 30 days', detail: `${address} · Policy renewal · Test preview`, href: '/ledger', days: 30, test: true },
        { id: 'test-lease', kind: 'document', title: 'Lease expires in 60 days', detail: `${address} · Unit 1 lease · Test preview`, href: '/ledger', days: 60, test: true },
      );
    }

    return a.sort((x, y) => x.days - y.days);
  }, [docs, txs, properties, testMode]);

  const needsYou = items.filter(i => i.days <= 30);
  const upcoming = items.filter(i => i.days > 30);

  return <div className="actions-page">
    <div className="actions-page-header">
      <Link href="/" style={{ fontSize: 13 }}>← Dashboard</Link>
      <h1>Action Items</h1>
      <p>Everything that needs your attention across your properties.</p>
    </div>
    {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}
    {loading ? <PageSkeleton variant="ledger" /> : items.length === 0 ?
      <div className="card" style={{ padding: 28 }}><strong>You're caught up.</strong><div className="muted-small" style={{ marginTop: 5 }}>Nothing needs your attention right now.</div></div> :
      <>
        {needsYou.length > 0 && <ActionGroup label="NEEDS YOU" items={needsYou} />}
        {upcoming.length > 0 && <ActionGroup label="UPCOMING" items={upcoming} />}
      </>}
  </div>;
}

function ActionGroup({ label, items }: { label: string; items: ActionItem[] }) {
  return <section>
    <div className="actions-group-label">{label} {items.length}</div>
    <div className="actions-page-list">
      {items.map(item => <Link className="actions-page-item" href={item.href} key={item.id}>
        <ActionPageIcon item={item} />
        <span className="actions-page-copy"><strong>{item.title}</strong><span>{item.detail}</span></span>
        <span className="actions-page-cta">{item.kind === 'rent' || item.kind==='review' ? 'Review' : 'Open'}</span>
      </Link>)}
    </div>
  </section>;
}

function ActionPageIcon({ item }: { item: ActionItem }) {
  const lower = item.title.toLowerCase();
  const Icon = item.kind === 'rent' ? Banknote : item.kind==='review' ? ClipboardCheck : lower.includes('insurance') ? ShieldCheck : lower.includes('lease') ? FileText : ClipboardCheck;
  const tone=item.kind==='rent'?'rent':item.kind==='review'?'review':lower.includes('insurance')?'insurance':lower.includes('lease')?'lease':'document';
  return <span className="actions-page-icon" data-action={tone} aria-hidden="true"><Icon size={21} strokeWidth={1.8} /></span>;
}

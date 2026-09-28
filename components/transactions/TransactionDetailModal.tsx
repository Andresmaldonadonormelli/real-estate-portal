'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import type { Property, Transaction, Unit } from '@/lib/types';
import { ACCOUNTING_CATEGORIES, categoryKey, categoryNeedsReview } from '@/lib/accounting';
import { formatCurrency } from '@/lib/formatters';
import { buildPayoutBreakdown, estimatePayoutSplit } from '@/lib/managementPayout';
import { ProductSelect } from '@/components/common/ProductControls';

type EditableTx = Transaction & { needs_review?: boolean | null };

function signed(amount: number) {
  const text = formatCurrency(Math.abs(amount));
  if (amount > 0.5) return `+${text}`;
  if (amount < -0.5) return `−${text}`;
  return text;
}

function typeLabel(transaction: EditableTx, payout: boolean) {
  if (payout) return 'Net property-management payout';
  const key = categoryKey(transaction.category || '');
  if (transaction.type === 'income' && key === 'rent') return 'Rent received';
  if (transaction.type === 'income') return 'Income';
  if (transaction.type === 'transfer') return 'Transfer';
  return 'Expense';
}

export default function TransactionDetailModal({ transaction, properties, units, transactions, onClose, onEdit, onSaved, onArchived, onArchiveFailed }: {
  transaction: EditableTx;
  properties: Property[];
  units: Unit[];
  transactions: Transaction[];
  onClose: () => void;
  onEdit: () => void;
  onSaved: (message?: string) => void | Promise<void>;
  onArchived?: (message?: string, id?: string, phase?: 'optimistic' | 'complete') => void | Promise<void>;
  onArchiveFailed?: (tx: EditableTx, error: string) => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [current, setCurrent] = useState(transaction);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const property = properties.find((item) => item.id === current.property_id);
  const unit = units.find((item) => item.id === current.unit_id);
  const payout = useMemo(() => buildPayoutBreakdown(current, property?.management_fee_percent, transactions), [current, property?.management_fee_percent, transactions]);
  const needsReview = Boolean(current.needs_review) || /needs review|uncategor/i.test(current.category || '');
  const status = current.status === 'pending' ? 'Pending' : needsReview || (payout && !payout.confirmed) ? 'Needs review' : 'Confirmed';
  const imported = current.source === 'plaid';
  const sourceLabel = imported ? `Imported from ${current.source_institution || 'bank'}${current.source_account_mask ? ` ••••${current.source_account_mask}` : ''}` : '';
  const account = imported ? `${current.source_institution || 'Bank'}${current.source_account_mask ? ` ••••${current.source_account_mask}` : ''}` : '';
  const importStatus = current.source_connection_status === 'unlinked' ? 'Unlinked account' : imported ? 'Imported' : current.source === 'recurring' ? 'Recurring' : 'Entered manually';
  const heroAmount = payout ? payout.net : Number(current.amount || 0);
  const showCategory = !payout || needsReview;

  useEffect(() => { setCurrent(transaction); }, [transaction]);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);

  async function confirmBreakdown() {
    if (!payout || payout.confirmed || !property) return;
    const userId = user?.id || current.user_id || '';
    const feePercent = Number(property.management_fee_percent || 0);
    if (!userId || feePercent <= 0) { setError('Add a management fee percent on the property before confirming this breakdown.'); return; }
    const feeKey = `management-fee-split:${current.id}`;
    const existingFee = await supabase.from('transactions').select('id').eq('user_id', userId).eq('import_key', feeKey).is('archived_at', null).maybeSingle();
    if (existingFee.data?.id) { setError('A management-fee split already exists for this deposit.'); return; }
    const split = estimatePayoutSplit(Math.abs(Number(current.amount || 0)), feePercent);
    if (split.fee <= 0) { setError('Could not estimate a management fee from this deposit.'); return; }
    setSaving(true); setError('');
    const rentUpdate = await supabase.from('transactions').update({
      type: 'income',
      category: 'Rent',
      amount: split.gross,
      description: current.description || 'Property management payout',
      notes: `Confirmed split from net deposit ${formatCurrency(split.net)}.`,
      needs_review: false,
      is_new_import: false,
      import_acknowledged_at: new Date().toISOString(),
    }).eq('id', current.id);
    if (rentUpdate.error) { setError(rentUpdate.error.message); setSaving(false); return; }
    const feeUpsert = await supabase.from('transactions').upsert({
      user_id: userId,
      property_id: current.property_id,
      unit_id: current.unit_id || null,
      transaction_date: current.transaction_date,
      type: 'expense',
      category: 'Management Fee',
      description: `Management fee (${feePercent}%)`,
      payee_source: 'Property manager',
      amount: -split.fee,
      notes: `Confirmed fee split from Chase/net payout ${formatCurrency(split.net)}.`,
      source: current.source || 'plaid',
      import_key: feeKey,
      status: 'posted',
      confirmed_at: new Date().toISOString(),
      needs_review: false,
      is_new_import: false,
    }, { onConflict: 'user_id,import_key', ignoreDuplicates: true });
    if (feeUpsert.error) { setError(feeUpsert.error.message); setSaving(false); return; }
    await onSaved('Payout breakdown confirmed');
    setSaving(false);
    onClose();
  }

  async function resolveCategory(category: string) {
    const key = categoryKey(category);
    const type = ['rent', 'other-income', 'refund'].includes(key) ? 'income' : ['contribution', 'distribution', 'non-operating'].includes(key) ? 'transfer' : 'expense';
    setSaving(true); setError('');
    const review = categoryNeedsReview(category);
    const result = await supabase.from('transactions').update({ category, type, needs_review: review }).eq('id', current.id);
    if (result.error) setError(result.error.message);
    else {
      setCurrent((row) => ({ ...row, category, type, needs_review: review }));
      await onSaved('Category updated');
    }
    setSaving(false);
  }

  async function archive() {
    if (!confirm('Delete this transaction?')) return;
    setSaving(true); setError('');
    await onArchived?.('Transaction deleted', current.id, 'optimistic');
    onClose();
    const result = await supabase.from('transactions').update({ archived_at: new Date().toISOString() }).eq('id', current.id);
    if (result.error) {
      await onArchiveFailed?.(current, result.error.message || 'Could not delete transaction.');
      setSaving(false);
      return;
    }
    await onArchived?.('Transaction deleted', current.id, 'complete');
    setSaving(false);
  }

  return <div className="quick-add-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="quick-add-modal transaction-detail-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
      <header className="transaction-detail-head">
        <div>
          <h2 id="transaction-detail-title">Transaction details</h2>
          {sourceLabel && <p className="transaction-detail-source">{sourceLabel}</p>}
        </div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
      </header>
      <div className="transaction-detail-hero">
        <strong className={heroAmount > 0.5 ? 'amount-positive' : heroAmount < -0.5 ? 'amount-negative' : ''}>{signed(heroAmount)}</strong>
        <span>{typeLabel(current, Boolean(payout))}</span>
        <time>{new Date(`${current.transaction_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
      </div>
      {payout && <dl className="transaction-payout">
        <div><dt>Gross rent collected</dt><dd className="amount-positive">{signed(payout.gross)}</dd></div>
        {payout.fee > 0.5 && <div><dt>Management fee</dt><dd className="amount-negative">{signed(-payout.fee)}</dd></div>}
        {payout.deductions.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className="amount-negative">{signed(-row.amount)}</dd></div>)}
        <div className="is-net"><dt>Net deposit</dt><dd>{signed(payout.net)}</dd></div>
      </dl>}
      {error && <div className="quick-add-error">{error}</div>}
      <dl className="transaction-facts">
        <div><dt>Property</dt><dd>{property?.address || 'Portfolio'}{unit?.unit_number ? ` · ${unit.unit_number}` : ''}</dd></div>
        <div><dt>Status</dt><dd>{status}</dd></div>
        {account && <div><dt>Account</dt><dd>{account}</dd></div>}
        <div><dt>Source</dt><dd>{importStatus}</dd></div>
        {showCategory && <div><dt>Category</dt><dd>{needsReview ? <ProductSelect className="needs-category" aria-label="Category" value={current.category || 'Needs Review'} onChange={(event) => void resolveCategory(event.target.value)} disabled={saving}>{ACCOUNTING_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</ProductSelect> : current.category}</dd></div>}
      </dl>
      <div className="transaction-detail-actions">
        {payout && !payout.confirmed && <button type="button" className="quick-add-submit" disabled={saving} onClick={() => void confirmBreakdown()}>{saving ? 'Confirming…' : 'Confirm breakdown'}</button>}
        <button type="button" className="product-secondary-button" onClick={onEdit}>Edit transaction</button>
      </div>
      <button type="button" className="transaction-detail-delete" disabled={saving} onClick={() => void archive()}>Delete transaction</button>
    </div>
  </div>;
}

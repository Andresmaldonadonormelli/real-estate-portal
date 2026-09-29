'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import type { Property, Transaction, Unit } from '@/lib/types';
import { formatCurrency, shortPropertyName } from '@/lib/formatters';
import { buildPayoutBreakdown, estimatePayoutSplit } from '@/lib/managementPayout';

type EditableTx = Transaction & { needs_review?: boolean | null };

function signed(amount: number) {
  const text = formatCurrency(Math.abs(amount));
  if (amount > 0.5) return `+${text}`;
  if (amount < -0.5) return `−${text}`;
  return text;
}

export function ChaseMark() {
  return <svg className="transaction-chase-mark" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#117ACA" d="M0 15.415c0 .468.38.85.848.85h5.937V.575L0 7.72v7.695m15.416 8.582c.467 0 .846-.38.846-.849v-5.937H.573l7.146 6.785h7.697M24 8.587a.844.844 0 0 0-.847-.846h-5.938V23.43l6.782-7.148L24 8.586M8.585.003a.847.847 0 0 0-.847.847v5.94h15.688L16.282.003H8.585Z" /></svg>;
}

function AccountLine({ chase, account }: { chase: boolean; account: string }) {
  return <span className="transaction-account-line">{chase ? <ChaseMark /> : null}{account}</span>;
}

function displayCategory(category?: string | null) {
  if (!category || /needs review|uncategor/i.test(category)) return 'Uncategorized';
  return category;
}

function formatDetailDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TransactionDetailModal({ transaction, properties, units, transactions, onClose, onEdit, onSaved, onArchived, onArchiveFailed, back = false }: {
  transaction: EditableTx;
  properties: Property[];
  units: Unit[];
  transactions: Transaction[];
  onClose: () => void;
  onEdit: () => void;
  back?: boolean;
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
  const statusKey = current.status === 'pending' ? 'pending' : needsReview || (payout && !payout.confirmed) ? 'review' : 'confirmed';
  const status = statusKey === 'pending' ? 'Pending' : statusKey === 'review' ? 'Needs review' : 'Confirmed';
  const imported = current.source === 'plaid';
  const account = imported ? `${current.source_institution || 'Bank'}${current.source_account_mask ? ` ••••${current.source_account_mask}` : ''}` : '';
  const chase = imported && /chase/i.test(current.source_institution || '');
  const importStatus = current.source_connection_status === 'unlinked' ? 'Unlinked account' : imported ? 'Imported' : current.source === 'recurring' ? 'Recurring' : 'Entered manually';
  const heroAmount = payout ? payout.net : Number(current.amount || 0);
  const categoryLabel = displayCategory(current.category);
  const when = formatDetailDate(current.transaction_date);
  const where = property ? shortPropertyName(property.address) : 'Portfolio';

  useEffect(() => { setCurrent(transaction); }, [transaction]);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  return <div className="quick-add-overlay transaction-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="transaction-detail-panel" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
      <header className="transaction-detail-head">
        <h2 id="transaction-detail-title">Transaction details</h2>
        <button className="icon-close" type="button" onClick={onClose} aria-label={back ? 'Back' : 'Close'}>{back ? <ChevronLeft size={19} /> : <X size={19} />}</button>
      </header>
      <div className="transaction-detail-summary">
        <div className="transaction-detail-summary-top">
          <strong className={heroAmount > 0.5 ? 'amount-positive' : heroAmount < -0.5 ? 'amount-negative' : ''}>{signed(heroAmount)}</strong>
          <span className="transaction-status-chip" data-status={statusKey}>{status}</span>
        </div>
        <span>{categoryLabel}</span>
        <span>{when} · {where}{unit?.unit_number ? ` · ${unit.unit_number}` : ''}</span>
        {account && <span className="transaction-detail-bank"><AccountLine chase={chase} account={account} /></span>}
      </div>
      {payout && <section className="transaction-payout-card">
        <h3>Payout breakdown</h3>
        <dl className="transaction-payout">
          <div><dt>Gross rent</dt><dd className="amount-positive">{signed(payout.gross)}</dd></div>
          {payout.fee > 0.5 && <div><dt>Management fee</dt><dd className="amount-negative">{signed(-payout.fee)}</dd></div>}
          {payout.deductions.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className="amount-negative">{signed(-row.amount)}</dd></div>)}
          <div className="is-net"><dt>Net deposit</dt><dd>{signed(payout.net)}</dd></div>
        </dl>
        {!payout.confirmed && <button type="button" className="product-secondary-button" disabled={saving} onClick={() => void confirmBreakdown()}>{saving ? 'Confirming…' : 'Confirm breakdown'}</button>}
      </section>}
      {error && <div className="quick-add-error">{error}</div>}
      <dl className="transaction-facts">
        <div><dt>Property</dt><dd>{property?.address || 'Portfolio'}{unit?.unit_number ? ` · ${unit.unit_number}` : ''}</dd></div>
        <div><dt>Category</dt><dd>{categoryLabel}</dd></div>
        {current.description ? <div><dt>Description</dt><dd>{current.description}</dd></div> : null}
        {account && <div><dt>Account</dt><dd><AccountLine chase={chase} account={account} /></dd></div>}
        {imported && <div><dt>Imported date</dt><dd>{when}</dd></div>}
        <div><dt>Source</dt><dd>{importStatus}</dd></div>
      </dl>
      <div className="transaction-detail-footer">
        <button type="button" className="quick-add-submit" onClick={onEdit}>Edit transaction</button>
        <button type="button" className="transaction-detail-delete" disabled={saving} onClick={() => void archive()}>Delete transaction</button>
      </div>
    </div>
  </div>;
}

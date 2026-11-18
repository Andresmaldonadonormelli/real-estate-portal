'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';
import PageSkeleton from '@/components/common/PageSkeleton';
import { ProductSelect } from '@/components/common/ProductControls';
import { ACCOUNTING_CATEGORIES } from '@/lib/accounting';
import { describeRuleAssignment, describeRuleMatch, type TransactionRule } from '@/lib/transactionRules';
import type { Property } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Modal as UiModal } from '@/components/ui/Modal';

const RULE_FIELDS = 'id,user_id,enabled,match_text,match_direction,match_account_mask,match_property_id,assign_category,assign_property_id,created_from_transaction_id,created_at,updated_at,archived_at';

export default function RulesTab({ properties }:{ properties: Property[] }) {
  const { user } = useAuth();
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<TransactionRule | null>(null);
  const [saving, setSaving] = useState(false);

  const propertyName = useMemo(() => {
    const map = new Map(properties.map(property => [property.id, property.address]));
    return (id?: string | null) => (id ? map.get(id) || null : null);
  }, [properties]);

  const [setupNeeded, setSetupNeeded] = useState(false);

  async function loadRules() {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    setSetupNeeded(false);
    const result = await supabase.from('transaction_rules').select(RULE_FIELDS).eq('user_id', user.id).is('archived_at', null).order('created_at', { ascending: false });
    if (result.error) {
      if (/transaction_rules|schema cache|does not exist/i.test(result.error.message)) setSetupNeeded(true);
      else setError(result.error.message);
      setRules([]);
    } else setRules((result.data || []) as TransactionRule[]);
    setLoading(false);
  }

  useEffect(() => { void loadRules(); }, [user?.id]);

  async function toggleEnabled(rule: TransactionRule) {
    const next = !rule.enabled;
    setRules(rows => rows.map(row => row.id === rule.id ? { ...row, enabled: next } : row));
    const result = await supabase.from('transaction_rules').update({ enabled: next, updated_at: new Date().toISOString() }).eq('id', rule.id);
    if (result.error) {
      setRules(rows => rows.map(row => row.id === rule.id ? { ...row, enabled: rule.enabled } : row));
      setError(result.error.message);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    const result = await supabase.from('transaction_rules').update({
      match_text: editing.match_text.trim().toLowerCase(),
      match_direction: editing.match_direction,
      match_account_mask: editing.match_account_mask?.replace(/\D/g, '') || null,
      match_property_id: editing.match_property_id || null,
      assign_category: editing.assign_category,
      assign_property_id: editing.assign_property_id || null,
      enabled: editing.enabled,
      updated_at: new Date().toISOString(),
    }).eq('id', editing.id);
    if (result.error) setError(result.error.message);
    else {
      setEditing(null);
      await loadRules();
    }
    setSaving(false);
  }

  if (loading) return <PageSkeleton variant="ledger" />;
  if (setupNeeded) {
    return <div className="ledger-v230-tab ledger-rules-tab">
      <div className="ledger-empty-state">
        <strong>Database setup needed</strong>
        <span>Run <code>V247_TRANSACTION_RULES.sql</code> once in the Supabase SQL Editor, then refresh this page.</span>
      </div>
    </div>;
  }
  if (error && !rules.length) return <div className="ledger-open-empty" style={{ color: 'var(--danger)' }}>{error}</div>;

  return <div className="ledger-v230-tab ledger-rules-tab">
    {error && <div className="ledger-rules-error">{error}</div>}
    <div className="ledger-rules-intro">
      <strong>Transaction rules</strong>
      <span>Match bank account, direction, and payee. Amount and date can vary. Changes apply to future imports only.</span>
    </div>
    {!rules.length ? (
      <div className="ledger-empty-state">
        <strong>No rules yet</strong>
        <span>When you categorize a bank transaction, choose Apply to future matches to create one.</span>
      </div>
    ) : (
      <div className="ledger-rules-list">
        {rules.map(rule => {
          const matchProperty = propertyName(rule.match_property_id) || propertyName(rule.assign_property_id);
          return <article key={rule.id} className={`ledger-rule-row ${rule.enabled ? '' : 'is-disabled'}`}>
            <div className="ledger-rule-copy">
              <strong>{describeRuleMatch(rule, matchProperty)}</strong>
              <span>{describeRuleAssignment(rule, propertyName(rule.assign_property_id))}</span>
            </div>
            <div className="ledger-rule-actions">
              <button type="button" className={`ledger-rule-toggle ${rule.enabled ? 'active' : ''}`} aria-pressed={rule.enabled} onClick={() => void toggleEnabled(rule)}>
                {rule.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button type="button" className="ledger-rule-edit" onClick={() => setEditing(rule)}>Edit</button>
            </div>
          </article>;
        })}
      </div>
    )}

    {editing && <UiModal title="Edit rule" onClose={() => setEditing(null)}>
      <form className="ledger-rule-form" onSubmit={saveEdit}>
        <label>Match text<input required value={editing.match_text} onChange={e => setEditing({ ...editing, match_text: e.target.value })} /></label>
        <ProductSelect label="Direction" value={editing.match_direction} onChange={e => setEditing({ ...editing, match_direction: e.target.value as 'incoming' | 'outgoing' })}>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </ProductSelect>
        <label>Account mask <em>(optional)</em><input value={editing.match_account_mask || ''} onChange={e => setEditing({ ...editing, match_account_mask: e.target.value || null })} placeholder="Last 4 digits" /></label>
        <ProductSelect label="Match property" value={editing.match_property_id || ''} onChange={e => setEditing({ ...editing, match_property_id: e.target.value || null })}>
          <option value="">Any / account-mapped</option>
          {properties.map(property => <option key={property.id} value={property.id}>{property.address}</option>)}
        </ProductSelect>
        <ProductSelect label="Assign category" value={editing.assign_category} onChange={e => setEditing({ ...editing, assign_category: e.target.value })}>
          {ACCOUNTING_CATEGORIES.filter(category => category !== 'Needs Review' && category !== 'Uncategorized Inflow').map(category => <option key={category}>{category}</option>)}
        </ProductSelect>
        <ProductSelect label="Assign property" value={editing.assign_property_id || ''} onChange={e => setEditing({ ...editing, assign_property_id: e.target.value || null })}>
          <option value="">Keep imported property</option>
          {properties.map(property => <option key={property.id} value={property.id}>{property.address}</option>)}
        </ProductSelect>
        <label className="review-check">
          <input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />
          <span><strong>Enabled</strong><small>Disabled rules stop matching future imports.</small></span>
        </label>
        <div className="transaction-rule-preview" aria-live="polite">
          <div><span>Will match</span><strong>{describeRuleMatch(editing, propertyName(editing.match_property_id) || propertyName(editing.assign_property_id))}</strong></div>
          <div><span>Will assign</span><strong>{describeRuleAssignment(editing, propertyName(editing.assign_property_id))}</strong></div>
        </div>
        <Button disabled={saving} type="submit">{saving ? 'Saving…' : 'Save rule'}</Button>
      </form>
    </UiModal>}
  </div>;
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StatCard from '@/components/common/StatCard';
import { supabase } from '@/lib/supabase';
import { calculatePortfolioStats, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency } from '@/lib/formatters';
import type { Property, Unit, Transaction } from '@/lib/types';

export default function Dashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError('You are not signed in.');
      setLoading(false);
      return;
    }

    const [p, u, t] = await Promise.all([
      supabase.from('properties').select('*').order('address'),
      supabase.from('units').select('*').order('unit_number'),
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }),
    ]);
    const err = p.error || u.error || t.error;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const props = (p.data || []) as Property[];
    const unitRows = (u.data || []) as Unit[];
    let txRows = (t.data || []) as Transaction[];

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const firstOfMonth = `${month}-01`;
    const inserts: Record<string, unknown>[] = [];

    // If a real/imported rent already exists for the month, remove any stale recurring pending suggestion.
    const stalePendingIds = txRows.filter((pending) =>
      pending.status === 'pending' &&
      pending.category === 'Rent' &&
      pending.source === 'recurring' &&
      txRows.some((posted) =>
        posted.id !== pending.id &&
        posted.unit_id === pending.unit_id &&
        posted.category === 'Rent' &&
        posted.type === 'income' &&
        posted.transaction_date.startsWith(month) &&
        (posted.status || 'posted') === 'posted'
      )
    ).map((tx) => tx.id);
    if (stalePendingIds.length) {
      await supabase.from('transactions').delete().in('id', stalePendingIds);
      txRows = txRows.filter((tx) => !stalePendingIds.includes(tx.id));
    }

    for (const unit of unitRows) {
      if (!unit.occupied || unit.recurring_rent_enabled === false || Number(unit.current_rent || 0) <= 0) continue;
      const alreadyHasRent = txRows.some((tx) =>
        tx.unit_id === unit.id &&
        tx.category === 'Rent' &&
        tx.type === 'income' &&
        tx.transaction_date.startsWith(month) &&
        (tx.status || 'posted') === 'posted'
      );
      if (alreadyHasRent) continue;
      inserts.push({
        user_id: auth.user.id,
        property_id: unit.property_id,
        unit_id: unit.id,
        transaction_date: firstOfMonth,
        type: 'income',
        category: 'Rent',
        description: `${unit.unit_number} rent`,
        payee_source: unit.tenant_name || null,
        amount: Number(unit.current_rent),
        notes: 'Recurring rent awaiting confirmation',
        source: 'recurring',
        status: 'pending',
        import_key: `recurring-rent:${unit.id}:${month}`,
      });
    }

    for (const property of props) {
      const payment = Number(property.monthly_mortgage_payment || 0);
      if (payment <= 0) continue;
      const alreadyHasMortgage = txRows.some((tx) =>
        tx.property_id === property.id &&
        tx.category === 'Mortgage' &&
        tx.type === 'expense' &&
        tx.transaction_date.startsWith(month) &&
        (tx.status || 'posted') === 'posted'
      );
      if (alreadyHasMortgage) continue;
      inserts.push({
        user_id: auth.user.id,
        property_id: property.id,
        unit_id: null,
        transaction_date: firstOfMonth,
        type: 'expense',
        category: 'Mortgage',
        description: 'Monthly mortgage payment',
        payee_source: null,
        amount: -Math.abs(payment),
        notes: 'Recurring monthly mortgage',
        source: 'recurring',
        status: 'posted',
        confirmed_at: new Date().toISOString(),
        import_key: `recurring-mortgage:${property.id}:${month}`,
      });
    }

    if (inserts.length) {
      const { error: insertError } = await supabase
        .from('transactions')
        .upsert(inserts, { onConflict: 'user_id,import_key', ignoreDuplicates: true });
      if (insertError) {
        setError(insertError.message);
      } else {
        const refreshed = await supabase.from('transactions').select('*').order('transaction_date', { ascending: false });
        if (!refreshed.error) txRows = (refreshed.data || []) as Transaction[];
      }
    }

    setProperties(props);
    setUnits(unitRows);
    setTransactions(txRows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmRent(tx: Transaction) {
    if ((tx.status || 'posted') !== 'pending') return;
    setConfirming(tx.id);
    setError('');
    const property = properties.find((p) => p.id === tx.property_id);
    const feePercent = Number(property?.management_fee_percent || 0);

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'posted', confirmed_at: new Date().toISOString(), notes: 'Recurring rent confirmed received' })
      .eq('id', tx.id)
      .eq('status', 'pending');

    if (updateError) {
      setError(updateError.message);
      setConfirming(null);
      return;
    }

    if (feePercent > 0) {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const fee = Math.round(Math.abs(Number(tx.amount)) * (feePercent / 100) * 100) / 100;
        const { error: feeError } = await supabase.from('transactions').upsert({
          user_id: auth.user.id,
          property_id: tx.property_id,
          unit_id: tx.unit_id || null,
          transaction_date: tx.transaction_date,
          type: 'expense',
          category: 'Management Fee',
          description: `Management fee (${feePercent}%)`,
          payee_source: 'Property manager',
          amount: -fee,
          notes: `Automatically created when rent was confirmed. Rate: ${feePercent}%`,
          source: 'recurring',
          status: 'posted',
          confirmed_at: new Date().toISOString(),
          import_key: `management-fee:${tx.id}`,
        }, { onConflict: 'user_id,import_key', ignoreDuplicates: true });
        if (feeError) setError(feeError.message);
      }
    }

    await load();
    setConfirming(null);
  }

  async function confirmAllRent() {
    const pending = transactions.filter((t) => t.status === 'pending' && t.category === 'Rent');
    for (const tx of pending) await confirmRent(tx);
  }

  const stats = useMemo(() => calculatePortfolioStats(properties, units, transactions), [properties, units, transactions]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const postedThisMonth = useMemo(() => transactions.filter((t) => t.transaction_date.startsWith(currentMonth) && (t.status || 'posted') === 'posted'), [transactions, currentMonth]);
  const monthlyTotals = useMemo(() => calculateMonthlyTotals(postedThisMonth), [postedThisMonth]);
  const pendingRents = useMemo(() => transactions.filter((t) => t.status === 'pending' && t.category === 'Rent').sort((a,b) => a.transaction_date.localeCompare(b.transaction_date)), [transactions]);
  const propertyMap = useMemo(() => Object.fromEntries(properties.map(p => [p.id, p])), [properties]);
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500 }}>Dashboard</h1>
        <Link href="/ledger" style={{ color: 'var(--accent)', fontSize: 14 }}>Open ledger →</Link>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {loading ? <p>Loading…</p> : (
        <>
          {pendingRents.length > 0 && (
            <section className="card" style={{ padding: 20, marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: 19, fontWeight: 600 }}>Needs confirmation</h2>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>{pendingRents.length} rent payment{pendingRents.length === 1 ? '' : 's'} waiting for you to confirm.</div>
                </div>
                {pendingRents.length > 1 && <button onClick={confirmAllRent} style={primaryButton}>Confirm all received</button>}
              </div>
              <div style={{ display: 'grid', gap: 9 }}>
                {pendingRents.map(tx => {
                  const property = propertyMap[tx.property_id];
                  const unit = tx.unit_id ? unitMap[tx.unit_id] : undefined;
                  return <div key={tx.id} style={{ borderTop: '1px solid var(--border-color)', paddingTop: 11, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                    <div>
                      <strong>{property?.address || 'Property'} · {unit?.unit_number || 'Unit'}</strong>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{unit?.tenant_name || 'Tenant'} · {formatCurrency(tx.amount)} · Management fee {property?.management_fee_percent || 0}% when confirmed</div>
                    </div>
                    <button onClick={() => confirmRent(tx)} disabled={confirming === tx.id} style={primaryButton}>{confirming === tx.id ? 'Confirming…' : 'Confirm received'}</button>
                  </div>;
                })}
              </div>
            </section>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Properties" value={stats.totalProperties} />
            <StatCard label="Occupied Units" value={`${stats.occupiedUnits}/${stats.totalUnits}`} />
            <StatCard label="Vacant Units" value={stats.vacantUnits} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
            <StatCard label="Income This Month" value={formatCurrency(monthlyTotals.income)} color="accent" />
            <StatCard label="Expenses This Month" value={formatCurrency(monthlyTotals.expense)} color="danger" />
            <StatCard label="Net Cash Flow" value={formatCurrency(monthlyTotals.net)} color={monthlyTotals.net >= 0 ? 'accent' : 'danger'} />
            <StatCard label="Mortgage Balance" value={formatCurrency(stats.totalMortgageBalance)} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 19, fontWeight: 600 }}>Properties</h2>
            <Link href="/properties" style={{ color: 'var(--accent)', fontSize: 14 }}>Manage properties →</Link>
          </div>

          {properties.length === 0 ? (
            <div className="card" style={{ padding: 24, marginBottom: 32 }}>
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>Your portfolio is empty</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>Add a property, then start entering rent and expenses.</p>
              <Link href="/properties" style={{ display: 'inline-block', padding: '10px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 8 }}>Add property</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
              {properties.map(property => {
                const propertyUnits = units.filter(u => u.property_id === property.id);
                const propertyTx = postedThisMonth.filter(t => t.property_id === property.id);
                const pTotals = calculateMonthlyTotals(propertyTx);
                return (
                  <div key={property.id} className="card" style={{ padding: 18 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 17, marginBottom: 4 }}>{property.address}</h3>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{property.city}, {property.state} · {propertyUnits.filter(u => u.occupied).length}/{propertyUnits.length || 0} occupied</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>This month</div>
                        <strong style={{ color: pTotals.net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{formatCurrency(pTotals.net)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h2 style={{ fontSize: 19, marginBottom: 14, fontWeight: 600 }}>Recent Activity</h2>
          <div className="card" style={{ overflowX: 'auto' }}>
            {postedThisMonth.length === 0 && transactions.filter(t => (t.status || 'posted') === 'posted').length === 0 ? <div style={{ padding: 20, color: 'var(--text-secondary)' }}>No transactions yet.</div> : (
              <table>
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>{transactions.filter(tx => (tx.status || 'posted') === 'posted').slice(0, 8).map(tx => <tr key={tx.id}><td>{tx.transaction_date}</td><td>{tx.description}</td><td style={{ textAlign: 'right', color: tx.type === 'income' ? 'var(--accent)' : tx.type === 'expense' ? 'var(--danger)' : 'var(--text-secondary)' }}>{tx.type === 'expense' ? '-' : ''}{formatCurrency(Math.abs(tx.amount))}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const primaryButton: React.CSSProperties = { padding: '10px 14px', border: 0, borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' };
const errorBox: React.CSSProperties = { padding: 12, color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, marginBottom: 18 };

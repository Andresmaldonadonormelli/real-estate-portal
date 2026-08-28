'use client';

import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [p, u, t] = await Promise.all([
        supabase.from('properties').select('*').order('address'),
        supabase.from('units').select('*').order('unit_number'),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }),
      ]);
      const err = p.error || u.error || t.error;
      if (err) setError(err.message);
      else {
        setProperties((p.data || []) as Property[]);
        setUnits((u.data || []) as Unit[]);
        setTransactions((t.data || []) as Transaction[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => calculatePortfolioStats(properties, units, transactions), [properties, units, transactions]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyTotals = useMemo(() => calculateMonthlyTotals(transactions.filter((t) => t.transaction_date.startsWith(currentMonth))), [transactions, currentMonth]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500 }}>Dashboard</h1>
        <Link href="/ledger" style={{ color: 'var(--accent)', fontSize: 14 }}>Open ledger →</Link>
      </div>

      {error && <div style={{ padding: 12, color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, marginBottom: 18 }}>{error}</div>}
      {loading ? <p>Loading…</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Portfolio Value" value={formatCurrency(stats.totalPortfolioValue)} />
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
                const propertyTx = transactions.filter(t => t.property_id === property.id && t.transaction_date.startsWith(currentMonth));
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
            {transactions.length === 0 ? <div style={{ padding: 20, color: 'var(--text-secondary)' }}>No transactions yet.</div> : (
              <table>
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>{transactions.slice(0, 8).map(tx => <tr key={tx.id}><td>{tx.transaction_date}</td><td>{tx.description}</td><td style={{ textAlign: 'right', color: tx.type === 'income' ? 'var(--accent)' : tx.type === 'expense' ? 'var(--danger)' : 'var(--text-secondary)' }}>{tx.type === 'expense' ? '-' : ''}{formatCurrency(Math.abs(tx.amount))}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

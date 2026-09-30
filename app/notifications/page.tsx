'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import Toast from '@/components/common/Toast';
import { NotificationFeed } from '@/components/dashboard/NotificationFeed';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import TransactionDetailModal from '@/components/transactions/TransactionDetailModal';
import { resolveNotificationTransaction } from '@/lib/notificationMatch';
import type { FeedNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { cachedSupabaseRequest, historyStart, invalidateSupabaseCache, PROPERTY_FIELDS, TRANSACTION_FIELDS, UNIT_FIELDS } from '@/lib/supabaseData';
import type { Property, Transaction, Unit } from '@/lib/types';

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTransaction, setActiveTransaction] = useState<Transaction | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const [propertyResult, unitResult, transactionResult] = await Promise.all([
      cachedSupabaseRequest('shared:properties', async () => await supabase.from('properties').select(PROPERTY_FIELDS).is('archived_at', null).order('address')),
      cachedSupabaseRequest('dashboard:units', async () => await supabase.from('units').select(`${UNIT_FIELDS},lease_end_date`).is('archived_at', null).order('unit_number')),
      cachedSupabaseRequest('dashboard:transactions', async () => await supabase.from('transactions').select(TRANSACTION_FIELDS).is('archived_at', null).gte('transaction_date', historyStart(121)).order('transaction_date', { ascending: false })),
    ]);
    if (!propertyResult.error) setProperties((propertyResult.data || []) as Property[]);
    if (!unitResult.error) setUnits((unitResult.data || []) as Unit[]);
    if (!transactionResult.error) setTransactions((transactionResult.data || []) as Transaction[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/');
  }

  async function openNotification(item: FeedNotification) {
    if (item.group === 'transaction') {
      const match = await resolveNotificationTransaction(item.transactionId, transactions);
      if (!match) {
        setToast('This transaction is no longer available.');
        return;
      }
      setDetailEditing(false);
      setActiveTransaction(match);
      return;
    }
    if (!item.propertyId) {
      setToast('This property is no longer available.');
      return;
    }
    router.push(`/properties/${item.propertyId}?tab=units`);
  }

  return (
    <div className="notifications-page">
      <header className="notifications-page-bar">
        <button type="button" className="notifications-back" aria-label="Back" onClick={goBack}><ArrowLeft size={22} strokeWidth={1.75} /></button>
        <h1>Alerts</h1>
      </header>
      <NotificationFeed onOpen={item => { void openNotification(item); }} />
      {activeTransaction && !detailEditing && (
        <TransactionDetailModal
          back
          transaction={activeTransaction}
          properties={properties}
          units={units}
          transactions={transactions}
          onClose={() => { setActiveTransaction(null); setDetailEditing(false); }}
          onEdit={() => setDetailEditing(true)}
          onSaved={async (message) => { invalidateSupabaseCache(); await load(); setToast(message || 'Transaction updated'); }}
          onArchived={async (message, id, phase) => {
            const archivedId = id || activeTransaction.id;
            if (phase !== 'complete' && archivedId) setTransactions(rows => rows.filter(row => row.id !== archivedId));
            if (phase === 'complete') { invalidateSupabaseCache(); setToast(message || 'Transaction deleted'); }
          }}
          onArchiveFailed={(tx, error) => { setTransactions(rows => rows.some(row => row.id === tx.id) ? rows : [tx, ...rows]); setToast(error); invalidateSupabaseCache(); }}
        />
      )}
      {activeTransaction && detailEditing && (
        <AddTransactionModal
          userId={user.id}
          properties={properties}
          units={units}
          transaction={activeTransaction}
          onClose={() => setDetailEditing(false)}
          onSaved={async (message) => { invalidateSupabaseCache(); await load(); setToast(message || 'Transaction updated'); setActiveTransaction(null); setDetailEditing(false); }}
          onArchived={async (message, id, phase) => {
            const archivedId = id || activeTransaction.id;
            if (phase !== 'complete' && archivedId) setTransactions(rows => rows.filter(row => row.id !== archivedId));
            if (phase === 'complete') { invalidateSupabaseCache(); setToast(message || 'Transaction deleted'); }
          }}
          onArchiveFailed={(tx, error) => { setTransactions(rows => rows.some(row => row.id === tx.id) ? rows : [tx, ...rows]); setToast(error); invalidateSupabaseCache(); }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

import type { Transaction } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TRANSACTION_FIELDS } from '@/lib/supabaseData';

/** Open the transaction a notification already points at. */
export async function resolveNotificationTransaction(transactionId: string | null | undefined, transactions: Transaction[]) {
  if (!transactionId) return null;
  const local = transactions.find(transaction => transaction.id === transactionId && !transaction.archived_at);
  if (local) return local;
  const result = await supabase.from('transactions').select(TRANSACTION_FIELDS).eq('id', transactionId).is('archived_at', null).maybeSingle();
  if (result.error || !result.data) return null;
  return result.data as Transaction;
}

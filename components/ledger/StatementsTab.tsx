'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PageSkeleton from '@/components/common/PageSkeleton';
import { calculateMonthlyTotals, groupTransactionsByMonth } from '@/lib/calculations';
import { formatCurrency, formatMonthYear } from '@/lib/formatters';
import type { Transaction } from '@/lib/types';

export default function StatementsTab({ selectedPropertyId }:{ selectedPropertyId:string }) {
  const [transactions,setTransactions]=useState<Transaction[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{(async()=>{
    setLoading(true); setError('');
    let q=supabase.from('transactions').select('*').order('transaction_date',{ascending:false});
    if(selectedPropertyId) q=q.eq('property_id',selectedPropertyId);
    const {data,error}=await q;
    if(error)setError(error.message); else setTransactions((data||[]) as Transaction[]);
    setLoading(false);
  })();},[selectedPropertyId]);

  const months=useMemo(()=>Object.entries(groupTransactionsByMonth(transactions)).sort(([a],[b])=>b.localeCompare(a)).map(([key,txs])=>{
    const totals=calculateMonthlyTotals(txs);
    return {key,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),count:txs.length,...totals};
  }),[transactions]);

  if(loading)return <PageSkeleton variant="ledger"/>;
  if(error)return <div style={{padding:12,color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:8}}>{error}</div>;
  if(!months.length)return <div className="card" style={{padding:28,color:'var(--text-secondary)'}}>No statement data yet. Statements will populate from your ledger transactions.</div>;
  return <div style={{display:'grid',gap:10}}>{months.map(m=><div className="card" key={m.key} style={{padding:18,display:'grid',gridTemplateColumns:'minmax(0,1fr) repeat(3,minmax(100px,auto))',gap:18,alignItems:'center'}}>
    <div><div style={{fontWeight:650,fontSize:17}}>{formatMonthYear(m.year,m.month)}</div><div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>{m.count} transactions</div></div>
    <Metric label="Income" value={formatCurrency(m.income)} /><Metric label="Expenses" value={formatCurrency(m.expense)} /><Metric label="Net" value={formatCurrency(m.net)} strong />
  </div>)}</div>;
}
function Metric({label,value,strong=false}:{label:string;value:string;strong?:boolean}){return <div style={{textAlign:'right'}}><div style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:.4}}>{label}</div><div style={{fontWeight:strong?700:550,marginTop:3}}>{value}</div></div>}

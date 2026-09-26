'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

export type RecentActivityItem={id:string;title:string;detail:string;meta?:string;date?:string;amount:number;type:'income'|'expense'|'transfer';href:string;vendor?:string;property?:string;category?:string};

export default function RecentActivity({items,ledgerHref='/ledger',onOpenTransaction,showLedgerLink=true,variant='list'}:{items:RecentActivityItem[];ledgerHref?:string;onOpenTransaction?:(id:string)=>void;showLedgerLink?:boolean;variant?:'list'|'table'}){
  const router=useRouter();
  const open=(item:RecentActivityItem)=>onOpenTransaction?onOpenTransaction(item.id):router.push(item.href);
  if(variant==='table'){
    const rows=items.slice(0,5);
    return <section className="dashboard-module dashboard-tx"><div className="dashboard-tx-heading"><h2>Recent transactions</h2>{showLedgerLink&&<Link href={ledgerHref} className="dashboard-tx-all">View all transactions<ChevronRight size={16} aria-hidden="true"/></Link>}</div>{rows.length?<table className="dashboard-tx-table"><thead><tr><th>Vendor</th><th>Property</th><th>Description</th><th>Date</th><th>Amount</th></tr></thead><tbody>{rows.map(item=><tr key={item.id} tabIndex={0} onClick={()=>open(item)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open(item)}}}><td data-label="Vendor">{item.vendor||item.title}</td><td data-label="Property">{item.property||item.detail}</td><td data-label="Description">{item.category||item.meta||item.title}</td><td data-label="Date">{item.date||'—'}</td><td data-label="Amount" className={item.type==='income'?'amount-positive':item.type==='expense'?'amount-negative':''}>{item.type==='expense'?'-':item.type==='income'?'+':''}{formatCurrency(Math.abs(item.amount))}</td></tr>)}</tbody></table>:<p className="dashboard-empty">No recent transactions.</p>}</section>;
  }
  return <section className="pulse-activity-section"><div className="pulse-section-title"><h2>Recent transactions</h2>{showLedgerLink&&<Link href={ledgerHref}>View transactions</Link>}</div><div className="recent-activity-feed"><div className="recent-activity-list">{items.slice(0,6).map(item=><button type="button" className="recent-activity-row" key={item.id} onClick={()=>open(item)}><div className="recent-activity-copy"><strong>{item.title}</strong><span>{item.detail}</span>{item.meta&&<span className="recent-activity-meta">{item.meta}</span>}</div><div className="recent-activity-right"><strong className={item.type==='income'?'amount-positive':item.type==='expense'?'amount-negative':''}>{item.type==='expense'?'-':''}{formatCurrency(Math.abs(item.amount))}</strong>{item.date&&<small>{item.date}</small>}</div></button>)}</div></div></section>;
}

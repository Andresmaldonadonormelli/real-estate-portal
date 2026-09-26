'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters';

export type RecentActivityItem={id:string;title:string;detail:string;meta?:string;date?:string;amount:number;type:'income'|'expense'|'transfer';href:string};

export default function RecentActivity({items,ledgerHref='/ledger',onOpenTransaction,showLedgerLink=true}:{items:RecentActivityItem[];ledgerHref?:string;onOpenTransaction?:(id:string)=>void;showLedgerLink?:boolean}){
  const router=useRouter();
  return <section className="pulse-activity-section"><div className="pulse-section-title"><h2>Recent transactions</h2>{showLedgerLink&&<Link href={ledgerHref}>View transactions</Link>}</div><div className="recent-activity-feed"><div className="recent-activity-list">{items.slice(0,6).map(item=><button type="button" className="recent-activity-row" key={item.id} onClick={()=>onOpenTransaction?onOpenTransaction(item.id):router.push(item.href)}><div className="recent-activity-copy"><strong>{item.title}</strong><span>{item.detail}</span>{item.meta&&<span className="recent-activity-meta">{item.meta}</span>}</div><div className="recent-activity-right"><strong className={item.type==='income'?'amount-positive':item.type==='expense'?'amount-negative':''}>{item.type==='expense'?'-':''}{formatCurrency(Math.abs(item.amount))}</strong>{item.date&&<small>{item.date}</small>}</div></button>)}</div></div></section>;
}

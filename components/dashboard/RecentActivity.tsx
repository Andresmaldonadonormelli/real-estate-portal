'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters';

export type RecentActivityItem={id:string;title:string;detail:string;amount:number;type:'income'|'expense'|'transfer';href:string};

export default function RecentActivity({items,ledgerHref='/ledger'}:{items:RecentActivityItem[];ledgerHref?:string}){
  const router=useRouter();
  return <section className="pulse-activity-section"><div className="pulse-section-title"><h2>Recent Activity</h2><Link href={ledgerHref}>Open ledger</Link></div><div className="recent-activity-feed"><div className="recent-activity-list">{items.slice(0,6).map(item=><button type="button" className="recent-activity-row" key={item.id} onClick={()=>router.push(item.href)}><div className="recent-activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><strong className={item.type==='income'?'amount-positive':item.type==='expense'?'amount-negative':''}>{item.type==='expense'?'-':''}{formatCurrency(Math.abs(item.amount))}</strong></button>)}</div></div></section>;
}

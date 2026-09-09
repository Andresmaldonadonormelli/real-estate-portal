'use client';

import { useState } from 'react';
import { categoryKey } from '@/lib/accounting';
import { formatCurrency } from '@/lib/formatters';

type Month={key:string;label:string};
type Tx={transaction_date:string;type:string;category:string;amount:number;status?:string|null};
export default function PropertyExpenseTrendsChart({months,transactions}:{months:Month[];transactions:Tx[]}){
  const expense=transactions.filter(t=>t.type==='expense'&&t.status!=='declined'&&months.some(m=>t.transaction_date.startsWith(m.key)));
  const totals=new Map<string,number>();expense.forEach(t=>totals.set(t.category,(totals.get(t.category)||0)+Math.abs(Number(t.amount||0))));
  const categories=[...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name])=>name);
  const rows=months.map(month=>({month,values:categories.map(category=>expense.filter(t=>t.category===category&&t.transaction_date.startsWith(month.key)).reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0))}));
  const max=Math.max(1,...rows.flatMap(row=>row.values));const [selected,setSelected]=useState(Math.max(0,rows.length-1));const active=rows[selected];
  const topTotal=categories.reduce((s,c)=>s+(totals.get(c)||0),0),allTotal=[...totals.values()].reduce((s,v)=>s+v,0);
  return <section className="property-expense-trends"><div className="property-section-head"><div><h2>Expense trends</h2><p>{allTotal?Math.round(topTotal/allTotal*100):0}% of expenses are represented by the top three categories.</p></div></div><div className="expense-fixed-summary"><strong>{active?.month.label||'No activity'}</strong><span>{formatCurrency(active?.values.reduce((s,v)=>s+v,0)||0)} total</span></div>{categories.length?<><div className="expense-chart-scroll"><div className="expense-chart" style={{gridTemplateColumns:`repeat(${rows.length},minmax(54px,1fr))`}}>{rows.map((row,index)=><button key={row.month.key} onClick={()=>setSelected(index)} className={selected===index?'active':''} aria-label={`Inspect ${row.month.label}`}><span className="expense-bars">{row.values.map((value,i)=><i key={categories[i]} style={{height:`${Math.max(value?4:0,value/max*100)}%`,background:`var(--category-${categoryKey(categories[i])})`}}/>)}</span><em>{row.month.label}</em></button>)}</div></div><div className="expense-chart-legend">{categories.map(category=><span key={category}><i style={{background:`var(--category-${categoryKey(category)})`}}/>{category}</span>)}</div></>:<p className="property-empty-copy">No operating expenses recorded for this period.</p>}</section>;
}

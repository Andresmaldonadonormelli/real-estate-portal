'use client';

import { Banknote, Building2, ClipboardCheck, FileText, ReceiptText } from 'lucide-react';

export type ActionCenterItem={id:string;kind:'rent'|'document'|'review';title:string;detail:string;actionLabel?:string;onSelect:()=>void};

const groups=[
  {label:'Bank activity',Icon:Banknote,match:(item:ActionCenterItem)=>item.id.includes('bank')||item.id.includes('import')},
  {label:'Accounting',Icon:ClipboardCheck,match:(item:ActionCenterItem)=>item.id.includes('category')||item.id.includes('review')},
  {label:'Rent',Icon:ReceiptText,match:(item:ActionCenterItem)=>item.kind==='rent'},
  {label:'Properties',Icon:Building2,match:(item:ActionCenterItem)=>item.kind==='review'&&!item.id.includes('bank')&&!item.id.includes('import')&&!item.id.includes('category')&&!item.id.includes('review')},
  {label:'Documents',Icon:FileText,match:(item:ActionCenterItem)=>item.kind==='document'},
];
function count(item:ActionCenterItem){const value=item.title.match(/\d+/);return value?Number(value[0]):1;}

export default function ActionCenter({items,title='Your actions',onViewAll}:{items:ActionCenterItem[];title?:string;onViewAll?:()=>void}){
  const visibleGroups=groups.map(group=>({...group,items:items.filter(group.match)})).filter(group=>group.items.length);
  return <section className="pulse-action-section shared-action-center">
    <div className="pulse-action-center">
      <div className="pulse-section-head"><h2>{title}</h2>{onViewAll&&items.length>2&&<button type="button" className="pulse-view-all" onClick={onViewAll}>See all</button>}</div>
      {visibleGroups.length?<div className="your-actions-grid">{visibleGroups.map(group=>{const Icon=group.Icon;const primary=group.items[0];return <button className="your-actions-tile" key={group.label} onClick={primary.onSelect}><Icon size={18} strokeWidth={1.8}/><span>{group.label}</span><strong>{group.items.reduce((total,item)=>total+count(item),0)}</strong></button>;})}</div>:<div className="pulse-all-clear">Everything is up to date.</div>}
    </div>
  </section>;
}

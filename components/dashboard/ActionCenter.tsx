'use client';

import { Banknote, CircleAlert, FileWarning } from 'lucide-react';

export type ActionCenterItem={id:string;kind:'rent'|'document'|'review';title:string;detail:string;actionLabel?:string;onSelect:()=>void};

function ActionIcon({kind}:{kind:ActionCenterItem['kind']}){
  const Icon=kind==='rent'?Banknote:kind==='document'?FileWarning:CircleAlert;
  return <span className="action-status-icon" data-kind={kind} aria-hidden="true"><Icon size={18} strokeWidth={1.8}/></span>;
}

export default function ActionCenter({items,title='Action Center',onViewAll}:{items:ActionCenterItem[];title?:string;onViewAll?:()=>void}){
  return <section className="pulse-action-section shared-action-center">
    <div className="pulse-action-center">
      <div className="pulse-section-head"><h2>{title}</h2>{onViewAll&&items.length>2&&<button type="button" className="pulse-view-all" onClick={onViewAll}>See all</button>}</div>
      {items.length?<div className="action-list">{items.slice(0,2).map(item=><button key={item.id} className="action-row" onClick={item.onSelect}><ActionIcon kind={item.kind}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><em className="pulse-row-action">{item.actionLabel||(item.kind==='rent'?'Confirm':'Review')}</em></button>)}</div>:<div className="pulse-all-clear">Everything is up to date.</div>}
    </div>
  </section>;
}

'use client';

import { Banknote, ClipboardCheck, FileText, ShieldCheck } from 'lucide-react';

export type ActionCenterItem={id:string;kind:'rent'|'document'|'review';title:string;detail:string;onSelect:()=>void};

function ActionIcon({item}:{item:ActionCenterItem}){
  const lower=item.title.toLowerCase();
  const Icon=item.kind==='rent'?Banknote:item.kind==='review'?ClipboardCheck:lower.includes('insurance')?ShieldCheck:FileText;
  const tone=item.kind==='rent'?'rent':item.kind==='review'?'review':lower.includes('insurance')?'insurance':'lease';
  return <span className="action-icon" data-action={tone} aria-hidden="true"><Icon size={19} strokeWidth={1.8}/></span>;
}

export default function ActionCenter({items,title='Action Center',showEyebrow=true,hideWhenEmpty=false,onViewAll,variant='default'}:{items:ActionCenterItem[];title?:string;showEyebrow?:boolean;hideWhenEmpty?:boolean;onViewAll?:()=>void;variant?:'default'|'property'}){
  if(!items.length&&hideWhenEmpty)return null;
  return <section className="pulse-action-section shared-action-center" data-variant={variant}>
    <div className="pulse-action-center">
      <div className="pulse-section-head"><div>{showEyebrow&&<span>Needs you</span>}<div className="pulse-action-title"><h2>{title}{items.length?` (${items.length})`:''}</h2></div></div>{onViewAll&&items.length>3&&<button type="button" className="pulse-view-all" onClick={onViewAll}>View all</button>}</div>
      {items.length?<div className="action-list">{items.slice(0,3).map(item=><button key={item.id} className="action-row" onClick={item.onSelect}>{variant==='default'&&<ActionIcon item={item}/>}<span><strong>{item.title}</strong><small>{item.detail}</small></span><em className="pulse-row-action">{item.kind==='rent'?'Confirm':'Review'}</em></button>)}</div>:<div className="pulse-all-clear"><strong>All clear</strong><span>No tasks need attention.</span></div>}
    </div>
  </section>;
}

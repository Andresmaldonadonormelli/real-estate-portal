'use client';

export type ActionCenterItem={id:string;kind:'rent'|'document'|'review';title:string;detail:string;actionLabel?:string;onSelect:()=>void};

export default function ActionCenter({items,onViewAll}:{items:ActionCenterItem[];onViewAll?:()=>void}){
  return <section className="pulse-action-section shared-action-center">
    <div className="pulse-action-center">
      <div className="pulse-section-head"><div className="pulse-action-title"><h2>Needs attention</h2>{items.length>0&&<span className="pulse-action-count">{items.length}</span>}</div>{onViewAll&&items.length>2&&<button type="button" className="pulse-view-all" onClick={onViewAll}>View all</button>}</div>
      {items.length?<div className="action-list">{items.slice(0,2).map(item=><button key={item.id} className="action-row" onClick={item.onSelect}><span><strong>{item.title}</strong><small>{item.detail}</small></span><em className="pulse-row-action">{item.actionLabel||(item.kind==='rent'?'Confirm':'Review')}</em></button>)}</div>:<div className="pulse-all-clear">Everything is up to date.</div>}
    </div>
  </section>;
}

'use client';

export type DocumentFeedItem={id:string;meta:string;title:string;subtext:string};

export default function DocumentFeed({items,onOpen,onDetails}:{items:DocumentFeedItem[];onOpen:(id:string)=>void;onDetails?:(id:string)=>void}){
  return <div className="document-feed">{items.map(item=><div key={item.id} className="document-feed-row">
    <button type="button" className="document-feed-copy" onClick={()=>onOpen(item.id)} aria-label={`Open ${item.title}`}>
      <span className="document-feed-meta">{item.meta}</span><strong>{item.title}</strong><span>{item.subtext}</span>
    </button>
    {onDetails&&<div className="document-feed-actions"><button type="button" className="property-secondary-action" onClick={()=>onDetails(item.id)}>Details</button></div>}
  </div>)}</div>;
}

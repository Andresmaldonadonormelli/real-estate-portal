'use client';

import { useMemo, useRef, useState } from 'react';
import { categoryKey } from '@/lib/accounting';

type Tx={transaction_date:string;type:string;category:string;amount:number;status?:string|null};

const MONTH_LABELS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CATEGORY_COLOR:Record<string,string>={
  maintenance:'var(--category-maintenance)',
  management:'var(--category-management)',
  leasing:'var(--category-management)',
  mortgage:'var(--category-mortgage)',
  'mortgage-interest':'var(--category-mortgage)',
  'mortgage-principal':'var(--category-mortgage)',
  utilities:'var(--category-utilities)',
  insurance:'var(--category-insurance)',
  taxes:'var(--category-taxes)',
  capex:'var(--category-capex)',
  legal:'var(--category-legal)',
  review:'var(--category-review)',
  distribution:'var(--category-distribution)',
  contribution:'var(--category-distribution)',
  'non-operating':'var(--category-neutral)',
  refund:'var(--category-utilities)',
  'other-income':'var(--category-rent)',
  rent:'var(--category-rent)',
  neutral:'var(--category-neutral)',
};
const FALLBACK_SERIES=['var(--category-maintenance)','var(--category-management)','var(--category-mortgage)','var(--category-utilities)'];

const wholeCurrency=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Math.round(value));
function axisMaximum(value:number){
  const withHeadroom=Math.max(0,value)*1.1;
  if(withHeadroom<=0)return 1;
  const power=10**Math.floor(Math.log10(withHeadroom));
  const normalized=withHeadroom/power;
  return (normalized<=2?2:normalized<=5?5:10)*power;
}
function compactCurrency(value:number){if(value>=1000000)return `$${(value/1000000).toFixed(value>=10000000?0:1)}M`;if(value>=1000)return `$${(value/1000).toFixed(value>=10000?0:1)}K`;return `$${Math.round(value)}`}
function colorForCategory(category:string,index:number){
  const mapped=CATEGORY_COLOR[categoryKey(category)];
  if(mapped&&mapped!=='var(--category-neutral)')return mapped;
  return FALLBACK_SERIES[index%FALLBACK_SERIES.length];
}
function monthKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}

export default function PropertyExpenseTrendsChart({transactions}:{transactions:Tx[]}){
  const [hoveredKey,setHoveredKey]=useState('');
  const [pressedKey,setPressedKey]=useState('');
  const plotRef=useRef<HTMLDivElement>(null);
  const now=useMemo(()=>new Date(),[]);

  const windowMonths=useMemo(()=>Array.from({length:12},(_,index)=>{
    const date=new Date(now.getFullYear(),now.getMonth()-(11-index),1);
    const key=monthKey(date);
    return {
      key,
      label:MONTH_LABELS[date.getMonth()],
      fullLabel:`${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
      partial:date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth(),
    };
  }),[now]);

  const windowStart=windowMonths[0].key;
  const windowExpense=useMemo(
    ()=>transactions.filter(t=>t.type==='expense'&&t.status!=='declined'&&t.transaction_date.slice(0,7)>=windowStart&&t.transaction_date.slice(0,7)<=windowMonths[11].key),
    [transactions,windowStart,windowMonths]
  );

  const totals=useMemo(()=>{
    const map=new Map<string,number>();
    windowExpense.forEach(t=>map.set(t.category,(map.get(t.category)||0)+Math.abs(Number(t.amount||0))));
    return map;
  },[windowExpense]);

  const topCategories=useMemo(()=>[...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name])=>name),[totals]);
  const topTotal=topCategories.reduce((sum,category)=>sum+(totals.get(category)||0),0);
  const allTotal=[...totals.values()].reduce((sum,value)=>sum+value,0);
  const otherTotal=Math.max(0,allTotal-topTotal);
  const legendItems=[
    ...topCategories.map((category,index)=>({key:category,label:category,color:colorForCategory(category,index)})),
    ...(otherTotal>0?[{key:'__other',label:'Other',color:'var(--category-neutral)'}]:[]),
  ];

  const rows=useMemo(()=>windowMonths.map(month=>{
    const monthRows=windowExpense.filter(t=>t.transaction_date.startsWith(month.key));
    const byCategory=new Map<string,number>();
    monthRows.forEach(t=>byCategory.set(t.category,(byCategory.get(t.category)||0)+Math.abs(Number(t.amount||0))));
    const segments=topCategories.map((category,index)=>({
      key:category,
      label:category,
      value:byCategory.get(category)||0,
      color:colorForCategory(category,index),
    }));
    const accounted=segments.reduce((sum,segment)=>sum+segment.value,0);
    const monthTotal=monthRows.reduce((sum,t)=>sum+Math.abs(Number(t.amount||0)),0);
    const other=Math.max(0,monthTotal-accounted);
    if(other>0)segments.push({key:'__other',label:'Other',value:other,color:'var(--category-neutral)'});
    return {...month,total:monthTotal,segments};
  }),[windowMonths,windowExpense,topCategories]);

  const inspectionKey=pressedKey||hoveredKey;
  const active=rows.find(row=>row.key===inspectionKey);
  const activeIndex=active?rows.findIndex(row=>row.key===active.key):-1;
  const peak=Math.max(0,...rows.map(row=>row.total));
  const axisMax=axisMaximum(peak);
  const ticks=[axisMax,axisMax/2,0];
  const rangeLabel=`${windowMonths[0].label} ${windowMonths[0].key.slice(0,4)} – ${windowMonths[11].label} ${windowMonths[11].key.slice(0,4)}`;

  function inspectPointer(event:React.PointerEvent<HTMLDivElement>){
    if(event.pointerType==='mouse'||!rows.length)return;
    const rect=plotRef.current?.getBoundingClientRect();
    if(!rect)return;
    const index=Math.max(0,Math.min(rows.length-1,Math.floor((event.clientX-rect.left)/Math.max(1,rect.width)*rows.length)));
    setPressedKey(rows[index].key);
  }
  function finishPointer(){setPressedKey('')}

  return <section className="property-expense-trends">
    <div className="property-section-head"><h2>Expense trends</h2></div>
    <p className="expense-share-copy">{allTotal?Math.round(topTotal/allTotal*100):0}% of expenses are represented by the top three categories · {rangeLabel}</p>
    {allTotal?<>
      <div className="expense-chart-legend" aria-label="Expense category legend">{legendItems.map(item=><span key={item.key}><i style={{background:item.color}} aria-hidden="true"/>{item.label}</span>)}</div>
      <div className="expense-chart" onMouseLeave={()=>setHoveredKey('')}>
        <div className="expense-axis" aria-hidden="true">{ticks.map(tick=><span key={tick}>{compactCurrency(tick)}</span>)}</div>
        <div ref={plotRef} className="expense-plot" onPointerDown={event=>{if(event.pointerType==='mouse')return;event.currentTarget.setPointerCapture(event.pointerId);inspectPointer(event)}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))inspectPointer(event)}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);finishPointer()}} onPointerCancel={finishPointer}>
          {active&&<div className="expense-inspection" data-edge={activeIndex===0?'left':activeIndex===rows.length-1?'right':'center'} style={{left:`${((activeIndex+.5)/Math.max(1,rows.length))*100}%`}}>
            <strong>{active.fullLabel}{active.partial?' · To date':''}</strong>
            {active.segments.filter(segment=>segment.value>0).map(segment=><span key={segment.key}><i style={{background:segment.color}} aria-hidden="true"/>{segment.label}<b>{wholeCurrency(segment.value)}</b></span>)}
            <em>Total <b>{wholeCurrency(active.total)}</b></em>
          </div>}
          <div className="expense-gridlines" aria-hidden="true">{ticks.map(tick=><i key={tick}/>)}</div>
          <div className="expense-chart-grid expense-chart-grid-monthly" style={{gridTemplateColumns:`repeat(${rows.length},minmax(0,1fr))`}}>
            {rows.map(row=>{
              const activeRow=active?.key===row.key;
              const stackHeight=axisMax&&row.total?Math.max(6,(row.total/axisMax)*100):0;
              const visibleSegments=row.segments.filter(segment=>segment.value>0);
              return <button key={row.key} type="button" onMouseEnter={()=>setHoveredKey(row.key)} onFocus={()=>setHoveredKey(row.key)} onBlur={()=>setHoveredKey('')} className={`${activeRow?'active':''} ${inspectionKey&&!activeRow?'is-dimmed':''}`} aria-label={`${row.fullLabel}, ${wholeCurrency(row.total)} total expenses`}>
                <span className={`expense-pillar ${activeRow?'is-active':''}`}>
                  {row.total>0&&<span className="expense-pillar-stack" style={{height:`${stackHeight}%`}}>
                    {visibleSegments.map((segment,index)=>{
                      const share=row.total?(segment.value/row.total)*100:0;
                      const isTop=index===visibleSegments.length-1;
                      return <i key={segment.key} className={isTop?'is-top-segment':''} style={{flexGrow:share,flexBasis:0,background:segment.color}} title={`${segment.label}: ${wholeCurrency(segment.value)}`}/>;
                    })}
                  </span>}
                </span>
                <em>{row.label}</em>
              </button>;
            })}
          </div>
        </div>
      </div>
    </>:<p className="property-empty-copy">No operating expenses recorded.</p>}
  </section>;
}

'use client';

import { useEffect, useId, useState } from 'react';
import type { HistoryMode, MonthlyFinancialPoint } from '@/lib/financialHistory';

export default function FinancialHistoryChart({rows,mode='cashFlow',label,onInspect}:{rows:MonthlyFinancialPoint[];mode?:HistoryMode;label:string;onInspect?:(row:MonthlyFinancialPoint|null)=>void}){
  const [selected,setSelected]=useState<number|null>(null);
  const gradientId=useId().replace(/:/g,'');
  useEffect(()=>{setSelected(null);onInspect?.(null)},[rows,mode,onInspect]);
  const width=820,height=220,pad={left:0,right:0,top:22,bottom:12};
  const innerWidth=width-pad.left-pad.right;
  const mainValues=rows.map(row=>mode==='cashFlow'?row.cashFlow:row.noi);
  const expenseValues=rows.map(row=>-(mode==='cashFlow'?row.cashExpenses:row.operatingExpenses));
  const values=[0,...mainValues,...expenseValues];
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  const chartMin=min-span*.06,chartMax=max+span*.06;
  const x=(index:number)=>pad.left+index*(innerWidth/Math.max(1,rows.length-1));
  const y=(value:number)=>pad.top+((chartMax-value)/(chartMax-chartMin))*(height-pad.top-pad.bottom);
  const mainPoints=mainValues.map((value,index)=>`${x(index)},${y(value)}`).join(' ');
  const expensePoints=expenseValues.map((value,index)=>`${x(index)},${y(value)}`).join(' ');
  const fillPoints=rows.length?`${mainPoints} ${x(rows.length-1)},${height-pad.bottom} ${x(0)},${height-pad.bottom}`:'';
  const active=selected==null?null:rows[selected];
  const activeValue=active?(mode==='cashFlow'?active.cashFlow:active.noi):0;
  const periodValue=mainValues.reduce((sum,value)=>sum+value,0);
  const mainNegative=(selected==null?periodValue:activeValue)<0;
  function inspect(event:React.PointerEvent<SVGSVGElement>){if(!rows.length)return;const rect=event.currentTarget.getBoundingClientRect();const pointer=(event.clientX-rect.left)/rect.width*width;const index=Math.max(0,Math.min(rows.length-1,Math.round((pointer-pad.left)/(innerWidth/Math.max(1,rows.length-1)))));setSelected(index);onInspect?.(rows[index])}
  function finish(){setSelected(null);onInspect?.(null)}
  return <div className="financial-history-chart-wrap"><div className="financial-history-plot">
    <svg className="financial-history-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);inspect(event)}} onPointerMove={event=>{if(event.pointerType==='mouse'||event.currentTarget.hasPointerCapture(event.pointerId))inspect(event)}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);finish()}} onPointerLeave={event=>{if(event.pointerType==='mouse')finish()}} onPointerCancel={finish}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={mainNegative?'var(--negative)':'var(--positive)'} stopOpacity=".09"/><stop offset="82%" stopColor={mainNegative?'var(--negative)':'var(--positive)'} stopOpacity="0"/></linearGradient></defs>
      {fillPoints&&<polygon points={fillPoints} fill={`url(#${gradientId})`} className="financial-history-fill"/>}
      <line x1={pad.left} x2={width-pad.right} y1={y(0)} y2={y(0)} className="financial-history-zero" vectorEffect="non-scaling-stroke"/>
      <polyline points={expensePoints} className="financial-history-expense-line" fill="none" vectorEffect="non-scaling-stroke"/>
      <polyline points={mainPoints} className={`financial-history-main-line ${mainNegative?'is-negative':'is-positive'}`} fill="none" vectorEffect="non-scaling-stroke"/>
      {selected!=null&&<line x1={x(selected)} x2={x(selected)} y1={pad.top} y2={height-pad.bottom} className="financial-history-guide" vectorEffect="non-scaling-stroke"/>}<rect x="0" y="0" width={width} height={height} className="financial-history-hit"/>
    </svg>
    {selected!=null&&<i className={`financial-history-active-dot ${mainNegative?'is-negative':'is-positive'}`} style={{left:`${(x(selected)/width)*100}%`,top:`${(y(activeValue)/height)*100}%`}}/>}
    {active&&<div className="financial-history-selection-label" data-edge={selected===0?'left':selected===rows.length-1?'right':'center'} style={{left:`${(x(selected!)/width)*100}%`}}>{active.fullLabel}</div>}
  </div><div className="financial-history-axis" style={{gridTemplateColumns:`repeat(${Math.max(1,rows.length)},minmax(0,1fr))`}} aria-hidden="true">{rows.map(row=><span key={row.key}>{row.label}</span>)}</div></div>;
}

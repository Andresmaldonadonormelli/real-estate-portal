'use client';

import { useEffect, useState } from 'react';
import type { HistoryMode, MonthlyFinancialPoint } from '@/lib/financialHistory';

export default function FinancialHistoryChart({rows,mode='cashFlow',label,onInspect}:{rows:MonthlyFinancialPoint[];mode?:HistoryMode;label:string;onInspect?:(row:MonthlyFinancialPoint|null)=>void}){
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>{setSelected(null);onInspect?.(null)},[rows,mode,onInspect]);
  const width=820,height=250,pad={top:28,bottom:14};
  const columnWidth=width/Math.max(1,rows.length);
  const mainValues=rows.map(row=>mode==='cashFlow'?row.cashFlow:row.noi);
  const expenseValues=rows.map(row=>-(mode==='cashFlow'?row.cashExpenses:row.operatingExpenses));
  const values=[0,...mainValues,...expenseValues];
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  const chartMin=min-span*.12,chartMax=max+span*.12;
  const x=(index:number)=>(index+.5)*columnWidth;
  const y=(value:number)=>pad.top+((chartMax-value)/(chartMax-chartMin))*(height-pad.top-pad.bottom);
  const mainPoints=mainValues.map((value,index)=>`${x(index)},${y(value)}`).join(' ');
  const expensePoints=expenseValues.map((value,index)=>`${x(index)},${y(value)}`).join(' ');
  const mainNegative=mainValues.reduce((sum,value)=>sum+value,0)<0;
  const active=selected==null?null:rows[selected];
  const activeValue=active?(mode==='cashFlow'?active.cashFlow:active.noi):0;

  function inspect(event:React.PointerEvent<SVGSVGElement>){
    if(!rows.length)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const pointer=(event.clientX-rect.left)/rect.width*width;
    const index=Math.max(0,Math.min(rows.length-1,Math.floor(pointer/columnWidth)));
    setSelected(index);
    onInspect?.(rows[index]);
  }

  function finish(){setSelected(null);onInspect?.(null)}

  return <div className="financial-history-chart-wrap">
    <svg className="financial-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);inspect(event);}} onPointerMove={event=>{if(event.pointerType==='mouse'||event.currentTarget.hasPointerCapture(event.pointerId))inspect(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);finish();}} onPointerLeave={event=>{if(event.pointerType==='mouse')finish();}} onPointerCancel={finish}>
      <line x1={x(0)} x2={x(rows.length-1)} y1={y(0)} y2={y(0)} className="financial-history-zero"/>
      <polyline points={expensePoints} className="financial-history-expense-line" fill="none"/>
      <polyline points={mainPoints} className={`financial-history-main-line ${mainNegative?'is-negative':'is-positive'}`} fill="none"/>
      {selected!=null&&<><line x1={x(selected)} x2={x(selected)} y1={pad.top} y2={height-pad.bottom} className="financial-history-guide"/><circle cx={x(selected)} cy={y(activeValue)} r="5" className={`financial-history-active-point ${mainNegative?'is-negative':'is-positive'}`}/></>}
      <rect x="0" y="0" width={width} height={height} className="financial-history-hit"/>
    </svg>
    {active&&<div className="financial-history-selection-label" data-edge={selected===0?'left':selected===rows.length-1?'right':'center'} style={{left:`${(x(selected!)/width)*100}%`}}>{active.fullLabel}</div>}
    <div className="financial-history-axis" style={{gridTemplateColumns:`repeat(${Math.max(1,rows.length)},minmax(0,1fr))`}} aria-hidden="true">{rows.map(row=><span key={row.key}>{row.label}</span>)}</div>
  </div>;
}

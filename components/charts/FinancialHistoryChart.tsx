'use client';

import { useEffect, useState } from 'react';
import type { HistoryMode, MonthlyFinancialPoint } from '@/lib/financialHistory';
import { formatCurrency } from '@/lib/formatters';

function compactCurrency(value:number){
  const absolute=Math.abs(value);
  if(absolute>=1000){
    const amount=absolute/1000;
    return `$${Number.isInteger(amount)?amount:amount.toFixed(1)}K`;
  }
  return formatCurrency(absolute);
}

export default function FinancialHistoryChart({rows,mode='cashFlow',label,onInspect}:{rows:MonthlyFinancialPoint[];mode?:HistoryMode;label:string;onInspect?:(row:MonthlyFinancialPoint|null)=>void}){
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>{setSelected(null);onInspect?.(null)},[rows,mode,onInspect]);

  const width=820;
  const height=276;
  const pad={left:50,right:4,top:98,bottom:10};
  const innerWidth=width-pad.left-pad.right;
  const incomeValues=rows.map(row=>row.income);
  const expenseValues=rows.map(row=>mode==='cashFlow'?row.cashExpenses:row.operatingExpenses);
  const extent=Math.max(1,...incomeValues,...expenseValues);
  const zeroY=pad.top+(height-pad.top-pad.bottom)*.48;
  const positiveHeight=zeroY-pad.top;
  const negativeHeight=height-pad.bottom-zeroY;
  const xStep=innerWidth/Math.max(1,rows.length);
  const barWidth=Math.min(26,Math.max(10,xStep*.34));
  const x=(index:number)=>pad.left+xStep*(index+.5);
  const incomeY=(value:number)=>zeroY-(value/extent)*positiveHeight;
  const expenseHeight=(value:number)=>(value/extent)*negativeHeight;
  const active=selected==null?null:rows[selected];

  function inspect(event:React.PointerEvent<SVGSVGElement>){
    if(!rows.length)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const pointer=(event.clientX-rect.left)/rect.width*width;
    const index=Math.max(0,Math.min(rows.length-1,Math.floor((pointer-pad.left)/Math.max(1,xStep))));
    setSelected(index);
    onInspect?.(rows[index]);
  }
  function finish(){setSelected(null);onInspect?.(null)}

  return <div className="financial-history-chart-wrap">
    <div className="financial-history-plot">
      <svg className="financial-history-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}
        onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);inspect(event)}}
        onPointerMove={event=>{if(event.pointerType==='mouse'||event.currentTarget.hasPointerCapture(event.pointerId))inspect(event)}}
        onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);finish()}}
        onPointerLeave={event=>{if(event.pointerType==='mouse')finish()}}
        onPointerCancel={finish}>
        <line x1={pad.left} x2={width-pad.right} y1={pad.top} y2={pad.top} className="financial-history-grid" vectorEffect="non-scaling-stroke"/>
        <line x1={pad.left} x2={width-pad.right} y1={zeroY} y2={zeroY} className="financial-history-zero" vectorEffect="non-scaling-stroke"/>
        <line x1={pad.left} x2={width-pad.right} y1={height-pad.bottom} y2={height-pad.bottom} className="financial-history-grid" vectorEffect="non-scaling-stroke"/>
        <text x="0" y={pad.top+5} className="financial-history-y-label">{compactCurrency(extent)}</text>
        <text x="0" y={zeroY+5} className="financial-history-y-label">$0</text>
        <text x="0" y={height-pad.bottom} className="financial-history-y-label">{compactCurrency(extent)}</text>
        {rows.map((row,index)=><g key={row.key}>
          <rect x={x(index)-barWidth/2} y={incomeY(incomeValues[index])} width={barWidth} height={zeroY-incomeY(incomeValues[index])} rx="2" className="financial-history-income-bar"/>
          <rect x={x(index)-barWidth/2} y={zeroY} width={barWidth} height={expenseHeight(expenseValues[index])} rx="2" className="financial-history-expense-bar"/>
        </g>)}
        {selected!=null&&<line x1={x(selected)} x2={x(selected)} y1={pad.top} y2={height-pad.bottom} className="financial-history-guide" vectorEffect="non-scaling-stroke"/>}
        <rect x={pad.left} y={pad.top} width={innerWidth} height={height-pad.top-pad.bottom} className="financial-history-hit"/>
      </svg>
      {active&&<div className="financial-history-tooltip" data-edge={selected===0?'left':selected===rows.length-1?'right':'center'} style={{left:`${(x(selected!)/width)*100}%`}}>
        <strong>{active.fullLabel}</strong><b><i>Net</i>{formatCurrency(active.cashFlow)}</b>
        <span><i><em className="financial-tooltip-long">Income</em><em className="financial-tooltip-short">In</em></i><strong>{formatCurrency(active.income)}</strong></span>
        <span><i><em className="financial-tooltip-long">Expenses</em><em className="financial-tooltip-short">Out</em></i><strong>{formatCurrency(mode==='cashFlow'?active.cashExpenses:active.operatingExpenses)}</strong></span>
      </div>}
    </div>
    <div className="financial-history-axis" style={{gridTemplateColumns:`repeat(${Math.max(1,rows.length)},minmax(0,1fr))`,paddingLeft:`${pad.left/width*100}%`,paddingRight:`${pad.right/width*100}%`}} aria-hidden="true">
      {rows.map(row=><span key={row.key}>{row.label}</span>)}
    </div>
  </div>;
}

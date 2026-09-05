'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import type { HistoryMode, MonthlyFinancialPoint } from '@/lib/financialHistory';

export default function FinancialHistoryChart({rows,mode='cashFlow',label}:{rows:MonthlyFinancialPoint[];mode?:HistoryMode;label:string}){
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>setSelected(null),[rows,mode]);
  const width=820,height=286,pad={left:22,right:22,top:22,bottom:38};
  const innerWidth=width-pad.left-pad.right;
  const mainValues=rows.map(row=>mode==='cashFlow'?row.cashFlow:row.noi);
  const expenseValues=rows.map(row=>-(mode==='cashFlow'?row.cashExpenses:row.operatingExpenses));
  const values=[0,...mainValues,...expenseValues];
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  const chartMin=min-span*.12,chartMax=max+span*.12;
  const x=(index:number)=>pad.left+index*(innerWidth/Math.max(1,rows.length-1));
  const y=(value:number)=>pad.top+((chartMax-value)/(chartMax-chartMin))*(height-pad.top-pad.bottom);
  const mainPoints=mainValues.map((value,index)=>`${x(index)},${y(value)}`).join(' ');
  const expensePoints=expenseValues.map((value,index)=>`${x(index)},${y(value)}`).join(' ');
  const active=selected==null?null:rows[selected];
  const activeValue=active?(mode==='cashFlow'?active.cashFlow:active.noi):0;
  const activeExpense=active?(mode==='cashFlow'?active.cashExpenses:active.operatingExpenses):0;

  function inspect(event:React.PointerEvent<SVGSVGElement>){
    if(!rows.length)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const pointer=(event.clientX-rect.left)/rect.width*width;
    setSelected(Math.max(0,Math.min(rows.length-1,Math.round((pointer-pad.left)/(innerWidth/Math.max(1,rows.length-1))))));
  }

  return <div className="financial-history-chart-wrap">
    <svg className="financial-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerDown={inspect} onPointerMove={event=>{if(event.pointerType==='mouse'||event.buttons===1)inspect(event);}} onPointerLeave={event=>{if(event.pointerType==='mouse')setSelected(null);}} onPointerCancel={()=>setSelected(null)}>
      <line x1={pad.left} x2={width-pad.right} y1={y(0)} y2={y(0)} className="financial-history-zero"/>
      <polyline points={expensePoints} className="financial-history-expense-line" fill="none"/>
      <polyline points={mainPoints} className="financial-history-main-line" fill="none"/>
      {selected!=null&&<><line x1={x(selected)} x2={x(selected)} y1={pad.top} y2={height-pad.bottom} className="financial-history-guide"/><circle cx={x(selected)} cy={y(activeValue)} r="5" className="financial-history-active-point"/></>}
      {rows.map((row,index)=>{const show=rows.length<=6||index%2===0||index===rows.length-1;return show?<text key={row.key} x={x(index)} y={height-9} textAnchor={index===0?'start':index===rows.length-1?'end':'middle'}>{row.label}</text>:null;})}
      <rect x="0" y="0" width={width} height={height-pad.bottom} className="financial-history-hit"/>
    </svg>
    {active&&<div className="financial-history-tooltip" data-edge={selected===0?'left':selected===rows.length-1?'right':'center'} style={{left:`${(x(selected!)/width)*100}%`}}>
      <strong>{active.fullLabel}</strong>
      <span>{mode==='cashFlow'?'Cash flow':'NOI'} <b className={activeValue>=0?'amount-positive':'amount-negative'}>{formatCurrency(activeValue)}</b></span>
      <span>Income <b className="amount-positive">{formatCurrency(active.income)}</b></span>
      <span>Expenses <b className="amount-negative">−{formatCurrency(activeExpense)}</b></span>
    </div>}
  </div>;
}

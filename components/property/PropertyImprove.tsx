'use client';

import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Gauge, LockKeyhole, Wrench } from 'lucide-react';
import type { Property, Unit } from '@/lib/types';
import { buildBreakdown, calculateMetrics, formatKpiCurrency, type PropertyTransaction as Tx } from '@/lib/propertyFinancials';

export default function PropertyImprove({property,units,transactions}:{property:Property;units:Unit[];transactions:Tx[]}){
  const now=new Date();
  const year=now.getFullYear();
  const monthsElapsed=Math.max(1,now.getMonth()+1);
  const rows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&Number(t.transaction_date.slice(0,4))===year),[transactions,year]);
  const metrics=useMemo(()=>calculateMetrics(rows),[rows]);
  const breakdown=useMemo(()=>buildBreakdown(rows),[rows]);
  const occupiedUnits=units.filter(u=>u.occupied);
  const expectedRent=occupiedUnits.reduce((sum,u)=>sum+Number(u.current_rent||0),0);
  const currentMonthly=metrics.cashFlow/monthsElapsed;
  const currentMgmt=Math.max(0,Number(property.management_fee_percent||0));
  const maintenanceYtd=breakdown.filter(x=>x.key==='maintenance').reduce((sum,x)=>sum+x.amount,0);
  const managementYtd=breakdown.filter(x=>x.key==='management'||x.key==='leasing').reduce((sum,x)=>sum+x.amount,0);
  const utilitiesYtd=breakdown.filter(x=>x.key==='utilities').reduce((sum,x)=>sum+x.amount,0);
  const otherOperatingYtd=Math.max(0,metrics.operatingExpenses-maintenanceYtd-managementYtd-utilitiesYtd);
  const maintenanceMonthly=maintenanceYtd/monthsElapsed;
  const otherOperatingMonthly=(utilitiesYtd+otherOperatingYtd)/monthsElapsed;

  const [rentIncrease,setRentIncrease]=useState(0);
  const [managementTarget,setManagementTarget]=useState(currentMgmt);
  const [maintenanceReduction,setMaintenanceReduction]=useState(0);
  const [otherReduction,setOtherReduction]=useState(0);
  const [extraPrincipal,setExtraPrincipal]=useState(0);
  const [holdYears,setHoldYears]=useState<2|3|4|5>(3);

  const rentGain=occupiedUnits.length*rentIncrease;
  const managementGain=expectedRent*Math.max(0,currentMgmt-managementTarget)/100;
  const maintenanceGain=maintenanceMonthly*maintenanceReduction/100;
  const otherGain=otherOperatingMonthly*otherReduction/100;
  const projected=currentMonthly+rentGain+managementGain+maintenanceGain+otherGain-extraPrincipal;
  const currentMonthlyIncome=metrics.income/monthsElapsed;
  const currentMonthlyOperatingExpenses=metrics.operatingExpenses/monthsElapsed;
  const projectedMonthlyIncome=currentMonthlyIncome+rentGain;
  const projectedMonthlyOperatingExpenses=Math.max(0,currentMonthlyOperatingExpenses-managementGain-maintenanceGain-otherGain);
  const projectedMonthlyNoi=projectedMonthlyIncome-projectedMonthlyOperatingExpenses;
  const projectedExpenseRatio=projectedMonthlyIncome>0?projectedMonthlyOperatingExpenses/projectedMonthlyIncome:0;
  const currentExpenseRatio=metrics.income>0?metrics.operatingExpenses/metrics.income:0;
  const monthlyDebtService=Math.max(0,Number(property.monthly_mortgage_payment||0));
  const projectedDscr=monthlyDebtService>0?projectedMonthlyNoi/monthlyDebtService:null;
  const mortgageBalance=Math.max(0,Number(property.mortgage_balance||0));
  const principalReduction=Math.min(mortgageBalance, extraPrincipal*12*holdYears);
  const projectedHoldCashFlow=projected*12*holdYears;

  const suggestedRent=occupiedUnits.length?50:0;
  const suggestedMgmt=currentMgmt>6?Math.max(0,currentMgmt-1):currentMgmt;
  const suggestedMaintenance=maintenanceMonthly>0?20:0;
  const suggestedOther=otherOperatingMonthly>0?10:0;
  const suggestedGain=occupiedUnits.length*suggestedRent + expectedRent*Math.max(0,currentMgmt-suggestedMgmt)/100 + maintenanceMonthly*suggestedMaintenance/100 + otherOperatingMonthly*suggestedOther/100;
  const suggestedProjected=currentMonthly+suggestedGain;

  // Scenario bar visualizes progress from the current run rate toward the
  // best-case scenario available from the four controls. It must grow as
  // cash flow improves, rather than shrinking as the projected value rises.
  const maxScenarioGain=
    occupiedUnits.length*250 +
    expectedRent*Math.max(0,currentMgmt)/100 +
    maintenanceMonthly*.50 +
    otherOperatingMonthly*.30;
  const scenarioGain=Math.max(0,projected-currentMonthly);
  const scenarioProgress=maxScenarioGain>0
    ? Math.max(0,Math.min(1,scenarioGain/maxScenarioGain))
    : 0;
  const projectionFillPct=16 + scenarioProgress*84;

  const opportunities=[
    maintenanceMonthly>0?{key:'maintenance',title:'Reduce recurring maintenance',detail:`${formatKpiCurrency(maintenanceYtd)} recorded YTD`,potential:maintenanceMonthly*.20,status:'Available now',icon:<Wrench size={18}/>,tone:'maintenance'}:null,
    currentMgmt>0&&expectedRent>0?{key:'management',title:'Review management cost',detail:`Current rate ${currentMgmt.toFixed(currentMgmt%1?1:0)}% of collected rent`,potential:expectedRent*.01,status:'Investigate',icon:<ClipboardCheck size={18}/>,tone:'management'}:null,
    occupiedUnits.length?{key:'rent',title:'Plan the next rent review',detail:`${occupiedUnits.length} occupied ${occupiedUnits.length===1?'unit':'units'} · change only when allowed`,potential:occupiedUnits.length*50,status:'At renewal',icon:<LockKeyhole size={18}/>,tone:'rent'}:null,
    otherOperatingMonthly>0?{key:'other',title:'Trim controllable operating costs',detail:`${formatKpiCurrency(utilitiesYtd+otherOperatingYtd)} recorded YTD`,potential:otherOperatingMonthly*.10,status:'Investigate',icon:<Gauge size={18}/>,tone:'neutral'}:null,
  ].filter(Boolean).sort((a:any,b:any)=>b.potential-a.potential) as {key:string;title:string;detail:string;potential:number;status:string;icon:React.ReactNode;tone:string}[];

  return <div className="improve-page">
    <section className="improve-hero">
      <div className="improve-hero-copy"><span className="improve-eyebrow">PROPERTY PLAN</span><h2>Improve this property</h2><p>Focus on the few changes that can actually move cash flow. Rent changes are treated as renewal decisions, not something you can change today.</p></div>
      <div className="improve-hero-metrics">
        <div><span>Current monthly cash flow</span><strong className={currentMonthly>=0?'amount-positive':'amount-negative'}>{formatKpiCurrency(currentMonthly)}</strong><small>YTD monthly average</small></div>
        <div><span>Scenario cash flow</span><strong className={projected>=currentMonthly?'amount-positive':'amount-negative'}>{formatKpiCurrency(projected)}</strong><small>Based on your changes</small></div>
        <div><span>Operating expense ratio</span><strong className={projectedExpenseRatio<=currentExpenseRatio?'amount-positive':''}>{projectedMonthlyIncome>0?`${(projectedExpenseRatio*100).toFixed(1)}%`:'—'}</strong><small>{metrics.income>0?`${(currentExpenseRatio*100).toFixed(1)}% current`:'No income recorded'}</small></div>
      </div>
    </section>

    <section className="improve-planner">
      <div className="improve-section-head"><div><span className="improve-eyebrow">WHAT IF</span><h3>Build a better scenario</h3><p>Adjust only the levers you could realistically influence.</p></div><div className="improve-hold-selector" aria-label="Projection hold period">{([2,3,4,5] as const).map(years=><button key={years} type="button" className={holdYears===years?'active':''} onClick={()=>setHoldYears(years)}>{years}Y</button>)}</div></div>
      <div className="improve-levers">
        <ImproveLever label="Rent at next renewal" displayValue={rentIncrease?`+${formatKpiCurrency(rentIncrease)} / unit`:'No change'} meta={occupiedUnits.length?`${occupiedUnits.length} occupied ${occupiedUnits.length===1?'unit':'units'} · locked until renewal`:'No occupied units'} min={0} max={250} step={25} rangeValue={rentIncrease} onChange={setRentIncrease} status="At renewal"/>
        <ImproveLever label="Management fee" displayValue={`${managementTarget.toFixed(managementTarget%1?1:0)}%`} meta={currentMgmt?`Current ${currentMgmt.toFixed(currentMgmt%1?1:0)}% · scenario savings ${formatKpiCurrency(managementGain)}/mo`:'No management fee recorded'} min={0} max={Math.max(12,currentMgmt)} step={0.5} rangeValue={managementTarget} onChange={setManagementTarget} status="Investigate" disabled={!currentMgmt}/>
        <ImproveLever label="Maintenance" displayValue={maintenanceReduction?`−${maintenanceReduction}%`:'Current run rate'} meta={maintenanceMonthly?`${formatKpiCurrency(maintenanceMonthly)}/mo YTD average`:'No maintenance recorded YTD'} min={0} max={50} step={5} rangeValue={maintenanceReduction} onChange={setMaintenanceReduction} status="Available now" disabled={!maintenanceMonthly}/>
        <ImproveLever label="Other operating costs" displayValue={otherReduction?`−${otherReduction}%`:'Current run rate'} meta={otherOperatingMonthly?`${formatKpiCurrency(otherOperatingMonthly)}/mo YTD average`:'No other controllable costs recorded'} min={0} max={30} step={5} rangeValue={otherReduction} onChange={setOtherReduction} status="Investigate" disabled={!otherOperatingMonthly}/>
        <ImproveLever label="Extra mortgage principal" displayValue={extraPrincipal?`${formatKpiCurrency(extraPrincipal)}/mo`:'No extra payment'} meta={monthlyDebtService?'Reduces cash flow now. Add loan rate and remaining term before modeling an earlier payoff date.':'No mortgage payment recorded'} min={0} max={1000} step={50} rangeValue={extraPrincipal} onChange={setExtraPrincipal} status="Debt strategy" disabled={!monthlyDebtService}/>
      </div>
      <div className="improve-projection-bar"><div><span>Current</span><strong>{formatKpiCurrency(currentMonthly)}</strong></div><i><b style={{width:`${projectionFillPct}%`,insetInlineStart:0,insetInlineEnd:'auto'}}/></i><div><span>Scenario</span><strong>{formatKpiCurrency(projected)}</strong></div></div>
      <div className="improve-impact-strip">
        <div><span>Cash flow</span><strong>{formatKpiCurrency(currentMonthly)} <small>→</small> {formatKpiCurrency(projected)}/mo</strong></div>
        <div><span>NOI</span><strong>{formatKpiCurrency(metrics.noi/monthsElapsed)} <small>→</small> {formatKpiCurrency(projectedMonthlyNoi)}/mo</strong></div>
        <div><span>OpEx ratio</span><strong>{metrics.income>0?`${(currentExpenseRatio*100).toFixed(1)}%`:'—'} <small>→</small> {projectedMonthlyIncome>0?`${(projectedExpenseRatio*100).toFixed(1)}%`:'—'}</strong></div>
        <div><span>DSCR</span><strong>{projectedDscr===null?'—':`${projectedDscr.toFixed(2)}×`}</strong><small>{projectedDscr===null?'No debt service recorded':'Scenario coverage'}</small></div>
      </div>
      <div className="improve-hold-summary"><span>Projection, {holdYears}-year hold</span><div><strong>{formatKpiCurrency(projectedHoldCashFlow)}</strong><small>estimated cash flow</small></div><div><strong>{formatKpiCurrency(principalReduction)}</strong><small>additional principal reduction</small></div></div>
    </section>

    <section className="improve-opportunities-section">
      <div className="improve-section-head"><div><span className="improve-eyebrow">OPPORTUNITIES</span><h3>Best places to look first</h3></div><span className="improve-count">{Math.min(opportunities.length,3)} identified</span></div>
      <div className="improve-opportunity-list">{opportunities.slice(0,3).map((o,i)=><div className="improve-opportunity" key={o.key}>
        <div className={`improve-opportunity-icon ${o.tone}`}>{o.icon}</div>
        <div className="improve-opportunity-copy"><div className="improve-opportunity-title"><span>{String(i+1).padStart(2,'0')}</span><strong>{o.title}</strong></div><p>{o.detail}</p><span className={`improve-status ${o.status==='Available now'?'available':o.status==='At renewal'?'renewal':'investigate'}`}>{o.status}</span></div>
        <div className="improve-potential"><strong>+{formatKpiCurrency(o.potential)}</strong><span>potential / mo</span></div>
      </div>)}</div>
    </section>

    <section className="improve-path">
      <div className="improve-path-header"><div><span className="improve-eyebrow">A REALISTIC PATH</span><h3>Start here</h3></div><div><span>Projected</span><strong>{formatKpiCurrency(suggestedProjected)}/mo</strong></div></div>
      <div className="improve-path-steps">
        {suggestedMaintenance>0&&<ImprovePathStep number="1" title={`Reduce maintenance run rate ${suggestedMaintenance}%`} impact={maintenanceMonthly*suggestedMaintenance/100} note="Available now · focus on repeat repairs and vendor pricing"/>}
        {currentMgmt>suggestedMgmt&&<ImprovePathStep number="2" title={`Test a ${suggestedMgmt.toFixed(suggestedMgmt%1?1:0)}% management rate`} impact={expectedRent*(currentMgmt-suggestedMgmt)/100} note="Investigate · use when renegotiating or comparing managers"/>}
        {suggestedRent>0&&<ImprovePathStep number="3" title={`Model +${formatKpiCurrency(suggestedRent)} per occupied unit`} impact={occupiedUnits.length*suggestedRent} note="At renewal only · validate against market rent first"/>}
        {suggestedOther>0&&<ImprovePathStep number="4" title={`Reduce other controllable costs ${suggestedOther}%`} impact={otherOperatingMonthly*suggestedOther/100} note="Investigate utilities, services and recurring charges"/>}
      </div>
      <div className="improve-path-footer"><p>This path could improve monthly cash flow by about <strong>{formatKpiCurrency(suggestedGain)}/mo</strong>, based on current YTD run rates.</p><span>Scenario estimates use recorded YTD data. Validate rent, vendor and financing assumptions before acting.</span></div>
    </section>
  </div>;
}

function rangeTrack(value:number,min:number,max:number){
  const pct=max<=min?0:Math.max(0,Math.min(100,((value-min)/(max-min))*100));
  return { '--range-fill': `${pct}%` } as React.CSSProperties;
}
function ImproveLever({label,displayValue,meta,min,max,step,rangeValue,onChange,status,disabled}:{label:string;displayValue:string;meta:string;min:number;max:number;step:number;rangeValue:number;onChange:(v:number)=>void;status:string;disabled?:boolean}){
  return <div className={`improve-lever ${disabled?'disabled':''}`}><div className="improve-lever-top"><div><strong>{label}</strong><span>{meta}</span></div><div><b>{displayValue}</b><small>{status}</small></div></div><input className="improve-range" aria-label={label} type="range" min={min} max={max} step={step} value={rangeValue} style={rangeTrack(rangeValue,min,max)} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/></div>;
}
function ImprovePathStep({number,title,impact,note}:{number:string;title:string;impact:number;note:string}){return <div className="improve-path-step"><span className="improve-step-number">{number}</span><div><strong>{title}</strong><p>{note}</p></div><b>+{formatKpiCurrency(impact)}<small>/mo</small></b></div>}

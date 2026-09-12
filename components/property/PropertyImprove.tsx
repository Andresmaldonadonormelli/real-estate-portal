'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Property, Unit } from '@/lib/types';
import { buildBreakdown, calculateMetrics, formatKpiCurrency, type PropertyTransaction as Tx } from '@/lib/propertyFinancials';
import { SegmentedControl, UnderlineTabs } from '@/components/common/ProductControls';

type Tool='landing'|'cash'|'mortgage';
type Lever='rent'|'management'|'maintenance'|'other';
type Changes={rent:number;management:number|null;maintenance:number|null;other:number|null};
type Point={month:number;balance:number};
const EMPTY:Changes={rent:0,management:null,maintenance:null,other:null};

export default function PropertyImprove({property,units,transactions}:{property:Property;units:Unit[];transactions:Tx[]}){
  const storageKey=`property-improve:${property.id}`;
  const [tool,setTool]=useState<Tool>('landing');
  const [lever,setLever]=useState<Lever>('rent');
  const [changes,setChanges]=useState<Changes>(EMPTY);
  const [extra,setExtra]=useState('50');
  const [custom,setCustom]=useState('');
  const year=new Date().getFullYear(),months=Math.max(1,new Date().getMonth()+1);
  useEffect(()=>{try{const saved=localStorage.getItem(storageKey);if(saved)setChanges({...EMPTY,...JSON.parse(saved)})}catch{}},[storageKey]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(changes))}catch{}},[changes,storageKey]);
  const rows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&Number(t.transaction_date.slice(0,4))===year),[transactions,year]);
  const metrics=useMemo(()=>calculateMetrics(rows),[rows]);
  const breakdown=useMemo(()=>buildBreakdown(rows),[rows]);
  const occupied=units.filter(u=>u.occupied);
  const rentTotal=occupied.reduce((s,u)=>s+Number(u.current_rent||0),0);
  const managementRate=Math.max(0,Number(property.management_fee_percent||0));
  const maintenance=breakdown.filter(x=>x.key==='maintenance').reduce((s,x)=>s+x.amount,0)/months;
  const management=breakdown.filter(x=>x.key==='management'||x.key==='leasing').reduce((s,x)=>s+x.amount,0)/months;
  const other=Math.max(0,metrics.operatingExpenses/months-maintenance-management);
  const current=metrics.cashFlow/months;
  const gains={rent:occupied.length*changes.rent,management:changes.management===null?0:Math.max(0,management-rentTotal*changes.management/100),maintenance:changes.maintenance===null?0:Math.max(0,maintenance-changes.maintenance),other:changes.other===null?0:Math.max(0,other-changes.other)};
  const totalGain=Object.values(gains).reduce((a,b)=>a+b,0);
  const monthlyExtra=extra==='custom'?Math.max(0,Number(custom)||0):Number(extra);
  const loan=useMemo(()=>loanModel(property,transactions,monthlyExtra),[property,transactions,monthlyExtra]);
  const setChange=(key:Lever,value:number)=>setChanges(previous=>({...previous,[key]:value}));
  const clear=()=>{setChanges(EMPTY);try{localStorage.removeItem(storageKey)}catch{}};

  if(tool==='landing')return <section className="improve-simple"><h2>Improve</h2><p>Choose what you want to improve.</p><div className="improve-choice-list"><button onClick={()=>setTool('cash')}><span>Improve cash flow</span><ChevronRight size={18}/></button><button onClick={()=>setTool('mortgage')}><span>Pay off mortgage sooner</span><ChevronRight size={18}/></button></div></section>;
  return <section className="improve-tool"><button className="improve-back" onClick={()=>setTool('landing')}><ChevronLeft size={18}/>Improve</button><h2>{tool==='cash'?'Improve cash flow':'Pay off mortgage sooner'}</h2>
    {tool==='cash'?<div className="improve-tool-grid"><div className="improve-controls"><UnderlineTabs value={lever} onChange={setLever} label="Cash-flow lever" className="improve-lever-tabs" options={[{value:'rent',label:'Rent'},{value:'management',label:'Management'},{value:'maintenance',label:'Maintenance'},{value:'other',label:'Other'}]}/><CashControl lever={lever} value={changes[lever]} setValue={value=>setChange(lever,value)} managementRate={managementRate} maintenance={maintenance} other={other}/><details><summary>More details <ChevronDown size={16}/></summary><LeverDetails lever={lever} units={occupied} managementRate={managementRate} management={management} maintenance={maintenance} other={other}/></details>{totalGain>0&&<div className="improve-change-summary"><div><strong>Saved changes</strong><button onClick={clear}>Clear changes</button></div>{changes.rent>0&&<span>Rent +{formatKpiCurrency(changes.rent)} per unit</span>}{changes.management!==null&&<span>Management {managementRate}% → {changes.management}%</span>}{changes.maintenance!==null&&<span>Maintenance {formatKpiCurrency(maintenance)} → {formatKpiCurrency(changes.maintenance)}/mo</span>}{changes.other!==null&&<span>Other {formatKpiCurrency(other)} → {formatKpiCurrency(changes.other)}/mo</span>}</div>}</div><Results current={current} next={current+totalGain} difference={totalGain}/></div>
    :<div className="improve-tool-grid"><div className="improve-controls"><span className="improve-control-label">Extra monthly principal</span><SegmentedControl value={extra} onChange={setExtra} label="Extra monthly principal" options={[{value:'20',label:'+$20'},{value:'50',label:'+$50'},{value:'100',label:'+$100'},{value:'custom',label:'Custom'}]}/>{extra==='custom'&&<label className="improve-custom"><span>Custom amount</span><input type="number" min="0" value={custom} onChange={e=>setCustom(e.target.value)} inputMode="decimal"/></label>}<details><summary>More details <ChevronDown size={16}/></summary><MortgageDetails model={loan}/></details></div><MortgageResults model={loan} extra={monthlyExtra}/></div>}
  </section>;
}

function CashControl({lever,value,setValue,managementRate,maintenance,other}:{lever:Lever;value:number|null;setValue:(n:number)=>void;managementRate:number;maintenance:number;other:number}){
  if(lever==='rent'){const selected=value||0;return <Range label="New rent increase at renewal" value={selected} display={selected?`+${formatKpiCurrency(selected)} per unit`:'No change'} min={0} max={250} step={10} onChange={setValue}/>}
  const current=lever==='management'?managementRate:lever==='maintenance'?maintenance:other,selected=value===null?current:value;
  return <Range label={lever==='management'?'Proposed management fee':`Proposed ${lever} cost`} value={selected} display={lever==='management'?`${managementRate}% → ${selected}%`:`${formatKpiCurrency(current)} → ${formatKpiCurrency(selected)}/mo`} min={0} max={current} step={lever==='management'?.25:5} onChange={setValue}/>;
}
function Range({label,value,display,min,max,step,onChange}:{label:string;value:number;display:string;min:number;max:number;step:number;onChange:(n:number)=>void}){return <label className="improve-range-control"><span>{label}</span><strong>{display}</strong><input type="range" min={min} max={max} step={step} value={value} disabled={!max} onChange={e=>onChange(Number(e.target.value))} style={{'--range-fill':`${max?value/max*100:0}%`} as CSSProperties}/></label>}
function LeverDetails({lever,units,managementRate,management,maintenance,other}:{lever:Lever;units:Unit[];managementRate:number;management:number;maintenance:number;other:number}){if(lever==='rent')return <p>{units.length} occupied {units.length===1?'unit':'units'}. Changes apply at renewal and do not alter current leases.</p>;if(lever==='management')return <p>Current rate: {managementRate}%. Recorded management cost averages {formatKpiCurrency(management)} per month this year.</p>;if(lever==='maintenance')return <p>Maintenance averages {formatKpiCurrency(maintenance)} per month this year. Mortgage and capital expenses are excluded.</p>;return <p>Other operating expenses average {formatKpiCurrency(other)} per month. Mortgage, maintenance and management are excluded.</p>}
function Results({current,next,difference}:{current:number;next:number;difference:number}){return <aside className="improve-results"><Result label="Current monthly cash flow" value={formatKpiCurrency(current)}/><Result label="New monthly cash flow" value={formatKpiCurrency(next)} tone="positive"/><Result label="Monthly difference" value={`+${formatKpiCurrency(difference)}`} tone="positive"/><Result label="Annual difference" value={`+${formatKpiCurrency(difference*12)}`} tone="positive"/></aside>}
function Result({label,value,tone}:{label:string;value:string;tone?:string}){return <div><span>{label}</span><strong className={tone==='positive'?'amount-positive':''}>{value}</strong></div>}

function loanModel(property:Property,transactions:Tx[],extra:number){
  const p=property as Property&Record<string,unknown>,balance=Math.max(0,Number(p.mortgage_balance||0)),totalPayment=Math.max(0,Number(p.monthly_mortgage_payment||0));
  const split=[...transactions].reverse().find(t=>Number((t as Tx&Record<string,unknown>).mortgage_interest_amount||0)>0) as (Tx&Record<string,unknown>)|undefined;
  const interestAmount=Math.max(0,Number(split?.mortgage_interest_amount||0)),principalAmount=Math.max(0,Number(split?.mortgage_principal_amount||0)),escrow=Math.max(0,Number(split?.mortgage_escrow_amount||0));
  const payment=principalAmount+interestAmount||Math.max(0,totalPayment-escrow);
  const start=p.mortgage_start_date?new Date(String(p.mortgage_start_date)):null;
  const elapsed=start&&!Number.isNaN(start.getTime())?Math.max(0,(new Date().getFullYear()-start.getFullYear())*12+new Date().getMonth()-start.getMonth()):0;
  const remaining=Math.max(1,360-elapsed);
  let rate=balance>0&&interestAmount>0?interestAmount/balance*1200:solveRate(balance,payment,remaining);
  if(!balance||!payment||!start||rate<=0)return null;
  const schedule=(add:number)=>{const points:Point[]=[{month:0,balance}];let b=balance,interest=0,m=0;const monthly=rate/1200;while(b>.01&&m<1200){const i=b*monthly,principal=payment+add-i;if(principal<=0)break;interest+=i;b=Math.max(0,b-principal);m++;if(m%3===0||b===0)points.push({month:m,balance:b})}return{points,months:m,interest}};
  return{balance,rate,payment,remaining,inferred:!interestAmount,baseline:schedule(0),scenario:schedule(extra)};
}
function solveRate(balance:number,payment:number,months:number){if(!balance||!payment||payment*months<=balance)return 0;let low=0,high=.03;for(let i=0;i<80;i++){const r=(low+high)/2,value=balance*r*Math.pow(1+r,months)/(Math.pow(1+r,months)-1);if(value>payment)high=r;else low=r}return (low+high)/2*1200}
function openMortgageEditor(){document.querySelector<HTMLButtonElement>('.property-header-actions button,.property-header-actions .property-secondary-action')?.click()}
function MortgageDetails({model}:{model:ReturnType<typeof loanModel>}){return model?<p>Balance {formatKpiCurrency(model.balance)} · {model.inferred?'estimated':'recorded'} rate {model.rate.toFixed(2)}% · {model.remaining} months remaining · P&I {formatKpiCurrency(model.payment)}. Escrow is excluded when a payment split is recorded.</p>:<p>Accurate results require the mortgage balance, monthly payment and mortgage start date.</p>}
function MortgageResults({model,extra}:{model:ReturnType<typeof loanModel>;extra:number}){
  if(!model)return <aside className="improve-results improve-missing"><strong>Mortgage information needed</strong><p>Add the balance, monthly payment and start date to calculate payoff options.</p><button className="property-text-action" onClick={openMortgageEditor}>Edit mortgage information</button></aside>;
  const max=Math.max(model.baseline.months,model.scenario.months),saved=Math.max(0,model.baseline.months-model.scenario.months),interest=Math.max(0,model.baseline.interest-model.scenario.interest),path=(points:Point[])=>points.map(p=>`${p.month/max*100},${100-p.balance/model.balance*100}`).join(' ');const payoff=new Date();payoff.setMonth(payoff.getMonth()+model.scenario.months);
  return <aside className="improve-results improve-mortgage-results"><div className="improve-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Mortgage balance paths"><polyline className="current" points={path(model.baseline.points)}/><polyline className="scenario" points={path(model.scenario.points)}/></svg><div><span><i className="current"/>Current</span><span><i className="scenario"/>New</span></div></div><Result label="New payoff date" value={payoff.toLocaleDateString(undefined,{month:'short',year:'numeric'})}/><Result label="Time saved" value={saved>=12?`${Math.floor(saved/12)} yr ${saved%12} mo`:`${saved} mo`}/><Result label="Interest saved" value={formatKpiCurrency(interest)} tone="positive"/><Result label="New monthly payment" value={formatKpiCurrency(model.payment+extra)}/><Result label="Cash-flow reduction today" value={`-${formatKpiCurrency(extra)}`}/></aside>;
}

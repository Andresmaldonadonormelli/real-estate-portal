'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Property, Unit } from '@/lib/types';
import { buildBreakdown, calculateMetrics, formatKpiCurrency, type PropertyTransaction as Tx } from '@/lib/propertyFinancials';
import { SegmentedControl } from '@/components/common/ProductControls';

type Tool='landing'|'cash'|'mortgage';
type Lever='rent'|'management'|'maintenance'|'other';
type Point={month:number;balance:number};

export default function PropertyImprove({property,units,transactions}:{property:Property;units:Unit[];transactions:Tx[]}){
  const [tool,setTool]=useState<Tool>('landing');
  const [lever,setLever]=useState<Lever>('rent');
  const [value,setValue]=useState(0);
  const [extra,setExtra]=useState('50');
  const [custom,setCustom]=useState('');
  const year=new Date().getFullYear(), months=Math.max(1,new Date().getMonth()+1);
  const rows=useMemo(()=>transactions.filter(t=>t.status!=='declined'&&Number(t.transaction_date.slice(0,4))===year),[transactions,year]);
  const metrics=useMemo(()=>calculateMetrics(rows),[rows]);
  const breakdown=useMemo(()=>buildBreakdown(rows),[rows]);
  const occupied=units.filter(u=>u.occupied);
  const managementRate=Math.max(0,Number(property.management_fee_percent||0));
  const maintenance=breakdown.filter(x=>x.key==='maintenance').reduce((s,x)=>s+x.amount,0)/months;
  const management=breakdown.filter(x=>x.key==='management'||x.key==='leasing').reduce((s,x)=>s+x.amount,0)/months;
  const other=Math.max(0,metrics.operatingExpenses/months-maintenance-management);
  const current=metrics.cashFlow/months;
  const gain=lever==='rent'?occupied.length*value:lever==='management'?management*(value/100):lever==='maintenance'?maintenance*(value/100):other*(value/100);
  const monthlyExtra=extra==='custom'?Math.max(0,Number(custom)||0):Number(extra);
  const loan=useMemo(()=>loanModel(property,monthlyExtra),[property,monthlyExtra]);

  if(tool==='landing') return <section className="improve-simple"><h2>Improve</h2><p>Choose what you want to improve.</p><div className="improve-choice-list"><button onClick={()=>setTool('cash')}><span>Improve cash flow</span><ChevronRight size={18}/></button><button onClick={()=>setTool('mortgage')}><span>Pay off mortgage sooner</span><ChevronRight size={18}/></button></div></section>;
  return <section className="improve-tool"><button className="improve-back" onClick={()=>setTool('landing')}><ChevronLeft size={18}/>Improve</button><h2>{tool==='cash'?'Improve cash flow':'Pay off mortgage sooner'}</h2>
    {tool==='cash'?<div className="improve-tool-grid"><div className="improve-controls"><SegmentedControl value={lever} onChange={v=>{setLever(v);setValue(0)}} label="Cash-flow lever" options={[{value:'rent',label:'Rent'},{value:'management',label:'Management'},{value:'maintenance',label:'Maintenance'},{value:'other',label:'Other'}]}/><Control lever={lever} value={value} setValue={setValue}/><details><summary>More details <ChevronDown size={16}/></summary><p>Uses this year’s recorded income and expenses. Rent applies to occupied units. Expense changes use the current monthly run rate.</p></details></div><Results current={current} next={current+gain} difference={gain}/></div>
    :<div className="improve-tool-grid"><div className="improve-controls"><span className="improve-control-label">Extra monthly principal</span><SegmentedControl value={extra} onChange={setExtra} label="Extra monthly principal" options={[{value:'20',label:'+$20'},{value:'50',label:'+$50'},{value:'100',label:'+$100'},{value:'custom',label:'Custom'}]}/>{extra==='custom'&&<label className="improve-custom"><span>Custom amount</span><input type="number" min="0" value={custom} onChange={e=>setCustom(e.target.value)} inputMode="decimal"/></label>}<details><summary>More details <ChevronDown size={16}/></summary><p>Calculations use principal and interest only. Taxes, insurance, and escrow are excluded.</p></details></div><MortgageResults model={loan} extra={monthlyExtra}/></div>}
  </section>;
}

function Control({lever,value,setValue}:{lever:Lever;value:number;setValue:(n:number)=>void}){
  const rent=lever==='rent', max=rent?250:50, suffix=rent?' per unit':'%';
  return <label className="improve-range-control"><span>{rent?'Increase at renewal':`Reduce ${lever} expense`}</span><strong>{value?`${rent?'+':''}${rent?formatKpiCurrency(value):value}${suffix}`:'No change'}</strong><input type="range" min="0" max={max} step={rent?10:5} value={value} onChange={e=>setValue(Number(e.target.value))} style={{'--range-fill':`${value/max*100}%`} as CSSProperties}/></label>;
}
function Results({current,next,difference}:{current:number;next:number;difference:number}){return <aside className="improve-results"><Result label="Current monthly cash flow" value={formatKpiCurrency(current)}/><Result label="New monthly cash flow" value={formatKpiCurrency(next)} tone={next>=current?'positive':undefined}/><Result label="Monthly difference" value={`${difference>=0?'+':''}${formatKpiCurrency(difference)}`} tone="positive"/><Result label="Annual difference" value={`${difference>=0?'+':''}${formatKpiCurrency(difference*12)}`} tone="positive"/></aside>}
function Result({label,value,tone}:{label:string;value:string;tone?:string}){return <div><span>{label}</span><strong className={tone==='positive'?'amount-positive':''}>{value}</strong></div>}

function loanModel(property:Property,extra:number){
  const p=property as Property&Record<string,unknown>;
  const balance=Math.max(0,Number(p.mortgage_balance||0)), rate=Math.max(0,Number(p.mortgage_interest_rate||p.interest_rate||0));
  const escrow=Math.max(0,Number(p.mortgage_escrow_amount||p.monthly_escrow||0));
  const payment=Math.max(0,Number(p.principal_and_interest_payment||p.monthly_principal_interest||0)||(Number(p.monthly_mortgage_payment||0)-escrow));
  if(!balance||!rate||!payment)return null;
  const schedule=(add:number)=>{const points:Point[]=[{month:0,balance}];let b=balance,interest=0,m=0;const monthly=rate/1200;while(b>.01&&m<1200){const i=b*monthly;interest+=i;const principal=payment+add-i;if(principal<=0)break;b=Math.max(0,b-principal);m++;if(m%3===0||b===0)points.push({month:m,balance:b})}return {points,months:m,interest}};
  return {balance,payment,baseline:schedule(0),scenario:schedule(extra)};
}
function MortgageResults({model,extra}:{model:ReturnType<typeof loanModel>;extra:number}){
  if(!model)return <aside className="improve-results improve-missing"><strong>Mortgage information needed</strong><p>Add the balance, interest rate, and principal-and-interest payment to calculate payoff options.</p></aside>;
  const max=Math.max(model.baseline.months,model.scenario.months),saved=Math.max(0,model.baseline.months-model.scenario.months),interest=Math.max(0,model.baseline.interest-model.scenario.interest);
  const path=(points:Point[])=>points.map(p=>`${p.month/max*100},${100-p.balance/model.balance*100}`).join(' ');
  const payoff=new Date();payoff.setMonth(payoff.getMonth()+model.scenario.months);
  return <aside className="improve-results improve-mortgage-results"><div className="improve-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Mortgage balance paths"><polyline className="current" points={path(model.baseline.points)}/><polyline className="scenario" points={path(model.scenario.points)}/></svg><div><span><i className="current"/>Current</span><span><i className="scenario"/>New</span></div></div><Result label="New payoff date" value={payoff.toLocaleDateString(undefined,{month:'short',year:'numeric'})}/><Result label="Time saved" value={saved>=12?`${Math.floor(saved/12)} yr ${saved%12} mo`:`${saved} mo`}/><Result label="Interest saved" value={formatKpiCurrency(interest)} tone="positive"/><Result label="New monthly payment" value={formatKpiCurrency(model.payment+extra)}/><Result label="Cash-flow reduction today" value={`-${formatKpiCurrency(extra)}`}/></aside>;
}

'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SegmentedTabs, UnderlineTabs as SharedUnderlineTabs } from '@/components/ui/Tabs';

export function PageHeader({title,action,children}:{title:string;action?:ReactNode;children?:ReactNode}){
  return <header className="product-page-header"><div><h1>{title}</h1>{children}</div>{action}</header>;
}

export function PageAction({children,onClick,disabled=false}:{children:ReactNode;onClick:()=>void;disabled?:boolean}){
  return <Button className="product-page-action" onClick={onClick} disabled={disabled}>{children}</Button>;
}

export function SecondaryButton({children,onClick,className='',disabled=false}:{children:ReactNode;onClick:()=>void;className?:string;disabled?:boolean}){
  return <Button variant="secondary" className={`product-secondary-button ${className}`.trim()} onClick={onClick} disabled={disabled}>{children}</Button>;
}

export function SecondaryLink({children,href,className=''}:{children:ReactNode;href:string;className?:string}){
  return <ButtonLink variant="secondary" className={`product-secondary-button ${className}`.trim()} href={href}>{children}</ButtonLink>;
}

export function ProductSelect({label,className='',children,...props}:SelectHTMLAttributes<HTMLSelectElement>&{label?:string;className?:string;children:ReactNode}){
  return <Select label={label} className={`product-select ${className}`.trim()} {...props}>{children}</Select>;
}

export function SegmentedControl<T extends string>({value,options,onChange,label,className=''}:{value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;label:string;className?:string}){
  return <SegmentedTabs value={value} options={options} onChange={onChange} label={label} className={`product-segmented ${className}`.trim()}/>;
}

export function UnderlineTabs<T extends string>({value,options,onChange,label,primary=false,className=''}:{value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;label:string;primary?:boolean;className?:string}){
  return <SharedUnderlineTabs value={value} options={options} onChange={onChange} label={label} primary={primary} className={`product-underline-tabs ${className}`.trim()}/>;
}

export function ChartLegend({negative=false,variant='signed'}:{negative?:boolean;variant?:'signed'|'incomeExpense'}){
  if(variant==='incomeExpense'){
    return <div className="product-chart-legend" aria-label="Chart legend"><span><i className="is-expense-series"/>Expenses</span><span><i className="is-income-series"/>Income</span></div>;
  }
  return <div className="product-chart-legend" aria-label="Chart legend"><span><i className="is-income"/>Positive</span><span><i className={`is-expense ${negative?'is-negative':''}`}/>Negative</span></div>;
}

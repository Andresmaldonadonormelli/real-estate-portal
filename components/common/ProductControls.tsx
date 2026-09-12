'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

export function PageHeader({title,action,children}:{title:string;action?:ReactNode;children?:ReactNode}){
  return <header className="product-page-header"><div><h1>{title}</h1>{children}</div>{action}</header>;
}

export function PageAction({children,onClick,disabled=false}:{children:ReactNode;onClick:()=>void;disabled?:boolean}){
  return <button type="button" className="product-page-action" onClick={onClick} disabled={disabled}>{children}</button>;
}

export function ProductSelect({label,className='',children,...props}:SelectHTMLAttributes<HTMLSelectElement>&{label?:string;className?:string;children:ReactNode}){
  return <label className={`product-select ${className}`.trim()}>{label&&<span>{label}</span>}<span className="product-select-control"><select {...props}>{children}</select><ChevronDown size={17} aria-hidden="true"/></span></label>;
}

export function SegmentedControl<T extends string>({value,options,onChange,label,className=''}:{value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;label:string;className?:string}){
  return <div className={`product-segmented ${className}`.trim()} role="tablist" aria-label={label}>{options.map(option=><button type="button" role="tab" aria-selected={value===option.value} key={option.value} className={value===option.value?'active':''} onClick={()=>onChange(option.value)}>{option.label}</button>)}</div>;
}

export function UnderlineTabs<T extends string>({value,options,onChange,label,primary=false,className=''}:{value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;label:string;primary?:boolean;className?:string}){
  return <nav className={`product-underline-tabs ${primary?'primary':''} ${className}`.trim()} role="tablist" aria-label={label}>{options.map(option=><button type="button" role="tab" aria-selected={value===option.value} key={option.value} className={value===option.value?'active':''} onClick={()=>onChange(option.value)}>{option.label}</button>)}</nav>;
}

export function ChartLegend({negative=false}:{negative?:boolean}){
  return <div className="product-chart-legend" aria-label="Chart legend"><span><i className={negative?'is-negative':'is-positive'}/>Cash flow</span><span><i className="is-expense"/>Expenses</span></div>;
}

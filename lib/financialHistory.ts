import { categoryKey } from '@/lib/accounting';

export type HistoryPeriod='3M'|'6M'|'9M'|'1Y';
export type HistoryMode='cashFlow'|'noi';
export type HistoryTransaction={
  transaction_date:string;
  type:'income'|'expense'|'transfer';
  category:string;
  amount:number;
  status?:string|null;
  property_id?:string|null;
};
export type MonthlyFinancialPoint={
  key:string;
  label:string;
  fullLabel:string;
  periodLabel:string;
  income:number;
  cashExpenses:number;
  operatingExpenses:number;
  cashFlow:number;
  noi:number;
};

const PERIOD_MONTHS:Record<HistoryPeriod,number>={'3M':3,'6M':6,'9M':9,'1Y':12};
const OPERATING_EXCLUSIONS=['mortgage-interest','mortgage-principal','mortgage','capex','distribution'];

export function buildMonthlyFinancialHistory(transactions:HistoryTransaction[],period:HistoryPeriod,propertyId=''):MonthlyFinancialPoint[]{
  const now=new Date();
  const monthCount=PERIOD_MONTHS[period];
  const posted=transactions.filter(tx=>(tx.status||'posted')==='posted'&&tx.type!=='transfer'&&(!propertyId||tx.property_id===propertyId));
  return Array.from({length:monthCount},(_,index)=>{
    const date=new Date(now.getFullYear(),now.getMonth()-(monthCount-1-index),1);
    const year=date.getFullYear();
    const month=date.getMonth()+1;
    const key=`${year}-${String(month).padStart(2,'0')}`;
    const monthRows=posted.filter(tx=>tx.transaction_date.startsWith(key));
    const income=monthRows.filter(tx=>tx.type==='income').reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0);
    const expenseRows=monthRows.filter(tx=>tx.type==='expense');
    const cashExpenses=expenseRows.reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0);
    const operatingExpenses=expenseRows.filter(tx=>!OPERATING_EXCLUSIONS.includes(categoryKey(tx.category||''))).reduce((sum,tx)=>sum+Math.abs(Number(tx.amount||0)),0);
    const isCurrent=year===now.getFullYear()&&month===now.getMonth()+1;
    return {
      key,
      label:date.toLocaleDateString('en-US',{month:'short'}),
      fullLabel:date.toLocaleDateString('en-US',{month:'long',year:'numeric'}),
      periodLabel:isCurrent?`${date.toLocaleDateString('en-US',{month:'long'})} 1–${now.getDate()}`:date.toLocaleDateString('en-US',{month:'long',year:'numeric'}),
      income,
      cashExpenses,
      operatingExpenses,
      cashFlow:income-cashExpenses,
      noi:income-operatingExpenses,
    };
  });
}

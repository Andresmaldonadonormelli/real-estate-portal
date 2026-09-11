'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { categoryKey } from '@/lib/accounting';
import { buildBreakdown, calculateMetrics, formatDate, formatKpiCurrency, type PropertyTransaction } from '@/lib/propertyFinancials';
import type { Property, Unit } from '@/lib/types';
import FinancialHistoryChart from '@/components/charts/FinancialHistoryChart';
import PropertyExpenseTrendsChart from '@/components/charts/PropertyExpenseTrendsChart';
import ActionCenter, { type ActionCenterItem } from '@/components/dashboard/ActionCenter';
import RecentActivity from '@/components/dashboard/RecentActivity';
import {
  buildMonthlyFinancialHistory,
  type HistoryMode,
  type HistoryPeriod,
  type MonthlyFinancialPoint,
} from '@/lib/financialHistory';

type PropertyTab = 'overview' | 'improve' | 'units' | 'documents';

type Props = {
  property: Property;
  units: Unit[];
  transactions: PropertyTransaction[];
  expectedRent: number;
  onNavigate: (tab: PropertyTab) => void;
};

export default function PropertyOverview({ property, units, transactions, expectedRent, onNavigate }: Props) {
  const [period, setPeriod] = useState<HistoryPeriod>('1Y');
  const [mode, setMode] = useState<HistoryMode>('cashFlow');
  const [inspected, setInspected] = useState<MonthlyFinancialPoint | null>(null);
  const [rentReviewOpen, setRentReviewOpen] = useState(false);
  const [confirmingRent, setConfirmingRent] = useState(false);

  const history = useMemo(() => buildMonthlyFinancialHistory(transactions, period, property.id), [transactions, period, property.id]);
  const current = history[history.length - 1];
  const periodDisplayed = history.reduce((sum, row) => ({
    ...row,
    income: sum.income + row.income,
    cashExpenses: sum.cashExpenses + row.cashExpenses,
    operatingExpenses: sum.operatingExpenses + row.operatingExpenses,
    cashFlow: sum.cashFlow + row.cashFlow,
    noi: sum.noi + row.noi,
  }), { ...(current || { key: '', label: '', fullLabel: '', periodLabel: '' }), income: 0, cashExpenses: 0, operatingExpenses: 0, cashFlow: 0, noi: 0 });
  const displayed = inspected || periodDisplayed;
  const currentValue = mode === 'cashFlow' ? (displayed?.cashFlow || 0) : (displayed?.noi || 0);
  const currentExpenses = mode === 'cashFlow' ? (displayed?.cashExpenses || 0) : (displayed?.operatingExpenses || 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const collectedRent = transactions.filter(tx => tx.transaction_date.startsWith(currentMonth) && tx.type === 'income' && tx.category === 'Rent' && (tx.status || 'posted') === 'posted').reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  const periodTransactions = transactions.filter(tx => tx.status !== 'declined' && history.some(month => tx.transaction_date.startsWith(month.key)));
  const periodMetrics = calculateMetrics(periodTransactions);
  const expenseRatio = periodMetrics.income > 0 ? periodMetrics.operatingExpenses / periodMetrics.income : 0;
  const breakdown = buildBreakdown(periodTransactions);
  const breakdownTotal = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const pendingRentRows = transactions.filter(tx => tx.status === 'pending' && tx.category === 'Rent');
  const pendingRent = pendingRentRows.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leaseUnits = units as (Unit & { lease_end_date?: string | null })[];
  const leaseCandidates = leaseUnits.filter(unit => unit.occupied && unit.lease_end_date).map(unit => ({ unit, date: new Date(`${unit.lease_end_date}T12:00:00`) }));
  const nextLease = leaseCandidates.filter(item => item.date >= today).sort((a, b) => a.date.getTime() - b.date.getTime())[0] || leaseCandidates.filter(item => item.date < today).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  const leaseDays = nextLease ? Math.ceil((nextLease.date.getTime() - today.getTime()) / 86400000) : null;
  const occupied = units.filter(unit => unit.occupied).length;
  const vacantUnits = leaseUnits.filter(unit => !unit.occupied);
  const vacancyStarts = vacantUnits.map(unit => unit.lease_end_date || property.purchase_date).filter(Boolean).map(value => new Date(`${value}T12:00:00`)).filter(date => date <= today);
  const vacancyDays = vacancyStarts.length ? Math.max(...vacancyStarts.map(date => Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000)))) : null;
  const repairExpenses = periodTransactions.filter(tx => tx.type === 'expense' && ['maintenance', 'repairs'].includes(categoryKey(tx.category))).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  const recentAverage = period === '3M' ? repairExpenses / 3 : period === '6M' ? repairExpenses / 6 : period === '9M' ? repairExpenses / 9 : repairExpenses / 12;
  const currentRepairs = periodTransactions.filter(tx => tx.type === 'expense' && tx.transaction_date.startsWith(currentMonth) && ['maintenance', 'repairs'].includes(categoryKey(tx.category))).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  const priorRows = history.slice(0, -1);
  const priorCashFlow = priorRows.reduce((sum, row) => sum + row.cashFlow, 0) / Math.max(1, priorRows.length);
  const currentCashFlow = current?.cashFlow || 0;
  const baselineThreshold = Math.max(100, expectedRent * .1);
  const hasCashHistory = priorRows.filter(row => Math.abs(row.cashFlow) > 0).length >= 3 && Math.abs(priorCashFlow) >= baselineThreshold;
  const cashDelta = currentCashFlow - priorCashFlow;
  const rentProgress = expectedRent ? Math.min(100, Math.round(collectedRent / expectedRent * 100)) : 0;
  const rentOutstanding = Math.max(0, expectedRent - collectedRent);
  const rentDueDay = Math.min(28, Math.max(1, Math.min(...units.map(unit => Number((unit as any).rent_due_day || 5)), 5)));
  const isPastRentDue = today.getDate() > rentDueDay;
  const expectedByToday = expectedRent ? Math.min(100, Math.round(today.getDate() / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() * 100)) : 0;
  const expenseDelta = currentRepairs - recentAverage;
  const expenseRatioToTypical = recentAverage > 0 ? expenseDelta / recentAverage : 0;
  const expenseTone = recentAverage <= 0 ? 'neutral' : expenseRatioToTypical >= .5 ? 'negative' : expenseRatioToTypical >= .2 ? 'warning' : expenseRatioToTypical <= -.2 ? 'positive' : 'neutral';
  const expenseStatus = expenseTone === 'negative' ? 'Materially above normal' : expenseTone === 'warning' ? 'Above normal' : expenseTone === 'positive' ? 'Better than normal' : 'Within normal range';
  const expenseUnusual = expenseTone === 'negative' || expenseTone === 'warning';
  const rentLate = isPastRentDue && rentOutstanding > 0;
  const cashBelowTypical = hasCashHistory && cashDelta < -baselineThreshold;
  const fullyVacant = units.length > 0 && occupied === 0;
  const holdingCosts = current?.cashExpenses || 0;
  const pulseHeadline = fullyVacant ? `Vacant for ${vacancyDays || 0} days` : rentLate ? `Rent is ${formatKpiCurrency(rentOutstanding)} behind pace` : cashBelowTypical ? 'Repairs pushed cash flow below typical' : rentProgress === 100 ? `${new Date().toLocaleDateString('en-US', { month: 'long' })} rent is complete` : expenseUnusual ? 'Expenses are above the recent average' : 'Performance is stable';
  const pulseExplanation = fullyVacant ? `Holding costs have reached ${formatKpiCurrency(holdingCosts)} this month.` : rentLate ? `${formatKpiCurrency(collectedRent)} confirmed of ${formatKpiCurrency(expectedRent)} expected.` : cashBelowTypical ? `${formatKpiCurrency(Math.abs(cashDelta))} below a typical month.` : rentProgress === 100 ? `${formatKpiCurrency(expectedRent)} confirmed.` : expenseUnusual ? `Repairs are ${formatKpiCurrency(expenseDelta)} above the recent monthly average.` : hasCashHistory ? 'Cash flow is within the recent monthly range.' : 'Current property status based on recorded activity.';
  const occupancyTone = units.length === 0 ? 'neutral' : occupied === units.length ? 'positive' : occupied === 0 ? 'negative' : 'warning';
  const leaseTone = leaseDays == null || leaseDays > 90 ? 'neutral' : leaseDays <= 30 ? 'negative' : 'warning';
  const leaseValue = leaseDays == null || leaseDays > 90 ? 'None within 90 days' : leaseDays < 0 ? `Expired ${Math.abs(leaseDays)} days ago` : leaseDays === 0 ? 'Ends today' : `Ends in ${leaseDays} days`;
  const standardPulseSignals = [
    { key: 'cash', label: 'Cash flow this month', value: formatKpiCurrency(currentCashFlow), tone: currentCashFlow > 0 ? 'positive' : currentCashFlow < 0 ? 'negative' : 'neutral', priority: cashBelowTypical ? 1 : 3, action: () => location.href = `/ledger?property=${property.id}` },
    { key: 'occupancy', label: 'Occupancy', value: vacantUnits.length && vacancyDays != null ? `${occupied}/${units.length} · ${vacancyDays}d vacant` : `${occupied}/${units.length} occupied`, tone: occupancyTone, priority: occupied < units.length ? 1 : 4, action: () => onNavigate('units') },
    { key: 'lease', label: 'Lease risk', value: leaseValue, tone: leaseTone, priority: leaseTone === 'negative' ? 1 : leaseTone === 'warning' ? 2 : 5, action: () => onNavigate('units') },
    { key: 'expenses', label: 'Expenses', value: expenseStatus, tone: expenseTone, priority: expenseTone === 'negative' ? 1 : expenseTone === 'warning' ? 2 : 6, action: () => location.href = `/ledger?property=${property.id}` },
  ].sort((a, b) => a.priority - b.priority);
  const pulseSignals = fullyVacant ? [
    { key: 'vacancy', label: 'Vacant for', value: `${vacancyDays || 0} days`, tone: 'negative', action: () => onNavigate('units') },
    { key: 'holding', label: 'Holding costs', value: `${formatKpiCurrency(holdingCosts)} this month`, tone: 'negative', action: () => location.href = `/ledger?property=${property.id}` },
    { key: 'expenses', label: 'Expenses', value: expenseStatus, tone: expenseTone, action: () => location.href = `/ledger?property=${property.id}` },
  ] : standardPulseSignals;
  const needsReview = transactions.filter(tx => (tx.status || 'posted') === 'posted' && (tx.needs_review || tx.category === 'Needs Review')).length;
  const actionItems: ActionCenterItem[] = [];
  if (needsReview) actionItems.push({ id: 'review', kind: 'review', title: `Review ${needsReview} transaction${needsReview === 1 ? '' : 's'}`, detail: `Categorize ${needsReview === 1 ? 'it' : 'them'} before September reporting.`, actionLabel: 'Review', onSelect: () => location.href = `/ledger?property=${property.id}&review=1` });
  if (leaseDays != null && leaseDays <= 90) actionItems.push({ id: 'lease', kind: 'document', title: leaseDays < 0 ? 'Renew or close the expired lease' : 'Review the upcoming lease end', detail: leaseDays < 0 ? `The lease expired ${Math.abs(leaseDays)} days ago. Update it to keep occupancy records accurate.` : leaseDays === 0 ? 'The lease ends today. Record the next step to keep occupancy current.' : `The lease ends in ${leaseDays} days. Decide whether to renew or prepare the unit.`, actionLabel: 'Review', onSelect: () => onNavigate('units') });
  const pulseUpdatedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const periodTotals = history.reduce((sum, row) => ({ income: sum.income + row.income, operating: sum.operating + row.operatingExpenses, cash: sum.cash + row.cashExpenses }), { income: 0, operating: 0, cash: 0 });
  const totalMortgage = Math.max(0, periodTotals.cash - periodTotals.operating);
  const periodNoi = periodTotals.income - periodTotals.operating;
  const periodCashFlow = periodTotals.income - periodTotals.cash;
  const recentItems = transactions.filter(tx => (tx.status || 'posted') === 'posted').map(tx => ({ id: tx.id, title: tx.description || tx.category, detail: `${tx.category} · ${formatDate(tx.transaction_date)}`, amount: Number(tx.amount || 0), type: tx.type, href: `/ledger?property=${property.id}` }));

  async function confirmPropertyRents() {
    setConfirmingRent(true);
    for (const tx of pendingRentRows) await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id);
    location.reload();
  }

  return <div className="property-overview-pulse"><div className="property-overview-layout">
    <main className="property-overview-main">
      <section className="property-overview-chart-open">
        <div className="property-overview-chart-head"><div className="property-overview-chart-metric"><h2>{mode === 'cashFlow' ? 'Cash flow' : 'NOI'}</h2><div className="property-overview-summary"><div className="property-overview-value-row"><span className={currentValue < 0 ? 'amount-negative' : currentValue > 0 ? 'amount-positive' : ''}><AnimatedValue value={currentValue} animate={!inspected}/></span></div><div className="property-chart-breakdown"><b><span>Income</span>{formatKpiCurrency(displayed?.income || 0)}</b><b><span>Expenses</span>{formatKpiCurrency(currentExpenses)}</b></div></div></div><div className="property-chart-modes" aria-label="Chart metric"><button className={mode === 'cashFlow' ? 'active' : ''} onClick={() => setMode('cashFlow')}>Cash flow</button><button className={mode === 'noi' ? 'active' : ''} onClick={() => setMode('noi')}>NOI</button></div></div>
        <div className="property-chart-legend" aria-label="Chart legend"><span><i className={currentValue < 0 ? 'is-negative' : 'is-positive'}/>Cash flow</span><span><i className="is-expense"/>Expenses</span></div>
        <FinancialHistoryChart rows={history} mode={mode} label={`Monthly ${mode === 'cashFlow' ? 'cash flow' : 'net operating income'} and expenses for ${property.address}`} onInspect={setInspected}/>
        <div className={`property-chart-periods ${currentValue < 0 ? 'is-negative' : 'is-positive'}`} aria-label="Chart period">{(['3M', '6M', '9M', '1Y'] as HistoryPeriod[]).map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value}</button>)}</div>
      </section>
      <ActionCenter items={actionItems} title="Actions" onViewAll={() => location.href = `/actions?property=${property.id}`}/>
      <FinancialBreakdown propertyId={property.id} totals={periodTotals} noi={periodNoi} mortgage={totalMortgage} cashFlow={periodCashFlow}/>
      <PropertyExpenseTrendsChart transactions={transactions}/>
      <OperatingExpenses propertyId={property.id} items={breakdown} total={breakdownTotal}/>
      <KeyStatistics property={property} expectedRent={expectedRent} occupied={occupied} unitCount={units.length} noi={periodNoi} expenseRatio={expenseRatio} hasIncome={Boolean(periodMetrics.income)} mortgage={totalMortgage} period={period}/>
      <RecentActivity items={recentItems} ledgerHref={`/ledger?property=${property.id}`}/>
    </main>
    <PropertyPulse title={pulseHeadline} explanation={pulseExplanation} updatedAt={pulseUpdatedAt} collectedRent={collectedRent} expectedRent={expectedRent} rentProgress={rentProgress} expectedByToday={expectedByToday} pendingRent={pendingRent} onConfirm={() => setRentReviewOpen(true)} signals={pulseSignals}/>
  </div>{rentReviewOpen && <RentConfirmationDialog count={pendingRent} confirming={confirmingRent} onClose={() => setRentReviewOpen(false)} onConfirm={() => void confirmPropertyRents()}/>}</div>;
}

function PropertyPulse({ title, explanation, updatedAt, collectedRent, expectedRent, rentProgress, expectedByToday, pendingRent, onConfirm, signals }: { title: string; explanation: string; updatedAt: string; collectedRent: number; expectedRent: number; rentProgress: number; expectedByToday: number; pendingRent: number; onConfirm: () => void; signals: { key: string; label: string; value: string; tone: string; action: () => void }[] }) {
  return <aside className="property-pulse-rail"><div className="property-pulse-head"><h2>Property Pulse</h2><span>Updated {updatedAt}</span></div><div className="property-pulse-summary"><strong>{title}</strong><span>{explanation}</span></div><div className="property-pulse-rent-progress" aria-label={`${rentProgress}% of expected rent confirmed; ${expectedByToday}% expected by today`}><i><b style={{ width: `${rentProgress}%` }}/></i><span><b>{formatKpiCurrency(collectedRent)} confirmed</b><small>{formatKpiCurrency(expectedRent)} expected</small></span>{pendingRent > 0 && <button type="button" className="property-pulse-confirm-rent" onClick={onConfirm}>Confirm rent</button>}</div><div className="property-pulse-list">{signals.map(signal => <button type="button" onClick={signal.action} key={signal.key} className={`property-pulse-row is-${signal.tone}`}><span>{signal.label}</span><strong>{signal.value}</strong></button>)}</div></aside>;
}

function FinancialBreakdown({ propertyId, totals, noi, mortgage, cashFlow }: { propertyId: string; totals: { income: number; operating: number; cash: number }; noi: number; mortgage: number; cashFlow: number }) {
  const rows = [['Rental income', totals.income, 'income'], ['Operating expenses', -totals.operating, 'expense'], ['NOI', noi, ''], ['Mortgage payments', -mortgage, 'expense'], ['Net cash flow', cashFlow, cashFlow >= 0 ? 'income' : 'expense']] as const;
  return <section className="property-financial-breakdown"><div className="property-section-head"><h2>Financial breakdown</h2></div>{rows.map(([label, value, tone]) => <Link href={`/ledger?property=${propertyId}`} key={label}><span>{label}</span><strong className={tone === 'income' ? 'amount-positive' : tone === 'expense' ? 'amount-negative' : ''}>{formatKpiCurrency(value)}</strong></Link>)}</section>;
}

function OperatingExpenses({ propertyId, items, total }: { propertyId: string; items: ReturnType<typeof buildBreakdown>; total: number }) {
  return <section className="property-open-panel"><div className="property-panel-head"><div><h2>Operating expenses</h2></div><Link href={`/ledger?property=${propertyId}`} className="property-text-action">View ledger</Link></div><div className="origin-breakdown">{items.length ? items.map((item, index) => <BreakdownRow key={item.category} item={item} index={index} total={total} propertyId={propertyId}/>) : <Empty text="No operating expenses recorded."/>}</div></section>;
}

function KeyStatistics({ property, expectedRent, occupied, unitCount, noi, expenseRatio, hasIncome, mortgage, period }: { property: Property; expectedRent: number; occupied: number; unitCount: number; noi: number; expenseRatio: number; hasIncome: boolean; mortgage: number; period: HistoryPeriod }) {
  const rows = [['Purchase price', property.purchase_price ? formatKpiCurrency(Number(property.purchase_price)) : '—'], ['Acquisition date', property.purchase_date ? formatDate(property.purchase_date) : '—'], ['Monthly rent', formatKpiCurrency(expectedRent)], ['Occupancy', `${occupied}/${unitCount}`], ['Trailing NOI', formatKpiCurrency(noi)], ['Cap rate', property.purchase_price && period === '1Y' ? `${(noi / Number(property.purchase_price) * 100).toFixed(1)}%` : '—'], ['Expense ratio', hasIncome ? `${(expenseRatio * 100).toFixed(1)}%` : '—'], ['Debt-service coverage', mortgage ? `${(noi / mortgage).toFixed(2)}×` : '—'], ['Mortgage balance', formatKpiCurrency(Number(property.mortgage_balance || 0))]];
  return <section className="property-key-statistics"><div className="property-section-head"><h2>Key statistics</h2></div><div>{rows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div></section>;
}

function RentConfirmationDialog({ count, confirming, onClose, onConfirm }: { count: number; confirming: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="property-rent-dialog-backdrop" role="presentation" onMouseDown={onClose}><div className="property-rent-dialog" role="dialog" aria-modal="true" aria-labelledby="property-rent-dialog-title" onMouseDown={event => event.stopPropagation()}><div><h2 id="property-rent-dialog-title">Confirm rent</h2><button type="button" onClick={onClose} aria-label="Close">×</button></div><p>Confirm {count} pending rent {count === 1 ? 'payment' : 'payments'} for this property.</p><div className="property-rent-dialog-actions"><button type="button" className="secondary-pill" onClick={onClose}>Cancel</button><button type="button" className="primary-action" disabled={confirming} onClick={onConfirm}>{confirming ? 'Confirming…' : 'Confirm received'}</button></div></div></div>;
}

function AnimatedValue({ value, animate }: { value: number; animate: boolean }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisplay(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => { const progress = Math.min(1, (time - start) / 650); setDisplay(value * (1 - Math.pow(1 - progress, 3))); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);
  return <strong className={display < 0 ? 'amount-negative' : display > 0 ? 'amount-positive' : ''}>{formatKpiCurrency(display)}</strong>;
}

function BreakdownRow({ item, index, total, propertyId }: { item: ReturnType<typeof buildBreakdown>[number]; index: number; total: number; propertyId: string }) {
  const [open, setOpen] = useState(false);
  const color = `var(--expense-series-${index % 4 + 1})`;
  const pct = total ? Math.round(item.amount / total * 100) : 0;
  return <div className={`origin-breakdown-row expandable ${open ? 'open' : ''}`}><button type="button" className="origin-breakdown-toggle" onClick={() => setOpen(value => !value)}><div className="origin-breakdown-label"><span className="origin-dot" style={{ background: color }}/><strong>{item.category}</strong><span>{formatKpiCurrency(item.amount)}</span><ChevronDown size={15}/></div><div className="origin-breakdown-track"><i style={{ width: `${pct}%`, background: color }}/></div><div className="origin-breakdown-percent">{pct}%</div></button>{open && <div className="origin-breakdown-details">{item.transactions.slice(0, 8).map(transaction => { const title = transaction.payee_source || transaction.description || item.category; const detail = transaction.payee_source && transaction.description && transaction.payee_source !== transaction.description ? transaction.description : transaction.category; return <Link href={`/ledger?property=${propertyId}`} key={transaction.id}><span><strong>{title}</strong><small>{formatDate(transaction.transaction_date)} · {detail}</small></span><b>{formatKpiCurrency(Math.abs(transaction.amount))}</b></Link>; })}{item.transactions.length > 8 && <Link className="origin-more-link" href={`/ledger?property=${propertyId}`}>+ {item.transactions.length - 8} more transactions</Link>}</div>}</div>;
}

function Empty({ text }: { text: string }) { return <div className="property-empty-inline">{text}</div>; }

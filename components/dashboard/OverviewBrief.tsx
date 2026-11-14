'use client';

import Link from 'next/link';
import type { BriefActivity, BriefLine, OverviewBrief, PropertyPulseRow, UpcomingDate } from '@/lib/overviewBrief';
import { formatBriefAmount } from '@/lib/overviewBrief';

export function DailyBrief({ brief, onOpenTransaction }: { brief: OverviewBrief; onOpenTransaction: (id: string) => void }) {
  return (
    <section className="dashboard-module overview-brief" aria-label="Daily brief">
      <div className="overview-brief-head">
        <h2>Daily brief</h2>
        <span>{brief.kicker}</span>
      </div>
      <ul className="overview-brief-lines">
        {brief.lines.map((line) => <BriefRow key={line.id} line={line} />)}
      </ul>
      {brief.activity.length > 0 && (
        <ul className="overview-brief-activity">
          {brief.activity.map((item) => <ActivityRow key={item.id} item={item} onOpen={onOpenTransaction} />)}
        </ul>
      )}
    </section>
  );
}

function BriefRow({ line }: { line: BriefLine }) {
  return (
    <li>
      <span>{line.label}</span>
      {line.amount !== null && <strong className={`amount-${line.tone}`}>{formatBriefAmount(line.amount)}</strong>}
    </li>
  );
}

function ActivityRow({ item, onOpen }: { item: BriefActivity; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(item.id)}>
        <span>
          <strong>{item.title}</strong>
          <small>{item.property}</small>
        </span>
        <span>
          <strong className={`amount-${item.tone}`}>{formatBriefAmount(item.amount)}</strong>
          <small>{item.date}</small>
        </span>
      </button>
    </li>
  );
}

export function PropertyPulse({ rows }: { rows: PropertyPulseRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="dashboard-module property-pulse" aria-label="Property performance">
      <div className="overview-brief-head">
        <h2>Property pulse</h2>
        <span>This month</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={`/properties/${row.id}`}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
              </span>
              <span>
                <b data-status={row.status}>{row.status}</b>
                {row.amount !== null && <small className={row.amount < -0.5 ? 'amount-negative' : row.amount > 0.5 ? 'amount-positive' : ''}>{formatBriefAmount(row.amount)} this month</small>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpcomingDates({ items }: { items: UpcomingDate[] }) {
  if (!items.length) return null;
  return (
    <section className="dashboard-module upcoming-dates" aria-label="Coming up">
      <div className="overview-brief-head">
        <h2>Coming up</h2>
        <Link href="/actions">All reminders</Link>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href}>
              <span className="upcoming-date" aria-hidden="true"><small>{item.month}</small><strong>{item.day}</strong></span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <b>{item.when}</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

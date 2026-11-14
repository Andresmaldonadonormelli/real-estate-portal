'use client';

import Link from 'next/link';
import type { BriefUpdate, OverviewBrief, PropertyPulseRow, UpcomingDate } from '@/lib/overviewBrief';

export function DailyBrief({ brief }: { brief: OverviewBrief }) {
  return (
    <section className="dashboard-module overview-brief" aria-label="Daily brief">
      <div className="overview-brief-head">
        <h2>Daily brief</h2>
        <span>{brief.kicker}</span>
      </div>
      <ul className="overview-brief-updates">
        {brief.updates.map((update) => <BriefUpdateRow key={update.id} update={update} />)}
      </ul>
      {brief.more && <Link className="overview-brief-more" href="/ledger">View all activity</Link>}
    </section>
  );
}

function BriefUpdateRow({ update }: { update: BriefUpdate }) {
  return (
    <li>
      <strong className={update.tone === 'neutral' ? undefined : `amount-${update.tone}`}>{update.title}</strong>
      {update.context ? <small>{update.context}</small> : null}
    </li>
  );
}

export function PropertyPulse({ rows }: { rows: PropertyPulseRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="property-health" aria-label="Property health">
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={`/properties/${row.id}`}>
              <strong>{row.name}</strong>
              <small>{row.detail}</small>
              {row.status ? <b data-status={row.status}>{row.status}</b> : null}
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
    <section className="upcoming-dates" aria-label="Coming up">
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

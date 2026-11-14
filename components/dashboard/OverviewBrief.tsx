'use client';

import Link from 'next/link';
import type { BriefUpdate, OverviewBrief, UpcomingDate } from '@/lib/overviewBrief';

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
      {brief.more && <Link className="overview-brief-more" href="/ledger">View activity</Link>}
    </section>
  );
}

function BriefUpdateRow({ update }: { update: BriefUpdate }) {
  return (
    <li data-lead={update.lead ? 'true' : undefined}>
      <strong className={update.tone === 'positive' ? 'amount-positive' : update.tone === 'negative' ? 'amount-negative' : undefined}>{update.title}</strong>
      {update.context ? <small>{update.context}</small> : null}
    </li>
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

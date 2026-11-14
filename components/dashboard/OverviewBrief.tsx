'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BriefUpdate, OverviewBrief, UpcomingDate } from '@/lib/overviewBrief';

export function DailyBrief({ brief }: { brief: OverviewBrief }) {
  const updates = brief.updates;
  const [page, setPage] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  if (!updates.length) return null;
  const safePage = Math.min(page, updates.length - 1);

  function onScroll() {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>('.insight-card');
    if (!el || !card) return;
    const step = card.getBoundingClientRect().width + 12;
    const next = Math.max(0, Math.min(updates.length - 1, Math.round(el.scrollLeft / Math.max(step, 1))));
    setPage((current) => (current === next ? current : next));
  }

  return (
    <section className="insight-strip" aria-label="Portfolio insights" aria-roledescription="carousel" data-autoplay="false">
      <div className={updates.length > 1 ? 'insight-strip-row' : undefined}>
        {updates.length > 1 ? <button type="button" className="insight-arrow" aria-label="Previous insight" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={16} aria-hidden="true" /></button> : null}
        <div className="insight-scroller" ref={scroller} onScroll={onScroll}>
          {updates.map((update, index) => (
            <InsightCard key={update.id} update={update} hidden={index !== safePage} />
          ))}
        </div>
        {updates.length > 1 ? <button type="button" className="insight-arrow" aria-label="Next insight" disabled={safePage >= updates.length - 1} onClick={() => setPage((current) => Math.min(updates.length - 1, current + 1))}><ChevronRight size={16} aria-hidden="true" /></button> : null}
      </div>
    </section>
  );
}

function InsightCard({ update, hidden }: { update: BriefUpdate; hidden: boolean }) {
  const tone = update.tone === 'positive' ? 'amount-positive' : update.tone === 'negative' ? 'amount-negative' : undefined;
  const Mark = update.tone === 'negative' ? ArrowDown : update.lead ? null : update.tone === 'positive' ? ArrowUp : null;
  return (
    <article className="insight-card" data-hidden={hidden ? 'true' : undefined}>
      <strong className={tone}>{Mark ? <Mark size={16} aria-hidden="true" /> : null}<span>{update.title}</span></strong>
      {update.context ? <small>{update.context}</small> : null}
    </article>
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

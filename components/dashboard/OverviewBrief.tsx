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
      <div className="insight-strip-row">
        <div className="insight-scroller" ref={scroller} onScroll={onScroll}>
          {updates.map((update, index) => (
            <InsightCard
              key={update.id}
              update={update}
              hidden={index !== safePage}
              paged={updates.length > 1}
              atStart={safePage === 0}
              atEnd={safePage >= updates.length - 1}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={() => setPage((current) => Math.min(updates.length - 1, current + 1))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function InsightCard({ update, hidden, paged, atStart, atEnd, onPrevious, onNext }: { update: BriefUpdate; hidden: boolean; paged: boolean; atStart: boolean; atEnd: boolean; onPrevious: () => void; onNext: () => void }) {
  const tone = update.tone === 'positive' ? 'amount-positive' : update.tone === 'negative' ? 'amount-negative' : undefined;
  const Mark = update.tone === 'negative' ? ArrowDown : ArrowUp;
  const actionLabel = update.tone === 'negative' ? 'Review' : 'Open';
  return (
    <article className="insight-card" data-tone={update.tone} data-hidden={hidden ? 'true' : undefined}>
      <span className={tone ? `insight-mark ${tone}` : 'insight-mark'} aria-hidden="true"><Mark size={16} /></span>
      <div className="insight-copy">
        {update.when ? <span className="insight-meta">{update.when}</span> : null}
        <strong className={tone}>{update.title}</strong>
        {update.context ? <small>{update.context}</small> : null}
      </div>
      <Link href="/notifications" className="insight-action">{actionLabel}</Link>
      {paged ? <div className="insight-nav">
        <button type="button" aria-label="Previous insight" disabled={atStart} onClick={onPrevious}><ChevronLeft size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Next insight" disabled={atEnd} onClick={onNext}><ChevronRight size={16} aria-hidden="true" /></button>
      </div> : null}
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

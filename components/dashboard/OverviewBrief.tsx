'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BriefUpdate, OverviewBrief, UpcomingDate } from '@/lib/overviewBrief';

const PAGE_SIZE = 3;

export function DailyBrief({ brief }: { brief: OverviewBrief }) {
  const updates = brief.updates;
  const [page, setPage] = useState(0);
  const [dot, setDot] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  if (!updates.length) return null;
  const pages = Math.ceil(updates.length / PAGE_SIZE);
  const safePage = Math.min(page, pages - 1);

  function onScroll() {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>('.insight-card');
    if (!el || !card) return;
    const step = card.getBoundingClientRect().width + 12;
    const next = Math.round(el.scrollLeft / Math.max(step, 1));
    setDot((current) => (current === next ? current : next));
  }

  return (
    <section className="insight-strip" aria-label="Portfolio insights" aria-roledescription="carousel" data-autoplay="false">
      <div className={pages > 1 ? 'insight-strip-row' : undefined}>
        {pages > 1 ? <button type="button" className="insight-arrow" aria-label="Previous insights" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={16} aria-hidden="true" /></button> : null}
        <div className="insight-scroller" ref={scroller} onScroll={onScroll}>
          {updates.map((update, index) => (
            <InsightCard key={update.id} update={update} hidden={index < safePage * PAGE_SIZE || index >= safePage * PAGE_SIZE + PAGE_SIZE} />
          ))}
        </div>
        {pages > 1 ? <button type="button" className="insight-arrow" aria-label="Next insights" disabled={safePage >= pages - 1} onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}><ChevronRight size={16} aria-hidden="true" /></button> : null}
      </div>
      {updates.length > 1 ? <div className="insight-dots" aria-hidden="true">{updates.map((update, index) => <i key={update.id} data-active={index === dot ? 'true' : undefined} />)}</div> : null}
    </section>
  );
}

function InsightCard({ update, hidden }: { update: BriefUpdate; hidden: boolean }) {
  const tone = update.tone === 'positive' ? 'amount-positive' : update.tone === 'negative' ? 'amount-negative' : undefined;
  const Mark = update.tone === 'negative' ? ArrowDown : update.lead ? null : update.tone === 'positive' ? ArrowUp : null;
  return (
    <article className="insight-card" data-hidden={hidden ? 'true' : undefined}>
      <strong className={tone}>{Mark ? <Mark size={14} aria-hidden="true" /> : null}{update.title}</strong>
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

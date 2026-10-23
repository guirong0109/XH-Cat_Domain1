import { useState } from 'react';
import Chip from './Chip.jsx';
import SourceNote from './SourceNote.jsx';
import { confidenceBadge, feedState, filterItems, groupFilters, itemMeta, reviewBadge, skillTags, summaryLine } from '../lib/emergingView.js';

const TONE = {
  high: 'bg-[#CCFBF1] text-[#115E59]',
  medium: 'bg-amber-100 text-amber-900',
  low: 'bg-slate-100 text-slate-700',
  reviewed: 'bg-green-100 text-green-900',
  pending: 'border border-slate-300 bg-white text-slate-700',
};

function Badge({ tone, children }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}

function Item({ item }) {
  const confidence = confidenceBadge(item.confidence);
  const review = reviewBadge(item.review);
  const summary = summaryLine(item);
  return (
    <li className="flex flex-col gap-1.5 border-t border-slate-200 py-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={confidence.tone}>{confidence.text}</Badge>
        <Badge tone={review.tone}>{review.text}</Badge>
      </div>
      <p className="m-0 text-[15px] font-semibold break-words">{item.title}</p>
      {summary && <p className="m-0 text-[13px] text-slate-700">{summary}</p>}
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-xs">
        {(item.fields ?? []).map((name) => (
          <li key={name} className="rounded-md bg-sky-100 px-2 py-0.5 text-sky-900">
            {name}
          </li>
        ))}
        {skillTags(item).map((tag) => (
          <li key={tag.name} className={`rounded-md px-2 py-0.5 ${tag.note ? 'bg-orange-100 text-orange-900' : 'bg-sky-100 text-sky-900'}`}>
            {tag.name}
            {tag.note ? ` · ${tag.note}` : ''}
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-slate-600">{itemMeta(item)}</p>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-[#0F766E] underline"
      >
        Open source<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}

// "Emerging this week": real headlines with a source link and date. Information only; it never changes a score.
export default function EmergingFeed({ emerging, now }) {
  const [group, setGroup] = useState('All');
  const state = feedState(emerging, now);
  if (state.kind === 'hidden') return null;
  const items = emerging.items ?? [];
  const filters = groupFilters(items);
  const shown = filterItems(items, filters.includes(group) ? group : 'All');

  return (
    <section aria-labelledby="emerging-heading" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="emerging-heading" className="m-0 text-lg font-bold">
          Emerging this week
        </h2>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-900">Not part of the score</span>
      </div>
      {state.kind === 'empty' ? (
        <>
          <p className="m-0 text-sm text-slate-700">No new items this week.</p>
          <p className="m-0 text-xs text-slate-600">{state.checkedLine}</p>
        </>
      ) : (
        <>
          <p className="m-0 text-sm text-slate-600">
            {state.checkedLine} Headlines from public sources. Summaries are AI-written estimates.
          </p>
          {state.stale && <p role="status" className="m-0 rounded-[10px] bg-orange-50 px-3 py-2 text-[13px] text-orange-900">{state.stale}</p>}
          {state.taggingNote && <p className="m-0 text-xs text-slate-600">{state.taggingNote}</p>}
          {filters.length > 2 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by job group">
              {filters.map((name) => (
                <Chip key={name} small pressed={group === name} onClick={() => setGroup(name)}>
                  {name}
                </Chip>
              ))}
            </div>
          )}
          <ul className="m-0 flex list-none flex-col p-0" aria-live="polite">
            {shown.map((item) => (
              <Item key={item.id} item={item} />
            ))}
          </ul>
          <SourceNote className="border-t border-slate-200 pt-2.5">
            Confidence depends on the type of source, not on the AI. It does not say a story is true. Pending items are not yet checked by the
            team. The AI only suggests tags and a short summary. Estimates only.
          </SourceNote>
        </>
      )}
    </section>
  );
}

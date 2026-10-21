import SourceNote from './SourceNote.jsx';
import { researchRows } from '../lib/research.js';
import { formatDate } from '../lib/roleView.js';

const nf = new Intl.NumberFormat('en-US');

function changeText(pct) {
  return pct < 0 ? `−${Math.abs(pct)}%` : `+${pct}%`;
}

function Row({ row }) {
  const width = Math.min(100, Math.max(0, row.changePct));
  const counts = `${nf.format(row.earlier)} → ${nf.format(row.later)}`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)_150px] sm:gap-x-2.5">
      <span className="min-w-0">{row.label}</span>
      <span className="font-bold text-indigo-800 sm:order-3">
        {changeText(row.changePct)} <span className="font-normal text-slate-600">({counts})</span>
      </span>
      <div
        role="img"
        aria-label={`${row.label}: AI research papers changed ${changeText(row.changePct)}, from ${counts}`}
        className="col-span-2 h-3 rounded bg-slate-100 sm:order-2 sm:col-span-1"
      >
        <div className="h-3 rounded bg-indigo-600" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

// Radar card: how fast AI-related research is growing in each skill area (OpenAlex).
export default function ResearchMomentum({ research, refreshStatus }) {
  const { rows, tooFew, years } = researchRows(research);
  const fetchedAt = research?.source?.fetchedAt;

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-extrabold">AI research momentum</h2>
          {years && (
            <p className="m-0 mt-1 text-[13px] text-slate-600">
              How fast AI research is moving into each skill area. AI-related papers per year, {years[0]} → {years[1]}.
            </p>
          )}
        </div>
        {years && (
          <span className="flex-none rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
            Live source
          </span>
        )}
      </div>

      {!years ? (
        <>
          <p className="m-0 text-sm text-slate-700">AI research data not loaded yet. Press Refresh data.</p>
          {refreshStatus === 'failed' && (
            <p className="m-0 text-sm text-slate-700">The free OpenAlex daily limit may be used up. Try again tomorrow.</p>
          )}
        </>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {rows.map((row) => (
                <Row key={row.label} row={row} />
              ))}
            </ul>
          )}
          {tooFew.length > 0 && (
            <div className="rounded-[10px] bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
              <strong>Too few papers to show a trend</strong> (under 30 a year):{' '}
              {tooFew.map((item) => `${item.label} (${nf.format(item.earlier)} → ${nf.format(item.later)})`).join(', ')}.{' '}
              That does not mean AI ignores them.
            </div>
          )}
          <SourceNote className="border-t border-slate-200 pt-2.5">
            Source: OpenAlex (open research index, CC0), papers whose title or abstract mention the skill area together
            with &quot;artificial intelligence&quot;, &quot;machine learning&quot; or &quot;large language model&quot;.
            Search phrase per skill: our team&apos;s mapping (draft). Counts research activity, not jobs. The current
            year is left out because it is incomplete.
            {fetchedAt ? ` Fetched ${formatDate(fetchedAt)}.` : ''} Estimates only.
          </SourceNote>
        </>
      )}
    </section>
  );
}

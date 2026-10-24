import { ageText, freshnessRows, statusText } from '../lib/freshness.js';
import SourceNote from './SourceNote.jsx';

const CHIP = {
  fresh: 'bg-teal-100 text-[#0F766E]',
  old: 'bg-orange-100 text-[#9A3412]',
  missing: 'bg-slate-100 text-slate-700',
};

// When each source was last updated. Old data is still shown (with its date), never hidden.
export default function DataFreshness({ data }) {
  const rows = freshnessRows(data);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div>
        <h2 className="m-0 text-lg font-bold">Data freshness</h2>
        <p className="m-0 mt-1 text-sm text-slate-600">When each source behind this page was last updated.</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5">
            <div>
              <div className="text-sm font-semibold">{row.label}</div>
              <div className="text-xs text-slate-600">
                {row.status === 'missing' ? 'Not updated yet' : `Updated ${row.dateText} (${ageText(row.ageDays)})`}
                {row.note ? ` · ${row.note}` : ''}
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${CHIP[row.status]}`}>{statusText(row)}</span>
          </li>
        ))}
      </ul>
      <SourceNote>
        Data older than its limit is still shown with its date. Press Refresh data on this page to update trends, research and
        links. Course pages are re-checked by a script (a dead course link is hidden and the portal link shows instead). A
        person approves every new course, role or skill.
      </SourceNote>
    </section>
  );
}

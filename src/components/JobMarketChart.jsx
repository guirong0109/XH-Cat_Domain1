import SourceNote from './SourceNote.jsx';
import { jobMarketRows, trendsSourceLine } from '../lib/roleView.js';

// Diverging bars: growth in wage recipients per MASCO major group.
export default function JobMarketChart({ trends }) {
  const source = trends?.source;
  const rows = jobMarketRows(trends?.groups);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div>
        <h2 className="m-0 text-lg font-bold">Job-market signal</h2>
        <p className="m-0 mt-1 text-sm text-slate-600">
          Change in salaried workers by MASCO major group
          {source ? `, ${source.baseYear} to ${source.latestYear}` : ''}
        </p>
      </div>
      {rows.length === 0 ? (
        <p role="status" className="m-0 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-700">
          Trend data not loaded yet — press Refresh.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((row) => (
            <li
              key={row.group}
              className="grid grid-cols-[minmax(0,118px)_minmax(0,1fr)_56px] items-center gap-2.5 text-sm sm:grid-cols-[140px_minmax(0,1fr)_60px]"
            >
              <span>{row.label}</span>
              <div aria-hidden="true" className="relative h-3 rounded bg-slate-100">
                <div className="absolute -top-[3px] -bottom-[3px] left-1/2 w-px bg-slate-400" />
                <div
                  className={`absolute top-0 bottom-0 rounded-[3px] transition-[width] duration-500 ${
                    row.rising ? 'left-1/2 bg-[#0F766E]' : 'right-1/2 bg-[#C2410C]'
                  }`}
                  style={{ width: `${row.width}%` }}
                />
              </div>
              <span className={`text-right font-semibold tabular-nums ${row.rising ? 'text-[#0F766E]' : 'text-[#C2410C]'}`}>
                {row.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <SourceNote className="border-t border-slate-200 pt-2.5">
        {source
          ? `${trendsSourceLine(source)} Bars end at ±35%.`
          : 'Source: OpenDOSM wages_occupation (not fetched yet).'}
      </SourceNote>
    </section>
  );
}

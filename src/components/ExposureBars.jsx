import SourceNote from './SourceNote.jsx';
import { exposureShares, exposureSourceText } from '../lib/roleView.js';

const LEGEND = [
  { label: 'Automatable', color: 'bg-[#C2410C]' },
  { label: 'AI-assisted', color: 'bg-[#0F766E]' },
  { label: 'Human-led', color: 'bg-slate-300' },
];

// Real share of each role's eMASCO tasks by AI-exposure label.
export default function ExposureBars({ roles }) {
  const anySample = roles.some((role) => role.labelSource === 'manual');
  const mixed = anySample && roles.some((role) => role.labelSource !== 'manual');

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="m-0 text-lg font-bold">AI exposure of job tasks</h2>
          <p className="m-0 mt-1 text-sm text-slate-600">Share of each top role’s eMASCO tasks</p>
        </div>
        {anySample && (
          <span className="flex-none rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">SAMPLE</span>
        )}
      </div>
      <div className="flex flex-wrap gap-3.5 text-[13px] text-slate-700">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded-[3px] ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {roles.map((role) => {
          const share = exposureShares(role);
          return (
            <li key={role.id} className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="min-w-0">
                  {role.title}
                  {mixed && role.labelSource === 'manual' && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-900">Sample</span>
                  )}
                </span>
                <span className="flex-none text-slate-600">MASCO {role.code}</span>
              </div>
              <div aria-hidden="true" className="flex h-3 overflow-hidden rounded">
                <div className="bg-[#C2410C] transition-[width] duration-500" style={{ width: `${share.automatable}%` }} />
                <div className="bg-[#0F766E] transition-[width] duration-500" style={{ width: `${share.assisted}%` }} />
                <div className="bg-slate-300 transition-[width] duration-500" style={{ width: `${share.human}%` }} />
              </div>
              <div className="text-xs text-slate-600">
                Automatable {share.automatable}% · AI-assisted {share.assisted}% · Human-led {share.human}%
              </div>
            </li>
          );
        })}
      </ul>
      <SourceNote className="border-t border-slate-200 pt-2.5">{exposureSourceText(roles)}</SourceNote>
    </section>
  );
}

import SdgTag from './SdgTag.jsx';
import { MATCH_LABEL, matchAria, matchText } from '../lib/skillMatchView.js';
import { READY_AT, cardEntries, cardGaps, readyText, trendLine } from '../lib/overviewView.js';

// Overview cards: one per role. Shown on the Your roles page and under the radar on Matches.
export default function RoleCards({ entries, profile, ctx, scenario, trends, sdgInfo, activeId = null, onOpen, onChange }) {
  const cards = cardEntries(entries);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
      {cards.map(({ role, score }) => {
        const gaps = cardGaps(role, profile, ctx.similar, scenario);
        const trend = trendLine(role, trends);
        const pct = score.matchAvailable ? Math.round(score.match) : 0;
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onOpen?.(role.id)}
            aria-label={`${matchAria(role, score)}. Open this role.`}
            className={`fr-card box-border flex min-h-11 cursor-pointer flex-col gap-2 rounded-2xl border bg-white p-4 text-left ${
              activeId === role.id ? 'border-2 border-[#0F172A]' : 'border-slate-200'
            }`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="text-base font-bold text-[#0F172A]">{role.title}</span>
              <span className="flex flex-wrap justify-end gap-1">
                {role.sdgs.map((goal) => (sdgInfo?.[goal] ? <SdgTag key={goal} info={sdgInfo[goal]} /> : null))}
              </span>
            </span>
            <span className="text-[28px] font-extrabold tabular-nums text-[#0F172A]">
              {matchText(score)}{' '}
              <span className="text-[13px] font-normal text-slate-600">{score.matchAvailable ? 'your match' : MATCH_LABEL}</span>
            </span>
            <span aria-hidden="true" className="relative h-2 rounded bg-slate-100">
              <span className="block h-full rounded bg-[#0F766E]" style={{ width: `${pct}%` }} />
              <span className="absolute -top-0.5 h-3 border-l-2 border-dashed border-slate-500" style={{ left: `${READY_AT}%` }} />
            </span>
            <span className="text-xs text-slate-600">
              {readyText(score)} (ready line {READY_AT}%)
            </span>
            <span className="mt-1 text-xs font-semibold text-slate-600">Biggest gaps (how much each skill counts)</span>
            {gaps.length ? (
              gaps.map((gap) => (
                <span key={gap.label} className="flex flex-col gap-0.5 text-[13px] text-slate-800">
                  <span className="flex justify-between gap-2">
                    <span>{gap.label}</span>
                    <span className="font-semibold text-[#C2410C] tabular-nums">{gap.weight}</span>
                  </span>
                  <span aria-hidden="true" className="h-1.5 rounded bg-slate-100">
                    <span className="block h-full rounded bg-[#C2410C]" style={{ width: `${Math.min(100, gap.weight)}%` }} />
                  </span>
                </span>
              ))
            ) : (
              <span className="text-[13px] text-slate-700">No gaps: every listed skill is covered.</span>
            )}
            <span className="mt-1 border-t border-slate-200 pt-2 text-xs text-slate-700">
              <strong className={trend.rising === false ? 'text-[#C2410C]' : 'text-[#0F766E]'}>{trend.text}</strong>
              {trend.source && <span className="block text-slate-600">{trend.source}</span>}
            </span>
          </button>
        );
      })}
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          className="fr-btn flex min-h-[120px] cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[#0F766E] bg-white p-4 text-center font-semibold text-[#0F766E]"
        >
          + Add or change roles
        </button>
      )}
    </div>
  );
}

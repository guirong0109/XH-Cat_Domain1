import SdgTag from './SdgTag.jsx';
import { skillStatus } from '../lib/scoring.js';
import { ILO_NO_MATCH, RANGE_NOTE, exposureShares, groupLabel, iloView, labelOrigin, scoreBreakdown } from '../lib/roleView.js';
import { useTween } from '../lib/useTween.js';

const SKILL_LOOK = {
  have: 'border border-[#0F766E] bg-[#0F766E] text-white',
  similar: 'border-2 border-[#0F766E] bg-white text-[#0F766E]',
  gap: 'border-2 border-dashed border-[#C2410C] bg-white text-[#9A3412]',
};
const SKILL_STATUS_TEXT = { have: 'you have it', similar: 'similar skill, half credit', gap: 'gap to learn' };

// One ranked role. Layout props (top, minHeight, cardRef) come from Roles,
// which positions cards by rank while keeping a stable DOM order.
export default function RoleCard({
  role,
  score,
  range,
  rank,
  total,
  expanded,
  onToggle,
  onPathway,
  profile,
  similar,
  sdgInfo,
  scenario,
  trends,
  top = 0,
  minHeight,
  cardRef,
}) {
  const shownMatch = useTween({ match: score.match }).match;
  const interestMatch = profile.interests.includes(role.interest);
  const breakdown = expanded ? scoreBreakdown(role, score, scenario, trends) : null;
  const ilo = iloView(role);
  const shares = exposureShares(role);
  const panelId = `why-${role.id}`;
  const first = rank === 1;

  return (
    <article
      ref={cardRef}
      role="listitem"
      aria-posinset={rank}
      aria-setsize={total}
      aria-labelledby={`title-${role.id}`}
      style={{ order: rank, '--card-top': `${top}px`, '--card-min': `${minHeight}px` }}
      className={`fr-card fr-role-card box-border rounded-2xl border bg-white p-4 sm:absolute sm:inset-x-0 sm:top-[var(--card-top)] sm:min-h-[var(--card-min)] sm:px-[22px] sm:py-5 ${
        first ? 'border-teal-300' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-[18px] gap-y-3">
        <div
          className={`flex size-10 flex-none items-center justify-center rounded-xl text-lg font-extrabold ${
            first ? 'bg-[#0F766E] text-white' : 'bg-slate-100 text-[#0F172A]'
          }`}
        >
          <span className="sr-only">Rank </span>
          {rank}
        </div>
        <div className="flex min-w-0 flex-[999_1_300px] flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 id={`title-${role.id}`} className="m-0 text-[19px] font-bold">
              {role.title}
            </h2>
            <span className="text-[13px] text-slate-600">
              MASCO {role.code} · {groupLabel(role.group)}
            </span>
            {interestMatch && (
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                Matches your interest
              </span>
            )}
            {role.labelSource === 'manual' && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Sample labels</span>
            )}
            {ilo && (
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">{ilo.badge}</span>
            )}
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Skills for this role">
            {role.skills.map((skill) => {
              const status = skillStatus(skill.label, profile.skills, similar);
              return (
                <li key={skill.label} className={`rounded-full px-2.5 py-0.5 text-[13px] ${SKILL_LOOK[status]}`}>
                  {skill.label}
                  <span className="sr-only"> ({SKILL_STATUS_TEXT[status]})</span>
                </li>
              );
            })}
          </ul>
          {role.sdgs?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {role.sdgs.map((goal) => (sdgInfo[goal] ? <SdgTag key={goal} info={sdgInfo[goal]} /> : null))}
            </div>
          )}
        </div>
        <div className="flex min-w-[min(100%,250px)] flex-[1_1_250px] flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] text-slate-600" title="Lowest to highest match across the two AI scenarios">
              Match · range {range.low}–{range.high}
            </span>
            <span className="text-[30px] font-extrabold tabular-nums">
              <span aria-hidden="true">{Math.round(shownMatch)}</span>
              <span className="sr-only">Match {Math.round(score.match)} out of 100</span>
            </span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-[#0F766E]" style={{ width: `${Math.min(100, Math.max(0, shownMatch))}%` }} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={onToggle}
              className="fr-btn min-h-11 flex-1 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-2 text-sm whitespace-nowrap"
            >
              {expanded ? 'Hide details' : 'Why this score?'}
            </button>
            <button
              type="button"
              onClick={onPathway}
              aria-label={`Pathway to ${role.title}`}
              className="fr-btn min-h-11 flex-1 cursor-pointer rounded-[10px] border-0 bg-[#0F766E] px-2 text-sm font-bold text-white hover:bg-[#115E59]"
            >
              Pathway
            </button>
          </div>
        </div>
      </div>
      {breakdown && (
        <div id={panelId} className="fr-tip mt-[18px] border-t border-slate-200 pt-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {breakdown.parts.map((part) => (
              <div key={part.key} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <strong>{part.label}</strong>
                  <span className="tabular-nums">{part.value}</span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-slate-100">
                  <div className="h-full" style={{ width: `${Math.min(100, part.width)}%`, background: part.color }} />
                </div>
                <div className="text-[13px] text-slate-700">{part.detail}</div>
                <div className="text-xs text-slate-600">Source: {part.source}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 tabular-nums">
            {breakdown.formula}
          </div>
          <p className="m-0 mt-2 text-[13px] text-slate-600">
            {RANGE_NOTE} This card: {range.low}–{range.high}.
          </p>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            <section className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-3 text-[13px] text-slate-700">
              <h3 className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-[#0F172A]">
                Our task labels (used in the score)
                {role.labelSource === 'manual' && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Sample</span>
                )}
              </h3>
              <p className="m-0 tabular-nums">
                Automatable {shares.automatable}% · AI-assisted {shares.assisted}% · Human-led {shares.human}%
              </p>
              <p className="m-0 text-xs text-slate-600">Estimates from eMASCO tasks; {labelOrigin(role.labelSource)}.</p>
            </section>
            <section className="flex flex-col gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-[13px] text-slate-700">
              <h3 className="m-0 text-sm font-bold text-[#0F172A]">ILO second opinion (not in the score)</h3>
              {ilo ? (
                <>
                  <p className="m-0 tabular-nums">{ilo.scoreText}</p>
                  <p className="m-0">{ilo.iscoText}</p>
                  <p className="m-0">{ilo.mappingNote}</p>
                  <p className="m-0 text-xs text-slate-600">{ilo.sourceText}</p>
                </>
              ) : (
                <p className="m-0">{ILO_NO_MATCH}</p>
              )}
            </section>
          </div>
          <p className="m-0 mt-2 text-[13px] text-slate-600">Two views can disagree. Both are estimates. You decide.</p>
        </div>
      )}
    </article>
  );
}

import { aiReadiness, aiTaskInsights } from '../lib/aiTasks.js';
import { MATCH_FORMULA_NOTE, formulaLine, rowView, similarShareText } from '../lib/skillMatchView.js';

const STATUS_LOOK = {
  covered: 'bg-teal-100 text-teal-900',
  partial: 'bg-amber-100 text-amber-900',
  not_demonstrated: 'bg-orange-100 text-[#9A3412]',
};

const GROUPS = [
  { key: 'assisted', title: 'AI can help with', note: 'drafting, summarising, speeding up' },
  { key: 'automatable', title: 'More likely to be automated', note: 'repeatable, rule-based steps' },
  { key: 'humanLed', title: 'Still led by people', note: 'judgement, responsibility, relationships' },
];

// Inside "Why this score?": how the Current Skill Match is made, the biggest gaps, and AI at work for the role.
export default function SkillMatchPanel({ role, score, profile, ctx, observed }) {
  const result = score.skill;
  if (result.status !== 'ok') {
    return <p className="m-0 text-sm text-slate-700">{result.reason}</p>;
  }
  const rows = result.rows.map(rowView);
  const topGaps = result.gaps.slice(0, 3);
  const insight = aiTaskInsights(role, observed);
  const readiness = aiReadiness(role, profile, ctx);
  const hasTasks = GROUPS.some((group) => insight.groups[group.key].length > 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-sm font-bold">Your skills against this role, skill by skill</h3>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-slate-700">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-col gap-0.5 border-b border-slate-100 pb-1.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="font-semibold text-[#0F172A]">{row.label}</span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_LOOK[row.status]}`}>
                  {row.statusText} · {row.coverageText}
                </span>
              </div>
              <span className="text-xs text-slate-600">{row.importanceText}</span>
              <span>
                You: {row.yours}
                {row.similarityText && <span className="text-xs text-slate-600"> · {row.similarityText}</span>}
              </span>
              <span className="text-xs text-slate-600 tabular-nums">{row.pointsText}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 tabular-nums">{formulaLine(result)}</div>
        <p className="m-0 text-xs text-slate-600">
          {MATCH_FORMULA_NOTE} Skill list: eMASCO {role.code} (MOHR). Weights are a team heuristic from eMASCO’s basic or
          role-specific class; AI exposure does not change them.
          {result.unknownLevelCount > 0 && ` ${result.unknownLevelCount} of your skills have no level set (unknown, not confirmed Basic).`}
        </p>
        {similarShareText(result) && <p className="m-0 text-xs font-semibold text-slate-700">{similarShareText(result)}</p>}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-sm font-bold">Priority improvements</h3>
        {topGaps.length === 0 ? (
          <p className="m-0 text-sm text-slate-700">Every listed skill is covered at Good level or better.</p>
        ) : (
          <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[13px] text-slate-700">
            {topGaps.map((gap) => (
              <li key={gap.label}>
                <strong className="text-[#0F172A]">{gap.label}</strong>: {gap.reason}{' '}
                <span className="text-xs text-slate-600 tabular-nums">
                  (weight {Math.round(gap.importance * 10) / 10} × missing {Math.round((1 - gap.coverage) * 100)}% = gap{' '}
                  {Math.round(gap.gap * 100) / 100})
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
        <h3 className="m-0 text-sm font-bold">AI at work in this role (not part of your Skill Match)</h3>
        {hasTasks ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 text-[13px] text-slate-700">
            {GROUPS.map((group) => (
              <div key={group.key}>
                <p className="m-0 font-semibold text-[#0F172A]">{group.title}</p>
                <p className="m-0 text-xs text-slate-600">{group.note}</p>
                {insight.groups[group.key].length ? (
                  <ul className="m-0 list-disc pl-5">
                    {insight.groups[group.key].map((task) => (
                      <li key={task.text}>{task.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-xs text-slate-600">None of this role’s tasks are labelled this way.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[13px] text-slate-700">No task labels are available for this role.</p>
        )}
        <p className="m-0 text-xs text-slate-600">
          {insight.provenance}. These are estimates on the role’s tasks, not on single skills. {insight.skillLevelNote}
        </p>
        <p className="m-0 text-xs text-slate-700">
          Working with AI: check what it gives you before you use it, keep a person responsible for the result, and do not paste private or confidential data into AI tools.
        </p>
        <div className="rounded-lg bg-slate-50 p-2.5 text-[13px] text-slate-700">
          <p className="m-0 font-semibold text-[#0F172A]">AI Readiness: Not yet assessed</p>
          <p className="m-0">{readiness.reason}</p>
          {readiness.evidence.map((item) => (
            <p key={item.label} className="m-0 text-xs text-slate-600">
              {item.text}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

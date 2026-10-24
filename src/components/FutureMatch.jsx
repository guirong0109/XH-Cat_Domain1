import { useMemo, useState } from 'react';
import { PROFICIENCY_CREDIT, PROFICIENCY_NAME, profileLevel, simulateImprovement } from '../lib/skillMatch.js';
import { simulationLine } from '../lib/skillMatchView.js';

const LEVEL_ORDER = ['basic', 'good', 'expert'];

// Levels the student could still reach for one skill (strictly above today's level on that exact skill).
export function reachableLevels(label, profile) {
  if (!(profile.skills ?? []).includes(label)) return LEVEL_ORDER;
  const now = PROFICIENCY_CREDIT[profileLevel(label, profile).level];
  return LEVEL_ORDER.filter((level) => PROFICIENCY_CREDIT[level] > now);
}

// "If I improve these skills": picks are a what-if on a copy; the real profile never changes.
export default function FutureMatch({ role, profile, ctx, steps }) {
  const [picks, setPicks] = useState({});
  const candidates = useMemo(
    () => steps.map((step) => ({ step, levels: reachableLevels(step.label, profile) })).filter((item) => item.levels.length > 0),
    [steps, profile],
  );
  const changes = useMemo(
    () => Object.entries(picks).map(([label, level]) => ({ label, level })),
    [picks],
  );
  const simulation = useMemo(() => simulateImprovement(role, profile, ctx, changes), [role, profile, ctx, changes]);

  const toggle = (item) =>
    setPicks((current) => {
      if (current[item.step.label]) {
        const next = { ...current };
        delete next[item.step.label];
        return next;
      }
      const level = item.levels.includes(item.step.targetLevel) ? item.step.targetLevel : item.levels[0];
      return { ...current, [item.step.label]: level };
    });

  if (simulation.current.status !== 'ok') return null;
  const hasPicks = changes.length > 0;

  return (
    <section aria-labelledby="future-heading" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <h2 id="future-heading" className="m-0 text-lg font-bold">
        Potential Skill Match
      </h2>
      <p className="m-0 text-sm text-slate-700">
        What if you improve some skills? Pick a skill and the level you could reach. We run the same Skill Match again on a copy of your
        profile. Your real profile does not change.
      </p>
      {candidates.length === 0 ? (
        <p className="m-0 text-sm text-slate-700">No skill is left to improve for this role.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {candidates.map((item) => {
            const checked = Boolean(picks[item.step.label]);
            return (
              <li key={item.step.label} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 px-3 py-1">
                <label className="inline-flex min-h-11 min-w-0 flex-[1_1_200px] cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={checked} onChange={() => toggle(item)} className="size-5 accent-[#0F766E]" />
                  <span>
                    <strong>{item.step.label}</strong>{' '}
                    <span className="text-xs text-slate-600">
                      · now {item.step.coverage > 0 ? `${Math.round(item.step.coverage * 100)}% covered` : 'not demonstrated'}
                    </span>
                  </span>
                </label>
                {checked && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <span className="text-slate-700">Reach</span>
                    <select
                      value={picks[item.step.label]}
                      onChange={(event) => setPicks((current) => ({ ...current, [item.step.label]: event.target.value }))}
                      className="min-h-11 rounded-[10px] border border-slate-300 bg-white px-2"
                    >
                      {item.levels.map((level) => (
                        <option key={level} value={level}>
                          {PROFICIENCY_NAME[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div role="status" aria-live="polite" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
        {hasPicks ? (
          <>
            <p className="m-0 font-bold tabular-nums">{simulationLine(simulation)}</p>
            <p className="m-0 text-xs text-slate-600">
              Assumed: {simulation.applied.map((item) => `${item.label} → ${PROFICIENCY_NAME[item.to]}`).join(', ') || 'no change'}.
            </p>
          </>
        ) : (
          <p className="m-0">
            Current Skill Match: <strong className="tabular-nums">{Math.round(simulation.current.match)}%</strong>. Pick a skill above to
            see what could change.
          </p>
        )}
      </div>
      {hasPicks && (
        <button
          type="button"
          onClick={() => setPicks({})}
          className="fr-btn min-h-11 cursor-pointer self-start rounded-[10px] border border-slate-300 bg-white px-4 text-sm"
        >
          Reset what-if
        </button>
      )}
      <p className="m-0 text-xs text-slate-600">
        Aim: Good level is a planning assumption, not a measured result of any course. Pick another level if you prefer.
      </p>
      <ul className="m-0 list-disc pl-5 text-xs text-slate-600">
        {simulation.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  );
}

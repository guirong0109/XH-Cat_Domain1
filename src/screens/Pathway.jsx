import { buildPathway } from '../lib/scoring.js';
import {
  disclosureText,
  linksForPortal,
  pathwaySdgs,
  progress,
  stepCountText,
  stepSdgs,
  totalHours,
  whyText,
} from '../lib/pathwayView.js';
import SdgTag from '../components/SdgTag.jsx';
import { startingPoint } from '../lib/potential.js';
import SourceNote from '../components/SourceNote.jsx';

export default function Pathway({ data, ctx, profile, scenario, ranked, focusRoleId, doneSkills, onToggleDone, onBack }) {
  const entry = ranked.find((item) => item.role.id === focusRoleId) || ranked[0];
  const role = entry.role;
  const steps = buildPathway(role, profile, ctx, scenario, data.skills.labels);
  const { done, total, percent } = progress(steps, doneSkills);
  const sdgs = pathwaySdgs(role, profile, data.sdg, steps, data.skills.labels);

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-wrap items-start gap-6 px-4 pt-6 pb-16 sm:px-6">
      <section className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="fr-noprint min-h-11 cursor-pointer border-0 bg-transparent p-0 text-sm text-[#0F766E] underline"
          >
            Back to roles
          </button>
          <h1 className="m-0 mt-1.5 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your pathway to {role.title}</h1>
          <p className="m-0 text-slate-600">
            MASCO {role.code} · {total} {total === 1 ? 'step' : 'steps'} · about {totalHours(steps)} hours (estimate) · {done} of {total} done
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Pathway progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2.5 overflow-hidden rounded-[5px] bg-slate-200"
        >
          <div className="h-full bg-[#0F766E] transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>

        {startingPoint(profile.who) && (
          <p className="m-0 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{startingPoint(profile.who)}</p>
        )}

        {steps.length === 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            You already have every listed skill for this role. Talk to your career centre about internships.
          </div>
        )}

        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {steps.map((step, index) => {
            const isDone = doneSkills.includes(step.label);
            return (
              <li
                key={step.label}
                className={`flex items-start gap-4 rounded-2xl border bg-white px-4 py-5 transition-[border-color,opacity] sm:px-[22px] ${
                  isDone ? 'border-teal-300 opacity-75' : 'border-slate-200'
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`flex size-9 flex-none items-center justify-center rounded-full font-bold ${
                    isDone ? 'bg-teal-100 text-[#0F766E]' : 'bg-[#0F766E] text-white'
                  }`}
                >
                  {isDone ? '✓' : index + 1}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="m-0 text-lg font-bold">
                        <span className="sr-only">Step {index + 1}: </span>
                        {step.label}
                      </h2>
                      {(profile.learn || []).includes(step.label) && (
                        <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-[#9A3412]">
                          ★ You want to learn this
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-slate-600">about {step.hours} hours (estimate)</span>
                  </div>
                  {stepSdgs(step.label, data.skills.labels, data.sdg).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-600">Builds skills for:</span>
                      {stepSdgs(step.label, data.skills.labels, data.sdg).map((sdg) => (
                        <SdgTag key={sdg.goal} info={sdg} />
                      ))}
                    </div>
                  )}
                  <div className="text-sm text-slate-700">{whyText(step)}</div>
                  <div className="flex flex-wrap gap-2">
                    {linksForPortal(step.portal).map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="fr-btn inline-flex min-h-11 items-center rounded-[10px] border border-slate-300 bg-white px-3.5 text-sm font-semibold no-underline"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <label className="fr-noprint inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-sm">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => onToggleDone(step.label)}
                      className="size-5 accent-[#0F766E]"
                    />
                    Mark as done
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
        <SourceNote>
          Order: skill with the highest future importance first. Links go to official portals (HRD Corp e-Latih, HRD
          Corp claimable courses, MyTVET). The app does not invent course names. Skill-to-SDG tags: our team's
          mapping (draft), using UN SDG targets. They do not change the score.
        </SourceNote>
      </section>

      <aside className="flex flex-[1_1_320px] flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="m-0 text-lg font-bold">How this path supports the SDGs</h2>
          {sdgs.map((sdg) => (
            <div key={sdg.goal} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-1 size-3.5 flex-none rounded" style={{ background: sdg.color }} />
              <div className="text-sm">
                <strong>{sdg.label}</strong>
                <br />
                {sdg.target}
                {(sdg.stepCount > 0 || sdg.roleGoal) && (
                  <>
                    <br />
                    <span className="font-semibold text-[#0F766E]">
                      {[stepCountText(sdg, steps.length), sdg.roleGoal ? 'role goal' : ''].filter(Boolean).join(' · ')}
                    </span>
                  </>
                )}
                {sdg.chosen && (
                  <>
                    <br />
                    <em className="text-[#0F766E]">You chose this goal: +5 points.</em>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="m-0 text-lg font-bold">Next step is yours</h2>
          <p className="m-0 text-sm text-slate-700">
            Take this plan to your career centre. A counsellor can check it against your goals and situation.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="fr-btn fr-noprint min-h-11 cursor-pointer rounded-[10px] border-0 bg-[#0F766E] font-bold text-white"
          >
            Print this plan
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          {disclosureText(role.labelSource)}
        </div>
      </aside>
    </main>
  );
}

import { useMemo } from 'react';
import Chip from '../components/Chip.jsx';
import RadarChart from '../components/RadarChart.jsx';
import SourceNote from '../components/SourceNote.jsx';
import { roleRadarValues } from '../lib/radar.js';
import { useTween } from '../lib/useTween.js';
import { MIN_SKILLS } from '../lib/navigation.js';


const SCENARIO_NAME = { moderate: 'Moderate AI', fast: 'Fast AI' };

function Card({ children }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">{children}</div>;
}

function interestOptions(data) {
  const seen = [];
  for (const label of [...data.roles.map((role) => role.interest), ...data.samples.flatMap((s) => s.interests)]) {
    if (label && !seen.includes(label)) seen.push(label);
  }
  return seen;
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function Profile({ data, ctx, profile, scenario, ranked, onLoadSample, onToggle, onNext }) {
  const interests = useMemo(() => interestOptions(data), [data]);
  const top = ranked[0];
  const values = top ? roleRadarValues(top.role, profile, ctx.similar, scenario) : null;
  const shownMatch = useTween({ match: top ? top.score.match : 0 }).match;
  const enoughSkills = profile.skills.length >= MIN_SKILLS;
  const trendsSource = data.trends && data.trends.source;

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-wrap items-start gap-6 px-4 pt-6 pb-16 sm:px-6">
      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px]">
        <div>
          <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Tell us about yourself</h1>
          <p className="m-0 text-slate-600">Use a sample profile. No real personal data.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">Load a sample:</span>
          {data.samples.map((sample) => {
            const active = profile.sampleId === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                aria-pressed={active}
                onClick={() => onLoadSample(sample.id)}
                className={`fr-btn min-h-11 cursor-pointer rounded-[10px] border px-3.5 text-sm ${
                  active
                    ? 'border-[#0F766E] bg-teal-100 font-bold text-teal-900'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {sample.label}
              </button>
            );
          })}
        </div>

        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-lg font-bold">Skills you have now</h2>
            <span className="text-[13px] text-slate-600">
              {profile.skills.length} selected · from eMASCO skill statements
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.skills.labels.map(({ label }) => (
              <Chip key={label} pressed={profile.skills.includes(label)} onClick={() => onToggle('skills', label)}>
                {label}
              </Chip>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="m-0 text-lg font-bold">What interests you?</h2>
          <div className="flex flex-wrap gap-2">
            {interests.map((label) => (
              <Chip key={label} pressed={profile.interests.includes(label)} onClick={() => onToggle('interests', label)}>
                {label}
              </Chip>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="m-0 text-lg font-bold">Which UN Sustainable Development Goals matter to you?</h2>
          <p className="m-0 text-sm text-slate-600">
            Roles linked to your goals get +5 points per goal, up to +10. Shown in every score.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.sdg).map(([key, info]) => {
              const goal = Number(key);
              return (
                <Chip key={key} pressed={profile.sdgs.includes(goal)} onClick={() => onToggle('sdgs', goal)}>
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[3px] border border-white"
                    style={{ background: info.color }}
                  />
                  {info.label}
                </Chip>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col items-start gap-3">
          {!enoughSkills && (
            <div
              role="status"
              className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              Pick at least {MIN_SKILLS} skills to see your radar and matched roles. You have {profile.skills.length}{' '}
              so far.
            </div>
          )}
          <button
            type="button"
            disabled={!enoughSkills}
            onClick={onNext}
            className={`fr-btn min-h-[52px] rounded-xl px-6 text-base font-bold ${
              enoughSkills
                ? 'cursor-pointer bg-[#0F766E] text-white hover:bg-[#115E59]'
                : 'cursor-not-allowed bg-slate-200 text-slate-500'
            }`}
          >
            See my Future Skills Radar
          </button>
        </div>
      </section>

      {top && (
        <aside className="flex w-full flex-[1_1_380px] flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-[88px] lg:w-auto">
          <div className="text-xs font-bold tracking-[0.04em] text-slate-600">LIVE PREVIEW</div>
          <div className="text-[15px]">
            Best fit right now: <strong>{top.role.title}</strong>
          </div>
          <div className="flex justify-center">
            <RadarChart
              labels={values.labels}
              you={values.you}
              need={values.need}
              size={360}
              ariaLabel={`Radar of your skills compared with your best-fit role, ${top.role.title}`}
            />
          </div>
          <div className="flex flex-wrap gap-3.5 text-[13px] text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1 w-[18px] rounded-sm bg-[#0F766E]" />
              Your skills
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0 w-[18px] border-t-2 border-dashed border-[#C2410C]" />
              Future need ({SCENARIO_NAME[scenario]})
            </span>
          </div>
          <div className="text-[13px] text-slate-600">
            Match <strong className="text-[#0F172A]">{Math.round(shownMatch)}</strong> · pick more skills and watch it
            grow
          </div>
          <SourceNote>
            Estimate. Skills from eMASCO {top.role.code}
            {top.role.source?.fetchedAt ? `, fetched ${formatDate(top.role.source.fetchedAt)}` : ''}; demand from
            OpenDOSM wages_occupation
            {trendsSource ? `, fetched ${formatDate(trendsSource.fetchedAt)}` : ' (trend data not loaded yet)'}.
          </SourceNote>
        </aside>
      )}
    </main>
  );
}

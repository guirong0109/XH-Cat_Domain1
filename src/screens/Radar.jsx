import Chip from '../components/Chip.jsx';
import ExposureBars from '../components/ExposureBars.jsx';
import JobMarketChart from '../components/JobMarketChart.jsx';
import ResearchMomentum from '../components/ResearchMomentum.jsx';
import ReplanNotice from '../components/ReplanNotice.jsx';
import RadarChart from '../components/RadarChart.jsx';
import SkillsDemand from '../components/SkillsDemand.jsx';
import ScenarioToggle from '../components/ScenarioToggle.jsx';
import SourceNote from '../components/SourceNote.jsx';
import { roleRadarValues } from '../lib/radar.js';
import { SCENARIO_NAME, SCENARIO_NOTE, biggestGaps, formatDate, formatMonth, radarSourceNote } from '../lib/roleView.js';

function YouthCard({ trends }) {
  const youth = trends?.youth;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <h2 className="m-0 text-lg font-bold">Youth unemployment</h2>
      {youth ? (
        <>
          <p className="m-0 text-sm text-slate-700">
            <strong className="text-[28px] font-extrabold text-[#0F172A] tabular-nums">{youth.rate}%</strong> of people
            aged 15–24 in the labour force were unemployed in {formatMonth(youth.month)}. Skills that match rising roles
            help you stand out.
          </p>
          <SourceNote className="border-t border-slate-200 pt-2.5">
            Source: OpenDOSM lfs_month_youth, {formatMonth(youth.month)}. Fetched {formatDate(youth.fetchedAt)}.
          </SourceNote>
        </>
      ) : (
        <p role="status" className="m-0 text-sm text-slate-700">
          Trend data not loaded yet — press Refresh.
        </p>
      )}
    </section>
  );
}

const RESEARCH_PREFIX = 'AI research (OpenAlex): ';

export default function Radar({
  data,
  ctx,
  profile,
  scenario,
  ranked,
  focusRoleId,
  refresh,
  researchRefresh,
  replan,
  onDismissReplan,
  onScenarioChange,
  onFocus,
  onRefresh,
  onSeeRoles,
}) {
  const topThree = ranked.slice(0, 3);
  const focusEntry = ranked.find((entry) => entry.role.id === focusRoleId) || ranked[0];
  const tabs = topThree.some((entry) => entry.role.id === focusEntry.role.id) ? topThree : [...topThree, focusEntry];
  const focus = focusEntry.role;
  const values = roleRadarValues(focus, profile, ctx.similar, scenario);
  const gaps = biggestGaps(focus, profile, ctx.similar, scenario);
  const exposureRoles = ranked.slice(0, 5).map((entry) => entry.role);

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-5 px-4 pt-6 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Future Skills Radar</h1>
          <p className="m-0 text-slate-600">Your skills against what your top roles will need.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ScenarioToggle value={scenario} onChange={onScenarioChange} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refresh.pending}
            aria-busy={refresh.pending}
            className={`fr-btn min-h-11 rounded-[10px] border border-[#0F766E] bg-white px-4 font-semibold text-[#0F766E] ${
              refresh.pending ? 'cursor-wait opacity-70' : 'cursor-pointer'
            }`}
          >
            {refresh.pending ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite" className={refresh.message ? '' : 'sr-only'}>
        {refresh.message && (
          <div
            className={`rounded-xl border px-4 py-2.5 text-sm ${
              refresh.status === 'failed'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-teal-200 bg-teal-50 text-teal-900'
            }`}
          >
            {refresh.message}
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" className={researchRefresh?.message ? '' : 'sr-only'}>
        {researchRefresh?.message && (
          <div
            className={`rounded-xl border px-4 py-2.5 text-sm ${
              researchRefresh.status === 'failed'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-teal-200 bg-teal-50 text-teal-900'
            }`}
          >
            {researchRefresh.message.startsWith(RESEARCH_PREFIX)
              ? researchRefresh.message
              : `${RESEARCH_PREFIX}${researchRefresh.message}`}
          </div>
        )}
      </div>
      {replan && (
        <ReplanNotice
          changes={replan.changes}
          roles={data.roles}
          oldGroups={replan.oldGroups}
          newGroups={replan.newGroups}
          trendsSource={data.trends?.source}
          onSeeRoles={onSeeRoles}
          onDismiss={onDismissReplan}
        />
      )}

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Estimates, not predictions. {SCENARIO_NOTE}
      </div>

      <section className="flex flex-wrap items-center gap-6 rounded-[20px] border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col items-center">
          <RadarChart
            labels={values.labels}
            you={values.you}
            need={values.need}
            ariaLabel={`Radar of your skills compared with ${focus.title} in the ${SCENARIO_NAME[scenario]} scenario`}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <div className="text-sm text-slate-700" id="compare-label">
            Compare with:
          </div>
          <div role="group" aria-labelledby="compare-label" className="flex flex-wrap gap-2">
            {tabs.map((entry) => (
              <Chip
                key={entry.role.id}
                small
                pressed={entry.role.id === focus.id}
                onClick={() => onFocus(entry.role.id)}
              >
                {entry.role.title}
              </Chip>
            ))}
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
          <h2 className="m-0 text-base font-bold">Biggest gaps for {focus.title}</h2>
          {gaps.length ? (
            <ul className="m-0 flex flex-col gap-1.5 pl-[18px] text-sm">
              {gaps.map((gap) => (
                <li key={gap.label}>
                  {gap.label} <span className="text-slate-600">· future importance {gap.importance}/100</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-slate-700">You already have every listed skill for this role.</p>
          )}
          <SourceNote>{radarSourceNote(focus)}</SourceNote>
          <button
            type="button"
            onClick={onSeeRoles}
            className="fr-btn min-h-12 cursor-pointer self-start rounded-xl border-0 bg-[#0F766E] px-[22px] font-bold text-white hover:bg-[#115E59]"
          >
            See all matched roles
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <JobMarketChart trends={data.trends} />
        <ExposureBars roles={exposureRoles} />
      </div>
      <ResearchMomentum research={data.research} refreshStatus={researchRefresh?.status} />
      <SkillsDemand roles={data.roles} trends={data.trends} research={data.research} pickedSkills={profile.skills} learnSkills={profile.learn} />
      <YouthCard trends={data.trends} />
    </main>
  );
}

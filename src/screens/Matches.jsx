import { useLayoutEffect, useRef } from 'react';
import Chip from '../components/Chip.jsx';
import ExposureBars from '../components/ExposureBars.jsx';
import JobMarketChart from '../components/JobMarketChart.jsx';
import RadarChart from '../components/RadarChart.jsx';
import ReplanNotice from '../components/ReplanNotice.jsx';
import ResearchMomentum from '../components/ResearchMomentum.jsx';
import RoleCard from '../components/RoleCard.jsx';
import OtherRoleCard from '../components/OtherRoleCard.jsx';
import { roleEvidenceFor } from '../lib/skillEvidence.js';
import ScenarioToggle from '../components/ScenarioToggle.jsx';
import SkillsDemand from '../components/SkillsDemand.jsx';
import EmergingFeed from '../components/EmergingFeed.jsx';
import DataFreshness from '../components/DataFreshness.jsx';
import { referencesLine } from '../lib/referenceView.js';
import SourceNote from '../components/SourceNote.jsx';
import { bestScoreNote, findField, orderForGoal } from '../lib/goalView.js';
import { roleRadarValues } from '../lib/radar.js';
import { FALLBACK_NOTE, ORDER_NOTE, mergeTop, scoredOf } from '../lib/topMatches.js';
import { matchRange } from '../lib/scoring.js';
import {
  SCENARIO_NAME,
  SCENARIO_NOTE,
  biggestGaps,
  formatDate,
  formatMonth,
  radarSourceNote,
} from '../lib/roleView.js';

const LEGEND = [
  { label: 'You have it', look: 'bg-[#0F766E]' },
  { label: 'Similar skill (half credit)', look: 'border-2 border-[#0F766E] bg-white' },
  { label: 'Gap to learn', look: 'border-2 border-dashed border-[#C2410C] bg-white' },
];

const RESEARCH_PREFIX = 'AI research (OpenAlex): ';

function goalLine(profile, fields) {
  if (profile.goal === 'upgrade') {
    const field = findField(profile, fields);
    return `Your goal: upgrade in your field${field ? ` (${field.label})` : ''}.`;
  }
  if (profile.goal === 'move') {
    const sectors = profile.targetSectors ?? [];
    return `Your goal: move to a new role${sectors.length ? ` (${sectors.join(', ')})` : ''}.`;
  }
  return 'Your goal: not sure yet. Roles are in plain score order.';
}

function YouthCard({ trends }) {
  const youth = trends?.youth;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <h3 className="m-0 text-lg font-bold">Youth unemployment</h3>
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

function RefreshMessage({ state, prefix = '' }) {
  return (
    <div role="status" aria-live="polite" className={state?.message ? '' : 'sr-only'}>
      {state?.message && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            state.status === 'failed' ? 'border-red-200 bg-red-50 text-red-900' : 'border-teal-200 bg-teal-50 text-teal-900'
          }`}
        >
          {prefix && !state.message.startsWith(prefix) ? `${prefix}${state.message}` : state.message}
        </div>
      )}
    </div>
  );
}

export default function Matches({
  data,
  ctx,
  profile,
  scenario,
  ranked,
  top,
  expandedRoleId,
  focusRoleId,
  refresh,
  researchRefresh,
  replan,
  onDismissReplan,
  onScenarioChange,
  onToggleExpanded,
  onFocus,
  onRefresh,
  referencesRefresh,
  onRefreshReferences,
  onStudy,
  onExplore,
}) {
  const goalOrder = orderForGoal(ranked, profile, data.fields);
  // Top 20 across all eMASCO roles when the server answered; else our 20 scored roles in goal order.
  const topOk = top?.status === 'ok';
  const entries = topOk
    ? mergeTop(top.result.roles, ranked)
    : goalOrder.entries.map((entry) => ({ ...entry, kind: 'scored' }));
  const note = topOk ? null : goalOrder.note;
  const best = topOk ? null : bestScoreNote(entries, ranked);
  const scored = scoredOf(entries);
  const listRef = useRef(null);
  // Re-ordering moves card nodes; if that drops focus, put it back.
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  const order = entries.map((entry) => entry.role?.id ?? entry.card.code).join(',');
  useLayoutEffect(() => {
    if (focused && focused.isConnected && document.activeElement !== focused && listRef.current?.contains(focused)) {
      focused.focus({ preventScroll: true });
    }
  }, [order, focused]);

  // Radar: the focused scored role, else the first scored role. Only our 20 roles have the data for it.
  const topThree = scored.slice(0, 3);
  const focusEntry = scored.find((entry) => entry.role.id === focusRoleId) || scored[0] || null;
  const tabs = focusEntry ? (topThree.some((entry) => entry.role.id === focusEntry.role.id) ? topThree : [...topThree, focusEntry]) : [];
  const focus = focusEntry?.role ?? null;
  const values = focus ? roleRadarValues(focus, profile, ctx.similar, scenario) : null;
  const gaps = focus ? biggestGaps(focus, profile, ctx.similar, scenario) : [];
  const exposureRoles = scored.slice(0, 5).map((entry) => entry.role);

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">{topOk ? `Top ${entries.length} roles for you` : 'Roles that match you'}</h1>
          <p className="m-0 text-slate-600">
            {topOk ? ORDER_NOTE : `${goalLine(profile, data.fields)} This changes the order only, not the score.`}
          </p>
          <p className="m-0 mt-1 text-sm text-slate-600">Estimates. {SCENARIO_NOTE}</p>
          <p className="m-0 mt-1 text-sm text-slate-700">
            Looking at other fields?{' '}
            <button
              type="button"
              onClick={onExplore}
              className="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-[#0F766E] underline"
            >
              Explore all roles
            </button>
          </p>
        </div>
        <ScenarioToggle value={scenario} onChange={onScenarioChange} />
      </div>

      {note && (
        <p role="status" className="m-0 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          {note}
        </p>
      )}

      {top?.status === 'loading' && (
        <p role="status" className="m-0 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Looking across all eMASCO roles for your skills… showing our 20 scored roles for now.
        </p>
      )}
      {top?.status === 'failed' && (
        <p role="status" className="m-0 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          {FALLBACK_NOTE}
        </p>
      )}
      {topOk && top.result.source && (
        <p className="m-0 text-xs text-slate-600">
          Source: {top.result.source.occupations}, crawled {formatDate(top.result.source.crawledOn)}. Search for your skills in the eMASCO skill list, then ranking by AI meaning
          (BAAI/bge-m3). {top.result.source.note}
          {top.left?.length > 0 && ` Left out of this ranking because almost every field uses them: ${top.left.join(', ')}.`}
        </p>
      )}

      {best && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[#0F766E] bg-white px-4 py-3 text-sm text-slate-800">
          <p className="m-0 min-w-0 flex-[1_1_260px]">
            Your highest score is <strong>{best.role.title}</strong> ({Math.round(best.match)}), but it is{' '}
            {profile.goal === 'move' ? 'not in the sectors you picked' : 'not linked to your major or sector'}, so it is
            lower in this list.
          </p>
          <button
            type="button"
            onClick={() => {
              const card = document.getElementById(`card-${best.role.id}`);
              if (!card) return;
              const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
              card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
              card.focus({ preventScroll: true });
            }}
            className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-[#0F766E] bg-white px-4 font-semibold text-[#0F766E]"
          >
            Show it
          </button>
        </div>
      )}

      <div
        ref={listRef}
        role="list"
        aria-label={topOk ? 'Top roles for your skills, best fit first' : 'Matched roles, in your goal order'}
        className="flex flex-col gap-3.5"
      >
        {entries.map((entry, index) => {
          if (entry.kind === 'other') {
            return (
              <OtherRoleCard
                key={entry.card.code}
                card={entry.card}
                rank={index + 1}
                total={entries.length}
                observedSource={top.result.observedSource}
                crawledOn={top.result.source?.crawledOn}
              />
            );
          }
          const { role } = entry;
          return (
            <RoleCard
              key={role.id}
              role={role}
              score={entry.score}
              reason={entry.reason}
              range={matchRange(role, profile, ctx)}
              rank={index + 1}
              total={entries.length}
              expanded={expandedRoleId === role.id}
              onToggle={() => onToggleExpanded(role.id)}
              onStudy={() => onStudy(role.id)}
              profile={profile}
              similar={ctx.similar}
              sdgInfo={data.sdg}
              scenario={scenario}
              trends={data.trends}
              references={data.references}
              observed={data.observed?.roles?.[role.code]}
              observedMeta={data.observed}
              skillEvidence={roleEvidenceFor(data.skillEvidence, role.code)}
              skillEvidenceMeta={data.skillEvidence?.meta}
            />
          );
        })}
      </div>

      <section
        aria-label="Explore all roles"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]"
      >
        <p className="m-0 min-w-0 flex-[1_1_320px] text-sm text-slate-700">
          Roles that are not one of our 20 scored roles show a skill fit estimate instead of a full score. Want to search eMASCO yourself?
        </p>
        <button
          type="button"
          onClick={onExplore}
          className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-[#0F766E] bg-white px-4 font-semibold text-[#0F766E]"
        >
          Explore all roles
        </button>
      </section>

      <div className="flex flex-wrap gap-4 text-[13px] text-slate-700">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`box-border size-3 rounded-full ${item.look}`} />
            {item.label}
          </span>
        ))}
      </div>
      <section aria-labelledby="references-heading" className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
        <h2 id="references-heading" className="m-0 text-lg font-bold">
          Check our references
        </h2>
        <p className="m-0 text-sm text-slate-600">
          Re-reads the {data.roles.length} eMASCO role pages and checks every link. It takes about 1 minute. We keep the last good data if a site is down. A role that eMASCO changed is flagged for our team, not changed.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRefreshReferences}
            disabled={referencesRefresh?.pending}
            aria-busy={referencesRefresh?.pending}
            className={`fr-btn min-h-11 rounded-[10px] border border-[#0F766E] bg-white px-4 font-semibold text-[#0F766E] ${
              referencesRefresh?.pending ? 'cursor-wait opacity-70' : 'cursor-pointer'
            }`}
          >
            {referencesRefresh?.pending ? 'Checking… (about 1 minute)' : 'Refresh references'}
          </button>
          <span className="text-xs text-slate-600">{referencesLine(data.references)}</span>
        </div>
        <RefreshMessage state={referencesRefresh} />
      </section>
      <SourceNote>
        These are suggestions to discuss with your career counsellor, not decisions. Scores are estimates; open “Why
        this score?” for the sources and dates.
      </SourceNote>

      <section aria-labelledby="trends-heading" className="mt-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="trends-heading" className="m-0 mb-1.5 text-[22px] font-bold">
              Trends behind your matches
            </h2>
            <p className="m-0 text-slate-600">Your skills against what a role will need, and the job data we use.</p>
          </div>
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
        <RefreshMessage state={refresh} />
        <RefreshMessage state={researchRefresh} prefix={RESEARCH_PREFIX} />
        {replan && (
          <ReplanNotice
            changes={replan.changes}
            roles={data.roles}
            oldGroups={replan.oldGroups}
            newGroups={replan.newGroups}
            trendsSource={data.trends?.source}
            onSeeRoles={() => listRef.current?.scrollIntoView({ block: 'start' })}
            onDismiss={onDismissReplan}
          />
        )}

        {focus ? (
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
                <Chip key={entry.role.id} small pressed={entry.role.id === focus.id} onClick={() => onFocus(entry.role.id)}>
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
            <h3 className="m-0 text-base font-bold">Biggest gaps for {focus.title}</h3>
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
          </div>
        </section>
        ) : (
          <p className="m-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            None of our 20 scored roles is in your top list, so there is no skills radar. Open Explore all roles or change your skills.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <JobMarketChart trends={data.trends} />
          <ExposureBars roles={exposureRoles} />
        </div>
        <ResearchMomentum research={data.research} refreshStatus={researchRefresh?.status} />
        <SkillsDemand
          roles={data.roles}
          trends={data.trends}
          research={data.research}
          pickedSkills={profile.skills}
          learnSkills={profile.learn}
        />
        <EmergingFeed emerging={data.emerging} />
        <DataFreshness data={data} />
        <YouthCard trends={data.trends} />
      </section>
    </main>
  );
}

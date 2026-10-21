import { useState } from 'react';
import SourceNote from './SourceNote.jsx';
import { SHOWN_PER_BAND, displayOrder, skillTrends } from '../lib/skillTrends.js';
import { formatDate, formatGrowth, groupLabel } from '../lib/roleView.js';

const BANDS = [
  {
    key: 'changing',
    title: 'AI is changing these',
    advice: 'Learn to use AI tools with them.',
    mark: 'bg-[#0F766E]',
    chip: 'border border-teal-200 bg-[#F0FDFA]',
  },
  {
    key: 'mixed',
    title: 'Mixed',
    advice: 'AI changes some of the jobs that use them, not others.',
    mark: 'bg-slate-400',
    chip: 'border border-slate-300 bg-slate-50',
  },
  {
    key: 'humanLed',
    title: 'Stays human-led',
    advice: 'Hands-on work that AI cannot easily do.',
    mark: 'bg-[#C2410C]',
    chip: 'border border-orange-300 bg-orange-50',
  },
];

function countText(count) {
  return `${count} ${count === 1 ? 'skill' : 'skills'}`;
}

function Band({ band, skills }) {
  const [showAll, setShowAll] = useState(false);
  const ordered = displayOrder(skills);
  const shown = showAll ? ordered : ordered.slice(0, SHOWN_PER_BAND);
  const hidden = skills.length - shown.length;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 p-3.5">
      <h3 className="m-0 flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden="true" className={`size-3 rounded-[3px] ${band.mark}`} />
        {band.title}
      </h3>
      <p className="m-0 text-[13px] text-slate-700">
        {band.advice} ({countText(skills.length)})
      </p>
      {skills.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[13px]">
          {shown.map((skill) => (
            <li
              key={skill.label}
              title={`Used in ${skill.roleCount} ${skill.roleCount === 1 ? 'role' : 'roles'}; ${skill.exposedCount} in an ILO exposed gradient`}
              className={`rounded-full px-2.5 py-0.5 ${
                skill.have ? 'bg-[#0F766E] text-white' : skill.want ? 'border-2 border-[#C2410C] bg-white' : band.chip
              }`}
            >
              {skill.have && <span aria-hidden="true">✓ </span>}
              {skill.want && <span aria-hidden="true">★ </span>}
              {skill.label} · {skill.iloMean.toFixed(2)}
              {skill.have && <span className="sr-only"> (you have it)</span>}
              {skill.want && <span className="sr-only"> (you want to learn it)</span>}
            </li>
          ))}
        </ul>
      )}
      {skills.length > SHOWN_PER_BAND && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
          className="min-h-11 cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[13px] font-bold text-[#0F766E]"
        >
          {showAll ? 'Show fewer' : `Show all ${skills.length} (${hidden} more)`}
        </button>
      )}
    </div>
  );
}

// Radar card: every skill in the app, by how much AI is changing the jobs that use it.
export default function SkillsDemand({ roles, trends, pickedSkills, learnSkills = [] }) {
  const { bands, jobGroups, anyShrinking } = skillTrends(roles, trends?.groups, pickedSkills, learnSkills);
  const total = bands.changing.length + bands.mixed.length + bands.humanLed.length;
  const source = trends?.source;
  const iloDate = roles.find((role) => role.ilo?.fetchedAt)?.ilo.fetchedAt;
  const growthList = jobGroups.map((entry) => `${groupLabel(entry.group)} ${formatGrowth(entry.growthPct)}`).join(', ');

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold">Skills in demand</h2>
          <p className="m-0 mt-1 text-sm text-slate-600">
            All {total} skills in this app, grouped by how much AI is changing the jobs that use them. ✓ = you have
            it, ★ = you want to learn it.
          </p>
        </div>
        {!anyShrinking && jobGroups.length > 0 && (
          <span className="flex-none rounded-full bg-[#CCFBF1] px-2.5 py-1 text-xs font-bold text-[#115E59]">
            All in growing job groups
          </span>
        )}
      </div>

      {jobGroups.length > 0 && (
        <p className="m-0 rounded-[10px] bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
          Job demand: the skills here are used in {growthList}
          {source ? ` (${source.baseYear} to ${source.latestYear})` : ''}.
          {anyShrinking
            ? ' Some of these job groups are shrinking.'
            : ` No skill in our ${roles.length} roles is in a shrinking job group.`}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        {BANDS.map((band) => (
          <Band key={band.key} band={band} skills={bands[band.key]} />
        ))}
      </div>

      <p className="m-0 text-[13px] text-slate-700">
        How to read it: the number is the average ILO GenAI exposure (0 = none, 1 = full) of the jobs that use the
        skill. A skill is “changing” when most of those jobs are in an ILO exposed gradient.
      </p>
      <SourceNote className="border-t border-slate-200 pt-2.5">
        Sources: job growth from OpenDOSM wages_occupation
        {source?.fetchedAt ? `, fetched ${formatDate(source.fetchedAt)}` : ''}. AI exposure from ILO Working Paper 140
        (2025), Table A1{iloDate ? `, imported ${formatDate(iloDate)}` : ''}, via our team&apos;s MASCO-to-ISCO mapping
        (draft). Based on the {roles.length} roles in this app. Estimates only.
      </SourceNote>
    </section>
  );
}

import { useState } from 'react';
import CourseLinks from './CourseLinks.jsx';
import {
  ILO_ROWS_SHOWN,
  STATUS_LABEL,
  TYPE_ADVICE,
  TYPE_LABEL,
  exposureText,
  filterRows,
  papersText,
  skillsVsAi,
  statusCounts,
} from '../lib/skillsVsAi.js';
import SourceNote from './SourceNote.jsx';

const TYPE_STYLE = {
  aiExposed: 'bg-orange-100 text-[#9A3412]',
  mixed: 'bg-slate-100 text-slate-700',
  humanLed: 'bg-teal-100 text-[#0F766E]',
  unrated: 'bg-slate-100 text-slate-600',
};
const STATUS_STYLE = {
  missing: 'bg-red-50 text-[#991B1B]',
  buildUp: 'bg-amber-100 text-amber-900',
  onTrack: 'bg-teal-100 text-[#0F766E]',
};
const FILTERS = [
  ['all', 'All'],
  ['missing', 'Missing'],
  ['buildUp', 'Build up'],
  ['onTrack', 'On track'],
];

// One role at a time (the pathway's role). Information only: it never changes a score.
export default function SkillsVsAi({ role, profile, ctx, data }) {
  const [filter, setFilter] = useState('all');
  const rows = skillsVsAi({
    role,
    profile,
    similar: ctx.similar,
    roles: data.roles,
    trendGroups: data.trends?.groups,
    research: data.research,
    skillLabels: data.skills.labels,
  });
  const counts = statusCounts(rows);
  const shown = filterRows(rows, filter);
  const iloDate = data.roles.find((item) => item.ilo?.fetchedAt)?.ilo.fetchedAt;
  const researchDate = data.research?.source?.fetchedAt?.slice(0, 10);

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div>
        <h2 className="m-0 text-lg font-bold">Your skills vs AI today · {role.title}</h2>
        <p className="m-0 mt-1 text-sm text-slate-600">
          Each skill of this role: how exposed it is to AI, and where you stand. Not part of the score.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter skills by status">
        {FILTERS.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold ${
              filter === key ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-300 bg-white text-slate-800'
            }`}
          >
            {text} ({counts[key]})
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="m-0 text-sm text-slate-600">No skills in this group.</p>}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((row) => {
          const evidence = [exposureText(row.exposure), papersText(row.papers)].filter(Boolean);
          return (
            <li key={row.label} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-base font-bold">{row.label}</h3>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TYPE_STYLE[row.type]}`}>
                    {TYPE_LABEL[row.type]}
                  </span>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[row.status]}`}>
                  {STATUS_LABEL[row.status]}
                </span>
              </div>
              <div className="text-sm text-slate-700">
                You: <strong>{row.you}</strong>
              </div>
              <div className="text-sm text-slate-700">
                Why: {TYPE_ADVICE[row.type]}
              </div>
              {row.iloRows.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 text-[13px] text-slate-600">
                  <span>ILO 2025, Table A1:</span>
                  {row.iloRows.slice(0, ILO_ROWS_SHOWN).map((ilo) => (
                    <a
                      key={ilo.isco}
                      href={ilo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center font-semibold text-[#0F766E]"
                    >
                      ISCO {ilo.isco} {ilo.title}
                    </a>
                  ))}
                  {row.iloRows.length > ILO_ROWS_SHOWN && <span>and {row.iloRows.length - ILO_ROWS_SHOWN} more occupations</span>}
                </div>
              )}
              {evidence.map((line) => (
                <div key={line} className="text-[13px] text-slate-600">
                  {line}
                </div>
              ))}
              {row.status !== 'onTrack' && (
                <CourseLinks
                  skillInfo={data.skills.labels.find((item) => item.label === row.label)}
                  who={profile.who}
                  references={data.references}
                />
              )}
            </li>
          );
        })}
      </ul>
      <SourceNote>
        Type = how many of our roles that use the skill sit in ILO exposed groups (ILO Working Paper 140, 2025
        {iloDate ? `, fetched ${iloDate}` : ''}; the MASCO-to-ISCO link is our team's draft mapping). Paper counts: OpenAlex
        {researchDate ? `, fetched ${researchDate}` : ''}. These are estimates, not predictions for one person. Courses are
        real pages on the official portals.
      </SourceNote>
    </section>
  );
}

// "Your skills vs AI today": for one role, each skill with its AI type, the student's
// status and the evidence. Pure helpers. Type comes only from the ILO 2025 exposure of the
// roles that use the skill (same rule as Skills in demand). It never changes the score.
// Not built: "how do you do this today" and "New AI skill" (no data to decide it from).
import { skillStatus } from './scoring.js';
import { PROFICIENCY_NAME, profileLevel } from './skillMatch.js';
import { skillTrends } from './skillTrends.js';
import { momentum } from './research.js';
import { iloRowUrl } from './roleView.js';

export const ILO_ROWS_SHOWN = 3;

// The ILO Table A1 rows behind a skill's type: one per distinct ISCO occupation among the roles
// that use it, most exposed first, each with its own link.
function iloRowsFor(label, roles) {
  const byIsco = new Map();
  for (const item of roles) {
    if (!item.ilo?.iscoTitle || byIsco.has(item.ilo.isco)) continue;
    if (item.skills.some((skill) => skill.label === label)) byIsco.set(item.ilo.isco, item.ilo);
  }
  return [...byIsco.values()]
    .sort((a, b) => b.mean - a.mean || a.isco.localeCompare(b.isco))
    .map((ilo) => ({ isco: ilo.isco, title: ilo.iscoTitle, url: iloRowUrl(ilo) }));
}

export const TYPE_LABEL = { aiExposed: 'AI-exposed', mixed: 'Mixed', humanLed: 'Human-led', unrated: 'Not rated' };

const TYPE_FOR_BAND = { changing: 'aiExposed', mixed: 'mixed', humanLed: 'humanLed' };

export const TYPE_ADVICE = {
  aiExposed: 'Most roles that use this skill are in ILO groups where AI can do much of the work. Learn to do it with AI tools.',
  mixed: 'Roles that use this skill are split between AI-exposed and less exposed ILO groups.',
  humanLed: 'Few roles that use this skill are in ILO exposed groups. Keep building it and use AI as a helper.',
  unrated: 'The roles that use this skill have no ILO rating, so we do not give it a type.',
};

export const STATUS_LABEL = { missing: 'Missing', buildUp: 'Build up', onTrack: 'On track' };
const STATUS_ORDER = { missing: 0, buildUp: 1, onTrack: 2 };

function statusFor(label, profile, similar) {
  const status = skillStatus(label, profile.skills, similar);
  if (status === 'gap') return { status: 'missing', you: 'Not yet' };
  if (status === 'similar') return { status: 'buildUp', you: 'A related skill only' };
  const { level, assumed } = profileLevel(label, profile);
  return { status: level === 'basic' ? 'buildUp' : 'onTrack', you: `Level: ${PROFICIENCY_NAME[level]}${assumed ? ' (level unknown)' : ''}` };
}

export function skillsVsAi({ role, profile, similar, roles, trendGroups, research, skillLabels }) {
  const typeInfo = new Map();
  const { bands } = skillTrends(roles, trendGroups, profile.skills);
  for (const [band, list] of Object.entries(bands)) {
    for (const entry of list) typeInfo.set(entry.label, { type: TYPE_FOR_BAND[band], ...entry });
  }
  const labels = new Map((skillLabels || []).map((item) => [item.label, item]));
  const years = research?.source?.years;

  const rows = role.skills.map((skill, index) => {
    const info = typeInfo.get(skill.label);
    const label = labels.get(skill.label);
    const papers = years && research.skills?.[skill.label] ? momentum(research.skills[skill.label], years) : null;
    return {
      label: skill.label,
      index,
      ...statusFor(skill.label, profile, similar),
      type: info ? info.type : 'unrated',
      iloRows: iloRowsFor(skill.label, roles),
      exposure: info ? { roleCount: info.roleCount, exposedCount: info.exposedCount, iloMean: info.iloMean } : null,
      papers: papers && (papers.earlier > 0 || papers.later > 0) ? { earlier: papers.earlier, later: papers.later, years } : null,
      portal: label ? label.portal : null,
      hours: label ? label.hours : null,
    };
  });

  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.index - b.index);
  return rows;
}

export function filterRows(rows, filter) {
  return filter === 'all' ? rows : rows.filter((row) => row.status === filter);
}

export function statusCounts(rows) {
  const counts = { all: rows.length, missing: 0, buildUp: 0, onTrack: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function exposureText(exposure) {
  if (!exposure) return null;
  return `${exposure.exposedCount} of the ${exposure.roleCount} roles in our list that use it are in ILO exposed groups (mean score ${exposure.iloMean.toFixed(2)}).`;
}

export function papersText(papers) {
  if (!papers) return null;
  return `AI research papers on this skill (OpenAlex): ${papers.earlier} in ${papers.years[0]}, ${papers.later} in ${papers.years[1]}.`;
}

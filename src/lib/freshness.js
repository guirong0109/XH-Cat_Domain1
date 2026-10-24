// "Data freshness": when each source was last updated, and whether it is older than its limit.
// Pure helpers. Old data is never hidden: it is shown with its date and marked.
import { formatDate } from './roleView.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// limitDays is how old a source may get before it is marked. The ILO index is one paper, so its limit is a year plus.
export const SOURCES = [
  { key: 'trends', label: 'Job-market trend (OpenDOSM)', limitDays: 35 },
  { key: 'research', label: 'AI research counts (OpenAlex)', limitDays: 35 },
  { key: 'courses', label: 'Course pages (HRD Corp e-Latih, MyTVET)', limitDays: 14 },
  { key: 'references', label: 'eMASCO role pages and portal links', limitDays: 14 },
  { key: 'emerging', label: 'Emerging this week feed', limitDays: 14 },
  { key: 'ilo', label: 'ILO AI-exposure index (2025 paper)', limitDays: 400 },
];

function dateFor(key, data) {
  switch (key) {
    case 'trends':
      return { iso: data.trends?.source?.fetchedAt };
    case 'research':
      return { iso: data.research?.source?.fetchedAt };
    case 'courses':
      if (data.courseChecks?.checkedAt) return { iso: data.courseChecks.checkedAt };
      return { iso: data.skills?.aiCourses?.checkedAt, note: 'Saved list; no live check yet' };
    case 'references':
      return { iso: data.references?.checkedAt };
    case 'emerging':
      return { iso: data.emerging?.checkedAt };
    case 'ilo':
      return { iso: data.roles?.find((role) => role.ilo?.fetchedAt)?.ilo.fetchedAt };
    default:
      return {};
  }
}

export function ageText(ageDays) {
  if (ageDays <= 0) return 'today';
  if (ageDays === 1) return '1 day ago';
  return `${ageDays} days ago`;
}

export function freshnessRows(data, now = new Date()) {
  return SOURCES.map(({ key, label, limitDays }) => {
    const { iso, note } = dateFor(key, data || {});
    const time = iso ? new Date(iso).getTime() : NaN;
    if (Number.isNaN(time)) return { key, label, status: 'missing', limitDays, dateText: '', ageDays: null, note: note || null };
    const ageDays = Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
    return {
      key,
      label,
      limitDays,
      ageDays,
      dateText: formatDate(iso),
      status: ageDays > limitDays ? 'old' : 'fresh',
      note: note || null,
    };
  });
}

export function statusText(row) {
  if (row.status === 'missing') return 'No data yet';
  if (row.status === 'old') return `Older than ${row.limitDays} days`;
  return 'Up to date';
}

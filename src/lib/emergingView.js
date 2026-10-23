// Text and grouping for the "Emerging this week" card. Pure; the data comes from data/emerging.json.
// Nothing here touches a score.
import { formatDate } from './roleView.js';

const STALE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONFIDENCE = {
  high: { text: 'High confidence', tone: 'high' },
  medium: { text: 'Medium confidence', tone: 'medium' },
};

export function confidenceBadge(confidence) {
  return CONFIDENCE[confidence] ?? { text: 'Unverified source', tone: 'low' };
}

export function reviewBadge(review) {
  return review === 'reviewed'
    ? { text: 'Reviewed by the team', tone: 'reviewed' }
    : { text: 'Pending review', tone: 'pending' };
}

export function skillTags(item) {
  return (item.skills ?? []).map((skill) => ({
    name: skill.name,
    note: skill.inEmasco ? null : 'Emerging, not in eMASCO',
  }));
}

export function summaryLine(item) {
  return item.summary ? `AI estimate: ${item.summary}` : null;
}

const LANGUAGES = { ms: 'Malay', zh: 'Chinese' };

// English is the default, so only Malay and Chinese items get a label.
export function languageLabel(item) {
  return LANGUAGES[item.language] ?? null;
}

export function itemMeta(item) {
  return `${item.source} · published ${formatDate(item.publishedAt)} · checked ${formatDate(item.checkedOn)}`;
}

export function groupFilters(items) {
  const found = [...new Set(items.flatMap((item) => item.fields ?? []))];
  const named = found.filter((name) => name !== 'General').sort();
  return ['All', ...named, ...(found.includes('General') ? ['General'] : [])];
}

export function filterItems(items, group) {
  return group === 'All' ? items : items.filter((item) => (item.fields ?? []).includes(group));
}

// kind: 'hidden' (no saved file yet) | 'empty' | 'items'.
export function feedState(emerging, now = new Date()) {
  if (!emerging) return { kind: 'hidden' };
  const checked = formatDate(emerging.checkedOn);
  const items = emerging.items ?? [];
  if (items.length === 0) return { kind: 'empty', checkedLine: `Last checked ${checked}.` };
  const age = (now.getTime() - new Date(emerging.checkedOn).getTime()) / DAY_MS;
  const stale = age > STALE_DAYS ? `This update is from ${checked}, older than usual. Open each source to check it.` : null;
  const taggingNote =
    emerging.tagging === 'keywords' ? 'Tags on this update came from keywords. There are no AI summaries.' : null;
  return { kind: 'items', checkedLine: `Checked ${checked}.`, stale, taggingNote };
}

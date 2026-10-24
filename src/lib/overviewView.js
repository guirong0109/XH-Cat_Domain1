// Pure text and numbers for the role cards (Your roles page and the cards under the Matches radar).
// No scoring here: the match comes from scoreRole, the trend from the OpenDOSM group data.
import { biggestGaps, formatDate, formatGrowth, groupLabel } from './roleView.js';

export const READY_AT = 70;
export const CARD_COUNT = 3;
export const MAX_TRACKED = 3;

// Track or untrack a role. A 4th role is refused (the list is returned unchanged) so the caller can say why.
export function toggleTracked(tracked, roleId) {
  const list = tracked ?? [];
  if (list.includes(roleId)) return { list: list.filter((id) => id !== roleId), full: false };
  if (list.length >= MAX_TRACKED) return { list, full: true };
  return { list: [...list, roleId], full: false };
}

// A role outside our 20 scored roles is tracked by its eMASCO code. A small snapshot of its card is kept, because
// the Matches list changes when the student's skills change.
export const otherKey = (card) => `emasco:${card.code}`;

export function otherSnapshot(card) {
  return {
    code: card.code,
    title: card.baseTitle || card.title,
    similarity: card.similarity,
    url: card.url,
    field: card.field ?? null,
    transferable: card.transferable ?? null,
  };
}

export function trackedOthers(tracked, snapshots) {
  return (tracked ?? []).map((key) => (key.startsWith('emasco:') ? snapshots?.[key] : null)).filter(Boolean);
}

// The tracked roles that are still scored, in the order the student tracked them.
export function trackedEntries(ranked, tracked) {
  return (tracked ?? []).map((id) => ranked.find((entry) => entry.role.id === id)).filter(Boolean);
}

export function pointsToReady(score) {
  if (!score?.matchAvailable) return null;
  return Math.max(0, Math.round(READY_AT - score.match));
}

export function readyText(score) {
  const points = pointsToReady(score);
  if (points === null) return 'Not enough skill evidence for a match';
  return points === 0 ? 'Ready to apply' : `${points} pts to ready`;
}

// Trend line for one role: its occupation group's growth, with source and date. Null parts are said, not hidden.
export function trendLine(role, trends) {
  const growth = trends?.groups?.[role.group]?.growthPct;
  if (typeof growth !== 'number') return { growth: null, rising: null, text: 'Job trend not loaded yet.', source: '' };
  const source = trends.source
    ? `Source: OpenDOSM ${trends.source.dataset}, ${trends.source.baseYear}–${trends.source.latestYear}. Fetched ${formatDate(trends.source.fetchedAt)}.`
    : '';
  return {
    growth,
    rising: growth >= 0,
    text: `${groupLabel(role.group)}: wage recipients ${formatGrowth(growth)}`,
    source,
  };
}

// Up to three gaps, most important first. "weight" is how much the skill counts for the role (0-100).
export function cardGaps(role, profile, similar, scenario) {
  return biggestGaps(role, profile, similar, scenario, 3).map((gap) => ({ label: gap.label, weight: gap.importance }));
}

export function cardEntries(entries, count = CARD_COUNT) {
  return (entries ?? []).filter((entry) => entry.role && entry.score).slice(0, count);
}

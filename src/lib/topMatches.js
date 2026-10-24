import { SHARED_SHARE, majorSkillSet } from './fieldCheck.js';

// Top roles from all of eMASCO for the student's picked skills, merged with our 20 scored roles. Pure helpers, no React.
// Order is the AI skill-fit estimate (one scale for every role). Our 20 roles also keep their full score on the card.
export const TOP_COUNT = 20;
export const MIN_SKILLS_FOR_TOP = 3;

export const ORDER_NOTE =
  'Roles are ranked by an AI estimate of how well your skills fit, across all eMASCO roles up to degree level. Our 20 labelled roles also show a full score. Your goal does not reorder this list.';
export const FALLBACK_NOTE =
  'We could not rank all eMASCO roles just now, so this shows our 20 scored roles instead. Try again later.';

// Sends skill names (and, for the career split, the major or sector id and the skills almost every field uses) only.
// Resolves { ok: true, result } or { ok: false, error }.
export async function fetchTopMatches(labels, fetchImpl = fetch, { field, generalLabels } = {}) {
  const body = { labels, top: TOP_COUNT };
  if (typeof field === 'string' && field) body.field = field;
  if (Array.isArray(generalLabels)) body.generalLabels = generalLabels;
  try {
    const response = await fetchImpl('/api/matches/top', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status !== 200) return { ok: false, error: 'failed' };
    const result = await response.json();
    return result && Array.isArray(result.roles) && result.roles.length > 0 ? { ok: true, result } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

// A card can stand for several civil-service grades; any of their codes may be one of our roles.
export function cardCodes(card) {
  return [card.code, ...(card.grades ?? []).map((grade) => grade.code)].filter(Boolean);
}

// Cards in server order. A card that is one of our 20 roles becomes { kind: 'scored', role, score, reason: null, card };
// every other card becomes { kind: 'other', card }. Our role is listed once even if two cards point at it.
export function mergeTop(cards, ranked) {
  const byCode = new Map((ranked ?? []).map((entry) => [entry.role.code, entry]));
  const used = new Set();
  const entries = [];
  for (const card of cards ?? []) {
    const scored = cardCodes(card).map((code) => byCode.get(code)).find(Boolean);
    if (!scored) {
      entries.push({ kind: 'other', card });
    } else if (!used.has(scored.role.id)) {
      used.add(scored.role.id);
      entries.push({ ...scored, kind: 'scored', reason: null, card });
    }
  }
  return entries;
}

export const scoredOf = (entries) => entries.filter((entry) => entry.kind === 'scored');

// Skills used by almost every field (e.g. Communication) say little about which role fits, and they pull in
// unrelated clerical roles, so they are left out of the ranking. Same rule as the field hints in fieldCheck.js.
// With fewer than MIN_SKILLS_FOR_TOP specific skills left, every skill is used. Returns { used, left }.
export function rankingSkills(skills, roles, fields) {
  const general = generalSkills(skills, roles, fields);
  const used = skills.filter((label) => !general.includes(label));
  if (used.length < MIN_SKILLS_FOR_TOP) return { used: skills, left: [] };
  return { used, left: general };
}

// The student's skills that almost every field uses (same rule as above), whether or not they were left out of the
// ranking. A role in another field is only suggested when some other skill carries over.
export function generalSkills(skills, roles, fields) {
  const majors = (fields?.majors ?? []).filter((major) => major.groups.length > 0);
  if (majors.length === 0) return [];
  const sets = majors.map((major) => majorSkillSet(major, roles));
  return skills.filter((label) => sets.filter((set) => set.has(label)).length >= SHARED_SHARE * majors.length);
}

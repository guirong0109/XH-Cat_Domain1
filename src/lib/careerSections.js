import { mergeTop } from './topMatches.js';

// The two career lists on Matches: roles in the student's field and roles in other fields. Pure helpers, no React.
// The goal only decides which list comes first and how many roles each list shows at first. It never changes a score,
// and the order inside a list is the order the server ranked (AI fit order).
export const GOAL_LAYOUT = {
  upgrade: { first: 'in', counts: { in: 8, other: 4 } },
  move: { first: 'other', counts: { in: 4, other: 8 } },
  unsure: { first: 'in', counts: { in: 6, other: 6 } },
};
export const MORE_STEP = 6;

export const SECTIONS_NOTE =
  'Roles are split by field. Your goal decides which list comes first and how many roles it shows; it never changes a score. Inside each list, roles are in AI fit order (how close their skills are in meaning to yours), which is not a readiness score.';

export function goalLayout(goal) {
  return GOAL_LAYOUT[goal] ?? GOAL_LAYOUT.unsure;
}

const joinLabels = (fields) => fields.map((field) => field.label).join(' and ');

// sections: the server's `sections`; ranked: our 20 scored roles (rankBySkillMatch). Returns the two lists in goal order:
// [{ key, title, entries, shown, total, note }]. `extra` = { in, other } roles added by "Show more".
export function careerLists(sections, goal, ranked, extra = {}) {
  if (!sections) return [];
  const layout = goalLayout(goal);
  const yours = joinLabels(sections.userFields ?? []);
  const lists = {
    in: {
      key: 'in',
      title: `In your field: ${yours}`,
      entries: mergeTop(sections.inField, ranked),
      empty: 'No roles in your field matched your skills closely enough yet.',
      note: null,
    },
    other: {
      key: 'other',
      title: 'Other fields',
      entries: mergeTop(sections.otherField, ranked),
      empty: 'No role in another field shares one of your field skills yet.',
      note:
        sections.generalOnly > 0
          ? `${sections.generalOnly} other-field ${sections.generalOnly === 1 ? 'role was' : 'roles were'} left out because only skills that almost every field uses (such as Teamwork) carry over.`
          : null,
    },
  };
  const order = layout.first === 'in' ? ['in', 'other'] : ['other', 'in'];
  return order.map((key) => {
    const list = lists[key];
    const shown = Math.min(list.entries.length, layout.counts[key] + Math.max(0, extra[key] ?? 0));
    return { ...list, shown, total: list.entries.length };
  });
}

// "Field: X" for a card, with the confidence said in words. Unclear fields name both candidates instead of forcing one.
export function fieldLine(field) {
  if (!field) return null;
  if (field.confidence === 'unclear') return `Field unclear: ${field.primaryLabel} or ${field.secondLabel}`;
  const word = field.confidence === 'high' ? 'clear match' : 'likely';
  return `Field: ${field.primaryLabel} (${word})`;
}

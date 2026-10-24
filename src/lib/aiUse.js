// "How do you use AI now?" on Your goal. Pure helpers. The answer never enters the score
// formula; it only suggests the eMASCO skill "Using AI tools" (the student decides) and
// orders the AI courses on What to study.

export const AI_USES = [
  { id: 'writing', label: 'Writing and documents', short: 'writing' },
  { id: 'automation', label: 'Automating repetitive tasks', short: 'automation' },
  { id: 'research', label: 'Research and summarising', short: 'research' },
  { id: 'data', label: 'Data and spreadsheets', short: 'data' },
  { id: 'coding', label: 'Coding', short: 'coding' },
  { id: 'design', label: 'Images and design', short: 'design' },
  { id: 'other', label: 'Something else', short: 'something else' },
  { id: 'none', label: "I don't use AI yet", short: 'not yet' },
];

export const AI_SKILL = 'Using AI tools';
const GOOD_FROM = 3;

// "I don't use AI yet" and the other answers exclude each other.
export function toggleAiUse(list, id) {
  const current = list ?? [];
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (id === 'none') return ['none'];
  return [...current.filter((item) => item !== 'none'), id];
}

export function usesAi(aiUses) {
  return (aiUses ?? []).some((id) => id !== 'none');
}

// The skill to suggest, or null: 1-2 uses Basic, 3 or more Good. Not offered when the
// student already has the skill.
export function aiSkillSuggestion(aiUses, skills) {
  if (!usesAi(aiUses) || (skills ?? []).includes(AI_SKILL)) return null;
  const count = aiUses.filter((id) => id !== 'none').length;
  const level = count >= GOOD_FROM ? 'good' : 'basic';
  return { label: AI_SKILL, level, count };
}

export function aiUseLine(aiUses) {
  if (!aiUses?.length) return null;
  if (aiUses.includes('none')) return "Doesn't use AI yet";
  const names = AI_USES.filter((use) => aiUses.includes(use.id)).map((use) => use.short);
  return `Uses AI for: ${names.join(', ')}`;
}

// Courses that fit the student's answers first (order kept otherwise), each with the
// matching uses in `forUses`. `uses` maps a course URL to its draft tags.
export function orderForUses(courses, aiUses, uses) {
  const picked = new Set(aiUses ?? []);
  const tagged = (courses ?? []).map((course) => ({
    ...course,
    forUses: (uses?.[course.url] ?? []).filter((id) => picked.has(id)),
  }));
  return [...tagged.filter((course) => course.forUses.length > 0), ...tagged.filter((course) => course.forUses.length === 0)];
}

export function forUsesLine(forUses) {
  if (!forUses?.length) return null;
  if (forUses.includes('none')) return "Listed first: a good start if you don't use AI yet";
  const names = AI_USES.filter((use) => forUses.includes(use.id)).map((use) => use.short);
  return `Listed first: you use AI for ${names.join(', ')}`;
}

// Orders ranked roles by the student's goal. Never changes scores.
const NOTE =
  'Your major or sector is not linked to any of our 15 roles yet, so this is the plain ranking.';

export function fieldOptions(who, fields) {
  if (who === 'student') return fields.majors;
  if (who === 'working') return fields.sectors;
  return [];
}

export function findField(profile, fields) {
  const list = fieldOptions(profile?.who, fields);
  return list.find((f) => f.id === profile?.field) ?? null;
}

function partition(ranked, groups, reason) {
  const set = new Set(groups);
  const first = [];
  const rest = [];
  for (const r of ranked) {
    if (set.has(r.role.interest)) first.push({ ...r, reason });
    else rest.push({ ...r, reason: null });
  }
  return { first, rest };
}

export function orderForGoal(ranked, profile, fields) {
  const plain = () => ranked.map((r) => ({ ...r, reason: null }));
  const goal = profile?.goal;

  if (goal === 'move') {
    const groups = profile.targetSectors ?? [];
    const { first, rest } = partition(ranked, groups, 'target');
    return { entries: [...first, ...rest], note: null };
  }
  if (goal === 'upgrade') {
    const field = findField(profile, fields);
    if (!field) return { entries: plain(), note: null };
    const { first, rest } = partition(ranked, field.groups, 'field');
    if (first.length === 0) return { entries: plain(), note: NOTE };
    return { entries: [...first, ...rest], note: null };
  }
  return { entries: plain(), note: null };
}

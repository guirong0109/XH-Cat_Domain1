// Orders ranked roles by the student's goal. Never changes scores.
const noteFor = (count) =>
  `Your major or sector is not linked to any of our ${count} roles yet, so this is the plain ranking.`;

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

  // "Change work" no longer asks for target sectors (removed 25 Oct 2026), so saved samples' targetSectors are ignored:
  // the student cannot see or change them. The career lists, not this fallback, put other fields first.
  if (goal === 'move') return { entries: plain(), note: null };
  if (goal === 'upgrade') {
    const field = findField(profile, fields);
    if (!field) return { entries: plain(), note: null };
    const { first, rest } = partition(ranked, field.groups, 'field');
    if (first.length === 0) return { entries: plain(), note: noteFor(ranked.length) };
    return { entries: [...first, ...rest], note: null };
  }
  return { entries: plain(), note: null };
}

// The top-scoring role, when goal order does not put it first. Else null.
export function bestScoreNote(entries, ranked) {
  const best = ranked?.[0];
  if (!best || !entries?.length) return null;
  if (entries[0].role.id === best.role.id) return null;
  return { role: best.role, match: best.score.match };
}

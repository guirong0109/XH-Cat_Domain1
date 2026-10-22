// Field-mismatch notice: do the skills found in a CV fit another major better than the picked one?
// Pure. It only suggests; the student decides.
export const MIN_FOUND = 3;
export const MIN_MARGIN = 2;

const labelOf = (skill) => (typeof skill === 'string' ? skill : skill.label);

// Skills used by any role in the major's groups, as a Set of labels.
function majorSkillSet(major, roles) {
  const used = new Set();
  for (const role of roles) {
    if (!major.groups.includes(role.interest)) continue;
    for (const skill of role.skills ?? []) used.add(labelOf(skill));
  }
  return used;
}

export function suggestField(foundSkills, pickedMajorId, roles, fields) {
  if (!Array.isArray(foundSkills) || foundSkills.length < MIN_FOUND) return null;
  const majors = fields?.majors ?? [];
  const scored = majors.map((major) => {
    const set = majorSkillSet(major, roles);
    const covered = foundSkills.filter((label) => set.has(label));
    return { major, covered };
  });
  const picked = scored.find((item) => item.major.id === pickedMajorId);
  const pickedCount = picked ? picked.covered.length : 0;
  const others = scored.filter((item) => item.major.id !== pickedMajorId);
  if (others.length === 0) return null;
  const best = Math.max(...others.map((item) => item.covered.length));
  const top = others.filter((item) => item.covered.length === best);
  if (top.length !== 1) return null;
  if (best < pickedCount + MIN_MARGIN) return null;
  const { major, covered } = top[0];
  return { majorId: major.id, label: major.label, skills: covered };
}

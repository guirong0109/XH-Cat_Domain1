// Field-mismatch notice: do the skills found in a CV fit another major better than the picked one?
// Pure. It only suggests; the student decides.
export const MIN_FOUND = 3;
export const MIN_MARGIN = 2;

const labelOf = (skill) => (typeof skill === 'string' ? skill : skill.label);

// Skills used by any role in the major's groups, as a Set of labels.
export function majorSkillSet(major, roles) {
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

// Skills found in the CV (keyword or AI) that the student still has picked.
export function cvFoundSkills(cv, pickedSkills) {
  if (!cv) return [];
  const found = new Set([...Object.keys(cv.evidence ?? {}), ...Object.keys(cv.sources ?? {})]);
  return pickedSkills.filter((label) => found.has(label));
}

// Skills used by almost every major (e.g. Teamwork) say nothing about the field, so they are not counted.
export const SHARED_SHARE = 0.85;

// Weak-fit hint: few of the CV skills are used by roles of the picked major (e.g. an IT pick with a chef CV).
// Pure. The rule (no field-specific skill fits, or under half fit) is a first guess and was not tuned on data.
export function weakFit(foundSkills, pickedMajorId, roles, fields) {
  if (!Array.isArray(foundSkills) || foundSkills.length === 0) return null;
  const majors = (fields?.majors ?? []).filter((item) => item.groups.length > 0);
  const major = majors.find((item) => item.id === pickedMajorId);
  if (!major) return null;
  const sets = majors.map((item) => majorSkillSet(item, roles));
  const shared = (label) => sets.filter((set) => set.has(label)).length >= SHARED_SHARE * majors.length;
  const specific = foundSkills.filter((label) => !shared(label));
  const mine = majorSkillSet(major, roles);
  const fit = specific.filter((label) => mine.has(label)).length;
  if (fit !== 0 && fit * 2 >= specific.length) return null;
  return { label: major.label, found: foundSkills.length, fit };
}

// Skills most used by the app's roles in one major or sector, counted from the
// eMASCO skills of those roles. Used to pre-tick skills for a student without a CV.
// Pure helper; it never changes a score.

export const MAX_COMMON = 5;
const MIN_ROLES = 2;

// Roles of a field: roles whose interest group is one of the field's groups (as in goalView.js).
export function fieldRoles(field, roles) {
  const groups = new Set(field?.groups ?? []);
  return (roles ?? []).filter((role) => groups.has(role.interest));
}

// [{ label, count, total }]: skills used by at least 2 of the field's roles (or every
// skill when the field has 1 role), most used first, ties by name, at most `max`.
export function commonSkills(field, roles, max = MAX_COMMON) {
  const list = fieldRoles(field, roles);
  const total = list.length;
  if (total === 0) return [];
  const counts = new Map();
  for (const role of list) {
    for (const label of new Set((role.skills ?? []).map((skill) => skill.label))) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const floor = total === 1 ? 1 : MIN_ROLES;
  return [...counts]
    .filter(([, count]) => count >= floor)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([label, count]) => ({ label, count, total }));
}

// Line shown above the pre-ticked skills.
export function commonSkillsLine(fieldLabel, total) {
  return `Common in ${fieldLabel} roles in this app (${total} ${total === 1 ? 'role' : 'roles'}, skills from eMASCO). Pre-ticked at Basic: untick any that are not yours.`;
}

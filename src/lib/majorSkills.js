// Splits the skill list for the picker: skills used by roles of the student's major (or sector) first,
// the rest under "other majors". Every skill stays pickable. Pure, no React.
import { majorSkillSet } from './fieldCheck.js';

// labels: [{ label }]; field: a major or sector from fields.json (or null); roles: our 20 roles.
// No field, or a field with no linked role groups (e.g. "Other"), shows every skill first.
export function splitSkillsByField(labels, field, roles) {
  if (!field || !Array.isArray(field.groups) || field.groups.length === 0) {
    return { mine: labels, others: [], filtered: false };
  }
  const used = majorSkillSet(field, roles);
  const mine = labels.filter((item) => used.has(item.label));
  if (mine.length === 0) return { mine: labels, others: [], filtered: false };
  return { mine, others: labels.filter((item) => !used.has(item.label)), filtered: true };
}

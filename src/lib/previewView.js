import { skillStatus } from './scoring.js';

// Made-up example team for the Stage 2 preview. Not real people or data.
export const EXAMPLE_TEAM = [
  { name: 'Staff A', skills: ['SQL and databases', 'Spreadsheets (Excel)', 'Communication'] },
  { name: 'Staff B', skills: ['Python programming', 'Statistics', 'Communication'] },
  { name: 'Staff C', skills: ['SQL and databases', 'Data visualisation'] },
];

// Skills grid of a team against one role, using the student scoring rules.
// biggestGap: role skill with the fewest "have" across staff (ties: first in
// role order); null when every skill has at least one "have".
export function teamGrid(role, staff, similar) {
  if (!role) return null;
  const skills = role.skills.map((s) => s.label);
  const rows = staff.map((person) => ({
    name: person.name,
    cells: skills.map((label) => skillStatus(label, person.skills, similar)),
  }));
  let biggestGap = null;
  let fewest = Infinity;
  skills.forEach((label, i) => {
    const have = rows.filter((row) => row.cells[i] === 'have').length;
    if (have < fewest) {
      fewest = have;
      biggestGap = label;
    }
  });
  if (fewest > 0) biggestGap = null;
  return { skills, rows, biggestGap };
}

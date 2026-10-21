// "Skills in demand": two real signals per skill, from the roles that use it.
// Job growth comes from OpenDOSM (per MASCO major group); AI exposure comes from
// the ILO 2025 index (via the team's MASCO-to-ISCO map). Nothing is invented:
// a skill whose roles have no ILO data is left out and listed in withoutIlo.

export const SHOWN_PER_BAND = 6;

const isExposed = (category) => typeof category === 'string' && category.startsWith('Gradient');

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

function bandFor(exposedCount, roleCount) {
  if (exposedCount * 2 > roleCount) return 'changing';
  if (exposedCount * 2 === roleCount) return 'mixed';
  return 'humanLed';
}

// Skills the student has or wants come first, so a collapsed list never hides them.
export function displayOrder(skills) {
  const mine = (skill) => skill.have || skill.want;
  return [...skills.filter(mine), ...skills.filter((skill) => !mine(skill))];
}

export function skillTrends(roles, trendGroups, pickedSkills, learnSkills = []) {
  const bySkill = new Map();
  const jobGroups = [];
  for (const role of roles) {
    const growth = trendGroups?.[role.group]?.growthPct;
    if (typeof growth === 'number' && !jobGroups.some((entry) => entry.group === role.group)) {
      jobGroups.push({ group: role.group, growthPct: growth });
    }
    for (const skill of role.skills) {
      if (!bySkill.has(skill.label)) bySkill.set(skill.label, []);
      bySkill.get(skill.label).push(role);
    }
  }

  const bands = { changing: [], mixed: [], humanLed: [] };
  const withoutIlo = [];
  for (const [label, skillRoles] of bySkill) {
    const withIlo = skillRoles.filter((role) => role.ilo && typeof role.ilo.mean === 'number');
    if (withIlo.length === 0) {
      withoutIlo.push(label);
      continue;
    }
    const exposedCount = withIlo.filter((role) => isExposed(role.ilo.category)).length;
    const growths = skillRoles.map((role) => trendGroups?.[role.group]?.growthPct).filter((g) => typeof g === 'number');
    bands[bandFor(exposedCount, withIlo.length)].push({
      label,
      roleCount: withIlo.length,
      exposedCount,
      iloMean: round(average(withIlo.map((role) => role.ilo.mean)), 2),
      growthPct: growths.length ? round(average(growths), 1) : null,
      have: pickedSkills.includes(label),
      want: learnSkills.includes(label),
    });
  }

  for (const list of Object.values(bands)) {
    list.sort((a, b) => b.iloMean - a.iloMean || a.label.localeCompare(b.label));
  }
  return { bands, jobGroups, anyShrinking: jobGroups.some((entry) => entry.growthPct < 0), withoutIlo };
}

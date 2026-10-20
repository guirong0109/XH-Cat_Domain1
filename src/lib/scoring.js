export const SCENARIO_FACTOR = { moderate: 0.6, fast: 1.0 };

const DEFAULT_DEMAND = 50;
const DEFAULT_HOURS = 20;
const DEFAULT_PORTAL = 'elatih';

export function skillStatus(label, pickedSkills, similar) {
  if (pickedSkills.includes(label)) return 'have';
  const related = (similar && similar[label]) || [];
  return related.some((s) => pickedSkills.includes(s)) ? 'similar' : 'gap';
}

export function scoreRole(role, profile, ctx, scenario) {
  const credit = { have: 1, similar: 0.5, gap: 0 };
  const earned = role.skills.reduce(
    (sum, s) => sum + credit[skillStatus(s.label, profile.skills, ctx.similar)],
    0,
  );
  const fit = role.skills.length ? (earned / role.skills.length) * 100 : 0;

  const group = ctx.trendGroups && ctx.trendGroups[role.group];
  const demandMissing = !group || typeof group.demand !== 'number';
  const demand = demandMissing ? DEFAULT_DEMAND : group.demand;
  const outlook = 0.5 * demand + 0.5 * (100 - role.automatablePct * SCENARIO_FACTOR[scenario]);

  const matchedGoals = (role.sdgs || []).filter((g) => profile.sdgs.includes(g));
  const bonus = Math.min(10, 5 * matchedGoals.length);
  const match = Math.min(100, 0.6 * fit + 0.4 * outlook + bonus);

  return { earned, fit, demand, demandMissing, outlook, bonus, matchedGoals, match };
}

export function rankRoles(roles, profile, ctx, scenario) {
  return roles
    .map((role) => ({ role, score: scoreRole(role, profile, ctx, scenario) }))
    .sort((a, b) => b.score.match - a.score.match || a.role.title.localeCompare(b.role.title));
}

export function matchRange(role, profile, ctx) {
  const moderate = scoreRole(role, profile, ctx, 'moderate').match;
  const fast = scoreRole(role, profile, ctx, 'fast').match;
  return { low: Math.round(Math.min(moderate, fast)), high: Math.round(Math.max(moderate, fast)) };
}

export function buildPathway(role, profile, ctx, scenario, skillLabels) {
  const byLabel = new Map((skillLabels || []).map((l) => [l.label, l]));
  return role.skills
    .map((s) => {
      const status = skillStatus(s.label, profile.skills, ctx.similar);
      if (status === 'have') return null;
      const info = byLabel.get(s.label);
      const baseHours = info ? info.hours : DEFAULT_HOURS;
      return {
        label: s.label,
        status,
        hours: status === 'similar' ? Math.round(baseHours / 2) : baseHours,
        importance: s[scenario],
        rising: s.fast > s.moderate,
        portal: info ? info.portal : DEFAULT_PORTAL,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.importance - a.importance || a.label.localeCompare(b.label));
}

export const SCENARIO_FACTOR = { moderate: 0.6, fast: 1.0 };
export const WEIGHTS = { fit: 0.6, outlook: 0.4 };

const DEFAULT_DEMAND = 50;
const DEFAULT_HOURS = 20;
const DEFAULT_PORTAL = 'elatih';

export function skillStatus(label, pickedSkills, similar) {
  if (pickedSkills.includes(label)) return 'have';
  const related = (similar && similar[label]) || [];
  return related.some((s) => pickedSkills.includes(s)) ? 'similar' : 'gap';
}

export const LEVEL_CREDIT = { basic: 0.5, good: 0.75, strong: 1 };

export function skillLevel(label, profile) {
  const level = profile.levels?.[label];
  return typeof level === 'string' && Object.hasOwn(LEVEL_CREDIT, level) ? level : 'strong';
}

export function skillCredit(label, profile, similar) {
  const status = skillStatus(label, profile.skills, similar);
  if (status === 'have') return LEVEL_CREDIT[skillLevel(label, profile)];
  return status === 'similar' ? 0.5 : 0;
}

// The automatable share used in the outlook. For a role with observed AI use (Anthropic Economic Index, matched to the
// role's own tasks) the measured part counts in proportion to how much of the role was measured:
//   weight = tasksUsed / tasksTotal;  share = weight x (observedShare x 100) + (1 - weight) x label.
// No usable observed data (missing, not enough matched tasks, bad numbers): the placeholder label, exactly as before.
export function effectiveAutomatable(role, observed) {
  const label = role.automatablePct;
  const ok =
    observed &&
    observed.status === 'ok' &&
    Number.isFinite(observed.observedShare) &&
    Number.isFinite(observed.tasksUsed) &&
    Number.isFinite(observed.tasksTotal) &&
    observed.tasksTotal > 0 &&
    observed.tasksUsed > 0;
  if (!ok) return { automatable: label, observedWeight: 0, label };
  const weight = Math.min(1, observed.tasksUsed / observed.tasksTotal);
  return { automatable: weight * observed.observedShare * 100 + (1 - weight) * label, observedWeight: weight, label };
}

export function scoreRole(role, profile, ctx, scenario) {
  const earned = role.skills.reduce(
    (sum, s) => sum + skillCredit(s.label, profile, ctx.similar),
    0,
  );
  const fit = role.skills.length ? (earned / role.skills.length) * 100 : 0;

  const group = ctx.trendGroups && ctx.trendGroups[role.group];
  const demandMissing = !group || typeof group.demand !== 'number';
  const demand = demandMissing ? DEFAULT_DEMAND : group.demand;
  const { automatable, observedWeight, label: labelAutomatable } = effectiveAutomatable(role, ctx.observed?.roles?.[role.code]);
  const outlook = 0.5 * demand + 0.5 * (100 - automatable * SCENARIO_FACTOR[scenario]);

  const matchedGoals = (role.sdgs || []).filter((g) => profile.sdgs.includes(g));
  const bonus = Math.min(10, 5 * matchedGoals.length);
  const match = Math.min(100, WEIGHTS.fit * fit + WEIGHTS.outlook * outlook + bonus);

  return { earned, fit, demand, demandMissing, outlook, bonus, matchedGoals, match, automatable, observedWeight, labelAutomatable };
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
      let status = skillStatus(s.label, profile.skills, ctx.similar);
      if (status === 'have') {
        if (skillLevel(s.label, profile) !== 'basic') return null;
        status = 'levelup';
      }
      const info = byLabel.get(s.label);
      const baseHours = info ? info.hours : DEFAULT_HOURS;
      const shorter = status === 'similar' || status === 'levelup';
      return {
        label: s.label,
        status,
        // null means the team has no estimate yet; it is never halved or defaulted.
        hours: baseHours === null || baseHours === undefined ? null : shorter ? Math.round(baseHours / 2) : baseHours,
        importance: s[scenario],
        rising: s.fast > s.moderate,
        portal: info ? info.portal : DEFAULT_PORTAL,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.importance - a.importance || a.label.localeCompare(b.label));
}

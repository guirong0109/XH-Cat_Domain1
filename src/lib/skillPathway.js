// The learning pathway built from the gap engine: same gaps, same order as the Skill Match explanation.
// Step fields label/status/hours/rising/portal keep the shape the Study screen already uses.
import { RECOMMENDED_TARGET, simulateImprovement } from './skillMatch.js';

const DEFAULT_HOURS = 20;
const DEFAULT_PORTAL = 'elatih';

const STATUS_BY_ROW = (row) => {
  if (row.status === 'not_demonstrated') return 'gap';
  return row.matchKind === 'identical' ? 'levelup' : 'similar';
};

// Generic practice ideas. They are suggestions, not verified courses or projects.
export function practiceFor(label, status) {
  if (status === 'levelup') return `Use ${label} on one real task and ask a tutor or colleague to review it, to move from Basic to Good.`;
  if (status === 'similar') return `Build one small piece of work that uses ${label} directly, so it is shown and not only a related skill.`;
  return `Finish one small project that uses ${label}, then keep it as evidence (a file, a link or a short write-up).`;
}

export const AI_WORKFLOW_NOTE =
  'While you learn, you can ask an AI tool to explain or review your work. Check its answer yourself, and do not paste private data into it. This is a general tip, not specific to the skill.';

export function buildSkillPathway(role, profile, ctx, skillLabels, result) {
  const byLabel = new Map((skillLabels || []).map((item) => [item.label, item]));
  const rowByLabel = new Map(role.skills.map((skill) => [skill.label, skill]));
  return result.gaps.map((row) => {
    const status = STATUS_BY_ROW(row);
    const info = byLabel.get(row.label);
    const baseHours = info ? info.hours : DEFAULT_HOURS;
    const shorter = status === 'similar' || status === 'levelup';
    const target = RECOMMENDED_TARGET;
    const simulation = simulateImprovement(role, profile, ctx, [{ label: row.label, level: target }]);
    const source = rowByLabel.get(row.label);
    return {
      label: row.label,
      status,
      // null means the team has no estimate yet; it is never halved or defaulted.
      hours: baseHours === null || baseHours === undefined ? null : shorter ? Math.round(baseHours / 2) : baseHours,
      importance: row.importance,
      rising: Boolean(source && source.fast > source.moderate),
      portal: info ? info.portal : DEFAULT_PORTAL,
      type: row.type,
      coverage: row.coverage,
      gap: row.gap,
      gapShare: row.gapShare,
      reason: row.reason,
      targetLevel: target,
      practice: practiceFor(row.label, status),
      aiWorkflow: AI_WORKFLOW_NOTE,
      simulatedGain: simulation.improvement,
    };
  });
}

// How AI meets one role, kept in separate boxes because these are different things:
//   1. team task labels (AI-assisted / automatable / human-led): estimates on the role's own eMASCO tasks
//   2. observed AI use (Anthropic Economic Index): what people already do with one assistant today
//   3. AI Readiness: only when sourced, role-specific AI capability requirements exist (none do yet)
// Nothing here changes Current Skill Match, and nothing is turned into a skill-level number.
import { skillMatch } from './skillMatch.js';

const TASK_GROUP = { ai_assisted: 'assisted', automatable: 'automatable', human_led: 'humanLed' };

export const AI_READINESS_MIN_CAPABILITIES = 3;
export const AI_TOOL_SKILLS = ['Using AI tools'];

export function aiTaskInsights(role, observed) {
  const labelSource = role?.labelSource ?? null;
  const confidence = labelSource === 'manual' ? 'Placeholder sample label' : 'AI estimate';
  const groups = { assisted: [], automatable: [], humanLed: [] };
  for (const task of role?.tasks ?? []) {
    const group = TASK_GROUP[task?.label];
    if (group && typeof task.text === 'string') groups[group].push({ text: task.text, confidence });
  }
  const ok = observed && observed.status === 'ok';
  return {
    groups,
    labelSource,
    provenance: `eMASCO ${role?.code ?? ''} task text; task labels: ${confidence.toLowerCase()}`,
    observed: ok
      ? {
          aiTasks: observed.aiTasks ?? [],
          humanTasks: observed.humanTasks ?? [],
          tasksUsed: observed.tasksUsed,
          tasksTotal: observed.tasksTotal,
          provenance: 'Anthropic Economic Index (observed use of one AI assistant, mostly US users); tasks matched to eMASCO tasks by meaning',
        }
      : null,
    skillLevelNote: 'AI exposure is known for tasks and roles. We do not turn it into a number for single skills.',
  };
}

// ctx.aiCapabilities[role.code] = [{ label, type, importance, source }, ...] would carry sourced AI capability
// requirements. None exist in the data yet, so this returns "not assessed" for every role today.
export function aiReadiness(role, profile, ctx = {}) {
  const capabilities = (ctx.aiCapabilities?.[role?.code] ?? []).filter(
    (item) => item && typeof item.label === 'string' && typeof item.source === 'string' && item.source && item.importance > 0,
  );
  if (capabilities.length >= AI_READINESS_MIN_CAPABILITIES) {
    const result = skillMatch({ skills: capabilities }, profile, ctx);
    if (result.status === 'ok') return { status: 'assessed', score: result.match, rows: result.rows };
  }
  const named = (role?.skills ?? []).filter((skill) => AI_TOOL_SKILLS.includes(skill.label)).map((skill) => skill.label);
  const shown = new Set(profile?.skills ?? []);
  return {
    status: 'not_assessed',
    score: null,
    reason: `Not yet assessed. We have no sourced list of AI capabilities for this role (we need at least ${AI_READINESS_MIN_CAPABILITIES}, each with a source and a weight), so we do not invent a percentage.`,
    evidence: named.map((label) => ({
      label,
      text: shown.has(label)
        ? `${label}: shown in your profile.`
        : `${label}: not shown in your profile yet. That does not mean you cannot do it.`,
    })),
    needs: 'To score this we need a sourced list of AI-related capabilities per role and your level in each.',
  };
}

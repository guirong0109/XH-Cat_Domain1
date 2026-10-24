// Display text for Current Skill Match. Pure; no numbers are computed here except for formatting.
import { PROFICIENCY_NAME } from './skillMatch.js';

export const MATCH_LABEL = 'Current Skill Match';
export const MATCH_MEANING =
  'How much of this role’s listed skills your shown skills cover, weighted by how much each skill matters. It is not a chance of being hired.';
export const RANKING_POLICY = 'Roles are ordered by Current Skill Match only. Job outlook and SDG choices are shown beside it and do not change it.';
export const MATCH_FORMULA_NOTE =
  'Coverage of a skill = how close your best skill is (same skill 1, team-reviewed similar skill 0.5) × your level (Basic 0.5, Good 0.8, Expert 1). A skill whose level you have not set is counted as Basic for now, so the match is provisional.';

const percent = (value) => `${Math.round(value * 100)}%`;
const oneDecimal = (value) => String(Math.round(value * 10) / 10);

export function matchText(score) {
  return score?.matchAvailable ? `${Math.round(score.match)}%` : 'Not available';
}

export function matchAria(role, score) {
  return score?.matchAvailable
    ? `${role.title}: ${Math.round(score.match)} percent ${MATCH_LABEL}`
    : `${role.title}: ${MATCH_LABEL} not available`;
}

const STATUS_TEXT = { covered: 'Covered', partial: 'Partly covered', not_demonstrated: 'Not demonstrated' };

export function levelText(level, assumed) {
  return `${PROFICIENCY_NAME[level] ?? level}${assumed ? ' (level unknown)' : ''}`;
}

// One required skill as a row of the explanation table.
export function rowView(row) {
  const similarityText =
    row.rawSimilarity !== null && row.matchedSkill && row.matchKind !== 'identical'
      ? `similarity ${row.rawSimilarity.toFixed(2)} (shown only, not the credit)`
      : null;
  let yours = 'Nothing yet';
  if (row.matchedSkill) {
    yours = `${row.matchedSkill} · ${levelText(row.proficiency, row.proficiencyAssumed)}`;
    if (row.matchKind === 'reviewed_similar') yours += ' · similar skill, half credit';
  } else if (row.nearestSkill && row.nearestSimilarity !== null) {
    yours = `Nearest: ${row.nearestSkill} (similarity ${row.nearestSimilarity.toFixed(2)}, no credit)`;
  }
  return {
    label: row.label,
    status: row.status,
    statusText: STATUS_TEXT[row.status],
    importanceText: `${row.type === 'specific' ? 'Role-specific' : 'Basic'} · weight ${oneDecimal(row.importance)}`,
    yours,
    similarityText,
    coverageText: percent(row.coverage),
    pointsText: `${oneDecimal(row.points)} of ${oneDecimal(row.points + row.gapShare)} points`,
  };
}

export function formulaLine(result) {
  return `Σ(weight × coverage) ÷ Σ weight = ${oneDecimal(result.earned)} ÷ ${oneDecimal(result.totalImportance)} = ${Math.round(result.match)}%`;
}

// How much of the match rests on team-reviewed similar skills (draft), shown so it is never hidden.
export function similarShareText(result) {
  if (!(result.similarPoints > 0)) return null;
  return `${oneDecimal(result.similarPoints)} of the ${Math.round(result.match)} points come from similar skills that count half (team draft). Without them the match is ${Math.round(result.match - result.similarPoints)}%.`;
}

// The score parts that are NOT in the Skill Match: shown apart, with plain names.
export function separateParts(parts) {
  const names = { outlook: 'Job market outlook (separate)', bonus: 'SDG alignment (separate)' };
  return parts
    .filter((part) => names[part.key])
    .map((part) => ({
      ...part,
      label: names[part.key],
      detail: part.key === 'bonus' ? `${part.detail} Shown for your interests only; it does not change your Skill Match.` : part.detail,
    }));
}

export function simulationLine(simulation) {
  if (simulation.improvement === null) return 'No number: this role has no usable skill list.';
  const gain = simulation.improvement;
  const sign = gain > 0 ? '+' : '';
  return `${Math.round(simulation.current.match)}% → ${Math.round(simulation.potential.match)}% (${sign}${oneDecimal(gain)} percentage points)`;
}

export function targetText(level) {
  return PROFICIENCY_NAME[level] ?? level;
}

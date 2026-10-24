// Current Skill Match: how well the skills a student has shown cover the skills a role asks for.
//   C_i  = max over the student's skills j of  M(r_i, u_j) x P_j      (coverage of required skill i)
//   Match = 100 x sum(I_i x C_i) / sum(I_i)
//   Gap_i = I_i x (1 - C_i)
// Pure and deterministic. It never reads labour-market, SDG, AI-exposure or scenario data (docs/skill-match.md).

export const PROFICIENCY_CREDIT = { basic: 0.5, good: 0.8, expert: 1 };
export const PROFICIENCY_NAME = { basic: 'Basic', good: 'Good', expert: 'Expert' };
// A skill with no (or an unreadable) level counts as Basic, never as Expert; the row says so.
export const UNKNOWN_PROFICIENCY = 'basic';
const LEGACY_PROFICIENCY = { strong: 'expert' };

// Equivalence credit M(r, u). Only decisions a person verified give credit; raw embedding similarity does not
// (bge-m3 cosines of reviewed-similar and unrelated skill pairs overlap, see docs/skill-match.md).
export const EQUIVALENCE_CREDIT = { identical: 1, reviewed_similar: 0.5 };

// Importance I_i from the eMASCO skill class. The 1.5 / 1.0 weights are our heuristic (same as Explore all roles),
// not an official eMASCO number. AI exposure never changes it.
export const IMPORTANCE_BY_TYPE = { specific: 1.5, basic: 1 };
export const IMPORTANCE_SOURCE = 'eMASCO skill class (specific or basic); weights 1.5 and 1.0 are a team heuristic';

// A required skill counts as covered from this coverage upwards (Good level on the exact skill).
export const COVERED_AT = PROFICIENCY_CREDIT.good;
export const RECOMMENDED_TARGET = 'good';

// Labels are compared without case, outer spaces or repeated spaces, so "SQL " and "sql" are the same skill.
export const labelKey = (label) => (typeof label === 'string' ? label.trim().replace(/\s+/g, ' ').toLowerCase() : '');

export function normalizeProficiency(value) {
  if (typeof value !== 'string') return null;
  const level = LEGACY_PROFICIENCY[value] ?? value;
  return Object.hasOwn(PROFICIENCY_CREDIT, level) ? level : null;
}

// The level of one picked skill as the engine reads it. `switchId` is the value the Basic/Good/Strong switch stores
// ('strong' is the stored name for Expert, kept so saved profiles and samples still work).
export function profileLevel(label, profile) {
  const stated = normalizeProficiency(profile?.levels?.[label]);
  const level = stated ?? UNKNOWN_PROFICIENCY;
  return { level, assumed: stated === null, switchId: level === 'expert' ? 'strong' : level };
}

// The student's skills with a usable level; duplicates are counted once (first one wins).
export function studentSkills(profile) {
  const byKey = new Map();
  for (const raw of profile?.skills ?? []) {
    const key = labelKey(raw);
    if (!key) continue;
    const stated = normalizeProficiency(profile.levels?.[raw]);
    const known = byKey.get(key);
    // The same skill written twice counts once, at the best level the student gave it.
    if (known && !(stated !== null && (known.assumed || PROFICIENCY_CREDIT[stated] > known.credit))) continue;
    const level = stated ?? UNKNOWN_PROFICIENCY;
    byKey.set(key, { label: raw.trim(), key, level, credit: PROFICIENCY_CREDIT[level], assumed: stated === null });
  }
  return [...byKey.values()];
}

// The role's required skills with a usable importance; duplicates are merged (highest importance wins).
export function requiredSkills(role) {
  const byLabel = new Map();
  for (const skill of role?.skills ?? []) {
    if (!skill || !labelKey(skill.label)) continue;
    const type = Object.hasOwn(IMPORTANCE_BY_TYPE, skill.type) ? skill.type : 'basic';
    const given = Number.isFinite(skill.importance) && skill.importance > 0 ? skill.importance : null;
    const importance = given ?? IMPORTANCE_BY_TYPE[type];
    const key = labelKey(skill.label);
    const known = byLabel.get(key);
    if (!known || importance > known.importance) byLabel.set(key, { label: skill.label, key, type, importance });
  }
  return [...byLabel.values()];
}

const indexCache = new WeakMap();
function labelIndex(skillSimilarity) {
  let index = indexCache.get(skillSimilarity);
  if (!index) {
    index = new Map(skillSimilarity.labels.map((label, position) => [labelKey(label), position]));
    indexCache.set(skillSimilarity, index);
  }
  return index;
}

export function rawSimilarity(skillSimilarity, a, b) {
  const labels = skillSimilarity?.labels;
  if (!Array.isArray(labels)) return null;
  const index = labelIndex(skillSimilarity);
  const row = index.get(labelKey(a)) ?? -1;
  const column = index.get(labelKey(b)) ?? -1;
  const value = row < 0 || column < 0 ? undefined : skillSimilarity.matrix?.[row]?.[column];
  return Number.isFinite(value) ? value : null;
}

const similarCache = new WeakMap();
function similarKeys(similar) {
  let keys = similarCache.get(similar);
  if (!keys) {
    keys = new Map();
    for (const [required, list] of Object.entries(similar)) {
      if (Array.isArray(list)) keys.set(labelKey(required), new Set(list.map(labelKey)));
    }
    similarCache.set(similar, keys);
  }
  return keys;
}

function equivalence(requiredKey, studentKey, similar) {
  if (requiredKey === studentKey) return { kind: 'identical', credit: EQUIVALENCE_CREDIT.identical };
  if (similar && typeof similar === 'object' && similarKeys(similar).get(requiredKey)?.has(studentKey)) {
    return { kind: 'reviewed_similar', credit: EQUIVALENCE_CREDIT.reviewed_similar };
  }
  return { kind: 'none', credit: 0 };
}

const KIND_RANK = { identical: 2, reviewed_similar: 1, none: 0 };

function bestSupport(required, students, ctx) {
  let best = null;
  let nearest = null;
  for (const student of students) {
    const { kind, credit } = equivalence(required.key, student.key, ctx.similar);
    const raw = rawSimilarity(ctx.skillSimilarity, required.label, student.label);
    const coverage = credit * student.credit;
    const candidate = { student, kind, credit, coverage, raw };
    if (coverage > 0) {
      const better =
        !best ||
        coverage > best.coverage ||
        (coverage === best.coverage &&
          (KIND_RANK[kind] > KIND_RANK[best.kind] || (KIND_RANK[kind] === KIND_RANK[best.kind] && student.label < best.student.label)));
      if (better) best = candidate;
    }
    if (raw !== null && (!nearest || raw > nearest.raw || (raw === nearest.raw && student.label < nearest.student.label))) {
      nearest = candidate;
    }
  }
  return { best, nearest };
}

function coverageStatus(coverage) {
  if (coverage >= COVERED_AT) return 'covered';
  return coverage > 0 ? 'partial' : 'not_demonstrated';
}

function reasonFor(row) {
  const kindText = row.type === 'specific' ? 'a role-specific skill' : 'a basic skill';
  const note = row.proficiencyAssumed ? ' (level unknown, counted as Basic for now)' : '';
  if (row.status === 'covered') return `Covered: ${row.matchedSkill} at ${PROFICIENCY_NAME[row.proficiency]} level${note}.`;
  if (row.status === 'not_demonstrated') {
    return `${row.label} is ${kindText} and none of your skills shows it yet. Not demonstrated is not the same as not having it.`;
  }
  if (row.matchKind === 'identical') {
    return `You have ${row.label} at ${PROFICIENCY_NAME[row.proficiency]} level${note}; Good would cover it.`;
  }
  return `Your ${row.matchedSkill} (${PROFICIENCY_NAME[row.proficiency]}${note}) is a reviewed similar skill, which counts as half; ${row.label} itself is not shown yet.`;
}

// Rounded to 9 places so 0.8 x 100 prints as 80, not 80.00000000000001.
const clamp = (value) => Math.min(100, Math.max(0, Math.round(value * 1e9) / 1e9));

// ctx: { similar, skillSimilarity }. Returns status 'unavailable' (no number) when the role has no usable skill list.
export function skillMatch(role, profile, ctx = {}) {
  const required = requiredSkills(role);
  const totalImportance = required.reduce((sum, skill) => sum + skill.importance, 0);
  if (required.length === 0 || !(totalImportance > 0)) {
    return { status: 'unavailable', match: null, reason: 'This role has no usable skill list, so no percentage is shown.', rows: [], gaps: [] };
  }
  const students = studentSkills(profile);
  const rows = required.map((skill) => {
    const { best, nearest } = bestSupport(skill, students, ctx);
    const coverage = best ? best.coverage : 0;
    const row = {
      label: skill.label,
      type: skill.type,
      importance: skill.importance,
      importanceSource: IMPORTANCE_SOURCE,
      coverage,
      status: coverageStatus(coverage),
      matchKind: best ? best.kind : 'none',
      matchedSkill: best ? best.student.label : null,
      proficiency: best ? best.student.level : null,
      proficiencyAssumed: best ? best.student.assumed : false,
      proficiencyState: best ? (best.student.assumed ? 'unknown' : 'confirmed') : null,
      equivalenceCredit: best ? best.credit : 0,
      rawSimilarity: best ? best.raw : null,
      nearestSkill: !best && nearest ? nearest.student.label : null,
      nearestSimilarity: !best && nearest ? nearest.raw : null,
      weightedCoverage: skill.importance * coverage,
      points: (100 * skill.importance * coverage) / totalImportance,
      gap: skill.importance * (1 - coverage),
      gapShare: (100 * skill.importance * (1 - coverage)) / totalImportance,
    };
    return { ...row, reason: reasonFor(row) };
  });
  const earned = rows.reduce((sum, row) => sum + row.weightedCoverage, 0);
  const gaps = rows
    .filter((row) => row.status !== 'covered')
    .sort((a, b) => b.gap - a.gap || b.importance - a.importance || a.label.localeCompare(b.label));
  return {
    status: 'ok',
    match: clamp((100 * earned) / totalImportance),
    totalImportance,
    earned,
    rows,
    gaps,
    unknownLevelCount: students.filter((skill) => skill.assumed).length,
    // Provisional = at least one requirement is credited through a skill whose level the student never gave.
    // Points that come only from team-reviewed similar skills (half credit), so the reader can see how much rests on them.
    similarPoints: rows.filter((row) => row.matchKind === 'reviewed_similar').reduce((sum, row) => sum + row.points, 0),
    provisionalCount: rows.filter((row) => row.proficiencyAssumed).length,
    provisional: rows.some((row) => row.proficiencyAssumed),
  };
}

export const SIMULATION_LIMITS = [
  'This is a what-if, not a prediction. Finishing a course does not by itself prove the level.',
  'Only the skills you selected change. The role and its skill weights stay fixed.',
];

// What-if: apply explicit level changes to a copy of the profile and run the same skillMatch again.
// changes: [{ label, level }]. A change that is not an improvement is skipped and reported.
export function simulateImprovement(role, profile, ctx, changes) {
  const current = skillMatch(role, profile, ctx);
  const hypothetical = { ...profile, skills: [...(profile.skills ?? [])], levels: { ...(profile.levels ?? {}) } };
  const have = new Map(studentSkills(profile).map((skill) => [skill.label, skill]));
  const applied = [];
  const skipped = [];
  for (const change of changes ?? []) {
    const level = normalizeProficiency(change?.level);
    if (!change || typeof change.label !== 'string' || level === null) {
      skipped.push({ label: change?.label ?? null, reason: 'unknown skill or level' });
      continue;
    }
    const before = have.get(change.label);
    if (before && PROFICIENCY_CREDIT[before.level] >= PROFICIENCY_CREDIT[level]) {
      skipped.push({ label: change.label, reason: 'not an improvement on your current level' });
      continue;
    }
    if (!hypothetical.skills.includes(change.label)) hypothetical.skills.push(change.label);
    hypothetical.levels[change.label] = level;
    have.set(change.label, { label: change.label, level, credit: PROFICIENCY_CREDIT[level], assumed: false });
    applied.push({ label: change.label, from: before ? before.level : null, to: level, fromAssumed: before ? before.assumed : false });
  }
  const potential = skillMatch(role, hypothetical, ctx);
  const available = current.status === 'ok' && potential.status === 'ok';
  return {
    current,
    potential,
    improvement: available ? potential.match - current.match : null,
    applied,
    skipped,
    limitations: SIMULATION_LIMITS,
  };
}

// Ranking policy "Current Skill Match only": highest match first, ties by title. An unavailable match goes last.
export function compareByMatch(a, b) {
  const left = a.match;
  const right = b.match;
  if (left === null && right === null) return a.title.localeCompare(b.title);
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left || a.title.localeCompare(b.title);
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COVERED_AT,
  PROFICIENCY_CREDIT,
  normalizeProficiency,
  rawSimilarity,
  requiredSkills,
  simulateImprovement,
  skillMatch,
  studentSkills,
} from '../src/lib/skillMatch.js';
import { rankBySkillMatch } from '../src/lib/skillRanking.js';
import { buildSkillPathway } from '../src/lib/skillPathway.js';
import { aiReadiness, aiTaskInsights } from '../src/lib/aiTasks.js';
import { similarShareText } from '../src/lib/skillMatchView.js';
import { scoreRole } from '../src/lib/scoring.js';

const sk = (label, type = 'specific', extra = {}) => ({ label, type, moderate: 0.8, fast: 0.8, ...extra });
const role = (skills, extra = {}) => ({ id: 'r', code: '0000-00', title: 'Role', group: 'professionals', automatablePct: 30, sdgs: [8], skills, ...extra });
const profile = (skills, levels = {}, extra = {}) => ({ skills, levels, sdgs: [], ...extra });
const similar = { SQL: ['Excel'], 'Data viz': ['Excel'] };
const ctx = { similar };

const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const roles = data('roles.json');
const skillsFile = data('skills.json');
const samples = data('samples.json');
const realCtx = { similar: skillsFile.similar, skillSimilarity: data('skill_similarity.json'), trendGroups: data('trends.json').groups };

describe('proficiency', () => {
  it('maps Basic, Good, Expert to 0.5, 0.8, 1', () => {
    expect(PROFICIENCY_CREDIT).toEqual({ basic: 0.5, good: 0.8, expert: 1 });
  });
  it('reads the old "strong" value as Expert and rejects junk', () => {
    expect(normalizeProficiency('strong')).toBe('expert');
    expect(normalizeProficiency('expert')).toBe('expert');
    expect(normalizeProficiency('GOOD')).toBeNull();
    expect(normalizeProficiency(undefined)).toBeNull();
    expect(normalizeProficiency(3)).toBeNull();
  });
  it('counts a skill with no level as Basic and says so', () => {
    const [skill] = studentSkills(profile(['SQL']));
    expect(skill).toMatchObject({ level: 'basic', credit: 0.5, assumed: true });
    const result = skillMatch(role([sk('SQL')]), profile(['SQL']), ctx);
    expect(result.match).toBe(50);
    expect(result.rows[0].proficiencyAssumed).toBe(true);
    expect(result.rows[0].reason).toContain('level unknown');
    expect(result.unknownLevelCount).toBe(1);
  });
  it('treats an invalid level like an unknown one, never as Expert', () => {
    expect(skillMatch(role([sk('SQL')]), profile(['SQL'], { SQL: 'wizard' }), ctx).match).toBe(50);
  });
  it('counts each level correctly on an identical skill', () => {
    const r = role([sk('SQL')]);
    expect(skillMatch(r, profile(['SQL'], { SQL: 'basic' }), ctx).match).toBe(50);
    expect(skillMatch(r, profile(['SQL'], { SQL: 'good' }), ctx).match).toBe(80);
    expect(skillMatch(r, profile(['SQL'], { SQL: 'expert' }), ctx).match).toBe(100);
    expect(skillMatch(r, profile(['SQL'], { SQL: 'strong' }), ctx).match).toBe(100);
  });
});

describe('semantic equivalence credit', () => {
  const r = role([sk('SQL')]);
  it('identical skill: full equivalence', () => {
    const row = skillMatch(r, profile(['SQL'], { SQL: 'expert' }), ctx).rows[0];
    expect(row).toMatchObject({ matchKind: 'identical', equivalenceCredit: 1, coverage: 1, status: 'covered' });
  });
  it('reviewed similar skill: half credit times level', () => {
    const row = skillMatch(r, profile(['Excel'], { Excel: 'good' }), ctx).rows[0];
    expect(row).toMatchObject({ matchKind: 'reviewed_similar', equivalenceCredit: 0.5, status: 'partial', matchedSkill: 'Excel' });
    expect(row.coverage).toBeCloseTo(0.4, 10);
  });
  it('unrelated skill gives nothing, even if embeddings are close', () => {
    const skillSimilarity = { labels: ['SQL', 'Cooking'], matrix: [[1, 0.9], [0.9, 1]] };
    const row = skillMatch(r, profile(['Cooking'], { Cooking: 'expert' }), { similar, skillSimilarity }).rows[0];
    expect(row).toMatchObject({ coverage: 0, status: 'not_demonstrated', matchKind: 'none', nearestSkill: 'Cooking', nearestSimilarity: 0.9 });
  });
  it('the exact skill beats a similar one when both are present', () => {
    const row = skillMatch(r, profile(['Excel', 'SQL'], { Excel: 'expert', SQL: 'basic' }), ctx).rows[0];
    expect(row.matchedSkill).toBe('SQL'); // 0.5 x 1 ties 1 x 0.5; the exact skill wins the tie
    expect(row.matchKind).toBe('identical');
    expect(row.coverage).toBe(0.5);
  });
  it('picks the strongest supported skill (max, not sum)', () => {
    const r2 = role([sk('Data viz')]);
    const result = skillMatch(r2, profile(['Excel', 'Data viz'], { Excel: 'expert', 'Data viz': 'good' }), ctx);
    expect(result.rows[0].coverage).toBe(0.8);
  });
  it('reports raw similarity next to the credit', () => {
    const skillSimilarity = { labels: ['SQL', 'Excel'], matrix: [[1, 0.55], [0.55, 1]] };
    const row = skillMatch(r, profile(['Excel'], { Excel: 'good' }), { similar, skillSimilarity }).rows[0];
    expect(row.rawSimilarity).toBe(0.55);
    expect(rawSimilarity(skillSimilarity, 'SQL', 'Nope')).toBeNull();
    expect(rawSimilarity(undefined, 'a', 'b')).toBeNull();
  });
});

describe('importance and the formula', () => {
  it('weights specific skills 1.5 and basic skills 1', () => {
    const r = role([sk('A', 'specific'), sk('B', 'basic')]);
    const result = skillMatch(r, profile(['A'], { A: 'expert' }), ctx);
    expect(result.match).toBeCloseTo((100 * 1.5) / 2.5, 10);
    expect(result.totalImportance).toBe(2.5);
  });
  it('ignores the AI importance numbers (moderate and fast)', () => {
    const plain = role([sk('A', 'specific', { moderate: 0.8, fast: 0.8 }), sk('B', 'basic', { moderate: 0.6, fast: 0.6 })]);
    const shifted = role([sk('A', 'specific', { moderate: 0.2, fast: 1 }), sk('B', 'basic', { moderate: 1, fast: 0.2 })]);
    const p = profile(['A'], { A: 'good' });
    expect(skillMatch(shifted, p, ctx).match).toBe(skillMatch(plain, p, ctx).match);
  });
  it('uses a valid explicit importance, else falls back to the class weight', () => {
    expect(requiredSkills(role([sk('A', 'specific', { importance: 3 })]))[0].importance).toBe(3);
    expect(requiredSkills(role([sk('A', 'specific', { importance: -1 })]))[0].importance).toBe(1.5);
    expect(requiredSkills(role([sk('A', 'weird')]))[0]).toMatchObject({ type: 'basic', importance: 1 });
    expect(requiredSkills(role([sk('A', 'specific', { importance: NaN })]))[0].importance).toBe(1.5);
  });
  it('merges duplicate required skills and duplicate student skills', () => {
    const r = role([sk('A', 'basic'), sk('A', 'specific'), sk('B')]);
    expect(requiredSkills(r)).toHaveLength(2);
    expect(requiredSkills(r)[0]).toMatchObject({ label: 'A', importance: 1.5 });
    expect(studentSkills(profile(['A', 'A', '', 'B'], { A: 'good' }))).toHaveLength(2);
    expect(skillMatch(r, profile(['A', 'A'], { A: 'good' }), ctx).rows).toHaveLength(2);
  });
  it('gives 0 for an empty student profile and does not crash on missing fields', () => {
    const r = role([sk('A')]);
    expect(skillMatch(r, profile([]), ctx)).toMatchObject({ status: 'ok', match: 0 });
    expect(skillMatch(r, {}, ctx).match).toBe(0);
    expect(skillMatch(r, undefined, undefined).match).toBe(0);
  });
  it('shows no percentage when the role has no usable skills', () => {
    for (const bad of [role([]), { title: 'x' }, role([{ type: 'specific' }]), role([null])]) {
      expect(skillMatch(bad, profile(['A']), ctx)).toMatchObject({ status: 'unavailable', match: null });
    }
    expect(skillMatch(undefined, profile(['A']), ctx).match).toBeNull();
  });
  it('stays within 0 to 100', () => {
    const r = role([sk('A'), sk('B')]);
    const full = skillMatch(r, profile(['A', 'B'], { A: 'expert', B: 'expert' }), ctx).match;
    expect(full).toBe(100);
    for (const p of [profile([]), profile(['A']), profile(['A', 'B'], { A: 'basic', B: 'good' })]) {
      const m = skillMatch(r, p, ctx).match;
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(100);
    }
  });
  it('is deterministic', () => {
    const r = role([sk('A'), sk('B'), sk('SQL')]);
    const p = profile(['Excel', 'A'], { Excel: 'good', A: 'basic' });
    expect(JSON.stringify(skillMatch(r, p, ctx))).toBe(JSON.stringify(skillMatch(r, p, ctx)));
  });
  it('matches the worked example: contributions add up to the match', () => {
    const r = role([sk('A'), sk('B', 'basic'), sk('SQL')]);
    const result = skillMatch(r, profile(['A', 'Excel'], { A: 'good', Excel: 'expert' }), ctx);
    const sum = result.rows.reduce((total, row) => total + row.points, 0);
    expect(sum).toBeCloseTo(result.match, 9);
  });
});

describe('gaps', () => {
  it('ranks by importance x (1 - coverage), covered skills excluded', () => {
    const r = role([sk('A', 'specific'), sk('B', 'basic'), sk('C', 'specific'), sk('D', 'basic')]);
    const result = skillMatch(r, profile(['A', 'B'], { A: 'expert', B: 'basic' }), ctx);
    expect(result.gaps.map((g) => g.label)).toEqual(['C', 'D', 'B']);
    expect(result.gaps[0].gap).toBe(1.5);
    expect(result.gaps.find((g) => g.label === 'B')).toMatchObject({ status: 'partial', gap: 0.5 });
    expect(result.gaps.some((g) => g.label === 'A')).toBe(false);
  });
  it('breaks ties by importance, then label', () => {
    const r = role([sk('Z', 'basic'), sk('Y', 'basic'), sk('X', 'specific')]);
    const result = skillMatch(r, profile([]), ctx);
    expect(result.gaps.map((g) => g.label)).toEqual(['X', 'Y', 'Z']);
  });
  it('gap shares plus contributions account for the whole 100 points', () => {
    const r = role([sk('A'), sk('B', 'basic'), sk('SQL')]);
    const result = skillMatch(r, profile(['Excel'], { Excel: 'good' }), ctx);
    const gapPoints = result.rows.reduce((t, row) => t + row.gapShare, 0);
    expect(gapPoints + result.match).toBeCloseTo(100, 9);
  });
  it('labels not demonstrated, partial and covered', () => {
    const r = role([sk('A'), sk('B'), sk('SQL')]);
    const rows = skillMatch(r, profile(['A', 'Excel'], { A: 'good', Excel: 'expert' }), ctx).rows;
    expect(rows.map((row) => row.status)).toEqual(['covered', 'not_demonstrated', 'partial']);
    expect(COVERED_AT).toBe(0.8);
  });
  it('the gap list never contradicts the match explanation', () => {
    for (const sample of samples) {
      for (const r of roles) {
        const result = skillMatch(r, sample, realCtx);
        const lost = result.gaps.reduce((t, row) => t + row.gapShare, 0);
        const covered = result.rows.filter((row) => row.status === 'covered').reduce((t, row) => t + row.gapShare, 0);
        expect(result.match + lost + covered).toBeCloseTo(100, 6);
      }
    }
  });
});

describe('behaviour rules', () => {
  const r = role([sk('A'), sk('B', 'basic'), sk('SQL'), sk('D', 'basic')]);
  const base = profile(['A', 'Excel'], { A: 'basic', Excel: 'good' });
  const m = (p) => skillMatch(r, p, ctx).match;
  it('raising a level never lowers the match', () => {
    const order = ['basic', 'good', 'expert'];
    for (let i = 0; i < 2; i++) {
      const lower = m(profile(['A', 'Excel'], { A: order[i], Excel: 'good' }));
      const higher = m(profile(['A', 'Excel'], { A: order[i + 1], Excel: 'good' }));
      expect(higher).toBeGreaterThanOrEqual(lower);
    }
  });
  it('adding a relevant skill never lowers the match', () => {
    expect(m(profile(['A', 'Excel', 'B'], { A: 'basic', Excel: 'good', B: 'basic' }))).toBeGreaterThan(m(base));
    expect(m(profile(['A', 'Excel', 'A'], { A: 'basic', Excel: 'good' }))).toBe(m(base));
  });
  it('adding an unrelated skill cannot raise the match', () => {
    expect(m(profile(['A', 'Excel', 'Cooking'], { A: 'basic', Excel: 'good', Cooking: 'expert' }))).toBe(m(base));
  });
  it('SDG choice, job demand and AI scenario do not change the match', () => {
    const withSdg = { ...base, sdgs: [4, 7, 8, 9] };
    expect(m(withSdg)).toBe(m(base));
    const low = rankBySkillMatch([r], base, { ...ctx, trendGroups: { professionals: { demand: 0 } } }, 'moderate')[0].score.match;
    const high = rankBySkillMatch([r], base, { ...ctx, trendGroups: { professionals: { demand: 100 } } }, 'fast')[0].score.match;
    expect(low).toBe(high);
    expect(low).toBe(m(base));
  });
  it('keeps outlook and SDG bonus as separate numbers, not part of the match', () => {
    const [entry] = rankBySkillMatch([r], { ...base, sdgs: [8] }, { ...ctx, trendGroups: { professionals: { demand: 80 } } }, 'fast');
    expect(entry.score.match).toBe(m(base));
    expect(entry.score.outlook).toBeCloseTo(0.5 * 80 + 0.5 * (100 - 30), 9);
    expect(entry.score.bonus).toBe(5);
    expect(entry.score.legacyMatch).toBe(scoreRole(r, { ...base, sdgs: [8] }, { ...ctx, trendGroups: { professionals: { demand: 80 } } }, 'fast').match);
  });
});

describe('ranking', () => {
  const rs = [
    { ...role([sk('A')]), id: 'b', title: 'B role' },
    { ...role([sk('A')]), id: 'a', title: 'A role' },
    { ...role([sk('Q')]), id: 'c', title: 'C role' },
    { ...role([]), id: 'd', title: 'D role' },
  ];
  it('orders by match, ties by title, unavailable last', () => {
    const ranked = rankBySkillMatch(rs, profile(['A'], { A: 'expert' }), ctx, 'moderate');
    expect(ranked.map((e) => e.role.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(ranked[3].score).toMatchObject({ match: null, matchAvailable: false });
  });
});

describe('future skill match simulation', () => {
  const r = role([sk('A'), sk('SQL'), sk('C', 'basic')]);
  const p = profile(['A', 'Excel'], { A: 'good', Excel: 'good' });
  it('reruns the same engine on a copy and reports the difference', () => {
    const sim = simulateImprovement(r, p, ctx, [{ label: 'A', level: 'expert' }]);
    expect(sim.current.match).toBe(skillMatch(r, p, ctx).match);
    const hypothetical = profile(['A', 'Excel'], { A: 'expert', Excel: 'good' });
    expect(sim.potential.match).toBe(skillMatch(r, hypothetical, ctx).match);
    expect(sim.improvement).toBeCloseTo(sim.potential.match - sim.current.match, 12);
    expect(sim.improvement).toBeGreaterThan(0);
    expect(sim.applied).toEqual([{ label: 'A', from: 'good', to: 'expert', fromAssumed: false }]);
  });
  it('does not change the real profile', () => {
    const copy = JSON.parse(JSON.stringify(p));
    simulateImprovement(r, p, ctx, [{ label: 'A', level: 'expert' }, { label: 'SQL', level: 'basic' }]);
    expect(p).toEqual(copy);
  });
  it('can learn a new skill and only changes requirements that skill covers', () => {
    const sim = simulateImprovement(r, p, ctx, [{ label: 'C', level: 'good' }]);
    const before = Object.fromEntries(sim.current.rows.map((row) => [row.label, row.coverage]));
    const after = Object.fromEntries(sim.potential.rows.map((row) => [row.label, row.coverage]));
    expect(after.C).toBe(0.8);
    expect(after.A).toBe(before.A);
    expect(after.SQL).toBe(before.SQL);
  });
  it('one improved skill can lift every requirement it legitimately covers', () => {
    const wide = role([sk('SQL'), sk('SQL2')]);
    const c = { similar: { SQL: ['Excel'], SQL2: ['Excel'] } };
    const sim = simulateImprovement(wide, profile(['Excel'], { Excel: 'basic' }), c, [{ label: 'Excel', level: 'expert' }]);
    expect(sim.potential.rows.map((row) => row.coverage)).toEqual([0.5, 0.5]);
    expect(sim.current.rows.map((row) => row.coverage)).toEqual([0.25, 0.25]);
  });
  it('skips changes that are not improvements or are invalid', () => {
    const sim = simulateImprovement(r, p, ctx, [{ label: 'A', level: 'basic' }, { label: 'A', level: 'good' }, { label: 'X', level: 'nope' }, null]);
    expect(sim.applied).toEqual([]);
    expect(sim.skipped).toHaveLength(4);
    expect(sim.improvement).toBe(0);
  });
  it('an assumed Basic level can be improved', () => {
    const sim = simulateImprovement(r, profile(['A']), ctx, [{ label: 'A', level: 'good' }]);
    expect(sim.applied[0]).toMatchObject({ from: 'basic', fromAssumed: true });
    expect(sim.improvement).toBeGreaterThan(0);
  });
  it('is never negative for improvements and has limits text', () => {
    for (const sample of samples) {
      for (const role of roles.slice(0, 5)) {
        const result = skillMatch(role, sample, realCtx);
        const top = result.gaps[0];
        if (!top) continue;
        const sim = simulateImprovement(role, sample, realCtx, [{ label: top.label, level: 'good' }]);
        expect(sim.improvement).toBeGreaterThanOrEqual(0);
        expect(sim.limitations.length).toBeGreaterThan(0);
      }
    }
  });
  it('gives no number when the role has no skills', () => {
    expect(simulateImprovement(role([]), p, ctx, [{ label: 'A', level: 'good' }]).improvement).toBeNull();
  });
});

describe('learning pathway from the gaps', () => {
  const labels = [
    { label: 'SQL', hours: 30, portal: 'elatih' },
    { label: 'A', hours: null, portal: 'tvet' },
  ];
  const r = role([sk('A'), sk('SQL'), sk('C', 'basic')]);
  it('follows the gap order and marks each step', () => {
    const p = profile(['Excel', 'C'], { Excel: 'good', C: 'basic' });
    const result = skillMatch(r, p, ctx);
    const steps = buildSkillPathway(r, p, ctx, labels, result);
    expect(steps.map((s) => s.label)).toEqual(result.gaps.map((g) => g.label));
    expect(steps.map((s) => s.label)).toEqual(['A', 'SQL', 'C']);
    expect(steps.map((s) => s.status)).toEqual(['gap', 'similar', 'levelup']);
    expect(steps[0].hours).toBeNull(); // no estimate stays null
    expect(steps[1].hours).toBe(15); // similar skill: half the hours
    expect(steps[2].hours).toBe(10); // default 20 hours, halved for a level-up
    expect(steps.every((s) => s.targetLevel === 'good')).toBe(true);
    expect(steps.every((s) => s.simulatedGain > 0)).toBe(true);
  });
  it('lists nothing when every skill is covered', () => {
    const p = profile(['A', 'SQL', 'C'], { A: 'good', SQL: 'good', C: 'expert' });
    expect(buildSkillPathway(r, p, ctx, labels, skillMatch(r, p, ctx))).toEqual([]);
  });
  it('each step gain equals a real re-run of the engine', () => {
    const p = profile(['Excel'], { Excel: 'good' });
    const result = skillMatch(r, p, ctx);
    const [first] = buildSkillPathway(r, p, ctx, labels, result);
    const after = skillMatch(r, profile(['Excel', first.label], { Excel: 'good', [first.label]: 'good' }), ctx).match;
    expect(first.simulatedGain).toBeCloseTo(after - result.match, 12);
  });
});

describe('AI task analysis and readiness', () => {
  const r = role([sk('A')], {
    code: '2524-02',
    labelSource: 'manual',
    tasks: [
      { text: 'Clean data', label: 'automatable' },
      { text: 'Build reports', label: 'ai_assisted' },
      { text: 'Present findings', label: 'human_led' },
      { text: 'Odd', label: 'unknown' },
    ],
  });
  it('keeps task labels and observed use in separate boxes with provenance', () => {
    const observed = { status: 'ok', tasksUsed: 3, tasksTotal: 9, aiTasks: [{ task: 'x', penetration: 0.5 }], humanTasks: [] };
    const insight = aiTaskInsights(r, observed);
    expect(insight.groups.automatable.map((t) => t.text)).toEqual(['Clean data']);
    expect(insight.groups.assisted.map((t) => t.text)).toEqual(['Build reports']);
    expect(insight.groups.humanLed.map((t) => t.text)).toEqual(['Present findings']);
    expect(insight.groups.assisted[0].confidence).toBe('Placeholder sample label');
    expect(insight.observed.provenance).toContain('Anthropic Economic Index');
    expect(insight.skillLevelNote).toContain('not turn it into a number');
  });
  it('shows no observed box when there is no usable observed data', () => {
    expect(aiTaskInsights(r, null).observed).toBeNull();
    expect(aiTaskInsights(r, { status: 'not_enough' }).observed).toBeNull();
    expect(aiTaskInsights(undefined, undefined).groups.assisted).toEqual([]);
  });
  it('does not invent an AI Readiness percentage without sourced capabilities', () => {
    const withAi = role([sk('Using AI tools')]);
    const missing = aiReadiness(withAi, profile([]), {});
    expect(missing).toMatchObject({ status: 'not_assessed', score: null });
    expect(missing.evidence[0].text).toContain('does not mean you cannot');
    expect(aiReadiness(withAi, profile(['Using AI tools']), {}).evidence[0].text).toContain('shown in your profile');
    const tooFew = { aiCapabilities: { '0000-00': [{ label: 'a', importance: 1, source: 's' }] } };
    expect(aiReadiness(withAi, profile([]), tooFew).status).toBe('not_assessed');
    const unsourced = { aiCapabilities: { '0000-00': ['a', 'b', 'c'].map((label) => ({ label, importance: 1 })) } };
    expect(aiReadiness(withAi, profile([]), unsourced).status).toBe('not_assessed');
  });
  it('scores AI Readiness with the same formula once enough sourced capabilities exist', () => {
    const caps = ['a', 'b', 'c'].map((label) => ({ label, type: 'specific', importance: 1, source: 'test' }));
    const result = aiReadiness(role([]), profile(['a'], { a: 'good' }), { aiCapabilities: { '0000-00': caps } });
    expect(result.status).toBe('assessed');
    expect(result.score).toBeCloseTo((100 * 0.8) / 3, 9);
  });
});

describe('real data wiring', () => {
  it('every sample scores every role from the shipped data', () => {
    for (const sample of samples) {
      for (const r of roles) {
        const result = skillMatch(r, sample, realCtx);
        expect(result.status).toBe('ok');
        expect(result.match).toBeGreaterThanOrEqual(0);
        expect(result.match).toBeLessThanOrEqual(100);
      }
    }
  });
  it('the similarity file covers the same 38 skills as the catalogue and is symmetric with 1 on the diagonal', () => {
    const sim = realCtx.skillSimilarity;
    expect(sim.labels).toEqual(skillsFile.labels.map((item) => item.label));
    sim.matrix.forEach((row, i) => {
      expect(row).toHaveLength(sim.labels.length);
      expect(row[i]).toBe(1);
      row.forEach((value, j) => expect(Math.abs(value - sim.matrix[j][i])).toBeLessThan(1e-3));
    });
  });
  it('every role skill is a catalogue skill so the engine can credit it', () => {
    const known = new Set(skillsFile.labels.map((item) => item.label));
    for (const r of roles) for (const skill of r.skills) expect(known.has(skill.label)).toBe(true);
  });
});

describe('QA additions: labels, provisional levels, similar share, hostile input', () => {
  const r = role([sk('SQL'), sk('Data viz'), sk('C', 'basic')]);
  it('compares labels without case or extra spaces and keeps the role label for display', () => {
    const result = skillMatch(r, profile(['  sql  ', 'EXCEL'], { '  sql  ': 'good', EXCEL: 'expert' }), ctx);
    expect(result.rows[0]).toMatchObject({ label: 'SQL', matchKind: 'identical', matchedSkill: 'sql', coverage: 0.8 });
    expect(result.rows[1]).toMatchObject({ label: 'Data viz', matchKind: 'reviewed_similar', coverage: 0.5 });
  });
  it('the same skill written twice counts once, at the best stated level', () => {
    const doubled = profile(['SQL', 'sql'], { SQL: 'basic', sql: 'expert' });
    expect(studentSkills(doubled)).toHaveLength(1);
    expect(skillMatch(role([sk('SQL')]), doubled, ctx).match).toBe(100);
  });
  it('marks the match provisional only when a credited skill has no stated level', () => {
    const unknown = skillMatch(r, profile(['SQL', 'Excel'], { Excel: 'good' }), ctx);
    expect(unknown).toMatchObject({ provisional: true, provisionalCount: 1, unknownLevelCount: 1 });
    expect(unknown.rows[0]).toMatchObject({ proficiencyState: 'unknown', proficiencyAssumed: true });
    const confirmed = skillMatch(r, profile(['SQL'], { SQL: 'basic' }), ctx);
    expect(confirmed).toMatchObject({ provisional: false, provisionalCount: 0 });
    expect(confirmed.rows[0].proficiencyState).toBe('confirmed');
    // an unknown-level skill that earns no credit does not make the match provisional
    expect(skillMatch(r, profile(['Cooking']), ctx).provisional).toBe(false);
  });
  it('reports how many points rest on reviewed similar skills', () => {
    const result = skillMatch(r, profile(['SQL', 'Excel'], { SQL: 'expert', Excel: 'good' }), ctx);
    const similarRow = result.rows.find((row) => row.matchKind === 'reviewed_similar');
    expect(result.similarPoints).toBeCloseTo(similarRow.points, 12);
    expect(similarRow.points).toBeGreaterThan(0);
    expect(skillMatch(r, profile(['SQL'], { SQL: 'expert' }), ctx).similarPoints).toBe(0);
    expect(similarShareText({ ...result, match: 60 })).toContain('count half');
    expect(similarShareText({ similarPoints: 0, match: 50 })).toBeNull();
  });
  it('survives hostile labels and prototype keys without crashing or giving credit', () => {
    const hostile = JSON.parse('{"skills":["__proto__","constructor","toString","<img src=x onerror=alert(1)>",null,42,{"a":1}],"levels":{"__proto__":"expert","constructor":"expert"}}');
    const roleWithProto = role([sk('constructor'), sk('SQL')]);
    const result = skillMatch(roleWithProto, hostile, { similar: JSON.parse('{"__proto__":["x"],"constructor":["toString"]}') });
    expect(Number.isFinite(result.match)).toBe(true);
    expect(result.match).toBeGreaterThanOrEqual(0);
    expect(result.match).toBeLessThanOrEqual(100);
    expect(JSON.stringify(skillMatch(roleWithProto, hostile, {}))).toBeTruthy();
  });
  it('ignores a similar map that is not an object of arrays', () => {
    for (const bad of [null, [], 'x', { SQL: 'Excel' }, { SQL: null }]) {
      expect(skillMatch(role([sk('SQL')]), profile(['Excel'], { Excel: 'expert' }), { similar: bad }).match).toBe(0);
    }
  });
  it('is fast enough to run for every role on every keystroke', () => {
    const start = performance.now();
    for (let i = 0; i < 200; i++) rankBySkillMatch(roles, samples[0], realCtx, 'moderate');
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

// Independent check of Current Skill Match. The reference below is written separately from src/lib/skillMatch.js
// (no shared code, plain loops, its own normalising) and a few expected values are derived by hand from the spec:
//   C_i = max_j(M x P);  Match = 100 x sum(I x C) / sum(I)
//   M: same skill 1, reviewed similar 0.5, else 0.   P: Basic 0.5, Good 0.8, Expert 1 (old "strong" = Expert).
//   I: eMASCO "specific" 1.5, "basic" 1.0.   A skill with no level counts as Basic (provisional).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulateImprovement, skillMatch } from '../src/lib/skillMatch.js';
import { rankBySkillMatch } from '../src/lib/skillRanking.js';
import { buildSkillPathway } from '../src/lib/skillPathway.js';

const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const roles = data('roles.json');
const similar = data('skills.json').similar;
const samples = data('samples.json');
const trends = data('trends.json').groups;
const TOL = 1e-9;

function reference(requiredSkills, student) {
  const clean = (text) => String(text).trim().replace(/\s+/g, ' ').toLowerCase();
  const levelValue = { basic: 0.5, good: 0.8, expert: 1, strong: 1 };
  const weight = { specific: 1.5, basic: 1 };
  const similarOf = {};
  for (const [needed, list] of Object.entries(similar)) similarOf[clean(needed)] = list.map(clean);

  const required = {};
  for (const skill of requiredSkills) {
    const key = clean(skill.label);
    const w = weight[skill.type] ?? 1;
    if (!(key in required) || w > required[key].w) required[key] = { w, type: skill.type };
  }
  const have = {};
  for (const label of student.skills) {
    const key = clean(label);
    const stated = student.levels?.[label];
    const value = stated in levelValue ? levelValue[stated] : 0.5;
    if (!(key in have) || value > have[key]) have[key] = value;
  }
  let top = 0;
  let bottom = 0;
  const coverage = {};
  for (const key of Object.keys(required)) {
    let best = 0;
    for (const owned of Object.keys(have)) {
      const credit = owned === key ? 1 : (similarOf[key] ?? []).includes(owned) ? 0.5 : 0;
      best = Math.max(best, credit * have[owned]);
    }
    coverage[key] = best;
    top += required[key].w * best;
    bottom += required[key].w;
  }
  return { match: bottom > 0 ? (100 * top) / bottom : null, coverage };
}

const ctx = { similar, skillSimilarity: data('skill_similarity.json'), trendGroups: trends };
const analyst = roles.find((role) => role.title === 'Data Analyst');
const aina = samples.find((sample) => sample.id === 'aina');

describe('hand-derived anchors (Aina, Data Analyst)', () => {
  // SQL exact Expert 1.5x1.0, Python exact Good 1.5x0.8, Data visualisation via Excel Good 1.5x0.4,
  // Statistics via Excel Good 1.5x0.4, Using AI tools 0 (Python is no longer counted as similar), Communication Good 1.0x0.8.
  const earned = 1.5 * 1 + 1.5 * 0.8 + 1.5 * 0.4 + 1.5 * 0.4 + 0 + 1 * 0.8;
  const total = 1.5 * 5 + 1;
  it('the weights add to 8.5 and the earned weight to 4.7', () => {
    expect(total).toBe(8.5);
    expect(earned).toBeCloseTo(4.7, 12);
  });
  it('current match is 4.7 / 8.5 = 55.29%', () => {
    expect(skillMatch(analyst, aina, ctx).match).toBeCloseTo((100 * 4.7) / 8.5, 9);
    expect(skillMatch(analyst, aina, ctx).match).toBeCloseTo(55.2941176, 5);
  });
  it('before the Python -> Using AI tools pair was removed it was 5.3 / 8.5 = 62.35% (the reported 62%)', () => {
    const oldSimilar = { ...similar, 'Using AI tools': ['Python programming'] };
    expect(skillMatch(analyst, aina, { ...ctx, similar: oldSimilar }).match).toBeCloseTo((100 * 5.3) / 8.5, 9);
  });
  it('setting Data visualisation and Statistics to Good adds 2 x 1.5 x 0.4 = 1.2 weight: +14.12 points', () => {
    const sim = simulateImprovement(analyst, aina, ctx, [
      { label: 'Data visualisation', level: 'good' },
      { label: 'Statistics', level: 'good' },
    ]);
    expect(sim.potential.match).toBeCloseTo((100 * 5.9) / 8.5, 9);
    expect(sim.improvement).toBeCloseTo((100 * 1.2) / 8.5, 9);
    expect(sim.current.rows.map((row) => row.coverage)).toEqual([1, 0.8, 0.4, 0.4, 0, 0.8].map((v) => expect.closeTo(v, 9)));
    // rows not selected keep the same coverage
    expect(sim.potential.rows.filter((row) => !['Data visualisation', 'Statistics'].includes(row.label)).map((row) => row.coverage)).toEqual(
      sim.current.rows.filter((row) => !['Data visualisation', 'Statistics'].includes(row.label)).map((row) => row.coverage),
    );
  });
});

describe('hand-derived anchors for the profile built by hand in the browser (QA workflow A)', () => {
  // Python Basic, SQL Expert, Excel Good, Communication Good (the browser showed 62% and 50%).
  const typed = { skills: ['Python programming', 'SQL and databases', 'Spreadsheets (Excel)', 'Communication'], levels: { 'Python programming': 'basic', 'SQL and databases': 'strong', 'Spreadsheets (Excel)': 'good', Communication: 'good' } };
  it('Database Assistant: (1.5x1 + 1.5x0.8 + 0 + 1x(0.5x0.8)) / 5 = 3.1 / 5 = 62%', () => {
    const role = roles.find((r) => r.id === 'db-assistant');
    expect(skillMatch(role, typed, ctx).match).toBeCloseTo(62, 9);
  });
  it('Data Analyst: (1.5x1 + 1.5x0.5 + 1.5x0.4 + 1.5x0.4 + 0 + 1x0.8) / 8.5 = 4.25 / 8.5 = 50%', () => {
    expect(skillMatch(analyst, typed, ctx).match).toBeCloseTo(50, 9);
  });
});

describe('engine equals the independent reference', () => {
  it('every sample student against every role (4 x 20 cases)', () => {
    for (const sample of samples) {
      for (const role of roles) {
        const expected = reference(role.skills, sample);
        expect(Math.abs(skillMatch(role, sample, ctx).match - expected.match)).toBeLessThan(TOL);
      }
    }
  });

  const everySkill = (role, level) => ({ skills: role.skills.map((s) => s.label), levels: Object.fromEntries(role.skills.map((s) => [s.label, level])) });
  const target = roles[0];
  const cases = {
    'no skills': { skills: [], levels: {} },
    'only Basic skills (exact)': everySkill(target, 'basic'),
    'all exact Expert': everySkill(target, 'expert'),
    'all exact legacy strong': everySkill(target, 'strong'),
    'unrelated skills only': { skills: ['Cooking', 'Fishing', 'Welding'], levels: { Cooking: 'expert', Fishing: 'expert', Welding: 'expert' } },
    'several reviewed similar skills': { skills: ['Spreadsheets (Excel)', 'Communication', 'Teamwork', 'Electrical wiring', 'SQL and databases'], levels: { 'Spreadsheets (Excel)': 'good', Communication: 'expert', Teamwork: 'basic', 'Electrical wiring': 'good', 'SQL and databases': 'expert' } },
    'missing proficiency': { skills: target.skills.map((s) => s.label), levels: {} },
    'invalid proficiency': { skills: target.skills.map((s) => s.label), levels: Object.fromEntries(target.skills.map((s) => [s.label, 'wizard'])) },
    'duplicates and case/space aliases': {
      skills: [target.skills[0].label, ` ${target.skills[0].label.toUpperCase()} `, target.skills[0].label, target.skills[1].label.toLowerCase()],
      levels: { [target.skills[0].label]: 'good', [` ${target.skills[0].label.toUpperCase()} `]: 'expert', [target.skills[1].label.toLowerCase()]: 'good' },
    },
  };
  for (const [name, student] of Object.entries(cases)) {
    it(`${name}: every role`, () => {
      for (const role of roles) {
        const expected = reference(role.skills, student);
        const actual = skillMatch(role, student, ctx).match;
        expect(Math.abs(actual - expected.match), `${name} / ${role.title}`).toBeLessThan(TOL);
      }
    });
  }
  it('the named extreme cases give the exact expected values', () => {
    expect(skillMatch(target, cases['no skills'], ctx).match).toBe(0);
    expect(skillMatch(target, cases['all exact Expert'], ctx).match).toBe(100);
    expect(skillMatch(target, cases['all exact legacy strong'], ctx).match).toBe(100);
    expect(skillMatch(target, cases['only Basic skills (exact)'], ctx).match).toBe(50);
    expect(skillMatch(target, cases['unrelated skills only'], ctx).match).toBe(0);
    expect(skillMatch(target, cases['missing proficiency'], ctx).match).toBe(50);
    expect(skillMatch(target, cases['missing proficiency'], ctx).provisional).toBe(true);
    expect(skillMatch(target, cases['only Basic skills (exact)'], ctx).provisional).toBe(false);
  });
});

// A tiny seeded generator so the random cases are the same on every run.
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const LEVELS = ['basic', 'good', 'expert'];
const catalogue = [...new Set(roles.flatMap((role) => role.skills.map((skill) => skill.label)))].sort();

function randomProfile(next) {
  const picked = catalogue.filter(() => next() < 0.3);
  return { skills: picked, levels: Object.fromEntries(picked.map((label) => [label, LEVELS[Math.floor(next() * 3)]])), sdgs: [] };
}
function shuffled(list, next) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const matchOf = (role, profile) => skillMatch(role, profile, ctx).match;

describe('properties on 300 seeded random profiles', () => {
  const next = random(20261025);
  const trials = Array.from({ length: 300 }, () => ({ profile: randomProfile(next), role: roles[Math.floor(next() * roles.length)] }));

  it('stays within 0 to 100, finite, and equals the reference', () => {
    for (const { profile, role } of trials) {
      const value = matchOf(role, profile);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      expect(Math.abs(value - reference(role.skills, profile).match)).toBeLessThan(TOL);
    }
  });
  it('raising any one level never lowers the score; lowering never raises it', () => {
    for (const { profile, role } of trials) {
      for (const label of profile.skills.slice(0, 3)) {
        const at = LEVELS.indexOf(profile.levels[label]);
        const base = matchOf(role, profile);
        if (at < 2) expect(matchOf(role, { ...profile, levels: { ...profile.levels, [label]: LEVELS[at + 1] } })).toBeGreaterThanOrEqual(base - TOL);
        if (at > 0) expect(matchOf(role, { ...profile, levels: { ...profile.levels, [label]: LEVELS[at - 1] } })).toBeLessThanOrEqual(base + TOL);
      }
    }
  });
  it('adding a skill (any catalogue skill, at any level) never lowers the score', () => {
    for (const { profile, role } of trials) {
      const missing = catalogue.find((label) => !profile.skills.includes(label));
      if (!missing) continue;
      for (const level of LEVELS) {
        const added = { skills: [...profile.skills, missing], levels: { ...profile.levels, [missing]: level } };
        expect(matchOf(role, added)).toBeGreaterThanOrEqual(matchOf(role, profile) - TOL);
      }
    }
  });
  it('adding an unrelated skill never changes the score', () => {
    for (const { profile, role } of trials) {
      const added = { skills: [...profile.skills, 'Underwater basket weaving'], levels: { ...profile.levels, 'Underwater basket weaving': 'expert' } };
      expect(matchOf(role, added)).toBe(matchOf(role, profile));
    }
  });
  it('duplicate student skills cannot inflate the score', () => {
    for (const { profile, role } of trials) {
      const doubled = { skills: [...profile.skills, ...profile.skills], levels: profile.levels };
      expect(matchOf(role, doubled)).toBe(matchOf(role, profile));
    }
  });
  it('student skill order and role skill order do not matter', () => {
    const order = random(7);
    for (const { profile, role } of trials) {
      const mixedProfile = { ...profile, skills: shuffled(profile.skills, order) };
      const mixedRole = { ...role, skills: shuffled(role.skills, order) };
      expect(Math.abs(matchOf(role, mixedProfile) - matchOf(role, profile))).toBeLessThan(TOL);
      expect(Math.abs(matchOf(mixedRole, profile) - matchOf(role, profile))).toBeLessThan(TOL);
    }
  });
  it('case and whitespace differences in the student skill names do not matter', () => {
    for (const { profile, role } of trials) {
      const messy = {
        skills: profile.skills.map((label) => `  ${label.toUpperCase()}  `),
        levels: Object.fromEntries(profile.skills.map((label) => [`  ${label.toUpperCase()}  `, profile.levels[label]])),
      };
      expect(matchOf(role, messy)).toBe(matchOf(role, profile));
    }
  });
  it('SDGs, job demand and the AI scenario never change the match', () => {
    for (const { profile, role } of trials) {
      const base = matchOf(role, profile);
      const ranked = (sdgs, demand, scenario) =>
        rankBySkillMatch([role], { ...profile, sdgs }, { ...ctx, trendGroups: { [role.group]: { demand } } }, scenario)[0].score.match;
      expect(ranked([], 0, 'moderate')).toBe(base);
      expect(ranked([4, 7, 8, 9, 13], 100, 'fast')).toBe(base);
    }
  });
  it('identical input gives identical output', () => {
    for (const { profile, role } of trials.slice(0, 50)) {
      expect(JSON.stringify(skillMatch(role, profile, ctx))).toBe(JSON.stringify(skillMatch(role, profile, ctx)));
    }
  });
  it('gaps agree with coverage: listed gaps are exactly the rows below Good, in gap order, and add up with the match to 100', () => {
    for (const { profile, role } of trials) {
      const result = skillMatch(role, profile, ctx);
      const expected = reference(role.skills, profile);
      const weight = (row) => (row.type === 'specific' ? 1.5 : 1);
      expect(result.gaps.map((g) => g.label).sort()).toEqual(result.rows.filter((r) => r.coverage < 0.8).map((r) => r.label).sort());
      for (const row of result.rows) {
        expect(Math.abs(row.coverage - expected.coverage[row.label.toLowerCase()])).toBeLessThan(TOL);
        expect(Math.abs(row.gap - weight(row) * (1 - row.coverage))).toBeLessThan(TOL);
      }
      for (let i = 1; i < result.gaps.length; i++) expect(result.gaps[i - 1].gap).toBeGreaterThanOrEqual(result.gaps[i].gap - TOL);
      const gapPoints = result.rows.reduce((sum, row) => sum + row.gapShare, 0);
      expect(Math.abs(result.match + gapPoints - 100)).toBeLessThan(1e-6);
      expect(new Set(result.gaps.map((g) => g.label)).size).toBe(result.gaps.length);
    }
  });
  it('the study steps are exactly the engine gaps (same labels, same order) and never a covered skill', () => {
    for (const { profile, role } of trials.slice(0, 100)) {
      const result = skillMatch(role, profile, ctx);
      const steps = buildSkillPathway(role, profile, ctx, [], result);
      expect(steps.map((s) => s.label)).toEqual(result.gaps.map((g) => g.label));
      const roleLabels = new Set(role.skills.map((s) => s.label));
      for (const step of steps) {
        expect(roleLabels.has(step.label)).toBe(true);
        expect(step.coverage).toBeLessThan(0.8);
      }
    }
  });
  it('a simulation never changes the real profile and never lowers the score; it equals a plain re-run', () => {
    const order = random(99);
    for (const { profile, role } of trials.slice(0, 100)) {
      const frozen = JSON.stringify(profile);
      const pick = shuffled(catalogue, order).slice(0, 3).map((label) => ({ label, level: LEVELS[Math.floor(order() * 3)] }));
      const sim = simulateImprovement(role, profile, ctx, pick);
      expect(JSON.stringify(profile)).toBe(frozen);
      expect(sim.potential.match).toBeGreaterThanOrEqual(sim.current.match - TOL);
      expect(sim.potential.match).toBeLessThanOrEqual(100);
      const rerun = { skills: [...profile.skills], levels: { ...profile.levels } };
      for (const item of sim.applied) {
        if (!rerun.skills.includes(item.label)) rerun.skills.push(item.label);
        rerun.levels[item.label] = item.to;
      }
      expect(Math.abs(sim.potential.match - reference(role.skills, rerun).match)).toBeLessThan(TOL);
    }
  });
  it('with equal-level exact skills the strongest option wins (max policy): a lower exact match vs a higher similar match', () => {
    const role = { skills: [{ label: 'SQL and databases', type: 'specific' }] };
    const c = { similar: { 'SQL and databases': ['Spreadsheets (Excel)'] } };
    // exact Basic = 0.5 x 1; similar Expert = 0.5 x 1. Equal, so either gives 50.
    expect(skillMatch(role, { skills: ['SQL and databases', 'Spreadsheets (Excel)'], levels: { 'SQL and databases': 'basic', 'Spreadsheets (Excel)': 'expert' } }, c).match).toBe(50);
    // exact Good = 0.8 beats similar Expert 0.5
    expect(skillMatch(role, { skills: ['SQL and databases', 'Spreadsheets (Excel)'], levels: { 'SQL and databases': 'good', 'Spreadsheets (Excel)': 'expert' } }, c).match).toBe(80);
    // no exact skill: a similar Expert reaches only 50
    expect(skillMatch(role, { skills: ['Spreadsheets (Excel)'], levels: { 'Spreadsheets (Excel)': 'expert' } }, c).match).toBe(50);
  });
  it('a role with no usable skills gives no percentage', () => {
    expect(skillMatch({ skills: [] }, aina, ctx)).toMatchObject({ status: 'unavailable', match: null });
  });
});

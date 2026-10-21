import { describe, it, expect } from 'vitest';
import {
  SCENARIO_FACTOR,
  skillStatus,
  scoreRole,
  rankRoles,
  matchRange,
  buildPathway,
  WEIGHTS,
} from '../src/lib/scoring.js';

const sk = (label, type = 'specific', moderate = 0.8, fast = 0.8) => ({ label, type, moderate, fast });
const names = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const roleA = {
  id: 'a', title: 'Role A', group: 'professionals', automatablePct: 30, sdgs: [8, 9],
  skills: names('a', 4).map((l) => sk(l)),
};
const roleB = {
  id: 'b', title: 'Role B', group: 'technicians', automatablePct: 65, sdgs: [],
  skills: names('b', 8).map((l) => sk(l)),
};
const roleC = {
  id: 'c', title: 'Role C', group: 'technicians', automatablePct: 20, sdgs: [7],
  skills: names('c', 4).map((l) => sk(l)),
};
const roles = [roleA, roleB, roleC];

const trendGroups = { professionals: { demand: 75.6 }, technicians: { demand: 69.6 } };
const ctx = { similar: {}, trendGroups };

const sixSkillRole = {
  id: 's', title: 'Six', group: 'professionals', automatablePct: 30, sdgs: [],
  skills: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((l) => sk(l)),
};

describe('skillStatus', () => {
  const sim = { 'Data visualisation': ['Spreadsheets'] };
  it('have when the skill is picked', () => {
    expect(skillStatus('Spreadsheets', ['Spreadsheets'], sim)).toBe('have');
  });
  it('similar when a picked skill is listed as similar', () => {
    expect(skillStatus('Data visualisation', ['Spreadsheets'], sim)).toBe('similar');
  });
  it('gap otherwise', () => {
    expect(skillStatus('Data visualisation', ['Welding'], sim)).toBe('gap');
    expect(skillStatus('Data visualisation', [], undefined)).toBe('gap');
  });
});

describe('scoreRole', () => {
  it('uses scenario factors', () => {
    expect(SCENARIO_FACTOR).toEqual({ moderate: 0.6, fast: 1.0 });
  });

  it('fit counts similar as half', () => {
    const c = { similar: { k3: ['x'] }, trendGroups };
    const s = scoreRole(sixSkillRole, { skills: ['k1', 'k2', 'x'], sdgs: [] }, c, 'moderate');
    expect(s.earned).toBe(2.5);
    expect(s.fit).toBeCloseTo(41.67, 2);
  });

  it('outlook uses scenario factor', () => {
    const p = { skills: [], sdgs: [] };
    expect(scoreRole(roleA, p, ctx, 'moderate').outlook).toBeCloseTo(78.8, 5);
    expect(scoreRole(roleA, p, ctx, 'fast').outlook).toBeCloseTo(72.8, 5);
  });

  it('sdg bonus is 5 per goal capped at 10', () => {
    const base = { skills: [] };
    expect(scoreRole(roleA, { ...base, sdgs: [8] }, ctx, 'moderate').bonus).toBe(5);
    const three = { ...roleA, sdgs: [4, 8, 9] };
    const s = scoreRole(three, { ...base, sdgs: [4, 8, 9] }, ctx, 'moderate');
    expect(s.bonus).toBe(10);
    expect(s.matchedGoals).toEqual([4, 8, 9]);
    const none = scoreRole(roleA, { ...base, sdgs: [1] }, ctx, 'moderate');
    expect(none.bonus).toBe(0);
    expect(none.matchedGoals).toEqual([]);
  });

  it('match is capped at 100', () => {
    const r = { ...roleA, sdgs: [4, 8, 9] };
    const p = { skills: names('a', 4), sdgs: [4, 8, 9] };
    const s = scoreRole(r, p, ctx, 'moderate');
    expect(s.fit).toBe(100);
    expect(s.match).toBe(100);
  });

  it('combines fit, outlook and bonus', () => {
    const s = scoreRole(roleA, { skills: ['a1', 'a2'], sdgs: [8] }, ctx, 'moderate');
    expect(s.match).toBeCloseTo(0.6 * 50 + 0.4 * 78.8 + 5, 5);
  });

  it('empty profile gives fit 0 and no NaN', () => {
    const s = scoreRole(roleA, { skills: [], sdgs: [] }, ctx, 'fast');
    expect(s.fit).toBe(0);
    for (const v of [s.earned, s.fit, s.demand, s.outlook, s.bonus, s.match]) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('role with no skills gives fit 0, not NaN', () => {
    const s = scoreRole({ ...roleA, skills: [] }, { skills: ['a1'], sdgs: [] }, ctx, 'fast');
    expect(s.fit).toBe(0);
    expect(Number.isNaN(s.match)).toBe(false);
  });

  it('missing demand group falls back to 50', () => {
    const s = scoreRole(roleA, { skills: [], sdgs: [] }, { similar: {}, trendGroups: { technicians: { demand: 60 } } }, 'moderate');
    expect(s.demand).toBe(50);
    expect(s.demandMissing).toBe(true);
    const none = scoreRole(roleA, { skills: [], sdgs: [] }, { similar: {}, trendGroups: null }, 'moderate');
    expect(none.demand).toBe(50);
    expect(none.demandMissing).toBe(true);
    expect(scoreRole(roleA, { skills: [], sdgs: [] }, ctx, 'moderate').demandMissing).toBe(false);
  });
});

describe('rankRoles', () => {
  // A: fit 50, B: fit 62.5. Moderate B leads by ~2.1, fast A leads by ~0.7.
  const profile = { skills: ['a1', 'a2', 'b1', 'b2', 'b3', 'b4', 'b5'], sdgs: [] };
  const order = (scenario) => rankRoles(roles, profile, ctx, scenario).map((r) => r.role.id);

  it('fast scenario re-orders high-automation role', () => {
    expect(order('moderate')).toEqual(['b', 'a', 'c']);
    expect(order('fast')).toEqual(['a', 'b', 'c']);
  });

  it('returns role and score pairs', () => {
    const [first] = rankRoles(roles, profile, ctx, 'moderate');
    expect(first.role).toBe(roleB);
    expect(first.score.match).toBeGreaterThan(0);
  });

  it('ties broken by title', () => {
    const t1 = { ...roleA, id: 't1', title: 'Zebra' };
    const t2 = { ...roleA, id: 't2', title: 'Apple' };
    const ranked = rankRoles([t1, t2], profile, ctx, 'moderate');
    expect(ranked.map((r) => r.role.title)).toEqual(['Apple', 'Zebra']);
  });
});

describe('matchRange', () => {
  it('gives low and high across scenarios, rounded', () => {
    const p = { skills: ['a1', 'a2'], sdgs: [] };
    const { low, high } = matchRange(roleA, p, ctx);
    expect(low).toBe(Math.round(0.6 * 50 + 0.4 * 72.8));
    expect(high).toBe(Math.round(0.6 * 50 + 0.4 * 78.8));
    expect(low).toBeLessThan(high);
  });
});

describe('buildPathway', () => {
  const role = {
    ...roleA,
    skills: [
      sk('Have it', 'specific', 0.8, 0.8),
      sk('Close one', 'specific', 0.8, 0.6),
      sk('Gap low', 'basic', 0.6, 0.6),
      sk('Gap high', 'specific', 0.8, 1.0),
      sk('Gap alpha', 'basic', 0.6, 0.6),
    ],
  };
  const skillLabels = [
    { label: 'Close one', hours: 25, portal: 'tvet' },
    { label: 'Gap high', hours: 30, portal: 'elatih' },
    { label: 'Gap low', hours: 10, portal: 'tvet' },
  ];
  const c = { similar: { 'Close one': ['Other'] }, trendGroups };
  const profile = { skills: ['Have it', 'Other'], sdgs: [] };

  it('orders by importance and halves similar hours', () => {
    const path = buildPathway(role, profile, c, 'fast', skillLabels);
    expect(path.map((p) => p.label)).toEqual(['Gap high', 'Close one', 'Gap alpha', 'Gap low']);
    const close = path.find((p) => p.label === 'Close one');
    expect(close).toEqual({ label: 'Close one', status: 'similar', hours: 13, importance: 0.6, rising: false, portal: 'tvet' });
    const high = path[0];
    expect(high.hours).toBe(30);
    expect(high.rising).toBe(true);
    expect(high.status).toBe('gap');
  });

  it('uses moderate importance and defaults missing labels', () => {
    const path = buildPathway(role, profile, c, 'moderate', skillLabels);
    expect(path[0].importance).toBe(0.8);
    const alpha = path.find((p) => p.label === 'Gap alpha');
    expect(alpha.hours).toBe(20);
    expect(alpha.portal).toBe('elatih');
  });

  it('returns empty when all skills held', () => {
    const all = { skills: role.skills.map((s) => s.label), sdgs: [] };
    expect(buildPathway(role, all, c, 'fast', skillLabels)).toEqual([]);
  });
});

describe('WEIGHTS', () => {
  it('exports the match weights used by the score', () => {
    expect(WEIGHTS).toEqual({ fit: 0.6, outlook: 0.4 });
  });
});

describe('fairness', () => {
  it('ignores personal attributes: same skills give the same scores and ranking', () => {
    const base = { skills: ['a1', 'a2', 'b1', 'b2', 'b3'], interests: ['Working with data'], sdgs: [8] };
    const withPersonal = { ...base, age: 41, gender: 'female', ethnicity: 'any', religion: 'any', location: 'Sabah' };
    for (const scenario of ['moderate', 'fast']) {
      const plain = rankRoles(roles, base, ctx, scenario);
      const personal = rankRoles(roles, withPersonal, ctx, scenario);
      expect(personal.map((r) => r.role.id)).toEqual(plain.map((r) => r.role.id));
      expect(personal.map((r) => r.score)).toEqual(plain.map((r) => r.score));
    }
  });
});

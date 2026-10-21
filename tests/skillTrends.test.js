import { describe, it, expect } from 'vitest';
import { SHOWN_PER_BAND, skillTrends } from '../src/lib/skillTrends.js';

const ilo = (category, mean) => ({ category, mean });
const role = (id, group, skills, iloInfo) => ({ id, group, skills: skills.map((label) => ({ label })), ilo: iloInfo });

const trendGroups = {
  professionals: { growthPct: 12.8 },
  technicians: { growthPct: 9.8 },
  agriculture: { growthPct: -31.7 },
};

const roles = [
  role('a', 'professionals', ['Python', 'Teamwork'], ilo('Gradient 3', 0.56)),
  role('b', 'professionals', ['Python', 'Planning'], ilo('Gradient 2', 0.48)),
  role('c', 'technicians', ['Wiring', 'Teamwork', 'Planning'], ilo('Not Exposed', 0.27)),
  role('d', 'technicians', ['Wiring'], ilo('Minimal Exposure', 0.33)),
];

const find = (result, label) =>
  [...result.bands.changing, ...result.bands.mixed, ...result.bands.humanLed].find((s) => s.label === label);

describe('skillTrends', () => {
  it('puts a skill in "changing" when most of its roles are in an ILO exposed gradient', () => {
    const result = skillTrends(roles, trendGroups, []);
    expect(result.bands.changing.map((s) => s.label)).toEqual(['Python']);
    expect(find(result, 'Python')).toMatchObject({ roleCount: 2, exposedCount: 2, iloMean: 0.52, growthPct: 12.8 });
  });

  it('puts half-exposed skills in "mixed" and unexposed ones in "human-led"', () => {
    const result = skillTrends(roles, trendGroups, []);
    expect(result.bands.mixed.map((s) => s.label)).toEqual(['Teamwork', 'Planning']);
    expect(result.bands.humanLed.map((s) => s.label)).toEqual(['Wiring']);
    expect(find(result, 'Wiring').iloMean).toBe(0.3);
    expect(find(result, 'Teamwork').growthPct).toBe(11.3);
  });

  it('sorts each band by exposure, highest first, then by name', () => {
    const tied = [
      role('x', 'professionals', ['Beta', 'Alpha'], ilo('Gradient 4', 0.6)),
      role('y', 'professionals', ['Gamma'], ilo('Gradient 1', 0.38)),
    ];
    expect(skillTrends(tied, trendGroups, []).bands.changing.map((s) => s.label)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('marks the skills the student has', () => {
    const result = skillTrends(roles, trendGroups, ['Wiring']);
    expect(find(result, 'Wiring').have).toBe(true);
    expect(find(result, 'Python').have).toBe(false);
  });

  it('leaves out skills whose roles have no ILO data, and counts them', () => {
    const result = skillTrends([...roles, role('e', 'professionals', ['Mystery'], undefined)], trendGroups, []);
    expect(find(result, 'Mystery')).toBeUndefined();
    expect(result.withoutIlo).toEqual(['Mystery']);
  });

  it('lists the job groups used, with growth, and flags shrinking ones', () => {
    const result = skillTrends(roles, trendGroups, []);
    expect(result.jobGroups).toEqual([
      { group: 'professionals', growthPct: 12.8 },
      { group: 'technicians', growthPct: 9.8 },
    ]);
    expect(result.anyShrinking).toBe(false);
    const farm = skillTrends([role('f', 'agriculture', ['Farming'], ilo('Not Exposed', 0.1))], trendGroups, []);
    expect(farm.anyShrinking).toBe(true);
    expect(find(farm, 'Farming').growthPct).toBe(-31.7);
  });

  it('gives null growth when the trend group is missing', () => {
    const result = skillTrends([role('g', 'managers', ['Leading'], ilo('Gradient 2', 0.45))], trendGroups, []);
    expect(find(result, 'Leading').growthPct).toBeNull();
    expect(result.jobGroups).toEqual([]);
  });

  it('shows a fixed number of skills per band before "show all"', () => {
    expect(SHOWN_PER_BAND).toBe(6);
  });
});

import { describe, it, expect } from 'vitest';
import { MIN_PAPERS, RISING_PCT, momentum, researchRows, risingSkills } from '../src/lib/research.js';

const entry = (earlier, later) => ({
  term: 'term',
  counts: { '2024': earlier, '2025': later },
});
const YEARS = [2024, 2025];

const research = {
  source: { name: 'OpenAlex', url: 'https://openalex.org', licence: 'CC0', query: 'q', years: YEARS, fetchedAt: '2026-10-21' },
  skills: {
    Python: entry(105, 173),
    Teamwork: entry(300, 330),
    Robotics: entry(755, 1057),
    Wiring: entry(12, 27),
    Ethics: entry(0, 50),
    Planning: entry(30, 30),
    Nursing: entry(30, 40),
    Coding: entry(100, 165),
  },
};

describe('constants', () => {
  it('uses the agreed thresholds', () => {
    expect(MIN_PAPERS).toBe(30);
    expect(RISING_PCT).toBe(25);
  });
});

describe('momentum', () => {
  it('105 to 173 is +65%, enough and rising', () => {
    expect(momentum(entry(105, 173), YEARS)).toEqual({
      earlier: 105,
      later: 173,
      changePct: 65,
      enough: true,
      rising: true,
    });
  });

  it('755 to 1057 is +40%, rising', () => {
    expect(momentum(entry(755, 1057), YEARS)).toMatchObject({ changePct: 40, enough: true, rising: true });
  });

  it('300 to 330 is +10%, enough but not rising', () => {
    expect(momentum(entry(300, 330), YEARS)).toMatchObject({ changePct: 10, enough: true, rising: false });
  });

  it('12 to 27 is too few papers, so no change % and not rising', () => {
    expect(momentum(entry(12, 27), YEARS)).toMatchObject({ enough: false, changePct: null, rising: false });
  });

  it('0 to 50 is too few (no divide by zero)', () => {
    expect(momentum(entry(0, 50), YEARS)).toMatchObject({ enough: false, changePct: null, rising: false });
  });

  it('30 to 30 is enough with 0% change', () => {
    expect(momentum(entry(30, 30), YEARS)).toMatchObject({ enough: true, changePct: 0, rising: false });
  });

  it('a missing count counts as too few', () => {
    expect(momentum({ term: 't', counts: { '2024': 50 } }, YEARS)).toMatchObject({ enough: false, changePct: null });
  });
});

describe('researchRows', () => {
  const result = researchRows(research);

  it('lists only enough-paper skills as rows, highest change first, ties by label', () => {
    expect(result.rows.map((row) => row.label)).toEqual(['Coding', 'Python', 'Robotics', 'Nursing', 'Teamwork', 'Planning']);
    expect(result.rows[1]).toEqual({ label: 'Python', earlier: 105, later: 173, changePct: 65 });
  });

  it('breaks change ties by label', () => {
    const tied = researchRows({
      source: { years: YEARS },
      skills: { Zeta: entry(100, 150), Alpha: entry(100, 150) },
    });
    expect(tied.rows.map((row) => row.label)).toEqual(['Alpha', 'Zeta']);
  });

  it('keeps the file label order for too-few skills', () => {
    expect(result.tooFew).toEqual([
      { label: 'Wiring', earlier: 12, later: 27 },
      { label: 'Ethics', earlier: 0, later: 50 },
    ]);
  });

  it('reports the years', () => {
    expect(result.years).toEqual(YEARS);
  });

  it('returns empty rows for null research', () => {
    expect(researchRows(null)).toEqual({ rows: [], tooFew: [], years: null });
  });

  it('returns empty rows when the source has no years', () => {
    expect(researchRows({ skills: { Python: entry(105, 173) } })).toEqual({ rows: [], tooFew: [], years: null });
  });
});

describe('risingSkills', () => {
  it('returns only the labels that are rising', () => {
    expect([...risingSkills(research)].sort()).toEqual(['Coding', 'Nursing', 'Python', 'Robotics']);
  });

  it('returns an empty set for null research', () => {
    expect(risingSkills(null)).toEqual(new Set());
  });
});

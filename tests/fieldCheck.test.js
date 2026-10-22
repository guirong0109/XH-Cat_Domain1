import { describe, expect, it } from 'vitest';
import { suggestField } from '../src/lib/fieldCheck.js';

const fields = {
  majors: [
    { id: 'a', label: 'Alpha', groups: ['GA'] },
    { id: 'b', label: 'Beta', groups: ['GB'] },
    { id: 'c', label: 'Gamma', groups: ['GC'] },
    { id: 'o', label: 'Other', groups: [] },
  ],
};
const roles = [
  { interest: 'GA', skills: [{ label: 'a1' }, { label: 'a2' }, { label: 'a3' }, { label: 'x' }] },
  { interest: 'GB', skills: [{ label: 'b1' }, { label: 'b2' }, { label: 'b3' }, { label: 'x' }] },
  { interest: 'GC', skills: [{ label: 'c1' }] },
];

describe('suggestField', () => {
  it('returns null with fewer than 3 skills', () => {
    expect(suggestField(['a1', 'a2'], 'b', roles, fields)).toBeNull();
  });
  it('returns null when the margin is under 2', () => {
    expect(suggestField(['a1', 'b1', 'b2'], 'b', roles, fields)).toBeNull();
    expect(suggestField(['a1', 'a2', 'b1'], 'b', roles, fields)).toBeNull();
  });
  it('returns null on a tie for best', () => {
    expect(suggestField(['a1', 'a2', 'b1', 'b2'], 'c', roles, fields)).toBeNull();
  });
  it('suggests the better major with its skills', () => {
    expect(suggestField(['a1', 'a2', 'a3'], 'b', roles, fields)).toEqual({
      majorId: 'a',
      label: 'Alpha',
      skills: ['a1', 'a2', 'a3'],
    });
  });
  it('returns null when the picked major is the best', () => {
    expect(suggestField(['a1', 'a2', 'a3'], 'a', roles, fields)).toBeNull();
  });
  it('treats Other or an unknown major as 0', () => {
    expect(suggestField(['a1', 'a2', 'a3'], 'o', roles, fields)?.majorId).toBe('a');
    expect(suggestField(['a1', 'a2', 'a3'], null, roles, fields)?.majorId).toBe('a');
  });
});

import { cvFoundSkills } from '../src/lib/fieldCheck.js';
describe('cvFoundSkills', () => {
  it('keeps only picked skills that came from the CV', () => {
    const cv = { evidence: { a1: 'x', gone: 'y' }, sources: { a2: 'ai' } };
    expect(cvFoundSkills(cv, ['a1', 'a2', 'manual'])).toEqual(['a1', 'a2']);
    expect(cvFoundSkills(null, ['a1'])).toEqual([]);
  });
});

import { weakFit } from '../src/lib/fieldCheck.js';

describe('weakFit', () => {
  it('is null when nothing was found in the CV', () => {
    expect(weakFit([], 'a', roles, fields)).toBeNull();
  });
  it('is null for Other, an unknown major or no major', () => {
    expect(weakFit(['c1'], 'o', roles, fields)).toBeNull();
    expect(weakFit(['c1'], 'zzz', roles, fields)).toBeNull();
    expect(weakFit(['c1'], null, roles, fields)).toBeNull();
  });
  it('is null when most CV skills fit the picked major', () => {
    expect(weakFit(['a1', 'a2'], 'a', roles, fields)).toBeNull();
    expect(weakFit(['a1', 'c1'], 'a', roles, fields)).toBeNull();
  });
  it('flags a CV where no skill fits the picked major', () => {
    expect(weakFit(['c1'], 'a', roles, fields)).toEqual({ label: 'Alpha', found: 1, fit: 0 });
  });
  it('flags a CV where fewer than half the skills fit', () => {
    expect(weakFit(['a1', 'c1', 'b1'], 'a', roles, fields)).toEqual({ label: 'Alpha', found: 3, fit: 1 });
  });
});

describe('weakFit with shared skills', () => {
  const f2 = { majors: [{ id: 'a', label: 'Alpha', groups: ['GA'] }, { id: 'b', label: 'Beta', groups: ['GB'] }] };
  const r2 = [
    { interest: 'GA', skills: [{ label: 'a1' }, { label: 'team' }] },
    { interest: 'GB', skills: [{ label: 'b1' }, { label: 'team' }] },
  ];
  it('flags a CV that has only shared skills', () => {
    expect(weakFit(['team'], 'a', r2, f2)).toEqual({ label: 'Alpha', found: 1, fit: 0 });
  });
  it('does not count shared skills as a fit', () => {
    expect(weakFit(['team', 'a1'], 'a', r2, f2)).toBeNull();
    expect(weakFit(['team', 'b1'], 'a', r2, f2)).toEqual({ label: 'Alpha', found: 2, fit: 0 });
  });
});

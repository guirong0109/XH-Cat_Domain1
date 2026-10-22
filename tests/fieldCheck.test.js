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

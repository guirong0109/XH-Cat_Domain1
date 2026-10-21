import { describe, it, expect } from 'vitest';
import {
  MAX_LEARN,
  learnChoice,
  learnCount,
  startingPoint,
  toggleLearn,
} from '../src/lib/potential.js';

const role = { skills: [{ label: 'SQL' }, { label: 'Data visualisation' }, { label: 'Statistics' }] };

describe('starting point', () => {
  it('gives a starting-point line only when who is set', () => {
    expect(startingPoint(null)).toBeNull();
    expect(startingPoint('student')).toMatch(/^Your starting point: student\. /);
    expect(startingPoint('student')).toMatch(/internship/i);
    expect(startingPoint('working')).toMatch(/^Your starting point: already working\. /);
    expect(startingPoint('working')).toMatch(/HRD Corp claimable/);
  });
});

describe('skills to learn', () => {
  it('counts how many of a role’s skills the student wants to learn', () => {
    expect(learnCount(role, ['Data visualisation', 'Python'])).toBe(1);
    expect(learnCount(role, [])).toBe(0);
  });

  it('allows up to 3 and never a skill the student already has', () => {
    expect(MAX_LEARN).toBe(3);
    const profile = { skills: ['SQL'], learn: ['A', 'B'] };
    expect(learnChoice('SQL', profile)).toEqual({ disabled: true, reason: 'you have it' });
    expect(learnChoice('C', profile)).toEqual({ disabled: false, reason: '' });
    expect(learnChoice('D', { ...profile, learn: ['A', 'B', 'C'] })).toEqual({ disabled: true, reason: 'limit of 3 reached' });
    expect(learnChoice('A', { ...profile, learn: ['A', 'B', 'C'] })).toEqual({ disabled: false, reason: '' });
  });

  it('toggles a learn skill, ignoring a 4th pick and skills already held', () => {
    expect(toggleLearn({ skills: [], learn: ['A'] }, 'B').learn).toEqual(['A', 'B']);
    expect(toggleLearn({ skills: [], learn: ['A', 'B'] }, 'A').learn).toEqual(['B']);
    expect(toggleLearn({ skills: [], learn: ['A', 'B', 'C'] }, 'D').learn).toEqual(['A', 'B', 'C']);
    expect(toggleLearn({ skills: ['X'], learn: [] }, 'X').learn).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  OLD_ROUTES,
  SCREENS,
  STEP_SCREENS,
  firstIncompleteStep,
  resolveScreen,
  stepComplete,
} from '../src/lib/navigation.js';
import samples from '../data/samples.json';
import fields from '../data/fields.json';

const f = {
  majors: [{ id: 'm-it', label: 'IT', groups: ['A'] }],
  sectors: [{ id: 's-1', label: 'Sector', groups: ['B'] }],
  groups: ['A', 'B'],
};
const empty = { who: null, field: null, skills: [], goal: null, targetSectors: [] };
const about = { ...empty, who: 'student', field: 'm-it' };
const skilled = { ...about, skills: ['a', 'b', 'c'] };
const full = { ...skilled, goal: 'upgrade' };

describe('stepComplete', () => {
  it('about needs who and a field from the matching list', () => {
    expect(stepComplete('about', empty, f)).toBe(false);
    expect(stepComplete('about', about, f)).toBe(true);
  });
  it('field from the other list is incomplete', () => {
    expect(stepComplete('about', { ...empty, who: 'working', field: 'm-it' }, f)).toBe(false);
  });
  it('without field data, who and field are enough', () => {
    expect(stepComplete('about', about, null)).toBe(true);
    expect(stepComplete('about', { ...empty, who: 'student' }, undefined)).toBe(false);
  });
  it('skills needs 3', () => {
    expect(stepComplete('skills', { skills: ['a', 'b'] }, f)).toBe(false);
    expect(stepComplete('skills', skilled, f)).toBe(true);
  });
  it('goal needs a goal only (Change work no longer asks for target sectors)', () => {
    expect(stepComplete('goal', skilled, f)).toBe(false);
    expect(stepComplete('goal', full, f)).toBe(true);
    expect(stepComplete('goal', { ...skilled, goal: 'move' }, f)).toBe(true);
    expect(stepComplete('goal', { ...skilled, goal: 'move', targetSectors: ['A'] }, f)).toBe(true);
    expect(stepComplete('goal', { ...skilled, goal: 'unsure' }, f)).toBe(true);
  });
  it('matches and study are always complete', () => {
    expect(stepComplete('matches', empty, f)).toBe(true);
    expect(stepComplete('study', empty, f)).toBe(true);
  });
});

describe('firstIncompleteStep', () => {
  it('walks about, skills, goal, then matches', () => {
    expect(firstIncompleteStep(empty, f)).toBe('about');
    expect(firstIncompleteStep(about, f)).toBe('skills');
    expect(firstIncompleteStep(skilled, f)).toBe('goal');
    expect(firstIncompleteStep(full, f)).toBe('matches');
  });
});

describe('resolveScreen', () => {
  it('follows the unlock chain', () => {
    expect(resolveScreen('about', empty, f)).toBe('about');
    expect(resolveScreen('skills', empty, f)).toBe('about');
    expect(resolveScreen('skills', about, f)).toBe('skills');
    expect(resolveScreen('goal', about, f)).toBe('skills');
    expect(resolveScreen('matches', skilled, f)).toBe('goal');
    expect(resolveScreen('study', skilled, f)).toBe('goal');
    expect(resolveScreen('matches', full, f)).toBe('matches');
    expect(resolveScreen('study', full, f)).toBe('study');
  });
  it('Change work with no target sectors opens matches', () => {
    expect(resolveScreen('matches', { ...skilled, goal: 'move' }, f)).toBe('matches');
  });
  it('redirects old routes to their new screens', () => {
    expect(resolveScreen('profile', empty, f)).toBe('about');
    expect(resolveScreen('radar', full, f)).toBe('matches');
    expect(resolveScreen('roles', full, f)).toBe('matches');
    expect(resolveScreen('pathway', full, f)).toBe('study');
    expect(resolveScreen('preview-cv', about, f)).toBe('skills');
    expect(resolveScreen('roles', empty, f)).toBe('about');
    expect(Object.keys(OLD_ROUTES)).toHaveLength(5);
  });
  it('sends unknown screens home and always allows home', () => {
    expect(resolveScreen('nope', full, f)).toBe('home');
    expect(resolveScreen('', full, f)).toBe('home');
    expect(resolveScreen('home', empty, f)).toBe('home');
  });
  it('sends the removed Stage 2 preview screens home', () => {
    expect(resolveScreen('preview-lang', empty, f)).toBe('home');
    expect(resolveScreen('preview-users', full, f)).toBe('home');
  });
  it('opens Explore all roles without a profile, and it is not a numbered step', () => {
    expect(resolveScreen('explore', empty, f)).toBe('explore');
    expect(SCREENS).toContain('explore');
    expect(STEP_SCREENS).not.toContain('explore');
  });
  it('a full sample profile unlocks all screens', () => {
    for (const sample of samples) {
      for (const screen of STEP_SCREENS) expect(resolveScreen(screen, sample, fields)).toBe(screen);
    }
  });
});

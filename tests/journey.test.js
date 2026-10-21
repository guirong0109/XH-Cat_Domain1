import { describe, it, expect } from 'vitest';
import { JOURNEY, adjacentSteps, journeySteps, nextHint, stepPosition } from '../src/lib/journey.js';

const f = {
  majors: [{ id: 'm-it', label: 'IT', groups: ['A'] }],
  sectors: [],
  groups: ['A'],
};
const empty = { who: null, field: null, skills: [], goal: null, targetSectors: [] };
const about = { ...empty, who: 'student', field: 'm-it' };
const full = { ...about, skills: ['a', 'b', 'c'], goal: 'upgrade' };

describe('JOURNEY', () => {
  it('is home plus five labelled steps', () => {
    expect(JOURNEY.map((s) => s.label)).toEqual(['Home', 'About you', 'Your skills', 'Your goal', 'Matches', 'What to study']);
    expect(JOURNEY[5].sub).toBe('Courses on official portals');
  });
});

describe('journeySteps', () => {
  it('marks earlier steps done, the shown one current and later ones to do', () => {
    const states = journeySteps('matches', full, f).map((s) => [s.screen, s.state]);
    expect(states).toEqual([
      ['home', 'done'],
      ['about', 'done'],
      ['skills', 'done'],
      ['goal', 'done'],
      ['matches', 'current'],
      ['study', 'todo'],
    ]);
  });

  it('locks later steps with a reason naming the step to finish', () => {
    const steps = journeySteps('about', empty, f);
    expect(steps.find((s) => s.screen === 'about').state).toBe('current');
    for (const screen of ['skills', 'goal', 'matches', 'study']) {
      const step = steps.find((s) => s.screen === screen);
      expect(step.state).toBe('locked');
      expect(step.lockReason).toBe('Finish About you first');
    }
    const later = journeySteps('skills', about, f);
    expect(later.find((s) => s.screen === 'goal').lockReason).toBe('Finish Your skills first');
    expect(later.find((s) => s.screen === 'matches').lockReason).toBe('Finish Your skills first');
    expect(later[0].number).toBeNull();
    expect(later[1].number).toBe(1);
  });

  it('has no current step on a preview screen', () => {
    expect(journeySteps('preview-lang', full, f).some((s) => s.state === 'current')).toBe(false);
  });
});

describe('stepPosition', () => {
  it('numbers the five steps after home', () => {
    expect(stepPosition('about')).toEqual({ number: 1, total: 5 });
    expect(stepPosition('study')).toEqual({ number: 5, total: 5 });
  });
  it('returns null for home and previews', () => {
    expect(stepPosition('home')).toBeNull();
    expect(stepPosition('preview-users')).toBeNull();
  });
});

describe('adjacentSteps', () => {
  it('gives the step before and after', () => {
    const { back, next } = adjacentSteps('skills', full, f);
    expect(back.screen).toBe('about');
    expect(next.screen).toBe('goal');
    expect(next.locked).toBe(false);
  });
  it('marks next as locked when the step is not finished', () => {
    expect(adjacentSteps('about', empty, f).next).toMatchObject({ screen: 'skills', locked: true });
  });
  it('has no next on the last step and no back from home', () => {
    expect(adjacentSteps('study', full, f).next).toBeNull();
    expect(adjacentSteps('home', full, f).back).toBeNull();
  });
  it('returns nothing for previews', () => {
    expect(adjacentSteps('preview-lang', full, f)).toEqual({ back: null, next: null });
  });
});

describe('nextHint', () => {
  it('gives the agreed hint per step', () => {
    expect(nextHint('about')).toBe('Tell us who you are and pick your major or sector.');
    expect(nextHint('skills')).toBe('Upload your CV or pick at least 3 skills, then check each level.');
    expect(nextHint('goal')).toBe('Pick your goal, then see your matches.');
    expect(nextHint('matches')).toBe('Pick a role, then plan what to study.');
    expect(nextHint('study')).toBe('Tick off steps as you learn. You can go back and try another role.');
    for (const step of JOURNEY) expect(nextHint(step.screen)).toMatch(/\w/);
    expect(nextHint('preview-lang')).toBe('This is a preview. Go back to your journey any time.');
  });
});

import { describe, it, expect } from 'vitest';
import { JOURNEY, adjacentSteps, journeySteps, nextHint, stepPosition } from '../src/lib/journey.js';

describe('journeySteps', () => {
  it('marks earlier steps done, the shown one current and later ones to do', () => {
    const states = journeySteps('roles', 4).map((step) => [step.screen, step.state]);
    expect(states).toEqual([
      ['home', 'done'],
      ['profile', 'done'],
      ['radar', 'done'],
      ['roles', 'current'],
      ['pathway', 'todo'],
    ]);
  });

  it('locks the later steps with a reason when there are fewer than 3 skills', () => {
    const steps = journeySteps('profile', 2);
    expect(steps.find((step) => step.screen === 'profile').state).toBe('current');
    for (const screen of ['radar', 'roles', 'pathway']) {
      const step = steps.find((item) => item.screen === screen);
      expect(step.state).toBe('locked');
      expect(step.lockReason).toBe('Add 1 more skill first');
    }
    expect(journeySteps('profile', 0)[2].lockReason).toBe('Add 3 more skills first');
  });

  it('has no current step on a preview screen', () => {
    expect(journeySteps('preview-cv', 4).some((step) => step.state === 'current')).toBe(false);
  });
});

describe('stepPosition', () => {
  it('numbers the four journey steps after home', () => {
    expect(stepPosition('profile')).toEqual({ number: 1, total: 4 });
    expect(stepPosition('pathway')).toEqual({ number: 4, total: 4 });
  });

  it('returns null for home and previews', () => {
    expect(stepPosition('home')).toBeNull();
    expect(stepPosition('preview-users')).toBeNull();
  });
});

describe('adjacentSteps', () => {
  it('gives the step before and after', () => {
    const { back, next } = adjacentSteps('radar', 4);
    expect(back.screen).toBe('profile');
    expect(next.screen).toBe('roles');
    expect(next.locked).toBe(false);
  });

  it('marks next as locked with fewer than 3 skills', () => {
    expect(adjacentSteps('profile', 1).next).toMatchObject({ screen: 'radar', locked: true });
  });

  it('has no next on the last step and no back from home', () => {
    expect(adjacentSteps('pathway', 4).next).toBeNull();
    expect(adjacentSteps('home', 4).back).toBeNull();
  });

  it('returns nothing for previews', () => {
    expect(adjacentSteps('preview-lang', 4)).toEqual({ back: null, next: null });
  });
});

describe('nextHint', () => {
  it('asks for more skills when steps are locked', () => {
    expect(nextHint('profile', 1)).toBe('Pick 2 more skills to unlock your skills radar.');
  });

  it('gives one hint per step', () => {
    for (const step of JOURNEY) expect(nextHint(step.screen, 4)).toMatch(/\w/);
    expect(nextHint('preview-cv', 4)).toBe('This is a preview. Go back to your journey any time.');
  });
});

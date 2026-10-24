import { describe, it, expect } from 'vitest';
import {
  AI_SKILL,
  AI_USES,
  aiSkillSuggestion,
  aiUseLine,
  forUsesLine,
  orderForUses,
  toggleAiUse,
  usesAi,
} from '../src/lib/aiUse.js';
import skills from '../data/skills.json';

describe('AI_USES', () => {
  it('has the agreed eight choices, ending with none', () => {
    expect(AI_USES.map((use) => use.id)).toEqual(['writing', 'automation', 'research', 'data', 'coding', 'design', 'other', 'none']);
  });
  it('suggests a real skill from the list', () => {
    expect(skills.labels.map((l) => l.label)).toContain(AI_SKILL);
  });
});

describe('toggleAiUse', () => {
  it('adds and removes', () => {
    expect(toggleAiUse([], 'writing')).toEqual(['writing']);
    expect(toggleAiUse(['writing', 'data'], 'writing')).toEqual(['data']);
    expect(toggleAiUse(undefined, 'coding')).toEqual(['coding']);
  });
  it('none clears the others and the others clear none', () => {
    expect(toggleAiUse(['writing', 'data'], 'none')).toEqual(['none']);
    expect(toggleAiUse(['none'], 'writing')).toEqual(['writing']);
    expect(toggleAiUse(['none'], 'none')).toEqual([]);
  });
});

describe('aiSkillSuggestion', () => {
  it('Basic for 1 or 2 uses, Good for 3 or more', () => {
    expect(aiSkillSuggestion(['writing'], [])).toEqual({ label: AI_SKILL, level: 'basic', count: 1 });
    expect(aiSkillSuggestion(['writing', 'data'], [])).toMatchObject({ level: 'basic', count: 2 });
    expect(aiSkillSuggestion(['writing', 'data', 'other'], [])).toMatchObject({ level: 'good', count: 3 });
  });
  it('nothing for none, no answer, or when the skill is already picked', () => {
    expect(aiSkillSuggestion(['none'], [])).toBeNull();
    expect(aiSkillSuggestion([], [])).toBeNull();
    expect(aiSkillSuggestion(undefined, undefined)).toBeNull();
    expect(aiSkillSuggestion(['writing'], [AI_SKILL])).toBeNull();
  });
  it('usesAi is false for none only', () => {
    expect(usesAi(['none'])).toBe(false);
    expect(usesAi(['coding'])).toBe(true);
  });
});

describe('aiUseLine', () => {
  it('names the uses in list order', () => {
    expect(aiUseLine(['data', 'writing'])).toBe('Uses AI for: writing, data');
    expect(aiUseLine(['none'])).toBe("Doesn't use AI yet");
    expect(aiUseLine([])).toBeNull();
  });
});

describe('orderForUses', () => {
  const a = { url: 'a', title: 'A' };
  const b = { url: 'b', title: 'B' };
  const c = { url: 'c', title: 'C' };
  const uses = { b: ['writing'], c: ['none', 'data'] };
  it('puts matching courses first and keeps the rest in order', () => {
    const out = orderForUses([a, b, c], ['writing'], uses);
    expect(out.map((x) => x.url)).toEqual(['b', 'a', 'c']);
    expect(out[0].forUses).toEqual(['writing']);
    expect(out[1].forUses).toEqual([]);
  });
  it('keeps the order when there is no answer or no tags', () => {
    expect(orderForUses([a, b, c], [], uses).map((x) => x.url)).toEqual(['a', 'b', 'c']);
    expect(orderForUses([a, b], ['writing'], undefined).map((x) => x.url)).toEqual(['a', 'b']);
    expect(orderForUses(undefined, ['writing'], uses)).toEqual([]);
  });
  it('tags in the real data are known uses', () => {
    const ids = new Set(AI_USES.map((use) => use.id));
    for (const tags of Object.values(skills.aiCourses.uses)) for (const tag of tags) expect(ids.has(tag)).toBe(true);
  });
});

describe('forUsesLine', () => {
  it('explains why a course moved up', () => {
    expect(forUsesLine(['research', 'writing'])).toBe('Listed first: you use AI for writing, research');
    expect(forUsesLine(['none'])).toBe("Listed first: a good start if you don't use AI yet");
    expect(forUsesLine([])).toBeNull();
  });
});

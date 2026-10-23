import { describe, it, expect } from 'vitest';
import {
  MAX_PICKS,
  barWidth,
  errorText,
  gradesText,
  levelLabel,
  levelNote,
  missingSkills,
  pickSkill,
  pickedStatus,
  resultNote,
  similarityText,
  sourceLine,
  unpickSkill,
  whyLines,
} from '../src/lib/exploreView.js';
import { matchRoles, searchSkills } from '../src/lib/exploreApi.js';

describe('picking skills', () => {
  it('adds a skill once and keeps the order', () => {
    let picked = pickSkill([], { id: 'a', text: 'A', roles: 3 });
    picked = pickSkill(picked, { id: 'b', text: 'B' });
    picked = pickSkill(picked, { id: 'a', text: 'A' });
    expect(picked).toEqual([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
  });
  it('stops at the maximum', () => {
    const many = Array.from({ length: MAX_PICKS }, (item, number) => ({ id: `s${number}`, text: `S${number}` }));
    expect(pickSkill(many, { id: 'extra', text: 'Extra' })).toHaveLength(MAX_PICKS);
  });
  it('removes a skill and does not change the original list', () => {
    const picked = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
    expect(unpickSkill(picked, 'a')).toEqual([{ id: 'b', text: 'B' }]);
    expect(picked).toHaveLength(2);
  });
  it('says how many are picked and when it is enough', () => {
    expect(pickedStatus(2)).toEqual({ ready: false, text: '2 of 3 skills picked. Pick at least 3.' });
    expect(pickedStatus(3)).toEqual({ ready: true, text: '3 skills picked.' });
  });
});

describe('labels', () => {
  it('names every level and falls back for an unknown one', () => {
    expect(levelLabel('spm')).toBe('SPM');
    expect(levelLabel('diploma')).toBe('Diploma');
    expect(levelLabel('nonsense')).toBe('Level not stated');
  });
  it('shows similarity as an AI estimate, not a percentage', () => {
    expect(similarityText(0.6146)).toBe('Similarity 0.61 · AI estimate, not a percentage');
  });
  it('turns similarity into a bar width within 0 to 100', () => {
    expect(barWidth(0.614)).toBe(61);
    expect(barWidth(-0.2)).toBe(0);
    expect(barWidth(1.4)).toBe(100);
  });
  it('lists merged grades, and nothing for a single role', () => {
    expect(gradesText({ grades: [{ grade: 'UF9' }, { grade: 'UF10' }] })).toBe('2 roles by civil-service grade: UF9, UF10');
    expect(gradesText({ grades: [{ grade: '' }, { grade: '' }] })).toBe('2 roles by civil-service grade');
    expect(gradesText({ grades: [{ grade: 'WA12, WA13' }, { grade: 'WA14' }] })).toBe('2 roles by civil-service grade: WA12, WA13, WA14');
    expect(gradesText({})).toBe('');
    expect(gradesText({ grades: [{ grade: 'UF9' }] })).toBe('');
  });
});

describe('role detail', () => {
  const card = {
    skills: [
      { text: 'Invoices', type: 'basic', score: 0.8, matched: true, evidence: 'Recorded invoices' },
      { text: 'Billing software', type: 'specific', score: 0.59, matched: false, evidence: null },
      { text: 'Cash handling', type: 'basic', score: 0.5, matched: false, evidence: null },
    ],
  };
  it('shows the closest skills first, with evidence for matched ones', () => {
    expect(whyLines(card, 2)).toEqual([
      { text: 'Invoices', matched: true, score: 0.8, evidence: 'Recorded invoices' },
      { text: 'Billing software', matched: false, score: 0.59, evidence: null },
    ]);
  });
  it('lists only the skills that were not matched as missing', () => {
    expect(missingSkills(card)).toEqual([
      { text: 'Billing software', type: 'specific' },
      { text: 'Cash handling', type: 'basic' },
    ]);
  });
  it('copes with a card without skills', () => {
    expect(whyLines({})).toEqual([]);
    expect(missingSkills({})).toEqual([]);
  });
});

describe('notes', () => {
  it('explains the level filter with the hidden count', () => {
    expect(levelNote({ hiddenByLevel: 8 }, false)).toBe('8 higher-level roles ranked above these are hidden.');
    expect(levelNote({ hiddenByLevel: 1 }, false)).toBe('1 higher-level role ranked above these is hidden.');
    expect(levelNote({ hiddenByLevel: 0 }, false)).toBe('Showing roles up to diploma level.');
    expect(levelNote({ hiddenByLevel: 5 }, true)).toBe('Showing roles at every qualification level.');
  });
  it('asks for more skills, or for another CV', () => {
    expect(resultNote({ status: 'not-enough-skills', lineCount: 2, roles: [] }, 'skills').text).toBe('Pick at least 3 different skills (you have 2).');
    expect(resultNote({ status: 'not-enough-skills', lineCount: 1, roles: [] }, 'cv').text).toMatch(/Not enough skill lines/);
  });
  it('explains an empty list and a weak result, and stays quiet otherwise', () => {
    expect(resultNote({ status: 'ok', roles: [] }, 'skills').text).toMatch(/Include degree roles/);
    expect(resultNote({ status: 'ok', confidence: 'low', roles: [{}] }, 'skills')).toMatchObject({ kind: 'warn' });
    expect(resultNote({ status: 'ok', confidence: 'ok', roles: [{}] }, 'skills')).toBeNull();
    expect(resultNote(null, 'skills')).toBeNull();
  });
  it('names the source with its date and says it is an estimate', () => {
    const line = sourceLine({ occupations: 'eMASCO (MASCO 2020), English pages', crawledOn: '2026-10-23', model: 'BAAI/bge-m3' });
    expect(line).toContain('eMASCO (MASCO 2020), English pages, read 23 Oct 2026');
    expect(line).toContain('BAAI/bge-m3 (an AI estimate)');
    expect(line).toContain('does not make it');
    expect(sourceLine(null)).toBe('');
  });
  it('has plain error messages', () => {
    expect(errorText('cv-ai-off')).toMatch(/Pick skills instead/);
    expect(errorText('emasco-data-missing')).toMatch(/not available/);
    expect(errorText('whatever')).toBe('Could not get roles. Try again.');
  });
});

describe('server calls', () => {
  const reply = (status, body) => async () => ({ status, json: async () => body });
  it('searchSkills encodes the query and returns the skills', async () => {
    let seen;
    const result = await searchSkills('bank & tax', async (url) => {
      seen = url;
      return { status: 200, json: async () => ({ skills: [{ id: 's1', text: 'Bank', roles: 2 }] }) };
    });
    expect(seen).toBe('/api/emasco/skills?q=bank%20%26%20tax&limit=8');
    expect(result).toEqual({ ok: true, skills: [{ id: 's1', text: 'Bank', roles: 2 }] });
  });
  it('searchSkills reports the server error code and survives a network failure', async () => {
    expect(await searchSkills('x', reply(503, { error: 'emasco-data-missing' }))).toEqual({ ok: false, error: 'emasco-data-missing' });
    expect(await searchSkills('x', async () => { throw new Error('offline'); })).toEqual({ ok: false, error: 'failed' });
    expect(await searchSkills('x', reply(200, { nope: 1 }))).toEqual({ ok: false, error: 'failed' });
  });
  it('matchRoles posts the body as JSON and returns the result', async () => {
    let seen;
    const result = await matchRoles({ skillIds: ['a', 'b', 'c'] }, async (url, options) => {
      seen = { url, options };
      return { status: 200, json: async () => ({ status: 'ok', roles: [] }) };
    });
    expect(seen.url).toBe('/api/emasco/match');
    expect(JSON.parse(seen.options.body)).toEqual({ skillIds: ['a', 'b', 'c'] });
    expect(result).toEqual({ ok: true, result: { status: 'ok', roles: [] } });
  });
  it('matchRoles maps 503 cv-ai-off, 413, bad JSON and offline to error codes', async () => {
    expect(await matchRoles({}, reply(503, { error: 'cv-ai-off' }))).toEqual({ ok: false, error: 'cv-ai-off' });
    expect(await matchRoles({}, reply(413, {}))).toEqual({ ok: false, error: 'too-long' });
    expect(await matchRoles({}, async () => ({ status: 500, json: async () => { throw new Error('bad json'); } }))).toEqual({ ok: false, error: 'failed' });
    expect(await matchRoles({}, async () => { throw new Error('offline'); })).toEqual({ ok: false, error: 'failed' });
  });
});

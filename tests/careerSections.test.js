import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { splitCareers, transferableLabels } from '../server/careerSections.js';
import { buildIndex } from '../server/emascoMatch.js';
import { writeStore } from '../server/intelligence.js';
import { labelsOfId, skillIdsByLabel } from '../server/topMatches.js';
import { GOAL_LAYOUT, careerLists, fieldLine, goalLayout } from '../src/lib/careerSections.js';
import { fetchTopMatches, generalSkills } from '../src/lib/topMatches.js';

const fieldsFile = {
  fields: [
    { id: 'tech', label: 'Technology' },
    { id: 'office', label: 'Office' },
    { id: 'health', label: 'Health' },
  ],
  majorFields: { 'm-it': ['tech'], 'm-other': [] },
  sectorFields: {},
};
const record = (code, primary, second, confidence = 'high') => ({
  code,
  version: 1,
  processedAt: '2026-10-25T00:00:00.000Z',
  derived: { field: { primary, second, confidence, margin: 0.05, related: [], scores: {} } },
});

describe('skillIdsByLabel and labelsOfId', () => {
  it('keeps every skill label that found each eMASCO id', async () => {
    const search = async (query) => ({ skills: query === 'none' ? [] : [{ id: `${query}-1` }, { id: 'shared' }] });
    const byLabel = await skillIdsByLabel(['a', 'none', 'b'], search);
    expect(byLabel).toEqual([{ label: 'a', ids: ['a-1', 'shared'] }, { label: 'b', ids: ['b-1', 'shared'] }]);
    const labelsOf = labelsOfId(byLabel);
    expect(labelsOf.get('shared')).toEqual(['a', 'b']);
    expect(labelsOf.get('b-1')).toEqual(['b']);
  });
});

describe('splitCareers', () => {
  // lines: [line index or null, score]; a null line is an unmatched role skill.
  const card = (code, lines) => ({ code, skills: lines.map(([line, score = 0.9]) => ({ matched: line !== null, line, score })) });
  const records = { A: record('A', 'tech', 'office'), B: record('B', 'office', 'health'), C: record('C', 'health', 'office'), D: record('D', 'office', 'tech', 'unclear') };
  const lineLabels = [['Python'], ['Teamwork'], ['Excel']];

  it('names the student skills behind closely matched role skills, once each', () => {
    expect(transferableLabels(card('A', [[0], [0], [null], [2]]), lineLabels)).toEqual(['Python', 'Excel']);
    expect(transferableLabels({ code: 'x' }, lineLabels)).toEqual([]);
  });
  it('a loose match (under 0.85) does not count as carrying over', () => {
    expect(transferableLabels(card('A', [[0, 0.84], [2, 0.85]]), lineLabels)).toEqual(['Excel']);
  });
  it('a field skill that found the same eMASCO skill as a general skill is still credited', () => {
    const out = splitCareers({ cards: [card('B', [[0]])], records, fields: fieldsFile, userFields: ['tech'], lineLabels: [['Teamwork', 'Excel']], generalLabels: ['Teamwork'] });
    expect(out.otherField.map((item) => item.transferable)).toEqual([['Teamwork', 'Excel']]);
  });
  it('splits by generated field, keeps the order, and attaches the field and transferable skills', () => {
    const cards = [card('B', [[2]]), card('A', [[0]]), card('D', [[1]]), card('C', [[2]])];
    const out = splitCareers({ cards, records, fields: fieldsFile, userFields: ['tech'], lineLabels, generalLabels: ['Teamwork'] });
    expect(out.inField.map((item) => item.code)).toEqual(['A', 'D']);
    expect(out.otherField.map((item) => item.code)).toEqual(['B', 'C']);
    expect(out.inField[0].field).toMatchObject({ primary: 'tech', primaryLabel: 'Technology', confidence: 'high', version: 1 });
    expect(out.inField[1].field.confidence).toBe('unclear');
    expect(out.otherField[0].transferable).toEqual(['Excel']);
  });
  it('leaves out other-field roles where only general skills carry over, and counts them', () => {
    const out = splitCareers({ cards: [card('B', [[1]]), card('C', [])], records, fields: fieldsFile, userFields: ['tech'], lineLabels, generalLabels: ['Teamwork'] });
    expect(out.otherField).toEqual([]);
    expect(out.generalOnly).toBe(2);
  });
  it('counts roles with no record and caps each list', () => {
    const cards = [card('Z', [[0]]), card('A', [[0]]), card('A', [[0]])];
    const out = splitCareers({ cards, records, fields: fieldsFile, userFields: ['tech'], lineLabels, max: 1 });
    expect(out.unclassified).toBe(1);
    expect(out.inField).toHaveLength(1);
  });
});

describe('career lists in the browser', () => {
  const sections = {
    userFields: [{ id: 'tech', label: 'Technology' }],
    inField: Array.from({ length: 10 }, (_, i) => ({ code: `in-${i}` })),
    otherField: Array.from({ length: 3 }, (_, i) => ({ code: `other-${i}` })),
    generalOnly: 2,
  };
  it('Improve myself: your field first, 8 and 4', () => {
    const lists = careerLists(sections, 'upgrade', []);
    expect(lists.map((list) => [list.key, list.shown, list.total])).toEqual([['in', 8, 10], ['other', 3, 3]]);
    expect(lists[0].title).toBe('In your field: Technology');
    expect(lists[1].note).toMatch(/^2 other-field roles were left out/);
  });
  it('Change work: other fields first, 8 and 4', () => {
    const lists = careerLists(sections, 'move', []);
    expect(lists.map((list) => [list.key, list.shown])).toEqual([['other', 3], ['in', 4]]);
  });
  it('Not sure yet (or no goal): your field first, 6 and 6; Show more adds roles up to the total', () => {
    expect(careerLists(sections, 'unsure', []).map((list) => list.shown)).toEqual([6, 3]);
    expect(goalLayout(undefined)).toBe(GOAL_LAYOUT.unsure);
    expect(careerLists(sections, 'unsure', [], { in: 6 })[0].shown).toBe(10);
  });
  it('turns one of our scored roles into a scored entry, and returns nothing without sections', () => {
    const ranked = [{ role: { id: 'r', code: 'in-0' }, score: { match: 50 } }];
    expect(careerLists(sections, 'upgrade', ranked)[0].entries[0].kind).toBe('scored');
    expect(careerLists(null, 'upgrade', ranked)).toEqual([]);
  });
  it('says the field with its confidence in words, and both candidates when unclear', () => {
    expect(fieldLine({ primaryLabel: 'Technology', confidence: 'high' })).toBe('Field: Technology (clear match)');
    expect(fieldLine({ primaryLabel: 'Technology', confidence: 'medium' })).toBe('Field: Technology (likely)');
    expect(fieldLine({ primaryLabel: 'Office', secondLabel: 'Data', confidence: 'unclear' })).toBe('Field unclear: Office or Data');
    expect(fieldLine(null)).toBeNull();
  });
});

describe('fetchTopMatches and generalSkills for the career lists', () => {
  it('sends the major and the general skills when given', async () => {
    let sent;
    const impl = async (_url, init) => ((sent = JSON.parse(init.body)), { status: 200, json: async () => ({ roles: [{ code: '1' }] }) });
    await fetchTopMatches(['A', 'B', 'C'], impl, { field: 'm-it', generalLabels: ['Talk'] });
    expect(sent).toEqual({ labels: ['A', 'B', 'C'], top: 20, field: 'm-it', generalLabels: ['Talk'] });
  });
  it('lists skills almost every major uses, even when they stay in the ranking', () => {
    const fields = { majors: [{ groups: ['G1'] }, { groups: ['G2'] }] };
    const roles = [
      { interest: 'G1', skills: [{ label: 'Talk' }, { label: 'Code' }] },
      { interest: 'G2', skills: [{ label: 'Talk' }, { label: 'Weld' }] },
    ];
    expect(generalSkills(['Talk', 'Code'], roles, fields)).toEqual(['Talk']);
    expect(generalSkills(['Talk'], [], null)).toEqual([]);
  });
});

describe('POST /api/matches/top with the career split', () => {
  const unit = (position) => [0, 1, 2, 3].map((i) => (i === position ? 1 : 0));
  const skills = ['Excel', 'Python', 'Welding', 'Teamwork'].map((text, row) => ({ id: `s0000${row + 1}`, text, roles: ['x'] }));
  const entries = ['Excel', 'Python', 'Welding'].map((text) => ({ text, type: 'basic' }));
  const role = (code, title) => ({ code, title, description: '', url: `https://emasco.example/${code}`, qualification: 'Diploma or equivalent', tags: [], tasks: [], skills: entries });
  const occupations = { source: 'eMASCO test', fetchedAt: '2026-10-23', skills, roles: [role('1111-01', 'Tech Role'), role('3333-01', 'Office Role')], tasksOnly: [] };
  const index = buildIndex({
    occupations,
    skillVectors: Float32Array.from([unit(0), unit(1), unit(2), unit(3)].flat()),
    dimension: 4,
    roleVectors: Float32Array.from([unit(0), unit(1)].flat()),
    roleCodes: occupations.roles.map((item) => item.code),
  });
  let directory;
  let server;
  let base;
  const post = (body) => fetch(`${base}/api/matches/top`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'career-api-'));
    server = createApp({ dataDir: directory, embedder: null, emascoLoader: async () => ({ occupations, index }) }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const store = () =>
    writeStore(path.join(directory, 'intel'), {
      records: { '1111-01': record('1111-01', 'tech', 'office'), '3333-01': record('3333-01', 'office', 'tech') },
      meta: { runId: 'run-test', builtAt: '2026-10-25T00:00:00.000Z', mode: 'test', fieldsVersion: 'f', conceptsVersion: 'c' },
      fields: fieldsFile,
      run: { runId: 'run-test' },
    });

  it('without a stored intelligence file, answers the single list as before', async () => {
    const body = await (await post({ labels: ['Excel', 'Python', 'Welding'], field: 'm-it' })).json();
    expect(body.sections).toBeUndefined();
    expect(body.roles.length).toBeGreaterThan(0);
  });
  it('with the store and a major, splits the ranked pool into your field and other fields', async () => {
    await store();
    const body = await (await post({ labels: ['Excel', 'Python', 'Welding'], field: 'm-it', generalLabels: [] })).json();
    expect(body.sections.userFields).toEqual([{ id: 'tech', label: 'Technology' }]);
    expect(body.sections.inField.map((card) => card.code)).toEqual(['1111-01']);
    expect(body.sections.otherField.map((card) => card.code)).toEqual(['3333-01']);
    expect(body.sections.inField[0].field.primaryLabel).toBe('Technology');
    expect(body.sections.intelligence).toMatchObject({ runId: 'run-test', mode: 'test' });
  });
  it('a major with no linked field (Other) gets the single list', async () => {
    await store();
    const body = await (await post({ labels: ['Excel', 'Python', 'Welding'], field: 'm-other' })).json();
    expect(body.sections).toBeUndefined();
  });
  it('rejects a bad field or bad general skills', async () => {
    expect((await post({ labels: ['Excel'], field: 42 })).status).toBe(400);
    expect((await post({ labels: ['Excel'], generalLabels: [1] })).status).toBe(400);
  });
  it('an inherited name as the major gives the single list, not an error', async () => {
    await store();
    const response = await post({ labels: ['Excel', 'Python', 'Welding'], field: '__proto__' });
    expect(response.status).toBe(200);
    expect((await response.json()).sections).toBeUndefined();
  });
});

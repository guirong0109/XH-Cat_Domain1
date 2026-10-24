import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { buildIndex } from '../server/emascoMatch.js';
import { skillIdsForLabels } from '../server/topMatches.js';
import { cardCodes, fetchTopMatches, mergeTop, rankingSkills, scoredOf } from '../src/lib/topMatches.js';

describe('skillIdsForLabels', () => {
  it('collects unique ids per label and skips labels with no hit', async () => {
    const search = async (label) => ({ skills: label === 'none' ? [] : [{ id: 'a' }, { id: label === 'x' ? 'b' : 'a' }] });
    expect(await skillIdsForLabels(['x', 'y', 'none'], search)).toEqual(['a', 'b']);
  });
  it('asks for three ids per label by default and returns an empty list for no labels', async () => {
    const limits = [];
    await skillIdsForLabels(['x'], async (_label, limit) => (limits.push(limit), { skills: [] }));
    expect(limits).toEqual([3]);
    expect(await skillIdsForLabels([], async () => ({ skills: [] }))).toEqual([]);
  });
});

describe('mergeTop', () => {
  const ranked = [
    { role: { id: 'data-analyst', code: '2524-02' }, score: { match: 80 } },
    { role: { id: 'accountant', code: '2411-01' }, score: { match: 70 } },
  ];
  it('keeps server order, scored roles by code and others as cards', () => {
    const cards = [{ code: '9999-01' }, { code: '2524-02' }, { code: '8888-01' }];
    const entries = mergeTop(cards, ranked);
    expect(entries.map((entry) => entry.kind)).toEqual(['other', 'scored', 'other']);
    expect(entries[1].role.id).toBe('data-analyst');
    expect(entries[1].score.match).toBe(80);
    expect(entries[1].reason).toBeNull();
  });
  it('finds our role behind a merged grade card and lists it once', () => {
    const cards = [{ code: '2411-13', grades: [{ code: '2411-13' }, { code: '2411-01' }] }, { code: '2411-01' }];
    const entries = mergeTop(cards, ranked);
    expect(entries).toHaveLength(1);
    expect(entries[0].role.id).toBe('accountant');
    expect(cardCodes(cards[0])).toEqual(['2411-13', '2411-13', '2411-01']);
  });
  it('handles empty input', () => {
    expect(mergeTop([], ranked)).toEqual([]);
    expect(mergeTop(undefined, undefined)).toEqual([]);
    expect(scoredOf(mergeTop([{ code: '1' }], ranked))).toEqual([]);
  });
});

describe('fetchTopMatches', () => {
  const reply = (status, body) => async () => ({ status, json: async () => body });
  it('sends labels only and returns the result', async () => {
    let sent;
    const impl = async (url, init) => ((sent = { url, body: JSON.parse(init.body) }), { status: 200, json: async () => ({ roles: [{ code: '1' }] }) });
    const out = await fetchTopMatches(['A', 'B', 'C'], impl);
    expect(out.ok).toBe(true);
    expect(sent.url).toBe('/api/matches/top');
    expect(sent.body).toEqual({ labels: ['A', 'B', 'C'], top: 20 });
  });
  it('fails safely on a bad status, no roles, bad json or a network error', async () => {
    expect((await fetchTopMatches(['A'], reply(503, {}))).ok).toBe(false);
    expect((await fetchTopMatches(['A'], reply(200, { roles: [] }))).ok).toBe(false);
    expect((await fetchTopMatches(['A'], reply(200, null))).ok).toBe(false);
    expect((await fetchTopMatches(['A'], async () => { throw new Error('offline'); })).ok).toBe(false);
  });
});

describe('POST /api/matches/top', () => {
  const unit = (position) => [0, 1, 2, 3].map((i) => (i === position ? 1 : 0));
  const skills = ['Excel', 'Python', 'Welding', 'Teamwork'].map((text, row) => ({ id: `s0000${row + 1}`, text, roles: ['x'] }));
  const entries = ['Excel', 'Python', 'Welding'].map((text) => ({ text, type: 'basic' }));
  const role = (code, title, qualification) => ({ code, title, description: '', url: `https://emasco.example/${code}`, qualification, tags: [], tasks: [], skills: entries });
  const occupations = {
    source: 'eMASCO test',
    fetchedAt: '2026-10-23',
    skills,
    roles: [role('1111-01', 'Degree Role', 'Bachelor’s degree or equivalent'), role('2222-01', 'Master Role', 'Master’s degree'), role('3333-01', 'Diploma Role', 'Diploma or equivalent')],
    tasksOnly: [],
  };
  const index = buildIndex({
    occupations,
    skillVectors: Float32Array.from([unit(0), unit(1), unit(2), unit(3)].flat()),
    dimension: 4,
    roleVectors: Float32Array.from([unit(0), unit(1), unit(2)].flat()),
    roleCodes: occupations.roles.map((r) => r.code),
  });
  let directory;
  let server;
  let base;
  const post = (body) => fetch(`${base}/api/matches/top`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'top-api-'));
    server = createApp({ dataDir: directory, embedder: null, emascoLoader: async () => ({ occupations, index }) }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  it('maps skill names to eMASCO skills and ranks roles without a model, hiding master level by default', async () => {
    const response = await post({ labels: ['Excel', 'Python', 'Welding'] });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mappedSkillCount).toBe(3);
    expect(body.maxLevel).toBe('degree');
    const codes = body.roles.map((card) => card.code);
    expect(codes).toContain('1111-01');
    expect(codes).not.toContain('2222-01');
    expect(body.source.occupations).toBe('eMASCO test');
  });
  it('can include master and PhD roles when asked', async () => {
    const body = await (await post({ labels: ['Excel', 'Python', 'Welding'], maxLevel: 'phd' })).json();
    expect(body.roles.map((card) => card.code)).toContain('2222-01');
  });
  it('says not-enough-skills when fewer than three eMASCO skills are found', async () => {
    const body = await (await post({ labels: ['Excel'] })).json();
    expect(body.status).toBe('not-enough-skills');
    expect(body.roles).toEqual([]);
  });
  it('rejects bad input', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ labels: [1, 2, 3] })).status).toBe(400);
    expect((await post({ labels: ['  '] })).status).toBe(400);
    expect((await post({ labels: Array.from({ length: 51 }, () => 'Excel') })).status).toBe(400);
    expect((await post({ labels: ['x'.repeat(121)] })).status).toBe(400);
  });
});

describe('rankingSkills', () => {
  const fields = { majors: [{ groups: ['G1'] }, { groups: ['G2'] }, { groups: [] }] };
  const roles = [
    { interest: 'G1', skills: [{ label: 'Talk' }, { label: 'Code' }, { label: 'Data' }] },
    { interest: 'G2', skills: [{ label: 'Talk' }, { label: 'Weld' }] },
  ];
  it('leaves out skills that nearly every field uses', () => {
    expect(rankingSkills(['Talk', 'Code', 'Data', 'Weld'], roles, fields)).toEqual({ used: ['Code', 'Data', 'Weld'], left: ['Talk'] });
  });
  it('keeps every skill when fewer than three specific ones would remain', () => {
    expect(rankingSkills(['Talk', 'Code', 'Data'], roles, fields)).toEqual({ used: ['Talk', 'Code', 'Data'], left: [] });
  });
  it('keeps every skill when there is no field data', () => {
    expect(rankingSkills(['A', 'B', 'C'], [], null)).toEqual({ used: ['A', 'B', 'C'], left: [] });
  });
});

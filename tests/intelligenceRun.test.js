// Runs the real pipeline on a copy of the committed data: first run, an unchanged re-run, then a changed OpenDOSM figure.
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readStore } from '../server/intelligence.js';
import { runIntelligenceBuild } from '../scripts/lib/intelligenceRun.js';

const DATA = path.resolve('data');

describe('occupation intelligence pipeline on the committed data', () => {
  let input;
  let out;
  beforeAll(async () => {
    input = await mkdtemp(path.join(tmpdir(), 'intel-in-'));
    out = path.join(input, 'out');
    await cp(path.join(DATA, 'emasco', 'occupations.json'), path.join(input, 'emasco', 'occupations.json'));
    await cp(path.join(DATA, 'emasco', 'vectors'), path.join(input, 'emasco', 'vectors'), { recursive: true });
    await cp(path.join(DATA, 'team', 'field_concepts.json'), path.join(input, 'team', 'field_concepts.json'));
    await cp(path.join(DATA, 'exposure.json'), path.join(input, 'exposure.json'));
    await cp(path.join(DATA, 'trends.json'), path.join(input, 'trends.json'));
  }, 60000);
  afterAll(async () => {
    await rm(input, { recursive: true, force: true });
  });

  it('first run: every occupation gets a field, a confidence and sources; nothing is invented', async () => {
    const { run } = await runIntelligenceBuild({ inputDir: input, outDir: out, mode: 'test', now: new Date('2026-10-25T01:00:00Z') });
    expect(run.counts.new).toBe(run.counts.processed);
    expect(run.counts.processed).toBeGreaterThan(1700);
    const store = await readStore(out);
    const records = Object.values(store.roles);
    expect(records.every((record) => typeof record.derived.field.primary === 'string')).toBe(true);
    expect(new Set(records.map((record) => record.derived.field.primary)).size).toBe(store.fields.fields.length);
    for (const record of records) {
      // An outlook needs observed AI use, or (for our 20 scored roles only) the placeholder labels the app also uses.
      if (record.derived.outlook.status === 'ok') expect(record.derived.aiUse.status === 'ok' || /placeholder task labels/.test(record.derived.outlook.basis)).toBe(true);
      else expect(record.derived.outlook).not.toHaveProperty('moderate');
    }
    expect(store.fields.majorFields['m-it']).toEqual(['technology', 'data']);
    expect(store.runs).toHaveLength(1);
  }, 60000);

  it('re-run with the same inputs: every record is unchanged and keeps version 1', async () => {
    const { run } = await runIntelligenceBuild({ inputDir: input, outDir: out, mode: 'test', now: new Date('2026-10-25T02:00:00Z') });
    expect(run.counts).toMatchObject({ new: 0, updated: 0, gone: 0 });
    expect(run.counts.unchanged).toBe(run.counts.processed);
    const store = await readStore(out);
    expect(Object.values(store.roles).every((record) => record.version === 1)).toBe(true);
    expect(store.runs).toHaveLength(2);
  }, 60000);

  it('a refresh that only brings a new fetch date, or reworded field definitions, changes no record', async () => {
    const trendsFile = path.join(input, 'trends.json');
    const trends = JSON.parse(await readFile(trendsFile, 'utf8'));
    await writeFile(trendsFile, JSON.stringify({ ...trends, source: { ...trends.source, fetchedAt: '2026-10-30T00:00:00.000Z' } }));
    const conceptsFile = path.join(input, 'team', 'field_concepts.json');
    const concepts = JSON.parse(await readFile(conceptsFile, 'utf8'));
    concepts.fields[0] = { ...concepts.fields[0], definition: `${concepts.fields[0].definition} Reworded.`, label: 'Tech (renamed)' };
    await writeFile(conceptsFile, JSON.stringify(concepts));
    const { run } = await runIntelligenceBuild({ inputDir: input, outDir: out, mode: 'test', now: new Date('2026-10-25T02:30:00Z') });
    expect(run.counts).toMatchObject({ new: 0, updated: 0 });
    const store = await readStore(out);
    const any = Object.values(store.roles).find((record) => record.observed.demand.status === 'ok');
    expect(any.observed.demand.fetchedAt).toBe('2026-10-30T00:00:00.000Z');
    expect(any.version).toBe(1);
  }, 60000);

  it('a changed OpenDOSM figure for one job group updates exactly the roles of that group, to version 2', async () => {
    const trendsFile = path.join(input, 'trends.json');
    const trends = JSON.parse(await readFile(trendsFile, 'utf8'));
    trends.groups.agriculture = { ...trends.groups.agriculture, demand: trends.groups.agriculture.demand + 10 };
    await writeFile(trendsFile, JSON.stringify(trends));
    const before = await readStore(out);
    const inGroup = Object.values(before.roles).filter((record) => record.observed.demand.group === 'agriculture').length;
    const { run } = await runIntelligenceBuild({ inputDir: input, outDir: out, mode: 'test', now: new Date('2026-10-25T03:00:00Z') });
    expect(inGroup).toBeGreaterThan(0);
    expect(run.counts.updated).toBe(inGroup);
    const after = await readStore(out);
    const changed = Object.values(after.roles).filter((record) => record.version === 2);
    expect(changed.every((record) => record.observed.demand.group === 'agriculture')).toBe(true);
    expect(changed[0].inputParts.demand).not.toBe(before.roles[changed[0].code].inputParts.demand);
    expect(changed[0].inputParts.fields).toBe(before.roles[changed[0].code].inputParts.fields);
  }, 60000);
});

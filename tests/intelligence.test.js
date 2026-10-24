import { describe, expect, it } from 'vitest';
import { buildRecord, hashOf, mergeRecords, outlookFor, stableJson, userFieldsFor } from '../server/intelligence.js';
import { scoreRole } from '../src/lib/scoring.js';

describe('stableJson and hashOf', () => {
  it('give the same text and hash whatever the key order', () => {
    expect(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(hashOf({ b: 1, a: 2 })).toBe(hashOf({ a: 2, b: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });
});

describe('outlookFor', () => {
  const observed = { status: 'ok', observedShare: 0.4, tasksUsed: 5, tasksTotal: 5 };
  const appOutlook = (automatablePct, row, scenario) =>
    scoreRole({ code: 'x', group: 'g', automatablePct, skills: [], sdgs: [] }, { skills: [], sdgs: [] }, { trendGroups: { g: { demand: 70 } }, observed: { roles: { x: row } } }, scenario).outlook;

  it('a role outside our 20 with every task matched equals the app formula in both scenarios', () => {
    const ours = outlookFor({ demand: 70, observed });
    expect(ours.status).toBe('ok');
    expect(ours.moderate).toBeCloseTo(appOutlook(99, observed, 'moderate'), 1);
    expect(ours.rapid).toBeCloseTo(appOutlook(99, observed, 'fast'), 1);
    expect(ours.rapid).toBeLessThan(ours.moderate);
  });
  it('one of our 20 roles (task labels given) equals the app score even when only some tasks matched', () => {
    const partial = { status: 'ok', observedShare: 0.333, tasksUsed: 3, tasksTotal: 8 };
    for (const scenario of ['moderate', 'fast']) {
      const ours = outlookFor({ demand: 70, observed: partial, labelPct: 45 });
      expect(ours[scenario === 'fast' ? 'rapid' : 'moderate']).toBeCloseTo(appOutlook(45, partial, scenario), 1);
    }
    const labelsOnly = outlookFor({ demand: 70, observed: { status: 'not_enough' }, labelPct: 45 });
    expect(labelsOnly.moderate).toBeCloseTo(appOutlook(45, { status: 'not_enough' }, 'moderate'), 1);
    expect(labelsOnly.basis).toMatch(/placeholder task labels \(Sample\)/);
  });
  it('says how many matched tasks showed AI use, out of how many matched and in all', () => {
    const ours = outlookFor({ demand: 70, observed: { status: 'ok', observedShare: 0.333, tasksUsed: 3, tasksTotal: 8 } });
    expect(ours.basis).toBe('AI use observed in 1 of 3 matched tasks (8 tasks in all); the matched tasks stand for the whole role.');
  });
  it('is unavailable, never a number, without usable AI-use data (and no labels) or without demand', () => {
    expect(outlookFor({ demand: 70, observed: { status: 'not_enough' } })).toEqual({ status: 'unavailable', reason: 'Too few of its tasks matched the AI-use data.' });
    expect(outlookFor({ demand: 70, observed: null }).status).toBe('unavailable');
    expect(outlookFor({ demand: 70, observed: { ...observed, tasksUsed: 0 } }).status).toBe('unavailable');
    expect(outlookFor({ demand: NaN, observed, labelPct: 45 }).status).toBe('unavailable');
    expect(outlookFor({ demand: undefined, observed })).not.toHaveProperty('moderate');
  });
  it('no observed AI use (share 0) gives the same outlook in both scenarios', () => {
    const ours = outlookFor({ demand: 60, observed: { ...observed, observedShare: 0 } });
    expect(ours.moderate).toBe(80);
    expect(ours.rapid).toBe(80);
  });
});

describe('buildRecord', () => {
  const role = { code: '1111-01', title: 'Role', description: 'd', url: 'u', group: 'professionals', tasks: ['t'], skills: [{ text: 's', type: 'basic' }] };
  const exposure = { source: 'Index', release: 'r1', builtAt: 'b1', roles: { '1111-01': { status: 'ok', observedShare: 0.5, tasksUsed: 4, tasksTotal: 6 } } };
  const trends = { source: { dataset: 'wages_occupation', fetchedAt: 'f1', baseYear: 2020, latestYear: 2025 }, groups: { professionals: { demand: 75, growthPct: 12.5 } } };
  const field = { primary: 'tech', second: 'data', margin: 0.05, confidence: 'high', related: [], scores: { tech: 0.7, data: 0.65 } };
  const make = (overrides = {}) =>
    buildRecord({ role, tasksOnly: false, field, vectorHash: 'v1', exposure, trends, emascoSource: { name: 'eMASCO', fetchedAt: '2026-10-23' }, fieldsVersion: 'f1', runId: 'run1', now: 'now1', ...overrides });

  it('files source facts under observed and calculated values under derived, with sources and dates', () => {
    const record = make();
    expect(record.observed.demand).toMatchObject({ status: 'ok', growthPct: 12.5, source: 'OpenDOSM wages_occupation', fetchedAt: 'f1' });
    expect(record.observed.demand).not.toHaveProperty('demand');
    expect(record.observed.emasco).toMatchObject({ retrievedAt: '2026-10-23', url: 'u', tasksOnly: false });
    expect(record.observed).not.toHaveProperty('aiUse');
    expect(record.derived.aiUse).toMatchObject({ status: 'ok', observedShare: 0.5, tasksWithUse: 2, tasksMatched: 4, tasksTotal: 6, source: 'Index', release: 'r1' });
    expect(record.derived.aiUse.method).toMatch(/bge-m3/);
    expect(record.derived.demandIndex).toMatchObject({ status: 'ok', value: 75 });
    expect(record.derived.field).toBe(field);
    expect(record.derived.outlook.status).toBe('ok');
  });
  it('says what is unavailable instead of filling it', () => {
    const record = make({ exposure: null, trends: null });
    expect(record.derived.aiUse.status).toBe('unavailable');
    expect(record.observed.demand.status).toBe('unavailable');
    expect(record.derived.demandIndex.status).toBe('unavailable');
    expect(record.derived.outlook.status).toBe('unavailable');
  });
  it('changes its input hash only when an input value changes, and names which input part changed', () => {
    const base = make();
    expect(make({ runId: 'run2', now: 'now2' }).inputHash).toBe(base.inputHash);
    const newRelease = make({ exposure: { ...exposure, release: 'r2', builtAt: 'b2' } });
    expect(newRelease.inputHash).not.toBe(base.inputHash);
    expect(newRelease.inputParts.aiUse).not.toBe(base.inputParts.aiUse);
    expect(newRelease.inputParts.demand).toBe(base.inputParts.demand);
    expect(make({ fieldsVersion: 'f2' }).inputParts.fields).not.toBe(base.inputParts.fields);
    expect(make({ labelPct: 40 }).inputParts.labels).not.toBe(base.inputParts.labels);
  });
  it('a refresh that only brings new dates is not a change', () => {
    const base = make();
    expect(make({ exposure: { ...exposure, builtAt: 'b2' } }).inputHash).toBe(base.inputHash);
    expect(make({ trends: { ...trends, source: { ...trends.source, fetchedAt: 'f2' } } }).inputHash).toBe(base.inputHash);
    expect(make({ emascoSource: { name: 'eMASCO', fetchedAt: '2026-11-01' } }).inputHash).toBe(base.inputHash);
    expect(make({ trends: { ...trends, groups: { professionals: { demand: 76, growthPct: 13 } } } }).inputHash).not.toBe(base.inputHash);
  });
});

describe('mergeRecords', () => {
  const record = (code, inputHash, extra = {}) => ({ code, inputHash, version: 1, runId: 'new', processedAt: 'now', checkedAt: 'now', ...extra });
  it('counts new, unchanged, updated and gone records and keeps versions', () => {
    const previous = { a: record('a', 'h1', { runId: 'old', processedAt: 'then' }), b: record('b', 'h1', { version: 3 }), c: record('c', 'h1') };
    const { records, counts } = mergeRecords(previous, [record('a', 'h1'), record('b', 'h2'), record('d', 'h1')]);
    expect(counts).toEqual({ processed: 3, new: 1, updated: 1, unchanged: 1, gone: 1 });
    expect(records.b.version).toBe(4);
    expect(records.d.version).toBe(1);
    expect(records.c.inLatestSource).toBe(false);
  });
  it('an unchanged record keeps its version and the run that made it, but shows the newest source dates', () => {
    const previous = { a: record('a', 'h1', { runId: 'old', processedAt: 'then', version: 2, observed: { demand: { fetchedAt: 'f1' } } }) };
    const { records } = mergeRecords(previous, [record('a', 'h1', { checkedAt: 'now', observed: { demand: { fetchedAt: 'f2' } } })]);
    expect(records.a).toMatchObject({ version: 2, runId: 'old', processedAt: 'then', checkedAt: 'now' });
    expect(records.a.observed.demand.fetchedAt).toBe('f2');
  });
  it('a role that comes back gets a new version', () => {
    const { records, counts } = mergeRecords({ a: record('a', 'h1', { inLatestSource: false }) }, [record('a', 'h1')]);
    expect(counts.updated).toBe(1);
    expect(records.a.version).toBe(2);
    expect(records.a.inLatestSource).toBeUndefined();
  });
  it('first run: everything is new', () => {
    expect(mergeRecords(null, [record('a', 'h')]).counts).toEqual({ processed: 1, new: 1, updated: 0, unchanged: 0, gone: 0 });
  });
});

describe('userFieldsFor', () => {
  const fields = { fields: [{ id: 'tech' }, { id: 'data' }], majorFields: { 'm-it': ['tech', 'data', 'gone'], 'm-other': [] }, sectorFields: { 's-it': ['tech'] } };
  it('reads majors and sectors and drops unknown field ids', () => {
    expect(userFieldsFor('m-it', fields)).toEqual(['tech', 'data']);
    expect(userFieldsFor('s-it', fields)).toEqual(['tech']);
  });
  it('returns no fields for Other, unknown ids, inherited names or bad input', () => {
    expect(userFieldsFor('m-other', fields)).toEqual([]);
    expect(userFieldsFor('m-none', fields)).toEqual([]);
    expect(userFieldsFor('constructor', fields)).toEqual([]);
    expect(userFieldsFor('__proto__', fields)).toEqual([]);
    expect(userFieldsFor('toString', fields)).toEqual([]);
    expect(userFieldsFor(42, fields)).toEqual([]);
    expect(userFieldsFor('m-it', null)).toEqual([]);
  });
});

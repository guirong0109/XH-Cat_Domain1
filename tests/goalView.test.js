import { describe, it, expect } from 'vitest';
import { fieldOptions, findField, orderForGoal } from '../src/lib/goalView.js';

const fields = {
  majors: [
    { id: 'm-it', label: 'IT', groups: ['A', 'B'] },
    { id: 'm-other', label: 'Other', groups: [] },
    { id: 'm-none', label: 'Nothing', groups: ['Z'] },
  ],
  sectors: [{ id: 's-1', label: 'Sector one', groups: ['C'] }],
  groups: ['A', 'B', 'C'],
};
const mk = (id, interest, score) => ({ role: { id, interest }, score });
const ranked = [mk('r1', 'C', 90), mk('r2', 'A', 80), mk('r3', 'B', 70), mk('r4', 'C', 60), mk('r5', 'A', 50)];
const ids = (o) => o.entries.map((e) => e.role.id);

describe('goalView', () => {
  it('upgrade puts linked-group roles first, each part keeps score order', () => {
    const o = orderForGoal(ranked, { who: 'student', field: 'm-it', goal: 'upgrade' }, fields);
    expect(ids(o)).toEqual(['r2', 'r3', 'r5', 'r1', 'r4']);
    expect(o.entries.map((e) => e.reason)).toEqual(['field', 'field', 'field', null, null]);
    expect(o.note).toBeNull();
  });
  it('move puts target sectors first', () => {
    const o = orderForGoal(ranked, { goal: 'move', targetSectors: ['B', 'A'] }, fields);
    expect(ids(o)).toEqual(['r2', 'r3', 'r5', 'r1', 'r4']);
    expect(o.entries.slice(0, 3).every((e) => e.reason === 'target')).toBe(true);
    expect(o.entries[3].reason).toBeNull();
  });
  it('unsure keeps score order', () => {
    const o = orderForGoal(ranked, { who: 'student', field: 'm-it', goal: 'unsure' }, fields);
    expect(ids(o)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(o.entries.every((e) => e.reason === null)).toBe(true);
    expect(o.note).toBeNull();
  });
  const NOTE = 'Your major or sector is not linked to any of our 15 roles yet, so this is the plain ranking.';
  it('other field (no groups) gives score order and a note', () => {
    const o = orderForGoal(ranked, { who: 'student', field: 'm-other', goal: 'upgrade' }, fields);
    expect(ids(o)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(o.note).toBe(NOTE);
  });
  it('no role in the linked groups gives score order and the same note', () => {
    const o = orderForGoal(ranked, { who: 'student', field: 'm-none', goal: 'upgrade' }, fields);
    expect(ids(o)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(o.note).toBe(NOTE);
  });
  it('upgrade with no field chosen gives score order and no note', () => {
    const o = orderForGoal(ranked, { goal: 'upgrade' }, fields);
    expect(ids(o)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(o.note).toBeNull();
  });
  it('null goal behaves like unsure', () => {
    const o = orderForGoal(ranked, { who: 'student', field: 'm-it', goal: null }, fields);
    expect(ids(o)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });
  it('scores are never changed', () => {
    const o = orderForGoal(ranked, { who: 'student', field: 'm-it', goal: 'upgrade' }, fields);
    expect(o.entries).toHaveLength(ranked.length);
    for (const e of o.entries) expect(ranked.some((r) => r.score === e.score && r.role === e.role)).toBe(true);
  });
  it('findField ignores an id from the other list', () => {
    expect(findField({ who: 'working', field: 'm-it' }, fields)).toBeNull();
    expect(findField({ who: 'student', field: 'm-it' }, fields).label).toBe('IT');
    expect(findField({ who: null, field: 'm-it' }, fields)).toBeNull();
  });
  it('fieldOptions follows who', () => {
    expect(fieldOptions('student', fields)).toBe(fields.majors);
    expect(fieldOptions('working', fields)).toBe(fields.sectors);
    expect(fieldOptions(null, fields)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { MAX_COMMON, commonSkills, commonSkillsLine, fieldRoles } from '../src/lib/fieldSkills.js';
import fields from '../data/fields.json';
import rolesData from '../data/roles.json';

const roles = rolesData.roles ?? rolesData;
const major = (id) => fields.majors.find((m) => m.id === id);
const role = (interest, ...labels) => ({ interest, skills: labels.map((label) => ({ label })) });

describe('fieldRoles', () => {
  it('keeps roles whose interest is in the field groups', () => {
    const list = [role('A', 'x'), role('B', 'y'), role('C', 'z')];
    expect(fieldRoles({ groups: ['A', 'C'] }, list)).toHaveLength(2);
  });
  it('is empty for a missing field or no groups', () => {
    expect(fieldRoles(null, [role('A', 'x')])).toEqual([]);
    expect(fieldRoles({ groups: [] }, [role('A', 'x')])).toEqual([]);
  });
});

describe('commonSkills', () => {
  it('keeps skills used by 2 or more roles, most used first, ties by name', () => {
    const list = [role('A', 'b', 'a', 'solo'), role('A', 'a', 'b'), role('A', 'a', 'c'), role('A', 'c')];
    expect(commonSkills({ groups: ['A'] }, list)).toEqual([
      { label: 'a', count: 3, total: 4 },
      { label: 'b', count: 2, total: 4 },
      { label: 'c', count: 2, total: 4 },
    ]);
  });
  it('takes every skill when the field has one role', () => {
    expect(commonSkills({ groups: ['A'] }, [role('A', 'y', 'x')]).map((s) => s.label)).toEqual(['x', 'y']);
  });
  it('counts a skill once per role', () => {
    expect(commonSkills({ groups: ['A'] }, [role('A', 'x', 'x'), role('A', 'y')])).toEqual([]);
  });
  it('stops at the maximum', () => {
    const labels = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const list = [role('A', ...labels), role('A', ...labels)];
    expect(commonSkills({ groups: ['A'] }, list)).toHaveLength(MAX_COMMON);
    expect(commonSkills({ groups: ['A'] }, list, 2)).toHaveLength(2);
  });
  it('is empty when the field has no roles', () => {
    expect(commonSkills(major('m-other'), roles)).toEqual([]);
    expect(commonSkills(null, roles)).toEqual([]);
  });
  it('gives the IT major its most used skills from the real roles', () => {
    const it = commonSkills(major('m-it'), roles);
    expect(it[0]).toEqual({ label: 'Problem solving', count: 5, total: 7 });
    expect(it.map((s) => s.label)).toContain('SQL and databases');
    expect(it.map((s) => s.label)).toContain('Python programming');
    expect(it.every((s) => s.count >= 2)).toBe(true);
  });
  it('gives only real skill labels', () => {
    const known = new Set(roles.flatMap((r) => r.skills.map((s) => s.label)));
    for (const m of [...fields.majors, ...fields.sectors]) {
      for (const s of commonSkills(m, roles)) expect(known.has(s.label)).toBe(true);
    }
  });
});

describe('commonSkillsLine', () => {
  it('names the field and the role count', () => {
    expect(commonSkillsLine('IT and computing', 7)).toMatch(/^Common in IT and computing roles in this app \(7 roles/);
    expect(commonSkillsLine('Education', 1)).toMatch(/\(1 role,/);
  });
});

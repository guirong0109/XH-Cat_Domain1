import { describe, expect, it } from 'vitest';
import { splitSkillsByField } from '../src/lib/majorSkills.js';
import fields from '../data/fields.json';
import roles from '../data/roles.json';
import skills from '../data/skills.json';

const labels = [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
const roleList = [
  { interest: 'Business', skills: [{ label: 'A' }] },
  { interest: 'Design and media', skills: [{ label: 'B' }, { label: 'A' }] },
];
const business = { id: 'm-business', groups: ['Business'] };

describe('splitSkillsByField', () => {
  it('puts the major skills first and the rest under others, keeping label order', () => {
    expect(splitSkillsByField(labels, business, roleList)).toEqual({ mine: [{ label: 'A' }], others: [{ label: 'B' }, { label: 'C' }], filtered: true });
  });
  it('shows everything first when there is no field or the field has no groups', () => {
    expect(splitSkillsByField(labels, null, roleList)).toEqual({ mine: labels, others: [], filtered: false });
    expect(splitSkillsByField(labels, { id: 'm-other', groups: [] }, roleList)).toEqual({ mine: labels, others: [], filtered: false });
  });
  it('does not hide anything when no role of the field uses a listed skill', () => {
    expect(splitSkillsByField(labels, { groups: ['Helping people'] }, roleList)).toEqual({ mine: labels, others: [], filtered: false });
  });
  it('never loses or repeats a skill', () => {
    const { mine, others } = splitSkillsByField(labels, business, roleList);
    expect([...mine, ...others].map((item) => item.label).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('real data: every major shows different skills', () => {
  const pickable = fields.majors.filter((major) => major.groups.length > 0);
  it('each major keeps all skills reachable and the first lists differ between majors', () => {
    const firsts = pickable.map((major) => splitSkillsByField(skills.labels, major, roles).mine.map((item) => item.label).join('|'));
    for (const major of pickable) {
      const { mine, others } = splitSkillsByField(skills.labels, major, roles);
      expect(mine.length + others.length).toBe(skills.labels.length);
    }
    expect(new Set(firsts).size).toBeGreaterThan(3);
  });
  it('Other shows all skills first', () => {
    const other = fields.majors.find((major) => major.id === 'm-other');
    expect(splitSkillsByField(skills.labels, other, roles).mine).toHaveLength(skills.labels.length);
  });
});

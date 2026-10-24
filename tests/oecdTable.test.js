import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { DOMAINS, GROUP_NAMES } from '../scripts/lib/oecdTable.js';

const data = JSON.parse(fs.readFileSync('data/oecd/oecd_2026_group_gaps.json', 'utf8'));

describe('OECD Table 6.3 import', () => {
  it('has 22 groups with all nine domains and an overall index', () => {
    expect(Object.keys(data.groups)).toHaveLength(22);
    for (const group of Object.values(data.groups)) {
      expect(Object.keys(group.gaps)).toEqual(DOMAINS);
      expect(typeof group.overall).toBe('number');
      expect(group.name).toBe(GROUP_NAMES[group.code]);
    }
  });

  it('matches the values printed in the paper text', () => {
    expect(data.groups['43'].overall).toBe(0.8); // Office and Administrative Support
    expect(data.groups['51'].overall).toBe(1.8); // Production
    expect(data.groups['21'].overall).toBe(6.4); // Community and Social Service
    expect(data.groups['15'].gaps['Problem solving']).toBe(1.3);
  });

  it('matches the printed averages across groups', () => {
    expect(data.average['Social interaction']).toBe(1.1);
    expect(data.average.Manipulation).toBe(0.7);
    expect(data.average.Creativity).toBe(0.1);
  });
});

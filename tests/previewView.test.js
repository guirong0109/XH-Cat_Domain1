import { describe, expect, it } from 'vitest';
import { EXAMPLE_TEAM, teamGrid } from '../src/lib/previewView.js';

const role = { skills: [{ label: 'A' }, { label: 'B' }] };

describe('teamGrid', () => {
  it('returns null when there is no role', () => {
    expect(teamGrid(null, EXAMPLE_TEAM, {})).toBeNull();
  });

  it('marks cells have, similar and gap', () => {
    const staff = [
      { name: 'P', skills: ['A'] },
      { name: 'Q', skills: ['X'] },
    ];
    const grid = teamGrid(role, staff, { B: ['X'] });
    expect(grid.skills).toEqual(['A', 'B']);
    expect(grid.rows).toEqual([
      { name: 'P', cells: ['have', 'gap'] },
      { name: 'Q', cells: ['gap', 'similar'] },
    ]);
  });

  it('biggestGap is the skill nobody has, first in role order', () => {
    const grid = teamGrid(role, [{ name: 'P', skills: [] }], {});
    expect(grid.biggestGap).toBe('A');
  });

  it('biggestGap is null when every skill is covered', () => {
    const grid = teamGrid(role, [{ name: 'P', skills: ['A', 'B'] }], {});
    expect(grid.biggestGap).toBeNull();
  });
});

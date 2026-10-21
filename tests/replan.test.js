import { describe, expect, it } from 'vitest';
import { rankChanges, shouldReplan } from '../src/lib/replan.js';

describe('rankChanges', () => {
  it('reports unchanged for the same order', () => {
    expect(rankChanges(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ up: [], down: [], unchanged: true });
  });

  it('reports a swap as one up and one down', () => {
    const result = rankChanges(['a', 'b', 'c'], ['b', 'a', 'c']);
    expect(result.unchanged).toBe(false);
    expect(result.up).toEqual([{ id: 'b', from: 2, to: 1 }]);
    expect(result.down).toEqual([{ id: 'a', from: 1, to: 2 }]);
  });

  it('ignores ids that are missing from either list', () => {
    expect(rankChanges(['a', 'b'], ['a', 'b', 'z'])).toEqual({ up: [], down: [], unchanged: true });
    expect(rankChanges(['a', 'b', 'x'], ['a', 'b'])).toEqual({ up: [], down: [], unchanged: true });
  });

  it('treats empty lists as unchanged', () => {
    expect(rankChanges([], [])).toEqual({ up: [], down: [], unchanged: true });
  });

  it('sorts larger moves first', () => {
    const result = rankChanges(['a', 'b', 'c', 'd', 'e'], ['d', 'a', 'b', 'c', 'e']);
    expect(result.up).toEqual([{ id: 'd', from: 4, to: 1 }]);
    expect(result.down.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    const mixed = rankChanges(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a']);
    expect(mixed.down[0]).toEqual({ id: 'a', from: 1, to: 4 });
    expect(mixed.up.map((m) => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('puts a 3-place move before a 1-place move on the same side', () => {
    const result = rankChanges(['a', 'b', 'c', 'd', 'e'], ['d', 'a', 'b', 'e', 'c']);
    expect(result.up.map((m) => m.id)).toEqual(['d', 'e']);
  });
});

describe('shouldReplan', () => {
  it('is true only for updated with at least 3 skills', () => {
    expect(shouldReplan('updated', 3)).toBe(true);
    expect(shouldReplan('updated', 5)).toBe(true);
    expect(shouldReplan('updated', 2)).toBe(false);
    expect(shouldReplan('unchanged', 5)).toBe(false);
    expect(shouldReplan('failed', 5)).toBe(false);
  });
});

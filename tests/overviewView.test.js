import { describe, expect, it } from 'vitest';
import { cardEntries, pointsToReady, readyText, trendLine } from '../src/lib/overviewView.js';

describe('overviewView', () => {
  it('counts points to the 70% line, never below 0', () => {
    expect(pointsToReady({ matchAvailable: true, match: 48 })).toBe(22);
    expect(pointsToReady({ matchAvailable: true, match: 85 })).toBe(0);
    expect(pointsToReady({ matchAvailable: false, match: 0 })).toBeNull();
  });

  it('says when there is no match instead of 0', () => {
    expect(readyText({ matchAvailable: false })).toMatch(/Not enough/);
    expect(readyText({ matchAvailable: true, match: 90 })).toBe('Ready to apply');
    expect(readyText({ matchAvailable: true, match: 48 })).toBe('22 pts to ready');
  });

  it('builds the trend line with source and date, or says it is missing', () => {
    const role = { group: 'data' };
    const trends = { groups: { data: { growthPct: 11 } }, source: { dataset: 'x', baseYear: 2020, latestYear: 2025, fetchedAt: '2026-10-20T00:00:00Z' } };
    const line = trendLine(role, trends);
    expect(line.rising).toBe(true);
    expect(line.text).toContain('+11.0%');
    expect(line.source).toContain('OpenDOSM x, 2020–2025');
    expect(trendLine(role, null).growth).toBeNull();
  });

  it('takes at most three entries and skips broken ones', () => {
    const e = (id) => ({ role: { id }, score: {} });
    expect(cardEntries([e(1), e(2), e(3), e(4)]).map((x) => x.role.id)).toEqual([1, 2, 3]);
    expect(cardEntries([{ role: null }, e(1)]).length).toBe(1);
    expect(cardEntries(undefined)).toEqual([]);
  });
});

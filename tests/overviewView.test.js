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

import { toggleTracked, trackedEntries } from '../src/lib/overviewView.js';
import { journeySteps, adjacentSteps } from '../src/lib/journey.js';

describe('tracked roles', () => {
  it('adds and removes roles with no limit', () => {
    expect(toggleTracked([], 'a')).toEqual({ list: ['a'], full: false });
    expect(toggleTracked(['a', 'b'], 'a')).toEqual({ list: ['b'], full: false });
    expect(toggleTracked(['a', 'b', 'c'], 'd').list).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleTracked(undefined, 'a').list).toEqual(['a']);
  });

  it('keeps tracking order and drops roles that are no longer scored', () => {
    const ranked = [{ role: { id: 'a' } }, { role: { id: 'b' } }];
    expect(trackedEntries(ranked, ['b', 'zzz', 'a']).map((e) => e.role.id)).toEqual(['b', 'a']);
  });

  it('shows Your roles in the journey only after a role is tracked', () => {
    const done = { who: 'student', field: 'x', skills: ['1', '2', '3'], goal: 'unsure' };
    const names = (profile, screen = 'matches') => journeySteps(screen, profile, null).map((s) => s.screen);
    expect(names({ ...done, tracked: [] })).not.toContain('overview');
    expect(names({ ...done, tracked: ['a'] })).toContain('overview');
    expect(names({ ...done, tracked: [] }, 'overview')).toContain('overview');
    expect(adjacentSteps('matches', { ...done, tracked: [] }, null).next.screen).toBe('study');
    expect(adjacentSteps('matches', { ...done, tracked: ['a'] }, null).next.screen).toBe('overview');
  });
});

import { otherKey, otherSnapshot, trackedOthers } from '../src/lib/overviewView.js';

describe('tracked roles outside the scored 20', () => {
  const card = { code: '4132-02', title: 'Data Entry Clerk (G1)', baseTitle: 'Data Entry Clerk', similarity: 0.61, url: 'u' };
  it('keys and snapshots a card, and finds it again', () => {
    expect(otherKey(card)).toBe('emasco:4132-02');
    const snap = otherSnapshot(card);
    expect(snap.title).toBe('Data Entry Clerk');
    expect(trackedOthers(['a', 'emasco:4132-02'], { 'emasco:4132-02': snap })).toEqual([snap]);
    expect(trackedOthers(['emasco:x'], {})).toEqual([]);
    expect(trackedOthers(undefined, undefined)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { SOURCES, ageText, freshnessRows, statusText } from '../src/lib/freshness.js';

const now = new Date('2026-10-31T12:00:00Z');
const data = {
  trends: { source: { fetchedAt: '2026-10-23T09:33:31.106Z' } },
  research: { source: { fetchedAt: '2026-09-01T00:00:00Z' } },
  references: { checkedAt: '2026-10-30T00:00:00Z' },
  emerging: { checkedAt: '2026-10-31T01:00:00Z' },
  courseChecks: { checkedAt: '2026-10-31T10:00:00Z' },
  skills: { aiCourses: { checkedAt: '2026-10-24' } },
  roles: [{ id: 'a' }, { id: 'b', ilo: { fetchedAt: '2026-10-21' } }],
};
const row = (rows, key) => rows.find((r) => r.key === key);

describe('freshnessRows', () => {
  it('lists every source in a fixed order', () => {
    expect(freshnessRows(data, now).map((r) => r.key)).toEqual(SOURCES.map((s) => s.key));
  });

  it('marks a source fresh with its date and age', () => {
    expect(row(freshnessRows(data, now), 'trends')).toMatchObject({ status: 'fresh', ageDays: 8, dateText: '23 Oct 2026' });
  });

  it('marks a source old when it is past its limit, and still shows its date', () => {
    expect(row(freshnessRows(data, now), 'research')).toMatchObject({ status: 'old', ageDays: 60, dateText: '1 Sept 2026', limitDays: 35 });
  });

  it('marks a source missing when there is no data, without inventing a date', () => {
    const rows = freshnessRows({ ...data, research: null, emerging: null }, now);
    expect(row(rows, 'research')).toMatchObject({ status: 'missing', dateText: '', ageDays: null });
    expect(row(rows, 'emerging').status).toBe('missing');
  });

  it('uses the live course check, else the saved list with a note', () => {
    expect(row(freshnessRows(data, now), 'courses')).toMatchObject({ ageDays: 0, note: null });
    const saved = row(freshnessRows({ ...data, courseChecks: null }, now), 'courses');
    expect(saved).toMatchObject({ ageDays: 7, status: 'fresh' });
    expect(saved.note).toContain('no live check');
  });

  it('reads the ILO date from the first role that has one', () => {
    expect(row(freshnessRows(data, now), 'ilo')).toMatchObject({ status: 'fresh', dateText: '21 Oct 2026' });
  });

  it('copes with no data at all and with a date in the future', () => {
    expect(freshnessRows(undefined, now).every((r) => r.status === 'missing')).toBe(true);
    expect(row(freshnessRows({ ...data, trends: { source: { fetchedAt: '2026-12-01T00:00:00Z' } } }, now), 'trends').ageDays).toBe(0);
  });
});

describe('texts', () => {
  it('writes the age', () => {
    expect([ageText(0), ageText(1), ageText(8)]).toEqual(['today', '1 day ago', '8 days ago']);
  });

  it('writes the status', () => {
    expect(statusText({ status: 'fresh' })).toBe('Up to date');
    expect(statusText({ status: 'old', limitDays: 35 })).toBe('Older than 35 days');
    expect(statusText({ status: 'missing' })).toBe('No data yet');
  });
});

import { describe, expect, it } from 'vitest';
import {
  confidenceBadge,
  feedState,
  filterItems,
  groupFilters,
  itemMeta,
  reviewBadge,
  skillTags,
  summaryLine,
} from '../src/lib/emergingView.js';

const item = (over = {}) => ({
  id: 'a',
  title: 'T',
  url: 'https://x.test/1',
  source: 'OpenAlex',
  confidence: 'high',
  publishedAt: '2026-10-20',
  checkedOn: '2026-10-24',
  fields: ['Working with data'],
  skills: [],
  summary: 'Hello',
  review: 'pending',
  ...over,
});
const now = new Date('2026-10-25T00:00:00Z');

describe('badges', () => {
  it('confidence', () => {
    expect(confidenceBadge('high').text).toBe('High confidence');
    expect(confidenceBadge('medium').text).toBe('Medium confidence');
    expect(confidenceBadge('weird').text).toBe('Unverified source');
  });
  it('review: only an exact "reviewed" counts as reviewed', () => {
    expect(reviewBadge('reviewed').text).toBe('Reviewed by the team');
    expect(reviewBadge('pending').text).toBe('Pending review');
    expect(reviewBadge(undefined).text).toBe('Pending review');
    expect(reviewBadge('REVIEWED').text).toBe('Pending review');
  });
});

describe('skillTags', () => {
  it('marks skills outside eMASCO', () => {
    expect(skillTags(item({ skills: [{ name: 'Data analysis', inEmasco: true }, { name: 'Foo', inEmasco: false }] }))).toEqual([
      { name: 'Data analysis', note: null },
      { name: 'Foo', note: 'Emerging, not in eMASCO' },
    ]);
  });
  it('handles missing skills', () => {
    expect(skillTags({})).toEqual([]);
  });
});

describe('summaryLine', () => {
  it('labels the summary as an AI estimate and returns null when empty', () => {
    expect(summaryLine(item())).toBe('AI estimate: Hello');
    expect(summaryLine(item({ summary: '' }))).toBeNull();
    expect(summaryLine(item({ summary: undefined }))).toBeNull();
  });
});

describe('itemMeta', () => {
  it('shows source, published date and checked date', () => {
    expect(itemMeta(item())).toBe('OpenAlex · published 20 Oct 2026 · checked 24 Oct 2026');
  });
});

describe('filters', () => {
  const items = [item({ id: '1', fields: ['Business'] }), item({ id: '2', fields: ['Working with data', 'Business'] }), item({ id: '3', fields: ['General'] })];
  it('lists the groups that appear, with General last', () => {
    expect(groupFilters(items)).toEqual(['All', 'Business', 'Working with data', 'General']);
  });
  it('filters by group and All returns everything', () => {
    expect(filterItems(items, 'Business').map((i) => i.id)).toEqual(['1', '2']);
    expect(filterItems(items, 'All')).toHaveLength(3);
    expect(filterItems(items, 'Nope')).toEqual([]);
  });
});

describe('feedState', () => {
  it('is hidden when there is no saved file', () => {
    expect(feedState(null, now).kind).toBe('hidden');
    expect(feedState(undefined, now).kind).toBe('hidden');
  });
  it('is empty with the last checked date', () => {
    const state = feedState({ checkedOn: '2026-10-24', items: [] }, now);
    expect(state.kind).toBe('empty');
    expect(state.checkedLine).toBe('Last checked 24 Oct 2026.');
  });
  it('has items and a checked line', () => {
    const state = feedState({ checkedOn: '2026-10-24', tagging: 'ai', items: [item()] }, now);
    expect(state.kind).toBe('items');
    expect(state.checkedLine).toBe('Checked 24 Oct 2026.');
    expect(state.stale).toBeNull();
    expect(state.taggingNote).toBeNull();
  });
  it('warns when the update is older than 10 days', () => {
    const state = feedState({ checkedOn: '2026-10-10', items: [item()] }, now);
    expect(state.stale).toBe('This update is from 10 Oct 2026, older than usual. Open each source to check it.');
  });
  it('says so when tags came from keywords', () => {
    const state = feedState({ checkedOn: '2026-10-24', tagging: 'keywords', items: [item()] }, now);
    expect(state.taggingNote).toBe('Tags on this update came from keywords. There are no AI summaries.');
  });
  it('treats a bad date as stale-free but still shows items', () => {
    const state = feedState({ checkedOn: 'nonsense', items: [item()] }, now);
    expect(state.kind).toBe('items');
  });
});

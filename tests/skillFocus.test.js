import { describe, it, expect } from 'vitest';
import { focusAfterRemove } from '../src/lib/skillFocus.js';

describe('focusAfterRemove', () => {
  it('picks the next skill', () => expect(focusAfterRemove(['a', 'b', 'c'], 'b')).toBe('c'));
  it('picks the previous skill when the last is removed', () => expect(focusAfterRemove(['a', 'b'], 'b')).toBe('a'));
  it('returns null when nothing is left', () => expect(focusAfterRemove(['a'], 'a')).toBeNull());
  it('returns null for an unknown skill', () => expect(focusAfterRemove(['a'], 'x')).toBeNull());
});

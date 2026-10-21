import { describe, it, expect } from 'vitest';
import { resolveScreen } from '../src/lib/navigation.js';

describe('resolveScreen', () => {
  it('sends locked screens to profile with fewer than 3 skills', () => {
    for (const screen of ['radar', 'roles', 'pathway']) expect(resolveScreen(screen, 2)).toBe('profile');
    expect(resolveScreen('roles', 0)).toBe('profile');
  });

  it('allows the later screens with 3 skills', () => {
    for (const screen of ['radar', 'roles', 'pathway']) expect(resolveScreen(screen, 3)).toBe(screen);
  });

  it('always allows home and profile', () => {
    expect(resolveScreen('home', 0)).toBe('home');
    expect(resolveScreen('profile', 0)).toBe('profile');
  });

  it('sends unknown screens home', () => {
    expect(resolveScreen('nope', 5)).toBe('home');
    expect(resolveScreen('', 5)).toBe('home');
  });
});

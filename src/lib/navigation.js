// Which screen may be shown. A step opens only when the steps before it are
// complete, so any route into it (deep link, back button, nav) falls back to
// the first step that is still missing something.
import { findField } from './goalView.js';

export const STEP_SCREENS = ['about', 'goal', 'matches', 'study'];
// Stage 2 ideas shown as previews only. They are not working features.
export const PREVIEW_SCREENS = ['preview-lang', 'preview-users'];
// Reached from a link in Matches (or #explore); it is not one of the four steps and needs no profile.
export const EXTRA_SCREENS = ['explore'];
export const SCREENS = ['home', ...STEP_SCREENS, ...EXTRA_SCREENS, ...PREVIEW_SCREENS];
export const MIN_SKILLS = 3;
// Links and bookmarks from the old journey still work.
export const OLD_ROUTES = {
  profile: 'about',
  radar: 'matches',
  roles: 'matches',
  pathway: 'study',
  'preview-cv': 'about',
  // Your skills is now part of About you (24 Oct 2026).
  skills: 'about',
};

export function isPreview(screen) {
  return PREVIEW_SCREENS.includes(screen);
}

export function stepComplete(screen, profile, fields) {
  if (screen === 'about') {
    if (!profile?.who) return false;
    if ((profile.skills?.length ?? 0) < MIN_SKILLS) return false;
    if (!fields) return Boolean(profile.field);
    return findField(profile, fields) !== null;
  }
  if (screen === 'goal') {
    if (!profile?.goal) return false;
    return profile.goal !== 'move' || (profile.targetSectors?.length ?? 0) > 0;
  }
  return true;
}

// The first earlier step that is not complete, or null when the step is open.
export function blockingStep(screen, profile, fields) {
  const index = STEP_SCREENS.indexOf(screen);
  if (index < 0) return null;
  return STEP_SCREENS.slice(0, index).find((step) => !stepComplete(step, profile, fields)) ?? null;
}

export function firstIncompleteStep(profile, fields) {
  return STEP_SCREENS.slice(0, 2).find((step) => !stepComplete(step, profile, fields)) ?? 'matches';
}

export function resolveScreen(requested, profile, fields) {
  const screen = OLD_ROUTES[requested] ?? requested;
  if (!SCREENS.includes(screen)) return 'home';
  if (blockingStep(screen, profile, fields)) return firstIncompleteStep(profile, fields);
  return screen;
}

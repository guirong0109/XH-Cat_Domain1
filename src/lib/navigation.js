// Which screen may be shown. A step opens only when the steps before it are
// complete, so any route into it (deep link, back button, nav) falls back to
// the first step that is still missing something.
import { findField } from './goalView.js';

export const STEP_SCREENS = ['about', 'skills', 'goal', 'matches', 'study'];
// 'explore' is reached from a link in Matches (or #explore) and needs no profile. 'overview' (Your roles) sits between
// Goal and Matches and opens when the steps before Matches are complete.
export const EXTRA_SCREENS = ['explore', 'overview'];
export const SCREENS = ['home', ...STEP_SCREENS, ...EXTRA_SCREENS];
export const MIN_SKILLS = 3;
// Links and bookmarks from the old journey still work.
export const OLD_ROUTES = {
  profile: 'about',
  radar: 'matches',
  roles: 'matches',
  pathway: 'study',
  'preview-cv': 'skills',
};

export function stepComplete(screen, profile, fields) {
  if (screen === 'about') {
    if (!profile?.who) return false;
    if (!fields) return Boolean(profile.field);
    return findField(profile, fields) !== null;
  }
  if (screen === 'skills') return (profile?.skills?.length ?? 0) >= MIN_SKILLS;
  if (screen === 'goal') return Boolean(profile?.goal);
  return true;
}

// The first earlier step that is not complete, or null when the step is open.
export function blockingStep(screen, profile, fields) {
  const index = STEP_SCREENS.indexOf(screen === 'overview' ? 'matches' : screen);
  if (index < 0) return null;
  return STEP_SCREENS.slice(0, index).find((step) => !stepComplete(step, profile, fields)) ?? null;
}

export function firstIncompleteStep(profile, fields) {
  return STEP_SCREENS.slice(0, 3).find((step) => !stepComplete(step, profile, fields)) ?? 'matches';
}

export function resolveScreen(requested, profile, fields) {
  const screen = OLD_ROUTES[requested] ?? requested;
  if (!SCREENS.includes(screen)) return 'home';
  if (blockingStep(screen, profile, fields)) return firstIncompleteStep(profile, fields);
  return screen;
}

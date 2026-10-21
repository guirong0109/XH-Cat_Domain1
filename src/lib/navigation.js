// Which screen may be shown. Later steps need a minimum number of skills, so
// any route into them (deep link, back button, nav) falls back to profile.

// Stage 2 ideas shown as previews only. They are not working features.
export const PREVIEW_SCREENS = ['preview-cv', 'preview-lang', 'preview-users'];
export const SCREENS = ['home', 'profile', 'radar', 'roles', 'pathway', ...PREVIEW_SCREENS];
export const SCREENS_NEEDING_SKILLS = ['radar', 'roles', 'pathway'];
export const MIN_SKILLS = 3;

export function isPreview(screen) {
  return PREVIEW_SCREENS.includes(screen);
}

export function resolveScreen(requestedScreen, skillCount) {
  if (!SCREENS.includes(requestedScreen)) return 'home';
  if (SCREENS_NEEDING_SKILLS.includes(requestedScreen) && skillCount < MIN_SKILLS) return 'profile';
  return requestedScreen;
}

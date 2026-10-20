// Which screen may be shown. Later steps need a minimum number of skills, so
// any route into them (deep link, back button, nav) falls back to profile.

export const SCREENS = ['home', 'profile', 'radar', 'roles', 'pathway'];
export const SCREENS_NEEDING_SKILLS = ['radar', 'roles', 'pathway'];
export const MIN_SKILLS = 3;

export function resolveScreen(requestedScreen, skillCount) {
  if (!SCREENS.includes(requestedScreen)) return 'home';
  if (SCREENS_NEEDING_SKILLS.includes(requestedScreen) && skillCount < MIN_SKILLS) return 'profile';
  return requestedScreen;
}

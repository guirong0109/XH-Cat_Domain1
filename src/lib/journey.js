// The student's journey through the app, as shown in the left panel and the
// Back / Next bar. Pure helpers; locking follows navigation.js.
import { MIN_SKILLS, SCREENS_NEEDING_SKILLS } from './navigation.js';

export const JOURNEY = [
  { screen: 'home', label: 'Home' },
  { screen: 'profile', label: 'Profile' },
  { screen: 'radar', label: 'Skills radar' },
  { screen: 'roles', label: 'Future roles' },
  { screen: 'pathway', label: 'Learning pathway' },
];

const STEP_COUNT = JOURNEY.length - 1; // home is not a numbered step

const HINTS = {
  home: 'Try a sample student or start your own profile.',
  profile: 'Pick the skills you have, then see your skills radar.',
  radar: 'Compare yourself with a role, then see all future roles.',
  roles: 'Pick a role you like, then open its learning pathway.',
  pathway: 'Tick off steps as you learn. You can go back and try another role.',
};

function skillsMissing(skillCount) {
  return Math.max(0, MIN_SKILLS - skillCount);
}

function plural(count, word) {
  return `${count} more ${word}${count === 1 ? '' : 's'}`;
}

function isLocked(screen, skillCount) {
  return SCREENS_NEEDING_SKILLS.includes(screen) && skillsMissing(skillCount) > 0;
}

export function journeySteps(screen, skillCount) {
  const currentIndex = JOURNEY.findIndex((step) => step.screen === screen);
  return JOURNEY.map((step, index) => {
    const number = index === 0 ? null : index;
    if (isLocked(step.screen, skillCount)) {
      return { ...step, number, state: 'locked', lockReason: `Add ${plural(skillsMissing(skillCount), 'skill')} first` };
    }
    let state = 'todo';
    if (index === currentIndex) state = 'current';
    else if (currentIndex >= 0 && index < currentIndex) state = 'done';
    return { ...step, number, state, lockReason: null };
  });
}

export function stepPosition(screen) {
  const index = JOURNEY.findIndex((step) => step.screen === screen);
  return index > 0 ? { number: index, total: STEP_COUNT } : null;
}

export function adjacentSteps(screen, skillCount) {
  const index = JOURNEY.findIndex((step) => step.screen === screen);
  if (index < 0) return { back: null, next: null };
  const toLink = (step) => (step ? { ...step, locked: isLocked(step.screen, skillCount) } : null);
  return { back: toLink(JOURNEY[index - 1]), next: toLink(JOURNEY[index + 1]) };
}

export function nextHint(screen, skillCount) {
  if (!HINTS[screen]) return 'This is a preview. Go back to your journey any time.';
  if (screen === 'profile' && skillsMissing(skillCount) > 0) {
    return `Pick ${plural(skillsMissing(skillCount), 'skill')} to unlock your skills radar.`;
  }
  return HINTS[screen];
}

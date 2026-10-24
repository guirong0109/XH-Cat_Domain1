// The student's journey through the app, as shown in the left panel and the
// Back / Next bar. Pure helpers; locking follows navigation.js.
import { blockingStep } from './navigation.js';

export const JOURNEY = [
  { screen: 'home', label: 'Home', sub: '' },
  { screen: 'about', label: 'About you', sub: 'Who you are, your major, your skills' },
  { screen: 'goal', label: 'Your goal', sub: 'Upgrade, move or not sure' },
  { screen: 'matches', label: 'Matches', sub: 'Ranked roles and sources' },
  { screen: 'study', label: 'What to study', sub: 'Courses on official portals' },
];

const STEP_COUNT = JOURNEY.length - 1; // home is not a numbered step

const HINTS = {
  home: 'Try a sample student or start your own profile.',
  about: 'Tell us who you are, then upload your CV or pick at least 3 skills.',
  goal: 'Pick your goal, then see your matches.',
  matches: 'Pick a role, then plan what to study.',
  study: 'Tick off steps as you learn. You can go back and try another role.',
  explore: 'Pick skills or upload a CV to see roles from every field. Go back to Matches any time.',
};

function labelOf(screen) {
  return JOURNEY.find((step) => step.screen === screen).label;
}

function lockFor(screen, profile, fields) {
  const blocker = blockingStep(screen, profile, fields);
  return blocker ? `Finish ${labelOf(blocker)} first` : null;
}

export function journeySteps(screen, profile, fields) {
  const currentIndex = JOURNEY.findIndex((step) => step.screen === screen);
  return JOURNEY.map((step, index) => {
    const number = index === 0 ? null : index;
    const lockReason = lockFor(step.screen, profile, fields);
    if (lockReason) return { ...step, number, state: 'locked', lockReason };
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

export function adjacentSteps(screen, profile, fields) {
  const index = JOURNEY.findIndex((step) => step.screen === screen);
  if (index < 0) return { back: null, next: null };
  const toLink = (step) => (step ? { ...step, locked: lockFor(step.screen, profile, fields) !== null } : null);
  return { back: toLink(JOURNEY[index - 1]), next: toLink(JOURNEY[index + 1]) };
}

export function nextHint(screen) {
  return HINTS[screen] ?? 'This is a preview. Go back to your journey any time.';
}

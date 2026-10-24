// The student's journey through the app, as shown in the left panel and the
// Back / Next bar. Pure helpers; locking follows navigation.js.
import { blockingStep } from './navigation.js';

export const JOURNEY = [
  { screen: 'home', label: 'Home', sub: '' },
  { screen: 'about', label: 'About you', sub: 'Who you are, your major or sector' },
  { screen: 'skills', label: 'Your skills', sub: 'CV or pick skills' },
  { screen: 'goal', label: 'Your goal', sub: 'Upgrade, move or not sure' },
  { screen: 'matches', label: 'Matches', sub: 'Explore roles, track the ones you like' },
  { screen: 'overview', label: 'Your roles', sub: 'Your dashboard of tracked roles' },
  { screen: 'study', label: 'What to study', sub: 'Courses on official portals' },
];

// Your roles (the dashboard) shows in the journey once the student tracks a role, or while they are on it.
export function trackedCount(profile) {
  return profile?.tracked?.length ?? 0;
}

export function visibleJourney(screen, profile) {
  return JOURNEY.filter((step) => step.screen !== 'overview' || trackedCount(profile) > 0 || screen === 'overview');
}

const HINTS = {
  home: 'Try a sample student or start your own profile.',
  about: 'Tell us who you are and pick your major or sector.',
  skills: 'Upload your CV or pick at least 3 skills, then check each level.',
  goal: 'Pick your goal, then see your matches.',
  matches: 'Explore roles and track up to 3 you like, then plan what to study.',
  overview: 'Your tracked roles. Open one to see its full match, or plan what to study.',
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
  const journey = visibleJourney(screen, profile);
  const currentIndex = journey.findIndex((step) => step.screen === screen);
  return journey.map((step, index) => {
    const number = index === 0 ? null : index;
    const lockReason = lockFor(step.screen, profile, fields);
    if (lockReason) return { ...step, number, state: 'locked', lockReason };
    let state = 'todo';
    if (index === currentIndex) state = 'current';
    else if (currentIndex >= 0 && index < currentIndex) state = 'done';
    return { ...step, number, state, lockReason: null };
  });
}

export function stepPosition(screen, profile) {
  const journey = visibleJourney(screen, profile);
  const index = journey.findIndex((step) => step.screen === screen);
  return index > 0 ? { number: index, total: journey.length - 1 } : null; // home is not a numbered step
}

export function adjacentSteps(screen, profile, fields) {
  const journey = visibleJourney(screen, profile);
  const index = journey.findIndex((step) => step.screen === screen);
  if (index < 0) return { back: null, next: null };
  const toLink = (step) => (step ? { ...step, locked: lockFor(step.screen, profile, fields) !== null } : null);
  return { back: toLink(journey[index - 1]), next: toLink(journey[index + 1]) };
}

export function nextHint(screen) {
  return HINTS[screen] ?? 'Go back to your journey any time.';
}

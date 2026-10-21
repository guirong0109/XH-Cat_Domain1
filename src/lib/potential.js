// The student's "potential": work experience so far and up to 3 skills they want
// to learn. Neither changes any score; they shape wording, badges and tags.

export const EXPERIENCE_OPTIONS = [
  { id: 'none', label: 'No work experience yet' },
  { id: 'parttime', label: 'Internship or part-time' },
  { id: 'under2', label: 'Under 2 years full-time' },
  { id: 'over2', label: '2+ years full-time' },
];

export const MAX_LEARN = 3;

const ADVICE = {
  none: 'Ask your career centre about internships in this role to build real experience.',
  parttime: 'Ask your career centre about internships in this role to build real experience.',
  under2: 'Talk to your supervisor or career centre about tasks that use these skills at work.',
  over2: 'Your work experience counts. Ask your employer about HRD Corp claimable courses for these steps.',
};

export function experienceLabel(id) {
  return EXPERIENCE_OPTIONS.find((option) => option.id === id)?.label || '';
}

export function startingPoint(experience) {
  const label = experienceLabel(experience);
  return label ? `Your starting point: ${label}. ${ADVICE[experience]}` : null;
}

export function learnCount(role, learn) {
  return role.skills.filter((skill) => learn.includes(skill.label)).length;
}

export function learnChoice(label, profile) {
  if (profile.skills.includes(label)) return { disabled: true, reason: 'you have it' };
  if (!profile.learn.includes(label) && profile.learn.length >= MAX_LEARN) {
    return { disabled: true, reason: `limit of ${MAX_LEARN} reached` };
  }
  return { disabled: false, reason: '' };
}

export function toggleLearn(profile, label) {
  if (profile.learn.includes(label)) return { ...profile, learn: profile.learn.filter((item) => item !== label) };
  if (learnChoice(label, profile).disabled) return profile;
  return { ...profile, learn: [...profile.learn, label] };
}

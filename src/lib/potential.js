// The student's "potential": work experience so far and up to 3 skills they want
// to learn. Neither changes any score; they shape wording, badges and tags.

export const EXPERIENCE_OPTIONS = [
  { id: 'none', label: 'No work experience yet' },
  { id: 'parttime', label: 'Internship or part-time' },
  { id: 'under2', label: 'Under 2 years full-time' },
  { id: 'over2', label: '2+ years full-time' },
];

export const MAX_LEARN = 3;

export function experienceLabel(id) {
  return EXPERIENCE_OPTIONS.find((option) => option.id === id)?.label || '';
}

export function startingPoint(who) {
  if (who === 'student') {
    return 'Your starting point: student. Ask your career centre about internships in this role to build real experience.';
  }
  if (who === 'working') {
    return 'Your starting point: already working. Your work experience counts. Ask your employer about HRD Corp claimable courses for these steps.';
  }
  return null;
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

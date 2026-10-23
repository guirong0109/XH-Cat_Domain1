// Pure display helpers for the Pathway screen: step text, portal links,
// SDG list, progress and the AI disclosure sentence.

export const PORTAL_LINKS = {
  elatih: { label: 'HRD Corp e-Latih (free online)', url: 'https://elatih.hrdcorp.gov.my/' },
  claimable: {
    label: 'HRD Corp claimable courses',
    url: 'https://etris.hrdcorp.gov.my/DigiGov/digigovportal.htm?actionFlag=SC_getSearchCompoPage&applicationMstId=1100012',
  },
  tvet: { label: 'MyTVET course search', url: 'https://www.tvet.gov.my/awam-kursus/carian' },
};

// tvet skills link to MyTVET, everything else to e-Latih; both add the claimable list.
// Working people see the claimable list first (their employer can claim it).
export function linksForPortal(portal, who) {
  const own = portal === 'tvet' ? PORTAL_LINKS.tvet : PORTAL_LINKS.elatih;
  return who === 'working' ? [PORTAL_LINKS.claimable, own] : [own, PORTAL_LINKS.claimable];
}

const COURSE_PORTAL_NAME = { elatih: 'HRD Corp e-Latih', tvet: 'MyTVET' };

// One line under a course title, copied from the portal's own page (nothing computed or invented).
export function courseMeta(course) {
  const parts = course.portal === 'tvet' ? [course.institution, course.level] : [course.price, course.duration, course.level];
  return parts.filter(Boolean).join(' · ');
}

// The weekly check (data/course_checks.json) says ok, changed, gone or unreadable for each course page.
export const courseStatus = (checks, url) => checks?.courses?.[url]?.status || null;

// A course whose page is gone is hidden; unreadable or unchecked ones stay (one bad read must not hide a good course).
export function visibleCourses(courses, checks) {
  return (courses || []).filter((course) => courseStatus(checks, course.url) !== 'gone');
}

// What the pathway shows for one skill: the exact course pages we listed, or, when none was
// found on the portals (or the page is gone), the portal's own link (so the student can still look).
export function courseOptions(skillInfo, who, checks) {
  const listed = skillInfo?.courses || [];
  const shown = visibleCourses(listed, checks);
  const courses = shown.map((course) => ({
    title: course.title,
    url: course.url,
    meta: courseMeta(course),
    portalName: COURSE_PORTAL_NAME[course.portal] || '',
    changed: courseStatus(checks, course.url) === 'changed',
  }));
  return {
    courses,
    checkedAt: courses.length ? checks?.checkedAt?.slice(0, 10) || skillInfo.coursesCheckedAt || null : null,
    goneCount: listed.length - shown.length,
    fallback: courses.length ? [] : linksForPortal(skillInfo?.portal, who),
  };
}

export function whyText(step) {
  const leads = {
    similar: 'You have a similar skill, so this step is shorter. ',
    levelup: 'You have this skill at Basic level, so this step is shorter. ',
  };
  const lead = leads[step.status] || 'Gap skill. ';
  return lead + (step.rising ? 'Its importance rises as AI spreads.' : 'Core to the role today.');
}

// Sum of the known hours, plus how many steps have no estimate (hours: null).
export function totalHours(steps) {
  let known = 0;
  let missing = 0;
  for (const step of steps) {
    if (typeof step.hours === 'number') known += step.hours;
    else missing += 1;
  }
  return { known, missing };
}

// Header text for the total; never shows a number when no step has an estimate.
export function hoursSummary({ known, missing }) {
  if (missing === 0) return `about ${known} hours (estimate)`;
  if (known === 0) return 'hours not estimated';
  return `about ${known} hours (estimate), some steps not estimated`;
}

// Only labels that are still steps count (stale ticks are ignored).
export function progress(steps, doneSkills) {
  const done = steps.filter((step) => doneSkills.includes(step.label)).length;
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 0 };
}

function skillGoals(label, skillLabels) {
  return (skillLabels || []).find((entry) => entry.label === label)?.sdgs || [];
}

// The SDGs a skill builds (team mapping in team/skill_labels.json), with display info.
export function stepSdgs(label, skillLabels, sdgInfo) {
  return skillGoals(label, skillLabels)
    .filter((goal) => sdgInfo[String(goal)])
    .map((goal) => ({ goal, ...sdgInfo[String(goal)] }));
}

// SDG 4 first, then the role's other goals, then goals that only the steps' skills
// build. "chosen" (the +5 bonus) only for goals the role has.
export function pathwaySdgs(role, profile, sdgInfo, steps = [], skillLabels = []) {
  const stepGoals = steps.map((step) => skillGoals(step.label, skillLabels));
  const roleGoals = [4, ...role.sdgs.filter((goal) => goal !== 4)];
  const skillOnly = [...new Set(stepGoals.flat())].filter((goal) => !roleGoals.includes(goal)).sort((a, b) => a - b);
  return [...roleGoals, ...skillOnly]
    .filter((goal) => sdgInfo[String(goal)])
    .map((goal) => ({
      goal,
      ...sdgInfo[String(goal)],
      stepCount: stepGoals.filter((goals) => goals.includes(goal)).length,
      roleGoal: role.sdgs.includes(goal),
      chosen: profile.sdgs.includes(goal) && role.sdgs.includes(goal),
    }));
}

export function stepCountText(sdg, totalSteps) {
  if (!sdg.stepCount) return '';
  if (totalSteps === 1) return 'Your only step';
  if (totalSteps === 2 && sdg.stepCount === 2) return 'Both of your steps';
  if (sdg.stepCount === totalSteps) return `All ${totalSteps} of your steps`;
  return `${sdg.stepCount} of your ${totalSteps} steps`;
}

export function disclosureText(labelSource) {
  const who =
    labelSource === 'manual'
      ? 'are placeholder sample labels for this demo (not yet reviewed)'
      : 'were made by an open AI model run on RunPod';
  return `AI disclosure: task labels ${who}. Job data: eMASCO 2020 (MOHR) and OpenDOSM. All results are estimates.`;
}

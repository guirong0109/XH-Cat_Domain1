// "Use AI in your job": for the chosen role, real AI courses from the team's draft list plus the
// ILO exposure of the role's closest occupation. Pure helpers. Information only: never changes a score.
import { courseMeta, courseStatus, visibleCourses } from './pathwayView.js';
import { iloRowUrl } from './roleView.js';
import { orderForUses } from './aiUse.js';

const PORTAL_NAME = { elatih: 'HRD Corp e-Latih', tvet: 'MyTVET' };

const courseViewFor = (checks) => (course) => ({
  title: course.title,
  url: course.url,
  meta: courseMeta(course),
  portalName: PORTAL_NAME[course.portal] || '',
  changed: courseStatus(checks, course.url) === 'changed',
});

export function iloStrip(role) {
  const ilo = role.ilo;
  if (!ilo || typeof ilo.mean !== 'number') return null;
  const exposed = typeof ilo.category === 'string' && ilo.category.startsWith('Gradient');
  const effect = exposed
    ? 'Many of its tasks can already be done with generative AI, so working with AI tools matters for this role.'
    : 'Few of its tasks are exposed to generative AI, so AI skills help but matter less here.';
  return {
    exposed,
    text: `ILO 2025 rates the closest occupation (ISCO ${ilo.isco} ${ilo.iscoTitle}) as ${ilo.category}, mean ${ilo.mean.toFixed(2)}. ${effect}`,
    url: iloRowUrl(ilo),
  };
}

// general: for every role. specific: courses tied to this role's own skills, each with the skills it
// helps with. A role with no matching AI course simply has an empty specific list.
// aiUses (the answer on Your goal) puts the courses that fit it first, each with `forUses`.
export function aiForRole(role, aiCourses, checks, aiUses = []) {
  if (!aiCourses) return null;
  const courseView = courseViewFor(checks);
  const general = orderForUses(visibleCourses(aiCourses.general, checks).map(courseView), aiUses, aiCourses.uses);
  const generalUrls = new Set(general.map((course) => course.url));
  const byUrl = new Map();
  for (const skill of role.skills) {
    for (const course of visibleCourses(aiCourses.bySkill?.[skill.label], checks)) {
      if (generalUrls.has(course.url)) continue;
      if (!byUrl.has(course.url)) byUrl.set(course.url, { ...courseView(course), helpsWith: [] });
      byUrl.get(course.url).helpsWith.push(skill.label);
    }
  }
  return {
    general,
    specific: orderForUses([...byUrl.values()], aiUses, aiCourses.uses),
    checkedAt: checks?.checkedAt?.slice(0, 10) || aiCourses.checkedAt || null,
    ilo: iloStrip(role),
  };
}

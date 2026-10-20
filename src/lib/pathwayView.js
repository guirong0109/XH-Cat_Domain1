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
export function linksForPortal(portal) {
  return [portal === 'tvet' ? PORTAL_LINKS.tvet : PORTAL_LINKS.elatih, PORTAL_LINKS.claimable];
}

export function whyText(step) {
  const lead = step.status === 'similar' ? 'You have a similar skill, so this step is shorter. ' : 'Gap skill. ';
  return lead + (step.rising ? 'Its importance rises as AI spreads.' : 'Core to the role today.');
}

export function totalHours(steps) {
  return steps.reduce((sum, step) => sum + step.hours, 0);
}

// Only labels that are still steps count (stale ticks are ignored).
export function progress(steps, doneSkills) {
  const done = steps.filter((step) => doneSkills.includes(step.label)).length;
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 0 };
}

// SDG 4 first, then the role's other goals; "chosen" only for goals the role has.
export function pathwaySdgs(role, profile, sdgInfo) {
  const goals = [4, ...role.sdgs.filter((goal) => goal !== 4)];
  return goals
    .filter((goal) => sdgInfo[String(goal)])
    .map((goal) => ({
      goal,
      ...sdgInfo[String(goal)],
      chosen: profile.sdgs.includes(goal) && role.sdgs.includes(goal),
    }));
}

export function disclosureText(labelSource) {
  const who =
    labelSource === 'manual'
      ? 'are sample labels made by the team for this demo'
      : 'were made by an open AI model run on RunPod';
  return `AI disclosure: task labels ${who}. Job data: eMASCO 2020 (MOHR) and OpenDOSM. All results are estimates.`;
}

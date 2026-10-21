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

export function whyText(step) {
  const leads = {
    similar: 'You have a similar skill, so this step is shorter. ',
    levelup: 'You have this skill at Basic level, so this step is shorter. ',
  };
  const lead = leads[step.status] || 'Gap skill. ';
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

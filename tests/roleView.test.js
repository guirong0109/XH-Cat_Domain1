import { describe, it, expect } from 'vitest';
import {
  biggestGaps,
  exposureShares,
  fitSkillRows,
  formatDate,
  formatGrowth,
  formatMonth,
  groupLabel,
  growthBarWidth,
  ILO_NO_MATCH,
  iloView,
  oecdView,
  jobMarketEmptyText,
  jobMarketRows,
  RANGE_NOTE,
  SCENARIO_NOTE,
  exposureSourceText,
  labelOrigin,
  radarSourceNote,
  roleSources,
  scoreBreakdown,
  skillChipText,
  trendsSourceLine,
  whyReason,
} from '../src/lib/roleView.js';
import { scoreRole } from '../src/lib/scoring.js';

const trends = {
  source: { dataset: 'wages_occupation', fetchedAt: '2026-10-20T18:38:09.451Z', latestYear: 2025, baseYear: 2020 },
  groups: {
    managers: { growthPct: -2.2, demand: 45.7 },
    professionals: { growthPct: 12.8, demand: 75.6 },
    agriculture: { growthPct: -31.7, demand: 0 },
    clerical: { growthPct: 15.3, demand: 80.7 },
  },
};

const role = {
  id: 'data-analyst',
  code: '2524-02',
  group: 'professionals',
  automatablePct: 25,
  assistedPct: 50,
  labelSource: 'manual',
  sdgs: [8, 9],
  skills: [
    { label: 'SQL and databases', moderate: 0.8, fast: 0.6 },
    { label: 'Data visualisation', moderate: 0.8, fast: 1 },
    { label: 'Python programming', moderate: 0.8, fast: 0.9 },
    { label: 'Communication', moderate: 0.6, fast: 0.8 },
  ],
};
const similar = { 'Data visualisation': ['Spreadsheets (Excel)'] };
const ctx = { similar, trendGroups: trends.groups };

describe('labels and formats', () => {
  it('maps group keys to readable labels and keeps unknown keys', () => {
    expect(groupLabel('service_sales')).toBe('Service and sales');
    expect(groupLabel('operators')).toBe('Machine operators');
    expect(groupLabel('new_group')).toBe('new_group');
  });

  it('formats growth with a sign and one decimal', () => {
    expect(formatGrowth(12.8)).toBe('+12.8%');
    expect(formatGrowth(0)).toBe('+0.0%');
    expect(formatGrowth(-2.25)).toBe('-2.3%');
  });

  it('formats a year-month as short month and year', () => {
    expect(formatMonth('2026-06')).toBe('Jun 2026');
  });

  it('builds the trends source line with years and fetched date', () => {
    expect(trendsSourceLine(trends.source)).toBe(
      'Source: OpenDOSM wages_occupation, 2020–2025. Fetched 20 Oct 2026.',
    );
  });
});

describe('jobMarketRows', () => {
  it('sorts groups by growth, highest first, with bar widths on a ±35 % scale', () => {
    const rows = jobMarketRows(trends.groups);
    expect(rows.map((row) => row.label)).toEqual(['Clerical support', 'Professionals', 'Managers', 'Agriculture']);
    expect(rows[0]).toMatchObject({ rising: true, text: '+15.3%' });
    expect(rows[3]).toMatchObject({ rising: false, text: '-31.7%' });
    expect(growthBarWidth(35)).toBe(50);
    expect(growthBarWidth(-70)).toBe(50);
    expect(growthBarWidth(17.5)).toBe(25);
  });

  it('returns no rows when trends are not loaded', () => {
    expect(jobMarketRows(undefined)).toEqual([]);
  });

  it('says "not loaded" only when there is no saved source', () => {
    expect(jobMarketEmptyText(undefined)).toBe('Trend data not loaded yet — press Refresh.');
    expect(jobMarketEmptyText(trends.source)).toBe(
      'The saved OpenDOSM file (fetched 20 Oct 2026) has no occupation-group figures. Press Refresh to try again.',
    );
  });
});

describe('exposureShares', () => {
  it('uses the real label shares with no scenario scaling', () => {
    expect(exposureShares(role)).toEqual({ automatable: 25, assisted: 50, human: 25 });
  });

  it('never exceeds 100 in total', () => {
    expect(exposureShares({ automatablePct: 70, assistedPct: 40 })).toEqual({ automatable: 70, assisted: 30, human: 0 });
  });

  it('describes where the task labels came from', () => {
    expect(labelOrigin('manual')).toBe('placeholder sample labels for this demo (not yet reviewed)');
    expect(labelOrigin('runpod')).toBe('made by an open AI model on RunPod');
  });

  it('builds the exposure source line for sample, RunPod and mixed roles', () => {
    const sample = { labelSource: 'manual', source: { fetchedAt: '2026-10-20' } };
    const runpod = { labelSource: 'runpod', source: { fetchedAt: '2026-10-21' } };
    expect(exposureSourceText([sample])).toBe(
      'Source: eMASCO task lists (MOHR). Task labels: placeholder sample labels for this demo (not yet reviewed). Estimates. Tasks fetched 20 Oct 2026.',
    );
    expect(exposureSourceText([sample, runpod])).toBe(
      'Source: eMASCO task lists (MOHR). Task labels: made by an open AI model on RunPod; rows marked Sample are placeholder sample labels for this demo (not yet reviewed). Estimates. Tasks fetched 21 Oct 2026.',
    );
    expect(exposureSourceText([sample]).toLowerCase()).not.toContain('team');
  });
});

describe('biggestGaps', () => {
  it('lists the top missing skills by importance in the scenario', () => {
    const profile = { skills: ['SQL and databases'], sdgs: [] };
    expect(biggestGaps(role, profile, similar, 'fast')).toEqual([
      { label: 'Data visualisation', importance: 100 },
      { label: 'Python programming', importance: 90 },
      { label: 'Communication', importance: 80 },
    ]);
    expect(biggestGaps(role, profile, similar, 'moderate', 2).map((gap) => gap.label)).toEqual([
      'Data visualisation',
      'Python programming',
    ]);
  });

  it('is empty when every skill is held', () => {
    const profile = { skills: role.skills.map((skill) => skill.label), sdgs: [] };
    expect(biggestGaps(role, profile, similar, 'moderate')).toEqual([]);
  });
});

describe('scenario and radar copy', () => {
  it('describes the scenarios only as the factor on automatable tasks', () => {
    expect(SCENARIO_NOTE).toBe('Moderate AI counts 60% of tasks labelled automatable; Fast AI counts all of them.');
  });

  it('explains the score range in visible text', () => {
    expect(RANGE_NOTE).toMatch(/^Range = Moderate AI to Fast AI/);
  });

  it('names importance as a team estimate and says Fast AI does not change it without links', () => {
    const dated = { ...role, source: { fetchedAt: '2026-10-20' } };
    expect(radarSourceNote(dated)).toBe(
      'Estimate. Skills from eMASCO 2524-02, fetched 20 Oct 2026; importance is a team estimate (specific 0.8, basic 0.6). Fast AI shifts importance for skills linked to automatable or AI-assisted tasks.',
    );
    const flat = { ...dated, skills: role.skills.map((skill) => ({ ...skill, fast: skill.moderate })) };
    expect(radarSourceNote(flat)).toBe(
      'Estimate. Skills from eMASCO 2524-02, fetched 20 Oct 2026; importance is a team estimate (specific 0.8, basic 0.6). Fast AI does not change importance yet; it changes the outlook score.',
    );
  });
});

describe('scoreBreakdown', () => {
  it('explains each part and the formula adds up to the shown match', () => {
    const profile = { skills: ['SQL and databases', 'Spreadsheets (Excel)'], sdgs: [9] };
    const score = scoreRole(role, profile, ctx, 'moderate');
    const { parts, formula } = scoreBreakdown(role, score, 'moderate', trends);
    expect(parts.map((part) => part.label)).toEqual(['Skill fit · 60%', 'Future outlook · 40%', 'SDG bonus']);
    expect(parts[0].detail).toBe('1.5 of 4 skills (your level counts: Strong 1, Good 0.75, Basic 0.5; similar skills count half). Similar-skill pairs: AI estimate (bge-m3, 22 Oct 2026), draft awaiting team review.');
    expect(parts[0].source).toBe('eMASCO 2524-02 skill list (MOHR, MASCO 2020)');
    expect(parts[1].detail).toBe('Job demand 75.6 (Professionals +12.8%, 2020–2025). Automatable tasks 25% × 0.6.');
    expect(parts[1].source).toContain('task labels: placeholder samples (not yet reviewed)');
    expect(parts[2].value).toBe('+5');
    expect(parts[2].detail).toBe('Matches your goal: SDG 9.');
    expect(formula).toBe(
      `0.6 × 37.5 + 0.4 × 80.3 + 5 = ${Math.round(score.match)} (Moderate AI scenario)`,
    );
    expect(Math.round(0.6 * 37.5 + 0.4 * 80.3 + 5)).toBe(Math.round(score.match));
  });

  it('falls back to demand 50 when the group has no trend data', () => {
    const profile = { skills: [], sdgs: [] };
    const score = scoreRole(role, profile, { similar, trendGroups: undefined }, 'fast');
    const { parts, formula } = scoreBreakdown(role, score, 'fast', null);
    expect(parts[1].detail).toBe(
      'Job demand 50 (no OpenDOSM data for this group). Automatable tasks 25% × 1.0.',
    );
    expect(parts[2].detail).toBe('No match with your chosen goals.');
    expect(formula).toContain('(Fast AI scenario)');
    expect(formula).not.toContain('NaN');
  });
});

describe('iloView', () => {
  const ilo = {
    isco: '2511',
    iscoTitle: 'Systems Analysts',
    mean: 0.49,
    sd: 0.05,
    category: 'Gradient 2',
    source: 'ILO Working Paper 140 (2025), Table A1',
    fetchedAt: '2026-10-21',
  };

  it('returns null without ilo', () => {
    expect(iloView({ id: 'x' })).toBeNull();
    expect(ILO_NO_MATCH).toBe('No ILO match for this role.');
  });

  it('builds badge and score text', () => {
    const view = iloView({ ilo });
    expect(view.badge).toBe('ILO 2025: Gradient 2');
    expect(view.scoreText).toContain('Gradient 2');
    expect(view.scoreText).toContain('0.49');
    expect(view.scoreText).toContain('0.05');
  });

  it('builds isco, mapping and source text', () => {
    const view = iloView({ ilo });
    expect(view.iscoText).toContain('2511');
    expect(view.iscoText).toContain('Systems Analysts');
    expect(view.mappingNote).toBe("This match from MASCO to ISCO is our team's mapping, not an official table.");
    expect(view.sourceText).toContain('CC BY 4.0');
    expect(view.scaleText).toContain('Gradient 1 (lowest) to Gradient 4 (highest GenAI exposure)');
    expect(view.scaleText).toContain('Mean = average task exposure score from 0 to 1');
    expect(view.sourceText).toContain('global');
    expect(view.sourceText).toContain('not Malaysia-specific');
    expect(view.sourceText).toContain(formatDate('2026-10-21'));
  });
});

describe('roleSources', () => {
  const role = {
    code: '2524-02',
    group: 'professionals',
    source: { url: 'https://emasco.mohr.gov.my/masco/2524-02', fetchedAt: '2026-10-21' },
    ilo: { isco: '2120', url: 'https://example.org/ilo' },
  };
  const trendData = {
    source: { url: 'https://api.data.gov.my/opendosm?id=wages_occupation', baseYear: 2020, latestYear: 2025 },
  };

  it('lists eMASCO, OpenDOSM and ILO', () => {
    expect(roleSources(role, trendData)).toEqual([
      { label: 'eMASCO role page 2524-02 (snapshot 21 Oct 2026)', url: 'https://emasco.mohr.gov.my/masco/2524-02' },
      { label: 'OpenDOSM job trend, Professionals (2020–2025)', url: 'https://api.data.gov.my/opendosm?id=wages_occupation' },
      {
        label: 'ILO 2025 AI exposure (WP140)',
        url: 'https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html',
      },
    ]);
  });

  it('links the ILO source to the occupation row when the ISCO title is known', () => {
    const withTitle = { ...role, ilo: { isco: '2120', iscoTitle: 'Mathematicians, Actuaries and Statisticians' } };
    expect(roleSources(withTitle, null).at(-1)).toEqual({
      label: 'ILO 2025 AI exposure (WP140): ISCO 2120 Mathematicians, Actuaries and Statisticians',
      url: 'https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html#:~:text=Mathematicians%2C%20Actuaries%20and%20Statisticians',
    });
  });

  it('omits OpenDOSM when there are no trends', () => {
    expect(roleSources(role, null).map((s) => s.label)).toEqual([
      'eMASCO role page 2524-02 (snapshot 21 Oct 2026)',
      'ILO 2025 AI exposure (WP140)',
    ]);
  });

  it('omits ILO when the role has no ILO match', () => {
    const labels = roleSources({ ...role, ilo: undefined }, trendData).map((s) => s.label);
    expect(labels).toHaveLength(2);
    expect(labels.some((l) => l.startsWith('ILO'))).toBe(false);
  });
});

describe('skillChipText', () => {
  const similar = { Python: ['R'] };
  it('says "you have it" when held with no own level', () => {
    expect(skillChipText('Python', { skills: ['Python'], levels: {} }, similar)).toEqual({
      status: 'have',
      level: null,
      srText: 'you have it',
    });
  });
  it('shows the level when the profile has one', () => {
    expect(skillChipText('Python', { skills: ['Python'], levels: { Python: 'basic' } }, similar)).toEqual({
      status: 'have',
      level: 'basic',
      srText: 'you have it, Basic level',
    });
  });
  it('similar and gap', () => {
    expect(skillChipText('Python', { skills: ['R'], levels: {} }, similar).srText).toBe('similar skill, half credit');
    expect(skillChipText('Python', { skills: [], levels: {} }, similar)).toEqual({
      status: 'gap',
      level: null,
      srText: 'gap to learn',
    });
  });
});

describe('fitSkillRows', () => {
  it('shows no level for a held skill whose level was never chosen', () => {
    const role = { skills: [{ label: 'A' }, { label: 'B' }] };
    const profile = { skills: ['A', 'B'], levels: { B: 'good' } };
    expect(fitSkillRows(role, profile, {})).toEqual([
      { label: 'A', status: 'have', level: null, credit: 1 },
      { label: 'B', status: 'have', level: 'good', credit: 0.75 },
    ]);
    expect(fitSkillRows(role, { skills: ['A'] }, {})[0]).toEqual({ label: 'A', status: 'have', level: null, credit: 1 });
  });
  it('gives each skill its status, level and credit', () => {
    const role = { skills: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label })) };
    const profile = { skills: ['A', 'B', 'C', 'X'], levels: { A: 'strong', B: 'good', C: 'basic' } };
    const similar = { D: ['X'] };
    expect(fitSkillRows(role, profile, similar)).toEqual([
      { label: 'A', status: 'have', level: 'strong', credit: 1 },
      { label: 'B', status: 'have', level: 'good', credit: 0.75 },
      { label: 'C', status: 'have', level: 'basic', credit: 0.5 },
      { label: 'D', status: 'similar', level: null, credit: 0.5 },
      { label: 'E', status: 'gap', level: null, credit: 0 },
    ]);
  });
});

describe('whyReason', () => {
  it('maps goal reasons to badge text', () => {
    expect(whyReason('field')).toBe('Linked to your major or sector');
    expect(whyReason('target')).toBe('In a sector you want');
    expect(whyReason(null)).toBe(null);
  });
});

describe('oecdView', () => {
  const oecd = {
    socGroup: '15',
    groupName: 'Computer and Mathematical',
    overall: 3.1,
    gaps: { Language: 0.5, 'Problem solving': 1.3, Vision: 0, Manipulation: 0 },
    average: { Language: 0.4, 'Problem solving': 1.1, Vision: 0.2, Manipulation: 0.7 },
    source: 'OECD (2026), Table 6.3',
    url: 'https://example.org/oecd',
    fetchedAt: '2026-10-24',
  };

  it('returns null without oecd', () => {
    expect(oecdView({ id: 'x' })).toBeNull();
  });

  it('builds badge, group text and a draft-mapping note', () => {
    const view = oecdView({ oecd });
    expect(view.badge).toBe('OECD 2026: gap 3.1');
    expect(view.groupText).toContain('Computer and Mathematical');
    expect(view.mappingNote).toContain('team draft');
  });

  it('sorts domains by gap and marks only a zero gap as AI already matching', () => {
    const view = oecdView({ oecd });
    expect(view.domains.map((domain) => domain.name)).toEqual(['Problem solving', 'Language', 'Manipulation', 'Vision']);
    expect(view.domains.filter((domain) => domain.aiMatches).map((domain) => domain.name)).toEqual(['Manipulation', 'Vision']);
    expect(view.maxGap).toBe(1.3);
  });

  it('adds the OECD link to the role sources', () => {
    const sources = roleSources({ code: 'x', group: 'professionals', oecd }, null);
    expect(sources.some((source) => source.url === 'https://example.org/oecd')).toBe(true);
  });
});

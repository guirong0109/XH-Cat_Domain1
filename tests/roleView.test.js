import { describe, it, expect } from 'vitest';
import {
  CARD_COLLAPSED,
  CARD_EXPANDED,
  CARD_GAP,
  biggestGaps,
  cardLayout,
  exposureShares,
  formatDate,
  formatGrowth,
  formatMonth,
  groupLabel,
  growthBarWidth,
  ILO_NO_MATCH,
  iloView,
  jobMarketEmptyText,
  jobMarketRows,
  RANGE_NOTE,
  SCENARIO_NOTE,
  exposureSourceText,
  labelOrigin,
  radarSourceNote,
  scoreBreakdown,
  trendsSourceLine,
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
    expect(parts[0].detail).toBe('1.5 of 4 skills (similar skills count half).');
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

describe('cardLayout', () => {
  it('stacks cards by rank with the expanded card taller', () => {
    const { positions, total } = cardLayout(['b', 'a', 'c'], 'b');
    expect(positions.b).toMatchObject({ top: 0, rank: 1, minHeight: CARD_EXPANDED });
    expect(positions.a).toMatchObject({ top: CARD_EXPANDED + CARD_GAP, rank: 2, minHeight: CARD_COLLAPSED });
    expect(positions.c.top).toBe(CARD_EXPANDED + CARD_COLLAPSED + 2 * CARD_GAP);
    expect(total).toBe(CARD_EXPANDED + 2 * CARD_COLLAPSED + 2 * CARD_GAP);
  });

  it('uses a measured height when the content needs more room', () => {
    const { positions, total } = cardLayout(['a', 'b'], null, { a: 250, b: 100 });
    expect(positions.b.top).toBe(250 + CARD_GAP);
    expect(total).toBe(250 + CARD_GAP + CARD_COLLAPSED);
  });

  it('handles an empty list', () => {
    expect(cardLayout([], null)).toEqual({ positions: {}, total: 0 });
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

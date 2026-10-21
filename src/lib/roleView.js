// Pure display helpers for the Radar and Roles screens: labels, number
// formats, the job-market rows, the score breakdown text and card layout.

import { LEVEL_CREDIT, SCENARIO_FACTOR, WEIGHTS, skillCredit, skillLevel, skillStatus } from './scoring.js';

export const SCENARIO_NAME = { moderate: 'Moderate AI', fast: 'Fast AI' };

export const GROUP_LABELS = {
  managers: 'Managers',
  professionals: 'Professionals',
  technicians: 'Technicians',
  clerical: 'Clerical support',
  service_sales: 'Service and sales',
  agriculture: 'Agriculture',
  craft: 'Craft and trades',
  operators: 'Machine operators',
  elementary: 'Elementary',
};

export function groupLabel(group) {
  return GROUP_LABELS[group] || group;
}

// Card sizes for the animated Roles list (≥ 640 px). A card is never shorter
// than these; if its content needs more room the measured height is used.
export const CARD_COLLAPSED = 196;
export const CARD_EXPANDED = CARD_COLLAPSED + 236;
export const CARD_GAP = 14;

// The diverging job-market bars reach the edge at ±35 %.
export const GROWTH_SCALE = 35;

export function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// "2026-06" → "Jun 2026".
export function formatMonth(yearMonth) {
  const date = new Date(`${yearMonth}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return yearMonth || '';
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatGrowth(growthPct) {
  return `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`;
}

// Short numbers for text: 2.5 stays 2.5, 3.0 becomes 3.
function formatNumber(value) {
  return String(Math.round(value * 10) / 10);
}

export function growthBarWidth(growthPct) {
  return (Math.min(Math.abs(growthPct), GROWTH_SCALE) / GROWTH_SCALE) * 50;
}

export function jobMarketRows(groups) {
  if (!groups) return [];
  return Object.entries(groups)
    .filter(([, value]) => value && typeof value.growthPct === 'number')
    .map(([group, value]) => ({
      group,
      label: groupLabel(group),
      growthPct: value.growthPct,
      text: formatGrowth(value.growthPct),
      rising: value.growthPct >= 0,
      width: growthBarWidth(value.growthPct),
    }))
    .sort((a, b) => b.growthPct - a.growthPct || a.label.localeCompare(b.label));
}

// Empty job-market chart: only say "not loaded" when no file was ever saved.
export function jobMarketEmptyText(source) {
  if (!source) return 'Trend data not loaded yet — press Refresh.';
  return `The saved OpenDOSM file (fetched ${formatDate(source.fetchedAt)}) has no occupation-group figures. Press Refresh to try again.`;
}

export function trendsSourceLine(source) {
  return `Source: OpenDOSM ${source.dataset}, ${source.baseYear}–${source.latestYear}. Fetched ${formatDate(source.fetchedAt)}.`;
}

// Real task shares from the role's labels (no scenario scaling).
export function exposureShares(role) {
  const automatable = role.automatablePct;
  const assisted = Math.min(role.assistedPct, 100 - automatable);
  return { automatable, assisted, human: Math.max(0, 100 - automatable - assisted) };
}

export function labelOrigin(labelSource) {
  return labelSource === 'manual'
    ? 'placeholder sample labels for this demo (not yet reviewed)'
    : 'made by an open AI model on RunPod';
}

export function exposureSourceText(roles) {
  const sources = [...new Set(roles.map((role) => role.labelSource))];
  const origin =
    sources.length === 1
      ? labelOrigin(sources[0])
      : `${labelOrigin('runpod')}; rows marked Sample are ${labelOrigin('manual')}`;
  const dates = roles.map((role) => role.source?.fetchedAt).filter(Boolean).sort();
  const fetched = dates.length ? ` Tasks fetched ${formatDate(dates[dates.length - 1])}.` : '';
  return `Source: eMASCO task lists (MOHR). Task labels: ${origin}. Estimates.${fetched}`;
}

// The scenario factor only scales the automatable share in the outlook score.
export const SCENARIO_NOTE = 'Moderate AI counts 60% of tasks labelled automatable; Fast AI counts all of them.';

export const RANGE_NOTE = 'Range = Moderate AI to Fast AI: the lowest and highest match across the two scenarios.';

export function radarSourceNote(role) {
  const fetched = role.source?.fetchedAt ? `, fetched ${formatDate(role.source.fetchedAt)}` : '';
  const varies = role.skills.some((skill) => skill.fast !== skill.moderate);
  const scenarioPart = varies
    ? 'Fast AI shifts importance for skills linked to automatable or AI-assisted tasks.'
    : 'Fast AI does not change importance yet; it changes the outlook score.';
  return `Estimate. Skills from eMASCO ${role.code}${fetched}; importance is a team estimate (specific 0.8, basic 0.6). ${scenarioPart}`;
}

// Missing skills ordered by importance in the scenario, most important first.
export function biggestGaps(role, profile, similar, scenario, count = 3) {
  return role.skills
    .filter((skill) => skillStatus(skill.label, profile.skills, similar) !== 'have')
    .map((skill) => ({ label: skill.label, importance: Math.round(skill[scenario] * 100) }))
    .sort((a, b) => b.importance - a.importance || a.label.localeCompare(b.label))
    .slice(0, count);
}

const DEFAULT_DEMAND_TEXT = '50';

// The three "Why this score?" parts and the formula line.
export function scoreBreakdown(role, score, scenario, trends) {
  const factor = SCENARIO_FACTOR[scenario];
  const group = trends?.groups?.[role.group];
  const source = trends?.source;
  const outlookDetail = score.demandMissing
    ? `Job demand ${DEFAULT_DEMAND_TEXT} (no OpenDOSM data for this group).`
    : `Job demand ${formatNumber(score.demand)} (${groupLabel(role.group)} ${formatGrowth(group.growthPct)}, ${source.baseYear}–${source.latestYear}).`;
  const labels = role.labelSource === 'manual' ? 'placeholder samples (not yet reviewed)' : 'RunPod';
  const fetched = source?.fetchedAt ? `, fetched ${formatDate(source.fetchedAt)}` : '';

  const parts = [
    {
      key: 'fit',
      label: 'Skill fit · 60%',
      value: String(Math.round(score.fit)),
      width: score.fit,
      color: '#0F766E',
      detail: `${formatNumber(score.earned)} of ${role.skills.length} skills (your level counts: Strong ${String(LEVEL_CREDIT.strong)}, Good ${String(LEVEL_CREDIT.good)}, Basic ${String(LEVEL_CREDIT.basic)}; similar skills count half).`,
      source: `eMASCO ${role.code} skill list (MOHR, MASCO 2020)`,
    },
    {
      key: 'outlook',
      label: 'Future outlook · 40%',
      value: String(Math.round(score.outlook)),
      width: score.outlook,
      color: '#1D4ED8',
      detail: `${outlookDetail} Automatable tasks ${role.automatablePct}% × ${factor.toFixed(1)}.`,
      source: `OpenDOSM wages_occupation${fetched}; task labels: ${labels}`,
    },
    {
      key: 'bonus',
      label: 'SDG bonus',
      value: `+${score.bonus}`,
      width: score.bonus * 10,
      color: '#FD6925',
      detail: score.matchedGoals.length
        ? `Matches your goal${score.matchedGoals.length > 1 ? 's' : ''}: ${score.matchedGoals.map((goal) => `SDG ${goal}`).join(', ')}.`
        : 'No match with your chosen goals.',
      source: 'Role-to-SDG tags (team mapping)',
    },
  ];

  const capped = WEIGHTS.fit * score.fit + WEIGHTS.outlook * score.outlook + score.bonus > 100 ? ' (capped at 100)' : '';
  // One decimal keeps the written sum equal to the shown (rounded) match.
  const formula =
    `${WEIGHTS.fit} × ${formatNumber(score.fit)} + ${WEIGHTS.outlook} × ${formatNumber(score.outlook)} + ${score.bonus} = ` +
    `${Math.round(score.match)}${capped} (${SCENARIO_NAME[scenario]} scenario)`;
  return { parts, formula };
}

// Positions cards by rank. heights maps role id → measured height; missing
// or smaller values fall back to the collapsed/expanded constants.
export function cardLayout(rankedIds, expandedId, heights = {}) {
  const positions = {};
  let top = 0;
  rankedIds.forEach((id, index) => {
    const minimum = id === expandedId ? CARD_EXPANDED : CARD_COLLAPSED;
    const height = Math.max(minimum, heights[id] || 0);
    positions[id] = { top, rank: index + 1, minHeight: minimum };
    top += height + CARD_GAP;
  });
  return { positions, total: Math.max(0, top - CARD_GAP) };
}

export const ILO_SCALE_TEXT =
  'ILO scale: Not Exposed, Minimal Exposure, then Gradient 1 (lowest) to Gradient 4 (highest GenAI exposure). Mean = average task exposure score from 0 to 1.';

export const ILO_NO_MATCH = 'No ILO match for this role.';

// ILO second opinion. Shown next to the score, never used in it.
export function iloView(role) {
  const ilo = role.ilo;
  if (!ilo) return null;
  const fetched = ilo.fetchedAt ? ` Fetched ${formatDate(ilo.fetchedAt)}.` : '';
  return {
    badge: `ILO 2025: ${ilo.category}`,
    scoreText: `${ilo.category} · mean ${ilo.mean.toFixed(2)}, SD ${ilo.sd.toFixed(2)}`,
    iscoText: `ISCO-08 ${ilo.isco} · ${ilo.iscoTitle}`,
    mappingNote: "This match from MASCO to ISCO is our team's mapping, not an official table.",
    scaleText: ILO_SCALE_TEXT,
    sourceText: `Source: ${ilo.source}, CC BY 4.0. The index is global, not Malaysia-specific.${fetched}`,
  };
}

export const ILO_WP140_URL = 'https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html';

// The "Sources:" links on a role card: eMASCO page, OpenDOSM trend, ILO index.
export function roleSources(role, trends) {
  const sources = [];
  if (role.source?.url) {
    sources.push({
      label: `eMASCO role page ${role.code} (snapshot ${formatDate(role.source.fetchedAt)})`,
      url: role.source.url,
    });
  }
  const trendSource = trends?.source;
  if (trendSource?.url) {
    sources.push({
      label: `OpenDOSM job trend, ${groupLabel(role.group)} (${trendSource.baseYear}–${trendSource.latestYear})`,
      url: trendSource.url,
    });
  }
  if (role.ilo) sources.push({ label: 'ILO 2025 AI exposure (WP140)', url: ILO_WP140_URL });
  return sources;
}

const SKILL_STATUS_TEXT = { have: 'you have it', similar: 'similar skill, half credit', gap: 'gap to learn' };

export function levelName(level) {
  return level[0].toUpperCase() + level.slice(1);
}

// Chip status for one role skill. level is set only when the student chose one.
export function skillChipText(label, profile, similar) {
  const status = skillStatus(label, profile.skills, similar);
  const hasLevel = status === 'have' && Object.hasOwn(profile.levels || {}, label);
  const level = hasLevel ? skillLevel(label, profile) : null;
  const srText = level ? `you have it, ${levelName(level)} level` : SKILL_STATUS_TEXT[status];
  return { status, level, srText };
}

// Per-skill rows for "Why this score?": the credit each skill adds to skill fit.
export function fitSkillRows(role, profile, similar) {
  return role.skills.map((skill) => {
    const status = skillStatus(skill.label, profile.skills, similar);
    return {
      label: skill.label,
      status,
      level: status === 'have' ? skillLevel(skill.label, profile) : null,
      credit: skillCredit(skill.label, profile, similar),
    };
  });
}

const REASON_TEXT = { field: 'Linked to your major or sector', target: 'In a sector you want' };

export function whyReason(reason) {
  return REASON_TEXT[reason] ?? null;
}

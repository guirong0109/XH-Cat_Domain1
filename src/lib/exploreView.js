// Wording and small rules for the "Explore all roles" screen. Pure helpers, no React.
import { formatDate } from './roleView.js';

export const MIN_PICKS = 3;
export const MAX_PICKS = 50;

export const LEVEL_LABEL = {
  none: 'No qualification',
  spm: 'SPM',
  certificate: 'Certificate',
  diploma: 'Diploma',
  degree: 'Degree',
  master: 'Master',
  phd: 'PhD',
  other: 'Level not stated',
};

export function levelLabel(level) {
  return LEVEL_LABEL[level] ?? LEVEL_LABEL.other;
}

export function pickSkill(picked, skill) {
  if (picked.some((item) => item.id === skill.id) || picked.length >= MAX_PICKS) return picked;
  return [...picked, { id: skill.id, text: skill.text }];
}

export function unpickSkill(picked, id) {
  return picked.filter((item) => item.id !== id);
}

export function pickedStatus(count) {
  if (count >= MIN_PICKS) return { ready: true, text: `${count} skills picked.` };
  return { ready: false, text: `${count} of ${MIN_PICKS} skills picked. Pick at least ${MIN_PICKS}.` };
}

export function similarityText(similarity) {
  return `Similarity ${similarity.toFixed(2)} · AI estimate, not a percentage`;
}

export function barWidth(similarity) {
  return Math.round(Math.min(1, Math.max(0, similarity)) * 100);
}

export function gradesText(card) {
  const grades = card.grades ?? [];
  if (grades.length < 2) return '';
  const names = grades.map((item) => item.grade).filter(Boolean);
  return `${grades.length} roles by civil-service grade${names.length ? `: ${names.join(', ')}` : ''}`;
}

// The skills of a role that the student's input matched, then the closest ones that did not.
export function whyLines(card, max = 5) {
  return (card.skills ?? []).slice(0, max).map((skill) => ({
    text: skill.text,
    matched: skill.matched,
    score: skill.score,
    evidence: skill.evidence ?? null,
  }));
}

export function missingSkills(card) {
  return (card.skills ?? []).filter((skill) => !skill.matched).map((skill) => ({ text: skill.text, type: skill.type }));
}

export function levelNote(result, includeHigher) {
  if (includeHigher) return 'Showing roles at every qualification level.';
  const hidden = result?.hiddenByLevel ?? 0;
  if (hidden > 0) {
    return `${hidden} higher-level role${hidden === 1 ? '' : 's'} ranked above these ${hidden === 1 ? 'is' : 'are'} hidden.`;
  }
  return 'Showing roles up to diploma level.';
}

// A short message about the result, or null when the cards speak for themselves.
export function resultNote(result, mode) {
  if (!result) return null;
  if (result.status === 'not-enough-skills') {
    return {
      kind: 'info',
      text:
        mode === 'cv'
          ? 'Not enough skill lines found in this CV. Try another file, or pick skills instead.'
          : `Pick at least ${MIN_PICKS} different skills (you have ${result.lineCount ?? 0}).`,
    };
  }
  if (!result.roles?.length) {
    return { kind: 'info', text: 'No roles at this level matched. Try "Include degree roles".' };
  }
  if (result.confidence === 'low') {
    return {
      kind: 'warn',
      text: 'These roles are only loosely similar to what you entered. Add more skills, or try your CV.',
    };
  }
  return null;
}

export function sourceLine(source) {
  if (!source) return '';
  const date = formatDate(source.crawledOn);
  return `Source: ${source.occupations}${date ? `, read ${date}` : ''}. Similarity from ${source.model} (an AI estimate). This supports your decision. It does not make it.`;
}

const ERROR_TEXT = {
  'cv-ai-off': 'CV reading needs the AI model, which is off on this site. Pick skills instead.',
  'emasco-data-missing': 'The role data is not available on this site right now.',
  'too-long': 'That CV is too long. Try a shorter file, or pick skills instead.',
};

export function errorText(code) {
  return ERROR_TEXT[code] ?? 'Could not get roles. Try again.';
}

// AI exposure line for an explored role, from the central store. Labelled roles show the shares; others stay "not scored".
export function exposureView(exposure) {
  const labelled =
    exposure?.status === 'labelled' &&
    [exposure.automatablePct, exposure.assistedPct, exposure.humanPct].every((value) => Number.isFinite(value));
  if (!labelled) {
    return { labelled: false, badge: 'AI risk: not scored', note: 'Labels pending for this role.' };
  }
  const sample = exposure.labelSource === 'manual';
  const date = exposure.date ? `, store built ${formatDate(exposure.date)}` : '';
  return {
    labelled: true,
    badge: sample ? 'Sample' : 'AI estimate',
    text: `Automatable ${exposure.automatablePct}% · AI-assisted ${exposure.assistedPct}% · Human-led ${exposure.humanPct}%`,
    source: `${sample ? 'Placeholder label, not yet reviewed by the team' : 'AI-made estimate'}${date}. Does not change any score.`,
  };
}

export const SDG_NOT_TAGGED = 'SDG not tagged yet for this role';

// One line under the skill suggestions: how the list was found, from what the server says really ran.
// "Meaning" search is an AI estimate and needs the local model.
export function searchNote(meaning) {
  if (meaning === 'ran') return 'Searched by keywords and by meaning (AI estimate, also reads Bahasa Malaysia).';
  if (meaning === 'loading') return 'Keywords only for now: the AI model is still loading.';
  if (meaning === 'limited') return 'Keywords only for now: many searches in a short time. Wait a moment and type again.';
  if (meaning === 'failed') return 'Keywords only: search by meaning failed this time.';
  if (meaning === 'off') return 'Keywords only. Search by meaning needs the AI model, which is off on this server.';
  return '';
}

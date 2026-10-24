// Finds skills and a rough level in CV text. Pure helpers, no scoring maths here.
// Keywords come from data/skills.json (team draft). The level is only a guess.

export const MAX_CV_BYTES = 5 * 1024 * 1024;

const FALLBACK = 'You can pick your skills instead.';

export const CV_MESSAGES = {
  'not-pdf': `This file is not a PDF. Please choose a PDF file. ${FALLBACK}`,
  'too-big': `This file is too big. The limit is ${MAX_CV_BYTES / (1024 * 1024)} MB. ${FALLBACK}`,
  empty: `This file is empty. ${FALLBACK}`,
  password: `This PDF has a password, so we cannot read it. ${FALLBACK}`,
  'no-text': `We could not find any text in this PDF. It may be a scan or a picture. ${FALLBACK}`,
  'none-found': `We did not find any skills we know in this CV. This app covers 20 roles in tech, data, business, engineering, design, education and health, so your CV may be outside what we cover. ${FALLBACK}`,
  'load-failed': `We could not read this PDF. Please try again. ${FALLBACK}`,
};

export function checkCvFile({ name, type, size }) {
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name || '');
  if (!isPdf) return 'not-pdf';
  if (size === 0) return 'empty';
  if (size > MAX_CV_BYTES) return 'too-big';
  return null;
}

const STRONG_WORDS = /\b(advanced|expert|proficient)\b/i;
const LED_WORD = /\b[Ll]ed\b/;
const BASIC_WORDS = /\b(basic|beginner|familiar|introductory)\b/i;
const LEARNING = /(?<!\b(?:machine|deep)\s)\blearning\b/i;
const YEARS = /(?<![\d.])(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi;

// A line about doing something: a project, an internship or a job.
const PROJECT_WORDS = /\b(built|developed|designed|created|implemented|projects?|intern|internship|worked|managed|final[- ]year|at work)\b/i;
const STRONG_YEARS = 2;

export const LEVEL_REASONS = {
  words: 'Strong: your CV says advanced, expert, proficient or led',
  years: `Strong: your CV says ${STRONG_YEARS} or more years`,
  projects: 'Strong: used in 2 or more projects or jobs in your CV',
  project: 'Good: used in a project or job in your CV',
  'said-basic': 'Basic: your CV says basic, beginner or learning',
  list: 'Basic: only listed in your CV, not in a project or job',
};

// First guess of a level from every CV line that matched the skill, with the reason.
// The student always checks it.
export function levelGuess(lines) {
  const texts = (Array.isArray(lines) ? lines : [lines]).map((line) => String(line || ''));
  if (texts.some((text) => STRONG_WORDS.test(text) || LED_WORD.test(text))) return { level: 'strong', reason: 'words' };
  if (texts.some((text) => [...text.matchAll(YEARS)].some((m) => Number(m[1]) >= STRONG_YEARS))) {
    return { level: 'strong', reason: 'years' };
  }
  if (texts.some((text) => BASIC_WORDS.test(text) || LEARNING.test(text))) return { level: 'basic', reason: 'said-basic' };
  const projects = texts.filter((text) => PROJECT_WORDS.test(text)).length;
  if (projects >= 2) return { level: 'strong', reason: 'projects' };
  if (projects === 1) return { level: 'good', reason: 'project' };
  return { level: 'basic', reason: 'list' };
}

export function guessLevel(lines) {
  return levelGuess(lines).level;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegex(keywords) {
  const parts = keywords.map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

export function cut(line) {
  const t = line.trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

export function extractSkills(text, skillLabels) {
  const lines = String(text || '').split(/\r?\n/);
  const found = [];
  for (const skill of skillLabels || []) {
    const keywords = (skill.keywords || []).filter(Boolean);
    if (!keywords.length) continue;
    const re = keywordRegex(keywords);
    // Phrases like "sql account" (accounting software) must not count as the keyword.
    const notWords = (skill.notKeywords || []).filter(Boolean);
    const notRe = notWords.length ? new RegExp(keywordRegex(notWords).source, 'giu') : null;
    const matched = lines.filter((l) => re.test(notRe ? l.replace(notRe, ' ') : l));
    if (matched.length === 0) continue;
    const { level, reason } = levelGuess(matched);
    found.push({ label: skill.label, level, reason, evidence: cut(matched[0]) });
  }
  return found;
}

// Merge skills found in a CV into the profile. A sample or empty profile is
// replaced; a profile the student built is kept and only added to.
export function mergeCvSkills(profile, found) {
  const held = profile.skills ?? [];
  if (profile.sampleId || held.length === 0) {
    return {
      skills: found.map((item) => item.label),
      levels: Object.fromEntries(found.map((item) => [item.label, item.level])),
      mode: 'replaced',
    };
  }
  const skills = [...held];
  const levels = { ...(profile.levels ?? {}) };
  for (const item of found) {
    if (held.includes(item.label)) continue;
    skills.push(item.label);
    levels[item.label] = item.level;
  }
  return { skills, levels, mode: 'merged' };
}

// The message shown after a CV is read.
export function cvBannerText(mode, count) {
  if (mode === 'merged') {
    if (count === 0) return 'Your CV matched skills you already picked. We kept your picks. Please check each level.';
    return `We added ${count} new ${count === 1 ? 'skill' : 'skills'} from your CV and kept your picks. Please check each one.`;
  }
  return `We filled in the ${count} skills we found. Please check each one.`;
}

export const CV_AI_TEXT = {
  checking: 'Looking for more skills with AI… (up to 15 s)',
  fallback: 'AI check is not available right now. Your keyword results are kept.',
  privacy: 'Your CV text was checked on our server and not saved.',
};

export function sourceBadge(source) {
  return source === 'ai' ? 'Found by AI · estimate' : 'Found by keyword';
}

// Keyword results first (they win), then AI results for other skills.
export function mergeMatches(keywordFound, aiFound) {
  const merged = (keywordFound || []).map((item) => ({ ...item, source: 'keyword' }));
  const seen = new Set(merged.map((item) => item.label));
  for (const item of aiFound || []) {
    if (seen.has(item.label)) continue;
    seen.add(item.label);
    const { level, reason } = levelGuess(item.evidence);
    merged.push({ label: item.label, level, reason, evidence: cut(String(item.evidence || '')), source: 'ai' });
  }
  return merged;
}

export const MAX_CV_CHARS = 20000;

export async function fetchCvSkills(text, fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/cv-skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, MAX_CV_CHARS) }),
    });
    if (res.status !== 200) return { ok: false };
    const body = await res.json();
    if (!body || !Array.isArray(body.skills)) return { ok: false };
    return { ok: true, skills: body.skills };
  } catch {
    return { ok: false };
  }
}

// The AI step only adds skills the keyword step did not find, so a skill the
// student removed meanwhile is not put back.
export function aiOnly(merged) {
  return (merged || []).filter((item) => item.source === 'ai');
}

// Takes the skills of an earlier CV out of the profile, with their levels.
export function removeCvSkills(profile, labels) {
  const drop = new Set(labels ?? []);
  const levels = { ...(profile.levels ?? {}) };
  for (const label of drop) delete levels[label];
  return { skills: (profile.skills ?? []).filter((label) => !drop.has(label)), levels };
}

// Summary line above the CV review: sure = added now, check = AI matches waiting for a yes.
export function cvReviewLine(mode, sure, check) {
  const total = sure + check;
  const line = `We found ${total} ${total === 1 ? 'skill' : 'skills'}: ${sure} sure, ${check} to check.`;
  return mode === 'merged' ? `${line} We kept your picks.` : line;
}

const MIN_WORDS = 4;

// A few real sentences from the CV, shown when no skill matched. Headings, names and dates are skipped.
export function unmatchedLines(text, max = 5) {
  const sentences = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw
      .replace(/^[\s\-–—•*·●▪◦▶>]+/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (line.split(' ').length < MIN_WORDS) continue;
    if (line === line.toUpperCase() && /\p{L}/u.test(line)) continue;
    sentences.push(cut(line));
  }
  return { lines: sentences.slice(0, max), total: sentences.length };
}

// CV sentences that are not the evidence line of any found skill, for the review card.
export function linesNotMatched(text, evidence, max = 5) {
  const used = new Set((evidence ?? []).map((line) => cut(String(line).replace(/^[\s\-–—•*·●▪◦▶>]+/u, '').replace(/\s+/g, ' '))));
  const rest = unmatchedLines(text, Infinity).lines.filter((line) => !used.has(line));
  return { lines: rest.slice(0, max), total: rest.length };
}

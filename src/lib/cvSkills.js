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
  'none-found': `We did not find any skills we know in this CV. ${FALLBACK}`,
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

export function guessLevel(line) {
  const text = String(line || '');
  if (STRONG_WORDS.test(text) || LED_WORD.test(text)) return 'strong';
  for (const m of text.matchAll(YEARS)) {
    if (Number(m[1]) >= 3) return 'strong';
  }
  if (BASIC_WORDS.test(text) || LEARNING.test(text)) return 'basic';
  return 'good';
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
    const line = lines.find((l) => re.test(l));
    if (line === undefined) continue;
    found.push({ label: skill.label, level: guessLevel(line), evidence: cut(line) });
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
    merged.push({ label: item.label, level: guessLevel(item.evidence), evidence: cut(String(item.evidence || '')), source: 'ai' });
  }
  return merged;
}

export async function fetchCvSkills(text, fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/cv-skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
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

// Finds skills and a rough level in CV text. Pure helpers, no scoring maths here.
// Keywords come from data/skills.json (team draft). The level is only a guess.

export const MAX_CV_BYTES = 5 * 1024 * 1024;

const FALLBACK = 'You can pick your skills instead.';

export const CV_MESSAGES = {
  'not-pdf': `This file is not a PDF. Please choose a PDF file. ${FALLBACK}`,
  'too-big': `This file is too big. The limit is 5 MB. ${FALLBACK}`,
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

const STRONG_WORDS = /\b(advanced|expert|proficient|led)\b/i;
const BASIC_WORDS = /\b(basic|beginner|familiar|learning|introductory)\b/i;
const YEARS = /(\d+)\s*\+?\s*(?:years?|yrs?)\b/gi;

export function guessLevel(line) {
  const text = String(line || '');
  if (STRONG_WORDS.test(text)) return 'strong';
  for (const m of text.matchAll(YEARS)) {
    if (Number(m[1]) >= 3) return 'strong';
  }
  if (BASIC_WORDS.test(text)) return 'basic';
  return 'good';
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegex(keywords) {
  const parts = keywords.map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

function cut(line) {
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

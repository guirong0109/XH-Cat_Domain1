// "AI research momentum": paper counts per skill from OpenAlex, saved by the server.
// Pure helpers. A skill needs at least MIN_PAPERS in both years before we show a change %.

export const MIN_PAPERS = 30;
export const RISING_PCT = 25;

const countFor = (entry, year) => {
  const value = entry?.counts?.[String(year)];
  return typeof value === 'number' ? value : 0;
};

export function momentum(entry, years) {
  const [earlierYear, laterYear] = years;
  const earlier = countFor(entry, earlierYear);
  const later = countFor(entry, laterYear);
  const enough = earlier >= MIN_PAPERS && later >= MIN_PAPERS;
  const changePct = enough ? Math.round(((later - earlier) / earlier) * 100) : null;
  const rising = enough && changePct >= RISING_PCT;
  return { earlier, later, changePct, enough, rising };
}

export function researchRows(research) {
  const years = research?.source?.years ?? null;
  if (!years) return { rows: [], tooFew: [], years: null };
  const rows = [];
  const tooFew = [];
  for (const [label, entry] of Object.entries(research.skills ?? {})) {
    const m = momentum(entry, years);
    if (m.enough) rows.push({ label, earlier: m.earlier, later: m.later, changePct: m.changePct });
    else tooFew.push({ label, earlier: m.earlier, later: m.later });
  }
  rows.sort((a, b) => b.changePct - a.changePct || a.label.localeCompare(b.label));
  return { rows, tooFew, years };
}

export function risingSkills(research) {
  const rising = new Set();
  const years = research?.source?.years;
  if (!years) return rising;
  for (const [label, entry] of Object.entries(research.skills ?? {})) {
    if (momentum(entry, years).rising) rising.add(label);
  }
  return rising;
}

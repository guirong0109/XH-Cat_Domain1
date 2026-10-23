import { describe, it, expect } from 'vitest';
import { exposureText, filterRows, papersText, skillsVsAi, statusCounts } from '../src/lib/skillsVsAi.js';

const ilo = (category, mean) => ({ category, mean });
const mk = (id, skills, iloInfo) => ({ id, group: 'professionals', skills: skills.map((label) => ({ label })), ilo: iloInfo });

const roles = [
  mk('a', ['Python', 'Teamwork', 'Wiring'], ilo('Gradient 3', 0.56)),
  mk('b', ['Python', 'Teamwork'], ilo('Gradient 2', 0.48)),
  mk('c', ['Wiring', 'Teamwork'], ilo('Not Exposed', 0.27)),
  mk('d', ['Orphan'], undefined),
];
const target = mk('t', ['Python', 'Teamwork', 'Wiring', 'Orphan'], ilo('Gradient 3', 0.5));
const trendGroups = { professionals: { growthPct: 12.8 } };
const research = { source: { years: [2024, 2025] }, skills: { Python: { counts: { 2024: 640, 2025: 595 } } } };
const skillLabels = [{ label: 'Python', portal: 'elatih', hours: 40 }, { label: 'Wiring', portal: 'tvet', hours: null }];

const run = (profile, similar = {}) =>
  skillsVsAi({ role: target, profile, similar, roles, trendGroups, research, skillLabels });
const row = (rows, label) => rows.find((r) => r.label === label);

describe('skillsVsAi', () => {
  it('types skills from the ILO exposure of the roles that use them', () => {
    const rows = run({ skills: [], levels: {} });
    expect(row(rows, 'Python').type).toBe('aiExposed');
    expect(row(rows, 'Wiring').type).toBe('mixed');
    expect(row(rows, 'Teamwork').type).toBe('aiExposed');
  });

  it('gives no type to a skill whose roles have no ILO rating', () => {
    const rows = run({ skills: [], levels: {} });
    expect(row(rows, 'Orphan')).toMatchObject({ type: 'unrated', exposure: null });
  });

  it('marks missing, related, basic and good skills', () => {
    const rows = run(
      { skills: ['Python', 'Teamwork'], levels: { Python: 'basic', Teamwork: 'good' } },
      { Wiring: ['Python'] },
    );
    expect(row(rows, 'Python')).toMatchObject({ status: 'buildUp', you: 'Level: Basic' });
    expect(row(rows, 'Teamwork')).toMatchObject({ status: 'onTrack', you: 'Level: Good' });
    expect(row(rows, 'Wiring')).toMatchObject({ status: 'buildUp', you: 'A related skill only' });
    expect(row(rows, 'Orphan')).toMatchObject({ status: 'missing', you: 'Not yet' });
  });

  it('treats a picked skill with no level as Strong (same as the score)', () => {
    const rows = run({ skills: ['Python'], levels: {} });
    expect(row(rows, 'Python')).toMatchObject({ status: 'onTrack', you: 'Level: Strong' });
  });

  it('orders missing first, then build up, then on track, keeping the role order inside each', () => {
    const rows = run({ skills: ['Python'], levels: {} });
    expect(rows.map((r) => r.label)).toEqual(['Teamwork', 'Wiring', 'Orphan', 'Python']);
  });

  it('carries portal, hours (null stays null) and paper counts only when they exist', () => {
    const rows = run({ skills: [], levels: {} });
    expect(row(rows, 'Python')).toMatchObject({ portal: 'elatih', hours: 40, papers: { earlier: 640, later: 595 } });
    expect(row(rows, 'Wiring')).toMatchObject({ portal: 'tvet', hours: null, papers: null });
    expect(row(rows, 'Orphan')).toMatchObject({ portal: null, hours: null });
  });

  it('lists the ILO rows behind a skill, most exposed first, one per occupation, each with its own link', () => {
    const withTitles = [
      { id: 'a', group: 'professionals', skills: [{ label: 'Python' }], ilo: { category: 'Gradient 3', mean: 0.56, isco: '2120', iscoTitle: 'Mathematicians, Actuaries and Statisticians' } },
      { id: 'b', group: 'professionals', skills: [{ label: 'Python' }], ilo: { category: 'Gradient 2', mean: 0.48, isco: '2511', iscoTitle: 'Systems Analysts' } },
      { id: 'c', group: 'professionals', skills: [{ label: 'Python' }], ilo: { category: 'Gradient 2', mean: 0.48, isco: '2511', iscoTitle: 'Systems Analysts' } },
      { id: 'd', group: 'professionals', skills: [{ label: 'Other' }], ilo: { category: 'Gradient 3', mean: 0.6, isco: '9999', iscoTitle: 'Not used' } },
    ];
    const rows = skillsVsAi({ role: mk('t', ['Python'], undefined), profile: { skills: [] }, similar: {}, roles: withTitles, trendGroups, research, skillLabels });
    expect(rows[0].iloRows.map((r) => r.isco)).toEqual(['2120', '2511']);
    expect(rows[0].iloRows[0].url).toBe(
      'https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html#:~:text=Mathematicians%2C%20Actuaries%20and%20Statisticians',
    );
  });

  it('has no ILO rows when no role has an ISCO title', () => {
    expect(row(run({ skills: [], levels: {} }), 'Python').iloRows).toEqual([]);
  });

  it('works with no research file', () => {
    const rows = skillsVsAi({ role: target, profile: { skills: [] }, similar: {}, roles, trendGroups, research: null, skillLabels });
    expect(rows.every((r) => r.papers === null)).toBe(true);
  });

  it('filters and counts by status', () => {
    const rows = run({ skills: ['Python'], levels: {} });
    expect(statusCounts(rows)).toEqual({ all: 4, missing: 3, buildUp: 0, onTrack: 1 });
    expect(filterRows(rows, 'missing').map((r) => r.label)).toEqual(['Teamwork', 'Wiring', 'Orphan']);
    expect(filterRows(rows, 'all')).toHaveLength(4);
  });

  it('writes evidence lines with the real numbers, or nothing', () => {
    expect(exposureText({ roleCount: 2, exposedCount: 2, iloMean: 0.52 })).toContain('2 of the 2 roles');
    expect(exposureText(null)).toBeNull();
    expect(papersText({ earlier: 640, later: 595, years: [2024, 2025] })).toContain('640 in 2024, 595 in 2025');
    expect(papersText(null)).toBeNull();
  });
});

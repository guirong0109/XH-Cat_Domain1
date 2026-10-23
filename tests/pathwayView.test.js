import { describe, it, expect } from 'vitest';
import {
  PORTAL_LINKS,
  courseMeta,
  courseOptions,
  disclosureText,
  linksForPortal,
  pathwaySdgs,
  progress,
  stepCountText,
  stepSdgs,
  totalHours,
  hoursSummary,
  whyText,
} from '../src/lib/pathwayView.js';

const sdgInfo = {
  4: { label: 'SDG 4 Quality Education', short: 'SDG 4', color: '#C5192D', target: 'T4' },
  8: { label: 'SDG 8', short: 'SDG 8', color: '#A21942', target: 'T8' },
  9: { label: 'SDG 9', short: 'SDG 9', color: '#FD6925', target: 'T9' },
};

describe('pathwayView', () => {
  it('links tvet skills to MyTVET and others to e-Latih, plus claimable', () => {
    expect(linksForPortal('tvet').map((l) => l.url)).toEqual([PORTAL_LINKS.tvet.url, PORTAL_LINKS.claimable.url]);
    expect(linksForPortal('elatih')[0].url).toBe('https://elatih.hrdcorp.gov.my/');
    expect(linksForPortal('elatih')[1].label).toBe('HRD Corp claimable courses');
  });

  it('builds the why text', () => {
    expect(whyText({ status: 'gap', rising: true })).toBe('Gap skill. Its importance rises as AI spreads.');
    expect(whyText({ status: 'similar', rising: false })).toBe(
      'You have a similar skill, so this step is shorter. Core to the role today.',
    );
  });

  it('explains a levelup step', () => {
    expect(whyText({ status: 'levelup', rising: false })).toBe(
      'You have this skill at Basic level, so this step is shorter. Core to the role today.',
    );
  });

  it('totals known hours and counts null steps, never NaN', () => {
    const steps = [
      { label: 'A', hours: 10 },
      { label: 'B', hours: null },
      { label: 'C', hours: null },
    ];
    expect(totalHours(steps)).toEqual({ known: 10, missing: 2 });
    expect(totalHours([{ label: 'B', hours: null }])).toEqual({ known: 0, missing: 1 });
    expect(totalHours([])).toEqual({ known: 0, missing: 0 });
  });

  it('summarises hours without inventing a number', () => {
    expect(hoursSummary({ known: 15, missing: 0 })).toBe('about 15 hours (estimate)');
    expect(hoursSummary({ known: 10, missing: 2 })).toBe('about 10 hours (estimate), some steps not estimated');
    expect(hoursSummary({ known: 0, missing: 3 })).toBe('hours not estimated');
  });

  it('sums hours and progress, ignoring stale ticks', () => {
    const steps = [
      { label: 'A', hours: 10 },
      { label: 'B', hours: 5 },
    ];
    expect(totalHours(steps)).toEqual({ known: 15, missing: 0 });
    expect(progress(steps, ['A', 'Z'])).toEqual({ done: 1, total: 2, percent: 50 });
    expect(progress([], [])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('lists SDG 4 first without duplicates and flags chosen goals the role has', () => {
    const list = pathwaySdgs({ sdgs: [8, 4, 9] }, { sdgs: [9, 4] }, sdgInfo);
    expect(list.map((s) => s.goal)).toEqual([4, 8, 9]);
    expect(list.map((s) => s.chosen)).toEqual([true, false, true]);
    const other = pathwaySdgs({ sdgs: [8] }, { sdgs: [4] }, sdgInfo);
    expect(other.map((s) => [s.goal, s.chosen])).toEqual([[4, false], [8, false]]);
  });

  it('gives each step its skill SDGs, in order, ignoring unknown goals', () => {
    const labels = [
      { label: 'Solar PV basics', sdgs: [4, 7, 13] },
      { label: 'Teamwork', sdgs: [4] },
    ];
    const info = { ...sdgInfo, 7: { label: 'SDG 7', short: 'SDG 7', color: '#FCC30B', target: 'T7' } };
    expect(stepSdgs('Solar PV basics', labels, info).map((s) => s.goal)).toEqual([4, 7]);
    expect(stepSdgs('Unknown', labels, info)).toEqual([]);
  });

  it('counts how many steps build each goal and adds skill-only goals after role goals', () => {
    const steps = [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
    const labels = [
      { label: 'A', sdgs: [4, 9] },
      { label: 'B', sdgs: [4] },
      { label: 'C', sdgs: [4, 8] },
    ];
    const list = pathwaySdgs({ sdgs: [9] }, { sdgs: [9] }, sdgInfo, steps, labels);
    expect(list.map((s) => [s.goal, s.stepCount, s.roleGoal, s.chosen])).toEqual([
      [4, 3, false, false],
      [9, 1, true, true],
      [8, 1, false, false],
    ]);
    expect(stepCountText(list[0], 3)).toBe('All 3 of your steps');
    expect(stepCountText(list[1], 3)).toBe('1 of your 3 steps');
    expect(stepCountText({ stepCount: 0 }, 3)).toBe('');
    expect(stepCountText({ stepCount: 1 }, 1)).toBe('Your only step');
    expect(stepCountText({ stepCount: 2 }, 2)).toBe('Both of your steps');
  });

  it('states where task labels came from', () => {
    expect(disclosureText('runpod')).toContain('were made by an open AI model run on RunPod');
    expect(disclosureText('manual')).toContain('are placeholder sample labels for this demo (not yet reviewed)');
    expect(disclosureText('manual')).not.toContain('made by the team');
    expect(disclosureText('manual')).toMatch(/OpenDOSM\. All results are estimates\.$/);
  });
});

describe('linksForPortal by who', () => {
  it('puts claimable first for working people', () => {
    expect(linksForPortal('tvet', 'working').map((l) => l.url)).toEqual([PORTAL_LINKS.claimable.url, PORTAL_LINKS.tvet.url]);
    expect(linksForPortal('elatih', 'working').map((l) => l.url)).toEqual([
      PORTAL_LINKS.claimable.url,
      PORTAL_LINKS.elatih.url,
    ]);
  });
  it('keeps the skill portal first for students', () => {
    expect(linksForPortal('tvet', 'student').map((l) => l.url)).toEqual([PORTAL_LINKS.tvet.url, PORTAL_LINKS.claimable.url]);
  });
});

describe('courseOptions', () => {
  const elatihCourse = {
    portal: 'elatih',
    title: 'Time Management',
    url: 'https://elatih.hrdcorp.gov.my/courses-details/time-management',
    price: 'Free',
    duration: '2 Hours 50 Min',
    level: 'Beginner',
  };
  const tvetCourse = {
    portal: 'tvet',
    title: 'AUDIT TENAGA AWAL',
    url: 'https://www.tvet.gov.my/awam-kursus/kursus?id_kursus=48887',
    institution: 'UMPSA Advanced TVET Centre',
    level: 'Diploma Tahap 4',
  };

  it('lists the exact course pages with the details copied from the portal', () => {
    const result = courseOptions({ portal: 'elatih', courses: [elatihCourse, tvetCourse], coursesCheckedAt: '2026-10-24' }, 'student');
    expect(result.courses).toEqual([
      { title: 'Time Management', url: elatihCourse.url, meta: 'Free · 2 Hours 50 Min · Beginner', portalName: 'HRD Corp e-Latih', changed: false },
      { title: 'AUDIT TENAGA AWAL', url: tvetCourse.url, meta: 'UMPSA Advanced TVET Centre · Diploma Tahap 4', portalName: 'MyTVET', changed: false },
    ]);
    expect(result.checkedAt).toBe('2026-10-24');
    expect(result.fallback).toEqual([]);
  });

  it('falls back to the portal links when no course was found for the skill', () => {
    const result = courseOptions({ portal: 'tvet' }, 'student');
    expect(result.courses).toEqual([]);
    expect(result.checkedAt).toBeNull();
    expect(result.fallback.map((l) => l.url)).toEqual([PORTAL_LINKS.tvet.url, PORTAL_LINKS.claimable.url]);
  });

  it('copes with an unknown skill', () => {
    expect(courseOptions(undefined, 'working').courses).toEqual([]);
  });

  it('skips missing detail fields instead of printing blanks', () => {
    expect(courseMeta({ portal: 'elatih', title: 'x', price: 'Free' })).toBe('Free');
  });

  it('hides a course whose page is gone and falls back to the portal link', () => {
    const checks = { checkedAt: '2026-10-31T10:00:00Z', courses: { [elatihCourse.url]: { status: 'gone' } } };
    const result = courseOptions({ portal: 'elatih', courses: [elatihCourse], coursesCheckedAt: '2026-10-24' }, 'student', checks);
    expect(result.courses).toEqual([]);
    expect(result.goneCount).toBe(1);
    expect(result.fallback.length).toBeGreaterThan(0);
  });

  it('keeps a course the check could not read, and flags one whose page changed', () => {
    const checks = {
      checkedAt: '2026-10-31T10:00:00Z',
      courses: { [elatihCourse.url]: { status: 'unreadable' }, [tvetCourse.url]: { status: 'changed' } },
    };
    const result = courseOptions({ portal: 'elatih', courses: [elatihCourse, tvetCourse], coursesCheckedAt: '2026-10-24' }, 'student', checks);
    expect(result.courses.map((c) => [c.title, c.changed])).toEqual([['Time Management', false], ['AUDIT TENAGA AWAL', true]]);
    expect(result.goneCount).toBe(0);
  });

  it('shows the live check date when there is one, else the saved date', () => {
    const skillInfo = { portal: 'elatih', courses: [elatihCourse], coursesCheckedAt: '2026-10-24' };
    expect(courseOptions(skillInfo, 'student', { checkedAt: '2026-10-31T10:00:00Z', courses: {} }).checkedAt).toBe('2026-10-31');
    expect(courseOptions(skillInfo, 'student').checkedAt).toBe('2026-10-24');
  });
});

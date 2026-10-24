import { describe, it, expect } from 'vitest';
import { aiForRole, iloStrip } from '../src/lib/aiForRole.js';

const course = (slug, extra = {}) => ({
  portal: 'elatih',
  title: slug,
  url: `https://elatih.hrdcorp.gov.my/courses-details/${slug}`,
  price: 'Free',
  duration: '40 Min',
  level: 'Beginner',
  ...extra,
});

const aiCourses = {
  checkedAt: '2026-10-24',
  general: [course('ai-fluency')],
  bySkill: {
    'Python programming': [course('ml-fundamentals'), course('ai-fluency')],
    Statistics: [course('ml-fundamentals')],
    'SQL and databases': [course('chatgpt-data')],
  },
};
const role = {
  skills: [{ label: 'SQL and databases' }, { label: 'Python programming' }, { label: 'Statistics' }, { label: 'Teamwork' }],
  ilo: { isco: '2120', iscoTitle: 'Mathematicians, Actuaries and Statisticians', mean: 0.56, category: 'Gradient 3' },
};

describe('aiForRole', () => {
  it('lists the general courses for every role', () => {
    const view = aiForRole({ skills: [{ label: 'Teamwork' }] }, aiCourses);
    expect(view.general.map((c) => c.title)).toEqual(['ai-fluency']);
    expect(view.specific).toEqual([]);
  });

  it('adds courses tied to the role skills, once each, with the skills they help with', () => {
    const view = aiForRole(role, aiCourses);
    expect(view.specific.map((c) => [c.title, c.helpsWith])).toEqual([
      ['chatgpt-data', ['SQL and databases']],
      ['ml-fundamentals', ['Python programming', 'Statistics']],
    ]);
  });

  it('does not repeat a general course in the role list', () => {
    const view = aiForRole(role, aiCourses);
    expect(view.specific.some((c) => c.title === 'ai-fluency')).toBe(false);
  });

  it('copies the details shown under each title and the checked date', () => {
    const view = aiForRole(role, aiCourses);
    expect(view.general[0]).toMatchObject({ meta: 'Free · 40 Min · Beginner', portalName: 'HRD Corp e-Latih' });
    expect(view.checkedAt).toBe('2026-10-24');
  });

  it('returns null when there is no AI course file', () => {
    expect(aiForRole(role, undefined)).toBeNull();
  });

  it('copes with a file that has only general courses', () => {
    const view = aiForRole(role, { checkedAt: '2026-10-24', general: [course('a')] });
    expect(view.specific).toEqual([]);
  });
});

describe('aiForRole with the weekly course check', () => {
  const checks = {
    checkedAt: '2026-10-31T10:00:00Z',
    courses: {
      'https://elatih.hrdcorp.gov.my/courses-details/ml-fundamentals': { status: 'gone' },
      'https://elatih.hrdcorp.gov.my/courses-details/chatgpt-data': { status: 'changed' },
    },
  };

  it('hides gone courses, flags changed ones and shows the live check date', () => {
    const view = aiForRole(role, aiCourses, checks);
    expect(view.specific.map((c) => [c.title, c.changed])).toEqual([['chatgpt-data', true]]);
    expect(view.checkedAt).toBe('2026-10-31');
  });

  it('hides a gone general course too', () => {
    const goneGeneral = { courses: { 'https://elatih.hrdcorp.gov.my/courses-details/ai-fluency': { status: 'gone' } } };
    expect(aiForRole(role, aiCourses, goneGeneral).general).toEqual([]);
  });
});

describe('iloStrip', () => {
  it('says AI matters when the occupation is in an exposed gradient, and links to its row', () => {
    const strip = iloStrip(role);
    expect(strip.exposed).toBe(true);
    expect(strip.text).toContain('ISCO 2120 Mathematicians, Actuaries and Statisticians');
    expect(strip.text).toContain('Gradient 3, mean 0.56');
    expect(strip.text).toContain('matters for this role');
    expect(strip.url).toContain('#:~:text=Mathematicians%2C%20Actuaries%20and%20Statisticians');
  });

  it('says AI skills matter less when the occupation is not exposed', () => {
    const strip = iloStrip({ ilo: { isco: '7411', iscoTitle: 'Building Electricians', mean: 0.2, category: 'Not Exposed' } });
    expect(strip.exposed).toBe(false);
    expect(strip.text).toContain('matter less here');
  });

  it('returns null without ILO data', () => {
    expect(iloStrip({ skills: [] })).toBeNull();
    expect(iloStrip({ ilo: { category: 'Gradient 3' } })).toBeNull();
  });
});

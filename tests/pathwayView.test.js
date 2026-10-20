import { describe, it, expect } from 'vitest';
import {
  PORTAL_LINKS,
  disclosureText,
  linksForPortal,
  pathwaySdgs,
  progress,
  totalHours,
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

  it('sums hours and progress, ignoring stale ticks', () => {
    const steps = [
      { label: 'A', hours: 10 },
      { label: 'B', hours: 5 },
    ];
    expect(totalHours(steps)).toBe(15);
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

  it('states where task labels came from', () => {
    expect(disclosureText('runpod')).toContain('were made by an open AI model run on RunPod');
    expect(disclosureText('manual')).toContain('are sample labels made by the team for this demo');
    expect(disclosureText('manual')).toMatch(/OpenDOSM\. All results are estimates\.$/);
  });
});

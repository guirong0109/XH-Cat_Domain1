import { describe, it, expect } from 'vitest';
import { radarGeometry, radarRings, radarLabels, roleRadarValues } from '../src/lib/radar.js';

describe('radarGeometry', () => {
  it('places 4 axes at value 1 on the outer ring, starting at the top', () => {
    const { vertices } = radarGeometry([1, 1, 1, 1]);
    expect(vertices).toHaveLength(4);
    expect(vertices[0].x).toBeCloseTo(150);
    expect(vertices[0].y).toBeCloseTo(50);
    expect(vertices[1].x).toBeCloseTo(250);
    expect(vertices[1].y).toBeCloseTo(150);
  });

  it('puts every vertex at the center when all values are 0', () => {
    const { vertices, points } = radarGeometry([0, 0, 0, 0, 0]);
    for (const vertex of vertices) {
      expect(vertex.x).toBeCloseTo(150);
      expect(vertex.y).toBeCloseTo(150);
    }
    expect(points).toBe('150.0,150.0 150.0,150.0 150.0,150.0 150.0,150.0 150.0,150.0');
  });

  it('formats points as an SVG polygon string and honours center and radius', () => {
    const { points } = radarGeometry([1, 1, 1, 1], { center: 100, radius: 50 });
    expect(points).toBe('100.0,50.0 150.0,100.0 100.0,150.0 50.0,100.0');
  });

  it('returns empty geometry for no values', () => {
    expect(radarGeometry([])).toEqual({ points: '', vertices: [] });
  });
});

describe('radarRings', () => {
  it('returns one polygon per level', () => {
    const rings = radarRings(4);
    expect(rings.map((ring) => ring.level)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(rings[3].points).toBe('150.0,50.0 250.0,150.0 150.0,250.0 50.0,150.0');
  });
});

describe('radarLabels', () => {
  it('anchors labels middle at top, start on the right and end on the left', () => {
    const labels = radarLabels(['Top', 'Right', 'Bottom', 'Left']);
    expect(labels.map((label) => label.anchor)).toEqual(['middle', 'start', 'middle', 'end']);
    expect(labels[0].text).toBe('Top');
    expect(labels[0].y).toBeLessThan(50);
    expect(labels[1].x).toBeGreaterThan(250);
  });
});

describe('roleRadarValues', () => {
  const role = {
    skills: [
      { label: 'SQL', moderate: 0.8, fast: 0.6 },
      { label: 'Charts', moderate: 0.7, fast: 0.9 },
      { label: 'Stats', moderate: 0.5, fast: 1 },
    ],
  };
  const similar = { Charts: ['Excel'] };

  it('gives have 1, similar 0.5, gap 0.06 and the scenario importance as need', () => {
    const values = roleRadarValues(role, { skills: ['SQL', 'Excel'] }, similar, 'moderate');
    expect(values.labels).toEqual(['SQL', 'Charts', 'Stats']);
    expect(values.you).toEqual([1, 0.5, 0.06]);
    expect(values.need).toEqual([0.8, 0.7, 0.5]);
  });

  it('uses fast importance in the fast scenario', () => {
    expect(roleRadarValues(role, { skills: [] }, similar, 'fast').need).toEqual([0.6, 0.9, 1]);
  });
});

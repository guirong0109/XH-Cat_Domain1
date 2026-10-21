// Pure helpers for the skills radar SVG. Axis 0 points straight up and the
// axes go clockwise. A value of 1 sits on the outer ring, 0 at the center.

import { skillCredit, skillStatus } from './scoring.js';

const DEFAULT_CENTER = 150;
const DEFAULT_RADIUS = 100;
const LABEL_DISTANCE = 1.18;
const SIDE_THRESHOLD = 20;

function pointAt(index, count, value, center, radius) {
  const angle = ((-90 + (360 * index) / count) * Math.PI) / 180;
  return {
    x: center + radius * value * Math.cos(angle),
    y: center + radius * value * Math.sin(angle),
  };
}

function toPoints(vertices) {
  return vertices.map((vertex) => `${vertex.x.toFixed(1)},${vertex.y.toFixed(1)}`).join(' ');
}

export function radarGeometry(values, { center = DEFAULT_CENTER, radius = DEFAULT_RADIUS } = {}) {
  const vertices = values.map((value, index) => pointAt(index, values.length, value, center, radius));
  return { points: toPoints(vertices), vertices };
}

export function radarRings(count, levels = [0.25, 0.5, 0.75, 1], options = {}) {
  return levels.map((level) => ({
    level,
    points: radarGeometry(Array.from({ length: count }, () => level), options).points,
  }));
}

export function radarLabels(
  labels,
  { center = DEFAULT_CENTER, radius = DEFAULT_RADIUS, distance = LABEL_DISTANCE } = {},
) {
  return labels.map((text, index) => {
    const point = pointAt(index, labels.length, distance, center, radius);
    const offset = point.x - center;
    const anchor = offset > SIDE_THRESHOLD ? 'start' : offset < -SIDE_THRESHOLD ? 'end' : 'middle';
    return { text, x: point.x, y: point.y, anchor };
  });
}

// How far out the "you" shape reaches for each skill status. A gap keeps a
// small value so the shape never collapses to a point.
export const YOU_LEVEL = { have: 1, similar: 0.5, gap: 0.06 };

export function roleRadarValues(role, profile, similar, scenario) {
  return {
    labels: role.skills.map((skill) => skill.label),
    you: role.skills.map((skill) =>
      skillStatus(skill.label, profile.skills, similar) === 'gap'
        ? YOU_LEVEL.gap
        : skillCredit(skill.label, profile, similar),
    ),
    need: role.skills.map((skill) => skill[scenario]),
  };
}

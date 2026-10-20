import { radarGeometry, radarLabels, radarRings } from '../lib/radar.js';
import { useTween } from '../lib/useTween.js';

const CENTER = 150;
const LINE_HEIGHT = 16;
const WRAP_AFTER = 12;

// Splits a long label into two balanced lines so it stays inside the chart.
function wrapLabel(text) {
  if (text.length <= WRAP_AFTER || !text.includes(' ')) return [text];
  const words = text.split(' ');
  let best = [text];
  let bestLongest = Infinity;
  for (let cut = 1; cut < words.length; cut += 1) {
    const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    const longest = Math.max(lines[0].length, lines[1].length);
    if (longest < bestLongest) {
      best = lines;
      bestLongest = longest;
    }
  }
  return best;
}

// Top labels grow upward, bottom labels grow downward, side labels stay centred.
function firstLineShift(y, lineCount) {
  const extra = (lineCount - 1) * LINE_HEIGHT;
  if (y < CENTER - 20) return 4 - extra;
  if (y > CENTER + 20) return 8;
  return 4 - extra / 2;
}

export default function RadarChart({ labels, you, need, size = 440, showLabels = true, ariaLabel }) {
  const targets = {};
  you.forEach((value, index) => { targets[`you${index}`] = value; });
  need.forEach((value, index) => { targets[`need${index}`] = value; });
  const shown = useTween(targets);

  const youShown = you.map((_, index) => shown[`you${index}`]);
  const needShown = need.map((_, index) => shown[`need${index}`]);
  const youShape = radarGeometry(youShown);
  const needShape = radarGeometry(needShown);
  const axes = radarGeometry(labels.map(() => 1)).vertices;
  const rings = radarRings(labels.length);
  const viewBox = showLabels ? '-72 -6 444 312' : '40 40 220 220';

  return (
    <svg
      viewBox={viewBox}
      width="100%"
      style={{ maxWidth: size }}
      role="img"
      aria-label={ariaLabel}
      className="block overflow-visible"
    >
      {rings.map((ring) => (
        <polygon key={ring.level} points={ring.points} fill="none" stroke="#E2E8F0" strokeWidth="1" />
      ))}
      {axes.map((axis, index) => (
        <line key={index} x1={CENTER} y1={CENTER} x2={axis.x} y2={axis.y} stroke="#E2E8F0" strokeWidth="1" />
      ))}
      <polygon
        points={needShape.points}
        fill="rgba(194,65,12,0.10)"
        stroke="#C2410C"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <polygon points={youShape.points} fill="rgba(15,118,110,0.25)" stroke="#0F766E" strokeWidth="2.5" />
      {youShape.vertices.map((vertex, index) => (
        <circle key={index} cx={vertex.x} cy={vertex.y} r="3.5" fill="#0F766E" />
      ))}
      {showLabels &&
        radarLabels(labels).map((label) => {
          const lines = wrapLabel(label.text);
          return (
            <text
              key={label.text}
              x={label.x}
              y={label.y + firstLineShift(label.y, lines.length)}
              textAnchor={label.anchor}
              fontSize="15"
              fill="#334155"
              fontFamily="inherit"
            >
              {lines.map((line, index) => (
                <tspan key={line} x={label.x} dy={index === 0 ? 0 : LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
    </svg>
  );
}

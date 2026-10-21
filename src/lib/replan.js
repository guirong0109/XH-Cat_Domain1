// Pure helpers for the "New data changed your results" notice.
import { MIN_SKILLS } from './navigation.js';

// Compare two role orders (best first). Ranks are 1-based. Ids missing from
// either list are ignored. Largest moves come first, ties by new rank.
export function rankChanges(beforeIds, afterIds) {
  const before = new Map(beforeIds.map((id, index) => [id, index + 1]));
  const up = [];
  const down = [];
  afterIds.forEach((id, index) => {
    const from = before.get(id);
    if (from === undefined) return;
    const to = index + 1;
    if (to < from) up.push({ id, from, to });
    else if (to > from) down.push({ id, from, to });
  });
  const bySize = (a, b) => Math.abs(b.from - b.to) - Math.abs(a.from - a.to) || a.to - b.to;
  up.sort(bySize);
  down.sort(bySize);
  return { up, down, unchanged: up.length === 0 && down.length === 0 };
}

// Only a real data update, for a student with enough skills, needs a notice.
export function shouldReplan(status, skillCount) {
  return status === 'updated' && skillCount >= MIN_SKILLS;
}

// The biggest moves across risers and fallers together, for the notice.
export function topMoves(changes, count = 3) {
  return [...changes.up, ...changes.down]
    .sort((a, b) => Math.abs(b.from - b.to) - Math.abs(a.from - a.to) || a.to - b.to)
    .slice(0, count);
}

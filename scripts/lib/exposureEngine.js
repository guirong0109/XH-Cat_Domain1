// Role AI-exposure from observed AI use (Anthropic Economic Index) of the O*NET tasks that match a role's own tasks.
// Pure: no files, no model. Inputs are the matches made by scripts/match-tasks.mjs.
// Nothing here is hand-written: change the data or the cutoff and the numbers change.

export const CUTOFF = 0.8 // lowest cosine where >= 95% of judged pairs were the same or a related activity
export const MIN_TASKS = 3 // fewer matched tasks than this: no number is shown
const TOP = 3

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places

// matched: [{ text, onetTask, score, penetration }] for one role's tasks (best O*NET match each).
export function roleExposure(matched, { cutoff = CUTOFF, minTasks = MIN_TASKS } = {}) {
  const used = matched.filter((item) => item.score >= cutoff)
  if (used.length < minTasks) {
    return { status: 'not_enough', tasksUsed: used.length, tasksTotal: matched.length }
  }
  const observed = used.filter((item) => item.penetration > 0)
  const byUse = [...used].sort((a, b) => b.penetration - a.penetration || b.score - a.score)
  const describe = (item) => ({ task: item.text, onetTask: item.onetTask, penetration: round(item.penetration, 3), score: round(item.score, 3) })
  return {
    status: 'ok',
    exposure: round(used.reduce((sum, item) => sum + item.penetration, 0) / used.length, 3),
    observedShare: round(observed.length / used.length, 3),
    tasksUsed: used.length,
    tasksTotal: matched.length,
    aiTasks: byUse.filter((item) => item.penetration > 0).slice(0, TOP).map(describe),
    humanTasks: [...byUse].reverse().filter((item) => item.penetration === 0).slice(0, TOP).map(describe),
  }
}

// roles: [{ code, title, tasks: [text] }]; items/matches/onet come from the cache files.
export function buildAllExposure({ roles, items, matches, onet, cutoff = CUTOFF, minTasks = MIN_TASKS }) {
  const rowOf = new Map(items.map((item, row) => [item.text, row]))
  const result = {}
  for (const role of roles) {
    const matched = []
    for (const raw of role.tasks ?? []) {
      const text = typeof raw === 'string' ? raw.trim() : ''
      const row = rowOf.get(text)
      if (!text || row === undefined) continue
      const best = matches[row]?.[0]
      if (!best) continue
      matched.push({ text, onetTask: onet[best.onet].task, score: best.score, penetration: onet[best.onet].penetration })
    }
    result[role.code] = { title: role.title, ...roleExposure(matched, { cutoff, minTasks }) }
  }
  return result
}

// How many roles share one exact result: used to prove roles do not all get the same output.
export function distinctness(exposures) {
  const ok = Object.values(exposures).filter((entry) => entry.status === 'ok')
  const keys = new Set(ok.map((entry) => `${entry.exposure}|${entry.observedShare}`))
  return { roles: ok.length, distinctPairs: keys.size }
}

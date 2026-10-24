// Pure helpers for matching eMASCO tasks to O*NET tasks (vectors are unit length, so a dot product is the cosine).

// Every distinct eMASCO task text with the roles that use it: { texts, items: [{ text, codes }] }.
export function emascoTaskInputs(occupations) {
  const byText = new Map()
  for (const role of [...occupations.roles, ...(occupations.tasksOnly ?? [])]) {
    for (const raw of role.tasks ?? []) {
      const text = typeof raw === 'string' ? raw.trim() : ''
      if (!text) continue
      if (!byText.has(text)) byText.set(text, new Set())
      byText.get(text).add(role.code)
    }
  }
  const items = [...byText].map(([text, codes]) => ({ text, codes: [...codes] }))
  return { texts: items.map((item) => item.text), items }
}

export function dot(a, aOffset, b, bOffset, dimension) {
  let sum = 0
  for (let i = 0; i < dimension; i += 1) sum += a[aOffset + i] * b[bOffset + i]
  return sum
}

// Top k rows of `candidates` (Float32Array, rows of `dimension`) for one query row.
export function topMatches(query, queryRow, candidates, candidateCount, dimension, k = 3) {
  const best = []
  const offset = queryRow * dimension
  for (let row = 0; row < candidateCount; row += 1) {
    const score = dot(query, offset, candidates, row * dimension, dimension)
    if (best.length < k || score > best[best.length - 1].score) {
      best.push({ row, score })
      best.sort((x, y) => y.score - x.score)
      if (best.length > k) best.pop()
    }
  }
  return best
}

// Role exposure from matched tasks: the mean penetration of the tasks that matched well enough.
// Returns null when too few tasks matched, so a role is never given a number from one lucky match.
export function roleExposure(matches, { cutoff, minTasks = 3 }) {
  const used = matches.filter((match) => match.score >= cutoff)
  if (used.length < minTasks) return null
  const exposure = used.reduce((sum, match) => sum + match.penetration, 0) / used.length
  return { exposure, tasksUsed: used.length, tasksTotal: matches.length }
}

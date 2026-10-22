// Pure helpers for mapping eMASCO statements to existing skills (vectors are normalised).
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
const norm = (t) => t.trim().toLowerCase()

export function linkStatements(statements, stmtVectors, skills, skillVectors, cutoff) {
  return statements.map((s, i) => {
    let best = -1
    let score = -Infinity
    skillVectors.forEach((sv, j) => {
      const d = dot(stmtVectors[i], sv)
      if (d > score) { score = d; best = j }
    })
    const label = best >= 0 ? skills[best].label : null
    return { ...s, best: label, score, linked: best >= 0 && score >= cutoff ? label : null }
  })
}

export function groupStatements(unlinked, vectors, cutoff) {
  const parent = unlinked.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  const seen = new Map()
  unlinked.forEach((s, i) => {
    const key = norm(s.text)
    if (seen.has(key)) union(i, seen.get(key))
    else seen.set(key, i)
  })
  for (let i = 0; i < unlinked.length; i++) {
    for (let j = i + 1; j < unlinked.length; j++) {
      if (dot(vectors[i], vectors[j]) >= cutoff) union(i, j)
    }
  }
  const byRoot = new Map()
  unlinked.forEach((s, i) => {
    const r = find(i)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(s)
  })
  return [...byRoot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, members], k) => ({ group: `g${String(k + 1).padStart(2, '0')}`, members }))
}

const HEADER = ['code', 'role', 'type', 'statement', 'best_existing', 'score', 'group', 'decision']
const cell = (v) => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// rows: { code, role, type, text, best, score, group, decision }
export function toCsv(rows) {
  const lines = rows.map((r) =>
    [r.code, r.role, r.type, r.text, r.best, Math.round(r.score * 10000) / 10000, r.group, r.decision].map(cell).join(',')
  )
  return '﻿' + [HEADER.join(','), ...lines].join('\r\n') + '\r\n'
}

// Objective test for eMASCO role ranking (no CV judging, no model needed).
// Run: node scripts/eval-retrieval.mjs
// Pseudo-CV = a random half of one role's own skills (their stored vectors act as CV lines), with 0 or 3 distractor lines
// (skills of unrelated roles, like hobbies on a CV). Question: does the ranking bring the role back in the top 5?
// Used to choose the scoring method and its settings; the 12 made-up CVs stay untouched as the final check.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEmascoIndex, skillScores, TYPE_WEIGHT } from '../server/emascoMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
const index = await loadEmascoIndex({ cacheDirectory: path.join(ROOT, 'data', 'cache', 'emasco'), occupations })
const { dimension, skillVectors, roleVectors, roleRow } = index

let seed = 20261024
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const skillVector = (row) => skillVectors.subarray(row * dimension, (row + 1) * dimension)
const gaussian = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random())
// Blur a vector so that its cosine with the original is `similarity` (stand-in for a CV line that only roughly
// resembles the eMASCO skill text; real paraphrase noise is more structured than this random noise).
function blurred(vector, similarity) {
  if (similarity >= 1) return vector
  const noise = Array.from({ length: dimension }, gaussian)
  const noiseLength = Math.sqrt(noise.reduce((a, b) => a + b * b, 0))
  const spread = Math.sqrt(1 - similarity * similarity)
  return Array.from(vector, (value, position) => similarity * value + spread * noise[position] / noiseLength)
}

// IDF: skills used by many roles say little about one role.
const roleCount = index.roles.length
const idf = new Float64Array(index.skillCount)
occupations.skills.forEach((skill, row) => { idf[row] = Math.log(roleCount / Math.max(1, skill.roles.length)) })

function profileScores(lineVectors, topLines = 3) {
  return index.roles.map((role) => {
    const offset = roleRow.get(role.code) * dimension
    const sims = lineVectors.map((line) => {
      let sum = 0
      for (let position = 0; position < dimension; position += 1) sum += roleVectors[offset + position] * line[position]
      return sum
    }).sort((a, b) => b - a).slice(0, topLines)
    return sims.reduce((a, b) => a + b, 0) / sims.length
  })
}

function softScores(scores, floor, useIdf) {
  return index.roles.map((role) => {
    let top = 0
    let bottom = 0
    for (const entry of role.entries) {
      const weight = (useIdf ? idf[entry.row] : 1) * (TYPE_WEIGHT[entry.type] ?? 1)
      top += weight * Math.max(0, scores[entry.row] - floor)
      bottom += weight
    }
    return bottom > 0 ? top / bottom : 0
  })
}

function zScores(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
  return values.map((value) => (value - mean) / spread)
}

const methods = {
  profile: ({ profile }) => profile,
  'soft f0.50': ({ scores }) => softScores(scores, 0.5, false),
  'soft-idf f0.50': ({ scores }) => softScores(scores, 0.5, true),
  'soft-idf f0.55': ({ scores }) => softScores(scores, 0.55, true),
  'soft-idf f0.60': ({ scores }) => softScores(scores, 0.6, true),
  'soft-idf f0.65': ({ scores }) => softScores(scores, 0.65, true),
  'hybrid idf0.55 g1': ({ profile, scores }) => {
    const left = zScores(profile)
    const right = zScores(softScores(scores, 0.55, true))
    return left.map((value, position) => value + right[position])
  },
  'hybrid idf0.55 g2': ({ profile, scores }) => {
    const left = zScores(profile)
    const right = zScores(softScores(scores, 0.55, true))
    return left.map((value, position) => value + 2 * right[position])
  }
}

const candidates = index.roles.filter((role, position) => role.entries.length >= 6 && position % 12 === 0)
const rowsOf = (role) => [...new Set(role.entries.map((entry) => entry.row))]
const results = {}
const conditions = [
  { label: 'exact', similarity: 1, noise: 0 },
  { label: 'blur0.80+3', similarity: 0.8, noise: 3 },
  { label: 'blur0.65+3', similarity: 0.65, noise: 3 }
]
for (const condition of conditions) {
  for (const name of Object.keys(methods)) results[`${name} | ${condition.label}`] = { top5: 0, group10: 0, rank: 0, count: 0 }
}

for (const role of candidates) {
  const own = rowsOf(role)
  const half = own.filter(() => random() < 0.5)
  if (half.length < 3) continue
  for (const condition of conditions) {
    const lineVectors = half.map((row) => blurred(skillVector(row), condition.similarity))
    for (let added = 0; added < condition.noise; added += 1) lineVectors.push(skillVector(Math.floor(random() * index.skillCount)))
    const profile = profileScores(lineVectors)
    const { scores } = skillScores(lineVectors, index)
    for (const [name, method] of Object.entries(methods)) {
      const values = method({ profile, scores })
      const order = values.map((value, position) => ({ code: index.roles[position].code, value })).sort((a, b) => b.value - a.value)
      const position = order.findIndex((item) => item.code === role.code)
      const group = order.slice(0, 10).some((item) => item.code.slice(0, 4) === role.code.slice(0, 4))
      const bucket = results[`${name} | ${condition.label}`]
      bucket.count += 1
      if (position < 5) bucket.top5 += 1
      if (group) bucket.group10 += 1
      bucket.rank += position + 1
    }
  }
}
console.log('method | condition | own role in top 5 | same 4-digit group in top 10 | mean rank of own role | queries')
for (const [name, bucket] of Object.entries(results)) {
  console.log(`${name.padEnd(28)} ${(100 * bucket.top5 / bucket.count).toFixed(0).padStart(3)}%  ${(100 * bucket.group10 / bucket.count).toFixed(0).padStart(3)}%  ${(bucket.rank / bucket.count).toFixed(1).padStart(6)}  n=${bucket.count}`)
}

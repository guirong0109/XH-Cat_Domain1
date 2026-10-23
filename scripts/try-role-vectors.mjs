// Experiment (option B phase 4b): rank eMASCO roles by CV-to-role-vector similarity.
// Run: node scripts/try-role-vectors.mjs   Prints the top 5 roles of the 12 made-up CVs for two variants:
//   mean  = the normalised mean of all CV line vectors vs each role vector
//   top3  = the mean of each role's 3 best-matching CV lines
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { splitCvLines } from '../server/cvMatch.js'
import { unpackVectors } from './lib/emascoEmbed.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE = path.join(ROOT, 'data', 'cache', 'emasco')
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0)

function normalisedMean(vectors) {
  const sum = new Array(vectors[0].length).fill(0)
  for (const vector of vectors) vector.forEach((value, index) => { sum[index] += value })
  const length = Math.sqrt(dot(sum, sum))
  return sum.map((value) => value / length)
}

const config = chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models'))
const embedder = createEmbedder(config)
const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
const roleIds = JSON.parse(await readFile(path.join(CACHE, 'roles_ids.json'), 'utf8'))
const roleVectors = unpackVectors(await readFile(path.join(CACHE, 'roles.f32')))
const titleOf = new Map(occupations.roles.map((role) => [role.code, role.title]))
const rolePositions = roleIds.map((code, position) => ({ code, position })).filter((role) => titleOf.has(role.code))
// Hub correction: how close each role vector is, on average, to 500 random skill vectors (a "typical line").
const skillFile = await readFile(path.join(CACHE, 'skills.f32'))
const skillFloats = new Float32Array(new Uint8Array(skillFile).buffer)
let seed = 20261023
const nextRandom = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const sampleRows = Array.from({ length: 500 }, () => Math.floor(nextRandom() * (skillFloats.length / 1024)))
const sampleVectors = sampleRows.map((row) => Array.from(skillFloats.subarray(row * 1024, row * 1024 + 1024)))
const hub = new Map(rolePositions.map((role) => {
  const scores = sampleVectors.map((vector) => dot(vector, roleVectors[role.position])).sort((a, b) => b - a).slice(0, 3)
  return [role.code, scores.reduce((sum, value) => sum + value, 0) / 3]
}))
const answers = JSON.parse(await readFile(path.join(ROOT, 'testing', 'cv_test_set', 'answers.json'), 'utf8'))
const only = process.argv[2]
if (only && existsSync(only)) {
  answers[only] = { person: 'file', field: '-', skills: [] }
}

for (const [cvId, answer] of Object.entries(answers)) {
  if (only && only !== cvId) continue
  const lines = splitCvLines(await readFile(existsSync(cvId) ? cvId : path.join(ROOT, 'testing', 'cv_test_set', `${cvId}.txt`), 'utf8'))
  const lineVectors = await embedder.embed(lines)
  const mean = normalisedMean(lineVectors)
  const meanRanked = rolePositions
    .map((role) => ({ code: role.code, score: dot(mean, roleVectors[role.position]) }))
    .sort((left, right) => right.score - left.score)
  const topRanked = rolePositions
    .map((role) => {
      const best = lineVectors.map((vector) => dot(vector, roleVectors[role.position])).sort((a, b) => b - a).slice(0, 3)
      return { code: role.code, score: best.reduce((sum, value) => sum + value, 0) / best.length }
    })
    .sort((left, right) => right.score - left.score)
  const adjusted = topRanked.map((entry) => ({ code: entry.code, score: entry.score - hub.get(entry.code) })).sort((a, b) => b.score - a.score)
  const show = (ranked) => ranked.slice(0, 5).map((entry) => `${titleOf.get(entry.code)} (${entry.code}) ${entry.score.toFixed(2)}`).join(' | ')
  console.log(`\n${cvId} ${answer.person} [${answer.field}] skills: ${answer.skills.join(', ')}`)
  console.log(`  mean: ${show(meanRanked)}`)
  console.log(`  top3: ${show(topRanked)}`)
  console.log(`  hub-adjusted: ${show(adjusted)}`)
}

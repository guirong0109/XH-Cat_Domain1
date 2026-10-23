// Sanity report for the eMASCO vectors. Run: node scripts/check-emasco-embeddings.mjs
// Writes testing/results/emasco_embed_check.md. It shows the vectors work; it does not measure matching accuracy.
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { unpackVectors } from './lib/emascoEmbed.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE = path.join(ROOT, 'data', 'cache', 'emasco')
const REPORT_PATH = path.join(ROOT, 'testing', 'results', 'emasco_embed_check.md')
const EVERY_NTH_ROLE = 60
const RANDOM_PAIRS = 200
const TOP_RANK = 5

const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0)

function normalise(vector) {
  const length = Math.sqrt(dot(vector, vector))
  return vector.map((value) => value / length)
}

function meanVector(vectors) {
  const sum = new Array(vectors[0].length).fill(0)
  for (const vector of vectors) vector.forEach((value, index) => { sum[index] += value })
  return normalise(sum)
}

function seededRandom(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

async function readJson(name) {
  return JSON.parse(await readFile(path.join(CACHE, name), 'utf8'))
}

async function main() {
  const started = Date.now()
  const meta = await readJson('meta.json')
  const skillIds = await readJson('skills_ids.json')
  const roleIds = await readJson('roles_ids.json')
  const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
  const skillVectors = unpackVectors(await readFile(path.join(CACHE, 'skills.f32')), meta.dimension)
  const roleVectors = unpackVectors(await readFile(path.join(CACHE, 'roles.f32')), meta.dimension)
  if (skillVectors.length !== skillIds.length || roleVectors.length !== roleIds.length) {
    throw new Error('Row counts and id counts do not match')
  }

  // Skill rows per role code, from the skills index.
  const rowsByRole = new Map()
  occupations.skills.forEach((skill, row) => {
    for (const code of skill.roles) {
      if (!rowsByRole.has(code)) rowsByRole.set(code, [])
      rowsByRole.get(code).push(row)
    }
  })

  const checked = []
  occupations.roles.forEach((role, index) => {
    if (index % EVERY_NTH_ROLE !== 0) return
    const profile = meanVector(rowsByRole.get(role.code).map((row) => skillVectors[row]))
    const scores = roleVectors.map((vector) => dot(profile, vector))
    const ownScore = scores[roleIds.indexOf(role.code)]
    const rank = 1 + scores.filter((score) => score > ownScore).length
    checked.push({ code: role.code, title: role.title, rank })
  })
  const inTop = checked.filter((entry) => entry.rank <= TOP_RANK)
  const misses = checked.filter((entry) => entry.rank > TOP_RANK)

  const random = seededRandom(20261023)
  const pairScores = []
  for (let count = 0; count < RANDOM_PAIRS; count += 1) {
    const first = Math.floor(random() * skillVectors.length)
    const second = Math.floor(random() * skillVectors.length)
    if (first !== second) pairScores.push(dot(skillVectors[first], skillVectors[second]))
  }
  pairScores.sort((left, right) => left - right)
  const median = pairScores[Math.floor(pairScores.length / 2)]

  let malayLine = 'Not checked (no local model found).'
  const config = chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models'))
  if (config) {
    const [malay, english] = await createEmbedder(config).embed(['perakaunan', 'accounting'])
    const score = dot(malay, english)
    malayLine = `"perakaunan" vs "accounting": ${score.toFixed(3)}. Median of ${pairScores.length} random skill pairs: ${median.toFixed(3)}. ` +
      (score > median ? 'The Malay pair scores above the median.' : 'The Malay pair does NOT score above the median.')
  }

  const lines = [
    '# eMASCO embeddings: sanity check',
    '',
    `Built ${meta.builtAt}. Model ${meta.modelId}, dimension ${meta.dimension}.`,
    `Rows: ${skillVectors.length} skills, ${roleVectors.length} roles (ids match the rows).`,
    '',
    '## Role self-check',
    `For every ${EVERY_NTH_ROLE}th role with skills (${checked.length} roles), the mean of the role's own skill vectors was compared with all ${roleVectors.length} role vectors.`,
    `The role itself ranked in the top ${TOP_RANK} for ${inTop.length} of ${checked.length} roles.`,
    ...(misses.length ? ['Not in the top ' + TOP_RANK + ':', ...misses.map((entry) => `- ${entry.code} ${entry.title}: rank ${entry.rank}`)] : []),
    '',
    '## Malay',
    malayLine,
    '',
    'These checks show the vectors work. They do not measure how accurate CV matching is.',
    `Check took ${((Date.now() - started) / 1000).toFixed(0)} s.`,
    ''
  ]
  await mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, lines.join('\n'))
  console.log(lines.join('\n'))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

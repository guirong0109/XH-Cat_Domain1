// Matches every eMASCO task to its 3 closest O*NET tasks (Anthropic Economic Index) by cosine similarity.
// Run: node scripts/match-tasks.mjs            -> data/cache/exposure/matches.json
//      node scripts/match-tasks.mjs --sample   -> also writes testing/results/task_match_sample.csv for judging
// Needs the vectors from scripts/embed-tasks.mjs.
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { topMatches } from './lib/taskMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIR = path.join(ROOT, 'data', 'cache', 'exposure')
const SAMPLE_SIZE = 80
const SCORED_SHARE = 40 // of the sample: tasks of our 20 scored roles; the rest from other eMASCO roles

const readFloats = async (name) => {
  const buffer = await readFile(path.join(DIR, name))
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

// Small seeded generator so the judged sample is the same every run.
function random(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function pick(items, count, next) {
  const pool = [...items]
  const chosen = []
  while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(next() * pool.length), 1)[0])
  return chosen
}

const csvField = (value) => `"${String(value).replaceAll('"', '""')}"`

async function main() {
  const meta = JSON.parse(await readFile(path.join(DIR, 'meta.json'), 'utf8'))
  const onet = JSON.parse(await readFile(path.join(DIR, 'onet.json'), 'utf8'))
  const emasco = JSON.parse(await readFile(path.join(DIR, 'emasco.json'), 'utf8'))
  const onetVectors = await readFloats('onet.f32')
  const emascoVectors = await readFloats('emasco.f32')
  const dimension = meta.dimension
  const started = Date.now()
  const matches = emasco.map((item, row) => {
    const best = topMatches(emascoVectors, row, onetVectors, onet.length, dimension, 3)
    if (row % 1000 === 0) console.log(`${row} of ${emasco.length} (${Math.round((Date.now() - started) / 1000)} s)`)
    return best.map((hit) => ({ onet: hit.row, score: Math.round(hit.score * 10000) / 10000 }))
  })
  const out = path.join(DIR, 'matches.json')
  await writeFile(`${out}.tmp`, JSON.stringify({ builtAt: new Date().toISOString(), matches }))
  await rename(`${out}.tmp`, out)
  console.log(`Wrote ${matches.length} matches`)

  if (process.argv.includes('--sample')) {
    const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
    const scored = new Set((JSON.parse(await readFile(path.join(ROOT, 'data', 'roles.json'), 'utf8'))).map((role) => role.code))
    void occupations
    const next = random(20261024)
    const indexes = emasco.map((_, row) => row)
    const fromScored = indexes.filter((row) => emasco[row].codes.some((code) => scored.has(code)))
    const fromOthers = indexes.filter((row) => !emasco[row].codes.some((code) => scored.has(code)))
    const chosen = [...pick(fromScored, SCORED_SHARE, next), ...pick(fromOthers, SAMPLE_SIZE - SCORED_SHARE, next)]
    const lines = ['id,emasco_task,onet_task,score,penetration,judgement']
    chosen.forEach((row, index) => {
      const top = matches[row][0]
      lines.push([index + 1, csvField(emasco[row].text), csvField(onet[top.onet].task), top.score, onet[top.onet].penetration, ''].join(','))
    })
    await writeFile(path.join(ROOT, 'testing', 'results', 'task_match_sample.csv'), `${lines.join('\n')}\n`)
    console.log(`Wrote the ${chosen.length}-row sample to judge`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

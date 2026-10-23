// Chooses the eMASCO match cutoff from judged CV lines.
//   node scripts/eval-emasco-cv.mjs            writes testing/results/emasco_match_review.csv (judge column empty)
//   node scripts/eval-emasco-cv.mjs --report   reads the judged CSV, prints precision per cutoff and the chosen cutoff
// Uses the 12 made-up CVs in testing/cv_test_set/. For each CV line only its best eMASCO skill is listed.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { loadEmascoIndex } from '../server/emascoMatch.js'
import { splitCvLines } from '../server/cvMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHEET_PATH = path.join(ROOT, 'testing', 'results', 'emasco_match_review.csv')
const SHEET_MIN_SCORE = 0.55
const TARGET_PRECISION = 0.9
const COLUMNS = ['cv', 'set', 'line', 'skill', 'score', 'judge']

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let position = 0; position < text.length; position += 1) {
    const character = text[position]
    if (inQuotes) {
      if (character === '"' && text[position + 1] === '"') { field += '"'; position += 1 }
      else if (character === '"') inQuotes = false
      else field += character
    } else if (character === '"') inQuotes = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += character
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  return rows.slice(1).map((values) => Object.fromEntries(COLUMNS.map((name, column) => [name, values[column] ?? ''])))
}

async function writeSheet() {
  const config = chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models'))
  if (!config) throw new Error('No local model found (models/ or MODELS_DIR).')
  const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
  const index = await loadEmascoIndex({ cacheDirectory: path.join(ROOT, 'data', 'cache', 'emasco'), occupations })
  const embedder = createEmbedder(config)
  const answers = JSON.parse(await readFile(path.join(ROOT, 'testing', 'cv_test_set', 'answers.json'), 'utf8'))
  const rows = [COLUMNS.join(',')]
  let count = 0
  for (const [cvId, answer] of Object.entries(answers)) {
    const lines = splitCvLines(await readFile(path.join(ROOT, 'testing', 'cv_test_set', `${cvId}.txt`), 'utf8'))
    const lineVectors = await embedder.embed(lines)
    lineVectors.forEach((lineVector, lineNumber) => {
      let best = -Infinity
      let bestRow = -1
      for (let row = 0; row < index.skillCount; row += 1) {
        let sum = 0
        const offset = row * index.dimension
        for (let position = 0; position < index.dimension; position += 1) sum += index.skillVectors[offset + position] * lineVector[position]
        if (sum > best) { best = sum; bestRow = row }
      }
      if (best < SHEET_MIN_SCORE) return
      rows.push([cvId, answer.set, quote(lines[lineNumber]), quote(occupations.skills[bestRow].text), best.toFixed(4), ''].join(','))
      count += 1
    })
  }
  await writeFile(SHEET_PATH, rows.join('\n') + '\n')
  console.log(`Wrote ${count} rows to ${SHEET_PATH}`)
}

function precisionAt(rows, cutoff) {
  const picked = rows.filter((row) => Number(row.score) >= cutoff)
  const right = picked.filter((row) => row.judge === 'right').length
  return { picked: picked.length, right, precision: picked.length ? right / picked.length : null }
}

async function report() {
  const judged = parseCsv(await readFile(SHEET_PATH, 'utf8')).filter((row) => row.judge === 'right' || row.judge === 'wrong')
  const tune = judged.filter((row) => row.set === 'tune')
  const holdout = judged.filter((row) => row.set === 'holdout')
  console.log(`Judged rows: ${judged.length} (tuning ${tune.length}, held-out ${holdout.length})`)
  console.log('cutoff | tuning picked, right, precision | held-out picked, right, precision')
  let chosen = null
  for (let cutoff = 0.55; cutoff <= 0.9001; cutoff += 0.01) {
    const tuneResult = precisionAt(tune, cutoff)
    const holdResult = precisionAt(holdout, cutoff)
    const format = (result) => `${result.picked}, ${result.right}, ${result.precision === null ? '-' : result.precision.toFixed(2)}`
    console.log(`${cutoff.toFixed(2)} | ${format(tuneResult)} | ${format(holdResult)}`)
    if (chosen === null && tuneResult.picked > 0 && tuneResult.precision >= TARGET_PRECISION) chosen = Number(cutoff.toFixed(2))
  }
  console.log(chosen === null
    ? `No cutoff reaches precision ${TARGET_PRECISION} on the tuning set.`
    : `Chosen cutoff (lowest with tuning precision >= ${TARGET_PRECISION}): ${chosen}`)
}

(process.argv.includes('--report') ? report() : writeSheet()).catch((error) => {
  console.error(error.message)
  process.exit(1)
})

// Compare ranking variants on the 12 made-up CVs with the draft family key (testing/cv_test_set/families.json).
// Run: node scripts/eval-family.mjs      Metric: share of the top 5 roles whose code is in the CV's family list.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { splitCvLines } from '../server/cvMatch.js'
import { isUsefulLine, loadEmascoIndex, skillScores, profileRoleScores, softRoleScores, lineRoleScores, zScores } from '../server/emascoMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
const index = await loadEmascoIndex({ cacheDirectory: path.join(ROOT, 'data', 'cache', 'emasco'), occupations })
const embedder = createEmbedder(chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models')))
const families = JSON.parse(await readFile(path.join(ROOT, 'testing', 'cv_test_set', 'families.json'), 'utf8'))

// Headings, hobbies and referees are not skills.
const usefulLine = isUsefulLine

const inFamily = (code, family) => family.some((entry) => code === entry || (entry.length === 4 && code.startsWith(`${entry}-`)))
const topCodes = (values, count = 5) =>
  Array.from(values, (value, position) => ({ position, value })).sort((a, b) => b.value - a.value).slice(0, count)
    .map((item) => index.roles[item.position].code)

const variants = {
  'profile k=3 (built)': ({ vectors }) => profileRoleScores(vectors, index, 3),
  'profile k=1': ({ vectors }) => profileRoleScores(vectors, index, 1),
  'profile k=5': ({ vectors }) => profileRoleScores(vectors, index, 5),
  'profile k=8': ({ vectors }) => profileRoleScores(vectors, index, 8),
  'profile k=3, filtered': ({ filtered }) => profileRoleScores(filtered, index, 3),
  'profile k=5, filtered': ({ filtered }) => profileRoleScores(filtered, index, 5),
  'profile k=8, filtered': ({ filtered }) => profileRoleScores(filtered, index, 8),
  'line-centric k=3, filtered': ({ filtered }) => lineRoleScores(filtered, index, 3),
  'line-centric k=5, filtered': ({ filtered }) => lineRoleScores(filtered, index, 5),
  'line-centric k=8, filtered': ({ filtered }) => lineRoleScores(filtered, index, 8),
  'profile5 + line5, filtered': ({ filtered }) => {
    const left = zScores(profileRoleScores(filtered, index, 5))
    const right = zScores(lineRoleScores(filtered, index, 5))
    return left.map((value, position) => value + right[position])
  },
  'soft-idf f0.55, filtered': ({ filteredScores }) => softRoleScores(filteredScores, index, 0.55),
  'hybrid k=5 + soft f0.55, filtered': ({ filtered, filteredScores }) => {
    const left = zScores(profileRoleScores(filtered, index, 5))
    const right = zScores(softRoleScores(filteredScores, index, 0.55))
    return left.map((value, position) => value + right[position])
  },
  'hybrid k=5 + 0.5 soft f0.55, filtered': ({ filtered, filteredScores }) => {
    const left = zScores(profileRoleScores(filtered, index, 5))
    const right = zScores(softRoleScores(filteredScores, index, 0.55))
    return left.map((value, position) => value + 0.5 * right[position])
  }
}

const totals = Object.fromEntries(Object.keys(variants).map((name) => [name, { hits: 0, perCv: [] }]))
for (const cvId of Object.keys(families)) {
  if (cvId.startsWith('_')) continue
  const lines = splitCvLines(await readFile(path.join(ROOT, 'testing', 'cv_test_set', `${cvId}.txt`), 'utf8'))
  const vectors = await embedder.embed(lines)
  const keep = lines.map(usefulLine)
  const filtered = vectors.filter((vector, position) => keep[position])
  const filteredScores = skillScores(filtered, index).scores
  for (const [name, method] of Object.entries(variants)) {
    const codes = topCodes(method({ vectors, filtered, filteredScores }))
    const hits = codes.filter((code) => inFamily(code, families[cvId])).length
    totals[name].hits += hits
    totals[name].perCv.push(hits)
  }
}
console.log('variant | in-family roles in the top 5, of 60 | per CV cv01..cv12')
for (const [name, total] of Object.entries(totals)) console.log(`${name.padEnd(38)} ${String(total.hits).padStart(2)}/60   ${total.perCv.join(' ')}`)

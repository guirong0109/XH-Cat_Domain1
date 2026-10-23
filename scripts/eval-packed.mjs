// Packed (int8) vs float32 vectors on the 12 made-up CVs: top-5 overlap and in-family count (draft key families.json).
// Run: node scripts/eval-packed.mjs
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { splitCvLines } from '../server/cvMatch.js'
import { isUsefulLine, loadEmascoIndex, loadPackedIndex, rankByProfile } from '../server/emascoMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
const floatIndex = await loadEmascoIndex({ cacheDirectory: path.join(ROOT, 'data', 'cache', 'emasco'), occupations })
const packedIndex = await loadPackedIndex({ directory: path.join(ROOT, 'data', 'emasco', 'vectors'), occupations })
const embedder = createEmbedder(chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models')))
const families = JSON.parse(await readFile(path.join(ROOT, 'testing', 'cv_test_set', 'families.json'), 'utf8'))
const inFamily = (code, family) => family.some((entry) => code === entry || (entry.length === 4 && code.startsWith(`${entry}-`)))

let overlap = 0
let floatHits = 0
let packedHits = 0
let same = 0
for (const cvId of Object.keys(families)) {
  if (cvId.startsWith('_')) continue
  const cvLines = splitCvLines(await readFile(path.join(ROOT, 'testing', 'cv_test_set', `${cvId}.txt`), 'utf8')).filter(isUsefulLine)
  const lineVectors = await embedder.embed(cvLines)
  const floatCodes = rankByProfile({ lineVectors, cvLines, index: floatIndex }).roles.map((role) => role.code)
  const packedCodes = rankByProfile({ lineVectors, cvLines, index: packedIndex }).roles.map((role) => role.code)
  overlap += floatCodes.filter((code) => packedCodes.includes(code)).length
  floatHits += floatCodes.filter((code) => inFamily(code, families[cvId])).length
  packedHits += packedCodes.filter((code) => inFamily(code, families[cvId])).length
  if (floatCodes.join() === packedCodes.join()) same += 1
}
console.log(`Top-5 roles shared by float and packed: ${overlap} of 60. Identical top-5 lists: ${same} of 12.`)
console.log(`In-family top-5 roles (draft key): float ${floatHits} of 60, packed ${packedHits} of 60.`)

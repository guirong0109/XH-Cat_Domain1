// Experiment: top-1 similarity of the role-vector ranking for the 12 made-up CVs and some non-CV texts.
// Run: node scripts/try-confidence.mjs [extra.txt ...]   (used to choose LOW_CONFIDENCE_BELOW)
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { loadEmascoIndex, matchCvByProfile } from '../server/emascoMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
const index = await loadEmascoIndex({ cacheDirectory: path.join(ROOT, 'data', 'cache', 'emasco'), occupations })
const embedder = createEmbedder(chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models')))
const files = [
  ...Array.from({ length: 12 }, (item, number) => path.join(ROOT, 'testing', 'cv_test_set', `cv${String(number + 1).padStart(2, '0')}.txt`)),
  ...process.argv.slice(2)
]
for (const file of files) {
  const result = await matchCvByProfile({ text: await readFile(file, 'utf8'), embedder, index })
  const top = result.roles[0]
  console.log(`${path.basename(file).padEnd(10)} ${result.status === 'ok' ? `top1 ${top.similarity} ${top.title} (${result.confidence})` : result.status}`)
}

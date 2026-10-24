// Raw bge-m3 cosine between every pair of catalogue skills -> data/skill_similarity.json.
// Informational only: the Skill Match credit never uses this number (see docs/skill-match.md).
// Needs data/cache/skill_vectors.json (written by the server's CV step) made from the same 38 labels as data/skills.json.
import { readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const skills = JSON.parse(await readFile(path.join(root, 'data', 'skills.json'), 'utf8'))
const cache = JSON.parse(await readFile(path.join(root, 'data', 'cache', 'skill_vectors.json'), 'utf8'))

const labels = skills.labels.map((item) => item.label)
if (cache.mode !== 'label' || JSON.stringify(cache.labels) !== JSON.stringify(labels)) {
  throw new Error('data/cache/skill_vectors.json does not match data/skills.json (label mode). Run the CV step once to rebuild it.')
}
const vectors = cache.vectorSets.map((set) => set[0])
const norm = (vector) => Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
const cosine = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0) / (norm(a) * norm(b))

const matrix = vectors.map((a) => vectors.map((b) => Math.round(cosine(a, b) * 10000) / 10000))
const output = {
  source: 'bge-m3 cosine between catalogue skill names (data/cache/skill_vectors.json, label mode)',
  modelId: cache.modelId,
  vectorHash: cache.hash,
  builtAt: new Date().toISOString(),
  note: 'Raw similarity for explanation only. It is not a competence score and is never used as credit.',
  labels,
  matrix,
}
const target = path.join(root, 'data', 'skill_similarity.json')
await writeFile(`${target}.tmp`, `${JSON.stringify(output)}\n`)
await rename(`${target}.tmp`, target)
console.log(`wrote data/skill_similarity.json (${labels.length} x ${labels.length}, ${cache.modelId})`)

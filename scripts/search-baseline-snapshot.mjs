// Freezes what the hybrid skill search returns now, with semantic scores, so later changes can be compared.
// node scripts/search-baseline-snapshot.mjs <out.json> "query" ...
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadPackedIndex } from '../server/emascoMatch.js'
import { createEmbedder } from '../server/embed.js'
import { buildConcepts, createHybridSearch } from '../server/hybridSearch.js'

const [out, ...queries] = process.argv.slice(2)
const dir = path.resolve('data')
const occupations = JSON.parse(await readFile(path.join(dir, 'emasco', 'occupations.json'), 'utf8'))
const index = await loadPackedIndex({ directory: path.join(dir, 'emasco', 'vectors'), occupations })
const concepts = buildConcepts({
  teamSkills: JSON.parse(await readFile(path.join(dir, 'team', 'skill_labels.json'), 'utf8')),
  aliasFile: JSON.parse(await readFile(path.join(dir, 'team', 'skill_aliases.json'), 'utf8'))
})
const embedder = createEmbedder({ modelsDir: path.resolve('models') })
await embedder.warmUp()
const S = occupations.skills
const on = createHybridSearch({ skills: S, index, embedder, concepts })
const off = createHybridSearch({ skills: S, index, embedder: null, concepts })
const score = async (q) => { const [v] = await embedder.embed([q]); const D = index.dimension; const s = new Map()
  for (let r = 0; r < index.skillCount; r++) { let d = 0; const o = r * D; for (let k = 0; k < D; k++) d += v[k] * index.skillVectors[o + k]; s.set(S[r].id, d) } return s }
const result = { takenAt: new Date().toISOString(), note: 'frozen before the bilingual concept layer; semantic = cosine of query vs skill vector', queries: {} }
for (const q of queries) {
  const scores = await score(q)
  const t = performance.now(); const a = await on(q, 10); const ms = performance.now() - t
  const t2 = performance.now(); const b = await off(q, 10); const ms2 = performance.now() - t2
  result.queries[q] = { modelOn: { ms: Math.round(ms), status: a.status, methods: a.methods, results: a.skills.map((s, i) => ({ rank: i + 1, id: s.id, text: s.text, foundBy: s.foundBy, cosine: +scores.get(s.id).toFixed(3) })) },
    modelOff: { ms: Math.round(ms2), status: b.status, methods: b.methods, results: b.skills.map((s, i) => ({ rank: i + 1, id: s.id, text: s.text, foundBy: s.foundBy })) } }
}
await writeFile(out, JSON.stringify(result, null, 2))
console.log('written', out)
process.exit(0)

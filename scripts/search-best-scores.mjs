// Prints the best meaning-search cosine for every query of the labelled set (to see how far nonsense queries are from real ones).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadPackedIndex } from '../server/emascoMatch.js'
import { createEmbedder } from '../server/embed.js'
import { createDenseRanker, buildConcepts, createConceptRanker, expandQuery } from '../server/hybridSearch.js'
const read = async (f) => JSON.parse(await readFile(f, 'utf8'))
const occ = await read('data/emasco/occupations.json')
const index = await loadPackedIndex({ directory: 'data/emasco/vectors', occupations: occ })
const emb = createEmbedder({ modelsDir: path.resolve('models') }); await emb.warmUp()
const concepts = buildConcepts({ teamSkills: await read('data/team/skill_labels.json'), aliasFile: await read('data/team/skill_aliases.json') })
const concept = createConceptRanker(occ.skills, concepts)
const dense = createDenseRanker({ index, embedder: emb, floor: 0 })
const E = await read('testing/skill_search_eval.json')
const rows = []
for (const q of E.queries) {
  const expanded = expandQuery(q.q, concept(q.q).matches)
  const d = await dense.detail(expanded ?? q.q)
  rows.push({ id: q.id, kind: q.kind, none: Boolean(q.expectNone), best: d.best })
}
rows.sort((a, b) => a.best - b.best)
for (const r of rows) console.log(r.best.toFixed(3), r.none ? 'NONE-EXPECTED' : 'positive     ', r.kind.padEnd(15), r.id)
process.exit(0)

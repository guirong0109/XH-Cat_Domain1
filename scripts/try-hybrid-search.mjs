// Tries the hybrid skill search on the real data: node scripts/try-hybrid-search.mjs "perakaunan" "bookkeeping" ...
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadPackedIndex } from '../server/emascoMatch.js'
import { createEmbedder } from '../server/embed.js'
import { buildConcepts, createHybridSearch } from '../server/hybridSearch.js'

const dir = path.resolve('data')
const occupations = JSON.parse(await readFile(path.join(dir, 'emasco', 'occupations.json'), 'utf8'))
const index = await loadPackedIndex({ directory: path.join(dir, 'emasco', 'vectors'), occupations })
const concepts = buildConcepts({
  teamSkills: JSON.parse(await readFile(path.join(dir, 'team', 'skill_labels.json'), 'utf8')),
  aliasFile: JSON.parse(await readFile(path.join(dir, 'team', 'skill_aliases.json'), 'utf8'))
})
const embedder = createEmbedder({ modelsDir: path.resolve(process.env.MODELS_DIR ?? 'models') })
await embedder.warmUp()
const withModel = createHybridSearch({ skills: occupations.skills, index, embedder, concepts })
const without = createHybridSearch({ skills: occupations.skills, index, embedder: null, concepts })
for (const query of process.argv.slice(2)) {
  for (const [name, search] of [['hybrid', withModel], ['no-model', without]]) {
    const t = performance.now()
    const out = await search(query, 5)
    console.log(`\n[${name}] "${query}" ${(performance.now() - t).toFixed(0)} ms methods=${out.methods.join('+')} concepts=${out.concepts.join('|')}`)
    for (const s of out.skills) console.log(`  ${s.foundBy.join(',').padEnd(22)} ${s.text.slice(0, 90)}`)
  }
}
process.exit(0)

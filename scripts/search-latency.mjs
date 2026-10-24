// Latency of the meaning search: model load, first query, warm distinct queries, embedding vs vector scan, and a faster scan variant.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadPackedIndex } from '../server/emascoMatch.js'
import { createEmbedder } from '../server/embed.js'

const occ = JSON.parse(await readFile('data/emasco/occupations.json', 'utf8'))
const index = await loadPackedIndex({ directory: 'data/emasco/vectors', occupations: occ })
const emb = createEmbedder({ modelsDir: path.resolve('models') })
const started = performance.now()
await emb.warmUp()
console.log('model load', (performance.now() - started).toFixed(0), 'ms')
const D = index.dimension
const N = index.skillCount
const V = index.skillVectors
const scanPlain = (v) => {
  const s = new Float64Array(N)
  for (let r = 0; r < N; r++) { let d = 0; const o = r * D; for (let k = 0; k < D; k++) d += v[k] * V[o + k]; s[r] = d }
  return s
}
const scanFast = (v) => {
  const s = new Float32Array(N)
  for (let r = 0; r < N; r++) {
    let a = 0; let b = 0; let c = 0; let e = 0
    const o = r * D
    for (let k = 0; k < D; k += 4) { a += v[k] * V[o + k]; b += v[k + 1] * V[o + k + 1]; c += v[k + 2] * V[o + k + 2]; e += v[k + 3] * V[o + k + 3] }
    s[r] = a + b + c + e
  }
  return s
}
const queries = ['perakaunan', 'jaga pesakit', 'welding', 'customer service', 'pangkalan data', 'time management', 'kerja berpasukan', 'electrical wiring', 'memasak', 'marketing strategy']
const rows = []
for (const q of queries) {
  let t = performance.now(); const [v] = await emb.embed([q]); const embedMs = performance.now() - t
  const f32 = Float32Array.from(v)
  t = performance.now(); const s1 = scanPlain(v); const scanMs = performance.now() - t
  t = performance.now(); const s2 = scanFast(f32); const fastMs = performance.now() - t
  let diff = 0
  for (let i = 0; i < N; i += 97) diff = Math.max(diff, Math.abs(s1[i] - s2[i]))
  rows.push({ q, embedMs, scanMs, fastMs, diff })
}
console.log('query'.padEnd(20), 'embed ms  scan ms  unrolled ms  max score diff')
rows.forEach((r, i) => console.log(((i === 0 ? '(1st) ' : '') + r.q).padEnd(20), r.embedMs.toFixed(0).padStart(7), r.scanMs.toFixed(0).padStart(8), r.fastMs.toFixed(0).padStart(11), r.diff.toExponential(1).padStart(15)))
const warm = rows.slice(1)
const mean = (key) => warm.reduce((x, r) => x + r[key], 0) / warm.length
console.log(`warm mean: embed ${mean('embedMs').toFixed(0)} ms, scan ${mean('scanMs').toFixed(0)} ms, unrolled scan ${mean('fastMs').toFixed(0)} ms`)
process.exit(0)

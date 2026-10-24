// Compares ways to give "equivalence credit" on the 30 human-labelled skill pairs in testing/skill_pair_test_set.csv
// (expected: similar = same skill, related = partial transfer, different = unrelated; the labels were written by the team).
// Raw embedding scores come from testing/results/details.csv (bge-m3 column, made by pipeline/compare_embeddings.py).
// The reviewed-similar list applies only to catalogue skill names, so it cannot be scored on these free-text pairs.
// Run: node scripts/eval-skill-equivalence.mjs   -> testing/results/skill_equivalence_eval.md
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rows = (await readFile(path.join(root, 'testing', 'results', 'details.csv'), 'utf8')).trim().split(/\r?\n/)
const header = rows.shift().split(',')
const column = header.indexOf('BAAI/bge-m3')
const pairs = rows.map((line) => {
  const cells = line.split(',')
  return { a: cells[1], b: cells[2], expected: cells[4], cosine: Number(cells[column]) }
})

const norm = (text) => text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const methods = [
  { name: 'Exact keyword (same words)', says: (p) => norm(p.a) === norm(p.b) },
  ...[0.6, 0.7, 0.75, 0.8].map((t) => ({ name: `Raw bge-m3 cosine >= ${t}`, says: (p) => p.cosine >= t })),
]
const count = (kind) => pairs.filter((p) => p.expected === kind).length
const skillsFile = JSON.parse(await readFile(path.join(root, 'data', 'skills.json'), 'utf8'))
const similarity = JSON.parse(await readFile(path.join(root, 'data', 'skill_similarity.json'), 'utf8'))
const reviewed = []
const others = []
similarity.labels.forEach((a, i) => similarity.labels.forEach((b, j) => {
  if (i === j) return
  ;((skillsFile.similar[a] ?? []).includes(b) ? reviewed : others).push(similarity.matrix[i][j])
}))
const range = (values) => `${values.length} pairs, min ${Math.min(...values).toFixed(2)}, mean ${(values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)}, max ${Math.max(...values).toFixed(2)}`
const above = (values, t) => values.filter((v) => v >= t).length
const catalogueLine = `Team-reviewed similar pairs: ${range(reviewed)}. All other pairs: ${range(others)}. At cosine >= 0.70, ${above(reviewed, 0.7)} of ${reviewed.length} reviewed pairs pass and ${above(others, 0.7)} unreviewed pairs also pass.`
const lines = [
  '# Skill equivalence: what each method says on 30 human-labelled pairs',
  '',
  `Pairs: ${count('similar')} similar, ${count('related')} related, ${count('different')} different. A method "says equivalent" when it would give full or near-full credit.`,
  '',
  '| Method | Similar found (of ' + count('similar') + ') | Related wrongly equivalent (of ' + count('related') + ') | Different wrongly equivalent (of ' + count('different') + ') |',
  '|---|---|---|---|',
]
for (const method of methods) {
  const hit = (kind) => pairs.filter((p) => p.expected === kind && method.says(p)).length
  lines.push(`| ${method.name} | ${hit('similar')} | ${hit('related')} | ${hit('different')} |`)
}
const stat = (kind) => {
  const values = pairs.filter((p) => p.expected === kind).map((p) => p.cosine)
  return `min ${Math.min(...values).toFixed(2)}, mean ${(values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)}, max ${Math.max(...values).toFixed(2)}`
}
lines.push(
  '',
  '## bge-m3 cosine by human label',
  '',
  `- similar: ${stat('similar')}`,
  `- related: ${stat('related')}`,
  `- different: ${stat('different')}`,
  '',
  '## On the real catalogue (38 skills)',
  '',
  catalogueLine,
  '',
  '## Reading',
  '',
  '- On these 30 pairs a cutoff near 0.70 looks usable (it finds most similar pairs with no unrelated pair passing), but a low cutoff (0.60) lets word-trap pairs through, and the scores of the three labels overlap.',
  '- On the real catalogue the overlap is worse: skill pairs the team reviewed as similar and pairs nobody linked have cosines in the same range, so a cosine cannot say which is which.',
  '- Exact keyword matching has no false positives here but finds none of the reworded same-skill pairs.',
  '- So the Skill Match gives credit only for identical catalogue skills (1.0) and team-reviewed similar skills (0.5). The cosine is shown for explanation only, and can be promoted to credit later only after a larger blind review.',
  '- Limits: 30 pairs written by the team (not blind), free-text names for the pair set, one model. This supports "do not use raw cosine as credit yet"; it does not prove the reviewed list is complete.',
  '',
  '## Pairs where the cosine and the human label disagree most',
  '',
)
const hard = [...pairs].filter((p) => p.expected === 'different').sort((x, y) => y.cosine - x.cosine).slice(0, 4)
const weak = [...pairs].filter((p) => p.expected === 'similar').sort((x, y) => x.cosine - y.cosine).slice(0, 4)
for (const p of hard) lines.push(`- different but high (${p.cosine.toFixed(2)}): "${p.a}" vs "${p.b}"`)
for (const p of weak) lines.push(`- similar but low (${p.cosine.toFixed(2)}): "${p.a}" vs "${p.b}"`)
await writeFile(path.join(root, 'testing', 'results', 'skill_equivalence_eval.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))

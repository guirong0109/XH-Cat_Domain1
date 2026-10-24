// Compares skill-search configurations on testing/skill_search_eval.json (same queries, same judgments).
// node scripts/eval-skill-search.mjs [--out testing/results/skill_search_eval.json] [--configs 'name one|name two']
// Judgments come from the cue patterns in the data file (written before any ranking was looked at), never from the system's own output.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadPackedIndex } from '../server/emascoMatch.js'
import { createEmbedder } from '../server/embed.js'
import { buildConcepts, createHybridSearch } from '../server/hybridSearch.js'

const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const dir = path.resolve('data')
const read = async (file) => JSON.parse(await readFile(file, 'utf8'))
const occupations = await read(path.join(dir, 'emasco', 'occupations.json'))
const index = await loadPackedIndex({ directory: path.join(dir, 'emasco', 'vectors'), occupations })
const teamSkills = await read(path.join(dir, 'team', 'skill_labels.json'))
const aliasFile = await read(path.join(dir, 'team', 'skill_aliases.json'))
const evalSet = await read('testing/skill_search_eval.json')
const embedder = createEmbedder({ modelsDir: path.resolve('models') })
await embedder.warmUp()
const S = occupations.skills

const withAliases = buildConcepts({ teamSkills, aliasFile })
const teamOnly = buildConcepts({ teamSkills })
const make = (options) => createHybridSearch({ skills: S, index, embedder, ...options })
const OLD = { floor: 0.5 } // the first version's floor
const V1 = { bm25Coverage: false } // the first version's BM25 (any one shared word is enough)
const CONFIGS = {
  'baseline (v1)': () => make({ concepts: teamOnly, aliasSemantic: 'off', semantic: OLD, ...V1 }),
  '+ aliases, typed query': () => make({ concepts: withAliases, aliasSemantic: 'off', semantic: OLD, ...V1 }),
  '+ aliases, both queries': () => make({ concepts: withAliases, aliasSemantic: 'both', semantic: OLD, ...V1 }),
  '+ aliases, expanded query': () => make({ concepts: withAliases, aliasSemantic: 'replace', semantic: OLD, ...V1 }),
  '+ floor 0.55': () => make({ concepts: withAliases, ...V1 }),
  'FINAL (+ BM25 coverage rule)': () => make({ concepts: withAliases }),
  'final, band 0.12': () => make({ concepts: withAliases, semantic: { band: 0.12 } }),
  'baseline (v1), model off': () => createHybridSearch({ skills: S, index, embedder: null, concepts: teamOnly, ...V1 }),
  'FINAL, model off': () => createHybridSearch({ skills: S, index, embedder: null, concepts: withAliases })
}
const chosen = flag('--configs') ? flag('--configs').split('|') : Object.keys(CONFIGS)

const gradeOf = (query) => {
  const relevant = query.relevant ? new RegExp(query.relevant, 'i') : null
  const related = query.related ? new RegExp(query.related, 'i') : null
  return (text) => (relevant?.test(text) ? 2 : related?.test(text) ? 1 : 0)
}
function totals(query) {
  const grade = gradeOf(query)
  let two = 0
  let one = 0
  for (const skill of S) {
    const g = grade(skill.text)
    if (g === 2) two += 1
    else if (g === 1) one += 1
  }
  return { two, one }
}
const dcg = (grades) => grades.reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0)

async function runConfig(name) {
  const search = CONFIGS[name]()
  await search('warm up query') // load/caches so the first query is not counted as cold
  const rows = []
  for (const query of evalSet.queries) {
    const started = performance.now()
    const out = await search(query.q, 10)
    const ms = performance.now() - started
    const grade = gradeOf(query)
    const grades = out.skills.map((skill) => (query.expectNone ? 0 : grade(skill.text)))
    const { two, one } = query.expectNone ? { two: 0, one: 0 } : totals(query)
    const ideal = [...Array(Math.min(10, two)).fill(2), ...Array(Math.max(0, Math.min(10 - two, one))).fill(1)]
    rows.push({
      id: query.id, split: query.split, kind: query.kind, expectNone: Boolean(query.expectNone), ms,
      returned: out.skills.length,
      p5: query.expectNone ? null : grades.slice(0, 5).filter((g) => g === 2).length / 5,
      r10: query.expectNone || two === 0 ? null : grades.filter((g) => g === 2).length / Math.min(10, two),
      ndcg: query.expectNone || ideal.length === 0 ? null : dcg(grades) / dcg(ideal),
      falsePositives: query.expectNone ? out.skills.length : grades.filter((g) => g === 0).length,
      covered: query.expectNone ? null : grades.slice(0, 5).some((g) => g === 2),
      top: out.skills.slice(0, 5).map((skill) => `${skill.text.slice(0, 60)} [${skill.foundBy.join(',')}${skill.semantic ? ` ${skill.semantic}` : ''}]`)
    })
  }
  const pairs = []
  for (const pair of evalSet.pairs) {
    const out = await search(pair.q, 20)
    const found = out.skills.some((skill) => skill.text === pair.skill)
    pairs.push({ q: pair.q, skill: pair.skill, expected: pair.relevant, found, correct: found === pair.relevant })
  }
  return { rows, pairs }
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
function summarise(rows, pairs, select = () => true) {
  const subset = rows.filter(select)
  const positive = subset.filter((r) => !r.expectNone)
  const none = subset.filter((r) => r.expectNone)
  const returned = positive.reduce((a, r) => a + r.returned, 0)
  const bad = positive.reduce((a, r) => a + r.falsePositives, 0)
  return {
    n: subset.length,
    p5: mean(positive.map((r) => r.p5)),
    r10: mean(positive.map((r) => r.r10).filter((v) => v !== null)),
    ndcg: mean(positive.map((r) => r.ndcg).filter((v) => v !== null)),
    fpRate: returned ? bad / returned : null,
    noneWrong: none.length ? none.filter((r) => r.returned > 0).length / none.length : null,
    coverage: mean(positive.map((r) => (r.covered ? 1 : 0))),
    ms: mean(subset.map((r) => r.ms)),
    pairAcc: pairs && pairs.length ? pairs.filter((p) => p.correct).length / pairs.length : null
  }
}
const fmt = (v, d = 2) => (v === null || v === undefined ? '  -  ' : v.toFixed(d))

const results = {}
for (const name of chosen) results[name] = await runConfig(name)

console.log(`\nQueries: ${evalSet.queries.length} (dev ${evalSet.queries.filter((q) => q.split === 'dev').length}, test ${evalSet.queries.filter((q) => q.split === 'test').length}); pairs: ${evalSet.pairs.length}`)
for (const [label, select] of [['ALL', () => true], ['DEV', (r) => r.split === 'dev'], ['TEST', (r) => r.split === 'test'], ['MALAY/cross-language', (r) => r.kind === 'cross-language' || r.kind === 'synonym'], ['ENGLISH exact', (r) => r.kind === 'exact'], ['UNALIASED Malay (no verified alias; alias layer cannot help)', (r) => r.id.startsWith('ms-unaliased') || r.id === 'amb-keselamatan'], ['TEST2 (new, unaliased)', (r) => r.split === 'test2']]) {
  console.log(`\n${label}`)
  console.log('config'.padEnd(30), 'P@5   R@10  NDCG  FPrate noneWrong cover  ms     pairs')
  for (const name of chosen) {
    const s = summarise(results[name].rows, label === 'ALL' ? results[name].pairs : null, select)
    console.log(name.padEnd(30), fmt(s.p5), fmt(s.r10), fmt(s.ndcg), fmt(s.fpRate), '  ', fmt(s.noneWrong), '    ', fmt(s.coverage), fmt(s.ms, 0).padStart(5), '  ', fmt(s.pairAcc))
  }
}
const outFile = flag('--out')
if (outFile) {
  await writeFile(outFile, JSON.stringify({ ranAt: new Date().toISOString(), configs: chosen, results }, null, 2))
  console.log('\nwritten', outFile)
}
if (args.includes('--detail')) {
  const target = flag('--detail')
  for (const row of results[target]?.rows ?? []) console.log(`\n${row.id} (${row.kind}) returned ${row.returned} P@5 ${fmt(row.p5)} fp ${row.falsePositives}\n  ${row.top.join('\n  ')}`)
  for (const pair of results[target]?.pairs ?? []) if (!pair.correct) console.log('PAIR WRONG:', pair.q, '|', pair.skill, '| expected', pair.expected, 'found', pair.found)
}
process.exit(0)

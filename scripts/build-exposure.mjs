// Builds data/exposure.json: observed AI use per eMASCO role, from the task matches.
// Run: node scripts/build-exposure.mjs   (needs data/cache/exposure/ from embed-tasks.mjs and match-tasks.mjs)
// The output is committed so hosting needs no model. Re-run it after a new Anthropic release or new matches.
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CUTOFF, MIN_TASKS, buildAllExposure, distinctness } from './lib/exposureEngine.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = async (...parts) => JSON.parse(await readFile(path.join(ROOT, ...parts), 'utf8'))

const [items, matchFile, onet, occupations, signals] = await Promise.all([
  read('data', 'cache', 'exposure', 'emasco.json'),
  read('data', 'cache', 'exposure', 'matches.json'),
  read('data', 'cache', 'exposure', 'onet.json'),
  read('data', 'emasco', 'occupations.json'),
  read('data', 'signals.json').catch(() => null),
])
const roles = [...occupations.roles, ...(occupations.tasksOnly ?? [])]
const exposures = buildAllExposure({ roles, items, matches: matchFile.matches, onet })

const output = {
  source: 'Anthropic Economic Index (Hugging Face dataset Anthropic/EconomicIndex), labor_market_impacts/task_penetration.csv',
  url: 'https://huggingface.co/datasets/Anthropic/EconomicIndex',
  release: signals?.anthropicIndex?.latestRelease ?? null,
  fetchedAt: signals?.anthropicIndex?.fetchedAt ?? null,
  builtAt: new Date().toISOString(),
  method: 'Each eMASCO task is matched to the closest O*NET task with bge-m3. Role exposure = mean observed AI use of its tasks matched at cosine >= cutoff; observedShare = share of those tasks with any observed use.',
  cutoff: CUTOFF,
  minTasks: MIN_TASKS,
  quality: { sample: 80, sameOrRelated: 0.97, same: 0.68, judge: 'Claude draft, awaiting teammate review', report: 'testing/results/task_match_eval.md' },
  limits: 'One assistant, mostly US users, US O*NET tasks. 0 means no observed use in this dataset, not safe from AI. Shows use today, not a forecast.',
  roles: exposures,
}
const target = path.join(ROOT, 'data', 'exposure.json')
await writeFile(`${target}.tmp`, JSON.stringify(output))
await rename(`${target}.tmp`, target)
const ok = Object.values(exposures).filter((entry) => entry.status === 'ok').length
console.log(`${ok} of ${roles.length} roles have enough matched tasks; distinct results: ${JSON.stringify(distinctness(exposures))}`)

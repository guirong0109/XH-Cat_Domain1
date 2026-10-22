// Maps the eMASCO statements of the 5 new accounting roles to existing skills (review sheet).
// Run: node scripts/map-statements.mjs   -> data/team/a1_skill_review.csv
// Model: the repo's models/ folder (never downloaded here).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { CUTOFF as LINK_CUTOFF } from '../server/cvMatch.js'
import { linkStatements, groupStatements, toCsv } from './lib/statementMap.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const GROUP_CUTOFF = 0.80
const NEW_CODES = ['2411-01', '2411-02', '2411-05', '3313-02', '3313-03']
const OUTPUT = path.join(ROOT, 'data', 'team', 'a1_skill_review.csv')

const raw = JSON.parse(readFileSync(path.join(ROOT, 'data', 'emasco', 'roles_raw.json'), 'utf8'))
const skills = JSON.parse(readFileSync(path.join(ROOT, 'data', 'skills.json'), 'utf8')).labels

const statements = []
for (const code of NEW_CODES) {
  const role = raw.roles.find((r) => r.code === code)
  if (!role) throw new Error(`Role ${code} not in the snapshot`)
  for (const text of role.basic_skills) statements.push({ code, role: role.title, type: 'basic', text })
  for (const text of role.specific_skills) statements.push({ code, role: role.title, type: 'specific', text })
}

const embedder = createEmbedder({ modelsDir: path.join(ROOT, 'models') })
const started = Date.now()
await embedder.warmUp()
console.log(`Model ${embedder.modelId} loaded in ${((Date.now() - started) / 1000).toFixed(1)} s`)

const stmtVectors = await embedder.embed(statements.map((s) => s.text))
const skillVectors = await embedder.embed(skills.map((s) => s.label))
const linked = linkStatements(statements, stmtVectors, skills, skillVectors, LINK_CUTOFF)

const idx = linked.map((s, i) => i).filter((i) => !linked[i].linked)
const groups = groupStatements(idx.map((i) => linked[i]), idx.map((i) => stmtVectors[i]), GROUP_CUTOFF)
const groupOf = new Map()
for (const g of groups) for (const m of g.members) groupOf.set(m, g.group)

const rows = linked.map((s) => ({
  ...s,
  group: s.linked ? '' : groupOf.get(s),
  decision: s.linked ? 'link' : 'new'
}))
writeFileSync(OUTPUT, toCsv(rows), 'utf8')

console.log(`Rows: ${rows.length}; linked: ${rows.length - idx.length}; to review: ${idx.length}; groups: ${groups.length}`)
console.log(`Group sizes: ${groups.map((g) => `${g.group}=${g.members.length}`).join(' ')}`)
console.log(`Wrote ${OUTPUT}`)

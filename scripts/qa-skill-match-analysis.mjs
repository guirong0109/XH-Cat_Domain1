// QA analysis for Current Skill Match: (1) equal weights vs the 1.0 / 1.5 heuristic, (2) why Farah's top role is
// Business Intelligence Analyst, (3) how many roles each reviewed similar pair can affect.
// Run: node scripts/qa-skill-match-analysis.mjs  -> testing/results/skill_match_qa_analysis.md
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { skillMatch } from '../src/lib/skillMatch.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (name) => JSON.parse(await readFile(path.join(root, 'data', name), 'utf8'))
const [roles, skills, samples, sim] = await Promise.all(['roles.json', 'skills.json', 'samples.json', 'skill_similarity.json'].map(read))
const ctx = { similar: skills.similar, skillSimilarity: sim }

const equalRoles = roles.map((role) => ({ ...role, skills: role.skills.map((skill) => ({ ...skill, importance: 1 })) }))
const rank = (list, sample) =>
  list.map((role) => ({ title: role.title, match: skillMatch(role, sample, ctx).match })).sort((a, b) => b.match - a.match || a.title.localeCompare(b.title))

const out = ['# Current Skill Match: QA analysis', '', '## 1. Equal weights vs the 1.0 / 1.5 heuristic', '', 'Same students, same roles. "Equal" gives every required skill weight 1.', '', '| Student | Top 3 (1.0/1.5) | Top 3 (equal) | Same top-3 set | Largest rank move over 20 roles | Largest score change |', '|---|---|---|---|---|---|']
for (const sample of samples) {
  const a = rank(roles, sample)
  const b = rank(equalRoles, sample)
  const top = (list) => list.slice(0, 3).map((item) => `${item.title} ${Math.round(item.match)}%`).join('; ')
  const same = new Set(a.slice(0, 3).map((i) => i.title))
  const overlap = b.slice(0, 3).filter((i) => same.has(i.title)).length
  const posB = new Map(b.map((item, index) => [item.title, index]))
  const moves = a.map((item, index) => Math.abs(index - posB.get(item.title)))
  const scoreB = new Map(b.map((item) => [item.title, item.match]))
  const change = Math.max(...a.map((item) => Math.abs(item.match - scoreB.get(item.title))))
  out.push(`| ${sample.label} | ${top(a)} | ${top(b)} | ${overlap} of 3 | ${Math.max(...moves)} | ${change.toFixed(1)} points |`)
}

out.push('', '## 2. Why the accounting sample ranks Business Intelligence Analyst first', '')
const farah = samples.find((s) => s.id === 'farah')
for (const title of ['Business Intelligence Analyst', 'Accounting Technician']) {
  const role = roles.find((r) => r.title === title)
  const result = skillMatch(role, farah, ctx)
  out.push(`### ${title}: ${result.match.toFixed(1)}% (${role.skills.length} required skills, total weight ${result.totalImportance})`, '', '| Required skill | Class | Weight | Credited through | Coverage |', '|---|---|---|---|---|')
  for (const row of result.rows) out.push(`| ${row.label} | ${row.type} | ${row.importance} | ${row.matchedSkill ? `${row.matchedSkill} (${row.matchKind === 'identical' ? 'same skill' : 'reviewed similar'})` : '-'} | ${Math.round(row.coverage * 100)}% |`)
  out.push('')
}

out.push('## 2b. Ranking with exact skills only (reviewed similar credit switched off)', '', '| Student | Top 3 with similar credit | Top 3 exact skills only |', '|---|---|---|')
for (const sample of samples) {
  const exactCtx = { ...ctx, similar: {} }
  const exact = roles.map((role) => ({ title: role.title, match: skillMatch(role, sample, exactCtx).match })).sort((a, b) => b.match - a.match || a.title.localeCompare(b.title))
  const text = (list) => list.slice(0, 3).map((item) => `${item.title} ${Math.round(item.match)}%`).join('; ')
  out.push(`| ${sample.label} | ${text(rank(roles, sample))} | ${text(exact)} |`)
}
out.push('')
out.push('## 3. Reviewed similar pairs: how many of the 20 roles each can touch', '', '| Required skill <- student skill | Roles that require the skill | Cosine (display only) |', '|---|---|---|')
for (const [needed, list] of Object.entries(skills.similar)) {
  for (const have of list) {
    const count = roles.filter((role) => role.skills.some((skill) => skill.label === needed)).length
    const i = sim.labels.indexOf(needed)
    const j = sim.labels.indexOf(have)
    out.push(`| ${needed} <- ${have} | ${count} | ${sim.matrix[i][j].toFixed(2)} |`)
  }
}
await writeFile(path.join(root, 'testing', 'results', 'skill_match_qa_analysis.md'), `${out.join('\n')}\n`)
console.log(out.join('\n'))

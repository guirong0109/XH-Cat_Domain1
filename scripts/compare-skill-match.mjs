// Before/after on identical inputs: the 4 sample students against the 20 roles.
// Before = the old Matches score (0.6 fit + 0.4 outlook + SDG bonus, Moderate AI). After = Current Skill Match.
// Run: node scripts/compare-skill-match.mjs   -> testing/results/skill_match_before_after.md
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rankRoles } from '../src/lib/scoring.js'
import { rankBySkillMatch } from '../src/lib/skillRanking.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (name) => JSON.parse(await readFile(path.join(root, 'data', name), 'utf8'))
const [roles, skills, samples, trends, exposure, similarity] = await Promise.all(
  ['roles.json', 'skills.json', 'samples.json', 'trends.json', 'exposure.json', 'skill_similarity.json'].map(read),
)
const ctx = { similar: skills.similar, trendGroups: trends.groups, observed: exposure, skillSimilarity: similarity }
// "Before" uses the similar-skill list as it was then (it still had Python programming -> Using AI tools, removed 25 Oct 2026).
const beforeCtx = { ...ctx, similar: { ...skills.similar, 'Using AI tools': ['Python programming'] } }

const lines = ['# Before and after: same students, same roles', '', 'Before = old score (0.6 x skill fit + 0.4 x outlook + SDG bonus, Moderate AI, Good = 0.75, with the similar-skill list as it was before 25 Oct 2026). After = Current Skill Match (Good = 0.8, skills with no level count as Basic). Top 5 roles per student in each ordering.', '']
for (const sample of samples) {
  const before = rankRoles(roles, sample, beforeCtx, 'moderate')
  const after = rankBySkillMatch(roles, sample, ctx, 'moderate')
  const oldScore = new Map(before.map((entry) => [entry.role.id, entry.score]))
  const oldRank = new Map(before.map((entry, index) => [entry.role.id, index + 1]))
  lines.push(`## ${sample.label}`, '', '| New rank | Role | Current Skill Match | Old score | Old rank | Job outlook (separate) | Old fit part |', '|---|---|---|---|---|---|---|')
  after.slice(0, 5).forEach((entry, index) => {
    const old = oldScore.get(entry.role.id)
    lines.push(`| ${index + 1} | ${entry.role.title} | ${Math.round(entry.score.match)}% | ${Math.round(old.match)} | ${oldRank.get(entry.role.id)} | ${Math.round(entry.score.outlook)} | ${Math.round(old.fit)} |`)
  })
  const drift = after.map((entry, index) => Math.abs(index + 1 - oldRank.get(entry.role.id)))
  const top3Same = before.slice(0, 3).filter((entry) => after.slice(0, 3).some((other) => other.role.id === entry.role.id)).length
  lines.push('', `Roles that stay in the top 3: ${top3Same} of 3. Largest rank move: ${Math.max(...drift)}.`, '')
}
await writeFile(path.join(root, 'testing', 'results', 'skill_match_before_after.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))

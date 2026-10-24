// Weekly refresh: job-market trend, AI research counts, reference links and course pages.
// Each source keeps its last good file if it fails. Team files are never edited here.
// The Emerging feed is not included (it needs a model key); refresh it from /admin.
// Usage: node scripts/refresh-data.mjs [--only=trends,research,references,courses]
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORTAL_LINKS } from '../src/lib/pathwayView.js'
import { refreshCourseChecks } from '../server/courseCheck.js'
import { refreshReferences } from '../server/references.js'
import { refreshResearch } from '../server/research.js'
import { refreshTrends } from '../server/trends.js'
import { exitCodeFor, pickSteps, runSteps } from './lib/refreshAll.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const file = (...parts) => path.join(dataDir, ...parts)
const readJson = async (...parts) => JSON.parse(await readFile(file(...parts), 'utf8'))

const steps = [
  { name: 'trends', run: () => refreshTrends({ filePath: file('trends.json') }) },
  {
    name: 'research',
    run: async () => {
      const skills = await readJson('skills.json')
      const terms = skills.labels.map(({ label, researchTerm }) => ({ label, researchTerm }))
      return refreshResearch({ filePath: file('research.json'), terms })
    },
  },
  {
    name: 'references',
    run: async () => {
      const [roles, snapshot] = await Promise.all([readJson('roles.json'), readJson('emasco', 'roles_raw.json')])
      const links = [...new Set([...Object.values(PORTAL_LINKS).map((item) => item.url), ...roles.map((role) => role.ilo?.url).filter(Boolean)])]
      return refreshReferences({ filePath: file('references.json'), savedRoles: snapshot.roles, links })
    },
  },
  {
    name: 'courses',
    run: async () => refreshCourseChecks({ filePath: file('course_checks.json'), skills: await readJson('skills.json') }),
  },
]

const results = await runSteps(pickSteps(steps, process.argv.slice(2)))
process.exit(exitCodeFor(results))

// Opens every saved course page (2 s apart) and records whether it is still there and unchanged.
// Writes data/course_checks.json only. It never edits skills.json or the team files.
// Usage: node scripts/refresh-courses.mjs
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { refreshCourseChecks } from '../server/courseCheck.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const skills = JSON.parse(await readFile(path.join(dataDir, 'skills.json'), 'utf8'))
const result = await refreshCourseChecks({ filePath: path.join(dataDir, 'course_checks.json'), skills })
console.log(`${result.status}: ${result.message}`)
for (const [url, check] of Object.entries(result.checks?.courses ?? {})) {
  if (check.status === 'changed' || check.status === 'gone') console.log(`  ${check.status.toUpperCase()} ${url} ${check.changed.join(', ')}`)
}
process.exit(result.status === 'failed' ? 1 : 0)

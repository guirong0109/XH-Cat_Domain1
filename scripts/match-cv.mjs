// Try the eMASCO matcher. Run: node scripts/match-cv.mjs <cv.txt> [--cutoff 0.72]
//                              node scripts/match-cv.mjs --check     (three fixed checks on the real model)
// CV text is read, embedded and printed; nothing is stored. Needs models/ and data/cache/emasco/.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { EMASCO_CUTOFF, loadEmascoIndex, matchCv } from '../server/emascoMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function printResult(result) {
  if (result.status === 'no-role-match') {
    console.log(`${result.matchedSkillCount} skills matched, but no single role has at least 3 of its skills matched.`)
    return
  }
  if (result.status !== 'ok') {
    console.log(`Not enough skills found (${result.matchedSkillCount} matched, at least 3 needed).`)
    return
  }
  console.log(`${result.matchedSkillCount} skills matched in total.`)
  for (const role of result.roles) {
    console.log(`\n${role.matchPercent}%  ${role.title} (${role.code})  ${role.url}`)
    console.log(`  ${role.matchedCount} of ${role.requiredCount} skills. Qualification: ${role.qualification || 'not shown'}`)
    for (const item of role.have.slice(0, 6)) console.log(`  + ${item.text}  [${item.score}]  <- "${item.evidence}"`)
    if (role.have.length > 6) console.log(`  + ... ${role.have.length - 6} more`)
    console.log(`  - missing ${role.missing.length}: ${role.missing.slice(0, 5).map((item) => item.text).join('; ')}`)
  }
}

async function runChecks({ embedder, index, occupations, cutoff }) {
  const target = occupations.roles.find((role) => role.code === '1121-01')
  const exact = await matchCv({ text: target.skills.map((skill) => skill.text).join('\n'), embedder, index, cutoff })
  const position = exact.roles.findIndex((role) => role.code === '1121-01')
  console.log(`Check 1 exact skill list of 1121-01: ${position === 0 ? 'rank 1' : position > 0 ? `rank ${position + 1}` : 'not in top 5'}` +
    `${position >= 0 ? `, ${exact.roles[position].matchPercent}%` : ''}. Top: ${exact.roles.map((role) => `${role.code} ${role.matchPercent}%`).join(', ')}`)

  const vague = await matchCv({ text: 'digital transformation', embedder, index, cutoff })
  console.log(`Check 2 "digital transformation" alone: ${vague.status} (${vague.matchedSkillCount} skills matched)`)

  const malayText = await readFile(path.join(ROOT, 'testing', 'emasco_check_1121-01_bm.txt'), 'utf8')
  const malay = await matchCv({ text: malayText, embedder, index, cutoff })
  const englishCodes = exact.roles.map((role) => role.code)
  const malayCodes = malay.roles.map((role) => role.code)
  const shared = malayCodes.filter((code) => englishCodes.includes(code)).length
  console.log(`Check 3 Malay skills of 1121-01: ${malay.status}, top 5 ${malayCodes.join(', ') || 'none'}; ` +
    `${shared} of ${englishCodes.length} also in the English top 5`)
}

async function main() {
  const config = chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models'))
  if (!config) throw new Error('No local model found (models/ or MODELS_DIR).')
  const cutoffFlag = process.argv.indexOf('--cutoff')
  const cutoff = cutoffFlag === -1 ? EMASCO_CUTOFF : Number(process.argv[cutoffFlag + 1])
  const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
  const index = await loadEmascoIndex({ cacheDirectory: path.join(ROOT, 'data', 'cache', 'emasco'), occupations })
  const embedder = createEmbedder(config)
  if (process.argv.includes('--check')) return runChecks({ embedder, index, occupations, cutoff })
  const file = process.argv[2]
  if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/match-cv.mjs <cv.txt> | --check')
  printResult(await matchCv({ text: await readFile(file, 'utf8'), embedder, index, cutoff }))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

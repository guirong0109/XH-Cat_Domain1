// Try the eMASCO matcher. Run: node scripts/match-cv.mjs <cv.txt> [--strict] [--cutoff 0.69]
//                              node scripts/match-cv.mjs --check     (fixed checks on the real model)
// Default = rank by CV-to-role-vector similarity. --strict = old rule (3+ skills matched per role), which ranks nothing for most CVs.
// CV text is read, embedded and printed; nothing is stored. Needs models/ and data/cache/emasco/.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { EMASCO_CUTOFF, loadEmascoIndex, matchCv, matchCvByProfile } from '../server/emascoMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function printStrict(result) {
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

function printProfile(result) {
  if (result.status !== 'ok') {
    console.log(`Not enough lines (${result.lineCount}); at least 3 skills or CV lines are needed.`)
    return
  }
  if (result.confidence === 'low') console.log('LOW CONFIDENCE: the closest roles are only weakly similar to this text.')
  for (const role of result.roles) {
    console.log(`\n${role.title} (${role.code})  similarity ${role.similarity}  skills matched ${role.skillCoverage}%  ${role.url}`)
    console.log(`  Qualification: ${role.qualification || 'not shown'}. Closest CV lines: ${role.bestLines.map((item) => `"${item.line}"`).join(' | ')}`)
    for (const item of role.skills.slice(0, 6)) {
      console.log(`  ${item.matched ? '+' : '~'} ${item.text}  [${item.score}]${item.matched ? `  <- "${item.evidence}"` : ''}`)
    }
  }
}

async function runChecks({ embedder, index, occupations, cutoff }) {
  const target = occupations.roles.find((role) => role.code === '1121-01')
  const exactText = target.skills.map((skill) => skill.text).join('\n')

  const strict = await matchCv({ text: exactText, embedder, index, cutoff })
  const strictPosition = strict.roles.findIndex((role) => role.code === '1121-01')
  console.log(`Check 1 (strict) exact skill list of 1121-01: ${strictPosition >= 0 ? `rank ${strictPosition + 1}, ${strict.roles[strictPosition].matchPercent}%` : 'not in top 5'}`)

  const profile = await matchCvByProfile({ text: exactText, embedder, index, cutoff })
  const profilePosition = profile.roles.findIndex((role) => role.code === '1121-01')
  console.log(`Check 1 (profile) exact skill list of 1121-01: ${profilePosition >= 0 ? `rank ${profilePosition + 1}` : 'not in top 5'}. Top: ${profile.roles.map((role) => `${role.code} ${role.similarity}`).join(', ')}`)

  const vague = await matchCvByProfile({ text: 'digital transformation', embedder, index, cutoff })
  console.log(`Check 2 "digital transformation" alone (profile): ${vague.status}, ${vague.lineCount} line(s)`)

  const malayText = await readFile(path.join(ROOT, 'testing', 'emasco_check_1121-01_bm.txt'), 'utf8')
  const malay = await matchCvByProfile({ text: malayText, embedder, index, cutoff })
  const englishCodes = profile.roles.map((role) => role.code)
  const malayCodes = malay.roles.map((role) => role.code)
  const shared = malayCodes.filter((code) => englishCodes.includes(code)).length
  console.log(`Check 3 Malay skills of 1121-01 (profile): top 5 ${malayCodes.join(', ') || 'none'}; ` +
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
  if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/match-cv.mjs <cv.txt> [--strict] | --check')
  const text = await readFile(file, 'utf8')
  if (process.argv.includes('--strict')) printStrict(await matchCv({ text, embedder, index, cutoff }))
  else printProfile(await matchCvByProfile({ text, embedder, index, cutoff }))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

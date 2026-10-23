// Matches a CV (or typed skills) against every eMASCO role that has skills (option B, phase 4).
// Vectors come from scripts/embed-emasco.mjs (data/cache/emasco/). CV text is never stored or logged.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cut } from '../src/lib/cvSkills.js'
import { inputHash, skillInputs } from '../scripts/lib/emascoEmbed.js'
import { splitCvLines } from './cvMatch.js'

// Lowest cutoff with precision >= 0.90 on the tuning CVs (testing/results/emasco_match_review.csv, judged by Claude,
// 2026-10-23; see testing/results/emasco_match_eval.md). Held-out precision at 0.69 is only 0.71 (5 of 7).
export const EMASCO_CUTOFF = 0.69
export const MIN_MATCHED = 3
export const TYPE_WEIGHT = { basic: 1, specific: 1.5 }

const skillKey = (text) => text.split(/\s+/).filter(Boolean).join(' ').toLowerCase()

export function buildIndex({ occupations, skillVectors, dimension }) {
  const rowOfKey = new Map()
  occupations.skills.forEach((skill, row) => rowOfKey.set(skillKey(skill.text), row))
  const roles = occupations.roles.map((role) => ({
    code: role.code,
    title: role.title,
    url: role.url,
    qualification: role.qualification,
    tags: role.tags,
    entries: role.skills.map((skill) => {
      const row = rowOfKey.get(skillKey(skill.text))
      if (row === undefined) throw new Error(`Skill "${skill.text}" of role ${role.code} is not in the skills index`)
      return { row, text: skill.text, type: skill.type }
    })
  }))
  return { dimension, skillCount: occupations.skills.length, skillVectors, roles }
}

export async function loadEmascoIndex({ cacheDirectory, occupations }) {
  const rebuild = (reason) => new Error(`${reason}. Rebuild the vectors: node scripts/embed-emasco.mjs`)
  let meta
  let buffer
  try {
    meta = JSON.parse(await readFile(path.join(cacheDirectory, 'meta.json'), 'utf8'))
    buffer = await readFile(path.join(cacheDirectory, 'skills.f32'))
  } catch {
    throw rebuild('The eMASCO vectors are missing')
  }
  const { texts } = skillInputs(occupations)
  if (meta.skillsHash !== inputHash(texts, meta.modelId) || meta.skillCount !== texts.length) {
    throw rebuild('The eMASCO vectors do not match data/emasco/occupations.json')
  }
  if (buffer.length !== texts.length * meta.dimension * 4) throw rebuild('The skills vector file has the wrong size')
  const skillVectors = new Float32Array(new Uint8Array(buffer).buffer)
  return buildIndex({ occupations, skillVectors, dimension: meta.dimension })
}

export function skillScores(lineVectors, index) {
  const { dimension, skillCount, skillVectors } = index
  const scores = new Float64Array(skillCount).fill(-Infinity)
  const lines = new Int32Array(skillCount).fill(-1)
  for (let row = 0; row < skillCount; row += 1) {
    const offset = row * dimension
    for (let lineNumber = 0; lineNumber < lineVectors.length; lineNumber += 1) {
      const lineVector = lineVectors[lineNumber]
      let sum = 0
      for (let position = 0; position < dimension; position += 1) sum += skillVectors[offset + position] * lineVector[position]
      if (sum > scores[row]) {
        scores[row] = sum
        lines[row] = lineNumber
      }
    }
  }
  return { scores, lines }
}

export function rankRoles({ scores, lines, cvLines, index, cutoff = EMASCO_CUTOFF, top = 5 }) {
  let matchedSkillCount = 0
  for (let row = 0; row < index.skillCount; row += 1) if (scores[row] >= cutoff) matchedSkillCount += 1
  if (matchedSkillCount < MIN_MATCHED) return { status: 'not-enough-skills', matchedSkillCount, roles: [] }

  const ranked = []
  for (const role of index.roles) {
    let requiredWeight = 0
    let matchedWeight = 0
    const have = []
    const missing = []
    for (const entry of role.entries) {
      const weight = TYPE_WEIGHT[entry.type] ?? 1
      requiredWeight += weight
      if (scores[entry.row] >= cutoff) {
        matchedWeight += weight
        have.push({
          text: entry.text,
          type: entry.type,
          score: Math.round(scores[entry.row] * 10000) / 10000,
          evidence: cut(cvLines[lines[entry.row]])
        })
      } else {
        missing.push({ text: entry.text, type: entry.type })
      }
    }
    if (have.length < MIN_MATCHED) continue
    ranked.push({
      code: role.code,
      title: role.title,
      url: role.url,
      qualification: role.qualification,
      tags: role.tags,
      matchPercent: Math.round((100 * matchedWeight) / requiredWeight),
      matchedCount: have.length,
      requiredCount: role.entries.length,
      have,
      missing
    })
  }
  ranked.sort(
    (left, right) =>
      right.matchPercent - left.matchPercent ||
      right.matchedCount - left.matchedCount ||
      left.code.localeCompare(right.code)
  )
  // Skills matched, but no single role has enough of them.
  if (ranked.length === 0) return { status: 'no-role-match', matchedSkillCount, roles: [] }
  return { status: 'ok', matchedSkillCount, roles: ranked.slice(0, top) }
}

export async function matchCv({ text, embedder, index, cutoff = EMASCO_CUTOFF, top = 5 }) {
  const cvLines = splitCvLines(text)
  if (cvLines.length === 0) return { status: 'not-enough-skills', matchedSkillCount: 0, roles: [] }
  const lineVectors = await embedder.embed(cvLines)
  const { scores, lines } = skillScores(lineVectors, index)
  return rankRoles({ scores, lines, cvLines, index, cutoff, top })
}

// Matches a CV (or typed skills) against every eMASCO role that has skills (option B, phase 4).
// Vectors come from scripts/embed-emasco.mjs (data/cache/emasco/). CV text is never stored or logged.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cut } from '../src/lib/cvSkills.js'
import { inputHash, roleInputs, skillInputs } from '../scripts/lib/emascoEmbed.js'
import { splitCvLines } from './cvMatch.js'

// Lowest cutoff with precision >= 0.90 on the tuning CVs (testing/results/emasco_match_review.csv, judged by Claude,
// 2026-10-23; see testing/results/emasco_match_eval.md). Held-out precision at 0.69 is only 0.71 (5 of 7).
export const EMASCO_CUTOFF = 0.69
export const MIN_MATCHED = 3
export const TYPE_WEIGHT = { basic: 1, specific: 1.5 }
// Ranking by role vectors (phase 4b). Not tuned: 0.50 is just below the lowest top score seen on real made-up CVs
// (0.46-0.55); text that is not a CV scored 0.39-0.46, so there is no clean floor. See testing/results/emasco_match_eval.md.
export const MIN_LINES = 3
export const TOP_LINES = 3
export const LOW_CONFIDENCE_BELOW = 0.5

const skillKey = (text) => text.split(/\s+/).filter(Boolean).join(' ').toLowerCase()

export function buildIndex({ occupations, skillVectors, dimension, roleVectors = null, roleCodes = [] }) {
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
  const roleRow = new Map(roleCodes.map((code, row) => [code, row]))
  return { dimension, skillCount: occupations.skills.length, skillVectors, roleVectors, roleRow, roles }
}

export async function loadEmascoIndex({ cacheDirectory, occupations }) {
  const rebuild = (reason) => new Error(`${reason}. Rebuild the vectors: node scripts/embed-emasco.mjs`)
  let meta
  let buffer
  let roleBuffer
  let roleCodes
  try {
    meta = JSON.parse(await readFile(path.join(cacheDirectory, 'meta.json'), 'utf8'))
    buffer = await readFile(path.join(cacheDirectory, 'skills.f32'))
    roleBuffer = await readFile(path.join(cacheDirectory, 'roles.f32'))
    roleCodes = JSON.parse(await readFile(path.join(cacheDirectory, 'roles_ids.json'), 'utf8'))
  } catch {
    throw rebuild('The eMASCO vectors are missing')
  }
  const { texts } = skillInputs(occupations)
  if (meta.skillsHash !== inputHash(texts, meta.modelId) || meta.skillCount !== texts.length) {
    throw rebuild('The eMASCO vectors do not match data/emasco/occupations.json')
  }
  if (buffer.length !== texts.length * meta.dimension * 4) throw rebuild('The skills vector file has the wrong size')
  const roleTexts = roleInputs(occupations).texts
  if (meta.rolesHash !== inputHash(roleTexts, meta.modelId) || roleCodes.length !== roleTexts.length) {
    throw rebuild('The eMASCO role vectors do not match data/emasco/occupations.json')
  }
  if (roleBuffer.length !== roleTexts.length * meta.dimension * 4) throw rebuild('The roles vector file has the wrong size')
  const skillVectors = new Float32Array(new Uint8Array(buffer).buffer)
  const roleVectors = new Float32Array(new Uint8Array(roleBuffer).buffer)
  return buildIndex({ occupations, skillVectors, dimension: meta.dimension, roleVectors, roleCodes })
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

// Phase 4b: rank roles by how close the CV lines are to each role's whole profile vector.
// similarity = mean of the TOP_LINES best CV lines against the role vector (0-1, not a percentage).
export function rankByProfile({ lineVectors, cvLines, index, scores, lines, cutoff = EMASCO_CUTOFF, top = 5 }) {
  if (!index.roleVectors) throw new Error('This index has no role vectors')
  const { dimension, roleVectors, roleRow } = index
  const ranked = []
  for (const role of index.roles) {
    const row = roleRow.get(role.code)
    if (row === undefined) throw new Error(`Role ${role.code} has no vector`)
    const offset = row * dimension
    const lineScores = lineVectors.map((lineVector, lineNumber) => {
      let sum = 0
      for (let position = 0; position < dimension; position += 1) sum += roleVectors[offset + position] * lineVector[position]
      return { lineNumber, similarity: sum }
    })
    lineScores.sort((left, right) => right.similarity - left.similarity)
    const best = lineScores.slice(0, TOP_LINES)
    ranked.push({
      role,
      similarity: best.reduce((sum, item) => sum + item.similarity, 0) / best.length,
      bestLines: best
    })
  }
  ranked.sort((left, right) => right.similarity - left.similarity || left.role.code.localeCompare(right.role.code))

  const roles = ranked.slice(0, top).map(({ role, similarity, bestLines }) => {
    let requiredWeight = 0
    let matchedWeight = 0
    const skills = role.entries.map((entry) => {
      const weight = TYPE_WEIGHT[entry.type] ?? 1
      const score = scores[entry.row]
      const matched = score >= cutoff
      requiredWeight += weight
      if (matched) matchedWeight += weight
      return {
        text: entry.text,
        type: entry.type,
        score: Math.round(score * 10000) / 10000,
        matched,
        evidence: matched ? cut(cvLines[lines[entry.row]]) : null
      }
    })
    skills.sort((left, right) => right.score - left.score)
    return {
      code: role.code,
      title: role.title,
      url: role.url,
      qualification: role.qualification,
      tags: role.tags,
      similarity: Math.round(similarity * 10000) / 10000,
      bestLines: bestLines.map((item) => ({ line: cut(cvLines[item.lineNumber]), similarity: Math.round(item.similarity * 10000) / 10000 })),
      skillCoverage: Math.round((100 * matchedWeight) / requiredWeight),
      skills
    }
  })
  const confidence = roles[0] && roles[0].similarity >= LOW_CONFIDENCE_BELOW ? 'ok' : 'low'
  return { status: 'ok', confidence, lineCount: cvLines.length, roles }
}

export async function matchCvByProfile({ text, embedder, index, cutoff = EMASCO_CUTOFF, top = 5 }) {
  const cvLines = splitCvLines(text)
  if (cvLines.length < MIN_LINES) return { status: 'not-enough-skills', lineCount: cvLines.length, roles: [] }
  const lineVectors = await embedder.embed(cvLines)
  const { scores, lines } = skillScores(lineVectors, index)
  return rankByProfile({ lineVectors, cvLines, index, scores, lines, cutoff, top })
}

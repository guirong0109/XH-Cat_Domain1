import { cut } from '../src/lib/cvSkills.js'

export const MAX_CHARS = 20000
export const MAX_LINES = 300
// Set from testing/results/cv_eval.csv (scripts/eval-cv.mjs, 2026-10-22): the lowest cutoff whose
// tuning-set combined precision is >= 0.90, best recall across the two skill-text modes.
// At 0.72 the AI step finds no skill on the tuning CVs; on the held-out CVs it added 1 right skill.
export const CUTOFF = 0.72
export const SKILL_TEXT_MODE = 'label'

export function splitCvLines(text) {
  const lines = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw
      .replace(/^[\s\-–—•*·●▪◦▶>]+/u, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if ((line.match(/\p{L}/gu) ?? []).length < 3) continue
    lines.push(line)
    if (lines.length >= MAX_LINES) break
  }
  return lines
}

export function skillTexts(skill, mode) {
  if (skill.statements?.length) return [skill.label, ...skill.statements.map((s) => (typeof s === 'string' ? s : s.text))]
  if (mode === 'label+keywords') return [skill.label, ...(skill.keywords ?? [])]
  return [skill.label]
}

function dot(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

export function matchSkills(lines, lineVectors, skills, skillVectorSets, cutoff) {
  if (!lines.length || !skills.length) return []
  const matches = []
  skills.forEach((skill, i) => {
    let best = -Infinity
    let bestLine = -1
    for (const vector of skillVectorSets[i] ?? []) {
      lineVectors.forEach((lineVector, j) => {
        const score = dot(vector, lineVector)
        if (score > best) {
          best = score
          bestLine = j
        }
      })
    }
    if (bestLine < 0) return
    const score = Math.round(best * 10000) / 10000
    if (score >= cutoff) matches.push({ label: skill.label, score, evidence: cut(lines[bestLine]) })
  })
  return matches.sort((a, b) => b.score - a.score)
}

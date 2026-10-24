// Reads the pre-computed occupation-skill dataset (data/skills/, built by pipeline/build_skill_dataset.py).
// No search and no scoring here: lookups only. The matching engine and the scoring formula are not changed by this file.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

// Same light clean-up the builder uses for names: lowercase, "&" to "and", no punctuation noise, single spaces.
export function normaliseName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s/+#.&-]/g, ' ')
    .replace(/[-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The same key the builder makes (pipeline/skill_text.py canonical_key): spelling folded, no trailing "skills", no leading "the".
// The rules come from skill_index.json so the two sides cannot drift apart.
export function makeKeyFor(rules = { spelling: {}, trailing: [] }) {
  return (name) => {
    let words = normaliseName(name).split(' ').filter(Boolean).map((word) => rules.spelling[word] ?? word)
    let text = words.join(' ')
    for (const suffix of rules.trailing) {
      if (text.endsWith(` ${suffix}`) && text.length > suffix.length + 3) {
        text = text.slice(0, -(suffix.length + 1)).trim()
        break
      }
    }
    return text.replace(/^the /, '')
  }
}

export async function loadSkillDataset(directory) {
  const [catalogueFile, occupationFile, indexFile, reviewFile] = await Promise.all([
    readJson(path.join(directory, 'catalogue.json')),
    readJson(path.join(directory, 'occupations.json')),
    readJson(path.join(directory, 'skill_index.json')),
    readJson(path.join(directory, 'review.json')).catch(() => ({ relations: [], nearDuplicates: [] })),
  ])
  const prints = new Set([catalogueFile, occupationFile, indexFile].map((file) => file.meta?.fingerprint))
  if (prints.size !== 1 || prints.has(undefined)) {
    throw new Error('The skill dataset files come from different runs (an interrupted build?). Run pipeline/build_skill_dataset.py again.')
  }
  return createSkillDataset({ catalogueFile, occupationFile, indexFile, reviewFile })
}

export function createSkillDataset({ catalogueFile, occupationFile, indexFile, reviewFile = { relations: [], nearDuplicates: [] } }) {
  const skills = new Map(catalogueFile.skills.map((skill) => [skill.id, skill]))
  const occupations = occupationFile.occupations
  const relatedByAppLabel = new Map()
  for (const skill of catalogueFile.skills) {
    for (const label of skill.taxonomy?.relatedAppSkills ?? []) {
      const key = normaliseName(label)
      if (!relatedByAppLabel.has(key)) relatedByAppLabel.set(key, new Set())
      relatedByAppLabel.get(key).add(skill.id)
    }
  }
  const byAppLabel = new Map(catalogueFile.skills.filter((skill) => skill.taxonomy?.appSkill).map((skill) => [normaliseName(skill.taxonomy.appSkill), skill.id]))

  const keyFor = makeKeyFor(indexFile.normalisation)

  function resolveSkill(input) {
    if (skills.has(input)) return input
    return indexFile.nameToSkill[keyFor(input)] ?? indexFile.nameToSkill[normaliseName(input)] ?? byAppLabel.get(normaliseName(input)) ?? null
  }

  // All skills of an occupation. Default: only relations that passed extraction checks.
  function skillsForOccupation(code, { validatedOnly = true } = {}) {
    const record = occupations[code]
    if (!record) return null
    return record.skills.filter((relation) => !validatedOnly || relation.status === 'validated')
  }

  // Status of an occupation's skill profile: ok, sparse, insufficient (no usable list) or failed. null = not in the dataset.
  function occupation(code) {
    const record = occupations[code]
    if (!record) return null
    return { code, title: record.title, status: record.status, reason: record.reason ?? null, skillCount: record.skills.length, source: record.source }
  }

  function occupationsForSkill(input) {
    const id = resolveSkill(input)
    if (!id) return []
    return (indexFile.skillToOccupations[id] ?? []).map((code) => ({ code, title: occupations[code].title, status: occupations[code].status }))
  }

  // What a person has against what an occupation lists. Facts only; no score and no importance is invented.
  function compare(code, userSkills) {
    const record = occupations[code]
    if (!record) return null
    const have = new Set((userSkills ?? []).map(resolveSkill).filter(Boolean))
    // A skill the person has that is only RELATED to a requirement (for example "Python programming" and "Python scripting")
    // is shown as a hint on the missing row. It is never counted as a match.
    const hints = new Map()
    for (const input of userSkills ?? []) {
      for (const id of relatedByAppLabel.get(normaliseName(input)) ?? []) hints.set(id, input)
    }
    const matched = []
    const missing = []
    const uncertain = []
    for (const relation of record.skills) {
      const row = { skillId: relation.skillId, skill: relation.skillName }
      if (relation.status !== 'validated') uncertain.push({ ...row, have: have.has(relation.skillId) })
      else if (have.has(relation.skillId)) matched.push(row)
      else missing.push(hints.has(relation.skillId) ? { ...row, relatedYouHave: hints.get(relation.skillId) } : row)
    }
    const counted = matched.length + missing.length
    return { code, status: record.status, matched, missing, uncertain, coverage: counted ? matched.length / counted : null, unknownInputs: (userSkills ?? []).filter((input) => !resolveSkill(input)) }
  }

  // Why a skill belongs to an occupation: the quoted official statements and where they come from.
  function explain(code, input) {
    const record = occupations[code]
    const id = resolveSkill(input)
    const relation = record?.skills.find((item) => item.skillId === id)
    if (!record || !relation) return null
    return {
      occupation: { code, title: record.title }, skill: skills.get(id), source: record.source,
      sections: relation.sections, originalTerms: relation.originalTerms, evidence: relation.evidence,
      evidenceStrength: relation.evidenceStrength, independentSources: relation.independentSources, status: relation.status,
    }
  }

  const coverageGaps = () =>
    Object.values(occupations)
      .filter((record) => record.status !== 'ok')
      .map((record) => ({ code: record.code, title: record.title, status: record.status, reason: record.reason }))

  return {
    meta: catalogueFile.meta, occupation, skill: (input) => skills.get(resolveSkill(input)) ?? null, resolveSkill, skillsForOccupation,
    occupationsForSkill, compare, explain, coverageGaps, review: () => reviewFile, size: { skills: skills.size, occupations: Object.keys(occupations).length },
  }
}

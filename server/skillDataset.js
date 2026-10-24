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

export async function loadSkillDataset(directory) {
  const [catalogueFile, occupationFile, indexFile, reviewFile] = await Promise.all([
    readJson(path.join(directory, 'catalogue.json')),
    readJson(path.join(directory, 'occupations.json')),
    readJson(path.join(directory, 'skill_index.json')),
    readJson(path.join(directory, 'review.json')).catch(() => ({ relations: [], nearDuplicates: [] })),
  ])
  return createSkillDataset({ catalogueFile, occupationFile, indexFile, reviewFile })
}

export function createSkillDataset({ catalogueFile, occupationFile, indexFile, reviewFile = { relations: [], nearDuplicates: [] } }) {
  const skills = new Map(catalogueFile.skills.map((skill) => [skill.id, skill]))
  const occupations = occupationFile.occupations
  const byAppLabel = new Map(catalogueFile.skills.filter((skill) => skill.taxonomy?.appSkill).map((skill) => [normaliseName(skill.taxonomy.appSkill), skill.id]))

  function resolveSkill(input) {
    if (skills.has(input)) return input
    const key = normaliseName(input)
    return indexFile.nameToSkill[key] ?? byAppLabel.get(key) ?? null
  }

  // All skills of an occupation. Default: only relations that passed extraction checks.
  function skillsForOccupation(code, { validatedOnly = true } = {}) {
    const record = occupations[code]
    if (!record) return null
    return record.skills.filter((relation) => !validatedOnly || relation.status === 'validated')
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
    const matched = []
    const missing = []
    const uncertain = []
    for (const relation of record.skills) {
      const row = { skillId: relation.skillId, skill: relation.skillName }
      if (relation.status !== 'validated') uncertain.push({ ...row, have: have.has(relation.skillId) })
      else if (have.has(relation.skillId)) matched.push(row)
      else missing.push(row)
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
    meta: catalogueFile.meta, skill: (input) => skills.get(resolveSkill(input)) ?? null, resolveSkill, skillsForOccupation,
    occupationsForSkill, compare, explain, coverageGaps, review: () => reviewFile, size: { skills: skills.size, occupations: Object.keys(occupations).length },
  }
}

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSkillDataset, loadSkillDataset, makeKeyFor, normaliseName } from '../server/skillDataset.js'

const relation = (skillId, skillName, status = 'validated', extra = {}) => ({
  skillId, skillName, classification: 'listed_in_official_standard', sections: ['specific'], originalTerms: [skillName],
  evidence: [{ source: 'emasco:A-1', section: 'specific', statementId: 's1', quote: `Proficiency in ${skillName}.` }],
  independentSources: 1, evidenceStrength: 'official_single_source', importance: null, status, ...extra,
})
const fixture = () =>
  createSkillDataset({
    catalogueFile: {
      meta: { schemaVersion: 1 },
      skills: [
        { id: 'sk_a', key: 'python programming', name: 'Python programming', taxonomy: { appSkill: 'Python programming' } },
        { id: 'sk_b', key: 'django', name: 'Django', taxonomy: {} },
        { id: 'sk_c', key: 'safety', name: 'Safety', taxonomy: {} },
      ],
    },
    occupationFile: {
      occupations: {
        'A-1': { code: 'A-1', title: 'Role A', status: 'ok', source: { url: 'https://example.org/A-1' }, skills: [relation('sk_a', 'Python programming'), relation('sk_b', 'Django'), relation('sk_c', 'Safety', 'needs_review')] },
        'B-2': { code: 'B-2', title: 'Role B', status: 'insufficient', reason: 'No skills section', source: {}, skills: [] },
      },
    },
    indexFile: { skillToOccupations: { sk_a: ['A-1'], sk_b: ['A-1'], sk_c: ['A-1'] }, nameToSkill: { 'python programming': 'sk_a', django: 'sk_b', safety: 'sk_c' } },
  })

describe('skill dataset lookups', () => {
  it('lists validated skills of an occupation, and all of them when asked', () => {
    const data = fixture()
    expect(data.skillsForOccupation('A-1').map((item) => item.skillId)).toEqual(['sk_a', 'sk_b'])
    expect(data.skillsForOccupation('A-1', { validatedOnly: false })).toHaveLength(3)
    expect(data.skillsForOccupation('nope')).toBeNull()
  })

  it('finds occupations by skill ID, name or app skill label', () => {
    const data = fixture()
    expect(data.occupationsForSkill('sk_a').map((item) => item.code)).toEqual(['A-1'])
    expect(data.occupationsForSkill('  Python   Programming ').map((item) => item.code)).toEqual(['A-1'])
    expect(data.occupationsForSkill('unknown skill')).toEqual([])
  })

  it('keeps Python and a related framework as separate skills', () => {
    const data = fixture()
    expect(data.resolveSkill('python programming')).not.toBe(data.resolveSkill('django'))
  })

  it('compares a person with an occupation without inventing a score', () => {
    const result = fixture().compare('A-1', ['Python programming', 'bookkeeping'])
    expect(result.matched.map((item) => item.skillId)).toEqual(['sk_a'])
    expect(result.missing.map((item) => item.skillId)).toEqual(['sk_b'])
    expect(result.uncertain.map((item) => item.skillId)).toEqual(['sk_c'])
    expect(result.coverage).toBe(0.5)
    expect(result.unknownInputs).toEqual(['bookkeeping'])
  })

  it('an occupation without skills has no coverage number, not zero', () => {
    const result = fixture().compare('B-2', ['Python programming'])
    expect(result.status).toBe('insufficient')
    expect(result.coverage).toBeNull()
  })

  it('explains a relation with the quoted statement and its source', () => {
    const why = fixture().explain('A-1', 'sk_b')
    expect(why.evidence[0].quote).toContain('Django')
    expect(why.source.url).toBe('https://example.org/A-1')
    expect(why.evidenceStrength).toBe('official_single_source')
    expect(fixture().explain('A-1', 'sk_x')).toBeNull()
  })

  it('lists occupations that are not fully researched, with the reason', () => {
    expect(fixture().coverageGaps()).toEqual([{ code: 'B-2', title: 'Role B', status: 'insufficient', reason: 'No skills section' }])
  })

  it('normaliseName matches the builder basics', () => {
    expect(normaliseName('Problem-solving & Decision-making!')).toBe('problem solving and decision making')
  })
})

describe('name resolution matches the builder', () => {
  const rules = { spelling: { organisational: 'organizational' }, trailing: ['skills', 'skill'] }
  const keyFor = makeKeyFor(rules)

  it('folds spelling, drops a trailing "skills" and a leading "the"', () => {
    expect(keyFor('Organisational Skills')).toBe('organizational')
    expect(keyFor('The Arabic language')).toBe('arabic language')
    expect(keyFor('Computer skills')).toBe('computer')
  })

  it('finds a skill through an alias key and through its original wording', () => {
    const data = createSkillDataset({
      catalogueFile: { meta: {}, skills: [{ id: 'sk_o', key: 'microsoft office applications', name: 'Microsoft Office applications', aliasKeys: ['ms office'], taxonomy: {} }] },
      occupationFile: { occupations: {} },
      indexFile: { skillToOccupations: {}, normalisation: rules, nameToSkill: { 'microsoft office applications': 'sk_o', 'ms office': 'sk_o' } },
    })
    expect(data.resolveSkill('MS Office')).toBe('sk_o')
    expect(data.resolveSkill('Microsoft Office Applications skills')).toBe('sk_o')
  })

  it('a related app skill is a hint on the missing row, never a match', () => {
    const data = createSkillDataset({
      catalogueFile: { meta: {}, skills: [{ id: 'sk_p', key: 'python scripting', name: 'Python scripting', aliasKeys: [], taxonomy: { relatedAppSkills: ['Python programming'] } }] },
      occupationFile: { occupations: { 'A-1': { code: 'A-1', title: 'A', status: 'ok', source: {}, skills: [relation('sk_p', 'Python scripting')] } } },
      indexFile: { skillToOccupations: { sk_p: ['A-1'] }, normalisation: rules, nameToSkill: { 'python scripting': 'sk_p' } },
    })
    const result = data.compare('A-1', ['Python programming'])
    expect(result.matched).toEqual([])
    expect(result.coverage).toBe(0)
    expect(result.missing[0]).toMatchObject({ skillId: 'sk_p', relatedYouHave: 'Python programming' })
  })
})

describe('saved dataset is compatible with the matching data (skipped when not built)', () => {
  const directory = new URL('../data/skills/', import.meta.url)
  const built = existsSync(new URL('occupations.json', directory))
  it.skipIf(!built)('every evidence statement ID exists in the eMASCO data for the same occupation, and no importance is invented', async () => {
    const data = await loadSkillDataset(new URL('../data/skills', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    const source = JSON.parse(readFileSync(new URL('../data/emasco/occupations.json', import.meta.url), 'utf8'))
    const statements = new Map(source.skills.map((statement) => [statement.id, statement]))
    let checked = 0
    for (const code of ['2524-02', '3512-05', '2411-01', '7111-01']) {
      for (const item of data.skillsForOccupation(code, { validatedOnly: false }) ?? []) {
        expect(item.importance).toBeNull()
        for (const proof of item.evidence) {
          if (!proof.statementId) continue
          const statement = statements.get(proof.statementId)
          expect(statement.roles).toContain(code)
          expect(statement.text).toBe(proof.quote)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(20)
    expect(data.size.occupations).toBeGreaterThan(1700)
  })

  it.skipIf(!built)('the original wording of every sampled relation resolves back to the same skill', async () => {
    const data = await loadSkillDataset(new URL('../data/skills', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    const file = JSON.parse(readFileSync(new URL('../data/skills/occupations.json', import.meta.url), 'utf8'))
    let checked = 0
    let wrong = 0
    for (const record of Object.values(file.occupations)) {
      for (const item of record.skills.slice(0, 2)) {
        for (const term of item.originalTerms.slice(0, 1)) {
          checked += 1
          if (data.resolveSkill(term) !== item.skillId) wrong += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(2000)
    expect(wrong / checked).toBeLessThan(0.02)
  })
})

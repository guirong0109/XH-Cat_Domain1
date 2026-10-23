import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  EMASCO_CUTOFF,
  MIN_MATCHED,
  buildIndex,
  loadEmascoIndex,
  skillScores,
  rankRoles,
  rankByProfile,
  matchCv,
  matchCvByProfile,
  matchPickedSkills,
  isUsefulLine,
  LOW_CONFIDENCE_BELOW
} from '../server/emascoMatch.js'
import { inputHash, packVectors, roleInputs } from '../scripts/lib/emascoEmbed.js'
import { MODEL_ID } from '../server/embed.js'

// Four skills, one unit vector each (dimension 4).
const unit = (position) => [0, 1, 2, 3].map((index) => (index === position ? 1 : 0))
const skillList = ['Skill A', 'Skill B', 'Skill C', 'Skill D'].map((text, row) => ({
  id: `s0000${row + 1}`,
  text
}))
const skillVectors = Float32Array.from([unit(0), unit(1), unit(2), unit(3)].flat())
const entry = (text, type) => ({ text, type })
const role = (code, skills, extra = {}) => ({
  code,
  title: `Role ${code}`,
  url: `https://emasco.mohr.gov.my/masco/${code}`,
  qualification: 'Diploma',
  tags: ['STEM'],
  skills,
  ...extra
})
const occupations = {
  skills: skillList,
  roles: [
    role('1111-01', [entry('Skill A', 'basic'), entry('Skill B', 'specific'), entry('Skill C', 'specific')]),
    role('1111-02', [entry('Skill A', 'basic'), entry('Skill B', 'specific'), entry('Skill C', 'specific')]),
    role('2222-01', [
      entry('Skill A', 'basic'), entry('Skill B', 'specific'), entry('Skill C', 'basic'), entry('Skill D', 'specific')
    ]),
    role('3333-01', [entry('Skill A', 'basic'), entry('Skill D', 'specific')]),
    role('4444-01', [
      entry('Skill A', 'basic'), entry('Skill A', 'specific'), entry('Skill B', 'basic'), entry('Skill C', 'basic')
    ])
  ],
  tasksOnly: [role('9999-01', [], { tasks: ['Do things.'] })]
}
const index = buildIndex({ occupations, skillVectors, dimension: 4 })
const cvLines = ['I know A', 'I know B', 'I know C']
const lineVectors = [unit(0), unit(1), unit(2)]
const codes = (result) => result.roles.map((entryRole) => entryRole.code)

describe('skillScores', () => {
  it('gives the best score per skill and the line that gave it', () => {
    const { scores, lines } = skillScores(lineVectors, index)
    expect(Array.from(scores)).toEqual([1, 1, 1, 0])
    expect(Array.from(lines).slice(0, 3)).toEqual([0, 1, 2])
  })
})

describe('rankRoles', () => {
  const rank = (overrides = {}) => {
    const { scores, lines } = skillScores(lineVectors, index)
    return rankRoles({ scores, lines, cvLines, index, cutoff: 0.9, ...overrides })
  }

  it('uses weights 1 for basic and 1.5 for specific', () => {
    const result = rank()
    const byCode = Object.fromEntries(result.roles.map((entryRole) => [entryRole.code, entryRole]))
    expect(byCode['1111-01'].matchPercent).toBe(100)
    expect(byCode['2222-01'].matchPercent).toBe(70) // (1 + 1.5 + 1) / (1 + 1.5 + 1 + 1.5)
    expect(byCode['2222-01']).toMatchObject({ matchedCount: 3, requiredCount: 4 })
  })

  it('does not rank a role with fewer than the minimum matched skills', () => {
    expect(MIN_MATCHED).toBe(3)
    expect(codes(rank())).not.toContain('3333-01')
  })

  it('orders ties by matched count, then by code', () => {
    // 4444-01 also scores 100 but matches 4 entries, so it comes first; the twins 1111-01 / 1111-02 follow by code
    expect(codes(rank()).slice(0, 3)).toEqual(['4444-01', '1111-01', '1111-02'])
  })

  it('counts a skill listed twice in a role once per entry', () => {
    const duplicate = rank().roles.find((entryRole) => entryRole.code === '4444-01')
    expect(duplicate).toMatchObject({ requiredCount: 4, matchedCount: 4, matchPercent: 100 })
  })

  it('never returns tasks-only roles', () => {
    expect(codes(rank())).not.toContain('9999-01')
  })

  it('lists have (with the CV line as evidence) and missing skills', () => {
    const second = rank().roles.find((entryRole) => entryRole.code === '2222-01')
    expect(second.have.map((item) => item.text)).toEqual(['Skill A', 'Skill B', 'Skill C'])
    expect(second.have[0]).toMatchObject({ type: 'basic', evidence: 'I know A', score: 1 })
    expect(second.missing).toEqual([{ text: 'Skill D', type: 'specific' }])
  })

  it('treats a score equal to the cutoff as matched and one just below as missing', () => {
    expect(codes(rank({ cutoff: 1 })).length).toBeGreaterThan(0)
    const result = rank({ cutoff: 1.0001 })
    expect(result.status).toBe('not-enough-skills')
  })

  it('returns top 5 at most', () => {
    expect(rank({ top: 2 }).roles).toHaveLength(2)
  })

  it('says no-role-match when skills match but no role reaches the minimum', () => {
    // A, B, C match, but each of these roles has only 1-2 of them
    const sparse = buildIndex({
      occupations: {
        skills: skillList,
        roles: [role('5555-01', [entry('Skill A', 'basic'), entry('Skill D', 'basic')]),
          role('5555-02', [entry('Skill B', 'basic'), entry('Skill D', 'basic')]),
          role('5555-03', [entry('Skill C', 'basic'), entry('Skill D', 'basic')])],
        tasksOnly: []
      },
      skillVectors,
      dimension: 4
    })
    const { scores, lines } = skillScores(lineVectors, sparse)
    expect(rankRoles({ scores, lines, cvLines, index: sparse, cutoff: 0.9 })).toMatchObject({
      status: 'no-role-match', matchedSkillCount: 3, roles: []
    })
  })

  it('says not-enough-skills when fewer than 3 skills match in total', () => {
    const { scores, lines } = skillScores([unit(0), unit(1)], index)
    const result = rankRoles({ scores, lines, cvLines: ['a', 'b'], index, cutoff: 0.9 })
    expect(result).toMatchObject({ status: 'not-enough-skills', matchedSkillCount: 2, roles: [] })
  })
})

describe('matchCv', () => {
  it('returns not-enough-skills for empty text without calling the embedder', async () => {
    let calls = 0
    const embedder = { embed: async () => { calls += 1; return [] } }
    const result = await matchCv({ text: '  \n 12 \n', embedder, index, cutoff: 0.9 })
    expect(result.status).toBe('not-enough-skills')
    expect(calls).toBe(0)
  })

  it('splits the text, embeds the lines and ranks', async () => {
    const embedder = { embed: async (lines) => lines.map((line) => unit('ABC'.indexOf(line.at(-1)))) }
    const result = await matchCv({ text: '- I know A\n- I know B\n- I know C', embedder, index, cutoff: 0.9 })
    expect(result.status).toBe('ok')
    expect(codes(result)).toContain('1111-01')
  })
})

describe('loadEmascoIndex', () => {
  let directory
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'emasco-index-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function writeCache(texts) {
    await writeFile(path.join(directory, 'skills.f32'), packVectors([unit(0), unit(1), unit(2), unit(3)]))
    const roleCodes = [...occupations.roles, ...occupations.tasksOnly].map((item) => item.code)
    await writeFile(path.join(directory, 'roles.f32'), packVectors(roleCodes.map((code, row) => unit(row % 4))))
    await writeFile(path.join(directory, 'roles_ids.json'), JSON.stringify(roleCodes))
    await writeFile(
      path.join(directory, 'meta.json'),
      JSON.stringify({
        modelId: MODEL_ID,
        dimension: 4,
        skillsHash: inputHash(texts, MODEL_ID),
        rolesHash: inputHash(roleInputs(occupations).texts, MODEL_ID),
        skillCount: 4
      })
    )
  }

  it('loads a cache that matches the occupations file', async () => {
    await writeCache(skillList.map((skill) => skill.text))
    const loaded = await loadEmascoIndex({ cacheDirectory: directory, occupations })
    expect(loaded.skillCount).toBe(4)
    expect(loaded.roles).toHaveLength(5)
  })

  it('refuses role vectors that do not match the occupations file', async () => {
    await writeCache(skillList.map((skill) => skill.text))
    const changed = { ...occupations, roles: [{ ...occupations.roles[0], title: 'Changed title' }, ...occupations.roles.slice(1)] }
    await expect(loadEmascoIndex({ cacheDirectory: directory, occupations: changed })).rejects.toThrow(/Rebuild/)
  })

  it('refuses a missing cache with a rebuild message', async () => {
    await expect(loadEmascoIndex({ cacheDirectory: path.join(directory, 'nope'), occupations })).rejects.toThrow(/Rebuild/)
  })

  it('refuses a cache built from different skill texts', async () => {
    await writeCache(['x', 'y', 'z', 'w'])
    await expect(loadEmascoIndex({ cacheDirectory: directory, occupations })).rejects.toThrow(/Rebuild/)
  })
})

describe('rankByProfile and matchCvByProfile', () => {
  const half = Math.SQRT1_2
  const roleCodes = ['1111-01', '1111-02', '2222-01', '3333-01', '4444-01', '9999-01']
  const roleVectors = Float32Array.from([unit(0), unit(1), unit(2), unit(3), [half, half, 0, 0], unit(0)].flat())
  const profileIndex = buildIndex({ occupations, skillVectors, dimension: 4, roleVectors, roleCodes })
  const run = (vectors, lines = ['a', 'b', 'c'], extra = {}) => {
    const { scores, lines: winning } = skillScores(vectors, profileIndex)
    return rankByProfile({ lineVectors: vectors, cvLines: lines, index: profileIndex, scores, lines: winning, cutoff: 0.9, ...extra })
  }

  it('ranks by the mean of the 3 best lines against the role vector, ties by code', () => {
    const result = run([unit(0), unit(0), unit(0)])
    expect(codes(result)).toEqual(['1111-01', '4444-01', '1111-02', '2222-01', '3333-01'])
    expect(result.roles[0].similarity).toBe(1)
    expect(result.roles[1].similarity).toBeCloseTo(half, 4)
    expect(result.roles[0].bestLines).toHaveLength(3)
  })

  it('uses only the best 5 of many lines', () => {
    const many = [unit(0), unit(0), unit(0), unit(0), unit(0), unit(3), unit(3), unit(3)]
    const result = run(many, many.map((item, position) => `line ${position}`))
    expect(result.roles[0]).toMatchObject({ code: '1111-01', similarity: 1 })
    expect(result.roles[0].bestLines).toHaveLength(5)
  })

  it('never returns tasks-only roles', () => {
    expect(codes(run([unit(0), unit(0), unit(0)], undefined, { top: 10 }))).not.toContain('9999-01')
  })

  it('lists the role skills closest first with a matched flag, evidence and the strict coverage', () => {
    const result = run([unit(0), unit(1), unit(2)], ['I know A', 'I know B', 'I know C'], { top: 10 })
    const role = result.roles.find((item) => item.code === '2222-01')
    expect(role.skills.map((item) => [item.text, item.matched])).toEqual([
      ['Skill A', true], ['Skill B', true], ['Skill C', true], ['Skill D', false]
    ])
    expect(role.skills[0].evidence).toBe('I know A')
    expect(role.skills[3].evidence).toBeNull()
    expect(role.skillCoverage).toBe(70)
  })

  it('marks the result low confidence when the best similarity is under the limit', () => {
    expect(LOW_CONFIDENCE_BELOW).toBe(0.45)
    const faint = [0.3, 0.3, 0.3, 0.3]
    expect(run([faint, faint, faint]).confidence).toBe('low')
    expect(run([unit(0), unit(0), unit(0)]).confidence).toBe('ok')
  })

  it('throws when the index has no role vectors', () => {
    const { scores, lines } = skillScores(lineVectors, index)
    expect(() => rankByProfile({ lineVectors, cvLines, index, scores, lines })).toThrow(/role vectors/)
  })

  it('asks for more lines when there are fewer than 3, without calling the embedder', async () => {
    let calls = 0
    const embedder = { embed: async () => { calls += 1; return [] } }
    const result = await matchCvByProfile({ text: 'digital transformation\nSQL', embedder, index: profileIndex })
    expect(result).toMatchObject({ status: 'not-enough-skills', lineCount: 2, roles: [] })
    expect(calls).toBe(0)
  })

  it('embeds the lines and ranks when there are 3 or more', async () => {
    const embedder = { embed: async (lines) => lines.map(() => unit(0)) }
    const result = await matchCvByProfile({ text: 'one skill\ntwo skill\nthree skill', embedder, index: profileIndex, cutoff: 0.9 })
    expect(result.status).toBe('ok')
    expect(codes(result)[0]).toBe('1111-01')
  })
})

describe('level filter, grade merge and picked skills', () => {
  const abc = [entry('Skill A', 'basic'), entry('Skill B', 'basic'), entry('Skill C', 'basic')]
  const levelOccupations = {
    skills: skillList,
    roles: [
      role('2262-02', abc, { title: 'Pharmacist Grade UF9', qualification: 'Bachelor’s degree or equivalent' }),
      role('2262-03', abc, { title: 'Pharmacist Grade UF10', qualification: 'Bachelor’s degree or equivalent' }),
      role('3333-01', abc, { title: 'Technician', qualification: 'Diploma or equivalent' }),
      role('4444-01', abc, { title: 'Clerk', qualification: 'Sijil Pelajaran Malaysia (SPM) or Equivalent' })
    ],
    tasksOnly: []
  }
  const levelCodes = ['2262-02', '2262-03', '3333-01', '4444-01']
  const levelRoleVectors = Float32Array.from([unit(0), [0.9, Math.sqrt(1 - 0.81), 0, 0], [0.5, Math.sqrt(0.75), 0, 0], unit(1)].flat())
  const levelIndex = buildIndex({ occupations: levelOccupations, skillVectors, dimension: 4, roleVectors: levelRoleVectors, roleCodes: levelCodes })
  const same = [unit(0), unit(0), unit(0)]
  const rank = (options = {}) => rankByProfile({ lineVectors: same, cvLines: ['a', 'b', 'c'], index: levelIndex, cutoff: 0.9, ...options })

  it('keeps every role by default and says nothing was hidden', () => {
    const result = rank()
    expect(codes(result)).toEqual(['2262-02', '2262-03', '3333-01', '4444-01'])
    expect(result.hiddenByLevel).toBe(0)
    expect(result.roles[2]).toMatchObject({ qualificationLevel: 'diploma', baseTitle: 'Technician' })
  })

  it('hides roles above maxLevel and counts them', () => {
    const result = rank({ maxLevel: 'diploma' })
    expect(codes(result)).toEqual(['3333-01', '4444-01'])
    expect(result.hiddenByLevel).toBe(2)
  })

  it('returns an empty list, not an error, when the filter hides everything', () => {
    const result = rank({ maxLevel: 'none' })
    expect(result).toMatchObject({ status: 'ok', roles: [], hiddenByLevel: 4 })
  })

  it('merges grades of one job in one unit group into the best-scoring card', () => {
    const result = rank({ groupGrades: true })
    expect(codes(result)).toEqual(['2262-02', '3333-01', '4444-01'])
    expect(result.roles[0].grades).toEqual([
      { code: '2262-02', grade: 'UF9', url: 'https://emasco.mohr.gov.my/masco/2262-02' },
      { code: '2262-03', grade: 'UF10', url: 'https://emasco.mohr.gov.my/masco/2262-03' }
    ])
    expect(result.roles[1].grades).toBeUndefined()
  })

  it('does not merge when grouping is off', () => {
    expect(codes(rank())).toContain('2262-03')
  })

  it('matchPickedSkills uses the skills own vectors as the lines and their texts as evidence', () => {
    const result = matchPickedSkills({ skillIds: ['s00001', 's00002', 's00003'], index: levelIndex, cutoff: 0.9, top: 2 })
    expect(result.status).toBe('ok')
    expect(result.roles).toHaveLength(2)
    expect(result.roles[0].skills.find((item) => item.matched).evidence).toMatch(/^Skill [ABC]$/)
  })

  it('matchPickedSkills counts a repeated id once and asks for 3 different skills', () => {
    const result = matchPickedSkills({ skillIds: ['s00001', 's00001', 's00002'], index: levelIndex })
    expect(result).toMatchObject({ status: 'not-enough-skills', lineCount: 2, roles: [] })
  })

  it('matchPickedSkills throws on an unknown skill id', () => {
    expect(() => matchPickedSkills({ skillIds: ['s00001', 's00002', 'nope'], index: levelIndex })).toThrow(/nope/)
  })
})

describe('isUsefulLine', () => {
  it('drops CV headings and filler, in English and Malay, ignoring case and a trailing colon', () => {
    for (const line of ['EXPERIENCE', 'Projects:', 'OTHER', 'About Me', 'Pengalaman', 'Hobbies: reading novels', 'Referee: Encik Wan, lecturer']) {
      expect(isUsefulLine(line)).toBe(false)
    }
  })
  it('keeps real lines and short typed skills, including all-capital ones', () => {
    for (const line of ['SQL', 'HTML', 'Python programming', 'Built MySQL sales reports', 'Skills in welding']) {
      expect(isUsefulLine(line)).toBe(true)
    }
  })
  it('matchCvByProfile ignores filler lines when counting the minimum', async () => {
    const embedder = { embed: async () => { throw new Error('should not be called') } }
    const result = await matchCvByProfile({ text: 'EXPERIENCE\nOTHER\nHobbies: cycling\nSQL\nPython', embedder, index })
    expect(result).toMatchObject({ status: 'not-enough-skills', lineCount: 2 })
  })
})

it('keeps the cutoff chosen by the evaluation', () => {
  expect(EMASCO_CUTOFF).toBe(0.69)
})

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
  matchCv
} from '../server/emascoMatch.js'
import { inputHash, packVectors } from '../scripts/lib/emascoEmbed.js'
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
    await writeFile(
      path.join(directory, 'meta.json'),
      JSON.stringify({ modelId: MODEL_ID, dimension: 4, skillsHash: inputHash(texts, MODEL_ID), skillCount: 4 })
    )
  }

  it('loads a cache that matches the occupations file', async () => {
    await writeCache(skillList.map((skill) => skill.text))
    const loaded = await loadEmascoIndex({ cacheDirectory: directory, occupations })
    expect(loaded.skillCount).toBe(4)
    expect(loaded.roles).toHaveLength(5)
  })

  it('refuses a missing cache with a rebuild message', async () => {
    await expect(loadEmascoIndex({ cacheDirectory: path.join(directory, 'nope'), occupations })).rejects.toThrow(/Rebuild/)
  })

  it('refuses a cache built from different skill texts', async () => {
    await writeCache(['x', 'y', 'z', 'w'])
    await expect(loadEmascoIndex({ cacheDirectory: directory, occupations })).rejects.toThrow(/Rebuild/)
  })
})

it('keeps the cutoff chosen by the evaluation', () => {
  expect(EMASCO_CUTOFF).toBe(0.69)
})

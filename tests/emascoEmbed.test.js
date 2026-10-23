import { describe, it, expect } from 'vitest'
import {
  skillInputs,
  roleInputs,
  profileText,
  inputHash,
  validateVector,
  packVectors,
  unpackVectors
} from '../scripts/lib/emascoEmbed.js'

const roleWithSkills = {
  code: '2511-01',
  title: 'Analyst',
  description: 'Studies data.',
  tasks: ['Task one.'],
  skills: [{ text: 'SQL', type: 'specific' }, { text: 'Teamwork', type: 'basic' }]
}
const tasksOnlyRole = {
  code: '1111-01',
  title: 'Legislator',
  description: 'Makes laws.',
  tasks: ['Draft laws.', 'Lead debates.'],
  skills: []
}

describe('profileText', () => {
  it('is title, description, then each skill, one per line', () => {
    expect(profileText(roleWithSkills)).toBe('Analyst\nStudies data.\nSQL\nTeamwork')
  })
  it('uses the tasks for a role without skills', () => {
    const text = profileText(tasksOnlyRole)
    expect(text).toContain('Draft laws.')
    expect(text).toContain('Lead debates.')
    expect(text.length).toBeGreaterThan(0)
  })
  it('is cut to maxChars', () => {
    expect(profileText(roleWithSkills, 15).length).toBeLessThanOrEqual(15)
  })
})

describe('skillInputs and roleInputs', () => {
  const occupations = {
    skills: [{ id: 's00001', text: 'Alpha' }, { id: 's00002', text: 'Beta' }],
    roles: [roleWithSkills],
    tasksOnly: [tasksOnlyRole]
  }
  it('keeps the file order of skills', () => {
    expect(skillInputs(occupations)).toEqual({ ids: ['s00001', 's00002'], texts: ['Alpha', 'Beta'] })
  })
  it('puts roles before tasks-only roles and uses codes as ids', () => {
    const inputs = roleInputs(occupations)
    expect(inputs.ids).toEqual(['2511-01', '1111-01'])
    expect(inputs.texts).toHaveLength(2)
  })
  it('throws, naming the id, when a skill text is empty or only spaces', () => {
    expect(() => skillInputs({ skills: [{ id: 's00009', text: '   ' }] })).toThrow(/s00009/)
  })
  it('throws, naming the code, when a role profile is empty', () => {
    const empty = { code: '9999-99', title: ' ', description: '', tasks: [], skills: [] }
    expect(() => roleInputs({ roles: [empty], tasksOnly: [] })).toThrow(/9999-99/)
  })
})

describe('inputHash', () => {
  it('is stable, including for non-ASCII text', () => {
    expect(inputHash(['perakaunan é'], 'm')).toBe(inputHash(['perakaunan é'], 'm'))
  })
  it('changes with a text, the text order or the model id', () => {
    const base = inputHash(['a', 'b'], 'm')
    expect(inputHash(['a', 'c'], 'm')).not.toBe(base)
    expect(inputHash(['b', 'a'], 'm')).not.toBe(base)
    expect(inputHash(['a', 'b'], 'other')).not.toBe(base)
  })
})

describe('validateVector', () => {
  it('accepts a unit vector of the right length', () => {
    expect(() => validateVector([1, 0, 0], 3)).not.toThrow()
  })
  it('rejects a wrong length, NaN and a vector that is not unit length', () => {
    expect(() => validateVector([1, 0], 3)).toThrow()
    expect(() => validateVector([Number.NaN, 0, 0], 3)).toThrow()
    expect(() => validateVector([2, 0, 0], 3)).toThrow()
  })
})

describe('packVectors and unpackVectors', () => {
  it('round-trips within float32 precision', () => {
    const vectors = [[0.6, 0.8, 0], [0, 0, 1]]
    const back = unpackVectors(packVectors(vectors), 3)
    expect(back).toHaveLength(2)
    back.forEach((row, rowIndex) =>
      row.forEach((value, columnIndex) => expect(value).toBeCloseTo(vectors[rowIndex][columnIndex], 6))
    )
  })
  it('rejects a buffer that is not a whole number of rows', () => {
    expect(() => unpackVectors(Buffer.alloc(10), 3)).toThrow()
  })
})

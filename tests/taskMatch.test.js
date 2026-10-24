import { describe, expect, it } from 'vitest'
import { dot, emascoTaskInputs, roleExposure, topMatches } from '../scripts/lib/taskMatch.js'

describe('emascoTaskInputs', () => {
  it('lists each distinct task once with every role that uses it, and skips empty tasks', () => {
    const occupations = {
      roles: [{ code: 'A', tasks: ['Do x.', ' ', 'Do y.'] }, { code: 'B', tasks: ['Do x.', 5] }],
      tasksOnly: [{ code: 'C', tasks: ['Do z.'] }],
    }
    const { texts, items } = emascoTaskInputs(occupations)
    expect(texts).toEqual(['Do x.', 'Do y.', 'Do z.'])
    expect(items[0].codes).toEqual(['A', 'B'])
  })
})

describe('topMatches', () => {
  const candidates = Float32Array.from([1, 0, 0, 1, 0.6, 0.8])
  it('returns the closest rows first', () => {
    const query = Float32Array.from([0, 1])
    const best = topMatches(query, 0, candidates, 3, 2, 2)
    expect(best.map((item) => item.row)).toEqual([1, 2])
    expect(best[0].score).toBeCloseTo(1)
    expect(dot(query, 0, candidates, 4, 2)).toBeCloseTo(0.8)
  })
})

describe('roleExposure', () => {
  const matches = [
    { score: 0.9, penetration: 0.5 },
    { score: 0.8, penetration: 0.1 },
    { score: 0.7, penetration: 0.0 },
    { score: 0.4, penetration: 1.0 },
  ]
  it('averages only the tasks above the cutoff', () => {
    const result = roleExposure(matches, { cutoff: 0.7 })
    expect(result.exposure).toBeCloseTo(0.2)
    expect([result.tasksUsed, result.tasksTotal]).toEqual([3, 4])
  })
  it('returns null when fewer than the minimum tasks matched', () => {
    expect(roleExposure(matches, { cutoff: 0.85 })).toBeNull()
  })
})

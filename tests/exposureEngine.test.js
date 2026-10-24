import { describe, expect, it } from 'vitest'
import { CUTOFF, MIN_TASKS, buildAllExposure, distinctness, roleExposure } from '../scripts/lib/exposureEngine.js'

const task = (text, score, penetration) => ({ text, onetTask: `O*NET ${text}`, score, penetration })

describe('roleExposure', () => {
  const matched = [task('a', 0.9, 0.5), task('b', 0.85, 0), task('c', 0.8, 0.1), task('d', 0.6, 1)]

  it('uses the documented cutoff and minimum', () => {
    expect(CUTOFF).toBe(0.8)
    expect(MIN_TASKS).toBe(3)
  })

  it('averages only matched tasks at or above the cutoff and counts the share with observed use', () => {
    const result = roleExposure(matched)
    expect(result.status).toBe('ok')
    expect(result.exposure).toBeCloseTo(0.2, 3)
    expect(result.observedShare).toBeCloseTo(0.667, 3)
    expect([result.tasksUsed, result.tasksTotal]).toEqual([3, 4])
  })

  it('lists AI-used tasks most used first and human tasks (no observed use)', () => {
    const result = roleExposure(matched)
    expect(result.aiTasks.map((item) => item.task)).toEqual(['a', 'c'])
    expect(result.humanTasks.map((item) => item.task)).toEqual(['b'])
    expect(result.aiTasks[0]).toMatchObject({ onetTask: 'O*NET a', penetration: 0.5 })
  })

  it('says not_enough instead of a number when fewer than 3 tasks matched', () => {
    const result = roleExposure([task('a', 0.9, 0.5), task('b', 0.5, 1)])
    expect(result).toEqual({ status: 'not_enough', tasksUsed: 1, tasksTotal: 2 })
  })

  it('a role with no tasks is not_enough', () => {
    expect(roleExposure([]).status).toBe('not_enough')
  })

  it('a role where nothing has observed use is ok with exposure 0, not hidden', () => {
    const result = roleExposure([task('a', 0.9, 0), task('b', 0.9, 0), task('c', 0.9, 0)])
    expect(result).toMatchObject({ status: 'ok', exposure: 0, observedShare: 0 })
    expect(result.aiTasks).toEqual([])
  })
})

describe('buildAllExposure', () => {
  const items = [{ text: 'x' }, { text: 'y' }, { text: 'z' }]
  const onet = [{ task: 'OX', penetration: 0.9 }, { task: 'OY', penetration: 0 }]
  const matches = [[{ onet: 0, score: 0.9 }], [{ onet: 1, score: 0.85 }], [{ onet: 1, score: 0.81 }]]

  it('gives different roles different results from their own tasks', () => {
    const roles = [
      { code: 'A', title: 'A', tasks: ['x', 'y', 'z'] },
      { code: 'B', title: 'B', tasks: ['y', 'z', 'y'] },
      { code: 'C', title: 'C', tasks: ['x'] },
    ]
    const result = buildAllExposure({ roles, items, matches, onet })
    expect(result.A.exposure).toBeCloseTo(0.3, 3)
    expect(result.B.exposure).toBe(0)
    expect(result.C.status).toBe('not_enough')
    expect(distinctness(result)).toEqual({ roles: 2, distinctPairs: 2 })
  })

  it('ignores tasks that were never matched', () => {
    const result = buildAllExposure({ roles: [{ code: 'A', title: 'A', tasks: ['x', 'unknown', 5] }], items, matches, onet })
    expect(result.A.tasksTotal).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { scoreCv } from '../scripts/eval-cv.mjs'

describe('scoreCv', () => {
  it('counts a perfect match', () => {
    expect(scoreCv(['A', 'B'], ['B', 'A'])).toEqual({ tp: 2, fp: 0, fn: 0 })
  })
  it('counts one wrong skill as a false positive', () => {
    expect(scoreCv(['A', 'B', 'X'], ['A', 'B'])).toEqual({ tp: 2, fp: 1, fn: 0 })
  })
  it('counts one missed skill as a false negative', () => {
    expect(scoreCv(['A'], ['A', 'B'])).toEqual({ tp: 1, fp: 0, fn: 1 })
  })
})

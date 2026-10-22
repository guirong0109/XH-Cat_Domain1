import { describe, expect, it } from 'vitest'
import { matchSkills, skillTexts, splitCvLines } from '../server/cvMatch.js'

describe('splitCvLines', () => {
  it('cleans bullets and drops short lines', () => {
    expect(splitCvLines('• Built MySQL reports\r\n\r\n- Led a team of 4\n  ab\n')).toEqual([
      'Built MySQL reports',
      'Led a team of 4',
    ])
  })
  it('strips numbering and keeps at most 300 lines', () => {
    expect(splitCvLines('1. Data entry work')).toEqual(['Data entry work'])
    expect(splitCvLines(Array(400).fill('Line text').join('\n'))).toHaveLength(300)
  })
})

describe('skillTexts', () => {
  it('uses statements, label, or label+keywords', () => {
    expect(skillTexts({ label: 'A', keywords: ['k'], statements: ['s'] }, 'label')).toEqual(['A', 's'])
    expect(skillTexts({ label: 'A', keywords: ['k'] }, 'label')).toEqual(['A'])
    expect(skillTexts({ label: 'A', keywords: ['k'] }, 'label+keywords')).toEqual(['A', 'k'])
  })
})

describe('matchSkills', () => {
  const lines = ['one', 'two']
  const lineVectors = [[1, 0], [0, 1]]
  const skills = [{ label: 'X' }, { label: 'Y' }]
  it('picks the best line and sorts highest first', () => {
    const sets = [[[0.6, 0.8]], [[1, 0]]]
    expect(matchSkills(lines, lineVectors, skills, sets, 0.6)).toEqual([
      { label: 'Y', score: 1, evidence: 'one' },
      { label: 'X', score: 0.8, evidence: 'two' },
    ])
  })
  it('keeps a score equal to the cutoff and drops lower ones', () => {
    const sets = [[[0.6, 0.5]], [[0.5, 0.5]]]
    expect(matchSkills(lines, lineVectors, skills, sets, 0.6)).toEqual([
      { label: 'X', score: 0.6, evidence: 'one' },
    ])
  })
  it('lets the higher-scoring text of a skill decide', () => {
    const out = matchSkills(lines, lineVectors, [{ label: 'X' }], [[[0.1, 0.1], [0, 1]]], 0.5)
    expect(out).toEqual([{ label: 'X', score: 1, evidence: 'two' }])
  })
  it('handles empty input and cuts long evidence', () => {
    expect(matchSkills([], [], skills, [[[1, 0]], [[1, 0]]], 0.1)).toEqual([])
    expect(matchSkills(lines, lineVectors, [], [], 0.1)).toEqual([])
    const out = matchSkills(['a'.repeat(100)], [[1, 0]], [{ label: 'X' }], [[[1, 0]]], 0.5)
    expect(out[0].evidence).toBe('a'.repeat(79) + '…')
  })
})

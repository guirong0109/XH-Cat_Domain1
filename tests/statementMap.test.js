import { describe, it, expect } from 'vitest'
import { linkStatements, groupStatements, toCsv } from '../scripts/lib/statementMap.js'

const skills = [{ label: 'A' }, { label: 'B' }]
const skillVecs = [[1, 0], [0, 1]]
const st = (text, code = '1') => ({ code, role: 'R', type: 'basic', text })

describe('linkStatements', () => {
  it('links at or above the cutoff and keeps the best skill and score', () => {
    const out = linkStatements([st('x'), st('y')], [[1, 0], [0.6, 0.8]], skills, skillVecs, 0.8)
    expect(out[0]).toMatchObject({ linked: 'A', best: 'A', score: 1 })
    expect(out[1]).toMatchObject({ linked: 'B', best: 'B' })
    expect(out[1].score).toBeCloseTo(0.8)
  })
  it('equal to the cutoff links; below does not but keeps best', () => {
    const eq = linkStatements([st('x')], [[0.5, 0]], skills, skillVecs, 0.5)
    expect(eq[0].linked).toBe('A')
    const lo = linkStatements([st('x')], [[0.4, 0]], skills, skillVecs, 0.5)
    expect(lo[0]).toMatchObject({ linked: null, best: 'A' })
  })
})

describe('groupStatements', () => {
  it('groups single-link at the cutoff, numbered in order of first appearance', () => {
    const items = [st('a'), st('b'), st('c'), st('d')]
    const vecs = [[1, 0], [0, 1], [1, 0.01], [0, 1.01]]
    const g = groupStatements(items, vecs, 0.99)
    expect(g.map((x) => x.group)).toEqual(['g01', 'g02'])
    expect(g[0].members.map((m) => m.text)).toEqual(['a', 'c'])
    expect(g[1].members.map((m) => m.text)).toEqual(['b', 'd'])
  })
  it('chains single-link', () => {
    const items = [st('a'), st('b'), st('c')]
    const vecs = [[1, 0], [0.8, 0.6], [0.28, 0.96]]
    const g = groupStatements(items, vecs, 0.79)
    expect(g).toHaveLength(1)
    expect(g[0].members).toHaveLength(3)
  })
  it('identical text (trim, case-insensitive) shares a group even when vectors differ', () => {
    const items = [st('Do it', '1'), st('other', '1'), st('  do IT ', '2')]
    const g = groupStatements(items, [[1, 0], [0, 1], [0.6, 0.8]], 0.99)
    const withDo = g.find((x) => x.members.some((m) => m.text === 'Do it'))
    expect(withDo.members.map((m) => m.code)).toEqual(['1', '2'])
  })
  it('all linked means no unlinked items and no groups', () => {
    expect(groupStatements([], [], 0.8)).toEqual([])
  })
})

describe('toCsv', () => {
  it('writes BOM, header and quoted fields', () => {
    const csv = toCsv([{ code: '1', role: 'R, x', type: 'basic', text: 'say "hi", ok', best: 'A', score: 0.123456, group: '', decision: 'link' }])
    expect(csv.startsWith('﻿code,role,type,statement,best_existing,score,group,decision\r\n')).toBe(true)
    expect(csv).toContain('1,"R, x",basic,"say ""hi"", ok",A,0.1235,,link')
  })
})

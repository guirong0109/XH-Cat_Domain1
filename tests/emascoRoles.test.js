import { describe, it, expect } from 'vitest'
import { LEVELS, qualificationLevel, levelRank, splitGrade, groupKey, createSkillSearch } from '../server/emascoRoles.js'

describe('qualificationLevel', () => {
  it('reads the eMASCO qualification texts', () => {
    expect(qualificationLevel('Diploma or equivalent')).toBe('diploma')
    expect(qualificationLevel('Sijil Pelajaran Malaysia (SPM) or Equivalent')).toBe('spm')
    expect(qualificationLevel('No formal qualification is required')).toBe('none')
    expect(qualificationLevel('Primary education')).toBe('none')
    expect(qualificationLevel('Bachelor’s degree or equivalent')).toBe('degree')
    expect(qualificationLevel('Bachelor�s degree or equivalent')).toBe('degree')
    expect(qualificationLevel('Master’s degree or equivalent')).toBe('master')
    expect(qualificationLevel('Doctoral (PhD) or equivalent')).toBe('phd')
    expect(qualificationLevel('Certificate or equivalent')).toBe('certificate')
  })
  it('says other for text it does not know, and for empty text', () => {
    expect(qualificationLevel('Some new wording')).toBe('other')
    expect(qualificationLevel('')).toBe('other')
    expect(qualificationLevel(undefined)).toBe('other')
  })
  it('orders the levels, with other counted as the lowest so it is never hidden by the filter', () => {
    expect(levelRank('none')).toBeLessThan(levelRank('spm'))
    expect(levelRank('spm')).toBeLessThan(levelRank('certificate'))
    expect(levelRank('certificate')).toBeLessThan(levelRank('diploma'))
    expect(levelRank('diploma')).toBeLessThan(levelRank('degree'))
    expect(levelRank('degree')).toBeLessThan(levelRank('phd'))
    expect(levelRank('other')).toBe(0)
    expect(LEVELS.diploma).toBe(3)
  })
})

describe('splitGrade', () => {
  it('separates the civil-service grade from the base title', () => {
    expect(splitGrade('Pharmacist Grade UF9')).toEqual({ base: 'Pharmacist', grade: 'UF9' })
    expect(splitGrade('Designer Grade B6, B7')).toEqual({ base: 'Designer', grade: 'B6, B7' })
    expect(splitGrade('Pilot/Pilot Examiner Grade AT12')).toEqual({ base: 'Pilot/Pilot Examiner', grade: 'AT12' })
  })
  it('keeps a trailing parenthetical as part of the base title', () => {
    expect(splitGrade('Producer Grade B6 (Stage Play Assistant Director)')).toEqual({
      base: 'Producer (Stage Play Assistant Director)',
      grade: 'B6'
    })
  })
  it('leaves a title without a grade alone', () => {
    expect(splitGrade('Cook')).toEqual({ base: 'Cook', grade: '' })
  })
})

describe('groupKey', () => {
  it('is the same for grades of one job in one unit group, different otherwise', () => {
    const first = groupKey({ code: '2262-02', title: 'Pharmacist Grade UF9' })
    expect(groupKey({ code: '2262-03', title: 'Pharmacist Grade UF10' })).toBe(first)
    expect(groupKey({ code: '2263-03', title: 'Pharmacist Grade UF10' })).not.toBe(first)
    expect(groupKey({ code: '2262-04', title: 'Dentist Grade UG9' })).not.toBe(first)
  })
})

describe('createSkillSearch', () => {
  const skills = [
    { id: 's1', text: 'Proficiency in Microsoft Excel for reports', roles: ['a', 'b'] },
    { id: 's2', text: 'Excel skills', roles: ['a'] },
    { id: 's3', text: 'Basic welding', roles: [] },
    { id: 's4', text: 'Reports in excel and word', roles: ['c'] }
  ]
  const search = createSkillSearch(skills)
  it('needs every word, ignores case, and puts texts that start with the query and short texts first', () => {
    expect(search('EXCEL').map((item) => item.id)).toEqual(['s2', 's4', 's1'])
    expect(search('excel reports').map((item) => item.id)).toEqual(['s4', 's1'])
  })
  it('puts whole-word matches before longer words that merely contain the query', () => {
    const find = createSkillSearch([
      { id: 'a', text: 'Excellent attention to detail', roles: [] },
      { id: 'b', text: 'Proficiency in the use of the Microsoft Excel application', roles: [] }
    ])
    expect(find('excel').map((item) => item.id)).toEqual(['b', 'a'])
  })
  it('treats punctuation in the query as plain text', () => {
    const find = createSkillSearch([{ id: 'a', text: 'C++ programming (basic)', roles: [] }])
    expect(find('c++').map((item) => item.id)).toEqual(['a'])
    expect(find('(basic)').map((item) => item.id)).toEqual(['a'])
  })
  it('returns the id, text and how many roles use the skill', () => {
    expect(search('welding')).toEqual([{ id: 's3', text: 'Basic welding', roles: 0 }])
  })
  it('returns nothing for an empty or blank query and caps the limit at 20', () => {
    expect(search('')).toEqual([])
    expect(search('   ')).toEqual([])
    const many = createSkillSearch(Array.from({ length: 50 }, (item, number) => ({ id: `s${number}`, text: `skill ${number}`, roles: [] })))
    expect(many('skill', 100)).toHaveLength(20)
    expect(many('skill', 5)).toHaveLength(5)
  })
  it('copes with a very long query', () => {
    expect(search('x'.repeat(5000))).toEqual([])
  })
})

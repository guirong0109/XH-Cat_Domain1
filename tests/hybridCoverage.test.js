import { describe, expect, it } from 'vitest'
import { createBm25Ranker } from '../server/hybridSearch.js'

const skills = [
  { id: '1', text: 'Pengetahuan dalam sistem pengurusan kualiti.', roles: [] },
  { id: '2', text: 'Time management skills.', roles: [] },
  { id: '3', text: 'Manage time and organise schedules.', roles: [] },
  { id: '4', text: 'Proficiency in project management tools.', roles: [] },
  { id: '5', text: 'Project planning and cost control.', roles: [] },
  { id: '6', text: 'Management of staff.', roles: [] }
]

describe('BM25 coverage rule', () => {
  it('without it, one shared word is enough (the first version)', () => {
    const rows = createBm25Ranker(skills)('pengurusan masa')
    expect(rows).toContain(0)
  })
  it('with two query words, both must appear', () => {
    const rank = createBm25Ranker(skills, { coverage: true })
    expect(rank('pengurusan masa')).toEqual([])
    expect(rank('project management')).toEqual([3])
    expect(rank('management')).toEqual(expect.arrayContaining([1, 3, 5]))
  })
  it('with longer queries, at least 75% of the words must appear', () => {
    const rank = createBm25Ranker(skills, { coverage: true })
    // 4 words need 3: only "Proficiency in project management tools." has project, management, tools
    expect(rank('project management tools office')).toEqual([3])
    expect(rank('zzz yyy xxx www')).toEqual([])
  })
  it('keeps a single-word query working and ignores repeated words', () => {
    const rank = createBm25Ranker(skills, { coverage: true })
    expect(rank('welding')).toEqual([])
    expect(rank('project project')).toEqual(expect.arrayContaining([3, 4]))
  })
})

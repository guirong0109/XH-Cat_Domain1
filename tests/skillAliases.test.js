import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const aliasFile = JSON.parse(readFileSync('data/team/skill_aliases.json', 'utf8'))
const occupations = JSON.parse(readFileSync('data/emasco/occupations.json', 'utf8'))
const texts = occupations.skills.map((skill) => skill.text.toLowerCase())
const norm = (text) => text.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')

describe('data/team/skill_aliases.json', () => {
  const concepts = aliasFile.concepts
  it('is marked as a draft for the team to review', () => expect(aliasFile.status).toBe('draft'))
  it('has unique ids and an English label for every concept', () => {
    expect(new Set(concepts.map((c) => c.id)).size).toBe(concepts.length)
    for (const concept of concepts) expect(concept.label.length).toBeGreaterThan(2)
  })
  it('points every concept at real eMASCO skills (at least 3 skills contain one of its terms)', () => {
    for (const concept of concepts) {
      const hits = texts.filter((text) => concept.terms.some((term) => text.includes(term.toLowerCase()))).length
      expect({ id: concept.id, enough: hits >= 3 }).toEqual({ id: concept.id, enough: true })
    }
  })
  it('gives each concept a Malay alias, and no alias belongs to two concepts', () => {
    const owner = new Map()
    for (const concept of concepts) {
      expect(concept.aliases.ms.length).toBeGreaterThan(0)
      for (const alias of [...concept.aliases.en, ...concept.aliases.ms, concept.label]) {
        const key = norm(alias)
        if (owner.has(key)) expect({ alias, owner: owner.get(key) }).toEqual({ alias, owner: concept.id })
        owner.set(key, concept.id)
      }
    }
  })
  it('leaves out words whose Malay meaning is ambiguous', () => {
    const all = new Set(concepts.flatMap((c) => c.aliases.ms.map(norm)))
    for (const word of ['keselamatan', 'akaun', 'kira']) expect(all.has(word)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { buildConcepts, createConceptRanker, createHybridSearch, expandQuery } from '../server/hybridSearch.js'

describe('bilingual concepts', () => {
  const aliasFile = {
    concepts: [
      { id: 'accounting', label: 'accounting', aliases: { en: ['accounting'], ms: ['perakaunan'] }, terms: ['accounting', 'accountant'] },
      { id: 'patient-care', label: 'patient care', aliases: { en: ['patient care'], ms: ['jaga pesakit', 'penjagaan pesakit'] }, terms: ['patient care', 'care for patients'] }
    ]
  }
  const pool = [
    { id: 'a', text: 'Basic accounting skills.', roles: [] },
    { id: 'b', text: 'Account management.', roles: [] },
    { id: 'c', text: 'terhadap perincian.', roles: [] },
    { id: 'd', text: 'Provide care for patients on the ward.', roles: [] },
    { id: 'e', text: 'Active listening to understand patient needs.', roles: [] }
  ]
  const concepts = buildConcepts({ aliasFile })
  const rank = createConceptRanker(pool, concepts)

  it('expands a verified Malay alias to the English concept and keeps the other words', () => {
    expect(expandQuery('Perakaunan!', rank('Perakaunan!').matches)).toBe('accounting')
    expect(expandQuery('saya belajar perakaunan di kolej', rank('saya belajar perakaunan di kolej').matches)).toBe('saya belajar accounting di kolej')
    expect(expandQuery('JAGA   Pesakit', rank('JAGA   Pesakit').matches)).toBe('patient care')
  })
  it('does not expand English queries, unknown words or ambiguous words with no verified alias', () => {
    expect(expandQuery('accounting', rank('accounting').matches)).toBeNull()
    expect(expandQuery('keselamatan', rank('keselamatan').matches)).toBeNull()
    expect(rank('akaun').rows).toEqual([])
  })
  it('does not treat part of a word as an alias', () => {
    expect(rank('perakaunannya').rows).toEqual([])
    expect(rank('accountingx').rows).toEqual([])
  })
  it('records the alias, language and term behind every concept hit', () => {
    const found = rank('perakaunan')
    expect(found.rows).toEqual([0])
    expect(found.matches).toEqual([{ concept: 'accounting', id: 'accounting', source: 'alias-file', alias: 'perakaunan', lang: 'ms' }])
    expect(found.why.get(0)).toEqual([{ concept: 'accounting', alias: 'perakaunan', term: 'accounting' }])
  })
  it('does not merge related concepts: accounting does not return account management', () => {
    expect(rank('perakaunan').rows).not.toContain(1)
  })
  it('names both concepts when a query holds two aliases', () => {
    expect(rank('perakaunan dan jaga pesakit').concepts.sort()).toEqual(['accounting', 'patient care'])
  })

  const index = { dimension: 2, skillCount: 5, skillVectors: Float32Array.from([1, 0, 0.8, 0.6, 0, 1, 0, 1, 0.7, 0.7]) }
  const spy = () => {
    const asked = []
    return { asked, embedder: { isReady: () => true, embed: async (texts) => { asked.push(...texts); return [[1, 0]] } } }
  }
  it('asks the model for the English concept instead of the Malay word, and keeps the typed query', async () => {
    const { asked, embedder } = spy()
    const out = await createHybridSearch({ skills: pool, index, embedder, concepts })('perakaunan')
    expect(asked).toEqual(['accounting'])
    expect(out.query).toEqual({ original: 'perakaunan', expanded: 'accounting' })
    expect(out.skills[0]).toMatchObject({ id: 'a', foundBy: expect.arrayContaining(['concept', 'meaning']), why: [{ concept: 'accounting', alias: 'perakaunan', term: 'accounting' }] })
  })
  it('can ask for both the typed and the expanded query, or only the typed one', async () => {
    const both = spy()
    await createHybridSearch({ skills: pool, index, embedder: both.embedder, concepts, aliasSemantic: 'both' })('perakaunan')
    expect(both.asked).toEqual(['perakaunan', 'accounting'])
    const off = spy()
    await createHybridSearch({ skills: pool, index, embedder: off.embedder, concepts, aliasSemantic: 'off' })('perakaunan')
    expect(off.asked).toEqual(['perakaunan'])
  })
  it('does not ask for a translation when the query has no verified alias', async () => {
    const { asked, embedder } = spy()
    const out = await createHybridSearch({ skills: pool, index, embedder, concepts })('kemahiran komputer')
    expect(asked).toEqual(['kemahiran komputer'])
    expect(out.query.expanded).toBeNull()
    expect(out.aliases).toEqual([])
  })
  it('keeps the meaning floor: a query whose best cosine is below it gets no meaning hits', async () => {
    const embedder = { isReady: () => true, embed: async () => [[0.5, 0.5]] }
    const weak = { dimension: 2, skillCount: 5, skillVectors: Float32Array.from([0.4, 0.2, 0.3, 0.3, 0.1, 0.1, 0.2, 0.2, 0.3, 0.1]) }
    const out = await createHybridSearch({ skills: pool, index: weak, embedder, concepts: [] })('qzxv')
    expect(out.skills).toEqual([])
    expect(out.status).toEqual({ meaning: 'ran' })
  })
  it('reports limited when the caller says meaning search is not allowed', async () => {
    const embedder = { isReady: () => true, embed: async () => { throw new Error('must not be called') } }
    const out = await createHybridSearch({ skills: pool, index, embedder, concepts })('accounting', 5, { meaningAllowed: false })
    expect(out.status).toEqual({ meaning: 'limited' })
    expect(out.skills[0].id).toBe('a')
  })
})

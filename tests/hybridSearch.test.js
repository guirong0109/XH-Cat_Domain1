import { describe, expect, it, vi } from 'vitest'
import { rrf, buildConcepts, expandQuery, createBm25Ranker, createConceptRanker, createDenseRanker, createReranker, createHybridSearch } from '../server/hybridSearch.js'

const skills = [
  { id: 'a', text: 'Prepare accounts and bookkeeping records', roles: ['r1', 'r2'] },
  { id: 'b', text: 'Proficiency in Microsoft Excel for reports', roles: ['r1'] },
  { id: 'c', text: 'Excellent attention to detail', roles: [] },
  { id: 'd', text: 'C++ programming (basic)', roles: [] },
  { id: 'e', text: 'Perakaunan dan simpan kira', roles: [] }
]

describe('rrf', () => {
  it('adds 1/(k+rank) per list, keeps the ranks and breaks ties by id', () => {
    const out = rrf({ x: [1, 2], y: [2, 1] }, 60)
    expect(out.map((item) => item.id)).toEqual([1, 2])
    expect(out[0].ranks).toEqual({ x: 1, y: 2 })
    expect(out[0].score).toBeCloseTo(1 / 61 + 1 / 62)
  })
  it('handles empty lists', () => expect(rrf({ x: [], y: [] })).toEqual([]))
})

describe('bm25', () => {
  const rank = createBm25Ranker(skills)
  it('ranks whole words and ignores unknown words', () => {
    expect(rank('excel')[0]).toBe(1)
    expect(rank('zzzz')).toEqual([])
  })
  it('lets a rarer word weigh more', () => expect(rank('microsoft reports')[0]).toBe(1))
})

describe('concept ranker', () => {
  const concepts = [{ label: 'Spreadsheets (Excel)', keywords: ['microsoft excel', 'excel spreadsheet'] }, { label: 'SQL and databases', keywords: ['sql'], notKeywords: ['sql account'] }]
  const rank = createConceptRanker(skills, buildConcepts({ teamSkills: concepts }))
  it('finds skills that use the keywords of the concept the query names, and says which alias and term did it', () => {
    const found = rank('microsoft excel')
    expect(found.rows).toEqual([1])
    expect(found.concepts).toEqual(['Spreadsheets (Excel)'])
    expect(found.why.get(1)).toEqual([{ concept: 'Spreadsheets (Excel)', alias: 'microsoft excel', term: 'microsoft excel' }])
  })
  it('says nothing when no concept is named', () => expect(rank('welding').rows).toEqual([]))
  it('works with no concepts', () => expect(createConceptRanker(skills, buildConcepts({}))('excel').rows).toEqual([]))
})

describe('dense ranker', () => {
  const unit = (x, y) => { const n = Math.hypot(x, y); return [x / n, y / n] }
  const index = { dimension: 2, skillCount: 3, skillVectors: Float32Array.from([...unit(1, 0), ...unit(1, 0.2), ...unit(0, 1)]) }
  it('keeps hits near the best one and drops far ones', async () => {
    const embedder = { embed: vi.fn(async () => [unit(1, 0.05)]) }
    expect(await createDenseRanker({ index, embedder })('q')).toEqual([0, 1])
  })
  it('returns nothing when even the best hit is weak, and caches the query vector', async () => {
    const embedder = { embed: vi.fn(async () => [[0.1, 0.1]]) }
    const rank = createDenseRanker({ index, embedder })
    expect(await rank('q')).toEqual([])
    await rank('q')
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })
  it('rejects a vector of the wrong size', async () => {
    await expect(createDenseRanker({ index, embedder: { embed: async () => [[1, 0, 0]] } })('q')).rejects.toThrow(/wrong size/)
  })
})

describe('reranker', () => {
  it('is off without a model id', () => expect(createReranker({})).toBeNull())
  it('is skipped once and logged when the model cannot load', async () => {
    const log = vi.fn()
    const reranker = createReranker({ modelId: 'm', loadModel: async () => { throw new Error('no model') }, log })
    expect(await reranker.rerank('q', ['a'])).toBeNull()
    expect(await reranker.rerank('q', ['a'])).toBeNull()
    expect(log).toHaveBeenCalledTimes(1)
  })
})

describe('createHybridSearch', () => {
  const base = { skills, concepts: [] }
  it('finds exact text, keeps whole words first and treats punctuation as plain text', async () => {
    const search = createHybridSearch(base)
    expect((await search('excel')).skills.map((s) => s.id).slice(0, 2)).toEqual(['b', 'c'])
    expect((await search('c++')).skills[0].id).toBe('d')
  })
  it('returns the shape the screen needs and says why meaning search is off', async () => {
    const out = await createHybridSearch(base)('accounts')
    expect(out.skills[0]).toEqual({ id: 'a', text: skills[0].text, roles: 2, foundBy: expect.any(Array), semantic: null, why: [] })
    expect(out.notes[0]).toMatch(/meaning-search-off/)
  })
  it('returns nothing for an empty query and caps the limit', async () => {
    const search = createHybridSearch(base)
    expect((await search('  ')).skills).toEqual([])
    expect((await search('excel', 1)).skills).toHaveLength(1)
  })
  it('adds a Malay or synonym hit through the meaning ranker', async () => {
    const index = { dimension: 2, skillCount: 5, skillVectors: Float32Array.from([0, 1, 0, 1, 0, 1, 0, 1, 1, 0]) }
    const embedder = { isReady: () => true, embed: async () => [[1, 0]] }
    const out = await createHybridSearch({ ...base, index, embedder })('perakaunan')
    expect(out.skills.map((s) => s.id)).toContain('e')
    expect(out.skills[0].foundBy).toContain('meaning')
    expect(out.methods).toContain('meaning')
  })
  it('falls back to keyword search when the model is loading or fails', async () => {
    const index = { dimension: 2, skillCount: 5, skillVectors: new Float32Array(10) }
    const loading = await createHybridSearch({ ...base, index, embedder: { isReady: () => false, embed: async () => [[1, 0]] } })('excel')
    expect(loading.notes[0]).toMatch(/loading/)
    const broken = await createHybridSearch({ ...base, index, embedder: { isReady: () => true, embed: async () => { throw new Error('boom') } } })('excel')
    expect(broken.notes[0]).toBe('meaning-search-failed')
    expect(broken.skills.length).toBeGreaterThan(0)
  })
  it('reorders with the reranker and falls back when it fails', async () => {
    const reranker = { rerank: async (q, texts) => texts.map((t) => (t.includes('Excellent') ? 1 : 0)) }
    const out = await createHybridSearch({ ...base, reranker })('excel')
    expect(out.skills[0].id).toBe('c')
    expect(out.methods).toContain('rerank')
    const off = await createHybridSearch({ ...base, reranker: { rerank: async () => null } })('excel')
    expect(off.notes.join()).toMatch(/rerank-skipped/)
  })
  it('lists only the rankers that returned candidates', async () => {
    const out = await createHybridSearch(base)('welding qzxv')
    expect(out.methods).toEqual([])
    const some = await createHybridSearch(base)('excel')
    expect(some.methods).toEqual(['exact', 'bm25'])
  })
  it('says meaning search ran even when it found nothing', async () => {
    const index = { dimension: 2, skillCount: 5, skillVectors: Float32Array.from([0, 1, 0, 1, 0, 1, 0, 1, 1, 0]) }
    const embedder = { isReady: () => true, embed: async () => [[0.1, 0.1]] }
    const out = await createHybridSearch({ ...base, index, embedder })('excel')
    expect(out.status).toEqual({ meaning: 'ran' })
    expect(out.methods).not.toContain('meaning')
  })
  it('reports off, loading and failed in status, and never leaks the internal error text', async () => {
    const index = { dimension: 2, skillCount: 5, skillVectors: new Float32Array(10) }
    expect((await createHybridSearch(base)('excel')).status).toEqual({ meaning: 'off' })
    expect((await createHybridSearch({ ...base, index, embedder: { isReady: () => false, embed: async () => [[1, 0]] } })('excel')).status).toEqual({ meaning: 'loading' })
    const log = vi.fn()
    const failed = await createHybridSearch({ ...base, index, log, embedder: { isReady: () => true, embed: async () => { throw new Error('http://10.0.0.5/secret failed') } } })('excel')
    expect(failed.status).toEqual({ meaning: 'failed' })
    expect(JSON.stringify(failed)).not.toContain('10.0.0.5')
    expect(log).toHaveBeenCalled()
  })
  it('survives a very long query and odd characters', async () => {
    const search = createHybridSearch(base)
    expect((await search('x'.repeat(5000))).skills).toEqual([])
    expect((await search('"; DROP TABLE -- \ [ ( * ?')).skills).toEqual([])
  })
})

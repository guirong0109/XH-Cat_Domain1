import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readResearch, refreshResearch } from '../server/research.js'

const now = new Date('2026-10-21T00:00:00Z')
const terms = [
  { label: 'Spreadsheets (Excel)', researchTerm: 'spreadsheet' },
  { label: 'Version control (Git)', researchTerm: 'version control' },
]

function countFor(url) {
  const year = Number(/publication_year:(\d{4})/.exec(url)[1])
  return url.includes(encodeURIComponent('spreadsheet')) ? year - 1900 : year - 1800
}

function okFetch(url) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ meta: { count: countFor(url) } }) })
}

let directory
let filePath

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  directory = await mkdtemp(path.join(tmpdir(), 'research-'))
  filePath = path.join(directory, 'research.json')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('refreshResearch', () => {
  it('success writes both years', async () => {
    const result = await refreshResearch({ filePath, terms, fetchImpl: okFetch, now })
    expect(result.status).toBe('updated')
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.source.years).toEqual([2024, 2025])
    expect(saved.source.name).toBe('OpenAlex')
    expect(saved.source.licence).toBe('CC0')
    expect(saved.source.fetchedAt).toBe(now.toISOString())
    expect(saved.skills['Spreadsheets (Excel)'].term).toBe('spreadsheet')
    expect(saved.skills['Spreadsheets (Excel)'].counts).toEqual({ 2024: 124, 2025: 125 })
    expect(Object.keys(saved.skills['Version control (Git)'].counts)).toEqual(['2024', '2025'])
    expect(result.research).toEqual(saved)
  })

  it('request urls', async () => {
    const urls = []
    const fetchImpl = vi.fn((url, options) => {
      urls.push(url)
      expect(options.headers['User-Agent']).toBe('FutureReadyMY/1.0')
      return okFetch(url)
    })
    await refreshResearch({ filePath, terms, fetchImpl, now })
    expect(urls).toHaveLength(4)
    for (const url of urls) {
      expect(url.startsWith('https://api.openalex.org/works?')).toBe(true)
      expect(url).toContain(encodeURIComponent('artificial intelligence'))
      expect(url).toMatch(/publication_year:(2024|2025)/)
      expect(url).toContain('per-page=1')
      expect(url).not.toContain('mailto')
      expect(url).not.toContain('@')
      expect(url).not.toContain(encodeURIComponent('Spreadsheets (Excel)'))
    }
    for (const term of ['spreadsheet', 'version control']) {
      const matching = urls.filter((url) => url.includes(encodeURIComponent(`"${term}"`)))
      expect(matching).toHaveLength(2)
    }
  })

  it('one failed call keeps the old file', async () => {
    const saved = { source: { fetchedAt: '2026-10-20T08:00:00.000Z' }, skills: {} }
    await writeFile(filePath, JSON.stringify(saved))
    const before = await readFile(filePath, 'utf8')
    let calls = 0
    const fetchImpl = (url) => (++calls === 3 ? Promise.reject(new Error('boom')) : okFetch(url))
    const result = await refreshResearch({ filePath, terms, fetchImpl, now })
    expect(result.status).toBe('failed')
    expect(result.message).toBe('Showing research data from 2026-10-20. Live refresh failed.')
    expect(await readFile(filePath, 'utf8')).toBe(before)
    expect(result.research).toEqual(saved)
  })

  it('missing count fails', async () => {
    let calls = 0
    const fetchImpl = (url) =>
      ++calls === 2
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ meta: {} }) })
        : okFetch(url)
    const result = await refreshResearch({ filePath, terms, fetchImpl, now })
    expect(result.status).toBe('failed')
    expect(result.message).toBe('Live refresh failed. No saved research data yet.')
    expect(result.research).toBeNull()
    expect(existsSync(filePath)).toBe(false)
  })

  it('non-OK status fails', async () => {
    const fetchImpl = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
    const result = await refreshResearch({ filePath, terms, fetchImpl, now })
    expect(result.status).toBe('failed')
  })

  it('single in-flight', async () => {
    const fetchImpl = vi.fn(okFetch)
    const [first, second] = await Promise.all([
      refreshResearch({ filePath, terms, fetchImpl, now }),
      refreshResearch({ filePath, terms, fetchImpl, now }),
    ])
    expect(first).toBe(second)
    expect(fetchImpl).toHaveBeenCalledTimes(2 * terms.length)
  })

  it('runs at most 5 requests at a time', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `L${i}`, researchTerm: `t${i}` }))
    let active = 0
    let peak = 0
    const fetchImpl = async (url) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return okFetch(url)
    }
    const result = await refreshResearch({ filePath, terms: many, fetchImpl, now })
    expect(result.status).toBe('updated')
    expect(peak).toBeLessThanOrEqual(5)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('readResearch', () => {
  it('returns null for a missing file', async () => {
    expect(await readResearch(filePath)).toBeNull()
  })
})

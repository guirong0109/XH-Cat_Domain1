import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { request, SourceError } from '../server/sources/http.js'
import { createSourceMonitor } from '../server/sources/monitor.js'
import * as arxiv from '../server/sources/arxiv.js'
import * as semanticScholar from '../server/sources/semanticScholar.js'
import * as huggingface from '../server/sources/huggingface.js'
import * as anthropicIndex from '../server/sources/anthropicIndex.js'
import { SOURCES, describeSources, pingSources } from '../server/sources/registry.js'
import { preferredCounts, refreshSignals, readSignals } from '../server/sources/signals.js'

const reply = (status, body, { text = false } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
  text: async () => (text ? body : JSON.stringify(body)),
})
const noSleep = () => Promise.resolve()

describe('request', () => {
  it('returns the body and records a success', async () => {
    const monitor = { record: vi.fn() }
    const result = await request('http://x', { fetchImpl: async () => reply(200, { a: 1 }), monitor, sourceId: 's', sleep: noSleep })
    expect(result.body).toEqual({ a: 1 })
    expect(monitor.record).toHaveBeenCalledWith(expect.objectContaining({ id: 's', ok: true, status: 200 }))
  })

  it('retries a 429 and then succeeds', async () => {
    const answers = [reply(429, {}), reply(200, { ok: true })]
    const fetchImpl = vi.fn(async () => answers.shift())
    const result = await request('http://x', { fetchImpl, sleep: noSleep })
    expect(result.attempts).toBe(2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives rate_limit after the last retry and records the failure', async () => {
    const monitor = { record: vi.fn() }
    await expect(request('http://x', { fetchImpl: async () => reply(429, {}), sleep: noSleep, monitor, sourceId: 's' }))
      .rejects.toMatchObject({ kind: 'rate_limit', status: 429 })
    expect(monitor.record).toHaveBeenCalledWith(expect.objectContaining({ ok: false, kind: 'rate_limit', attempts: 3 }))
  })

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn(async () => reply(404, {}))
    await expect(request('http://x', { fetchImpl, sleep: noSleep })).rejects.toMatchObject({ kind: 'http', status: 404 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('names a timeout and a network error', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    await expect(request('http://x', { fetchImpl: async () => { throw timeout }, sleep: noSleep, retries: 0 })).rejects.toMatchObject({ kind: 'timeout' })
    await expect(request('http://x', { fetchImpl: async () => { throw new Error('down') }, sleep: noSleep, retries: 0 })).rejects.toMatchObject({ kind: 'network' })
  })

  it('reports invalid JSON', async () => {
    const bad = { ...reply(200, null), json: async () => { throw new Error('bad') } }
    await expect(request('http://x', { fetchImpl: async () => bad, sleep: noSleep, retries: 0 })).rejects.toBeInstanceOf(SourceError)
  })
})

describe('source monitor', () => {
  async function make(now = () => new Date('2026-10-24T00:00:00Z')) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mon-'))
    return { monitor: createSourceMonitor({ filePath: path.join(dir, 's.json'), now }), dir }
  }
  const registry = [{ id: 'a' }, { id: 'b' }]

  it('starts as never, then ok after a success', async () => {
    const { monitor } = await make()
    expect((await monitor.snapshot(registry))[0].health).toBe('never')
    monitor.record({ id: 'a', ok: true, status: 200, latencyMs: 120 })
    const row = (await monitor.snapshot(registry))[0]
    expect(row.health).toBe('ok')
    expect(row.averageLatencyMs).toBe(120)
  })

  it('is degraded after 1-2 failures and down after 3', async () => {
    const { monitor } = await make()
    monitor.record({ id: 'a', ok: true })
    monitor.record({ id: 'a', ok: false, kind: 'rate_limit', error: 'HTTP 429', status: 429 })
    expect((await monitor.snapshot(registry))[0].health).toBe('degraded')
    monitor.record({ id: 'a', ok: false, kind: 'http', error: 'HTTP 500', status: 500 })
    monitor.record({ id: 'a', ok: false, kind: 'timeout', error: 'slow' })
    const row = (await monitor.snapshot(registry))[0]
    expect(row.health).toBe('down')
    expect(row.rateLimitHits).toBe(1)
    expect(row.lastError.kind).toBe('timeout')
  })

  it('a success clears the failure count', async () => {
    const { monitor } = await make()
    monitor.record({ id: 'a', ok: false, error: 'x' })
    monitor.record({ id: 'a', ok: true })
    expect((await monitor.snapshot(registry))[0].consecutiveFailures).toBe(0)
  })

  it('is degraded when the last success is older than 8 days', async () => {
    let clock = new Date('2026-10-01T00:00:00Z')
    const { monitor } = await make(() => clock)
    monitor.record({ id: 'a', ok: true })
    clock = new Date('2026-10-24T00:00:00Z')
    expect((await monitor.snapshot(registry))[0].health).toBe('degraded')
  })

  it('keeps its state in a file', async () => {
    const { monitor, dir } = await make()
    monitor.record({ id: 'a', ok: true })
    await monitor.snapshot(registry)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const again = createSourceMonitor({ filePath: path.join(dir, 's.json') })
    expect((await again.snapshot(registry))[0].lastSuccess).toBeTruthy()
  })
})

describe('fetchers', () => {
  it('Semantic Scholar reads total', async () => {
    const ctx = { fetchImpl: async () => reply(200, { total: 321, data: [] }), sleep: noSleep }
    expect(await semanticScholar.countPapers('python', 2025, ctx)).toBe(321)
    expect(semanticScholar.paperCountUrl('python', 2025)).toContain('year=2025-2025')
    await expect(semanticScholar.countPapers('python', 2025, { fetchImpl: async () => reply(200, {}), sleep: noSleep })).rejects.toThrow(/invalid/)
  })

  it('arXiv reads totalResults from the XML', async () => {
    expect(arxiv.parseTotal('<feed><opensearch:totalResults xmlns:opensearch="x">872</opensearch:totalResults></feed>')).toBe(872)
    expect(() => arxiv.parseTotal('<feed/>')).toThrow(/invalid/)
    expect(decodeURIComponent(arxiv.paperCountUrl('prompt engineering', 2025))).toContain('submittedDate:[202501010000 TO 202512312359]')
  })

  it('Hugging Face normalises models and papers and counts mentions', async () => {
    const models = [{ id: 'org/sql-llm', pipeline_tag: 'text-generation', tags: ['sql'], trendingScore: 5 }, { nope: 1 }]
    const papers = [{ paper: { id: '1', title: 'Agents for data analysis', upvotes: 3 } }, {}]
    const fetchImpl = async (url) => reply(200, url.includes('daily_papers') ? papers : models)
    const trending = await huggingface.fetchTrendingModels(5, { fetchImpl, sleep: noSleep })
    const daily = await huggingface.fetchDailyPapers(5, { fetchImpl, sleep: noSleep })
    expect(trending).toHaveLength(1)
    expect(daily).toEqual([{ id: '1', title: 'Agents for data analysis', publishedAt: null, upvotes: 3 }])
    expect(huggingface.mentions([...trending, ...daily], 'SQL')).toBe(1)
    expect(huggingface.mentions([...trending, ...daily], 'data analysis')).toBe(1)
  })

  it('Anthropic index CSV reader handles quotes and commas', () => {
    const rows = anthropicIndex.parseCsv('task,penetration\n"Accept, check ""mail"".",0.5\nPlain task,0\n')
    expect(rows).toEqual([['task', 'penetration'], ['Accept, check "mail".', '0.5'], ['Plain task', '0']])
  })

  it('Anthropic index refuses a file that looks wrong', () => {
    expect(() => anthropicIndex.parseJobExposure('occ_code,title,observed_exposure\n11-1011,Chief,0.1\n')).toThrow(/looks wrong/)
    expect(() => anthropicIndex.parseTaskPenetration('task,penetration\nA,0.1\n')).toThrow(/looks wrong/)
    expect(() => anthropicIndex.parseJobExposure('a,b\n1,2\n')).toThrow(/column/)
  })

  it('Anthropic index lists the newest release and checks the files exist', async () => {
    const tree = [{ path: 'release_2026_03_24' }, { path: 'release_2026_06_26' }, { path: 'README.md' }]
    const folder = [
      { type: 'file', path: anthropicIndex.FILES.jobExposure, oid: 'a', size: 1 },
      { type: 'file', path: anthropicIndex.FILES.taskPenetration, oid: 'b', size: 2 },
    ]
    const fetchImpl = async (url) => reply(200, url.endsWith('labor_market_impacts') ? folder : tree)
    const info = await anthropicIndex.listRelease({ fetchImpl, sleep: noSleep })
    expect(info.latestRelease).toBe('release_2026_06_26')
    expect(Object.keys(info.files)).toHaveLength(2)
    const missing = async (url) => reply(200, url.endsWith('labor_market_impacts') ? [] : tree)
    await expect(anthropicIndex.listRelease({ fetchImpl: missing, sleep: noSleep })).rejects.toThrow(/missing/)
  })
})

describe('registry', () => {
  it('lists the four new sources plus OpenAlex and OpenDOSM, each with a purpose and fallback', () => {
    const ids = SOURCES.map((source) => source.id)
    for (const id of ['anthropic-index', 'semantic-scholar', 'arxiv', 'huggingface', 'openalex', 'opendosm']) expect(ids).toContain(id)
    for (const source of describeSources()) {
      expect(source.purpose).toBeTruthy()
      expect(source.fallback).toBeTruthy()
      expect(source.ping).toBeUndefined()
    }
  })

  it('pings each source once and reports the failures', async () => {
    const fetchImpl = async (url) => (url.includes('arxiv') ? reply(500, {}) : reply(200, {}))
    const results = await pingSources({ fetchImpl, sleep: noSleep })
    expect(results).toHaveLength(SOURCES.length)
    expect(results.find((item) => item.id === 'arxiv')).toMatchObject({ ok: false, status: 500 })
    expect(results.find((item) => item.id === 'huggingface')).toMatchObject({ ok: true })
  })
})

describe('refreshSignals', () => {
  async function dataDir(extra = {}) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sig-'))
    await writeFile(path.join(dir, 'skills.json'), JSON.stringify({ labels: [{ label: 'SQL and databases', researchTerm: 'SQL' }, { label: 'Teamwork' }] }))
    for (const [name, content] of Object.entries(extra)) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
      await writeFile(path.join(dir, name), content)
    }
    return dir
  }

  const bigJobs = `occ_code,title,observed_exposure\n${Array.from({ length: 600 }, (_, i) => `11-${1000 + i},T${i},0.1`).join('\n')}\n`
  const bigTasks = `task,penetration\n${Array.from({ length: 10_050 }, (_, i) => `Task ${i},0.2`).join('\n')}\n`
  const tree = [{ path: 'release_2026_06_26' }]
  const folder = [
    { type: 'file', path: anthropicIndex.FILES.jobExposure, oid: 'a', size: 1 },
    { type: 'file', path: anthropicIndex.FILES.taskPenetration, oid: 'b', size: 2 },
  ]
  function fakeFetch({ failArxiv = false, failAll = false } = {}) {
    return async (url) => {
      if (failAll) return reply(503, {})
      if (url.includes('semanticscholar')) return reply(200, { total: 10 })
      if (url.includes('arxiv')) return failArxiv ? reply(500, {}) : reply(200, '<x><opensearch:totalResults>7</opensearch:totalResults></x>', { text: true })
      if (url.includes('daily_papers')) return reply(200, [{ paper: { id: '1', title: 'SQL agents' } }])
      if (url.includes('api/models')) return reply(200, [{ id: 'm/sql', tags: [] }])
      if (url.includes('resolve/main') && url.includes('job_exposure')) return reply(200, bigJobs, { text: true })
      if (url.includes('resolve/main')) return reply(200, bigTasks, { text: true })
      if (url.endsWith('labor_market_impacts')) return reply(200, folder)
      return reply(200, tree)
    }
  }
  const options = { sleep: noSleep, now: () => new Date('2026-10-24T00:00:00Z') }

  it('writes signals.json with papers, Hugging Face and the Anthropic release', async () => {
    const dir = await dataDir()
    const result = await refreshSignals({ dataDir: dir, fetchImpl: fakeFetch(), ...options })
    expect(result.status).toBe('ok')
    const signals = await readSignals(dir)
    expect(signals.papers['SQL and databases'].semanticScholar).toEqual({ 2024: 10, 2025: 10 })
    expect(signals.papers['SQL and databases'].arxiv).toEqual({ 2024: 7, 2025: 7 })
    expect(signals.papers.Teamwork).toBeUndefined()
    expect(signals.huggingface.mentions['SQL and databases']).toBe(2)
    expect(signals.anthropicIndex).toMatchObject({ latestRelease: 'release_2026_06_26', counts: { occupations: 600, tasks: 10_050 } })
    expect(await readFile(path.join(dir, 'cache', 'anthropic', 'job_exposure.csv'), 'utf8')).toContain('occ_code')
  })

  it('a failing source is reported and keeps its old data, the others still update', async () => {
    const dir = await dataDir({ 'signals.json': JSON.stringify({ papers: { 'SQL and databases': { arxiv: { 2024: 1, 2025: 2 } } } }) })
    const result = await refreshSignals({ dataDir: dir, fetchImpl: fakeFetch({ failArxiv: true }), ...options })
    expect(result.status).toBe('partial')
    expect(result.outcomes.find((item) => item.source === 'arxiv').status).toBe('failed')
    const signals = await readSignals(dir)
    expect(signals.papers['SQL and databases'].arxiv).toEqual({ 2024: 1, 2025: 2 })
    expect(signals.papers['SQL and databases'].semanticScholar).toEqual({ 2024: 10, 2025: 10 })
  })

  it('when every source fails nothing is written', async () => {
    const dir = await dataDir()
    const result = await refreshSignals({ dataDir: dir, fetchImpl: fakeFetch({ failAll: true }), ...options })
    expect(result.status).toBe('failed')
    expect(await readSignals(dir)).toBeNull()
  })

  it('flags new Anthropic data when the file list changed', async () => {
    const dir = await dataDir({ 'signals.json': JSON.stringify({ anthropicIndex: { files: { old: { oid: 'z' } }, counts: { occupations: 1, tasks: 1 } } }) })
    await refreshSignals({ dataDir: dir, fetchImpl: fakeFetch(), ...options })
    expect((await readSignals(dir)).anthropicIndex.newData).toBe(true)
  })

  it('preferredCounts falls back to the next source with counts', () => {
    const entry = { semanticScholar: { 2025: 5 }, arxiv: { 2025: 1 } }
    expect(preferredCounts(entry)).toEqual({ source: 'semanticScholar', counts: { 2025: 5 } })
    expect(preferredCounts({ openalex: { 2025: 9 }, ...entry }).source).toBe('openalex')
    expect(preferredCounts({})).toBeNull()
  })
})

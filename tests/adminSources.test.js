import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { FILES } from '../server/sources/anthropicIndex.js'

let directory
let server
let failing = new Set()

const bigJobs = `occ_code,title,observed_exposure\n${Array.from({ length: 600 }, (_, i) => `11-${1000 + i},T${i},0.1`).join('\n')}\n`
const bigTasks = `task,penetration\n${Array.from({ length: 10_050 }, (_, i) => `Task ${i},0.2`).join('\n')}\n`
const folder = [
  { type: 'file', path: FILES.jobExposure, oid: 'a', size: 1 },
  { type: 'file', path: FILES.taskPenetration, oid: 'b', size: 2 },
]

function reply(status, body, text = false) {
  return { ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => (text ? body : JSON.stringify(body)) }
}

function fakeFetch(url) {
  const name = ['semanticscholar', 'arxiv', 'huggingface', 'openalex', 'opendosm'].find((key) => url.includes(key))
  if (name && failing.has(name)) return Promise.resolve(reply(503, {}))
  if (url.includes('semanticscholar')) return Promise.resolve(reply(200, { total: 5 }))
  if (url.includes('arxiv')) return Promise.resolve(reply(200, '<x><opensearch:totalResults>3</opensearch:totalResults></x>', true))
  if (url.includes('daily_papers')) return Promise.resolve(reply(200, [{ paper: { id: '1', title: 'SQL agents' } }]))
  if (url.includes('api/models')) return Promise.resolve(reply(200, [{ id: 'm/sql', tags: [] }]))
  if (url.includes('resolve/main')) return Promise.resolve(reply(200, url.includes('job_exposure') ? bigJobs : bigTasks, true))
  if (url.endsWith('labor_market_impacts')) return Promise.resolve(reply(200, folder))
  if (url.includes('EconomicIndex')) return Promise.resolve(reply(200, [{ path: 'release_2026_06_26' }]))
  return Promise.resolve(reply(200, [{}]))
}

async function start() {
  server = createApp({ dataDir: directory, fetchImpl: fakeFetch, adminSleep: async () => {} }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
const get = (base, route) => fetch(`${base}/api/admin${route}`)
const post = (base, route, body = {}) =>
  fetch(`${base}/api/admin${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function untilIdle(base) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!(await (await get(base, '/job')).json()).job) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('job did not finish')
}

beforeEach(async () => {
  failing = new Set()
  directory = await mkdtemp(path.join(tmpdir(), 'admin-sources-'))
  await mkdir(path.join(directory, 'logs'), { recursive: true })
  await writeFile(path.join(directory, 'skills.json'), JSON.stringify({ labels: [{ label: 'SQL and databases', researchTerm: 'SQL' }] }))
})
afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  server = null
  await new Promise((resolve) => setTimeout(resolve, 100))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('admin sources routes', () => {
  it('lists every source with a purpose, fallback and health', async () => {
    const base = await start()
    const { sources } = await (await get(base, '/sources')).json()
    expect(sources.map((source) => source.id)).toEqual(expect.arrayContaining(['anthropic-index', 'semantic-scholar', 'arxiv', 'huggingface', 'openalex', 'opendosm']))
    for (const source of sources) {
      expect(source.health).toBe('never')
      expect(source.purpose).toBeTruthy()
      expect(source.fallback).toBeTruthy()
    }
  })

  it('test marks working sources ok and a failing source down after repeated tests', async () => {
    const base = await start()
    failing.add('arxiv')
    for (let round = 0; round < 3; round += 1) await post(base, '/sources/test', { ids: ['arxiv', 'huggingface'] })
    const { sources } = await (await get(base, '/sources')).json()
    expect(sources.find((source) => source.id === 'huggingface').health).toBe('ok')
    const arxiv = sources.find((source) => source.id === 'arxiv')
    expect(arxiv.health).toBe('down')
    expect(arxiv.lastError.status).toBe(503)
  })

  it('refresh runs as a job, saves signals and appears in the run log', async () => {
    const base = await start()
    const started = await post(base, '/sources/refresh')
    expect(started.status).toBe(202)
    await untilIdle(base)
    const { sources, data } = await (await get(base, '/sources')).json()
    expect(data.signalsUpdatedAt).toBeTruthy()
    expect(data.anthropicRelease).toBe('release_2026_06_26')
    expect(sources.find((source) => source.id === 'semantic-scholar').health).toBe('ok')
    const { runs } = await (await get(base, '/runs')).json()
    expect(runs[0]).toMatchObject({ type: 'signals-refresh', status: 'ok' })
  })

  it('a second refresh while one runs is refused', async () => {
    const base = await start()
    const first = await post(base, '/sources/refresh')
    const second = await post(base, '/sources/refresh')
    expect(first.status).toBe(202)
    expect([202, 409]).toContain(second.status)
    await untilIdle(base)
  })

  it('refresh with every source down ends as failed and saves nothing', async () => {
    const base = await start()
    ;['semanticscholar', 'arxiv', 'huggingface'].forEach((name) => failing.add(name))
    failing.add('EconomicIndex')
    await post(base, '/sources/refresh')
    await untilIdle(base)
    const { runs } = await (await get(base, '/runs')).json()
    expect(runs[0].status).toBe('failed')
    expect((await (await get(base, '/sources')).json()).data.signalsUpdatedAt).toBeNull()
  })

  it('POST needs JSON like the other admin routes', async () => {
    const base = await start()
    const response = await fetch(`${base}/api/admin/sources/test`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })
    expect(response.status).toBe(415)
  })
})

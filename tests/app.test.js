import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'

const wageRows = JSON.parse(readFileSync(new URL('./fixtures/wages_occupation.json', import.meta.url), 'utf8'))
const youthRows = JSON.parse(readFileSync(new URL('./fixtures/lfs_month_youth.json', import.meta.url), 'utf8'))

function fakeFetch(url) {
  if (url.startsWith('https://api.openalex.org/')) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ meta: { count: 50 } }) })
  }
  const fixture = url.includes('id=wages_occupation') ? wageRows : youthRows
  return Promise.resolve({ status: 200, json: async () => fixture })
}

const datasets = {
  'roles.json': [{ id: 'data-analyst' }],
  'skills.json': { labels: [{ label: 'Spreadsheets (Excel)', researchTerm: 'spreadsheet' }], similar: {} },
  'sdg.json': { 4: { label: 'SDG 4' } },
  'samples.json': [{ id: 'aina' }],
}

let directory
let server

async function start() {
  server = createApp({ dataDir: directory, fetchImpl: fakeFetch }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-'))
  for (const [name, content] of Object.entries(datasets)) {
    await writeFile(path.join(directory, name), JSON.stringify(content))
  }
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

describe('api', () => {
  it('GET /api/data returns all datasets', async () => {
    await writeFile(path.join(directory, 'trends.json'), JSON.stringify({ groups: {} }))
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/data`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      roles: datasets['roles.json'],
      skills: datasets['skills.json'],
      sdg: datasets['sdg.json'],
      samples: datasets['samples.json'],
      trends: { groups: {} },
      research: null,
      fields: null,
      references: null,
      emerging: null,
      courseChecks: null,
      skillSimilarity: null,
      observed: null,
      skillEvidence: null,
    })
  })

  it('GET /api/data passes the skill similarity file through when it exists', async () => {
    const similarity = { labels: ['A', 'B'], matrix: [[1, 0.5], [0.5, 1]] }
    await writeFile(path.join(directory, 'skill_similarity.json'), JSON.stringify(similarity))
    const baseUrl = await start()
    const body = await (await fetch(`${baseUrl}/api/data`)).json()
    expect(body.skillSimilarity).toEqual(similarity)
  })

  it('GET /api/data returns the saved course check when there is one', async () => {
    const checks = { checkedAt: '2026-10-31T10:00:00.000Z', counts: { ok: 1, changed: 0, gone: 0, unreadable: 0 }, courses: {} }
    await writeFile(path.join(directory, 'course_checks.json'), JSON.stringify(checks))
    const baseUrl = await start()
    expect((await (await fetch(`${baseUrl}/api/data`)).json()).courseChecks).toEqual(checks)
  })

  it('GET /api/data returns observed AI use for the scored roles only, with its source block', async () => {
    const file = {
      source: 'Anthropic Economic Index', url: 'https://example.org/aei', release: 'release_2026_06_26', cutoff: 0.8, minTasks: 3,
      roles: { A: { status: 'ok', exposure: 0.5 }, 'data-analyst': { status: 'not_enough' } },
    }
    await writeFile(path.join(directory, 'exposure.json'), JSON.stringify(file))
    await writeFile(path.join(directory, 'roles.json'), JSON.stringify([{ id: 'data-analyst', code: 'data-analyst' }]))
    const baseUrl = await start()
    const { observed } = await (await fetch(`${baseUrl}/api/data`)).json()
    expect(Object.keys(observed.roles)).toEqual(['data-analyst'])
    expect(observed.url).toBe('https://example.org/aei')
    expect(observed.cutoff).toBe(0.8)
  })

  it('GET /api/data without trends file returns trends null', async () => {
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/data`)
    expect(response.status).toBe(200)
    expect((await response.json()).trends).toBeNull()
  })

  it('GET /api/data includes fields when fields.json exists', async () => {
    const fields = { majors: [{ id: 'm-it', label: 'IT', groups: [] }], sectors: [], groups: [] }
    await writeFile(path.join(directory, 'fields.json'), JSON.stringify(fields))
    const baseUrl = await start()
    const body = await (await fetch(`${baseUrl}/api/data`)).json()
    expect(body.fields).toEqual(fields)
    expect(Array.isArray(body.fields.majors)).toBe(true)
  })

  it('GET /api/data without research file returns research null', async () => {
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/data`)
    expect((await response.json()).research).toBeNull()
  })

  it('GET /api/data failure returns a generic message and logs details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await writeFile(path.join(directory, 'roles.json'), '{not json')
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/data`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Could not load data.' })
    expect(console.error).toHaveBeenCalledWith('[data] load failed:', expect.any(String))
    vi.restoreAllMocks()
  })

  it('POST /api/refresh-trends returns status and message', async () => {
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/refresh-trends`, { method: 'POST' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('updated')
    expect(body.message).toBe('Updated: data to 2025.')
    expect(body.trends.source.latestYear).toBe(2025)
  })

  it('POST /api/refresh-research returns status and research', async () => {
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/refresh-research`, { method: 'POST' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('updated')
    expect(body.research.skills['Spreadsheets (Excel)'].term).toBe('spreadsheet')
    expect(Object.values(body.research.skills['Spreadsheets (Excel)'].counts)).toEqual([50, 50])
  })
})

describe('POST /api/cv-skills', () => {
  const secretLine = 'Built Excel reports for the finance team'

  function fakeEmbedder(overrides = {}) {
    return {
      modelId: 'fake-model',
      isReady: () => true,
      embed: async (texts) => texts.map((text) => (/Excel/.test(text) ? [1, 0] : [0, 1])),
      ...overrides,
    }
  }

  async function startWith(embedder, extra = {}) {
    server = createApp({ dataDir: directory, fetchImpl: fakeFetch, embedder, ...extra }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    return `http://127.0.0.1:${server.address().port}`
  }

  const post = (baseUrl, body) =>
    fetch(`${baseUrl}/api/cv-skills`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  afterEach(() => vi.restoreAllMocks())

  it('returns matches with label and evidence', async () => {
    const baseUrl = await startWith(fakeEmbedder())
    const response = await post(baseUrl, { text: `${secretLine}\nLoves hiking` })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.model).toBe('fake-model')
    expect(body.cutoff).toBe(0.72)
    expect(body.skills).toEqual([{ label: 'Spreadsheets (Excel)', score: 1, evidence: secretLine }])
  })

  it('warmCv loads skill vectors once; a later request does not embed skills again', async () => {
    const calls = []
    const embedder = fakeEmbedder({
      embed: async (texts) => {
        calls.push(texts)
        return texts.map((text) => (/Excel/.test(text) ? [1, 0] : [0, 1]))
      },
    })
    const baseUrl = await startWith(embedder)
    await server.listeners('request')[0].locals.warmCv()
    const afterWarm = calls.length
    expect(afterWarm).toBeGreaterThan(0)
    const response = await post(baseUrl, { text: secretLine })
    expect(response.status).toBe(200)
    expect(calls.length).toBe(afterWarm + 1)
    expect(calls.at(-1)).toEqual([secretLine])
  })

  it('400 for missing, non-string or blank text', async () => {
    const baseUrl = await startWith(fakeEmbedder())
    for (const body of [{}, { text: 5 }, { text: '   ' }]) {
      const response = await post(baseUrl, body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'No CV text.' })
    }
  })

  it('413 for text over 20,000 characters', async () => {
    const baseUrl = await startWith(fakeEmbedder())
    const response = await post(baseUrl, { text: 'a'.repeat(20001) })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'CV text is too long.' })
  })

  it('503 fallback when there is no embedder', async () => {
    const baseUrl = await startWith(undefined)
    const response = await post(baseUrl, { text: secretLine })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ fallback: true })
  })

  it('503 fallback fast when the model is not ready', async () => {
    const baseUrl = await startWith(fakeEmbedder({ isReady: () => false }))
    const started = Date.now()
    const response = await post(baseUrl, { text: secretLine })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ fallback: true })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('503 fallback when embedding is slower than the timeout', async () => {
    const slow = fakeEmbedder({ embed: () => new Promise((resolve) => setTimeout(() => resolve([]), 500)) })
    const baseUrl = await startWith(slow, { cvTimeoutMs: 50 })
    const response = await post(baseUrl, { text: secretLine })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ fallback: true })
  })

  it('503 fallback when embedding throws, and a later request can still work', async () => {
    let fail = true
    const embedder = fakeEmbedder({
      embed: async (texts) => {
        if (fail) throw new Error('boom')
        return texts.map((text) => (/Excel/.test(text) ? [1, 0] : [0, 1]))
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const baseUrl = await startWith(embedder)
    expect((await post(baseUrl, { text: secretLine })).status).toBe(503)
    fail = false
    expect((await post(baseUrl, { text: secretLine })).status).toBe(200)
  })

  it('loads skill vectors only once for two first requests at the same time', async () => {
    const embed = vi.fn(async (texts) => texts.map((text) => (/Excel/.test(text) ? [1, 0] : [0, 1])))
    const baseUrl = await startWith(fakeEmbedder({ embed }))
    const replies = await Promise.all([post(baseUrl, { text: secretLine }), post(baseUrl, { text: secretLine })])
    expect(replies.map((reply) => reply.status)).toEqual([200, 200])
    const skillCalls = embed.mock.calls.filter(([texts]) => texts.includes('Spreadsheets (Excel)'))
    expect(skillCalls).toHaveLength(1)
  })

  it('POST /api/refresh-references checks links and GET /api/data then returns them', async () => {
    await mkdir(path.join(directory, 'emasco'))
    await writeFile(path.join(directory, 'emasco', 'roles_raw.json'), JSON.stringify({ roles: [] }))
    const baseUrl = await start()
    const result = await (await fetch(`${baseUrl}/api/refresh-references`, { method: 'POST' })).json()
    expect(result.status).toBe('updated')
    expect(Object.keys(result.references.links).some((url) => url.includes('elatih.hrdcorp.gov.my'))).toBe(true)
    const data = await (await fetch(`${baseUrl}/api/data`)).json()
    expect(data.references.checkedAt).toBe(result.references.checkedAt)
  })

  it('POST /api/refresh-references answers 500 when the role snapshot is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/refresh-references`, { method: 'POST' })
    expect(response.status).toBe(500)
  })

  it('never logs the CV text', async () => {
    const spies = ['log', 'error', 'warn'].map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
    const failing = fakeEmbedder({ embed: async () => { throw new Error('boom') } })
    for (const embedder of [fakeEmbedder(), failing, fakeEmbedder({ isReady: () => false })]) {
      const baseUrl = await startWith(embedder)
      await post(baseUrl, { text: secretLine })
      await new Promise((resolve) => server.close(resolve))
    }
    await post(await startWith(fakeEmbedder()), { text: 'x'.repeat(20001) })
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls))
    expect(logged).not.toContain('Excel')
    expect(logged).not.toContain('finance')
  })
})

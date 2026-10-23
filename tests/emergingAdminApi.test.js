import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'

const datasets = {
  'roles.json': [{ id: 'data-analyst' }],
  'skills.json': { labels: [{ label: 'Data analysis', keywords: ['data analysis'] }], similar: {} },
  'sdg.json': { 4: { label: 'SDG 4' } },
  'samples.json': [{ id: 'aina' }],
  'fields.json': { majors: [], sectors: [], groups: ['Working with data'] },
}

const NEW_FEED = 'https://news.example.com/feed/'
const rss = `<rss><channel><item><title>Firm cuts jobs after AI push</title><link>https://news.example.com/1</link><pubDate>Wed, 22 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>`

const fetchImpl = vi.fn(async (url) => {
  if (url.startsWith('https://api.openalex.org/')) return { ok: true, status: 200, json: async () => ({ results: [] }) }
  if (url.endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' }
  if (url === NEW_FEED) return { ok: true, status: 200, text: async () => rss }
  return { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' }
})

let directory
let server
let base

async function start(emergingOptions = {}) {
  server = createApp({ dataDir: directory, fetchImpl, emergingOptions }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
}

const post = (route, body = {}, headers = {}) =>
  fetch(`${base}/api/admin/emerging${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const get = (route = '', headers = {}) => fetch(`${base}/api/admin/emerging${route}`, { headers })

const savedItem = (over = {}) => ({
  id: 'x1', title: 'Saved', url: 'https://saved.test/1', source: 'OpenAlex', confidence: 'high', language: 'en',
  publishedAt: '2026-10-20', checkedOn: '2026-10-22', fields: ['General'], skills: [], summary: '', review: 'pending', ...over,
})

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchImpl.mockClear()
  directory = await mkdtemp(path.join(tmpdir(), 'emerging-admin-'))
  for (const [name, content] of Object.entries(datasets)) await writeFile(path.join(directory, name), JSON.stringify(content))
  await writeFile(path.join(directory, 'emerging.json'), JSON.stringify({ checkedOn: '2026-10-22', checkedAt: '2026-10-22T00:00:00.000Z', tagging: 'ai', sources: [{ name: 'OpenAlex', ok: true, count: 3 }], items: [savedItem(), savedItem({ id: 'x2', url: 'https://saved.test/2', review: 'reviewed' })] }))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  server = null
  await rm(directory, { recursive: true, force: true })
})

describe('access', () => {
  it('refuses a request that came through a proxy or tunnel', async () => {
    await start()
    expect((await get('', { 'x-forwarded-for': '1.2.3.4' })).status).toBe(403)
    expect((await post('/refresh', {}, { 'cf-connecting-ip': '1.2.3.4' })).status).toBe(403)
    expect((await post('/items/x1', { action: 'delete' }, { 'x-forwarded-for': '1.2.3.4' })).status).toBe(403)
  })
  it('refuses a POST that is not JSON', async () => {
    await start()
    const response = await fetch(`${base}/api/admin/emerging/items/x1`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'action=delete' })
    expect(response.status).toBe(415)
  })
})

describe('GET /emerging', () => {
  it('shows counts, the sources with their last run, and the items', async () => {
    await start({ primary: { url: 'u', key: 'secret-key-1', model: 'm' } })
    const text = await (await get()).text()
    const body = JSON.parse(text)
    expect(body).toMatchObject({ checkedOn: '2026-10-22', tagging: 'ai', interval: 'weekly', modelConfigured: true, counts: { total: 2, pending: 1, reviewed: 1 } })
    expect(body.sources[0]).toMatchObject({ id: 'openalex', name: 'OpenAlex', fixed: true, enabled: true, lastRun: { ok: true, count: 3 } })
    expect(body.sources.length).toBeGreaterThan(9)
    expect(body.items).toHaveLength(2)
    expect(text).not.toContain('secret-key-1')
  })
  it('works before the first refresh', async () => {
    await rm(path.join(directory, 'emerging.json'))
    await start()
    const body = await (await get()).json()
    expect(body.counts).toEqual({ total: 0, pending: 0, reviewed: 0 })
    expect(body.checkedOn).toBeNull()
  })
})

describe('reviewing items', () => {
  it('marks reviewed, goes back to pending, deletes', async () => {
    await start()
    expect((await post('/items/x1', { action: 'reviewed' })).status).toBe(200)
    let saved = JSON.parse(await readFile(path.join(directory, 'emerging.json'), 'utf8'))
    expect(saved.items.find((i) => i.id === 'x1').review).toBe('reviewed')
    expect((await post('/items/x1', { action: 'pending' })).status).toBe(200)
    expect((await post('/items/x1', { action: 'delete' })).status).toBe(200)
    saved = JSON.parse(await readFile(path.join(directory, 'emerging.json'), 'utf8'))
    expect(saved.items.map((i) => i.id)).toEqual(['x2'])
    expect(saved.removedUrls).toEqual(['https://saved.test/1'])
  })
  it('answers 404 for an unknown item and 400 for an unknown action', async () => {
    await start()
    expect((await post('/items/nope', { action: 'reviewed' })).status).toBe(404)
    expect((await post('/items/x1', { action: 'explode' })).status).toBe(400)
    expect((await post('/items/x1', {})).status).toBe(400)
  })
  it('shows a reviewed item as reviewed to students in /api/data', async () => {
    await start()
    await post('/items/x1', { action: 'reviewed' })
    const data = await (await fetch(`${base}/api/data`)).json()
    expect(data.emerging.items.find((i) => i.id === 'x1').review).toBe('reviewed')
  })
})

describe('sources', () => {
  const form = { name: 'Example News', url: NEW_FEED, language: 'en', filter: 'work' }

  it('tests a feed without saving anything', async () => {
    await start()
    const result = await (await post('/test', form)).json()
    expect(result).toMatchObject({ ok: true, total: 1, passed: 1, robots: 'none' })
    const list = await (await get()).json()
    expect(list.sources.some((s) => s.url === NEW_FEED)).toBe(false)
  })
  it('refuses to test an address that is not allowed', async () => {
    await start()
    expect((await post('/test', { ...form, url: 'https://127.0.0.1/feed' })).status).toBe(400)
    expect((await post('/test', { ...form, url: 'http://news.example.com/feed' })).status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('adds a source only when the terms box is ticked, and tests it again on the server', async () => {
    await start()
    expect((await post('/sources', form)).status).toBe(400)
    expect((await post('/sources', { ...form, termsChecked: false })).status).toBe(400)
    const added = await post('/sources', { ...form, termsChecked: true })
    expect(added.status).toBe(200)
    const list = (await added.json()).sources
    expect(list.at(-1)).toMatchObject({ name: 'Example News', builtIn: false, enabled: true, language: 'en' })
    const file = JSON.parse(await readFile(path.join(directory, 'emerging_sources.json'), 'utf8'))
    expect(file.custom).toHaveLength(1)
    expect(fetchImpl.mock.calls.some(([url]) => url === NEW_FEED)).toBe(true)
  })
  it('does not add a feed that fails the server test, or a duplicate', async () => {
    await start()
    fetchImpl.mockImplementationOnce(async () => ({ ok: false, status: 404, text: async () => '' })) // robots.txt
    fetchImpl.mockImplementationOnce(async () => ({ ok: false, status: 500, text: async () => '' })) // feed
    const bad = await post('/sources', { ...form, termsChecked: true })
    expect(bad.status).toBe(422)
    await post('/sources', { ...form, termsChecked: true })
    expect((await post('/sources', { ...form, termsChecked: true })).status).toBe(400)
  })
  it('switches a source off and on, and removes only sources that were added', async () => {
    await start()
    const list = (await (await get()).json()).sources
    const builtIn = list.find((s) => s.builtIn && !s.fixed)
    expect((await post(`/sources/${builtIn.id}/toggle`, { enabled: false })).status).toBe(200)
    expect((await (await get()).json()).sources.find((s) => s.id === builtIn.id).enabled).toBe(false)
    expect((await post(`/sources/${builtIn.id}/toggle`, { enabled: true })).status).toBe(200)
    expect((await post(`/sources/${builtIn.id}/remove`)).status).toBe(400)
    expect((await post('/sources/openalex/toggle', { enabled: false })).status).toBe(400)
    const added = await (await post('/sources', { ...form, termsChecked: true })).json()
    const custom = added.sources.at(-1)
    expect((await post(`/sources/${custom.id}/remove`)).status).toBe(200)
    expect((await (await get()).json()).sources.some((s) => s.id === custom.id)).toBe(false)
    expect((await post('/sources/unknown/toggle', { enabled: true })).status).toBe(404)
    expect((await post(`/sources/${builtIn.id}/toggle`, { enabled: 'yes' })).status).toBe(400)
  })
  it('refreshes using the sources that are on, including added ones, and skips the ones that are off', async () => {
    await start()
    await post('/sources', { ...form, termsChecked: true })
    const list = (await (await get()).json()).sources
    const off = list.find((s) => s.builtIn && !s.fixed)
    await post(`/sources/${off.id}/toggle`, { enabled: false })
    fetchImpl.mockClear()
    const result = await (await post('/refresh')).json()
    expect(result.status).toBe('updated')
    const urls = fetchImpl.mock.calls.map(([url]) => url)
    expect(urls).toContain(NEW_FEED)
    expect(urls).not.toContain(off.url)
    expect(result.emerging.items.some((i) => i.url === 'https://news.example.com/1')).toBe(true)
  })
})

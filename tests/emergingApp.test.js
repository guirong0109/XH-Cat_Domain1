import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

const TOKEN = 'admin-token-xyz'
let directory
let server

async function start(emergingOptions, fetchImpl) {
  server = createApp({ dataDir: directory, fetchImpl, emergingOptions }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

const feedFetch = vi.fn(async (url) => {
  if (url.startsWith('https://api.openalex.org/')) {
    return { ok: true, status: 200, json: async () => ({ results: [{ id: 'https://openalex.org/W1', title: 'AI and data analysis jobs', publication_date: '2026-10-20', primary_location: { landing_page_url: 'https://journal.test/w1' } }] }) }
  }
  return { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' }
})

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  directory = await mkdtemp(path.join(tmpdir(), 'emerging-app-'))
  for (const [name, content] of Object.entries(datasets)) {
    await writeFile(path.join(directory, name), JSON.stringify(content))
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  server = null
  await rm(directory, { recursive: true, force: true })
})

describe('emerging routes', () => {
  it('GET /api/data has emerging as null before the first refresh', async () => {
    const base = await start({ adminToken: TOKEN }, feedFetch)
    const body = await (await fetch(`${base}/api/data`)).json()
    expect(body.emerging).toBeNull()
  })

  it('refuses a refresh when no admin token is set', async () => {
    const base = await start({ adminToken: undefined }, feedFetch)
    const response = await fetch(`${base}/api/refresh-emerging`, { method: 'POST' })
    expect(response.status).toBe(503)
  })

  it('refuses a missing or wrong token and does not fetch anything', async () => {
    const base = await start({ adminToken: TOKEN }, feedFetch)
    feedFetch.mockClear()
    expect((await fetch(`${base}/api/refresh-emerging`, { method: 'POST' })).status).toBe(401)
    expect((await fetch(`${base}/api/refresh-emerging`, { method: 'POST', headers: { 'x-admin-token': 'nope' } })).status).toBe(401)
    expect(feedFetch).not.toHaveBeenCalled()
  })

  it('refreshes with the right token, then GET /api/data includes the items and no secrets', async () => {
    const base = await start({ adminToken: TOKEN, primary: null, backup: null }, feedFetch)
    const refresh = await fetch(`${base}/api/refresh-emerging?force=1`, { method: 'POST', headers: { 'x-admin-token': TOKEN } })
    expect(refresh.status).toBe(200)
    const result = await refresh.json()
    expect(result.status).toBe('updated')
    const text = await (await fetch(`${base}/api/data`)).text()
    const body = JSON.parse(text)
    expect(body.emerging.items).toHaveLength(1)
    expect(body.emerging.items[0]).toMatchObject({ source: 'OpenAlex', url: 'https://journal.test/w1', review: 'pending' })
    expect(text).not.toContain(TOKEN)
  })

  it('a second call right after returns the saved file (skipped)', async () => {
    const base = await start({ adminToken: TOKEN, primary: null, backup: null }, feedFetch)
    const headers = { 'x-admin-token': TOKEN }
    await fetch(`${base}/api/refresh-emerging`, { method: 'POST', headers })
    const again = await (await fetch(`${base}/api/refresh-emerging`, { method: 'POST', headers })).json()
    expect(again.status).toBe('skipped')
  })
})

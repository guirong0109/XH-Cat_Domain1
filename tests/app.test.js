import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    })
  })

  it('GET /api/data without trends file returns trends null', async () => {
    const baseUrl = await start()
    const response = await fetch(`${baseUrl}/api/data`)
    expect(response.status).toBe(200)
    expect((await response.json()).trends).toBeNull()
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

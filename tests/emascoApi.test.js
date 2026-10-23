import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { buildIndex } from '../server/emascoMatch.js'

const unit = (position) => [0, 1, 2, 3].map((index) => (index === position ? 1 : 0))
const skills = ['Skill A', 'Skill B', 'Skill C', 'Skill D'].map((text, row) => ({ id: `s0000${row + 1}`, text, roles: ['x'] }))
const entries = ['Skill A', 'Skill B', 'Skill C'].map((text) => ({ text, type: 'basic' }))
const makeRole = (code, title, qualification) => ({
  code, title, description: '', url: `https://emasco.mohr.gov.my/masco/${code}`, qualification, tags: [], tasks: [], skills: entries
})
const occupations = {
  source: 'eMASCO (MASCO 2020), English pages',
  fetchedAt: '2026-10-23',
  skills,
  roles: [
    makeRole('2262-02', 'Pharmacist Grade UF9', 'Bachelor’s degree or equivalent'),
    makeRole('2262-03', 'Pharmacist Grade UF10', 'Bachelor’s degree or equivalent'),
    makeRole('3333-01', 'Technician', 'Diploma or equivalent'),
    makeRole('4444-01', 'Clerk', 'Sijil Pelajaran Malaysia (SPM) or Equivalent')
  ],
  tasksOnly: []
}
const index = buildIndex({
  occupations,
  skillVectors: Float32Array.from([unit(0), unit(1), unit(2), unit(3)].flat()),
  dimension: 4,
  roleVectors: Float32Array.from([unit(0), [0.9, Math.sqrt(0.19), 0, 0], [0.5, Math.sqrt(0.75), 0, 0], unit(1)].flat()),
  roleCodes: occupations.roles.map((role) => role.code)
})
const readyEmbedder = { modelId: 'fake', isReady: () => true, embed: async (lines) => lines.map(() => unit(0)) }

let directory
let server
async function start({ embedder = null, emascoLoader = async () => ({ occupations, index }) } = {}) {
  server = createApp({ dataDir: directory, embedder, emascoLoader }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
const post = (baseUrl, body) =>
  fetch(`${baseUrl}/api/emasco/match`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'emasco-api-'))
})
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

describe('GET /api/emasco/skills', () => {
  it('searches the skill texts', async () => {
    const baseUrl = await start()
    const body = await (await fetch(`${baseUrl}/api/emasco/skills?q=skill%20b`)).json()
    expect(body.skills).toEqual([{ id: 's00002', text: 'Skill B', roles: 1 }])
  })
  it('returns an empty list for no query and caps the limit', async () => {
    const baseUrl = await start()
    expect((await (await fetch(`${baseUrl}/api/emasco/skills`)).json()).skills).toEqual([])
    expect((await (await fetch(`${baseUrl}/api/emasco/skills?q=skill&limit=2`)).json()).skills).toHaveLength(2)
    expect((await (await fetch(`${baseUrl}/api/emasco/skills?q=skill&limit=abc`)).json()).skills).toHaveLength(4)
  })
})

describe('POST /api/emasco/match with picked skills', () => {
  const picked = ['s00001', 's00002', 's00003']
  it('returns cards, the source and hides roles above diploma level by default', async () => {
    const response = await post(await start(), { skillIds: picked })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.roles.map((role) => role.code)).toEqual(['3333-01', '4444-01'])
    expect(body.hiddenByLevel).toBe(2)
    expect(body.maxLevel).toBe('diploma')
    expect(body.source).toMatchObject({ occupations: 'eMASCO (MASCO 2020), English pages', crawledOn: '2026-10-23', model: 'BAAI/bge-m3' })
  })
  it('shows degree roles, with grades merged, when includeHigher is true', async () => {
    const body = await (await post(await start(), { skillIds: picked, includeHigher: true })).json()
    // UF10 scores higher than UF9 with these vectors, so it leads the merged Pharmacist card.
    expect(body.roles.map((role) => role.code)).toEqual(['3333-01', '2262-03', '4444-01'])
    expect(body.roles[1].grades.map((item) => item.grade)).toEqual(['UF9', 'UF10'])
    expect(body.hiddenByLevel).toBe(0)
  })
  it('asks for at least 3 different skills', async () => {
    const body = await (await post(await start(), { skillIds: ['s00001', 's00001', 's00002'] })).json()
    expect(body).toMatchObject({ status: 'not-enough-skills', roles: [] })
  })
  it('answers 400 for an unknown skill id', async () => {
    const response = await post(await start(), { skillIds: ['s00001', 's00002', 'nope'] })
    expect(response.status).toBe(400)
  })
  it('clamps top to 1..20', async () => {
    const baseUrl = await start()
    expect((await (await post(baseUrl, { skillIds: picked, includeHigher: true, top: 1 })).json()).roles).toHaveLength(1)
    expect((await (await post(baseUrl, { skillIds: picked, includeHigher: true, top: 1000 })).json()).roles.length).toBeLessThanOrEqual(20)
  })
})

describe('POST /api/emasco/match with CV text', () => {
  it('ranks CV lines when the model is ready', async () => {
    const baseUrl = await start({ embedder: readyEmbedder })
    const body = await (await post(baseUrl, { text: 'Built reports\nWrote code\nLed a club', includeHigher: true })).json()
    expect(body.status).toBe('ok')
    expect(body.roles[0].code).toBe('2262-02')
  })
  it('answers 503 cv-ai-off without a model', async () => {
    const response = await post(await start(), { text: 'Built reports\nWrote code\nLed a club' })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'cv-ai-off' })
  })
  it('does not call the model for fewer than 3 usable lines', async () => {
    const baseUrl = await start({ embedder: readyEmbedder })
    const body = await (await post(baseUrl, { text: 'EXPERIENCE\nOne real line' })).json()
    expect(body.status).toBe('not-enough-skills')
  })
})

describe('request checks and missing data', () => {
  it('rejects a body with both or neither of skillIds and text', async () => {
    const baseUrl = await start({ embedder: readyEmbedder })
    expect((await post(baseUrl, { skillIds: ['s00001'], text: 'x' })).status).toBe(400)
    expect((await post(baseUrl, {})).status).toBe(400)
    expect((await post(baseUrl, { text: '   ' })).status).toBe(400)
  })
  it('rejects too many or non-string skill ids', async () => {
    const baseUrl = await start()
    expect((await post(baseUrl, { skillIds: Array.from({ length: 51 }, (item, number) => `s${number}`) })).status).toBe(400)
    expect((await post(baseUrl, { skillIds: [1, 2, 3] })).status).toBe(400)
  })
  it('answers 413 for a very large body', async () => {
    const baseUrl = await start({ embedder: readyEmbedder })
    expect((await post(baseUrl, { text: 'x'.repeat(200000) })).status).toBe(413)
  })
  it('answers 503 emasco-data-missing on both routes when the data cannot load, and keeps other routes working', async () => {
    const baseUrl = await start({ emascoLoader: async () => { throw new Error('Rebuild the vectors') } })
    const skillsResponse = await fetch(`${baseUrl}/api/emasco/skills?q=skill`)
    expect(skillsResponse.status).toBe(503)
    expect(await skillsResponse.json()).toEqual({ error: 'emasco-data-missing' })
    expect((await post(baseUrl, { skillIds: ['s00001', 's00002', 's00003'] })).status).toBe(503)
    expect((await post(baseUrl.replace('/api/emasco/match', ''), {})).status).toBe(400) // still routed
    expect((await fetch(`${baseUrl}/api/cv-skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400)
  })
})

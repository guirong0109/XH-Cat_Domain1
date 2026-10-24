import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

const FP = 'fp-1'
const meta = { schemaVersion: 2, fingerprint: FP, generatedAt: '2026-10-24T00:00:00+00:00' }
const relation = (skillId, skillName, status = 'validated') => ({
  skillId, skillName, classification: 'listed_in_official_standard', sections: ['specific'], originalTerms: [skillName],
  evidence: [{ source: 'emasco:1111-01', section: 'specific', statementId: 's1', quote: `Knowledge of ${skillName}.` }],
  independentSources: 1, evidenceStrength: 'official_single_source', importance: null, status,
})
const source = (code) => ({ id: `emasco:${code}`, name: 'eMASCO (MASCO 2020)', url: `https://emasco.mohr.gov.my/masco/${code}`, quality: 'official_standard', retrievedAt: '2026-10-23' })

async function writeDataset(directory, { fingerprint = FP } = {}) {
  const skills = path.join(directory, 'skills')
  await mkdir(skills, { recursive: true })
  const header = { ...meta, fingerprint }
  const write = (name, content) => writeFile(path.join(skills, name), JSON.stringify(content))
  await write('catalogue.json', { meta: header, skills: [
    { id: 'sk_sql', key: 'sql', name: 'SQL', aliasKeys: [], taxonomy: { appSkill: null, relatedAppSkills: ['SQL and databases'] } },
    { id: 'sk_safe', key: 'safety', name: 'Safety', aliasKeys: [], taxonomy: { appSkill: null, relatedAppSkills: [] } },
  ] })
  await write('occupations.json', { meta: header, occupations: {
    '1111-01': { code: '1111-01', title: 'Data Role', status: 'ok', reason: null, source: source('1111-01'), skills: [relation('sk_sql', 'SQL'), relation('sk_safe', 'Safety', 'needs_review')] },
    '2222-02': { code: '2222-02', title: 'Tasks Only', status: 'insufficient', reason: 'No skills section.', source: source('2222-02'), skills: [] },
  } })
  await write('skill_index.json', { meta: header, normalisation: { spelling: {}, trailing: ['skills'] }, skillToOccupations: { sk_sql: ['1111-01'], sk_safe: ['1111-01'] }, nameToSkill: { sql: 'sk_sql', safety: 'sk_safe' } })
  await write('review.json', { meta: header, relations: [], nearDuplicates: [] })
  await write('app_skill_map.json', { meta: { datasetFingerprint: fingerprint }, coverage: { appSkills: 2, exact: 0, synonym: 0, related: 1, unresolved: 1 }, skills: { 'SQL and databases': { tier: 'related' } } })
  await write('role_evidence.json', { meta: { datasetFingerprint: fingerprint, synonymTableStatus: 'draft' }, roles: { '1111-01': { occupationStatus: 'ok', officialSkillCount: 2, skills: { 'SQL and databases': { support: 'related', evidence: [] } }, otherOfficial: [], otherOfficialCount: 0, source: source('1111-01') } } })
}

let directory
let server
async function start(options) {
  directory = await mkdtemp(path.join(tmpdir(), 'skill-routes-'))
  for (const name of ['roles', 'skills', 'sdg', 'samples']) await writeFile(path.join(directory, `${name}.json`), name === 'skills' ? '{"labels":[]}' : '[]')
  if (options !== false) await writeDataset(directory, options)
  server = createApp({ dataDir: directory, fetchImpl: async () => ({ ok: false, status: 503 }), adminSleep: async () => {} }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  server = null
  if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})
const post = (base, route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('skill dataset routes (fixture dataset)', () => {
  it('sends the role evidence with /api/data', async () => {
    const base = await start()
    const data = await (await fetch(`${base}/api/data`)).json()
    expect(Object.keys(data.skillEvidence.roles)).toEqual(['1111-01'])
    expect(data.skillEvidence.meta.synonymTableStatus).toBe('draft')
  })

  it('refuses evidence from another build of the dataset', async () => {
    const base = await start()
    // the catalogue is now a newer build than role_evidence.json and app_skill_map.json
    await writeFile(path.join(directory, 'skills', 'catalogue.json'), JSON.stringify({ meta: { fingerprint: 'newer-build' }, skills: [] }))
    await new Promise((resolve) => server.close(resolve))
    server = createApp({ dataDir: directory, fetchImpl: async () => ({ ok: false, status: 503 }) }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const data = await (await fetch(`http://127.0.0.1:${server.address().port}/api/data`)).json()
    expect(base).toBeTruthy()
    expect(data.skillEvidence).toBeNull()
  })

  it('lists the validated skills of an occupation, and all of them with ?all=1', async () => {
    const base = await start()
    const some = await (await fetch(`${base}/api/skills/occupation/1111-01`)).json()
    expect(some.skills.map((item) => item.skill)).toEqual(['SQL'])
    expect(some.skills[0].evidence[0].quote).toContain('SQL')
    const all = await (await fetch(`${base}/api/skills/occupation/1111-01?all=1`)).json()
    expect(all.skills).toHaveLength(2)
  })

  it('an occupation with no usable list says so, with its reason', async () => {
    const base = await start()
    const body = await (await fetch(`${base}/api/skills/occupation/2222-02`)).json()
    expect(body).toMatchObject({ status: 'insufficient', reason: 'No skills section.', skills: [] })
  })

  it('bad and unknown codes are handled', async () => {
    const base = await start()
    expect((await fetch(`${base}/api/skills/occupation/abc`)).status).toBe(400)
    expect((await fetch(`${base}/api/skills/occupation/9999-99`)).status).toBe(404)
  })

  it('gap: matched, missing, uncertain; a related skill is a hint, not a match', async () => {
    const base = await start()
    const body = await (await post(base, '/api/skills/gap', { code: '1111-01', skills: ['SQL and databases'] })).json()
    expect(body.matched).toEqual([])
    expect(body.missing[0]).toMatchObject({ skill: 'SQL', relatedYouHave: 'SQL and databases' })
    expect(body.uncertain.map((item) => item.skill)).toEqual(['Safety'])
    expect(body.coverage).toBe(0)
    const exact = await (await post(base, '/api/skills/gap', { code: '1111-01', skills: ['sql'] })).json()
    expect(exact.matched.map((item) => item.skill)).toEqual(['SQL'])
    expect(exact.coverage).toBe(1)
  })

  it('gap on an occupation without a usable list gives no coverage and says it is not a finding', async () => {
    const base = await start()
    const body = await (await post(base, '/api/skills/gap', { code: '2222-02', skills: ['sql'] })).json()
    expect(body).toMatchObject({ status: 'insufficient', coverage: null, matched: [], missing: [] })
    expect(body.note).toContain('not a finding')
  })

  it('gap rejects bad input without crashing', async () => {
    const base = await start()
    expect((await post(base, '/api/skills/gap', { code: 'x', skills: [] })).status).toBe(400)
    expect((await post(base, '/api/skills/gap', { code: '1111-01', skills: 'sql' })).status).toBe(400)
    expect((await post(base, '/api/skills/gap', { code: '1111-01', skills: Array(101).fill('a') })).status).toBe(400)
    expect((await post(base, '/api/skills/gap', { code: '9999-99', skills: [] })).status).toBe(404)
    expect((await post(base, '/api/skills/gap', undefined)).status).toBe(400)
  })

  it('app-map returns the coverage', async () => {
    const base = await start()
    const body = await (await fetch(`${base}/api/skills/app-map`)).json()
    expect(body.coverage.unresolved).toBe(1)
  })

  it('without the dataset every skill route says so with 503 and /api/data still works', async () => {
    const base = await start(false)
    expect((await fetch(`${base}/api/skills/occupation/1111-01`)).status).toBe(503)
    expect((await fetch(`${base}/api/skills/app-map`)).status).toBe(503)
    expect((await post(base, '/api/skills/gap', { code: '1111-01', skills: [] })).status).toBe(503)
    const data = await (await fetch(`${base}/api/data`)).json()
    expect(data.skillEvidence).toBeNull()
  })
})

describe('skill dataset routes (real saved dataset)', () => {
  const realData = new URL('../data', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const built = existsSync(path.join(realData, 'skills', 'role_evidence.json'))
  it.skipIf(!built)('serves the 20 scored roles, the 38-skill mapping and a real gap', async () => {
    const app = createApp({ dataDir: realData, fetchImpl: async () => ({ ok: false, status: 503 }), logDir: await mkdtemp(path.join(tmpdir(), 'log-')) }).listen(0)
    await new Promise((resolve) => app.once('listening', resolve))
    const base = `http://127.0.0.1:${app.address().port}`
    try {
      const data = await (await fetch(`${base}/api/data`)).json()
      expect(Object.keys(data.skillEvidence.roles)).toHaveLength(20)
      const map = await (await fetch(`${base}/api/skills/app-map`)).json()
      expect(map.coverage).toMatchObject({ appSkills: 38, exact: 13, synonym: 1, related: 22, unresolved: 2 })
      const gap = await (await post(base, '/api/skills/gap', { code: '2524-02', skills: ['Microsoft Excel', 'Spreadsheets (Excel)', 'Communication'] })).json()
      expect(gap.status).toBe('ok')
      expect(gap.matched.map((item) => item.skill).join(' ')).toMatch(/Excel/)
      expect(gap.sourceUrl).toBe('https://emasco.mohr.gov.my/masco/2524-02')
      const none = await (await post(base, '/api/skills/gap', { code: '1111-01', skills: ['Communication'] })).json()
      expect(none.coverage).toBeNull()
    } finally {
      await new Promise((resolve) => app.close(resolve))
    }
  })
})

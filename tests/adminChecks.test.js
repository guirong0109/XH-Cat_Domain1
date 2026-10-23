import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { healthChecks, linkChecks, pickSample, robotsAllows, runQuickCheck } from '../server/adminChecks.js'
import { inputHash, roleInputs, skillInputs } from '../scripts/lib/emascoEmbed.js'

const NOW = new Date('2026-10-23T06:00:00Z')

function makeRole(code, overrides = {}) {
  return {
    code,
    title: `Role ${code}`,
    description: `About ${code}.`,
    url: `https://emasco.mohr.gov.my/masco/${code}`,
    qualification: 'Diploma or equivalent',
    tags: [],
    tasks: [`Task of ${code}.`],
    skills: [{ text: `Basic skill of ${code}`, type: 'basic' }, { text: `Specific skill of ${code}`, type: 'specific' }],
    ...overrides
  }
}

function pageFor(role) {
  const basic = role.skills.filter((skill) => skill.type === 'basic').map((skill) => `<p>${skill.text}</p>`).join('')
  const specific = role.skills.filter((skill) => skill.type === 'specific').map((skill) => `<p>${skill.text}</p>`).join('')
  return `<p>MASCO Code</p><p>${role.code}</p><p>Compare</p><p>${role.title}</p><p>${role.description}</p><h3>Tasks</h3>${role.tasks
    .map((task) => `<p>${task}</p>`)
    .join('')}<h3>Skills</h3><h4>Basic</h4>${basic}<h4>Specific</h4>${specific}<h3>Additional Info</h3><h3>QUALIFICATION</h3><p>${role.qualification}</p><h3>Related Courses</h3>`
}

// A pretend eMASCO site. `pages` maps a code to html or to an HTTP status number.
function fakeSite({ pages = {}, robots = null, links = {} } = {}) {
  const requested = []
  const fetchImpl = async (url) => {
    requested.push(url)
    const reply = (status, text = '') => ({ status, text: async () => text, headers: { get: () => null } })
    if (url.endsWith('/robots.txt')) return robots === null ? reply(404) : reply(200, robots)
    const page = /\/masco\/(\d{4}-\d{2})/.exec(url)
    if (page) {
      const found = pages[page[1]]
      if (found === undefined) return reply(404)
      return typeof found === 'number' ? reply(found) : reply(200, found)
    }
    if (url in links) return reply(links[url])
    return reply(200)
  }
  return { fetchImpl, requested }
}

function fakeRun() {
  const events = []
  return { events, id: 'run-1', log: async (level, message, data) => { events.push({ level, message, data }) }, finish: async () => {} }
}

describe('robotsAllows', () => {
  const allows = async (robots) => robotsAllows({ fetchImpl: fakeSite({ robots }).fetchImpl })
  it('allows a missing file, an unreadable one and rules that do not touch /masco/', async () => {
    expect(await allows(null)).toBe(true)
    expect(await allows('User-agent: *\nDisallow: /admin')).toBe(true)
    expect(await allows('User-agent: otherbot\nDisallow: /')).toBe(true)
    expect(await robotsAllows({ fetchImpl: async () => { throw new Error('offline') } })).toBe(true)
  })
  it('refuses when everyone, or us, may not read /masco/', async () => {
    expect(await allows('User-agent: *\nDisallow: /')).toBe(false)
    expect(await allows('# comment\nUser-agent: *\nDisallow: /masco')).toBe(false)
    expect(await allows('User-agent: FutureReadyMY-hackathon\nDisallow: /masco/')).toBe(false)
  })
})

describe('pickSample', () => {
  const codes = Array.from({ length: 100 }, (item, number) => `c${number}`)
  const seeded = (start) => {
    let state = start
    return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 }
  }
  it('draws distinct codes, a different set for a different draw, and never more than there are', () => {
    const first = pickSample(codes, 40, seeded(1))
    expect(new Set(first).size).toBe(40)
    expect(first).not.toEqual(pickSample(codes, 40, seeded(2)))
    expect(pickSample(['a', 'b'], 40, seeded(1)).sort()).toEqual(['a', 'b'])
    expect(pickSample([], 5)).toEqual([])
    expect(codes).toHaveLength(100)
  })
})

describe('linkChecks', () => {
  it('reports each link as working or not', async () => {
    const site = fakeSite({ links: { 'https://a.example/': 200, 'https://b.example/': 500 } })
    const results = await linkChecks({ links: ['https://a.example/', 'https://b.example/'], fetchImpl: site.fetchImpl, now: NOW })
    expect(results).toEqual([
      { url: 'https://a.example/', ok: true, status: 200 },
      { url: 'https://b.example/', ok: false, status: 500 }
    ])
  })
})

describe('healthChecks', () => {
  let dataDir
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'admin-health-'))
    await mkdir(path.join(dataDir, 'emasco', 'vectors'), { recursive: true })
  })
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  const occupations = (fetchedAt = '2026-10-20') => ({ source: 's', fetchedAt, roles: [makeRole('1111-01')], tasksOnly: [], skills: [{ id: 's1', text: 'Basic skill of 1111-01' }, { id: 's2', text: 'Specific skill of 1111-01' }] })
  async function write(file, value) {
    await writeFile(path.join(dataDir, file), JSON.stringify(value))
  }
  async function writeAll({ fetchedAt, hashesFrom = occupations(fetchedAt) } = {}) {
    await write('emasco/occupations.json', occupations(fetchedAt))
    await write('emasco/vectors/meta.json', {
      modelId: 'm',
      skillsHash: inputHash(skillInputs(hashesFrom).texts, 'm'),
      rolesHash: inputHash(roleInputs(hashesFrom).texts, 'm'),
      packedAt: '2026-10-23T01:00:00Z'
    })
    await write('trends.json', { source: { fetchedAt: '2026-10-20T01:00:00Z' } })
    await write('research.json', { source: { fetchedAt: '2026-10-22T01:00:00Z' } })
    await write('references.json', { checkedAt: '2026-10-22T01:00:00Z' })
  }
  const byName = (checks) => Object.fromEntries(checks.map((check) => [check.name, check]))

  it('is all ok when the files are fresh and in sync', async () => {
    await writeAll()
    const checks = byName(await healthChecks({ dataDir, embedderReady: true, now: NOW }))
    expect(Object.values(checks).map((check) => check.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(checks['eMASCO data'].detail).toMatch(/1 roles with skills.*read 2026-10-20 \(3 days ago\)/)
  })

  it('warns when the crawl is older than 60 days', async () => {
    await writeAll({ fetchedAt: '2026-07-01' })
    expect(byName(await healthChecks({ dataDir, now: NOW }))['eMASCO data'].status).toBe('warn')
  })

  it('fails when the vectors do not match the eMASCO data', async () => {
    await writeAll({ hashesFrom: { ...occupations(), skills: [{ id: 's1', text: 'Something else' }], roles: [makeRole('9999-99')] } })
    const check = byName(await healthChecks({ dataDir, now: NOW }))['Role search vectors']
    expect(check.status).toBe('fail')
    expect(check.detail).toMatch(/Rebuild/)
  })

  it('fails for missing eMASCO data and missing vectors, and warns for missing optional files and a model that is off', async () => {
    await rm(path.join(dataDir, 'emasco'), { recursive: true })
    const checks = byName(await healthChecks({ dataDir, embedderReady: false, now: NOW }))
    expect(checks['eMASCO data'].status).toBe('fail')
    expect(checks['Role search vectors'].status).toBe('fail')
    expect(checks['Job trends (OpenDOSM)'].status).toBe('warn')
    expect(checks['AI research (OpenAlex)'].detail).toBe('No snapshot yet.')
    expect(checks['Reference checks'].status).toBe('warn')
    expect(checks['AI model'].status).toBe('warn')
  })
})

describe('runQuickCheck', () => {
  let dataDir
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'admin-quick-'))
  })
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  const roles = [makeRole('1111-01'), makeRole('1111-02'), makeRole('1111-03')]
  const occupations = { roles, tasksOnly: [], skills: [] }
  const base = (site, extra = {}) => ({
    run: fakeRun(),
    occupations,
    dataDir,
    fetchImpl: site.fetchImpl,
    sleep: async () => {},
    random: () => 0,
    sampleSize: 3,
    now: () => NOW,
    ...extra
  })

  it('reports unchanged, changed and unreadable roles, and the run ends partial', async () => {
    const site = fakeSite({ pages: { '1111-01': pageFor(roles[0]), '1111-02': pageFor({ ...roles[1], title: 'A new title' }), '1111-03': 500 } })
    const options = base(site)
    const result = await runQuickCheck(options)
    expect(result.status).toBe('partial')
    expect(result.summary).toMatchObject({ sampleSize: 3, rolesRead: 2, changed: 1, unreadable: 1 })
    expect(result.report.sample.changed).toEqual([{ code: expect.any(String), title: expect.any(String), fields: ['title'] }])
    expect(result.report.sample.unreadable[0].error).toMatch(/HTTP 500/)
    const messages = options.run.events.map((event) => `${event.level}: ${event.message}`)
    expect(messages.some((message) => /^warn: 1111-0\d changed on eMASCO: title/.test(message))).toBe(true)
    expect(messages.some((message) => /^error: 1111-0\d could not be read/.test(message))).toBe(true)
  })

  it('counts every page as unchanged when nothing changed, and the working link is not a failure', async () => {
    const site = fakeSite({ pages: Object.fromEntries(roles.map((role) => [role.code, pageFor(role)])), links: { 'https://a.example/': 200 } })
    const result = await runQuickCheck(base(site, { links: ['https://a.example/'] }))
    expect(result.summary).toMatchObject({ rolesRead: 3, changed: 0, unreadable: 0, linksFailed: 0 })
    expect(result.report.sample.unchanged).toBe(3)
  })

  it('waits 2 seconds between pages but not before the first', async () => {
    const waits = []
    const site = fakeSite({ pages: Object.fromEntries(roles.map((role) => [role.code, pageFor(role)])) })
    await runQuickCheck(base(site, { sleep: async (ms) => { waits.push(ms) } }))
    expect(waits).toEqual([2000, 2000])
  })

  it('ends failed when no page can be read, and marks nothing as removed', async () => {
    const result = await runQuickCheck(base(fakeSite({ pages: {} })))
    expect(result.status).toBe('failed')
    expect(result.summary.unreadable).toBe(3)
    expect(result.report.sample.changed).toEqual([])
  })

  it('stops with status cancelled when the admin cancels', async () => {
    const site = fakeSite({ pages: Object.fromEntries(roles.map((role) => [role.code, pageFor(role)])) })
    let checks = 0
    const result = await runQuickCheck(base(site, { isCancelled: () => ++checks > 1 }))
    expect(result.status).toBe('cancelled')
    expect(result.summary.rolesRead).toBe(1)
  })

  it('reads no page when robots.txt forbids it', async () => {
    const site = fakeSite({ robots: 'User-agent: *\nDisallow: /', pages: { '1111-01': pageFor(roles[0]) } })
    const result = await runQuickCheck(base(site))
    expect(result.status).toBe('failed')
    expect(site.requested.some((url) => url.includes('/masco/1111'))).toBe(false)
  })

  it('reports progress after each page', async () => {
    const seen = []
    const site = fakeSite({ pages: Object.fromEntries(roles.map((role) => [role.code, pageFor(role)])) })
    await runQuickCheck(base(site, { progress: (done, total) => seen.push([done, total]) }))
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]])
  })
})

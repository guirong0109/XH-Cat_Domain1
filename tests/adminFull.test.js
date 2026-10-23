import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runFullCheck } from '../server/adminFull.js'

const makeRole = (code, overrides = {}) => ({
  code,
  title: `Role ${code}`,
  description: `About ${code}.`,
  qualification: 'Diploma or equivalent',
  tasks: [`Task of ${code}.`],
  skills: [{ text: `Basic of ${code}`, type: 'basic' }, { text: `Specific of ${code}`, type: 'specific' }],
  ...overrides
})

function rolePage(role) {
  const list = (type) => role.skills.filter((skill) => skill.type === type).map((skill) => `<p>${skill.text}</p>`).join('')
  return `<p>MASCO Code</p><p>${role.code}</p><p>Compare</p><p>${role.title}</p><p>${role.description}</p><h3>Tasks</h3>${role.tasks.map((task) => `<p>${task}</p>`).join('')}<h3>Skills</h3><h4>Basic</h4>${list('basic')}<h4>Specific</h4>${list('specific')}<h3>Additional Info</h3><h3>QUALIFICATION</h3><p>${role.qualification}</p><h3>Related Courses</h3>`
}
const treePage = (...codes) => `<html><body><a href="/masco/1">1</a><a href="/masco/2">2</a>${codes.map((code) => `<a href="/masco/${code}">x</a>`).join('')}</body></html>`

// A small pretend eMASCO: group 1 holds unit group 1111 with some roles; the other groups are empty.
function makeSite(overrides = {}) {
  const pages = {
    1: treePage('11'),
    2: treePage(), 3: treePage(), 4: treePage(), 5: treePage(), 6: treePage(), 7: treePage(), 8: treePage(), 9: treePage(),
    11: treePage('111'),
    111: treePage('1111'),
    1111: treePage('1111-01', '1111-02', '1111-04'),
    '1111-01': rolePage(makeRole('1111-01')),
    '1111-02': rolePage(makeRole('1111-02', { title: 'Renamed role' })),
    '1111-04': rolePage(makeRole('1111-04')),
    ...overrides
  }
  const requested = []
  const fetchImpl = async (url) => {
    requested.push(url)
    const reply = (status, text = '') => ({ status, text: async () => text, headers: { get: () => null } })
    if (url.endsWith('/robots.txt')) return reply(404)
    const code = /\/masco\/([\d-]+)/.exec(url)?.[1]
    const page = pages[code]
    if (page === undefined) return reply(404)
    return typeof page === 'number' ? reply(page) : reply(200, page)
  }
  return { fetchImpl, requested, pages }
}

const fakeRun = () => ({ events: [], id: 'r', log: async function log(level, message) { this.events.push(`${level}: ${message}`) }, finish: async () => {} })

let directory
let stateFile
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'admin-full-'))
  stateFile = path.join(directory, 'state.json')
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const savedData = (extra = {}) => ({
  roles: [makeRole('1111-01'), makeRole('1111-02'), makeRole('1111-03')],
  tasksOnly: [],
  unparsed: [],
  ...extra
})
const options = (site, extra = {}) => ({ run: fakeRun(), occupations: savedData(), stateFile, fetchImpl: site.fetchImpl, sleep: async () => {}, saveEvery: 1, now: () => new Date('2026-10-23T06:00:00Z'), ...extra })

describe('runFullCheck', () => {
  it('reports a new role, a role that is gone and a changed role', async () => {
    const result = await runFullCheck(options(makeSite()))
    expect(result.status).toBe('ok')
    expect(result.summary).toMatchObject({ added: 1, removed: 1, changed: 1, unreadable: 0, siteRoles: 3, savedRoles: 3 })
    expect(result.report.addedRoles).toEqual([{ code: '1111-04', title: 'Role 1111-04' }])
    expect(result.report.removedRoles).toEqual([{ code: '1111-03', title: 'Role 1111-03' }])
    expect(result.report.changedRoles).toEqual([{ code: '1111-02', title: 'Role 1111-02', fields: ['title'] }])
  })

  it('does not call a role gone when its role page cannot be read', async () => {
    const result = await runFullCheck(options(makeSite({ '1111-02': 500 })))
    expect(result.status).toBe('partial')
    expect(result.report.unreadableRoles[0]).toMatchObject({ code: '1111-02' })
    expect(result.report.removedRoles.map((item) => item.code)).toEqual(['1111-03'])
    expect(result.summary.changed).toBe(0)
  })

  it('does not call roles gone when the page that lists them cannot be read', async () => {
    const result = await runFullCheck(options(makeSite({ 1111: 500 })))
    expect(result.status).toBe('partial')
    expect(result.report.removedRoles).toEqual([])
    expect(result.report.unverifiedCodes.sort()).toEqual(['1111-01', '1111-02', '1111-03'])
    expect(result.report.treeUnreadablePages.map((item) => item.code)).toEqual(['1111'])
  })

  it('ignores a known unparsed page that still has no tasks or skills, but reports it when it gets content', async () => {
    const empty = '<p>MASCO Code</p><p>1111-05</p><p>Compare</p><p>Headman</p><h3>Additional Info</h3>'
    const tree = treePage('1111-01', '1111-02', '1111-04', '1111-05')
    const known = { unparsed: ['1111-05: No tasks and no skills on the page for role 1111-05'] }
    const same = await runFullCheck(options(makeSite({ 1111: tree, '1111-05': empty }), { occupations: savedData(known) }))
    expect(same.summary.unreadable).toBe(0)
    expect(same.summary.added).toBe(1)
    const filled = await runFullCheck(options(makeSite({ 1111: tree, '1111-05': rolePage(makeRole('1111-05')) }), { occupations: savedData(known) }))
    expect(filled.report.addedRoles.map((item) => item.code).sort()).toEqual(['1111-04', '1111-05'])
  })

  it('removes its saved progress when it finishes', async () => {
    await runFullCheck(options(makeSite()))
    expect(existsSync(stateFile)).toBe(false)
  })

  it('stops when cancelled, keeps its progress, and a resume gives the same result as a clean run without reading pages twice', async () => {
    const clean = await runFullCheck(options(makeSite()))
    const site = makeSite()
    let checks = 0
    const stopped = await runFullCheck(options(site, { isCancelled: () => ++checks > 6 }))
    expect(stopped.status).toBe('cancelled')
    expect(stopped.summary.resumable).toBe(true)
    expect(existsSync(stateFile)).toBe(true)
    const readBefore = site.requested.length
    const resumed = await runFullCheck(options(site, { resume: true }))
    expect(resumed.report.addedRoles).toEqual(clean.report.addedRoles)
    expect(resumed.report.removedRoles).toEqual(clean.report.removedRoles)
    expect(resumed.report.changedRoles).toEqual(clean.report.changedRoles)
    const pageRequests = site.requested.filter((url) => url.includes('/masco/'))
    expect(new Set(pageRequests).size).toBe(pageRequests.length) // nothing fetched twice
    expect(site.requested.length).toBeGreaterThan(readBefore)
  })

  it('a resume with no saved progress starts from the beginning', async () => {
    const result = await runFullCheck(options(makeSite(), { resume: true }))
    expect(result.summary.pagesRead).toBeGreaterThan(5)
  })

  it('reads nothing when robots.txt forbids it', async () => {
    const site = makeSite()
    const forbidding = async (url, init) => (url.endsWith('/robots.txt') ? { status: 200, text: async () => 'User-agent: *\nDisallow: /', headers: { get: () => null } } : site.fetchImpl(url, init))
    const result = await runFullCheck(options(site, { fetchImpl: forbidding }))
    expect(result.status).toBe('failed')
    expect(site.requested.filter((url) => url.includes('/masco/'))).toEqual([])
  })

  it('ends failed, and calls nothing gone, when no page can be read at all', async () => {
    const result = await runFullCheck(options(makeSite({ 1: 500, 2: 500, 3: 500, 4: 500, 5: 500, 6: 500, 7: 500, 8: 500, 9: 500 })))
    expect(result.status).toBe('failed')
    expect(result.report.removedRoles).toEqual([])
  })

  it('waits 2 seconds between pages and reports progress', async () => {
    const waits = []
    const seen = []
    const site = makeSite()
    const outcome = await runFullCheck(options(site, { sleep: async (ms) => { waits.push(ms) }, progress: (done, total) => seen.push([done, total]) }))
    expect(new Set(waits)).toEqual(new Set([2000]))
    expect(waits.length).toBe(outcome.summary.pagesRead - 1)
    expect(seen.at(-1)[0]).toBe(seen.at(-1)[1])
  })
})

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

const wageRows = JSON.parse(readFileSync(new URL('./fixtures/wages_occupation.json', import.meta.url), 'utf8'))
const youthRows = JSON.parse(readFileSync(new URL('./fixtures/lfs_month_youth.json', import.meta.url), 'utf8'))

const makeRole = (code) => ({
  code,
  title: `Role ${code}`,
  description: `About ${code}.`,
  url: `https://emasco.mohr.gov.my/masco/${code}`,
  qualification: 'Diploma or equivalent',
  tags: [],
  tasks: [`Task of ${code}.`],
  skills: [{ text: `Basic of ${code}`, type: 'basic' }, { text: `Specific of ${code}`, type: 'specific' }]
})
const rolePage = (role) => {
  const list = (type) => role.skills.filter((skill) => skill.type === type).map((skill) => `<p>${skill.text}</p>`).join('')
  return `<p>MASCO Code</p><p>${role.code}</p><p>Compare</p><p>${role.title}</p><p>${role.description}</p><h3>Tasks</h3><p>${role.tasks[0]}</p><h3>Skills</h3><h4>Basic</h4>${list('basic')}<h4>Specific</h4>${list('specific')}<h3>Additional Info</h3><h3>QUALIFICATION</h3><p>${role.qualification}</p><h3>Related Courses</h3>`
}

const roles = ['1111-01', '1111-02', '1111-03'].map(makeRole)
const occupations = { source: 's', fetchedAt: '2026-10-20', roles, tasksOnly: [], unparsed: [], skills: [] }

let directory
let server
let gate = null // when set, page requests wait for it

function siteFetch(url) {
  const reply = (status, body = '') => ({ status, text: async () => body, json: async () => body, headers: { get: () => null } })
  if (url.startsWith('https://api.openalex.org/')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ meta: { count: 50 } }), headers: { get: () => null } })
  if (url.includes('opendosm') || url.includes('id=')) {
    const rows = url.includes('id=wages_occupation') ? wageRows : youthRows
    return Promise.resolve({ status: 200, json: async () => rows, headers: { get: () => null } })
  }
  if (url.endsWith('/robots.txt')) return Promise.resolve(reply(404))
  const page = /\/masco\/(\d{4}-\d{2})/.exec(url)
  if (page) {
    const role = roles.find((item) => item.code === page[1])
    const wait = gate ?? Promise.resolve()
    return wait.then(() => (role ? reply(200, rolePage(role)) : reply(404)))
  }
  return Promise.resolve(reply(200))
}

async function start() {
  server = createApp({ dataDir: directory, fetchImpl: siteFetch, adminSleep: async () => {}, adminSampleSize: 3 }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
const get = (base, route, headers = {}) => fetch(`${base}/api/admin${route}`, { headers })
const post = (base, route, body = {}, headers = {}) =>
  fetch(`${base}/api/admin${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

async function untilIdle(base) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { job } = await (await get(base, '/job')).json()
    if (!job) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('the job did not finish')
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'admin-api-'))
  await mkdir(path.join(directory, 'emasco'), { recursive: true })
  await writeFile(path.join(directory, 'emasco', 'occupations.json'), JSON.stringify(occupations))
  await writeFile(path.join(directory, 'roles.json'), JSON.stringify([{ id: 'x', ilo: { url: 'https://www.ilo.org/x' } }]))
  await writeFile(path.join(directory, 'skills.json'), JSON.stringify({ labels: [{ label: 'A', researchTerm: 'a' }], similar: {} }))
  gate = null
})
afterEach(async () => {
  gate?.release?.()
  await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

describe('access: this PC only, no password', () => {
  it('serves the admin page to a browser opened at localhost, without caching it and without any token', async () => {
    const response = await fetch(`${await start()}/admin`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const page = await response.text()
    expect(page).toContain('Admin console')
    expect(page).not.toMatch(/ADMIN_TOKEN|Bearer|password/i)
  })

  it('refuses the page and every admin route when the request came through a tunnel or proxy', async () => {
    const base = await start()
    for (const via of [{ 'X-Forwarded-For': '203.0.113.9' }, { 'CF-Connecting-IP': '203.0.113.9' }, { 'X-Real-IP': '203.0.113.9' }]) {
      const page = await fetch(`${base}/admin`, { headers: via })
      expect(page.status).toBe(403)
      expect(await page.json()).toEqual({ error: 'local-only' })
      for (const route of ['/overview', '/job', '/runs', '/runs/20261023060000-abcd']) expect((await get(base, route, via)).status).toBe(403)
      for (const route of ['/checks/quick', '/checks/full', '/checks/cancel']) expect((await post(base, route, {}, via)).status).toBe(403)
    }
  })

  it('does not start a check when the request came through a tunnel', async () => {
    const base = await start()
    await post(base, '/checks/quick', {}, { 'X-Forwarded-For': '203.0.113.9' })
    expect((await (await get(base, '/runs')).json()).runs).toEqual([])
  })

  it('refuses a post that is not JSON, so another website cannot start a check by posting a form', async () => {
    const base = await start()
    for (const route of ['/checks/quick', '/checks/full', '/checks/cancel']) {
      const response = await fetch(`${base}/api/admin${route}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })
      expect(response.status).toBe(415)
    }
    expect((await (await get(base, '/runs')).json()).runs).toEqual([])
  })

  it('has no sign-in route any more', async () => {
    expect((await fetch(`${await start()}/api/admin/status`)).status).toBe(404)
  })
})

describe('quick check', () => {
  it('runs in the background, then shows in the log with its events and a downloadable report', async () => {
    const base = await start()
    const started = await post(base, '/checks/quick')
    expect(started.status).toBe(202)
    const { runId } = await started.json()
    await untilIdle(base)

    const { runs } = await (await get(base, '/runs')).json()
    expect(runs[0]).toMatchObject({ id: runId, type: 'quick-check' })
    expect(['ok', 'partial']).toContain(runs[0].status)
    const detail = await (await get(base, `/runs/${runId}`)).json()
    expect(detail.events.some((event) => /Quick check started/.test(event.message))).toBe(true)
    const report = await get(base, `/runs/${runId}/report`)
    expect(report.status).toBe(200)
    expect(report.headers.get('content-disposition')).toContain(`report-${runId}.json`)
    const body = await report.json()
    expect(body).toMatchObject({ kind: 'quick-check' })
    expect(body.sample.unchanged + body.sample.changed.length + body.sample.unreadable.length).toBe(3)
  })

  it('answers 409 when a check is already running, and cancel stops it', async () => {
    let release
    gate = new Promise((resolve) => { release = resolve })
    gate.release = release
    const base = await start()
    expect((await post(base, '/checks/quick')).status).toBe(202)
    const second = await post(base, '/checks/full')
    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe('busy')
    expect((await (await get(base, '/job')).json()).job.type).toBe('quick-check')
    expect(await (await post(base, '/checks/cancel')).json()).toEqual({ cancelled: true })
    release()
    await untilIdle(base)
    expect((await (await get(base, '/runs')).json()).runs[0].status).toBe('cancelled')
    expect(await (await post(base, '/checks/cancel')).json()).toEqual({ cancelled: false })
  })

  it('answers 503 when the eMASCO data is missing', async () => {
    await rm(path.join(directory, 'emasco'), { recursive: true })
    const response = await post(await start(), '/checks/quick')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'emasco-data-missing' })
  })

  it('overview shows health, the current job and recent runs', async () => {
    const base = await start()
    const body = await (await get(base, '/overview')).json()
    expect(body.health.map((check) => check.name)).toContain('eMASCO data')
    expect(body).toMatchObject({ job: null, runs: [], resumable: false })
  })
})

describe('log access', () => {
  it('answers 404 for an unknown run, a badly formed id and a missing report', async () => {
    const base = await start()
    expect((await get(base, '/runs/20261023060000-abcd')).status).toBe(404)
    expect((await get(base, '/runs/..%2F..%2Fpackage')).status).toBe(404)
    expect((await get(base, '/runs/20261023060000-abcd/report')).status).toBe(404)
    expect((await get(base, '/runs/not-an-id/report')).status).toBe(404)
  })
  it('limits the number of runs returned', async () => {
    const base = await start()
    for (let count = 0; count < 2; count += 1) {
      await post(base, '/checks/quick')
      await untilIdle(base)
    }
    expect((await (await get(base, '/runs?limit=1')).json()).runs).toHaveLength(1)
    expect((await (await get(base, '/runs?limit=abc')).json()).runs.length).toBe(2)
  })
})

describe('data refreshes are logged', () => {
  it('the public trends refresh writes a run, and the button still works for everyone', async () => {
    const base = await start()
    const response = await fetch(`${base}/api/refresh-trends`, { method: 'POST' })
    expect(response.status).toBe(200)
    const { runs } = await (await get(base, '/runs')).json()
    expect(runs[0]).toMatchObject({ type: 'trends' })
    expect(['ok', 'partial', 'failed']).toContain(runs[0].status)
  })
})

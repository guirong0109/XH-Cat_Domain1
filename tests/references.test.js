import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changedFields, checkLink, parseRolePage, readReferences, refreshReferences, visibleBlocks } from '../server/references.js'

const fixture = (name) => readFileSync(new URL(`../pipeline/tests/fixtures/${name}`, import.meta.url), 'utf8')
const snapshot = JSON.parse(readFileSync(new URL('../data/emasco/roles_raw.json', import.meta.url), 'utf8'))
const saved = (code) => snapshot.roles.find((role) => role.code === code)
const real = fixture('emasco_2411-01.html')
// A second role: the same real page under another code, so a two-role refresh can be tested.
const page = { '2411-01': real, '2411-99': real.replaceAll('2411-01', '2411-99') }
const savedSecond = () => ({ ...saved('2411-01'), code: '2411-99' })

function reply(status, body = '', headers = {}) {
  return { status, text: async () => body, headers: { get: (name) => headers[name.toLowerCase()] ?? null, getSetCookie: () => [] } }
}

describe('visibleBlocks', () => {
  it('splits on block tags, joins inline text, skips scripts and decodes entities', () => {
    const html = '<div>One <b>two</b>&nbsp;three</div><script>var a = "<p>x</p>"</script><p>Fish &amp; chips &#8217;</p><br/>'
    expect(visibleBlocks(html)).toEqual(['One two three', 'Fish & chips ’'])
  })
})

describe('parseRolePage on the saved real pages', () => {
  for (const code of ['2411-01']) {
    it(`reads ${code} the same as the saved snapshot`, () => {
      const role = parseRolePage(page[code])
      expect(role.code).toBe(code)
      expect(role.title).toBe(saved(code).title)
      expect(changedFields(saved(code), role)).toEqual([])
    })
  }
  it('throws when a section is missing', () => {
    expect(() => parseRolePage('<p>Nothing here</p>')).toThrow(/not found/)
  })
})

describe('changedFields', () => {
  const base = { tasks: ['Do A.', 'Do B.'], basic_skills: ['x'], specific_skills: ['y'], description: 'Desc' }
  it('ignores punctuation, case and spacing', () => {
    expect(changedFields(base, { ...base, tasks: ['do a', 'Do  B'] })).toEqual([])
  })
  it('names the fields that changed', () => {
    expect(changedFields(base, { ...base, tasks: ['Do A.'], specific_skills: ['z'] })).toEqual(['tasks', 'specific_skills'])
  })
})

describe('checkLink', () => {
  const now = new Date('2026-10-22T10:00:00Z')
  it('is ok for 200 and not ok for 404', async () => {
    expect(await checkLink('https://a.test', { fetchImpl: async () => reply(200), now })).toEqual({ ok: true, status: 200, checkedAt: now.toISOString() })
    expect((await checkLink('https://a.test', { fetchImpl: async () => reply(404), now })).ok).toBe(false)
  })
  it('follows a redirect', async () => {
    const calls = []
    const fetchImpl = async (url) => {
      calls.push(url)
      return url.includes('/b') ? reply(200) : reply(302, '', { location: 'http://a.test/b' })
    }
    expect((await checkLink('https://a.test/a', { fetchImpl, now })).ok).toBe(true)
    expect(calls).toEqual(['https://a.test/a', 'https://a.test/b'])
  })
  it('is not ok on a network error or a redirect loop', async () => {
    const down = await checkLink('https://a.test', {
      fetchImpl: async () => {
        throw new Error('down')
      },
      now,
    })
    expect(down).toEqual({ ok: false, status: null, checkedAt: now.toISOString() })
    const loop = await checkLink('https://a.test', { fetchImpl: async () => reply(302, '', { location: '/again' }), now })
    expect(loop.ok).toBe(false)
  })
})

describe('refreshReferences', () => {
  let directory
  let filePath
  const savedRoles = [saved('2411-01'), savedSecond()]
  const now = new Date('2026-10-22T10:00:00Z')
  const sleep = async () => {}

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    directory = await mkdtemp(path.join(tmpdir(), 'refs-'))
    filePath = path.join(directory, 'references.json')
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  const goodFetch = async (url) => {
    const code = url.match(/masco\/([\d-]+)/)?.[1]
    return code ? reply(200, page[code]) : reply(200)
  }

  it('writes dated results for roles and links', async () => {
    const result = await refreshReferences({ filePath, savedRoles, links: ['https://p.test/'], fetchImpl: goodFetch, now, sleep })
    expect(result.status).toBe('updated')
    expect(result.message).toBe('2 of 2 roles read, 0 changed, 0 links not checked.')
    const file = await readReferences(filePath)
    expect(file.roles['2411-01']).toEqual({ ok: true, checkedAt: now.toISOString(), changed: [] })
    expect(file.links['https://p.test/'].ok).toBe(true)
  })

  it('flags a changed role', async () => {
    const edited = { ...saved('2411-01'), tasks: [...saved('2411-01').tasks, 'A brand new task for the role.'] }
    const result = await refreshReferences({ filePath, savedRoles: [edited], links: [], fetchImpl: goodFetch, now, sleep })
    expect(result.references.roles['2411-01'].changed).toEqual(['tasks'])
    expect(result.message).toContain('1 changed')
  })

  it('records a failed role but keeps the other results (partial)', async () => {
    const fetchImpl = async (url) => (url.includes('2411-99') ? reply(500) : goodFetch(url))
    const result = await refreshReferences({ filePath, savedRoles, links: [], fetchImpl, now, sleep })
    expect(result.status).toBe('partial')
    const file = await readReferences(filePath)
    expect(file.roles['2411-01'].ok).toBe(true)
    expect(file.roles['2411-99'].ok).toBe(false)
  })

  it('keeps the last good file when nothing can be read', async () => {
    await refreshReferences({ filePath, savedRoles, links: [], fetchImpl: goodFetch, now, sleep })
    const before = await readFile(filePath, 'utf8')
    const result = await refreshReferences({
      filePath,
      savedRoles,
      links: [],
      fetchImpl: async () => reply(503),
      now: new Date('2026-10-23T10:00:00Z'),
      sleep,
    })
    expect(result.status).toBe('failed')
    expect(result.message).toBe('Showing the check from 2026-10-22. Live check failed.')
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })

  it('reports a failed check with no saved file', async () => {
    const result = await refreshReferences({ filePath, savedRoles, links: [], fetchImpl: async () => reply(503), now, sleep })
    expect(result.message).toBe('Live check failed. No saved check yet.')
    expect(await readReferences(filePath)).toBeNull()
  })

  it('counts links that could not be checked', async () => {
    const fetchImpl = async (url) => (url.includes('bad.test') ? reply(404) : goodFetch(url))
    const result = await refreshReferences({ filePath, savedRoles, links: ['https://bad.test/'], fetchImpl, now, sleep })
    expect(result.status).toBe('partial')
    expect(result.message).toContain('1 link not checked')
  })

  it('shares one run between two simultaneous calls and waits between pages', async () => {
    const sleeps = []
    const slow = async (ms) => {
      sleeps.push(ms)
    }
    const first = refreshReferences({ filePath, savedRoles, links: [], fetchImpl: goodFetch, now, sleep: slow, delayMs: 2000 })
    const second = refreshReferences({ filePath, savedRoles, links: [], fetchImpl: goodFetch, now, sleep: slow, delayMs: 2000 })
    expect(second).toBe(first)
    await first
    expect(sleeps).toEqual([2000])
  })
})

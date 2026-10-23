import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_FEEDS, passesFilter, refreshEmerging, reviewItem } from '../server/emerging.js'

const now = new Date('2026-10-24T02:00:00Z')
const skills = [{ label: 'Data analysis', keywords: ['data analysis'] }]
const groups = ['Working with data']

const item = (over = {}) => ({
  id: 'x1',
  title: 'Saved item one',
  url: 'https://saved.test/1',
  source: 'OpenAlex',
  confidence: 'high',
  language: 'en',
  publishedAt: '2026-10-20',
  checkedOn: '2026-10-22',
  fields: ['General'],
  skills: [],
  summary: 'ok',
  review: 'pending',
  ...over,
})

function rss(items) {
  const body = items.map((i) => `<item><title>${i.title}</title><link>${i.url}</link><pubDate>${i.date}</pubDate></item>`).join('')
  return `<rss><channel>${body}</channel></rss>`
}

let directory
let filePath

async function save(content) {
  await writeFile(filePath, JSON.stringify(content))
}
const load = async () => JSON.parse(await readFile(filePath, 'utf8'))

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  directory = await mkdtemp(path.join(tmpdir(), 'emerging-review-'))
  filePath = path.join(directory, 'emerging.json')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('reviewItem', () => {
  it('marks an item reviewed and back to pending', async () => {
    await save({ checkedOn: '2026-10-22', items: [item(), item({ id: 'x2', url: 'https://saved.test/2' })] })
    expect((await reviewItem({ filePath, id: 'x1', action: 'reviewed' })).status).toBe('ok')
    let saved = await load()
    expect(saved.items.map((i) => i.review)).toEqual(['reviewed', 'pending'])
    await reviewItem({ filePath, id: 'x1', action: 'pending' })
    saved = await load()
    expect(saved.items[0].review).toBe('pending')
  })

  it('deletes an item and remembers its address', async () => {
    await save({ checkedOn: '2026-10-22', items: [item(), item({ id: 'x2', url: 'https://saved.test/2' })] })
    const result = await reviewItem({ filePath, id: 'x1', action: 'delete' })
    expect(result.status).toBe('ok')
    const saved = await load()
    expect(saved.items.map((i) => i.id)).toEqual(['x2'])
    expect(saved.removedUrls).toEqual(['https://saved.test/1'])
  })

  it('says not-found for an unknown id and bad-action for an unknown action, and changes nothing', async () => {
    const content = { checkedOn: '2026-10-22', items: [item()] }
    await save(content)
    expect((await reviewItem({ filePath, id: 'nope', action: 'reviewed' })).status).toBe('not-found')
    expect((await reviewItem({ filePath, id: 'x1', action: 'explode' })).status).toBe('bad-action')
    expect(await load()).toEqual(content)
  })

  it('says not-found when there is no file yet', async () => {
    expect((await reviewItem({ filePath, id: 'x1', action: 'reviewed' })).status).toBe('not-found')
  })

  it('keeps only the newest 500 removed addresses', async () => {
    const removed = Array.from({ length: 500 }, (_, n) => `https://gone.test/${n}`)
    await save({ checkedOn: '2026-10-22', removedUrls: removed, items: [item()] })
    await reviewItem({ filePath, id: 'x1', action: 'delete' })
    const saved = await load()
    expect(saved.removedUrls).toHaveLength(500)
    expect(saved.removedUrls.at(-1)).toBe('https://saved.test/1')
    expect(saved.removedUrls[0]).toBe('https://gone.test/1')
  })
})

describe('refresh with reviews', () => {
  const feed = { name: 'Test Feed', url: 'https://feed.test/rss', filter: 'work', language: 'en' }
  const feedItems = [
    { title: 'Firm cuts jobs after AI push', url: 'https://feed.test/a', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
    { title: 'Staff skills gap widens', url: 'https://feed.test/b', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
  ]
  const fetchFor = (extra = {}) =>
    vi.fn(async (url) => {
      const host = new URL(url).hostname
      if (extra.gate && host === 'api.openalex.org') await extra.gate
      if (host === 'api.openalex.org') return { ok: true, status: 200, json: async () => ({ results: [] }) }
      if (host === 'feed.test') return { ok: true, status: 200, text: async () => rss(feedItems) }
      return { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' }
    })
  const run = (extra = {}) => refreshEmerging({ filePath, skills, groups, now, feeds: [feed], force: true, ...extra })

  it('uses only the feeds it is given', async () => {
    const fetchImpl = fetchFor()
    await run({ fetchImpl })
    const hosts = fetchImpl.mock.calls.map(([url]) => new URL(url).hostname)
    expect(hosts).toContain('feed.test')
    expect(hosts).not.toContain('news.mit.edu')
    const saved = await load()
    expect(saved.sources.map((s) => s.name)).toEqual(['OpenAlex', 'Test Feed'])
    expect(saved.sources.find((s) => s.name === 'Test Feed').count).toBe(2)
  })

  it('does not bring back a deleted item', async () => {
    await save({ checkedOn: '2026-10-22', checkedAt: '2026-10-22T00:00:00.000Z', removedUrls: ['https://feed.test/a'], items: [] })
    await run({ fetchImpl: fetchFor() })
    const saved = await load()
    expect(saved.items.map((i) => i.url)).toEqual(['https://feed.test/b'])
    expect(saved.removedUrls).toEqual(['https://feed.test/a'])
  })

  it('keeps a review made while the refresh is running', async () => {
    await save({ checkedOn: '2026-10-22', checkedAt: '2026-10-22T00:00:00.000Z', items: [item()] })
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const refresh = run({ fetchImpl: fetchFor({ gate }) })
    await reviewItem({ filePath, id: 'x1', action: 'reviewed' })
    release()
    await refresh
    const saved = await load()
    expect(saved.items.find((i) => i.id === 'x1').review).toBe('reviewed')
    expect(saved.items.some((i) => i.url === 'https://feed.test/a')).toBe(true)
  })

  it('keeps a delete made while the refresh is running', async () => {
    await save({ checkedOn: '2026-10-22', checkedAt: '2026-10-22T00:00:00.000Z', items: [item()] })
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const refresh = run({ fetchImpl: fetchFor({ gate }) })
    await reviewItem({ filePath, id: 'x1', action: 'delete' })
    release()
    await refresh
    const saved = await load()
    expect(saved.items.some((i) => i.id === 'x1')).toBe(false)
    expect(saved.removedUrls).toContain('https://saved.test/1')
  })
})

describe('passesFilter and built-in feeds', () => {
  it('applies the same rules as the refresh', () => {
    expect(passesFilter('work', { title: 'Bank to axe jobs', snippet: '' })).toBe(true)
    expect(passesFilter('work', { title: 'Yen shines as AI jitters grow', snippet: '' })).toBe(false)
    expect(passesFilter('topic', { title: 'New AI model released', snippet: '' })).toBe(true)
    expect(passesFilter(false, { title: 'Anything at all', snippet: '' })).toBe(true)
  })
  it('lists the built-in feeds with a language and filter', () => {
    expect(BUILT_IN_FEEDS.length).toBeGreaterThanOrEqual(9)
    expect(BUILT_IN_FEEDS.every((feed) => feed.name && feed.url.startsWith('https://'))).toBe(true)
  })
})

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_FEEDS } from '../server/emerging.js'
import {
  activeFeeds,
  allFeeds,
  checkFeed,
  readSourceConfig,
  robotsAllows,
  sourceId,
  validateNewSource,
  writeSourceConfig,
} from '../server/emergingSources.js'

const good = { name: 'Utusan Malaysia', url: 'https://www.utusan.com.my/feed/', language: 'ms', filter: 'work' }

describe('validateNewSource', () => {
  it('accepts a good source and cleans it', () => {
    const result = validateNewSource({ ...good, name: '  Utusan Malaysia  ' }, [])
    expect(result).toEqual({ ok: true, source: { name: 'Utusan Malaysia', url: 'https://www.utusan.com.my/feed/', language: 'ms', filter: 'work' } })
  })
  it('maps "all" to no filter', () => {
    expect(validateNewSource({ ...good, filter: 'all' }, []).source.filter).toBe(false)
  })
  it.each([
    ['http address', { url: 'http://www.utusan.com.my/feed/' }],
    ['localhost', { url: 'https://localhost/feed' }],
    ['loopback ip', { url: 'https://127.0.0.1/feed' }],
    ['private ip', { url: 'https://192.168.1.5/feed' }],
    ['private ip 10', { url: 'https://10.0.0.7/feed' }],
    ['private ip 172', { url: 'https://172.20.1.1/feed' }],
    ['link-local ip', { url: 'https://169.254.169.254/latest' }],
    ['ipv6', { url: 'https://[::1]/feed' }],
    ['dot local name', { url: 'https://printer.local/feed' }],
    ['credentials in address', { url: 'https://user:pass@example.com/feed' }],
    ['other port', { url: 'https://example.com:8443/feed' }],
    ['not a url', { url: 'not a url' }],
    ['empty name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(61) }],
    ['bad language', { language: 'fr' }],
    ['bad filter', { filter: 'weird' }],
  ])('rejects %s', (_label, over) => {
    const result = validateNewSource({ ...good, ...over }, [])
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
  })
  it('rejects an address that is already in the list', () => {
    expect(validateNewSource(good, [good.url]).ok).toBe(false)
  })
  it('rejects a body that is not an object', () => {
    expect(validateNewSource(null, []).ok).toBe(false)
    expect(validateNewSource('x', []).ok).toBe(false)
  })
})

describe('robotsAllows', () => {
  it('allows when there are no rules', () => {
    expect(robotsAllows('', '/feed')).toBe(true)
  })
  it('blocks a disallowed path for everyone', () => {
    expect(robotsAllows('User-agent: *\nDisallow: /feed', '/feed/')).toBe(false)
    expect(robotsAllows('User-agent: *\nDisallow: /feed', '/news')).toBe(true)
  })
  it('lets a longer Allow win over a shorter Disallow', () => {
    expect(robotsAllows('User-agent: *\nDisallow: /\nAllow: /feed', '/feed')).toBe(true)
    expect(robotsAllows('User-agent: *\nDisallow: /\nAllow: /feed', '/other')).toBe(false)
  })
  it('ignores rules for other robots and comments', () => {
    expect(robotsAllows('User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private # secret', '/feed')).toBe(true)
  })
  it('treats an empty Disallow as allow all', () => {
    expect(robotsAllows('User-agent: *\nDisallow:', '/feed')).toBe(true)
  })
})

const xml = (items) =>
  `<rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.url}</link><pubDate>Wed, 22 Oct 2026 09:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`

function fetchFor({ robots = { status: 404 }, feed }) {
  return vi.fn(async (url) => {
    if (url.endsWith('/robots.txt')) {
      if (robots.error) throw new Error('network down')
      return { ok: robots.status === 200, status: robots.status, text: async () => robots.body ?? '' }
    }
    if (feed.error) throw new Error('network down')
    return { ok: (feed.status ?? 200) === 200, status: feed.status ?? 200, text: async () => feed.body ?? '' }
  })
}

describe('checkFeed', () => {
  const items = [
    { title: 'Pekerja kilang dilatih kemahiran AI', url: 'https://x.test/1' },
    { title: 'Pasukan bola menang', url: 'https://x.test/2' },
  ]
  it('reads the feed and counts how many pass the filter', async () => {
    const result = await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ feed: { body: xml(items) } }))
    expect(result).toMatchObject({ ok: true, robots: 'none', total: 2, passed: 1 })
    expect(result.sample.map((i) => i.title)).toEqual(['Pekerja kilang dilatih kemahiran AI', 'Pasukan bola menang'])
  })
  it('shows at most five sample items', async () => {
    const many = Array.from({ length: 9 }, (_, n) => ({ title: `Jobs story ${n}`, url: `https://x.test/${n}` }))
    const result = await checkFeed({ url: good.url, filter: false }, fetchFor({ feed: { body: xml(many) } }))
    expect(result.total).toBe(9)
    expect(result.sample).toHaveLength(5)
  })
  it('does not ok a feed that robots.txt blocks, and does not even fetch the feed', async () => {
    const fetchImpl = fetchFor({ robots: { status: 200, body: 'User-agent: *\nDisallow: /feed' }, feed: { body: xml(items) } })
    const result = await checkFeed({ url: good.url, filter: 'work' }, fetchImpl)
    expect(result).toMatchObject({ ok: false, robots: 'blocked' })
    expect(fetchImpl.mock.calls.some(([url]) => url === good.url)).toBe(false)
  })
  it('does not ok a feed when robots.txt cannot be read', async () => {
    const result = await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ robots: { error: true }, feed: { body: xml(items) } }))
    expect(result).toMatchObject({ ok: false, robots: 'unknown' })
  })
  it('reports an HTTP error, an empty feed, a page that is not a feed, and a network error', async () => {
    expect((await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ feed: { status: 404 } }))).error).toMatch(/404/)
    expect((await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ feed: { body: xml([]) } }))).ok).toBe(false)
    expect((await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ feed: { body: '<html><body>Hello</body></html>' } }))).ok).toBe(false)
    expect((await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ feed: { error: true } }))).ok).toBe(false)
  })
  it('refuses a feed that is too large', async () => {
    const big = xml(items) + ' '.repeat(2_100_000)
    const result = await checkFeed({ url: good.url, filter: 'work' }, fetchFor({ feed: { body: big } }))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/too large/i)
  })
  it('never follows a redirect to another address', async () => {
    const fetchImpl = fetchFor({ feed: { body: xml(items) } })
    await checkFeed({ url: good.url, filter: 'work' }, fetchImpl)
    for (const [, options] of fetchImpl.mock.calls) expect(options.redirect).toBe('error')
  })
})

describe('source list', () => {
  let directory
  let file
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'sources-'))
    file = path.join(directory, 'emerging_sources.json')
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('starts empty when the file is missing or broken', async () => {
    expect(await readSourceConfig(file)).toEqual({ custom: [], off: [] })
    await writeFile(file, '{not json')
    expect(await readSourceConfig(file)).toEqual({ custom: [], off: [] })
  })
  it('saves and reads back', async () => {
    await writeSourceConfig(file, { custom: [good], off: ['https://x.test/feed'] })
    expect(await readSourceConfig(file)).toEqual({ custom: [good], off: ['https://x.test/feed'] })
    expect(JSON.parse(await readFile(file, 'utf8')).custom[0].name).toBe('Utusan Malaysia')
  })
  it('lists built-in and custom sources with ids and switches', () => {
    const rows = allFeeds({ custom: [good], off: [BUILT_IN_FEEDS[0].url] })
    expect(rows).toHaveLength(BUILT_IN_FEEDS.length + 1)
    expect(rows[0]).toMatchObject({ builtIn: true, enabled: false, id: sourceId(BUILT_IN_FEEDS[0].url) })
    expect(rows.at(-1)).toMatchObject({ builtIn: false, enabled: true, name: 'Utusan Malaysia' })
  })
  it('gives the refresh only the sources that are on', () => {
    const feeds = activeFeeds({ custom: [good], off: [BUILT_IN_FEEDS[0].url] })
    expect(feeds.find((feed) => feed.url === BUILT_IN_FEEDS[0].url)).toBeUndefined()
    expect(feeds.find((feed) => feed.url === good.url)).toMatchObject({ name: 'Utusan Malaysia', language: 'ms', filter: 'work' })
  })
  it('ids are stable and differ per address', () => {
    expect(sourceId('https://a.test/feed')).toBe(sourceId('https://a.test/feed'))
    expect(sourceId('https://a.test/feed')).not.toBe(sourceId('https://b.test/feed'))
  })
})

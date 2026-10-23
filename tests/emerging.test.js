import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modelFromEnv, parseFeed, readEmerging, refreshEmerging, validateTags } from '../server/emerging.js'

const now = new Date('2026-10-24T02:00:00Z')
const groups = ['Working with data', 'Building software']
const skills = [
  { label: 'Data analysis', keywords: ['data analysis', 'analytics'] },
  { label: 'Python programming', keywords: ['python'] },
]
const KEY = 'sk-secret-key-123'
const primary = { url: 'https://primary.test/chat', key: KEY, model: 'm1' }
const backup = { url: 'https://backup.test/chat', key: 'backup-secret-456', model: 'm2' }

function rss(items) {
  const body = items
    .map((i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.url}</link><pubDate>${i.date}</pubDate><description>${i.snippet ?? ''}</description></item>`)
    .join('')
  return `<?xml version="1.0"?><rss version="2.0"><channel>${body}</channel></rss>`
}

const mitNews = [{ title: 'Students build AI tutor', url: 'https://news.mit.edu/a1', date: 'Tue, 21 Oct 2026 10:00:00 GMT', snippet: 'A python tool.' }]
const star = [
  { title: 'Firms seek data analysis talent', url: 'https://fmt.test/b1', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
  { title: 'Football final tonight', url: 'https://fmt.test/b2', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
]
const openalex = {
  results: [
    {
      id: 'https://openalex.org/W1',
      title: 'AI and clerical jobs',
      publication_date: '2026-10-20',
      primary_location: { landing_page_url: 'https://journal.test/w1' },
    },
  ],
}

function modelReply(content) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }) }
}

function makeFetch({ modelHandler, feeds = {}, openalexBody = openalex, failHosts = [] } = {}) {
  const calls = []
  const impl = vi.fn(async (url, options = {}) => {
    const host = new URL(url).hostname
    calls.push(url)
    if (failHosts.includes(host)) throw new Error('network down')
    if (host === 'api.openalex.org') return { ok: true, status: 200, json: async () => openalexBody }
    if (host === 'primary.test' || host === 'backup.test') return modelHandler(host, options)
    const items = feeds[host] ?? []
    return { ok: true, status: 200, text: async () => rss(items) }
  })
  impl.calls = calls
  return impl
}

const defaultFeeds = { 'news.mit.edu': mitNews, 'www.freemalaysiatoday.com': star }

function goodModel(_host, options) {
  const sent = JSON.parse(JSON.parse(options.body).messages[1].content)
  return modelReply({
    items: sent.map((i) => ({ id: i.id, fields: ['Working with data'], skills: ['Data analysis', 'Quantum widgets'], summary: `Summary of ${i.title}` })),
  })
}

let directory
let filePath

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  directory = await mkdtemp(path.join(tmpdir(), 'emerging-'))
  filePath = path.join(directory, 'emerging.json')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

const run = (extra = {}) => refreshEmerging({ filePath, skills, groups, now, primary, backup, ...extra })

describe('parseFeed', () => {
  it('reads title, link, date and snippet, decodes entities and strips tags', () => {
    const xml = rss([{ title: 'A &amp; B', url: 'https://x.test/1', date: 'Tue, 21 Oct 2026 10:00:00 GMT', snippet: '&lt;p&gt;Hello <b>world</b>&lt;/p&gt;' }])
    expect(parseFeed(xml)).toEqual([{ title: 'A & B', url: 'https://x.test/1', publishedAt: '2026-10-21', snippet: 'Hello world' }])
  })
  it('skips items with no link, no title or an unreadable date', () => {
    const xml = '<rss><channel><item><title>No link</title></item><item><title>Bad date</title><link>https://x.test/2</link><pubDate>soon</pubDate></item></channel></rss>'
    expect(parseFeed(xml)).toEqual([])
  })
  it('refuses links that are not http or https', () => {
    const xml = rss([{ title: 'T', url: 'javascript:alert(1)', date: 'Tue, 21 Oct 2026 10:00:00 GMT' }])
    expect(parseFeed(xml)).toEqual([])
  })
})

describe('validateTags', () => {
  const lists = { groups, skillLabels: skills.map((s) => s.label) }
  it('accepts a good reply and marks unknown skills as not in eMASCO', () => {
    const tags = validateTags({ items: [{ id: 'a', fields: ['Building software'], skills: ['Python programming', 'Foo'], summary: 'ok' }] }, ['a'], lists)
    expect(tags.get('a')).toEqual({ fields: ['Building software'], skills: [{ name: 'Python programming', inEmasco: true }, { name: 'Foo', inEmasco: false }], summary: 'ok' })
  })
  it('turns unknown fields into General', () => {
    const tags = validateTags({ items: [{ id: 'a', fields: ['Made up'], skills: [], summary: '' }] }, ['a'], lists)
    expect(tags.get('a').fields).toEqual(['General'])
  })
  it('rejects the whole reply for an id that was not sent', () => {
    expect(() => validateTags({ items: [{ id: 'zzz', fields: [], skills: [], summary: '' }] }, ['a'], lists)).toThrow()
  })
  it('rejects a reply with the wrong shape', () => {
    expect(() => validateTags({ nope: true }, ['a'], lists)).toThrow()
    expect(() => validateTags({ items: [{ id: 'a', fields: 'x', skills: [], summary: '' }] }, ['a'], lists)).toThrow()
  })
  it('limits summary length and skill count', () => {
    const tags = validateTags({ items: [{ id: 'a', fields: [], skills: ['1', '2', '3', '4', '5'], summary: 'x'.repeat(500) }] }, ['a'], lists)
    expect(tags.get('a').summary.length).toBeLessThanOrEqual(220)
    expect(tags.get('a').skills.length).toBeLessThanOrEqual(3)
  })
})

describe('modelFromEnv', () => {
  it('needs url, key and model', () => {
    expect(modelFromEnv({ EMERGING_API_URL: 'u', EMERGING_API_KEY: 'k', EMERGING_API_MODEL: 'm' }, 'EMERGING_API')).toEqual({ url: 'u', key: 'k', model: 'm' })
    expect(modelFromEnv({ EMERGING_API_URL: 'u' }, 'EMERGING_API')).toBeNull()
  })
})

describe('refreshEmerging', () => {
  it('collects, filters, tags and writes items with source, tier and dates', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    const result = await run({ fetchImpl })
    expect(result.status).toBe('updated')
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.checkedOn).toBe('2026-10-24')
    expect(saved.tagging).toBe('ai')
    const titles = saved.items.map((i) => i.title)
    expect(titles).toContain('AI and clerical jobs')
    expect(titles).toContain('Students build AI tutor')
    expect(titles).toContain('Firms seek data analysis talent')
    expect(titles).not.toContain('Football final tonight')
    const oa = saved.items.find((i) => i.title === 'AI and clerical jobs')
    expect(oa).toMatchObject({ url: 'https://journal.test/w1', source: 'OpenAlex', confidence: 'high', review: 'pending', publishedAt: '2026-10-20', checkedOn: '2026-10-24' })
    const mit = saved.items.find((i) => i.url === 'https://news.mit.edu/a1')
    expect(mit.confidence).toBe('medium')
    expect(mit.skills).toContainEqual({ name: 'Quantum widgets', inEmasco: false })
    expect(saved.items.map((i) => i.publishedAt)).toEqual([...saved.items.map((i) => i.publishedAt)].sort().reverse())
  })

  it('sends headlines as data in one call, with the lists, and the key only in the header', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    await run({ fetchImpl })
    const modelCalls = fetchImpl.mock.calls.filter(([url]) => url.startsWith('https://primary.test'))
    expect(modelCalls).toHaveLength(1)
    const [, options] = modelCalls[0]
    expect(options.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(options.body).not.toContain(KEY)
    expect(options.body).toContain('Working with data')
    expect(options.body).toContain('Data analysis')
  })

  it('uses the backup only when the main one fails', async () => {
    const modelHandler = (host, options) => (host === 'primary.test' ? { ok: false, status: 429, json: async () => ({}) } : goodModel(host, options))
    const fetchImpl = makeFetch({ modelHandler, feeds: defaultFeeds })
    const result = await run({ fetchImpl })
    expect(result.status).toBe('updated')
    expect(fetchImpl.calls.some((u) => u.startsWith('https://backup.test'))).toBe(true)
    expect(JSON.parse(await readFile(filePath, 'utf8')).tagging).toBe('ai')
  })

  it('does not call the backup when the main one works', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    await run({ fetchImpl })
    expect(fetchImpl.calls.some((u) => u.startsWith('https://backup.test'))).toBe(false)
  })

  it('falls back to the backup on invalid JSON', async () => {
    const modelHandler = (host, options) => (host === 'primary.test' ? modelReply('not json at all') : goodModel(host, options))
    const result = await run({ fetchImpl: makeFetch({ modelHandler, feeds: defaultFeeds }) })
    expect(result.status).toBe('updated')
    expect(JSON.parse(await readFile(filePath, 'utf8')).tagging).toBe('ai')
  })

  it('falls back to the backup when the reply names an id that was not sent', async () => {
    const modelHandler = (host, options) => (host === 'primary.test' ? modelReply({ items: [{ id: 'evil', fields: [], skills: [], summary: 'x' }] }) : goodModel(host, options))
    const result = await run({ fetchImpl: makeFetch({ modelHandler, feeds: defaultFeeds }) })
    expect(result.status).toBe('updated')
  })

  it('uses keyword tagging with no summary when both models fail, and never saves a model reply', async () => {
    const modelHandler = () => ({ ok: false, status: 500, json: async () => ({}) })
    const result = await run({ fetchImpl: makeFetch({ modelHandler, feeds: defaultFeeds }) })
    expect(result.status).toBe('updated')
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.tagging).toBe('keywords')
    const mit = saved.items.find((i) => i.url === 'https://news.mit.edu/a1')
    expect(mit.summary).toBe('')
    expect(mit.fields).toEqual(['General'])
    expect(mit.skills).toEqual([{ name: 'Python programming', inEmasco: true }])
  })

  it('uses keyword tagging when no model is set', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    const result = await run({ fetchImpl, primary: null, backup: null })
    expect(result.status).toBe('updated')
    expect(JSON.parse(await readFile(filePath, 'utf8')).tagging).toBe('keywords')
    expect(fetchImpl.calls.some((u) => u.includes('.test/chat'))).toBe(false)
  })

  it('never writes the key or the full model reply to the file, the result or the log', async () => {
    const modelHandler = () => ({ ok: false, status: 401, json: async () => ({ error: KEY }) })
    const result = await run({ fetchImpl: makeFetch({ modelHandler, feeds: defaultFeeds }) })
    const logged = JSON.stringify(console.error.mock.calls)
    for (const text of [await readFile(filePath, 'utf8'), JSON.stringify(result), logged]) {
      expect(text).not.toContain(KEY)
      expect(text).not.toContain('backup-secret-456')
    }
  })

  it('keeps the old file when every source fails', async () => {
    const old = { checkedOn: '2026-10-10', checkedAt: '2026-10-10T00:00:00.000Z', items: [] }
    await writeFile(filePath, JSON.stringify(old))
    const failHosts = ['api.openalex.org', 'news.mit.edu', 'www.technologyreview.com', 'www.freemalaysiatoday.com', 'www.malaymail.com', 'www.bharian.com.my', 'www.astroawani.com', 'feeds.bbci.co.uk', 'rss.dw.com']
    const result = await run({ fetchImpl: makeFetch({ modelHandler: goodModel, failHosts }) })
    expect(result.status).toBe('failed')
    expect(result.emerging.checkedOn).toBe('2026-10-10')
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(old)
  })

  it('still works when one source is down and records which', async () => {
    const result = await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds: defaultFeeds, failHosts: ['api.openalex.org'] }) })
    expect(result.status).toBe('updated')
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.sources.find((s) => s.name === 'OpenAlex').ok).toBe(false)
    expect(saved.sources.find((s) => s.name === 'MIT News').ok).toBe(true)
  })

  it('does not change an item the admin already reviewed, and does not duplicate it', async () => {
    const reviewed = { id: 'x1', title: 'Old title kept', url: 'https://journal.test/w1', source: 'OpenAlex', confidence: 'high', publishedAt: '2026-10-20', checkedOn: '2026-10-17', fields: ['Business'], skills: [], summary: 'checked by hand', review: 'reviewed' }
    await writeFile(filePath, JSON.stringify({ checkedOn: '2026-10-17', checkedAt: '2026-10-17T00:00:00.000Z', items: [reviewed] }))
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds: defaultFeeds }), force: true })
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.items.filter((i) => i.url === 'https://journal.test/w1')).toEqual([reviewed])
  })

  it('removes duplicates by url and by title across sources', async () => {
    const feeds = {
      'news.mit.edu': [{ title: 'Same Story: AI jobs', url: 'https://a.test/1', date: 'Tue, 21 Oct 2026 10:00:00 GMT' }],
      'www.technologyreview.com': [{ title: 'same story - ai jobs', url: 'https://b.test/2', date: 'Tue, 21 Oct 2026 10:00:00 GMT' }, { title: 'Other AI skills news', url: 'https://a.test/1', date: 'Tue, 21 Oct 2026 10:00:00 GMT' }],
    }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds, openalexBody: { results: [] } }) })
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.items).toHaveLength(1)
  })

  it('drops items older than the age limit', async () => {
    const feeds = { 'news.mit.edu': [{ title: 'Ancient AI news', url: 'https://a.test/old', date: 'Mon, 01 Jan 2024 10:00:00 GMT' }] }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds, openalexBody: { results: [] } }) })
    expect(JSON.parse(await readFile(filePath, 'utf8')).items).toEqual([])
  })

  it('writes an empty feed with a new checked date when nothing is new', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, openalexBody: { results: [] } })
    const result = await run({ fetchImpl })
    expect(result.status).toBe('updated')
    expect(JSON.parse(await readFile(filePath, 'utf8')).checkedOn).toBe('2026-10-24')
    expect(fetchImpl.calls.some((u) => u.includes('.test/chat'))).toBe(false)
  })

  it('returns the saved file when called too soon, unless forced', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    await run({ fetchImpl })
    const count = fetchImpl.calls.length
    const again = await run({ fetchImpl, now: new Date('2026-10-26T00:00:00Z') })
    expect(again.status).toBe('skipped')
    expect(fetchImpl.calls.length).toBe(count)
    const daily = await run({ fetchImpl, now: new Date('2026-10-26T00:00:00Z'), interval: 'daily' })
    expect(daily.status).toBe('updated')
    const forced = await run({ fetchImpl, now: new Date('2026-10-26T01:00:00Z'), force: true })
    expect(forced.status).toBe('updated')
  })

  it('shares one run between two refreshes at once', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    const [a, b] = await Promise.all([run({ fetchImpl }), run({ fetchImpl })])
    expect(a).toBe(b)
    expect(fetchImpl.calls.filter((u) => u.startsWith('https://primary.test'))).toHaveLength(1)
  })

  it('drops items dated in the future', async () => {
    const body = { results: [
      { id: 'https://openalex.org/W9', title: 'AI jobs preprint from the future', publication_date: '2045-12-10', primary_location: { landing_page_url: 'https://journal.test/future' } },
      ...openalex.results,
    ] }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, openalexBody: body }) })
    const titles = JSON.parse(await readFile(filePath, 'utf8')).items.map((i) => i.title)
    expect(titles).toEqual(['AI and clerical jobs'])
  })

  it('needs a work word in Malaysian news, not just the word AI', async () => {
    const feeds = { 'www.freemalaysiatoday.com': [
      { title: 'Yen shines as AI jitters spur safe-haven rush', url: 'https://fmt.test/s1', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
      { title: 'Bank to axe 5,000 jobs in push to use AI', url: 'https://fmt.test/s2', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
    ] }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds, openalexBody: { results: [] } }) })
    const titles = JSON.parse(await readFile(filePath, 'utf8')).items.map((i) => i.title)
    expect(titles).toEqual(['Bank to axe 5,000 jobs in push to use AI'])
  })

  it('takes at most 10 new items from one source', async () => {
    const results = Array.from({ length: 15 }, (_, n) => ({ id: `https://openalex.org/W${n}`, title: `AI jobs paper ${n}`, publication_date: '2026-10-20', primary_location: { landing_page_url: `https://journal.test/p${n}` } }))
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, openalexBody: { results } }) })
    expect(JSON.parse(await readFile(filePath, 'utf8')).items).toHaveLength(10)
  })

  it('asks OpenAlex for journal articles only', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel })
    await run({ fetchImpl })
    const url = fetchImpl.calls.find((u) => u.includes('api.openalex.org'))
    expect(url).toContain('primary_location.source.type:journal')
    expect(url).toContain('type:article')
  })

  it('keeps only English, Malay and Chinese papers from OpenAlex', async () => {
    const fetchImpl = makeFetch({
      modelHandler: goodModel,
      openalexBody: { results: [
        { id: 'https://openalex.org/W1', title: 'AI jobs in English', language: 'en', publication_date: '2026-10-20', primary_location: { landing_page_url: 'https://journal.test/en' } },
        { id: 'https://openalex.org/W2', title: 'AI pekerjaan dalam Bahasa Melayu', language: 'ms', publication_date: '2026-10-20', primary_location: { landing_page_url: 'https://journal.test/ms' } },
        { id: 'https://openalex.org/W3', title: 'AI 就业 中文', language: 'zh', publication_date: '2026-10-20', primary_location: { landing_page_url: 'https://journal.test/zh' } },
        { id: 'https://openalex.org/W4', title: 'KI und Arbeit', language: 'de', publication_date: '2026-10-20', primary_location: { landing_page_url: 'https://journal.test/de' } },
      ] },
    })
    await run({ fetchImpl })
    const urls = JSON.parse(await readFile(filePath, 'utf8')).items.map((i) => i.url).sort()
    expect(urls).toEqual(['https://journal.test/en', 'https://journal.test/ms', 'https://journal.test/zh'])
    expect(fetchImpl.calls.find((u) => u.includes('api.openalex.org'))).toContain('language:en|ms|zh')
  })

  it('reads Malay and Chinese feeds, keeps the original title, labels the language', async () => {
    const feeds = {
      'www.bharian.com.my': [
        { title: 'Pekerja kilang dilatih kemahiran AI', url: 'https://bh.test/1', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
        { title: 'Pasukan bola sepak menang final', url: 'https://bh.test/2', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
      ],
      'feeds.bbci.co.uk': [
        { title: '人工智能导致裁员 年轻人就业受冲击', url: 'https://bbc.test/1', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
        { title: '股市今日收盘上涨', url: 'https://bbc.test/2', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
        { title: '德国工人罢工要求加薪 工资谈判', url: 'https://bbc.test/3', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
      ],
      'rss.dw.com': [{ title: '中国毕业生求职 技能培训增加', url: 'https://dw.test/1', date: 'Wed, 22 Oct 2026 09:00:00 GMT' }],
    }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds, openalexBody: { results: [] } }) })
    const items = JSON.parse(await readFile(filePath, 'utf8')).items
    const byUrl = Object.fromEntries(items.map((i) => [i.url, i]))
    expect(Object.keys(byUrl).sort()).toEqual(['https://bbc.test/1', 'https://bbc.test/3', 'https://bh.test/1', 'https://dw.test/1'])
    expect(byUrl['https://bh.test/1']).toMatchObject({ language: 'ms', title: 'Pekerja kilang dilatih kemahiran AI', confidence: 'medium', review: 'pending' })
    expect(byUrl['https://bbc.test/1'].language).toBe('zh')
    expect(byUrl['https://dw.test/1'].source).toBe('DW Chinese')
  })

  it('does not treat different Chinese titles as duplicates', async () => {
    const feeds = { 'rss.dw.com': [
      { title: '就业市场出现新技能需求', url: 'https://dw.test/a', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
      { title: '裁员潮影响毕业生求职', url: 'https://dw.test/b', date: 'Wed, 22 Oct 2026 09:00:00 GMT' },
    ] }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds, openalexBody: { results: [] } }) })
    expect(JSON.parse(await readFile(filePath, 'utf8')).items).toHaveLength(2)
  })

  it('still removes the same Chinese title twice', async () => {
    const feeds = {
      'rss.dw.com': [{ title: '就业市场出现新技能需求', url: 'https://dw.test/a', date: 'Wed, 22 Oct 2026 09:00:00 GMT' }],
      'feeds.bbci.co.uk': [{ title: '就业市场出现新技能需求！', url: 'https://bbc.test/a', date: 'Wed, 22 Oct 2026 09:00:00 GMT' }],
    }
    await run({ fetchImpl: makeFetch({ modelHandler: goodModel, feeds, openalexBody: { results: [] } }) })
    expect(JSON.parse(await readFile(filePath, 'utf8')).items).toHaveLength(1)
  })

  it('tells the model to write summaries in English', async () => {
    const fetchImpl = makeFetch({ modelHandler: goodModel, feeds: defaultFeeds })
    await run({ fetchImpl })
    const [, options] = fetchImpl.mock.calls.find(([url]) => url.startsWith('https://primary.test'))
    expect(JSON.parse(options.body).messages[0].content).toContain('in English')
  })

  it('reads a missing file as null', async () => {
    expect(await readEmerging(filePath)).toBeNull()
  })
})

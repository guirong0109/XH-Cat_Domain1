import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BUILT_IN_FEEDS, parseFeed, passesFilter } from './emerging.js'

const LANGUAGES = ['en', 'ms', 'zh']
const NAME_MAX = 60
const SAMPLE_SIZE = 5
const MAX_FEED_CHARS = 2_000_000
const TIMEOUT_MS = 8000
const ROBOTS_TIMEOUT_MS = 5000
const ROBOTS_AGENT = 'futurereadymy'
const USER_AGENT = 'FutureReadyMY/1.0'

export const sourceId = (url) => createHash('sha1').update(url).digest('hex').slice(0, 10)

// The list the admin keeps: sources added by hand, and the addresses switched off (built-in or added).
export async function readSourceConfig(filePath) {
  try {
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    return {
      custom: Array.isArray(saved.custom) ? saved.custom : [],
      off: Array.isArray(saved.off) ? saved.off : [],
    }
  } catch {
    return { custom: [], off: [] }
  }
}

export async function writeSourceConfig(filePath, config) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`)
  await rename(temporaryPath, filePath)
}

export function allFeeds(config) {
  const row = (feed, builtIn) => ({
    id: sourceId(feed.url),
    name: feed.name,
    url: feed.url,
    language: feed.language ?? 'en',
    filter: feed.filter,
    builtIn,
    enabled: !config.off.includes(feed.url),
  })
  return [...BUILT_IN_FEEDS.map((feed) => row(feed, true)), ...config.custom.map((feed) => row(feed, false))]
}

export function activeFeeds(config) {
  return allFeeds(config)
    .filter((feed) => feed.enabled)
    .map(({ name, url, language, filter }) => ({ name, url, language, filter }))
}

function badHost(hostname) {
  if (!hostname.includes('.')) return true
  if (hostname.startsWith('[') || /^\d+(\.\d+){3}$/.test(hostname)) return true
  return ['.local', '.localhost', '.internal', '.lan', '.home'].some((end) => hostname.endsWith(end))
}

// Checks the form the admin filled in. Only public https feeds on a normal host name are accepted.
export function validateNewSource(body, existingUrls) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send the name, address, language and filter.' }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > NAME_MAX) return { ok: false, error: `The name must be 1 to ${NAME_MAX} characters.` }
  let parsed
  try {
    parsed = new URL(typeof body.url === 'string' ? body.url.trim() : '')
  } catch {
    return { ok: false, error: 'The feed address is not a valid web address.' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'The feed address must start with https://.' }
  if (parsed.username || parsed.password) return { ok: false, error: 'The address must not contain a user name or password.' }
  if (parsed.port) return { ok: false, error: 'Use the normal port (no :number in the address).' }
  if (badHost(parsed.hostname.toLowerCase())) return { ok: false, error: 'Use a public web site name, not a local or numeric address.' }
  if (!LANGUAGES.includes(body.language)) return { ok: false, error: 'The language must be English, Malay or Chinese.' }
  if (body.filter !== 'work' && body.filter !== 'all') return { ok: false, error: 'Choose which stories to keep.' }
  if (existingUrls.includes(parsed.href)) return { ok: false, error: 'This feed is already in the list.' }
  return { ok: true, source: { name, url: parsed.href, language: body.language, filter: body.filter === 'all' ? false : 'work' } }
}

// Simple robots.txt reading: the rules for "*" (and for our own name); the longest matching rule wins, Allow wins a tie.
export function robotsAllows(text, pathname) {
  const rules = []
  let agents = []
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      agents = lastWasAgent ? [...agents, value.toLowerCase()] : [value.toLowerCase()]
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if ((key === 'allow' || key === 'disallow') && value && agents.some((agent) => agent === '*' || ROBOTS_AGENT.includes(agent))) {
      rules.push({ allow: key === 'allow', pattern: value })
    }
  }
  let best = null
  for (const rule of rules) {
    const source = rule.pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$')
    if (!new RegExp(`^${source}`).test(pathname)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
  }
  return best ? best.allow : true
}

async function readRobots(origin, pathname, fetchImpl) {
  try {
    const response = await fetchImpl(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS) })
    if (response.status === 404 || response.status === 410) return 'none'
    if (!response.ok) return 'unknown'
    return robotsAllows(await response.text(), pathname) ? 'allowed' : 'blocked'
  } catch {
    return 'unknown'
  }
}

// Read-only test for the admin: robots.txt first, then the feed. Nothing is saved.
export async function checkFeed({ url, filter }, fetchImpl = fetch) {
  const target = new URL(url)
  const robots = await readRobots(target.origin, target.pathname, fetchImpl)
  if (robots === 'blocked') return { ok: false, robots, error: 'This site\'s robots.txt does not allow reading this feed.' }
  if (robots === 'unknown') return { ok: false, robots, error: 'Could not read this site\'s robots.txt, so it is not safe to continue. Try again later.' }
  try {
    const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return { ok: false, robots, error: `The feed answered HTTP ${response.status}. If the site moved it, use the new address.` }
    const body = await response.text()
    if (body.length > MAX_FEED_CHARS) return { ok: false, robots, error: 'This feed is too large.' }
    const items = parseFeed(body)
    if (items.length === 0) return { ok: false, robots, error: 'No items with a title, link and date were found. This does not look like an RSS feed.' }
    return {
      ok: true,
      robots,
      total: items.length,
      passed: items.filter((item) => passesFilter(filter, item)).length,
      sample: items.slice(0, SAMPLE_SIZE).map(({ title, publishedAt }) => ({ title, publishedAt })),
    }
  } catch {
    return { ok: false, robots, error: 'Could not read the feed (network error, timeout, or a redirect).' }
  }
}

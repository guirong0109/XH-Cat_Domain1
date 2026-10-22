import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// Keeps the reference links honest: re-reads the eMASCO role pages, checks the other links, and
// saves the result with a date. It never changes roles.json: a changed role is only flagged.

const USER_AGENT = 'FutureReadyMY-hackathon/0.1'
export const SECONDS_BETWEEN_REQUESTS = 2
const SKIPPED = ['script', 'style', 'svg', 'noscript', 'template']
const INLINE = new Set(['a', 'span', 'b', 'strong', 'em', 'i', 'u', 'small', 'sup', 'sub', 'abbr'])
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' }

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED[body.toLowerCase()] ?? match
  })
}

// Visible text, one entry per block-level element, in document order (same idea as pipeline/scrape_emasco.py).
export function visibleBlocks(html) {
  const cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
  const blocks = []
  let current = []
  let skipDepth = 0
  const flush = () => {
    const text = current.join('').split(/\s+/).filter(Boolean).join(' ')
    if (text) blocks.push(text)
    current = []
  }
  const tokens = cleaned.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)|</g)
  for (const token of tokens) {
    if (token[4] !== undefined) {
      if (!skipDepth) current.push(decode(token[4]))
      continue
    }
    if (token[2] === undefined) continue
    const closing = token[1] === '/'
    const tag = token[2].toLowerCase()
    const selfClosing = token[3].trimEnd().endsWith('/')
    if (SKIPPED.includes(tag)) {
      if (closing) skipDepth = Math.max(0, skipDepth - 1)
      else if (!selfClosing) skipDepth += 1
    } else if (!INLINE.has(tag)) {
      flush()
    }
  }
  flush()
  return blocks
}

function indexAfter(blocks, heading, start, description) {
  for (let position = start; position < blocks.length; position++) {
    if (blocks[position] === heading) return position
  }
  throw new Error(`Section '${heading}' not found (${description})`)
}

function firstIndexOfAny(blocks, headings, start, fallback) {
  for (let position = start; position < blocks.length; position++) {
    if (headings.includes(blocks[position])) return position
  }
  return fallback
}

export function parseRolePage(html) {
  const blocks = visibleBlocks(html)
  const codeLabel = indexAfter(blocks, 'MASCO Code', 0, 'role header')
  const code = blocks[codeLabel + 1]
  const compareLabel = indexAfter(blocks, 'Compare', codeLabel, 'role header')
  const title = blocks[compareLabel + 1]
  const tasksHeading = indexAfter(blocks, 'Tasks', compareLabel, `role ${code}`)
  const description = blocks[tasksHeading - 1]
  const skillsHeading = indexAfter(blocks, 'Skills', tasksHeading, `role ${code}`)
  const afterTasks = firstIndexOfAny(blocks, ['MSIC', 'NOSS', 'NEC'], tasksHeading, skillsHeading)
  const tasks = blocks.slice(tasksHeading + 1, Math.min(afterTasks, skillsHeading))
  const basicHeading = indexAfter(blocks, 'Basic', skillsHeading, `role ${code}`)
  const specificHeading = indexAfter(blocks, 'Specific', basicHeading, `role ${code}`)
  const additionalHeading = indexAfter(blocks, 'Additional Info', specificHeading, `role ${code}`)
  if (tasks.length === 0) throw new Error(`Section 'Tasks' is empty for role ${code}`)
  return {
    code,
    title,
    description,
    tasks,
    basic_skills: blocks.slice(basicHeading + 1, specificHeading),
    specific_skills: blocks.slice(specificHeading + 1, additionalHeading),
  }
}

// Compared without punctuation, case or spacing, so a different quote mark is not a change.
const squash = (list) => (Array.isArray(list) ? list : [list]).map((item) => String(item ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))

const SAME_AS_SAVED = ['tasks', 'basic_skills', 'specific_skills', 'description']

export function changedFields(saved, fresh) {
  return SAME_AS_SAVED.filter((field) => JSON.stringify(squash(saved[field])) !== JSON.stringify(squash(fresh[field])))
}

// Follows redirects by hand: the site redirects ?lang=en to http:// and keeps the language in a cookie.
async function fetchWithCookie(url, { fetchImpl, timeoutMs }) {
  let cookie = ''
  let target = url
  for (let hop = 0; hop < 6; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, ...(cookie ? { Cookie: cookie } : {}) },
      })
      const setCookies = response.headers?.getSetCookie?.() ?? []
      if (setCookies.length) cookie = setCookies.map((item) => item.split(';')[0]).join('; ')
      const location = response.headers?.get?.('location')
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, target).href.replace(/^http:\/\//, 'https://')
        continue
      }
      return response
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('too many redirects')
}

async function fetchRole(code, options) {
  const url = `https://emasco.mohr.gov.my/masco/${code}?lang=en`
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithCookie(url, options)
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
      const role = parseRolePage(await response.text())
      if (role.code !== code) throw new Error(`page returned code ${role.code}`)
      return role
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function checkLink(url, { fetchImpl = fetch, timeoutMs = 8000, now = new Date() } = {}) {
  const checkedAt = now.toISOString()
  try {
    const response = await fetchWithCookie(url, { fetchImpl, timeoutMs })
    return { ok: response.status < 400, status: response.status, checkedAt }
  } catch (error) {
    return { ok: false, status: null, checkedAt }
  }
}

export async function readReferences(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, content)
  await rename(temporaryPath, filePath)
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const inFlight = new Map()

// savedRoles: the eMASCO snapshot roles (code, tasks, skills...). links: other URLs to check.
export function refreshReferences(options) {
  const pending = inFlight.get(options.filePath)
  if (pending) return pending
  const run = runRefresh(options).finally(() => inFlight.delete(options.filePath))
  inFlight.set(options.filePath, run)
  return run
}

async function runRefresh({
  filePath,
  savedRoles,
  links,
  fetchImpl = fetch,
  now = new Date(),
  delayMs = SECONDS_BETWEEN_REQUESTS * 1000,
  sleep = sleepFor,
  pageTimeoutMs = 20000,
  linkTimeoutMs = 8000,
}) {
  let existing = null
  try {
    existing = await readReferences(filePath)
  } catch {
    existing = null
  }
  const checkedAt = now.toISOString()
  const roles = { ...(existing?.roles ?? {}) }
  const linkResults = { ...(existing?.links ?? {}) }
  let read = 0
  let changed = 0
  let failed = 0

  const linkWork = Promise.all(
    (links ?? []).map(async (url) => {
      linkResults[url] = await checkLink(url, { fetchImpl, timeoutMs: linkTimeoutMs, now })
    }),
  )

  for (let index = 0; index < savedRoles.length; index++) {
    const saved = savedRoles[index]
    if (index > 0) await sleep(delayMs)
    try {
      const fresh = await fetchRole(saved.code, { fetchImpl, timeoutMs: pageTimeoutMs })
      const fields = changedFields(saved, fresh)
      roles[saved.code] = { ok: true, checkedAt, changed: fields }
      read += 1
      if (fields.length > 0) changed += 1
    } catch (error) {
      console.error(`[references] ${saved.code} failed:`, error.message)
      // The last good result stays; only the failure is recorded.
      roles[saved.code] = { ...(roles[saved.code] ?? { changed: [] }), ok: false, failedAt: checkedAt }
      failed += 1
    }
  }
  await linkWork
  const linksFailed = Object.values(linkResults).filter((item) => item.checkedAt === checkedAt && !item.ok).length

  const references = { checkedAt, roles, links: linkResults }
  const total = savedRoles.length
  if (read === 0 && total > 0) {
    // Nothing could be read: keep the saved file, report the failure.
    const savedDate = existing?.checkedAt?.slice(0, 10)
    return {
      status: 'failed',
      message: savedDate ? `Showing the check from ${savedDate}. Live check failed.` : 'Live check failed. No saved check yet.',
      references: existing,
    }
  }
  await writeAtomically(filePath, `${JSON.stringify(references, null, 2)}\n`)
  const parts = [`${read} of ${total} roles read`, `${changed} changed`, `${linksFailed} ${linksFailed === 1 ? 'link' : 'links'} not checked`]
  return { status: failed > 0 || linksFailed > 0 ? 'partial' : 'updated', message: `${parts.join(', ')}.`, references }
}

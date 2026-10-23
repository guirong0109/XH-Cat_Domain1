import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { visibleBlocks } from './references.js'

// Keeps the saved course pages honest: opens each one, compares title, price and length with the
// saved copy, and records the result with a date. It never changes skills.json or the team files:
// a changed page is only flagged, and a page that is gone is hidden by the app (the portal link shows).

const USER_AGENT = 'FutureReadyMY-hackathon/0.1'
export const SECONDS_BETWEEN_REQUESTS = 2

// Compared without punctuation, case or spacing, so a different quote mark is not a change.
const squash = (value) => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

// An e-Latih course page: the title sits in <title> after the last "|"; the rest is in the page text.
export function parseElatihCourse(html) {
  const titleTag = /<title>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleTag ? decodeEntities(titleTag[1]).split('|').pop().trim() : ''
  const text = visibleBlocks(html).join(' ')
  const duration = /Duration:\s*([0-9A-Za-z ]{3,25}?)\s+Skill Level/.exec(text)
  const level = /Skill Level:\s*(\w+)/.exec(text)
  const price = /((?:RM\s?[\d.,]+)|Free)\s+(?:Enrol Now|Add to cart|Buy)/i.exec(text)
  return {
    title,
    price: price ? price[1].replace(/\s/g, '') : null,
    duration: duration ? duration[1].trim() : null,
    level: level ? level[1] : null,
  }
}

export function changedCourseFields(saved, fresh) {
  const changed = []
  if (squash(saved.title) !== squash(fresh.title)) changed.push('title')
  for (const field of ['price', 'duration', 'level']) {
    if (saved[field] && fresh[field] !== saved[field]) changed.push(field)
  }
  return changed
}

// Every distinct course page we show: the skill courses and the AI courses.
export function collectCourses(skills) {
  const byUrl = new Map()
  const add = (course) => {
    if (course?.url && !byUrl.has(course.url)) byUrl.set(course.url, course)
  }
  for (const label of skills?.labels ?? []) (label.courses ?? []).forEach(add)
  ;(skills?.aiCourses?.general ?? []).forEach(add)
  for (const list of Object.values(skills?.aiCourses?.bySkill ?? {})) list.forEach(add)
  return [...byUrl.values()]
}

export async function checkCourse(course, { fetchImpl = fetch, timeoutMs = 20000, now = new Date() } = {}) {
  const checkedAt = now.toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(course.url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } })
    if (response.status === 404 || response.status === 410) return { status: 'gone', changed: [], checkedAt }
    if (response.status !== 200) return { status: 'unreadable', changed: [], checkedAt, httpStatus: response.status }
    const html = await response.text()
    if (course.portal === 'tvet') {
      const found = squash(html).includes(squash(course.title))
      return { status: found ? 'ok' : 'changed', changed: found ? [] : ['title'], checkedAt }
    }
    const fresh = parseElatihCourse(html)
    if (!fresh.title) return { status: 'unreadable', changed: [], checkedAt }
    const changed = changedCourseFields(course, fresh)
    return { status: changed.length > 0 ? 'changed' : 'ok', changed, checkedAt }
  } catch {
    return { status: 'unreadable', changed: [], checkedAt }
  } finally {
    clearTimeout(timer)
  }
}

export async function readCourseChecks(filePath) {
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

export function refreshCourseChecks(options) {
  const pending = inFlight.get(options.filePath)
  if (pending) return pending
  const run = runRefresh(options).finally(() => inFlight.delete(options.filePath))
  inFlight.set(options.filePath, run)
  return run
}

async function runRefresh({
  filePath,
  skills,
  fetchImpl = fetch,
  now = new Date(),
  delayMs = SECONDS_BETWEEN_REQUESTS * 1000,
  sleep = sleepFor,
  timeoutMs = 20000,
}) {
  let existing = null
  try {
    existing = await readCourseChecks(filePath)
  } catch {
    existing = null
  }
  const courses = collectCourses(skills)
  const checkedAt = now.toISOString()
  const results = {}
  for (let index = 0; index < courses.length; index++) {
    if (index > 0) await sleep(delayMs)
    const course = courses[index]
    const result = await checkCourse(course, { fetchImpl, timeoutMs, now })
    // An unreadable page keeps its last known result: one timeout must not hide a good course.
    const earlier = existing?.courses?.[course.url]
    results[course.url] =
      result.status === 'unreadable' && earlier ? { ...earlier, unreadableAt: checkedAt } : result
  }
  const counts = { ok: 0, changed: 0, gone: 0, unreadable: 0 }
  for (const url of Object.keys(results)) {
    const fresh = results[url].checkedAt === checkedAt
    counts[fresh ? results[url].status : 'unreadable'] += 1
  }
  if (courses.length > 0 && counts.ok + counts.changed + counts.gone === 0) {
    const savedDate = existing?.checkedAt?.slice(0, 10)
    return {
      status: 'failed',
      message: savedDate ? `Showing the course check from ${savedDate}. Live check failed.` : 'Live check failed. No saved check yet.',
      checks: existing,
    }
  }
  // checkedAt is the OLDEST per-course check, so a run that could read only some pages does not make the rest look fresh.
  const oldest = Object.values(results).map((result) => result.checkedAt).sort()[0] ?? checkedAt
  const checks = { checkedAt: oldest, lastRunAt: checkedAt, counts, courses: results }
  await writeAtomically(filePath, `${JSON.stringify(checks, null, 2)}\n`)
  const message = `${courses.length} course pages: ${counts.ok} ok, ${counts.changed} changed, ${counts.gone} gone, ${counts.unreadable} not read.`
  return { status: counts.unreadable > 0 ? 'partial' : 'updated', message, checks }
}

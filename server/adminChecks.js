// Checks the admin can run: data health, links, and a random sample of eMASCO roles compared with what we saved.
// A check only reads and reports. It never changes occupations.json, roles.json or the vectors.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { inputHash, roleInputs, skillInputs } from '../scripts/lib/emascoEmbed.js'
import { compareRole, parseOccupationPage, savedFrom } from './emascoPage.js'
import { checkLink, fetchWithCookie } from './references.js'

export const SITE_URL = 'https://emasco.mohr.gov.my'
export const SECONDS_BETWEEN_PAGES = 2
const OUR_AGENT = 'futurereadymy'
const STALE_DAYS = 60
const STALE_REFERENCE_DAYS = 30
const DAY_MS = 86400000
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// robots.txt: true unless a rule for everyone (or us) blocks /masco/. A missing or unreadable file allows.
export async function robotsAllows({ fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  let text
  try {
    const response = await fetchWithCookie(`${SITE_URL}/robots.txt`, { fetchImpl, timeoutMs })
    if (response.status !== 200) return true
    text = await response.text()
  } catch {
    return true
  }
  let applies = false
  let inAgentLines = false
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (field === 'user-agent') {
      if (!inAgentLines) applies = false
      inAgentLines = true
      if (value === '*' || value.toLowerCase().includes(OUR_AGENT)) applies = true
    } else {
      inAgentLines = false
      if (applies && field === 'disallow' && value && '/masco/'.startsWith(value)) return false
    }
  }
  return true
}

export async function fetchOccupationPage(code, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithCookie(`${SITE_URL}/masco/${code}?lang=en`, { fetchImpl, timeoutMs })
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

const ageInDays = (iso, now) => (iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS) : null)

export async function healthChecks({ dataDir, embedderReady = false, now = new Date() }) {
  const checks = []
  const add = (name, status, detail) => checks.push({ name, status, detail })

  const occupations = await readJson(path.join(dataDir, 'emasco', 'occupations.json'))
  if (!occupations) {
    add('eMASCO data', 'fail', 'data/emasco/occupations.json is missing or cannot be read.')
  } else {
    const age = ageInDays(occupations.fetchedAt, now)
    const summary = `${occupations.roles.length} roles with skills, ${occupations.tasksOnly.length} tasks-only, ${occupations.skills.length} distinct skills, read ${occupations.fetchedAt}${age === null ? '' : ` (${age} days ago)`}.`
    add('eMASCO data', age !== null && age > STALE_DAYS ? 'warn' : 'ok', age !== null && age > STALE_DAYS ? `${summary} Older than ${STALE_DAYS} days: run a check.` : summary)
  }

  const packed = await readJson(path.join(dataDir, 'emasco', 'vectors', 'meta.json'))
  if (!packed) {
    add('Role search vectors', 'fail', 'The packed vectors are missing, so Explore all roles cannot work.')
  } else if (!occupations) {
    add('Role search vectors', 'warn', 'Cannot compare the vectors without the eMASCO data.')
  } else {
    const inSync =
      packed.skillsHash === inputHash(skillInputs(occupations).texts, packed.modelId) &&
      packed.rolesHash === inputHash(roleInputs(occupations).texts, packed.modelId)
    add(
      'Role search vectors',
      inSync ? 'ok' : 'fail',
      inSync ? `In sync with the eMASCO data (packed ${packed.packedAt?.slice(0, 10) ?? 'unknown date'}).` : 'Do not match the eMASCO data. Rebuild: node scripts/embed-emasco.mjs, then node scripts/pack-emasco-vectors.mjs.'
    )
  }

  const trends = await readJson(path.join(dataDir, 'trends.json'))
  const trendsDate = trends?.source?.fetchedAt
  add('Job trends (OpenDOSM)', trendsDate ? 'ok' : 'warn', trendsDate ? `Fetched ${trendsDate.slice(0, 10)}.` : 'No saved trend data.')

  const research = await readJson(path.join(dataDir, 'research.json'))
  const researchDate = research?.source?.fetchedAt
  add('AI research (OpenAlex)', researchDate ? 'ok' : 'warn', researchDate ? `Fetched ${researchDate.slice(0, 10)}.` : 'No snapshot yet.')

  const references = await readJson(path.join(dataDir, 'references.json'))
  const referenceAge = ageInDays(references?.checkedAt, now)
  if (!references) add('Reference checks', 'warn', 'Never checked.')
  else add('Reference checks', referenceAge > STALE_REFERENCE_DAYS ? 'warn' : 'ok', `Checked ${references.checkedAt.slice(0, 10)} (${referenceAge} days ago).`)

  add('AI model', embedderReady ? 'ok' : 'warn', embedderReady ? 'Loaded. CV reading is on.' : 'Not loaded. CV reading is off; skill search still works.')
  return checks
}

export async function linkChecks({ links, fetchImpl = fetch, now = new Date() }) {
  return Promise.all(
    links.map(async (url) => {
      const result = await checkLink(url, { fetchImpl, now })
      return { url, ok: result.ok, status: result.status }
    })
  )
}

export function pickSample(codes, size, random = Math.random) {
  const pool = [...codes]
  const count = Math.min(size, pool.length)
  for (let position = 0; position < count; position += 1) {
    const other = position + Math.floor(random() * (pool.length - position))
    ;[pool[position], pool[other]] = [pool[other], pool[position]]
  }
  return pool.slice(0, count)
}

const level = { ok: 'info', warn: 'warn', fail: 'error' }

// run: a log run (see adminLog). Returns { status, summary, report }; status is ok, partial, failed or cancelled.
export async function runQuickCheck({
  run,
  occupations,
  dataDir,
  links = [],
  fetchImpl = fetch,
  sleep = sleepFor,
  random = Math.random,
  sampleSize = 40,
  isCancelled = () => false,
  progress = () => {},
  embedderReady = false,
  now = () => new Date()
}) {
  const startedAt = now().toISOString()
  await run.log('info', 'Quick check started')
  if (!(await robotsAllows({ fetchImpl }))) {
    await run.log('error', 'robots.txt does not allow reading /masco/. Stopped.')
    return { status: 'failed', summary: { message: 'robots.txt does not allow reading eMASCO.' }, report: { kind: 'quick-check', startedAt, stopped: 'robots' } }
  }

  const health = await healthChecks({ dataDir, embedderReady, now: now() })
  for (const check of health) await run.log(level[check.status], `${check.name}: ${check.detail}`)

  const linkResults = await linkChecks({ links, fetchImpl, now: now() })
  for (const link of linkResults) await run.log(link.ok ? 'info' : 'error', `Link ${link.ok ? 'works' : 'did not work'}: ${link.url}${link.status ? ` (HTTP ${link.status})` : ''}`)

  const allRoles = [...occupations.roles, ...occupations.tasksOnly]
  const byCode = new Map(allRoles.map((role) => [role.code, role]))
  const sample = pickSample([...byCode.keys()], sampleSize, random)
  const changed = []
  const unreadable = []
  let unchanged = 0
  let cancelled = false
  for (let position = 0; position < sample.length; position += 1) {
    if (isCancelled()) {
      cancelled = true
      await run.log('warn', 'Cancelled by the admin')
      break
    }
    if (position > 0) await sleep(SECONDS_BETWEEN_PAGES * 1000)
    const code = sample[position]
    try {
      const fresh = parseOccupationPage(await fetchOccupationPage(code, { fetchImpl }))
      if (fresh.code !== code) throw new Error(`page returned code ${fresh.code}`)
      const fields = compareRole(savedFrom(byCode.get(code)), fresh)
      if (fields.length) {
        changed.push({ code, title: byCode.get(code).title, fields })
        await run.log('warn', `${code} changed on eMASCO: ${fields.join(', ')}`, { code, fields })
      } else {
        unchanged += 1
      }
    } catch (error) {
      unreadable.push({ code, error: error.message })
      await run.log('error', `${code} could not be read: ${error.message}`, { code })
    }
    progress(position + 1, sample.length, `Read ${position + 1} of ${sample.length} roles`)
  }

  const read = unchanged + changed.length
  const summary = {
    sampleSize: sample.length,
    rolesRead: read,
    changed: changed.length,
    unreadable: unreadable.length,
    linksFailed: linkResults.filter((link) => !link.ok).length,
    healthWarnings: health.filter((check) => check.status === 'warn').length,
    healthFailures: health.filter((check) => check.status === 'fail').length
  }
  let status = 'ok'
  if (cancelled) status = 'cancelled'
  else if (sample.length > 0 && read === 0) status = 'failed'
  else if (summary.unreadable > 0 || summary.linksFailed > 0 || summary.healthFailures > 0) status = 'partial'
  await run.log(status === 'ok' ? 'info' : 'warn', `Quick check finished: ${status}. ${read} roles read, ${summary.changed} changed, ${summary.unreadable} unreadable.`)
  return {
    status,
    summary,
    report: { kind: 'quick-check', startedAt, finishedAt: now().toISOString(), health, links: linkResults, sample: { codes: sample, unchanged, changed, unreadable }, summary }
  }
}

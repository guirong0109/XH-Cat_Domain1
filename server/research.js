import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const OPENALEX_URL = 'https://api.openalex.org/works'
const AI_PHRASES = '("artificial intelligence" OR "machine learning" OR "large language model")'
const QUERY_TEMPLATE = `"<search term>" AND ${AI_PHRASES}`
const POOL_SIZE = 5
const TIMEOUT_MS = 8000

export async function readResearch(filePath) {
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

async function readExistingSafely(filePath) {
  try {
    return await readResearch(filePath)
  } catch {
    return null
  }
}

function buildUrl(researchTerm, year) {
  const query = `"${researchTerm}" AND ${AI_PHRASES}`
  const filter = `title_and_abstract.search:${encodeURIComponent(query)},publication_year:${year}`
  return `${OPENALEX_URL}?filter=${filter}&per-page=1&select=id`
}

async function fetchCount(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'FutureReadyMY/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`OpenAlex returned HTTP ${response.status}`)
  const body = await response.json()
  const count = body?.meta?.count
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new Error('OpenAlex response invalid: meta.count is not a number')
  }
  return count
}

// Runs tasks (functions returning promises) with at most `size` in flight. Stops starting new ones after a failure.
async function runPool(tasks, size) {
  const results = new Array(tasks.length)
  let next = 0
  let failed = false
  async function worker() {
    while (!failed && next < tasks.length) {
      const index = next
      next += 1
      try {
        results[index] = await tasks[index]()
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker))
  return results
}

const inFlight = new Map()

export function refreshResearch({ filePath, terms, fetchImpl = fetch, now = new Date() }) {
  const pending = inFlight.get(filePath)
  if (pending) return pending
  const refresh = runRefresh({ filePath, terms, fetchImpl, now }).finally(() => inFlight.delete(filePath))
  inFlight.set(filePath, refresh)
  return refresh
}

async function runRefresh({ filePath, terms, fetchImpl, now }) {
  const existing = await readExistingSafely(filePath)
  try {
    const year = now.getUTCFullYear()
    const years = [year - 2, year - 1]
    const jobs = terms.flatMap(({ label, researchTerm }) =>
      years.map((y) => ({ label, researchTerm, year: y })),
    )
    const counts = await runPool(
      jobs.map((job) => () => fetchCount(buildUrl(job.researchTerm, job.year), fetchImpl)),
      POOL_SIZE,
    )
    const skills = {}
    for (const { label, researchTerm } of terms) {
      skills[label] = { term: researchTerm, counts: {} }
    }
    jobs.forEach((job, index) => {
      skills[job.label].counts[String(job.year)] = counts[index]
    })
    const research = {
      source: {
        name: 'OpenAlex',
        url: 'https://openalex.org',
        licence: 'CC0',
        query: QUERY_TEMPLATE,
        years,
        fetchedAt: now.toISOString(),
      },
      skills,
    }
    await writeAtomically(filePath, `${JSON.stringify(research, null, 2)}\n`)
    return { status: 'updated', message: `Updated: research data fetched ${research.source.fetchedAt.slice(0, 10)}.`, research }
  } catch (error) {
    console.error('[research] refresh failed:', error.message)
    const savedDate = existing?.source?.fetchedAt?.slice(0, 10)
    const message = existing
      ? `Showing research data from ${savedDate}. Live refresh failed.`
      : 'Live refresh failed. No saved research data yet.'
    return { status: 'failed', message, research: existing }
  }
}

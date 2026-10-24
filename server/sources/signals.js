// Refreshes the live AI signals into data/signals.json (one file, one date per source):
//   papers          paper counts per skill and year from OpenAlex-free sources (Semantic Scholar, arXiv)
//   huggingface     trending models and daily papers, with how many mention each skill term
//   anthropicIndex  which release is current; the exposure files are cached for the matching step
// A failing source never wipes the last good data: that source keeps its old block and is flagged.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as semanticScholar from './semanticScholar.js'
import * as arxiv from './arxiv.js'
import * as huggingface from './huggingface.js'
import * as anthropicIndex from './anthropicIndex.js'

export const SIGNALS_FILE = 'signals.json'
const ARXIV_GAP_MS = 3000 // arXiv asks for a few seconds between requests
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  await writeFile(temporary, content)
  await rename(temporary, filePath)
}

export const readSignals = (dataDir) => readJson(path.join(dataDir, SIGNALS_FILE))

// First source in `order` that has counts for this skill. Lets the app use Semantic Scholar when
// OpenAlex failed (and the other way round) and say which one it used.
export function preferredCounts(entry, order = ['openalex', 'semanticScholar', 'arxiv']) {
  for (const source of order) {
    const counts = entry?.[source]
    if (counts && Object.keys(counts).length > 0) return { source, counts }
  }
  return null
}

// Years compared: the last two full years, like the OpenAlex research card.
export const yearsFor = (now) => [now.getUTCFullYear() - 2, now.getUTCFullYear() - 1]

async function skillTerms(dataDir) {
  const skills = await readJson(path.join(dataDir, 'skills.json'))
  return (skills?.labels ?? []).filter((item) => item.researchTerm).map((item) => ({ label: item.label, term: item.researchTerm }))
}

async function collectPapers({ terms, years, counter, gapMs, sleep, isCancelled, progress, step, total }) {
  const result = {}
  let failures = 0
  let firstError = null
  for (const { label, term } of terms) {
    if (isCancelled()) break
    const counts = {}
    for (const year of years) {
      try {
        counts[String(year)] = await counter(term, year)
      } catch (error) {
        failures += 1
        firstError ??= error.message
        break
      }
      if (gapMs) await sleep(gapMs)
    }
    if (Object.keys(counts).length === years.length) result[label] = counts
    progress(step.done += 1, total, label)
  }
  return { result, failures, firstError }
}

// Runs every step; returns the outcome per source. `run.log` (optional) writes to the admin log.
export async function refreshSignals({
  dataDir, fetchImpl = fetch, monitor = null, sleep = defaultSleep, now = () => new Date(),
  run = null, progress = () => {}, isCancelled = () => false, downloadIndex = true,
}) {
  const ctx = { fetchImpl, monitor, sleep }
  const filePath = path.join(dataDir, SIGNALS_FILE)
  const previous = (await readJson(filePath)) ?? {}
  const next = { ...previous }
  const outcomes = []
  const log = (level, message, data) => run?.log?.(level, message, data)
  const stamp = now().toISOString()
  const years = yearsFor(now())
  const terms = await skillTerms(dataDir)
  const step = { done: 0 }
  const total = terms.length * 2 + 3

  const note = (source, status, message) => {
    outcomes.push({ source, status, message })
    log(status === 'ok' ? 'info' : 'error', `${source}: ${message}`)
  }

  // Papers: Semantic Scholar, then arXiv (slow, polite).
  const paperBlock = { ...(previous.papers ?? {}) }
  for (const [id, key, counter, gap] of [
    ['semantic-scholar', 'semanticScholar', (term, year) => semanticScholar.countPapers(term, year, ctx), 1000],
    ['arxiv', 'arxiv', (term, year) => arxiv.countPapers(term, year, ctx), ARXIV_GAP_MS],
  ]) {
    if (isCancelled()) break
    const { result, failures, firstError } = await collectPapers({ terms, years, counter, gapMs: gap, sleep, isCancelled, progress, step, total })
    for (const { label } of terms) {
      paperBlock[label] = { ...(paperBlock[label] ?? {}), ...(result[label] ? { [key]: result[label] } : {}) }
    }
    const got = Object.keys(result).length
    if (failures === 0 && got === terms.length) note(id, 'ok', `${got} skills counted for ${years.join(' and ')}`)
    else if (got > 0) note(id, 'partial', `${got} of ${terms.length} skills counted; first error: ${firstError}`)
    else note(id, 'failed', firstError ?? 'no skills counted')
  }
  next.papers = paperBlock
  next.paperYears = years

  if (!isCancelled()) {
    try {
      const [models, papers] = [await huggingface.fetchTrendingModels(30, ctx), await huggingface.fetchDailyPapers(30, ctx)]
      const items = [...models, ...papers]
      next.huggingface = {
        fetchedAt: stamp,
        models: models.slice(0, 15),
        papers: papers.slice(0, 15),
        mentions: Object.fromEntries(terms.map(({ label, term }) => [label, huggingface.mentions(items, term)])),
      }
      note('huggingface', 'ok', `${models.length} trending models and ${papers.length} daily papers`)
    } catch (error) {
      note('huggingface', 'failed', error.message)
    }
    progress(step.done += 1, total, 'Hugging Face')
  }

  if (!isCancelled()) {
    try {
      const release = await anthropicIndex.listRelease(ctx)
      const changed = JSON.stringify(previous.anthropicIndex?.files) !== JSON.stringify(release.files)
      let counts = previous.anthropicIndex?.counts ?? null
      if (downloadIndex && (changed || !previous.anthropicIndex?.counts)) {
        const files = await anthropicIndex.downloadExposure(ctx)
        counts = { occupations: files.occupations.length, tasks: files.taskRows.length }
        await mkdir(path.join(dataDir, 'cache', 'anthropic'), { recursive: true })
        await writeFile(path.join(dataDir, 'cache', 'anthropic', 'job_exposure.csv'), files.jobs)
        await writeFile(path.join(dataDir, 'cache', 'anthropic', 'task_penetration.csv'), files.tasks)
      }
      next.anthropicIndex = {
        fetchedAt: stamp,
        latestRelease: release.latestRelease,
        files: release.files,
        counts,
        newData: changed && Boolean(previous.anthropicIndex),
        licence: 'MIT (dataset card on Hugging Face)',
        url: 'https://huggingface.co/datasets/Anthropic/EconomicIndex',
      }
      note('anthropic-index', 'ok', `release ${release.latestRelease}${changed ? ' (changed since the last fetch)' : ''}${counts ? `, ${counts.occupations} occupations, ${counts.tasks} tasks` : ''}`)
    } catch (error) {
      note('anthropic-index', 'failed', error.message)
    }
    progress(step.done += 1, total, 'Anthropic Economic Index')
  }

  const anyOk = outcomes.some((item) => item.status === 'ok' || item.status === 'partial')
  if (anyOk) {
    next.updatedAt = stamp
    await writeAtomically(filePath, `${JSON.stringify(next, null, 2)}\n`)
  }
  const status = outcomes.every((item) => item.status === 'ok') ? 'ok' : anyOk ? 'partial' : 'failed'
  return { status, outcomes, message: outcomes.map((item) => `${item.source} ${item.status}`).join(', ') }
}

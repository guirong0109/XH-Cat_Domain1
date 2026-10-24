import express from 'express'
import { existsSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTrends, refreshTrends } from './trends.js'
import { readResearch, refreshResearch } from './research.js'
import { CUTOFF, MAX_CHARS, SKILL_TEXT_MODE, matchSkills, splitCvLines } from './cvMatch.js'
import { loadSkillVectors } from './skillVectors.js'
import { readReferences, refreshReferences } from './references.js'
import { readCourseChecks } from './courseCheck.js'
import { modelFromEnv, readEmerging, refreshEmerging, reviewItem } from './emerging.js'
import { activeFeeds, allFeeds, checkFeed, readSourceConfig, validateNewSource, writeSourceConfig } from './emergingSources.js'
import { PORTAL_LINKS } from '../src/lib/pathwayView.js'
import { loadPackedIndex, matchCvByProfile, matchPickedSkills } from './emascoMatch.js'
import { skillIdsForLabels } from './topMatches.js'
import { buildConcepts, createHybridSearch, createReranker } from './hybridSearch.js'
import { createSkillSearch } from './emascoRoles.js'
import { createLogStore } from './adminLog.js'
import { jsonOnly, localOnly } from './adminAccess.js'
import { createJobManager } from './adminJobs.js'
import { healthChecks, runQuickCheck } from './adminChecks.js'
import { runFullCheck } from './adminFull.js'
import { createSourceMonitor } from './sources/monitor.js'
import { describeSources, pingSources } from './sources/registry.js'
import { readSignals, refreshSignals } from './sources/signals.js'
import { createSkillEvidence } from './skillEvidence.js'

const EMASCO_SKILL_LIMIT = 50
const EMASCO_DEFAULT_TOP = 10
const EMASCO_MAX_TOP = 20
const TOP_MATCHES = 20

const distDirectory = fileURLToPath(new URL('../dist', import.meta.url))

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const adminPage = fileURLToPath(new URL('./adminPage.html', import.meta.url))
const RUN_ID = /^\d{14}-[0-9a-f]{4}$/

const SEARCH_WINDOW_MS = 60_000

export function createApp({
  dataDir,
  fetchImpl = fetch,
  embedder = null,
  meaningSearchLimit = 90,
  cvTimeoutMs = 15000,
  emascoLoader = null,
  logDir = path.join(dataDir, 'logs'),
  adminSleep = undefined,
  adminSampleSize = 40,
  emergingOptions = {},
}) {
  const app = express()
  // The emerging-feed settings come from env vars; tests pass emergingOptions instead.
  const emergingConfig = {
    adminToken: process.env.EMERGING_ADMIN_TOKEN,
    interval: process.env.EMERGING_INTERVAL,
    primary: modelFromEnv(process.env, 'EMERGING_API'),
    backup: modelFromEnv(process.env, 'EMERGING_BACKUP'),
    ...emergingOptions,
  }
  const emergingPath = path.join(dataDir, 'emerging.json')
  const trendsPath = path.join(dataDir, 'trends.json')
  const researchPath = path.join(dataDir, 'research.json')
  const referencesPath = path.join(dataDir, 'references.json')
  const courseChecksPath = path.join(dataDir, 'course_checks.json')

  // The log of what the system does behind the scenes (see the admin console below).
  const logStore = createLogStore({ filePath: path.join(logDir, 'admin.jsonl') })
  logStore.markInterrupted().catch(() => {})

  // How every outside source is doing (see the Sources panel on /admin).
  const sourceMonitor = createSourceMonitor({ filePath: path.join(logDir, 'sources.json') })
  const MONITORED_REFRESH = { trends: 'opendosm', research: 'openalex' }

  // Runs a data refresh and records it in the log; the refresh result is returned unchanged.
  async function logged(type, work) {
    const run = await logStore.startRun({ type })
    try {
      const result = await work()
      if (MONITORED_REFRESH[type]) {
        sourceMonitor.record({ id: MONITORED_REFRESH[type], ok: result.status !== 'failed', error: result.status === 'failed' ? result.message : null, kind: result.status === 'failed' ? 'http' : null })
      }
      await run.log(result.status === 'failed' ? 'error' : 'info', result.message ?? `${type} refresh finished`)
      await run.finish(result.status === 'updated' ? 'ok' : result.status === 'failed' ? 'failed' : 'partial', { message: result.message })
      return result
    } catch (error) {
      await run.log('error', `${type} refresh failed: ${error.message}`)
      await run.finish('failed', { message: error.message })
      throw error
    }
  }

  // Observed AI use per role (data/exposure.json, built by scripts/build-exposure.mjs). Read once; missing file = none.
  let observedFile
  async function getObserved() {
    if (observedFile === undefined) observedFile = await readOptionalJson(path.join(dataDir, 'exposure.json'))
    return observedFile
  }
  const observedMeta = (file) => (file ? { source: file.source, url: file.url, release: file.release, fetchedAt: file.fetchedAt, builtAt: file.builtAt, cutoff: file.cutoff, minTasks: file.minTasks, quality: file.quality, limits: file.limits } : null)

  // Preprocessed occupation-skill dataset (data/skills): evidence for the 20 scored roles goes out with /api/data,
  // the full dataset is loaded only when one of the /api/skills routes needs it.
  const skillStore = createSkillEvidence(path.join(dataDir, 'skills'))

  app.get('/api/data', async (request, response) => {
    try {
      const [roles, skills, sdg, samples, trends, research, fields, references, emerging, courseChecks] = await Promise.all([
        readJson(path.join(dataDir, 'roles.json')),
        readJson(path.join(dataDir, 'skills.json')),
        readJson(path.join(dataDir, 'sdg.json')),
        readJson(path.join(dataDir, 'samples.json')),
        readTrends(trendsPath),
        readResearch(researchPath),
        readOptionalJson(path.join(dataDir, 'fields.json')),
        readReferences(referencesPath),
        readEmerging(emergingPath),
        readCourseChecks(courseChecksPath),
      ])
      const skillEvidence = await skillStore.roleEvidence().catch(() => null)
      const skillSimilarity = await readOptionalJson(path.join(dataDir, 'skill_similarity.json')).catch(() => null)
      const observed = await getObserved().catch(() => null)
      const observedRoles = Object.fromEntries(roles.filter((role) => observed?.roles?.[role.code]).map((role) => [role.code, observed.roles[role.code]]))
      response.json({ roles, skills, sdg, samples, trends, research, fields, references, emerging, courseChecks, skillSimilarity, skillEvidence, observed: observed ? { ...observedMeta(observed), roles: observedRoles } : null })
    } catch (error) {
      console.error('[data] load failed:', error.message)
      response.status(500).json({ error: 'Could not load data.' })
    }
  })

  app.post('/api/refresh-trends', async (request, response) => {
    response.json(await logged('trends', () => refreshTrends({ filePath: trendsPath, fetchImpl })))
  })

  app.post('/api/refresh-research', async (request, response) => {
    try {
      const skills = await readJson(path.join(dataDir, 'skills.json'))
      const terms = skills.labels.map(({ label, researchTerm }) => ({ label, researchTerm }))
      response.json(await logged('research', () => refreshResearch({ filePath: researchPath, terms, fetchImpl })))
    } catch (error) {
      console.error('[research] refresh failed:', error.message)
      response.status(500).json({ error: 'Could not refresh research data.' })
    }
  })

  const emergingSourcesPath = path.join(dataDir, 'emerging_sources.json')
  async function runEmergingRefresh(force) {
    const [skills, fields, sourceConfig] = await Promise.all([
      readJson(path.join(dataDir, 'skills.json')),
      readJson(path.join(dataDir, 'fields.json')),
      readSourceConfig(emergingSourcesPath),
    ])
    return logged('emerging', () =>
      refreshEmerging({
        filePath: emergingPath,
        skills: skills.labels,
        groups: fields.groups,
        feeds: activeFeeds(sourceConfig),
        fetchImpl,
        primary: emergingConfig.primary,
        backup: emergingConfig.backup,
        interval: emergingConfig.interval,
        force,
      }),
    )
  }

  // "Emerging this week": needs the admin token so students cannot spend the model quota.
  // Add ?force=1 to refresh before the weekly (or daily) gap has passed.
  app.post('/api/refresh-emerging', async (request, response) => {
    const { adminToken } = emergingConfig
    if (!adminToken) return response.status(503).json({ error: 'admin-token-not-set' })
    const sent = Buffer.from(request.get('x-admin-token') ?? '')
    const expected = Buffer.from(adminToken)
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      return response.status(401).json({ error: 'wrong-admin-token' })
    }
    try {
      response.json(await runEmergingRefresh(request.query.force === '1'))
    } catch (error) {
      console.error('[emerging] refresh failed:', error.message)
      response.status(500).json({ error: 'Could not refresh the emerging feed.' })
    }
  })

  // Re-reads the eMASCO role pages and checks the portal and ILO links. It only flags changes;
  // roles.json is never edited here.
  app.post('/api/refresh-references', async (request, response) => {
    try {
      const [roles, snapshot] = await Promise.all([
        readJson(path.join(dataDir, 'roles.json')),
        readJson(path.join(dataDir, 'emasco', 'roles_raw.json')),
      ])
      const links = [...new Set([...Object.values(PORTAL_LINKS).map((item) => item.url), ...roles.map((role) => role.ilo?.url).filter(Boolean)])]
      response.json(await logged('references', () => refreshReferences({ filePath: referencesPath, savedRoles: snapshot.roles, links, fetchImpl })))
    } catch (error) {
      console.error('[references] refresh failed:', error.message)
      response.status(500).json({ error: 'Could not check the references.' })
    }
  })

  // One skill-vector load at a time; reset on failure so the next request retries.
  let skillVectorsLoad = null
  function getSkillVectors() {
    if (!skillVectorsLoad) {
      skillVectorsLoad = (async () => {
        const skills = (await readJson(path.join(dataDir, 'skills.json'))).labels
        const { vectorSets } = await loadSkillVectors({
          skills,
          embedder,
          cachePath: path.join(dataDir, 'cache', 'skill_vectors.json'),
          mode: SKILL_TEXT_MODE,
        })
        return { skills, vectorSets }
      })()
      skillVectorsLoad.catch(() => {
        skillVectorsLoad = null
      })
    }
    return skillVectorsLoad
  }

  app.locals.warmCv = () => getSkillVectors()

  async function matchCv(lines) {
    if (!lines.length) return []
    const { skills, vectorSets } = await getSkillVectors()
    const lineVectors = await embedder.embed(lines)
    return matchSkills(lines, lineVectors, skills, vectorSets, CUTOFF)
  }

  function parseCvBody(request, response, next) {
    express.json({ limit: '100kb' })(request, response, (error) => {
      if (!error) return next()
      if (error.type === 'entity.too.large') return response.status(413).json({ error: 'CV text is too long.' })
      response.status(400).json({ error: 'No CV text.' })
    })
  }

  app.post('/api/cv-skills', parseCvBody, async (request, response) => {
    const text = request.body?.text
    if (typeof text !== 'string' || !text.trim()) return response.status(400).json({ error: 'No CV text.' })
    if (text.length > MAX_CHARS) return response.status(413).json({ error: 'CV text is too long.' })
    if (!embedder || !embedder.isReady()) return response.status(503).json({ fallback: true })
    let timer
    try {
      const work = matchCv(splitCvLines(text))
      work.catch(() => {})
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), cvTimeoutMs)
      })
      const skills = await Promise.race([work, timeout])
      response.json({ skills, model: embedder.modelId, cutoff: CUTOFF })
    } catch (error) {
      // Never log the CV text; the message of our own errors does not contain it.
      console.error('[cv-skills] failed:', error.message)
      response.status(503).json({ fallback: true })
    } finally {
      clearTimeout(timer)
    }
  })

  // Admin console: a plain HTML page at /admin plus /api/admin/*. No password: it only answers a browser opened
  // directly at localhost on this PC (see adminAccess.js). A check only reports; it never changes saved data.
  // Spec: docs/superpowers/specs/2026-10-23-admin-console-design.md
  const stateFile = path.join(logDir, 'full-check-state.json')
  const jobs = createJobManager({
    logStore,
    writeReport: async (id, report) => {
      await mkdir(path.join(logDir, 'reports'), { recursive: true })
      await writeFile(path.join(logDir, 'reports', `${id}.json`), JSON.stringify(report, null, 2))
    },
  })

  app.get('/admin', localOnly, (request, response) => {
    response.set('Cache-Control', 'no-store')
    response.sendFile(adminPage)
  })

  const admin = express.Router()
  admin.use(localOnly)
  admin.use(jsonOnly)
  admin.use(express.json({ limit: '2kb' }))

  const embedderReady = () => Boolean(embedder?.isReady?.())

  admin.get('/overview', async (request, response) => {
    const [health, runs] = await Promise.all([healthChecks({ dataDir, embedderReady: embedderReady() }), logStore.listRuns(10)])
    response.json({ health, job: jobs.current(), runs, resumable: existsSync(stateFile) })
  })

  async function startCheck(response, type, makeWork) {
    const occupations = await readOptionalJson(path.join(dataDir, 'emasco', 'occupations.json'))
    if (!occupations) return response.status(503).json({ error: 'emasco-data-missing' })
    const started = await jobs.start(type, makeWork(occupations))
    if (started.busy) return response.status(409).json({ error: 'busy', job: jobs.current() })
    return response.status(202).json({ runId: started.runId })
  }

  admin.post('/checks/quick', async (request, response) => {
    const roles = (await readOptionalJson(path.join(dataDir, 'roles.json'))) ?? []
    const links = [...new Set([...Object.values(PORTAL_LINKS).map((item) => item.url), ...roles.map((role) => role.ilo?.url).filter(Boolean)])]
    await startCheck(response, 'quick-check', (occupations) => ({ run, progress, isCancelled }) =>
      runQuickCheck({
        run, occupations, dataDir, links, fetchImpl, progress, isCancelled,
        sampleSize: adminSampleSize, embedderReady: embedderReady(), ...(adminSleep ? { sleep: adminSleep } : {}),
      }))
  })

  admin.post('/checks/full', async (request, response) => {
    const resume = request.body?.resume === true
    await startCheck(response, 'full-check', (occupations) => ({ run, progress, isCancelled }) =>
      runFullCheck({ run, occupations, stateFile, fetchImpl, progress, isCancelled, resume, ...(adminSleep ? { sleep: adminSleep } : {}) }))
  })

  // Sources panel: status of every outside source, a one-click test, and a refresh of the live AI signals.
  admin.get('/sources', async (request, response) => {
    const [status, signals] = await Promise.all([sourceMonitor.snapshot(describeSources()), readSignals(dataDir)])
    const data = {
      signalsUpdatedAt: signals?.updatedAt ?? null,
      anthropicRelease: signals?.anthropicIndex?.latestRelease ?? null,
      anthropicNewData: signals?.anthropicIndex?.newData ?? false,
      huggingfaceFetchedAt: signals?.huggingface?.fetchedAt ?? null,
    }
    response.json({ sources: describeSources().map((source) => ({ ...source, ...status.find((row) => row.id === source.id) })), data, job: jobs.current() })
  })

  admin.post('/sources/test', async (request, response) => {
    const ids = Array.isArray(request.body?.ids) ? request.body.ids.filter((id) => typeof id === 'string') : null
    const results = await pingSources({ fetchImpl, monitor: sourceMonitor, ...(adminSleep ? { sleep: adminSleep } : {}) }, ids)
    response.json({ results })
  })

  admin.post('/sources/refresh', async (request, response) => {
    const started = await jobs.start('signals-refresh', async ({ run, progress, isCancelled }) => {
      const result = await refreshSignals({ dataDir, fetchImpl, monitor: sourceMonitor, run, progress, isCancelled, ...(adminSleep ? { sleep: adminSleep } : {}) })
      return { status: result.status, summary: { message: result.message, outcomes: result.outcomes }, report: null }
    })
    if (started.busy) return response.status(409).json({ error: 'busy', job: jobs.current() })
    return response.status(202).json({ runId: started.runId })
  })

  admin.post('/checks/cancel', (request, response) => response.json({ cancelled: jobs.cancel() }))
  admin.get('/job', (request, response) => response.json({ job: jobs.current() }))

  admin.get('/runs', async (request, response) => {
    const limit = Math.min(Math.max(1, Math.floor(Number(request.query.limit)) || 20), 100)
    response.json({ runs: await logStore.listRuns(limit) })
  })

  admin.get('/runs/:id', async (request, response) => {
    const found = RUN_ID.test(request.params.id) ? await logStore.readRun(request.params.id) : null
    if (!found) return response.status(404).json({ error: 'not-found' })
    response.json(found)
  })

  admin.get('/runs/:id/report', async (request, response) => {
    const { id } = request.params
    const report = RUN_ID.test(id) ? await readOptionalJson(path.join(logDir, 'reports', `${id}.json`)) : null
    if (!report) return response.status(404).json({ error: 'not-found' })
    response.set('Content-Disposition', `attachment; filename="report-${id}.json"`)
    response.json(report)
  })

  // Emerging feed admin: refresh, sources and review. Same local-only rule as the rest of /admin.
  const MAX_CUSTOM_SOURCES = 20

  async function emergingSnapshot() {
    const [config, saved] = await Promise.all([readSourceConfig(emergingSourcesPath), readEmerging(emergingPath)])
    const lastRuns = new Map((saved?.sources ?? []).map((source) => [source.name, source]))
    const items = saved?.items ?? []
    const reviewed = items.filter((item) => item.review === 'reviewed').length
    const openAlex = { id: 'openalex', name: 'OpenAlex', url: 'https://api.openalex.org', language: 'en', builtIn: true, fixed: true, enabled: true }
    return {
      checkedOn: saved?.checkedOn ?? null,
      checkedAt: saved?.checkedAt ?? null,
      tagging: saved?.tagging ?? null,
      interval: emergingConfig.interval === 'daily' ? 'daily' : 'weekly',
      modelConfigured: Boolean(emergingConfig.primary),
      counts: { total: items.length, pending: items.length - reviewed, reviewed },
      sources: [openAlex, ...allFeeds(config)].map((source) => ({ ...source, lastRun: lastRuns.get(source.name) ?? null })),
      items,
    }
  }

  admin.get('/emerging', async (request, response) => {
    response.json(await emergingSnapshot())
  })

  admin.post('/emerging/refresh', async (request, response) => {
    try {
      response.json(await runEmergingRefresh(true))
    } catch (error) {
      console.error('[emerging] admin refresh failed:', error.message)
      response.status(500).json({ error: 'Could not refresh the emerging feed.' })
    }
  })

  const knownUrls = (config) => allFeeds(config).map((feed) => feed.url)

  admin.post('/emerging/test', async (request, response) => {
    const config = await readSourceConfig(emergingSourcesPath)
    const checked = validateNewSource({ name: 'test', ...request.body }, knownUrls(config))
    if (!checked.ok) return response.status(400).json({ error: checked.error })
    response.json(await checkFeed(checked.source, fetchImpl))
  })

  admin.post('/emerging/sources', async (request, response) => {
    if (request.body?.termsChecked !== true) return response.status(400).json({ error: 'Tick the box to say you read the publisher terms.' })
    const config = await readSourceConfig(emergingSourcesPath)
    if (config.custom.length >= MAX_CUSTOM_SOURCES) return response.status(400).json({ error: `At most ${MAX_CUSTOM_SOURCES} added sources.` })
    const checked = validateNewSource(request.body, knownUrls(config))
    if (!checked.ok) return response.status(400).json({ error: checked.error })
    const result = await checkFeed(checked.source, fetchImpl)
    if (!result.ok) return response.status(422).json({ error: result.error })
    await writeSourceConfig(emergingSourcesPath, { ...config, custom: [...config.custom, checked.source] })
    response.json(await emergingSnapshot())
  })

  admin.post('/emerging/sources/:id/toggle', async (request, response) => {
    if (typeof request.body?.enabled !== 'boolean') return response.status(400).json({ error: 'Send enabled as true or false.' })
    if (request.params.id === 'openalex') return response.status(400).json({ error: 'OpenAlex is always on.' })
    const config = await readSourceConfig(emergingSourcesPath)
    const feed = allFeeds(config).find((entry) => entry.id === request.params.id)
    if (!feed) return response.status(404).json({ error: 'not-found' })
    const off = request.body.enabled ? config.off.filter((url) => url !== feed.url) : [...new Set([...config.off, feed.url])]
    await writeSourceConfig(emergingSourcesPath, { ...config, off })
    response.json(await emergingSnapshot())
  })

  admin.post('/emerging/sources/:id/remove', async (request, response) => {
    const config = await readSourceConfig(emergingSourcesPath)
    const feed = allFeeds(config).find((entry) => entry.id === request.params.id)
    if (!feed) return response.status(404).json({ error: 'not-found' })
    if (feed.builtIn) return response.status(400).json({ error: 'Built-in sources can be switched off, not removed.' })
    await writeSourceConfig(emergingSourcesPath, {
      custom: config.custom.filter((entry) => entry.url !== feed.url),
      off: config.off.filter((url) => url !== feed.url),
    })
    response.json(await emergingSnapshot())
  })

  admin.post('/emerging/items/:id', async (request, response) => {
    const result = await reviewItem({ filePath: emergingPath, id: request.params.id, action: request.body?.action })
    if (result.status === 'bad-action') return response.status(400).json({ error: 'The action must be reviewed, pending or delete.' })
    if (result.status === 'not-found') return response.status(404).json({ error: 'not-found' })
    response.json(await emergingSnapshot())
  })

  // A broken or oversized body must give a short JSON answer, never Express's HTML page with a stack trace and file paths.
  admin.use((error, request, response, next) => {
    if (error?.type === 'entity.parse.failed') return response.status(400).json({ error: 'bad-json' })
    if (error?.type === 'entity.too.large') return response.status(413).json({ error: 'too-large' })
    return next(error)
  })
  app.use('/api/admin', admin)

  // "Explore all roles": every eMASCO role, from picked skills (no model needed) or CV text (needs the model).
  // Loaded lazily; if the data files are missing or stale only these two routes answer 503.
  let emascoData = null
  async function getEmascoData() {
    if (emascoData) return emascoData
    const loader = emascoLoader ?? (async () => {
      const occupations = await readJson(path.join(dataDir, 'emasco', 'occupations.json'))
      const index = await loadPackedIndex({ directory: path.join(dataDir, 'emasco', 'vectors'), occupations })
      return { occupations, index }
    })
    const { occupations, index } = await loader()
    const concepts = buildConcepts({
      teamSkills: await readOptionalJson(path.join(dataDir, 'team', 'skill_labels.json')),
      aliasFile: await readOptionalJson(path.join(dataDir, 'team', 'skill_aliases.json'))
    })
    const reranker = createReranker({ modelId: process.env.RERANKER_MODEL })
    emascoData = { occupations, index, search: createHybridSearch({ skills: occupations.skills, index, embedder, concepts, reranker }) }
    return emascoData
  }

  // Central store AI exposure (data/store/ai_exposure.json), keyed by MASCO code. Missing file = no exposure info.
  let exposureStore
  async function getExposure() {
    if (exposureStore === undefined) {
      exposureStore = await readOptionalJson(path.join(dataDir, 'store', 'ai_exposure.json'))
    }
    return exposureStore
  }

  // The meaning search costs CPU (about 0.1-0.5 s each). Past the limit it is skipped and keyword search still answers.
  // Behind a tunnel every visitor shares one address, so the limit is generous.
  const searchHits = new Map()
  function meaningSearchAllowed(address) {
    const now = Date.now()
    const recent = (searchHits.get(address) ?? []).filter((time) => now - time < SEARCH_WINDOW_MS)
    if (recent.length >= meaningSearchLimit) {
      searchHits.set(address, recent)
      return false
    }
    recent.push(now)
    searchHits.set(address, recent)
    if (searchHits.size > 1000) for (const [key, times] of searchHits) if (times.every((time) => now - time >= SEARCH_WINDOW_MS)) searchHits.delete(key)
    return true
  }

  app.get('/api/emasco/skills', async (request, response) => {
    let data
    try {
      data = await getEmascoData()
    } catch (error) {
      console.error('[emasco] data not available:', error.message)
      return response.status(503).json({ error: 'emasco-data-missing' })
    }
    const query = typeof request.query.q === 'string' ? request.query.q : ''
    const found = await data.search(query, Number(request.query.limit), { meaningAllowed: meaningSearchAllowed(request.ip) })
    response.json({ skills: found.skills, methods: found.methods, concepts: found.concepts, aliases: found.aliases, query: found.query, status: found.status, notes: found.notes })
  })

  // Adds exposure and observed AI use to ranked eMASCO cards and wraps them with the source line.
  async function buildMatchBody(result, data, maxLevel) {
    const store = await getExposure().catch(() => null)
    const observed = await getObserved().catch(() => null)
    const roles = (result.roles ?? []).map((card) => {
      const row = store?.roles?.[card.code]
      return {
        ...card,
        observed: observed?.roles?.[card.code] ?? null,
        exposure: row
          ? {
              status: row.status,
              labelSource: row.labelSource,
              automatablePct: row.automatablePct,
              assistedPct: row.assistedPct,
              humanPct: row.humanPct,
              date: store.builtAt ?? null
            }
          : null
      }
    })
    return {
      ...result,
      roles,
      maxLevel,
      observedSource: observedMeta(observed),
      source: {
        occupations: data.occupations.source,
        crawledOn: data.occupations.fetchedAt,
        model: 'BAAI/bge-m3',
        note: 'Similarity is an AI estimate, not a percentage, and not a decision.'
      }
    }
  }

  // Top roles for the student's picked app skills: each skill label is searched in the eMASCO skill list (keyword search, no model needed),
  // then all roles are ranked like "Explore all roles". Send labels only; nothing is stored.
  app.post('/api/matches/top', parseCvBody, async (request, response) => {
    const { labels, maxLevel: wantedLevel, top } = request.body ?? {}
    if (!Array.isArray(labels) || labels.length > EMASCO_SKILL_LIMIT || labels.some((label) => typeof label !== 'string' || !label.trim() || label.length > 120)) {
      return response.status(400).json({ error: 'labels must be a list of at most 50 skill names.' })
    }
    let data
    try {
      data = await getEmascoData()
    } catch (error) {
      console.error('[emasco] data not available:', error.message)
      return response.status(503).json({ error: 'emasco-data-missing' })
    }
    try {
      const skillIds = await skillIdsForLabels(labels, (query, limit) => data.search(query, limit, { meaningAllowed: false }))
      // Our scored roles include degree-level jobs, so the default reaches degree level; master and PhD only when asked.
      const maxLevel = ['diploma', 'degree', 'phd'].includes(wantedLevel) ? wantedLevel : 'degree'
      const options = { maxLevel, groupGrades: true, top: Math.min(Math.max(1, Math.floor(Number(top)) || TOP_MATCHES), EMASCO_MAX_TOP) }
      const result = matchPickedSkills({ skillIds, index: data.index, ...options })
      response.json({ ...(await buildMatchBody(result, data, maxLevel)), mappedSkillCount: skillIds.length })
    } catch (error) {
      console.error('[matches-top] failed:', error.message)
      response.status(503).json({ error: 'match-failed' })
    }
  })

  // Adds exposure, observed AI use and official skills to ranked eMASCO cards and wraps them with the source line.
  async function buildMatchBody(result, data, maxLevel) {
    const store = await getExposure().catch(() => null)
    const observed = await getObserved().catch(() => null)
    const skillData = await skillStore.dataset().catch(() => null)
    const summaries = skillData ? Object.fromEntries((result.roles ?? []).map((card) => [card.code, skillData.occupation(card.code)])) : null
    const roles = (result.roles ?? []).map((card) => {
      const row = store?.roles?.[card.code]
      return {
        ...card,
        observed: observed?.roles?.[card.code] ?? null,
        officialSkills: summaries?.[card.code] ?? null,
        exposure: row
          ? {
              status: row.status,
              labelSource: row.labelSource,
              automatablePct: row.automatablePct,
              assistedPct: row.assistedPct,
              humanPct: row.humanPct,
              date: store.builtAt ?? null
            }
          : null
      }
    })
    return {
      ...result,
      roles,
      maxLevel,
      observedSource: observedMeta(observed),
      source: {
        occupations: data.occupations.source,
        crawledOn: data.occupations.fetchedAt,
        model: 'BAAI/bge-m3',
        note: 'Similarity is an AI estimate, not a percentage, and not a decision.'
      }
    }
  }

  // Top roles for the student's picked app skills: each skill label is searched in the eMASCO skill list (keyword search, no model needed),
  // then all roles are ranked like "Explore all roles". Send labels only; nothing is stored.
  app.post('/api/matches/top', parseCvBody, async (request, response) => {
    const { labels, maxLevel: wantedLevel, top } = request.body ?? {}
    if (!Array.isArray(labels) || labels.length > EMASCO_SKILL_LIMIT || labels.some((label) => typeof label !== 'string' || !label.trim() || label.length > 120)) {
      return response.status(400).json({ error: 'labels must be a list of at most 50 skill names.' })
    }
    let data
    try {
      data = await getEmascoData()
    } catch (error) {
      console.error('[emasco] data not available:', error.message)
      return response.status(503).json({ error: 'emasco-data-missing' })
    }
    try {
      const skillIds = await skillIdsForLabels(labels, (query, limit) => data.search(query, limit, { meaningAllowed: false }))
      // Our scored roles include degree-level jobs, so the default reaches degree level; master and PhD only when asked.
      const maxLevel = ['diploma', 'degree', 'phd'].includes(wantedLevel) ? wantedLevel : 'degree'
      const options = { maxLevel, groupGrades: true, top: Math.min(Math.max(1, Math.floor(Number(top)) || TOP_MATCHES), EMASCO_MAX_TOP) }
      const result = matchPickedSkills({ skillIds, index: data.index, ...options })
      response.json({ ...(await buildMatchBody(result, data, maxLevel)), mappedSkillCount: skillIds.length })
    } catch (error) {
      console.error('[matches-top] failed:', error.message)
      response.status(503).json({ error: 'match-failed' })
    }
  })

  app.post('/api/emasco/match', parseCvBody, async (request, response) => {
    const { skillIds, text, includeHigher, top } = request.body ?? {}
    const haveSkills = Array.isArray(skillIds)
    const haveText = typeof text === 'string'
    if (haveSkills === haveText) return response.status(400).json({ error: 'Send either skillIds or text.' })
    if (haveSkills && (skillIds.length > EMASCO_SKILL_LIMIT || skillIds.some((id) => typeof id !== 'string'))) {
      return response.status(400).json({ error: 'skillIds must be a list of at most 50 ids.' })
    }
    if (haveText && !text.trim()) return response.status(400).json({ error: 'No CV text.' })
    if (haveText && text.length > MAX_CHARS) return response.status(413).json({ error: 'CV text is too long.' })
    if (haveText && (!embedder || !embedder.isReady())) return response.status(503).json({ error: 'cv-ai-off' })
    let data
    try {
      data = await getEmascoData()
    } catch (error) {
      console.error('[emasco] data not available:', error.message)
      return response.status(503).json({ error: 'emasco-data-missing' })
    }
    const maxLevel = includeHigher === true ? 'phd' : 'diploma'
    const options = {
      maxLevel,
      groupGrades: true,
      top: Math.min(Math.max(1, Math.floor(Number(top)) || EMASCO_DEFAULT_TOP), EMASCO_MAX_TOP)
    }
    let timer
    try {
      let result
      if (haveSkills) {
        result = matchPickedSkills({ skillIds, index: data.index, ...options })
      } else {
        const work = matchCvByProfile({ text, embedder, index: data.index, ...options })
        work.catch(() => {})
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), cvTimeoutMs)
        })
        result = await Promise.race([work, timeout])
      }
      response.json(await buildMatchBody(result, data, maxLevel))
    } catch (error) {
      // Never log the CV text; the message of our own errors does not contain it.
      if (/^Unknown skill id/.test(error.message)) return response.status(400).json({ error: error.message })
      console.error('[emasco-match] failed:', error.message)
      response.status(503).json({ error: 'match-failed' })
    } finally {
      clearTimeout(timer)
    }
  })

  // ---- Skill dataset routes (read only). Missing or insufficient data is reported as such, never as "no skills required".
  const CODE = /^\d{4}-\d{2}$/
  const SKILL_INPUT_LIMIT = 100

  async function skillDataset(response) {
    try {
      return await skillStore.dataset()
    } catch (error) {
      console.error('[skills] dataset not available:', error.message)
      response.status(503).json({ error: 'skill-dataset-missing' })
      return null
    }
  }

  app.get('/api/skills/app-map', async (request, response) => {
    const evidence = await skillStore.roleEvidence().catch(() => null)
    if (!evidence) return response.status(503).json({ error: 'skill-evidence-missing' })
    return response.json({ meta: evidence.meta, coverage: evidence.coverage, skills: evidence.appMap })
  })

  app.get('/api/skills/occupation/:code', async (request, response) => {
    if (!CODE.test(request.params.code)) return response.status(400).json({ error: 'bad-occupation-code' })
    const data = await skillDataset(response)
    if (!data) return
    const summary = data.occupation(request.params.code)
    if (!summary) return response.status(404).json({ error: 'unknown-occupation' })
    const all = request.query.all === '1'
    const list = data.skillsForOccupation(request.params.code, { validatedOnly: !all })
    return response.json({ ...summary, validatedOnly: !all, skills: list.map((item) => ({
      skillId: item.skillId, skill: item.skillName, sections: item.sections, status: item.status, evidenceStrength: item.evidenceStrength,
      independentSources: item.independentSources, evidence: item.evidence,
    })) })
  })

  const parseSmallJson = (request, response, next) =>
    express.json({ limit: '20kb' })(request, response, (error) =>
      error ? response.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: error.type === 'entity.too.large' ? 'too-large' : 'bad-json' }) : next())

  app.post('/api/skills/gap', parseSmallJson, async (request, response) => {
    const { code, skills: have } = request.body ?? {}
    if (typeof code !== 'string' || !CODE.test(code)) return response.status(400).json({ error: 'bad-occupation-code' })
    if (!Array.isArray(have) || have.length > SKILL_INPUT_LIMIT || have.some((item) => typeof item !== 'string' || item.length > 200)) {
      return response.status(400).json({ error: 'skills must be a list of at most 100 short strings' })
    }
    const data = await skillDataset(response)
    if (!data) return
    const summary = data.occupation(code)
    if (!summary) return response.status(404).json({ error: 'unknown-occupation' })
    if (summary.status === 'insufficient' || summary.status === 'failed') {
      return response.json({ code, status: summary.status, reason: summary.reason, matched: [], missing: [], uncertain: [], coverage: null, note: 'No usable skill list: this is not a finding that no skills are needed.' })
    }
    return response.json({ ...data.compare(code, have), sourceUrl: summary.source.url, retrievedAt: summary.source.retrievedAt })
  })

  app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
    response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
      if (error) next(error)
    })
  })

  // Last resort for anything not handled above: no stack trace, no paths, in the response.
  app.use((error, request, response, next) => {
    console.error('[server] unhandled error:', error?.message)
    if (response.headersSent) return next(error)
    return response.status(error?.status && error.status < 500 ? error.status : 500).json({ error: 'request-failed' })
  })

  return app
}

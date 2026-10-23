import express from 'express'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTrends, refreshTrends } from './trends.js'
import { readResearch, refreshResearch } from './research.js'
import { CUTOFF, MAX_CHARS, SKILL_TEXT_MODE, matchSkills, splitCvLines } from './cvMatch.js'
import { loadSkillVectors } from './skillVectors.js'
import { readReferences, refreshReferences } from './references.js'
import { PORTAL_LINKS } from '../src/lib/pathwayView.js'
import { loadPackedIndex, matchCvByProfile, matchPickedSkills } from './emascoMatch.js'
import { createSkillSearch } from './emascoRoles.js'
import { createLogStore } from './adminLog.js'
import { createAdminAuth } from './adminAuth.js'
import { createJobManager } from './adminJobs.js'
import { healthChecks, runQuickCheck } from './adminChecks.js'
import { runFullCheck } from './adminFull.js'

const EMASCO_SKILL_LIMIT = 50
const EMASCO_DEFAULT_TOP = 10
const EMASCO_MAX_TOP = 20

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

const RUN_ID = /^\d{14}-[0-9a-f]{4}$/

export function createApp({
  dataDir,
  fetchImpl = fetch,
  embedder = null,
  cvTimeoutMs = 15000,
  emascoLoader = null,
  adminToken = null,
  logDir = path.join(dataDir, 'logs'),
  adminSleep = undefined,
  adminSampleSize = 40,
}) {
  const app = express()
  const trendsPath = path.join(dataDir, 'trends.json')
  const researchPath = path.join(dataDir, 'research.json')
  const referencesPath = path.join(dataDir, 'references.json')

  // The log of what the system does behind the scenes (see the admin console below).
  const logStore = createLogStore({ filePath: path.join(logDir, 'admin.jsonl') })
  logStore.markInterrupted().catch(() => {})

  // Runs a data refresh and records it in the log; the refresh result is returned unchanged.
  async function logged(type, work) {
    const run = await logStore.startRun({ type })
    try {
      const result = await work()
      await run.log(result.status === 'failed' ? 'error' : 'info', result.message ?? `${type} refresh finished`)
      await run.finish(result.status === 'updated' ? 'ok' : result.status === 'failed' ? 'failed' : 'partial', { message: result.message })
      return result
    } catch (error) {
      await run.log('error', `${type} refresh failed: ${error.message}`)
      await run.finish('failed', { message: error.message })
      throw error
    }
  }

  app.get('/api/data', async (request, response) => {
    try {
      const [roles, skills, sdg, samples, trends, research, fields, references] = await Promise.all([
        readJson(path.join(dataDir, 'roles.json')),
        readJson(path.join(dataDir, 'skills.json')),
        readJson(path.join(dataDir, 'sdg.json')),
        readJson(path.join(dataDir, 'samples.json')),
        readTrends(trendsPath),
        readResearch(researchPath),
        readOptionalJson(path.join(dataDir, 'fields.json')),
        readReferences(referencesPath),
      ])
      response.json({ roles, skills, sdg, samples, trends, research, fields, references })
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

  // Admin console: token sign-in, the log, and the checks. A check only reports; it never changes saved data.
  // Spec: docs/superpowers/specs/2026-10-23-admin-console-design.md
  const adminAuth = createAdminAuth({ token: adminToken })
  const stateFile = path.join(logDir, 'full-check-state.json')
  const jobs = createJobManager({
    logStore,
    writeReport: async (id, report) => {
      await mkdir(path.join(logDir, 'reports'), { recursive: true })
      await writeFile(path.join(logDir, 'reports', `${id}.json`), JSON.stringify(report, null, 2))
    },
  })

  app.get('/api/admin/status', (request, response) => response.json({ enabled: adminAuth.enabled }))

  const admin = express.Router()
  admin.use(adminAuth.middleware)
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
    emascoData = { occupations, index, search: createSkillSearch(occupations.skills) }
    return emascoData
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
    response.json({ skills: data.search(query, Number(request.query.limit)) })
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
      response.json({
        ...result,
        maxLevel,
        source: {
          occupations: data.occupations.source,
          crawledOn: data.occupations.fetchedAt,
          model: 'BAAI/bge-m3',
          note: 'Similarity is an AI estimate, not a percentage, and not a decision.'
        }
      })
    } catch (error) {
      // Never log the CV text; the message of our own errors does not contain it.
      if (/^Unknown skill id/.test(error.message)) return response.status(400).json({ error: error.message })
      console.error('[emasco-match] failed:', error.message)
      response.status(503).json({ error: 'match-failed' })
    } finally {
      clearTimeout(timer)
    }
  })

  app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
    response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
      if (error) next(error)
    })
  })

  return app
}
